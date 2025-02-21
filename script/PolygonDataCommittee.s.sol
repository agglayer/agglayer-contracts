// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonDataCommitteeDeployer.s.sol";

contract Deploy is Script, PolygonDataCommitteeDeployer {
    function run(address _proxyAdmin) public {
        (address implementation, address proxyAdmin, address proxy) = deployPolygonDataCommitteeTransparent(_proxyAdmin);
        console.log("PolygonDataCommittee proxy: ", proxy);
        console.log("PolygonDataCommittee implementation: ", implementation);
        console.log("PolygonDataCommittee proxy admin: ", proxyAdmin);
    }
}
