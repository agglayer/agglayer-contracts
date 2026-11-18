// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "@openzeppelin/contracts4/token/ERC20/ERC20.sol";

interface IERC20SenderHook {
    function tokensToSend(address from, address to, uint256 amount) external;
}

/**
 * @notice ERC20 that calls a sender-registered hook before moving tokens (ERC777 `tokensToSend` semantics)
 */
contract ERC20SenderHookMock is ERC20 {
    mapping(address => bool) public hasSenderHook;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function setSenderHook(bool enabled) public {
        hasSenderHook[msg.sender] = enabled;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        if (from != address(0) && hasSenderHook[from]) {
            IERC20SenderHook(from).tokensToSend(from, to, amount);
        }
    }
}
