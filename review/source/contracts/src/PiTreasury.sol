// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OpenFourTypes} from "../vendor/openfour/libraries/OpenFourTypes.sol";

interface IPiAsset is IERC20 {
    function tokenPhase() external view returns (OpenFourTypes.Phase);
    function migratedPools(address) external view returns (bool);
    function burnTreasury(uint256) external;
}
interface IPiRewardFunding {
    function fund(uint256) external;
}
interface IV2Factory {
    function getPair(address, address) external view returns (address);
    function createPair(address, address) external returns (address);
}
interface IV2Pair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function mint(address) external returns (uint256);
}
interface IV2Router {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256,
        uint256,
        address[] calldata,
        address,
        uint256
    ) external;
    function addLiquidity(
        address,
        address,
        uint256,
        uint256,
        uint256,
        uint256,
        address,
        uint256
    ) external returns (uint256, uint256, uint256);
}

/// @notice Four disjoint WBNB budgets, funded from measured receipts.
/// @dev No general withdrawal, arbitrary router, callback or mutable fee setter.
contract PiTreasury is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant Q112 = 2 ** 112;
    uint256 public constant OBSERVATION_PERIOD = 30 minutes;
    uint256 public constant MAX_ORACLE_AGE = 2 hours;
    uint256 public constant MAX_DEVIATION_BPS = 500;
    address public constant DEAD = address(0xdEaD);
    address public token;
    IERC20 public quote;
    address public rewards;
    address public operations;
    IV2Router public router;
    bool public processing;
    uint256 public received;
    uint256 public accountedBalance;
    uint256[4] public allocated;
    uint256[4] public spent;
    uint256 public liquidityPI;
    uint256 public tokensBurned;
    uint256 public liquidityMinted;
    uint256 public lastCumulative0;
    uint256 public lastCumulative1;
    uint256 public observationAt;
    uint256 public oracleUpdatedAt;
    uint256 public piToQuote;
    uint256 public quoteToPi;
    event Allocated(uint256 amount, uint256 cumulativeReceived);
    event Converted(uint256 piIn, uint256 quoteReceived);
    event BuybackBurn(uint256 quoteSpent, uint256 piBurned);
    event LiquidityAdded(uint256 quoteSpent, uint256 lpBurned);
    event OracleObserved(uint256 piToQuoteX112, uint256 quoteToPiX112);

    constructor() {
        _disableInitializers();
    }
    function initialize(
        address token_,
        address quote_,
        address rewards_,
        address operations_,
        address router_
    ) external initializer {
        require(
            msg.sender == token_ &&
                rewards_.code.length > 0 &&
                operations_ != address(0),
            "PI: treasury config"
        );
        require(
            router_.code.length > 0 && IV2Router(router_).WETH() == quote_,
            "PI: WBNB router"
        );
        token = token_;
        quote = IERC20(quote_);
        rewards = rewards_;
        operations = operations_;
        router = IV2Router(router_);
    }
    function available(uint256 bucket) public view returns (uint256) {
        return allocated[bucket] - spent[bucket];
    }
    function _sync() internal returns (uint256 amount) {
        uint256 balance = quote.balanceOf(address(this));
        require(balance >= accountedBalance, "PI: treasury backing");
        amount = balance - accountedBalance;
        if (amount == 0) return 0;
        received += amount;
        accountedBalance = balance;
        allocated[0] = Math.mulDiv(received, 70, 100);
        allocated[1] = Math.mulDiv(received, 15, 100);
        allocated[2] = Math.mulDiv(received, 10, 100);
        allocated[3] = Math.mulDiv(received, 5, 100);
        emit Allocated(amount, received);
    }
    function sync() external nonReentrant returns (uint256) {
        return _sync();
    }
    function fundHolders(uint256 amount) external nonReentrant {
        _sync();
        require(amount > 0 && amount <= available(0), "PI: holder budget");
        spent[0] += amount;
        accountedBalance -= amount;
        quote.safeApprove(rewards, 0);
        quote.safeApprove(rewards, amount);
        IPiRewardFunding(rewards).fund(amount);
        quote.safeApprove(rewards, 0);
    }
    function withdrawOperations(uint256 amount) external nonReentrant {
        require(msg.sender == operations, "PI: operations only");
        _sync();
        require(amount <= available(3), "PI: operations budget");
        spent[3] += amount;
        accountedBalance -= amount;
        quote.safeTransfer(operations, amount);
    }
    function canonicalPair() public view returns (address pair) {
        require(
            IPiAsset(token).tokenPhase() == OpenFourTypes.Phase.Migrated,
            "PI: not graduated"
        );
        pair = IV2Factory(router.factory()).getPair(token, address(quote));
        require(
            pair != address(0) && IPiAsset(token).migratedPools(pair),
            "PI: canonical pool"
        );
        require(
            (IV2Pair(pair).token0() == token &&
                IV2Pair(pair).token1() == address(quote)) ||
                (IV2Pair(pair).token1() == token &&
                    IV2Pair(pair).token0() == address(quote)),
            "PI: pair assets"
        );
    }
    function _reserves(
        address pair
    ) internal view returns (uint256 rPi, uint256 rQuote) {
        (uint112 r0, uint112 r1, ) = IV2Pair(pair).getReserves();
        (rPi, rQuote) = IV2Pair(pair).token0() == token
            ? (uint256(r0), uint256(r1))
            : (uint256(r1), uint256(r0));
        require(rPi > 0 && rQuote > 0, "PI: empty reserves");
    }
    function _cumulatives(
        address pair
    ) internal view returns (uint256 p0, uint256 p1) {
        IV2Pair p = IV2Pair(pair);
        p0 = p.price0CumulativeLast();
        p1 = p.price1CumulativeLast();
        (uint112 r0, uint112 r1, uint32 timestamp) = p.getReserves();
        require(r0 > 0 && r1 > 0, "PI: empty oracle");
        unchecked {
            uint32 elapsed = uint32(block.timestamp) - timestamp;
            p0 += ((uint256(r1) * Q112) / r0) * elapsed;
            p1 += ((uint256(r0) * Q112) / r1) * elapsed;
        }
    }
    /// @notice Two observations at least 30 minutes apart are required. An old
    /// observation is restarted, not reused as a current execution price.
    function observe() external nonReentrant {
        address pair = canonicalPair();
        (uint256 p0, uint256 p1) = _cumulatives(pair);
        uint256 elapsed = block.timestamp - observationAt;
        if (observationAt == 0 || elapsed > MAX_ORACLE_AGE) {
            lastCumulative0 = p0;
            lastCumulative1 = p1;
            observationAt = block.timestamp;
            piToQuote = 0;
            quoteToPi = 0;
            oracleUpdatedAt = 0;
            return;
        }
        require(elapsed >= OBSERVATION_PERIOD, "PI: observation early");
        uint256 a0;
        uint256 a1;
        unchecked {
            a0 = (p0 - lastCumulative0) / elapsed;
            a1 = (p1 - lastCumulative1) / elapsed;
        }
        (piToQuote, quoteToPi) = IV2Pair(pair).token0() == token
            ? (a0, a1)
            : (a1, a0);
        require(piToQuote > 0 && quoteToPi > 0, "PI: zero average");
        lastCumulative0 = p0;
        lastCumulative1 = p1;
        observationAt = block.timestamp;
        oracleUpdatedAt = block.timestamp;
        emit OracleObserved(piToQuote, quoteToPi);
    }
    function _guard(
        bool sellingPI,
        uint256 amount
    ) internal view returns (uint256 minimum) {
        address pair = canonicalPair();
        (uint256 rp, uint256 rq) = _reserves(pair);
        require(
            oracleUpdatedAt > 0 &&
                block.timestamp - oracleUpdatedAt <= MAX_ORACLE_AGE,
            "PI: stale oracle"
        );
        uint256 average = sellingPI ? piToQuote : quoteToPi;
        uint256 spot =
            sellingPI ? Math.mulDiv(rq, Q112, rp) : Math.mulDiv(rp, Q112, rq);
        uint256 difference = spot > average ? spot - average : average - spot;
        require(
            Math.mulDiv(difference, 10000, average) <= MAX_DEVIATION_BPS,
            "PI: price deviation"
        );
        require(
            amount > 0 && amount <= (sellingPI ? rp : rq) / 200,
            "PI: batch too large"
        );
        minimum = Math.mulDiv(Math.mulDiv(amount, average, Q112), 9500, 10000);
        require(minimum > 0, "PI: dust swap");
    }
    function _swap(
        bool sellingPI,
        uint256 amount,
        uint256 deadline
    ) internal returns (uint256 out) {
        require(
            deadline >= block.timestamp &&
                deadline <= block.timestamp + 5 minutes,
            "PI: deadline"
        );
        uint256 minimum = _guard(sellingPI, amount);
        address input = sellingPI ? token : address(quote);
        address output = sellingPI ? address(quote) : token;
        address[] memory path = new address[](2);
        path[0] = input;
        path[1] = output;
        uint256 beforeBalance = IERC20(output).balanceOf(address(this));
        IERC20(input).safeApprove(address(router), 0);
        IERC20(input).safeApprove(address(router), amount);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amount,
            minimum,
            path,
            address(this),
            deadline
        );
        IERC20(input).safeApprove(address(router), 0);
        out = IERC20(output).balanceOf(address(this)) - beforeBalance;
        require(out >= minimum, "PI: realized slippage");
    }
    function convertTax(
        uint256 amount,
        uint256 deadline
    ) external nonReentrant {
        require(
            amount <= IERC20(token).balanceOf(address(this)) - liquidityPI,
            "PI: tax inventory"
        );
        processing = true;
        uint256 out = _swap(true, amount, deadline);
        processing = false;
        _sync();
        emit Converted(amount, out);
    }
    function buyback(uint256 amount, uint256 deadline) external nonReentrant {
        _sync();
        require(amount > 0 && amount <= available(1), "PI: burn budget");
        spent[1] += amount;
        accountedBalance -= amount;
        processing = true;
        uint256 out = _swap(false, amount, deadline);
        IPiAsset(token).burnTreasury(out);
        processing = false;
        tokensBurned += out;
        emit BuybackBurn(amount, out);
    }
    function addLiquidity(
        uint256 maxQuote,
        uint256 deadline
    ) external nonReentrant {
        _sync();
        require(
            maxQuote > 1 && maxQuote <= available(2),
            "PI: liquidity budget"
        );
        // Bound the entire liquidity batch, not just its swap half.
        _guard(false, maxQuote);
        uint256 beforeQuote = quote.balanceOf(address(this));
        processing = true;
        liquidityPI += _swap(false, maxQuote / 2, deadline);
        (uint256 rp, uint256 rq) = _reserves(canonicalPair());
        uint256 q = maxQuote - maxQuote / 2;
        uint256 t = Math.min(liquidityPI, Math.mulDiv(q, rp, rq));
        q = Math.min(q, Math.mulDiv(t, rq, rp));
        require(t > 0 && q > 0, "PI: liquidity dust");
        IERC20(token).safeApprove(address(router), 0);
        IERC20(token).safeApprove(address(router), t);
        quote.safeApprove(address(router), 0);
        quote.safeApprove(address(router), q);
        uint256 beforePI = IERC20(token).balanceOf(address(this));
        uint256 beforeLP = IERC20(canonicalPair()).balanceOf(DEAD);
        router.addLiquidity(
            token,
            address(quote),
            t,
            q,
            (t * 9500) / 10000,
            (q * 9500) / 10000,
            DEAD,
            deadline
        );
        IERC20(token).safeApprove(address(router), 0);
        quote.safeApprove(address(router), 0);
        uint256 usedPI = beforePI - IERC20(token).balanceOf(address(this));
        liquidityPI -= usedPI;
        uint256 spentQuote = beforeQuote - quote.balanceOf(address(this));
        require(spentQuote <= maxQuote, "PI: liquidity spend");
        uint256 lp = IERC20(canonicalPair()).balanceOf(DEAD) - beforeLP;
        require(lp > 0, "PI: no locked LP");
        spent[2] += spentQuote;
        accountedBalance -= spentQuote;
        liquidityMinted += lp;
        processing = false;
        emit LiquidityAdded(spentQuote, lp);
    }
}
