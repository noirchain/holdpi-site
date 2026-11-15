// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {OpenFourToken} from "../vendor/openfour/token/OpenFourToken.sol";
import {OpenFourTypes} from "../vendor/openfour/libraries/OpenFourTypes.sol";
import {PiRewards} from "./PiRewards.sol";
import {PiTreasury, IV2Router, IV2Factory, IV2Pair} from "./PiTreasury.sol";

/// @notice PI OpenFour token. Taxes are immutable in this implementation.
/// @dev Registry-controlled beacon upgrades are an external trust boundary.
contract PiToken is OpenFourToken {
    struct Config {
        address core;
        address rewardsImplementation;
        address treasuryImplementation;
        address router;
        address operations;
    }
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint256 public constant buyFeeRate = 500;
    uint256 public constant sellFeeRate = 1000;
    address public core;
    address public canonicalPool;
    PiRewards public rewards;
    PiTreasury public treasury;
    event BondingTaxNotified(uint256 quoteTax, bool isBuy);

    function initialize(InitArgs calldata c) external override initializer {
        require(msg.sender == c.tokenModule, "PI: token module only");
        require(
            c.maxSupply == SUPPLY && c.quoteAsset.code.length > 0,
            "PI: supply or quote"
        );
        Config memory p = abi.decode(c.tokenParams, (Config));
        require(
            p.core.code.length > 0 &&
                p.rewardsImplementation.code.length > 0 &&
                p.treasuryImplementation.code.length > 0,
            "PI: implementations"
        );
        core = p.core;
        rewards = PiRewards(payable(Clones.clone(p.rewardsImplementation)));
        treasury = PiTreasury(Clones.clone(p.treasuryImplementation));
        rewards.initialize(address(this), c.quoteAsset, address(treasury));
        treasury.initialize(
            address(this),
            c.quoteAsset,
            address(rewards),
            p.operations,
            p.router
        );
        address factory = IV2Router(p.router).factory();
        canonicalPool = IV2Factory(factory).getPair(
            address(this),
            c.quoteAsset
        );
        if (canonicalPool == address(0))
            canonicalPool = IV2Factory(factory).createPair(
                address(this),
                c.quoteAsset
            );
        require(
            canonicalPool.code.length > 0 &&
                IV2Pair(canonicalPool).totalSupply() == 0,
            "PI: initial pool"
        );
        migratedPools[canonicalPool] = true;
        emit MigratedPoolUpdated(canonicalPool, true);
        __OpenFourToken_init(c);
    }
    function _descriptorTag() internal pure override returns (string memory) {
        return "token.pi_acquisition_age";
    }
    function _excluded(address who) internal view returns (bool) {
        return
            who == address(0) ||
            who == address(0xdEaD) ||
            who == vault ||
            who == core ||
            who == migrateModule ||
            who == address(this) ||
            who == address(rewards) ||
            who == address(treasury) ||
            migratedPools[who];
    }
    function isExcluded(address who) external view returns (bool) {
        return _excluded(who);
    }
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Never call a router, recipient or payout strategy from ordinary exits.
        if (amount == 0 || from == to) {
            super._transfer(from, to, amount);
            return;
        }
        bool fromExcluded = _excluded(from);
        bool toExcluded = _excluded(to);
        bool settlement =
            tokenPhase == OpenFourTypes.Phase.Trading &&
                msg.sender == core &&
                to == vault;
        bool internalProcessing =
            (from == address(treasury) || to == address(treasury)) &&
                (migratedPools[from] || migratedPools[to]) &&
                treasury.processing();
        uint256 fee;
        if (!fromExcluded) {
            fee = rewards.debit(from, amount);
            if (settlement) fee = 0; // the Core collects the quoted BNB tax once
        } else if (migratedPools[from] && !toExcluded && !internalProcessing) {
            fee = (amount * 500) / 10000;
        }
        if (internalProcessing) fee = 0;
        if (fee > 0) super._transfer(from, address(treasury), fee);
        uint256 net = amount - fee;
        super._transfer(from, to, net);
        if (!toExcluded) rewards.credit(to, net);
    }
    function exitFeeBps(
        address holder,
        uint256 amount
    ) external view returns (uint256) {
        return rewards.exitBps(holder, amount);
    }
    function onBondingTrade(uint256 amount, bool isBuy) external onlyVault {
        // The TradeModule directs tax to the treasury. Only measured receipts
        // are allocated later. A notification never creates unfunded rewards.
        emit BondingTaxNotified(amount, isBuy);
    }
    function onMigrate() external onlyMigrate {
        /* no swaps inside migration */
    }
    function burnTreasury(uint256 amount) external {
        require(msg.sender == address(treasury), "PI: treasury only");
        _burn(msg.sender, amount);
    }
}
