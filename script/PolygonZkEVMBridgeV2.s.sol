// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";

contract Deploy is Script, PolygonZkEVMBridgeV2Deployer {
    function run(
        address _proxyAdmin,
        address _gastoken,
        address _globalExitRootManager,
        address _rollupManager,
        uint32 _networkId,
        uint32 _gasTokenNetwork,
        bytes calldata _gasTokenMetadata
    ) public {
        (address implementation, address proxyAdmin, address proxy) = deployPolygonZkEVMBridgeV2Transparent(
            _proxyAdmin,
            _networkId,
            _gastoken,
            _gasTokenNetwork,
            IBasePolygonZkEVMGlobalExitRoot(_globalExitRootManager),
            _rollupManager,
            _gasTokenMetadata
        );
        console.log("PolygonZkEVMBridgeV2 proxy: ", proxy);
        console.log("PolygonZkEVMBridgeV2 implementation: ", implementation);
        console.log("PolygonZkEVMBridgeV2 proxy admin: ", proxyAdmin);
    }
}
