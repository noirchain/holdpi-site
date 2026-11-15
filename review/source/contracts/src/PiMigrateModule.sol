// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IOpenFourMigrateModule} from "../vendor/openfour/interfaces/IOpenFourMigrateModule.sol";
import {IOpenFourVault} from "../vendor/openfour/interfaces/IOpenFourVault.sol";
import {IOpenFourCurveModule} from "../vendor/openfour/interfaces/IOpenFourCurveModule.sol";
import {OpenFourTypes} from "../vendor/openfour/libraries/OpenFourTypes.sol";
import {IV2Pair} from "./PiTreasury.sol";
interface IPiMigrationToken {
    function canonicalPool() external view returns (address);
    function vault() external view returns (address);
    function curveModule() external view returns (address);
    function onMigrate() external;
}
/// @notice Seeds the pre-registered canonical pair, with LP locked at DEAD.
/// @dev No chain-id branch can silently skip liquidity on a local network.
contract PiMigrateModule is Initializable, IOpenFourMigrateModule {
    address public boundToken;
    address public fourCore;
    bool public executed;
    bytes private raw;
    string private version;
    constructor() {
        _disableInitializers();
    }
    modifier onlyCore() {
        require(msg.sender == fourCore, "PI: core only");
        _;
    }
    function init(
        address token,
        address core,
        address,
        bytes calldata params,
        string calldata version_
    ) external initializer {
        require(
            token != address(0) && core != address(0),
            "PI: migrate binding"
        );
        require(params.length == 0, "PI: migrate params");
        boundToken = token;
        fourCore = core;
        raw = params;
        version = version_;
    }
    function _ready(
        uint256 remaining,
        uint256 raised
    ) internal view returns (bool) {
        return !executed && raised > 0 && remaining <= 1e18;
    }
    function evaluate(
        OpenFourTypes.MigrateContext calldata c
    ) external view onlyCore returns (OpenFourTypes.MigrateResult memory) {
        require(c.token == boundToken, "PI: migrate token");
        bool ready = _ready(c.remainingForSale, c.totalRaised);
        return
            OpenFourTypes.MigrateResult(
                ready,
                "",
                ready ? "" : "Graduation conditions not met"
            );
    }
    function executeMigration(
        OpenFourTypes.MigrateHookContext calldata c,
        bytes calldata
    ) external onlyCore returns (uint8, bytes memory) {
        require(
            c.token == boundToken &&
                c.vault == IPiMigrationToken(boundToken).vault(),
            "PI: migrate context"
        );
        IOpenFourVault v = IOpenFourVault(c.vault);
        require(
            c.quoteAsset == v.quoteAsset() &&
                c.totalRaised == v.totalRaised() &&
                c.remainingForSale == v.remainingForSale(),
            "PI: migrate state"
        );
        require(
            v.phase() == OpenFourTypes.Phase.MigratePending &&
                _ready(c.remainingForSale, c.totalRaised),
            "PI: not ready"
        );
        executed = true;
        address pair = IPiMigrationToken(boundToken).canonicalPool();
        require(
            IV2Pair(pair).totalSupply() == 0 &&
                IERC20(boundToken).balanceOf(pair) == 0,
            "PI: pool already seeded"
        );
        OpenFourTypes.CurveLiquiditySnapshot memory s = IOpenFourCurveModule(
            IPiMigrationToken(boundToken).curveModule()
        ).getLiquiditySnapshot(boundToken, c.remainingForSale, c.totalRaised);
        // Match the terminal curve ratio rather than dumping all unsold PI at
        // an unrelated opening AMM price. Surplus launch inventory is burned.
        uint256 pi = Math.mulDiv(
            c.totalRaised,
            s.currentTokenLiquidity,
            s.currentQuoteLiquidity
        );
        require(
            pi > 0 && pi <= IERC20(boundToken).balanceOf(c.vault),
            "PI: liquidity inventory"
        );
        uint256 beforeLP = IERC20(pair).balanceOf(address(0xdEaD));
        v.transferTokenForMigration(pair, pi);
        v.transferQuoteForMigration(pair, c.totalRaised);
        IV2Pair(pair).mint(address(0xdEaD));
        require(
            IERC20(pair).balanceOf(address(0xdEaD)) > beforeLP,
            "PI: LP not locked"
        );
        uint256 surplus = IERC20(boundToken).balanceOf(c.vault);
        if (surplus > 0) v.burnToken(surplus);
        IPiMigrationToken(boundToken).onMigrate();
        return (1, abi.encode(pair));
    }
    function getInitParams() external view returns (bytes memory) {
        return raw;
    }
    function descriptor()
        external
        view
        returns (bytes8, string memory, string memory)
    {
        return (
            bytes8(keccak256("module.migrate.pi_v2")),
            "module.migrate.pi_v2",
            version
        );
    }
}
