// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonRollupManagerDeployer.s.sol";

contract Deploy is Script, PolygonRollupManagerDeployer {
    function run(address _globalExitRootManager, address _pol, address _bridgeAddress, address _aggLayerGateway)
        public
    {
        address implementation = deployPolygonRollupManagerImplementation(
            IPolygonZkEVMGlobalExitRootV2(_globalExitRootManager),
            IERC20Upgradeable(_pol),
            IPolygonZkEVMBridge(_bridgeAddress),
            IAggLayerGateway(_aggLayerGateway)
        );
        console.log("PolygonRollupManager implementation: ", implementation);
    }
}
