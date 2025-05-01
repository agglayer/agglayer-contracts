// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev This interface contains all the functions used by the BridgeL2SovereignChain.sol smart contract related to tokens that are mintable
 * Note that the BridgeL2SovereignChain.sol provides two paths in order to attach a token: token mintable or not mintable
 * Token mintable: BridgeL2SovereignChain.sol will use the '.mint' and '.burn' functions
 * Token not mintable: BridgeL2SovereignChain.sol will internally use 'transfer' and 'transferFrom' (This optiosn requires the bridge to have the token assets deposited)
 */
interface ITokenWrappedBridgeMintable is IERC20 {
    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     */
    function mint(address to, uint256 value) external;

    /**
     * @dev Destroys `amount` tokens from the caller.
     */
    function burn(address account, uint256 value) external;
}
