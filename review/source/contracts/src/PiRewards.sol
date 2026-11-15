// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PiRates} from "./PiRates.sol";

interface IWrappedBNB is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @notice Bounded acquisition ledger and funded reward indices. No holder loop.
/// @dev Standalone immutable clone. The bound PI token alone changes PI balances.
contract PiRewards is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant PRECISION = 1e36;
    uint256 public constant ROUND = 15 minutes;
    struct Lot {
        uint256 born;
        uint256 amount;
        uint256 paidIndex;
    }
    struct Account {
        uint256 mature;
        uint256 maturePaidIndex;
        uint256 earnedScaled;
        uint256 balance;
        Lot[] lots;
    }
    struct Cohort {
        uint256 amount;
        uint256 index;
        uint256 mergeMatureIndex;
        bool exists;
        bool merged;
    }
    address public token;
    address public treasury;
    IWrappedBNB public quote;
    mapping(address => Account) private accounts;
    mapping(uint256 => Cohort) public cohorts;
    uint256[] private active;
    uint256 public matureAmount;
    uint256 public matureIndex;
    uint256 public funded;
    uint256 public paid;
    uint256 public pending;
    uint256 public roundingScaled;
    uint256 public lastRound;
    event Funded(uint256 received);
    event Distributed(
        uint256 quoteAmount,
        uint256 totalWeight,
        uint256 timestamp
    );
    event Claimed(
        address indexed holder,
        address indexed recipient,
        uint256 amount,
        bool nativeBNB
    );

    constructor() {
        _disableInitializers();
    }
    modifier onlyToken() {
        require(msg.sender == token, "PI: token only");
        _;
    }
    function initialize(
        address token_,
        address quote_,
        address treasury_
    ) external initializer {
        require(
            token_ != address(0) &&
                quote_.code.length > 0 &&
                treasury_ != address(0),
            "PI: bad reward config"
        );
        token = token_;
        quote = IWrappedBNB(quote_);
        treasury = treasury_;
    }
    function _roll() internal {
        uint256 i;
        while (i < active.length) {
            uint256 born = active[i];
            if (PiRates.age(born, block.timestamp) >= 30) {
                Cohort storage g = cohorts[born];
                g.merged = true;
                g.mergeMatureIndex = matureIndex;
                matureAmount += g.amount;
                active[i] = active[active.length - 1];
                active.pop();
            } else {
                ++i;
            }
        }
    }
    function _settle(address who) internal returns (Account storage a) {
        _roll();
        a = accounts[who];
        a.earnedScaled += a.mature * (matureIndex - a.maturePaidIndex);
        a.maturePaidIndex = matureIndex;
        uint256 kept;
        uint256 length = a.lots.length;
        for (uint256 i; i < length; ++i) {
            Lot memory lot = a.lots[i];
            Cohort storage g = cohorts[lot.born];
            uint256 index = g.index;
            if (g.merged) index += matureIndex - g.mergeMatureIndex;
            a.earnedScaled += lot.amount * (index - lot.paidIndex);
            if (g.merged) {
                a.mature += lot.amount;
            } else {
                lot.paidIndex = index;
                a.lots[kept++] = lot;
            }
        }
        while (a.lots.length > kept) a.lots.pop();
    }
    function credit(address who, uint256 amount) external onlyToken {
        if (amount == 0) return;
        Account storage a = _settle(who);
        uint256 born = PiRates.birth(block.timestamp);
        Cohort storage g = cohorts[born];
        if (!g.exists) {
            g.exists = true;
            active.push(born);
        }
        uint256 length = a.lots.length;
        if (length > 0 && a.lots[length - 1].born == born)
            a.lots[length - 1].amount += amount;
        else a.lots.push(Lot(born, amount, g.index));
        require(a.lots.length <= 31 && active.length <= 31, "PI: cohort bound");
        a.balance += amount;
        g.amount += amount;
    }
    /// @return fee Amount of PI due for this exit, newest acquisition first.
    function debit(
        address who,
        uint256 amount
    ) external onlyToken returns (uint256 fee) {
        Account storage a = _settle(who);
        require(amount <= a.balance, "PI: ledger balance");
        a.balance -= amount;
        uint256 left = amount;
        while (left > 0 && a.lots.length > 0) {
            Lot storage lot = a.lots[a.lots.length - 1];
            uint256 take = Math.min(left, lot.amount);
            fee +=
                (take * PiRates.sell(PiRates.age(lot.born, block.timestamp))) /
                10000;
            lot.amount -= take;
            cohorts[lot.born].amount -= take;
            left -= take;
            if (lot.amount == 0) a.lots.pop();
        }
        if (left > 0) {
            a.mature -= left;
            matureAmount -= left;
            fee += left / 100;
        }
    }
    /// @notice Quote asset settlement only has whole-bps precision. Round its
    /// weighted rate upward; the error is below one bps of curve quote.
    function exitBps(
        address who,
        uint256 amount
    ) external view returns (uint256) {
        Account storage a = accounts[who];
        require(amount > 0 && amount <= a.balance, "PI: quote amount");
        uint256 left = amount;
        uint256 numerator;
        for (uint256 i = a.lots.length; i > 0 && left > 0;) {
            Lot storage lot = a.lots[--i];
            uint256 take = Math.min(left, lot.amount);
            numerator +=
                take * PiRates.sell(PiRates.age(lot.born, block.timestamp));
            left -= take;
        }
        numerator += left * 100;
        return (numerator + amount - 1) / amount;
    }
    function fund(uint256 amount) external nonReentrant {
        require(msg.sender == treasury, "PI: treasury only");
        uint256 beforeBalance = quote.balanceOf(address(this));
        IERC20(address(quote)).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        uint256 received = quote.balanceOf(address(this)) - beforeBalance;
        require(
            funded + received <= type(uint256).max / PRECISION,
            "PI: funding bound"
        );
        funded += received;
        pending += received;
        emit Funded(received);
    }
    function totalWeight() public view returns (uint256 w) {
        w = matureAmount * 4;
        for (uint256 i; i < active.length; ++i) {
            uint256 born = active[i];
            w +=
                cohorts[born].amount *
                PiRates.weight(PiRates.age(born, block.timestamp));
        }
    }
    function distribute() external nonReentrant returns (uint256 amount) {
        require(block.timestamp >= lastRound + ROUND, "PI: round not due");
        _roll();
        uint256 w = totalWeight();
        amount = pending + roundingScaled / PRECISION;
        if (w == 0 || amount == 0) return 0;
        lastRound = block.timestamp;
        pending = 0;
        roundingScaled %= PRECISION;
        uint256 allocated;
        for (uint256 i; i < active.length; ++i) {
            uint256 born = active[i];
            Cohort storage g = cohorts[born];
            uint256 delta = Math.mulDiv(
                amount,
                PiRates.weight(PiRates.age(born, block.timestamp)) * PRECISION,
                w
            );
            g.index += delta;
            allocated += g.amount * delta;
        }
        uint256 matureDelta = Math.mulDiv(amount, 4 * PRECISION, w);
        matureIndex += matureDelta;
        allocated += matureAmount * matureDelta;
        roundingScaled += amount * PRECISION - allocated;
        emit Distributed(amount, w, block.timestamp);
    }
    function claim(
        address payable recipient,
        bool nativeBNB
    ) external nonReentrant returns (uint256 amount) {
        require(
            recipient != address(0) && recipient != address(this),
            "PI: recipient"
        );
        Account storage a = _settle(msg.sender);
        amount = a.earnedScaled / PRECISION;
        if (amount == 0) return 0;
        require(amount <= quote.balanceOf(address(this)), "PI: backing");
        a.earnedScaled -= amount * PRECISION;
        paid += amount;
        if (nativeBNB) {
            quote.withdraw(amount);
            (bool ok, ) = recipient.call{value: amount, gas: 50000}("");
            if (!ok) {
                quote.deposit{value: amount}();
                IERC20(address(quote)).safeTransfer(recipient, amount);
                nativeBNB = false;
            }
        } else {
            IERC20(address(quote)).safeTransfer(recipient, amount);
        }
        emit Claimed(msg.sender, recipient, amount, nativeBNB);
    }
    function claimable(address who) external view returns (uint256) {
        Account storage a = accounts[who];
        uint256 scaled =
            a.earnedScaled + a.mature * (matureIndex - a.maturePaidIndex);
        for (uint256 i; i < a.lots.length; ++i) {
            Lot storage lot = a.lots[i];
            Cohort storage g = cohorts[lot.born];
            uint256 index =
                g.index + (g.merged ? matureIndex - g.mergeMatureIndex : 0);
            scaled += lot.amount * (index - lot.paidIndex);
        }
        return scaled / PRECISION;
    }
    function balanceOf(address who) external view returns (uint256) {
        return accounts[who].balance;
    }
    function lotsOf(address who) external view returns (Lot[] memory) {
        return accounts[who].lots;
    }
    function matureOf(address who) external view returns (uint256) {
        return accounts[who].mature;
    }
    function activeCohorts() external view returns (uint256[] memory) {
        return active;
    }
    receive() external payable {
        require(msg.sender == address(quote), "PI: WBNB only");
    }
}
