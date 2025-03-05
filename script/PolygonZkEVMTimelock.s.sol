// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMTimelockDeployer.s.sol";

contract Deploy is Script, PolygonZkEVMTimelockDeployer {
    function run(
        address[] calldata _proposers,
        address[] calldata _executors,
        address _admin,
        address _polygonZkEVM,
        uint256 _minDelay
    ) public {
        address implementation = deployPolygonZkEVMTimelockImplementation(
            _minDelay, _proposers, _executors, _admin, PolygonZkEVM(_polygonZkEVM)
        );
        console.log("PolygonZkEVMTimelock implementation: ", implementation);
    }
}
