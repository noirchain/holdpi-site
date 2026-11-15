// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IOpenFourTokenModule} from "../vendor/openfour/interfaces/IOpenFourTokenModule.sol";
import {OpenFourToken} from "../vendor/openfour/token/OpenFourToken.sol";
import {OpenFourTypes} from "../vendor/openfour/libraries/OpenFourTypes.sol";
contract PiTokenModule is IOpenFourTokenModule {
    address public immutable fourCore;
    bool private created;
    bytes private raw;
    string private version;
    constructor(address core) {
        require(core != address(0), "PI: core");
        fourCore = core;
    }
    function createToken(
        address creator,
        address token,
        address vault,
        address curve,
        address trade,
        address migrate,
        address customData,
        OpenFourTypes.TokenCreateParams calldata p,
        string calldata tokenVersion,
        string calldata moduleVersion
    ) external returns (uint256, string memory, string memory) {
        require(msg.sender == fourCore && !created, "PI: creation authority");
        created = true;
        raw = p.tokenParams;
        version = moduleVersion;
        OpenFourToken(token).initialize(
            OpenFourToken.InitArgs(
                p.requestId,
                p.name,
                p.symbol,
                vault,
                p.maxSupply,
                p.tokenUri,
                curve,
                trade,
                migrate,
                address(this),
                customData,
                creator,
                p.quoteAsset,
                p.tokenParams,
                tokenVersion
            )
        );
        return (p.maxSupply, p.name, p.symbol);
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
            bytes8(keccak256("module.token.pi")),
            "module.token.pi",
            version
        );
    }
}
