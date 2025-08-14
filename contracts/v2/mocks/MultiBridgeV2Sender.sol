// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IPolygonZkEVMBridgeV2} from "../interfaces/IPolygonZkEVMBridgeV2.sol";

/**
 * @title MultiBridgeV2Sender
 * @notice Helper contract to invoke `bridgeAsset` multiple times with 1 wei each
 */
contract MultiBridgeV2Sender {
    receive() external payable {}

    /**
     * @notice Calls bridgeAsset X times sending 1 wei per call bridging native token (ETH) to `destinationNetwork`.
     * - destinationAddress = msg.sender
     * - amount = 1
     * - token = address(0)
     * - forceUpdateGlobalExitRoot = false except the last call which is true
     * - permitData = 0x
     * @param bridge Bridge address
     * @param destinationNetwork Destination network id
     * @param times Number of bridge calls to perform
     */
    function multiBridge(
        IPolygonZkEVMBridgeV2 bridge,
        uint32 destinationNetwork,
        uint256 times
    ) external payable {
        require(msg.value == times, "msg.value must equal times");

        // Loop and send 1 wei per call
        for (uint256 i = 0; i < times; i++) {
            bool isLast = (i + 1 == times);
            bridge.bridgeAsset{value: 1}(
                destinationNetwork,
                msg.sender, //destinationAddress
                1, // amount, 1 wei
                address(0), // ether
                isLast,
                bytes("") // permitData not needed
            );
        }
    }
}
