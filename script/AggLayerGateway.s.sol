// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/AggLayerGatewayDeployer.s.sol";

contract Deploy is Script, AggLayerGatewayDeployer {
    function run(
        address _proxyAdmin,
        address _defaultAdmin,
        address _aggchainDefaultVKeyRole,
        address _addRouteRole,
        address _freezeRouteRole
    ) public {
        (address implementation, address proxyAdmin, address proxy) = deployAggLayerGatewayTransparent(
            _proxyAdmin, _defaultAdmin, _aggchainDefaultVKeyRole, _addRouteRole, _freezeRouteRole
        );
        console.log("AggLayerGateway proxy: ", proxy);
        console.log("AggLayerGateway implementation: ", implementation);
        console.log("AggLayerGateway proxy admin: ", proxyAdmin);
    }
}
