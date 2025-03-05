// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract Deploy is Script, PolygonZkEVMGlobalExitRootV2Deployer {
    function run(address _proxyAdmin, address _rollupManager, address _bridgeAddress) public {
        (address implementation, address proxyAdmin, address proxy) =
            deployPolygonZkEVMGlobalExitRootV2Transparent(_proxyAdmin, _rollupManager, _bridgeAddress);
        console.log("PolygonZkEVMGlobalExitRootV2 proxy: ", proxy);
        console.log("PolygonZkEVMGlobalExitRootV2 implementation: ", implementation);
        console.log("PolygonZkEVMGlobalExitRootV2 proxy admin: ", proxyAdmin);
    }
}
