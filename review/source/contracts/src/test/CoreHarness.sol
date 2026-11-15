// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {OpenFourTypes} from "../../vendor/openfour/libraries/OpenFourTypes.sol";
import {IOpenFourTokenModule} from "../../vendor/openfour/interfaces/IOpenFourTokenModule.sol";
import {IOpenFourVault} from "../../vendor/openfour/interfaces/IOpenFourVault.sol";
import {IOpenFourCurveModule} from "../../vendor/openfour/interfaces/IOpenFourCurveModule.sol";
import {IOpenFourTradeModule} from "../../vendor/openfour/interfaces/IOpenFourTradeModule.sol";
import {IOpenFourMigrateModule} from "../../vendor/openfour/interfaces/IOpenFourMigrateModule.sol";
import {PiToken} from "../PiToken.sol";

/// @dev LOCAL TEST ONLY. Reproduces the documented Core settlement interface;
/// it is not OpenFour production Core or a substitute for its integration test.
contract CoreHarness is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable wrappedNative;
    address public lastToken;
    constructor(address wbnb) {
        wrappedNative = wbnb;
    }
    function launch(
        address[6] calldata impl,
        OpenFourTypes.TokenCreateParams calldata p,
        bytes calldata curveParams
    ) external nonReentrant returns (address token) {
        token = Clones.clone(impl[0]);
        address vault = Clones.clone(impl[1]);
        address curve = Clones.clone(impl[2]);
        address trade = Clones.clone(impl[3]);
        address migrateAddress = Clones.clone(impl[4]);
        address tokenModule = Clones.clone(impl[5]);
        IOpenFourTokenModule(tokenModule).createToken(
            msg.sender,
            token,
            vault,
            curve,
            trade,
            migrateAddress,
            address(0),
            p,
            "review.1",
            "review.1"
        );
        IOpenFourVault(vault).init(
            token,
            address(this),
            msg.sender,
            migrateAddress,
            p,
            "",
            "review.1"
        );
        IOpenFourCurveModule(curve).init(
            token,
            address(this),
            p,
            curveParams,
            "review.1"
        );
        IOpenFourTradeModule(trade).init(token, address(this), "", "review.1");
        IOpenFourMigrateModule(migrateAddress).init(
            token,
            address(this),
            msg.sender,
            "",
            "review.1"
        );
        IOpenFourVault(vault).setPhase(OpenFourTypes.Phase.Trading);
        lastToken = token;
    }
    function preview(
        address token,
        address trader,
        uint256 amount,
        bool isBuy
    ) public view returns (uint256 q, uint256 tax, uint256 platform) {
        PiToken t = PiToken(token);
        IOpenFourVault v = IOpenFourVault(t.vault());
        OpenFourTypes.CurveResult memory r = IOpenFourCurveModule(
            t.curveModule()
        ).evaluate(
                OpenFourTypes.CurveContext(
                    token,
                    trader,
                    amount,
                    isBuy,
                    v.remainingForSale(),
                    v.totalRaised(),
                    block.timestamp,
                    ""
                )
            );
        require(r.executable && r.adjustedAmount == 0, "Harness: curve");
        q = r.quoteAmount;
        OpenFourTypes.TradeResult memory z = IOpenFourTradeModule(
            t.tradeModule()
        ).evaluate(
                OpenFourTypes.TradeContext(
                    token,
                    trader,
                    amount,
                    isBuy,
                    block.timestamp,
                    block.number,
                    v.remainingForSale(),
                    v.totalRaised(),
                    q,
                    ""
                )
            );
        require(z.allowed && z.fees.length == 1, "Harness: trade");
        tax = (q * z.fees[0].bps) / 10000;
        platform = q / 100;
    }
    function buy(address token, uint256 amount) external nonReentrant {
        PiToken t = PiToken(token);
        IOpenFourVault v = IOpenFourVault(t.vault());
        (uint256 q, uint256 tax, uint256 platform) = preview(
            token,
            msg.sender,
            amount,
            true
        );
        IERC20(wrappedNative).safeTransferFrom(msg.sender, t.vault(), q);
        IERC20(wrappedNative).safeTransferFrom(
            msg.sender,
            address(t.treasury()),
            tax
        );
        IERC20(wrappedNative).safeTransferFrom(
            msg.sender,
            address(this),
            platform
        );
        v.onBuy(
            OpenFourTypes.VaultTradeParams(
                msg.sender,
                amount,
                q,
                platform / 2,
                tax,
                platform - platform / 2,
                0
            )
        );
    }
    function sell(address token, uint256 amount) external nonReentrant {
        PiToken t = PiToken(token);
        IOpenFourVault v = IOpenFourVault(t.vault());
        (uint256 q, uint256 tax, uint256 platform) = preview(
            token,
            msg.sender,
            amount,
            false
        );
        IERC20(token).safeTransferFrom(msg.sender, t.vault(), amount);
        v.transferQuote(msg.sender, q - tax - platform);
        v.transferQuote(address(t.treasury()), tax);
        v.transferQuote(address(this), platform);
        v.onSell(
            OpenFourTypes.VaultTradeParams(
                msg.sender,
                amount,
                q,
                platform / 2,
                tax,
                platform - platform / 2,
                0
            )
        );
    }
    function migrate(
        address token
    ) external nonReentrant returns (uint8, bytes memory) {
        PiToken t = PiToken(token);
        IOpenFourVault v = IOpenFourVault(t.vault());
        OpenFourTypes.MigrateResult memory r = IOpenFourMigrateModule(
            t.migrateModule()
        ).evaluate(
                OpenFourTypes.MigrateContext(
                    token,
                    v.totalRaised(),
                    v.remainingForSale(),
                    v.isSoldOut(),
                    block.timestamp
                )
            );
        require(r.canMigrate, "Harness: not ready");
        v.setPhase(OpenFourTypes.Phase.MigratePending);
        (uint8 version, bytes memory data) = IOpenFourMigrateModule(
            t.migrateModule()
        ).executeMigration(
                OpenFourTypes.MigrateHookContext(
                    t.vault(),
                    token,
                    wrappedNative,
                    msg.sender,
                    v.totalRaised(),
                    v.remainingForSale(),
                    block.timestamp
                ),
                r.data
            );
        v.setPhase(OpenFourTypes.Phase.Migrated);
        return (version, data);
    }
}

contract RejectBNB {
    receive() external payable {
        revert("reject BNB");
    }
}
contract ClaimsReentry {
    address public rewards;
    bool public attempted;
    function setRewards(address r) external {
        rewards = r;
    }
    receive() external payable {
        attempted = true;
        (bool ok, ) = rewards.call(
            abi.encodeWithSignature("claim(address,bool)", address(this), true)
        );
        require(!ok, "reentry succeeded");
    }
}
