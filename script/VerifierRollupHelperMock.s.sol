// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/VerifierRollupHelperMockDeployer.s.sol";

contract Deploy is Script, VerifierRollupHelperMockDeployer {
    function run(address _proxyAdmin) public {
        (address implementation, address proxyAdmin, address proxy) =
            deployVerifierRollupHelperMockTransparent(_proxyAdmin);
        console.log("VerifierRollupHelperMock proxy: ", proxy);
        console.log("VerifierRollupHelperMock implementation: ", implementation);
        console.log("VerifierRollupHelperMock proxy admin: ", proxyAdmin);
    }
}
