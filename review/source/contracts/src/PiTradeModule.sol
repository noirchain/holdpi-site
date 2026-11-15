// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IOpenFourTradeModule} from "../vendor/openfour/interfaces/IOpenFourTradeModule.sol";
import {IOpenFourModuleSchema} from "../vendor/openfour/interfaces/IOpenFourModuleSchema.sol";
import {
    OpenFourTypes,
    ParamDescriptor,
    ModuleEncodeSchema
} from "../vendor/openfour/libraries/OpenFourTypes.sol";
interface IPiTradeToken {
    function treasury() external view returns (address);
    function exitFeeBps(address, uint256) external view returns (uint256);
}
contract PiTradeModule is
    Initializable,
    IOpenFourTradeModule,
    IOpenFourModuleSchema
{
    address public boundToken;
    address public fourCore;
    string private version;
    constructor() {
        _disableInitializers();
    }
    function init(
        address token,
        address core,
        bytes calldata params,
        string calldata version_
    ) external initializer {
        require(
            token != address(0) && core != address(0) && params.length == 0,
            "PI: trade config"
        );
        boundToken = token;
        fourCore = core;
        version = version_;
    }
    function evaluate(
        OpenFourTypes.TradeContext calldata c
    ) external view returns (OpenFourTypes.TradeResult memory) {
        require(
            c.token == boundToken && boundToken != address(0),
            "PI: wrong token"
        );
        require(c.trader != address(0) && c.amount > 0, "PI: trade amount");
        uint256 rate =
            c.isBuy
                ? 500
                : IPiTradeToken(boundToken).exitFeeBps(c.trader, c.amount);
        OpenFourTypes.FeeTier[] memory fees = new OpenFourTypes.FeeTier[](1);
        fees[0] = OpenFourTypes.FeeTier(
            IPiTradeToken(boundToken).treasury(),
            uint16(rate)
        );
        return OpenFourTypes.TradeResult(true, 0, type(uint256).max, fees, "");
    }
    function descriptor()
        external
        view
        returns (bytes8, string memory, string memory)
    {
        return (
            bytes8(keccak256("module.trade.pi_age")),
            "module.trade.pi_age",
            version
        );
    }
    function getInitParams() external pure returns (bytes memory) {
        return "";
    }
    function moduleEncodeSchema()
        external
        pure
        returns (ModuleEncodeSchema memory)
    {
        return ModuleEncodeSchema("trade", 1, new ParamDescriptor[](0));
    }
}
