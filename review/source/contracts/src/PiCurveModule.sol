// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IOpenFourCurveModule} from "../vendor/openfour/interfaces/IOpenFourCurveModule.sol";
import {OpenFourTypes} from "../vendor/openfour/libraries/OpenFourTypes.sol";

/// @notice Optional transparent virtual-reserve curve for the review preset.
/// @dev Virtual quote is a pricing parameter, never spendable treasury backing.
contract PiCurveModule is Initializable, IOpenFourCurveModule {
    struct Config {
        uint256 virtualToken;
        uint256 virtualQuote;
    }
    Config public config;
    address public boundToken;
    address public fourCore;
    uint256 public saleAmount;
    bytes private raw;
    string private version;
    constructor() {
        _disableInitializers();
    }
    function init(
        address token,
        address core,
        OpenFourTypes.TokenCreateParams calldata t,
        bytes calldata params,
        string calldata version_
    ) external initializer {
        Config memory p = abi.decode(params, (Config));
        require(
            token != address(0) && core != address(0) && t.saleAmount > 0,
            "PI: curve binding"
        );
        require(
            p.virtualToken > t.saleAmount &&
                p.virtualToken <= 1e36 &&
                p.virtualQuote > 0 &&
                p.virtualQuote <= 1e36,
            "PI: virtual reserves"
        );
        boundToken = token;
        fourCore = core;
        saleAmount = t.saleAmount;
        config = p;
        raw = params;
        version = version_;
    }
    function _reserves(
        uint256 remaining,
        uint256 raised
    ) internal view returns (uint256 x, uint256 y) {
        require(remaining <= saleAmount, "PI: sale state");
        x = config.virtualToken - (saleAmount - remaining);
        y = config.virtualQuote + raised;
    }
    function evaluate(
        OpenFourTypes.CurveContext calldata c
    ) external view returns (OpenFourTypes.CurveResult memory r) {
        require(
            c.token == boundToken && boundToken != address(0),
            "PI: curve token"
        );
        (uint256 x, uint256 y) = _reserves(c.remainingForSale, c.totalRaised);
        if (c.amount == 0)
            return OpenFourTypes.CurveResult(false, 0, 0, "Zero amount");
        if (c.isBuy) {
            if (c.amount > c.remainingForSale)
                return OpenFourTypes.CurveResult(false, 0, 0, "Sale inventory");
            uint256 buyQuote = Math.mulDiv(
                y,
                c.amount,
                x - c.amount,
                Math.Rounding.Up
            );
            return OpenFourTypes.CurveResult(true, buyQuote, 0, "");
        }
        if (c.amount > saleAmount - c.remainingForSale)
            return OpenFourTypes.CurveResult(false, 0, 0, "Circulating amount");
        uint256 q = Math.mulDiv(y, c.amount, x + c.amount);
        if (q == 0 || q > c.totalRaised)
            return OpenFourTypes.CurveResult(false, 0, 0, "Quote liquidity");
        return OpenFourTypes.CurveResult(true, q, 0, "");
    }
    function evaluateReverse(
        address token,
        bool isBuy,
        uint256 budget,
        uint256 remaining,
        uint256 raised,
        uint256
    ) external view returns (uint256 amount, uint256 q) {
        require(
            token == boundToken && boundToken != address(0),
            "PI: curve token"
        );
        if (!isBuy || budget == 0 || remaining == 0) return (0, 0);
        (uint256 x, uint256 y) = _reserves(remaining, raised);
        amount = Math.min(remaining, Math.mulDiv(budget, x, y + budget));
        if (amount > 0)
            q = Math.mulDiv(y, amount, x - amount, Math.Rounding.Up);
    }
    function getInitialPrice() external view returns (uint256) {
        return Math.mulDiv(config.virtualQuote, 1e18, config.virtualToken);
    }
    function getLastPrice(
        address token,
        uint256 remaining,
        uint256 raised
    ) public view returns (uint256) {
        require(
            token == boundToken && boundToken != address(0),
            "PI: curve token"
        );
        (uint256 x, uint256 y) = _reserves(remaining, raised);
        return Math.mulDiv(y, 1e18, x);
    }
    function getLiquiditySnapshot(
        address token,
        uint256 remaining,
        uint256 raised
    ) external view returns (OpenFourTypes.CurveLiquiditySnapshot memory s) {
        (uint256 x, uint256 y) = _reserves(remaining, raised);
        s = OpenFourTypes.CurveLiquiditySnapshot(
            true,
            config.virtualQuote,
            config.virtualToken,
            y,
            x,
            remaining,
            raised,
            getLastPrice(token, remaining, raised)
        );
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
            bytes8(keccak256("module.curve.pi_virtual")),
            "module.curve.pi_virtual",
            version
        );
    }
}
