// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonRollupManagerEmptyMockDeployer.s.sol";

contract Deploy is Script, PolygonRollupManagerEmptyMockDeployer {
    function run(address _proxyAdmin) public {
        (address implementation, address proxyAdmin, address proxy) =
            deployPolygonRollupManagerEmptyMockTransparent(_proxyAdmin);
        console.log("PolygonRollupManagerEmptyMock proxy: ", proxy);
        console.log("PolygonRollupManagerEmptyMock implementation: ", implementation);
        console.log("PolygonRollupManagerEmptyMock proxy admin: ", proxyAdmin);
    }
}
