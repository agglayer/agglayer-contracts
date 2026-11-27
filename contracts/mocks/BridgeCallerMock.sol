// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../interfaces/IAgglayerBridge.sol";

/**
 * @notice Contract that calls the bridge on behalf of an EOA, so tx.origin and msg.sender differ
 */
contract BridgeCallerMock {
    function bridgeMessage(
        IAgglayerBridge bridge,
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external payable {
        bridge.bridgeMessage{value: msg.value}(
            destinationNetwork,
            destinationAddress,
            forceUpdateGlobalExitRoot,
            metadata
        );
    }
}
