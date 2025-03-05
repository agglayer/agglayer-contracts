// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/ERC20PermitMockDeployer.s.sol";

contract Deploy is Script, ERC20PermitMockDeployer {
    function run(string calldata _name, string calldata _symbol, address _initialAccount, uint256 _initialBalance)
        public
    {
        address implementation = deployERC20PermitMockImplementation(_name, _symbol, _initialAccount, _initialBalance);
        console.log("ERC20PermitMock implementation: ", implementation);
    }
}
