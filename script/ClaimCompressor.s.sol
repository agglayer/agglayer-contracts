// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/ClaimCompressorDeployer.s.sol";

contract Deploy is Script, ClaimCompressorDeployer {
    function run(address _bridgeAddress, uint32 _networkID) public {
        address implementation = deployClaimCompressorImplementation(_bridgeAddress, _networkID);
        console.log("ClaimCompressor implementation: ", implementation);
    }
}
