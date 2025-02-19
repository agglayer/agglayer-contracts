// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";
/**
 * @title AggchainBase
 * @notice  Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
contract AggchainBaseMock is AggchainBase {
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
        )
    {}

    /**
     * @notice Computes the selector for the aggchain verification key from the aggchain type and the aggchainVKeySelector.
     * @dev It joins two bytes2 values into a bytes4 value.
     * @param aggchainVKeySelector The aggchain verification key selector, used to identify the aggchain verification key.
     * @param aggchainType The aggchain type, hardcoded in the aggchain contract.
     */
    function getFinalAggchainVKeySelectorFromType(
        bytes2 aggchainVKeySelector,
        bytes2 aggchainType
    ) public pure returns (bytes4) {
        return
            _getFinalAggchainVKeySelectorFromType(
                aggchainVKeySelector,
                aggchainType
            );
    }
}
