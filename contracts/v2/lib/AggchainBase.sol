// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAggLayerGateway.sol";
import "../interfaces/IAggchainBase.sol";

/**
 * @title AggchainBase
 * @notice  Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract AggchainBase is PolygonConsensusBase, IAggchainBase {
    // Aggchain type that support generic aggchain hash
    uint32 public constant AGGCHAIN_TYPE = 1;
    // AggLayerGateway address, used in case the flag `useDefaultGateway` is set to true, the aggchains keys are managed by the gateway
    IAggLayerGateway public immutable aggLayerGateway;

    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of true (default), the keys are managed by the aggregation layer gateway
    bool public useDefaultGateway;

    // AggchainVKeys mapping
    mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey)
        public ownedAggchainVKeys;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token address.
     * @param _bridgeAddress Bridge address.
     * @param _rollupManager Rollup manager address.
     * @param _aggLayerGateway AggLayerGateway address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {
        aggLayerGateway = _aggLayerGateway;
    }

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Enable the use of the default gateway to manage the aggchain keys.
     */
    function enableUseDefaultGatewayFlag() external onlyAdmin {
        if (useDefaultGateway) {
            revert UseDefaultGatewayAlreadySet();
        }
        useDefaultGateway = true;
        // Emit event
        emit UpdateUseDefaultGatewayFlag(useDefaultGateway);
    }

    /**
     * @notice Disable the use of the default gateway to manage the aggchain keys. After disable, the keys are handled by the aggchain contract.
     */
    function disableUseDefaultGatewayFlag() external onlyAdmin {
        if (!useDefaultGateway) {
            revert UseDefaultGatewayAlreadySet();
        }
        useDefaultGateway = false;
        // Emit event
        emit UpdateUseDefaultGatewayFlag(useDefaultGateway);
    }

    /**
     * @notice Add a new aggchain verification key to the aggchain contract.
     * @param aggchainSelector The selector for the verification key query. This selector identifies the aggchain key
     * @param newAggchainVKey The new aggchain verification key to be added.
     */
    function addOwnedAggchainVKey(
        bytes4 aggchainSelector,
        bytes32 newAggchainVKey
    ) external onlyAdmin {
        if (newAggchainVKey == bytes32(0)) {
            revert InvalidAggchainVKey();
        }

        // Check already added
        if (ownedAggchainVKeys[aggchainSelector] != bytes32(0)) {
            revert OwnedAggchainVKeyAlreadyAdded();
        }
        ownedAggchainVKeys[aggchainSelector] = newAggchainVKey;
        emit AddAggchainVKey(aggchainSelector, newAggchainVKey);
    }

    /**
     * @notice Update the aggchain verification key in the aggchain contract.
     * @param aggchainSelector The selector for the verification key query. This selector identifies the aggchain key
     * @param updatedAggchainVKey The updated aggchain verification key value.
     */
    function updateOwnedAggchainVKey(
        bytes4 aggchainSelector,
        bytes32 updatedAggchainVKey
    ) external onlyAdmin {
        // Check already added
        if (ownedAggchainVKeys[aggchainSelector] == bytes32(0)) {
            revert OwnedAggchainVKeyNotFound();
        }
        ownedAggchainVKeys[aggchainSelector] = updatedAggchainVKey;
        emit UpdateAggchainVKey(aggchainSelector, updatedAggchainVKey);
    }

    /**
     * @notice returns the current aggchain verification key. If the flag `useDefaultGateway` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param aggchainSelector The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version
     */
    function getAggchainVKey(
        bytes4 aggchainSelector
    ) public view returns (bytes32 aggchainVKey) {
        if (!useDefaultGateway) {
            aggchainVKey = ownedAggchainVKeys[aggchainSelector];
        } else {
            // Retrieve aggchain key from AggLayerGateway
            aggchainVKey = aggLayerGateway.getDefaultAggchainVKey(
                aggchainSelector
            );
        }
    }

    /**
     * @notice Computes the selector for the aggchain verification key from the aggchain type and the aggchain selector.
     * @dev It joins two bytes2 values into a bytes4 value.
     * @param aggchainType The aggchain type, hardcoded in the aggchain contract.
     * @param aggchainSelector The aggchain selector, used to identify the aggchain key.
     */
    function _getAggchainSelectorFromType(
        bytes2 aggchainType,
        bytes2 aggchainSelector
    ) internal pure returns (bytes4) {
        return bytes4(aggchainType) | (bytes4(aggchainSelector) >> 16);
    }
}
