// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IAggchainBase.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAggLayerGateway.sol";

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
    struct AggchainVKeyRoute {
        bytes32 aggchainVKey;
        bool frozen;
    }

    // Consensus type that support generic consensus
    uint32 public constant AGGCHAIN_TYPE = 1;

    IAggLayerGateway public immutable aggLayerGateway;

    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of true (default), the keys are managed by the aggregation layer gateway
    bool public useDefaultGateway = true;

    // AggchainVKeyRoutes mapping
    mapping(bytes4 aggchainVKeySelector => AggchainVKeyRoute)
        public aggchainVKeyRoutes;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

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

    /**
     * @notice Override the function to prevent the contract from being initialized with this initializer implemented at PolygonConsensusBase.
     * @dev The function modifiers and initializer found in the original function have been removed for bytecode optimizations.
     */
    function initialize(
        address, // _admin
        address, // sequencer
        uint32, //networkID,
        address, // _gasTokenAddress,
        string memory, // sequencerURL,
        string memory // _networkName
    ) external pure override(PolygonConsensusBase) {
        // Set initialize variables
        revert InvalidInitializeFunction();
    }

    //////////////////
    // admin functions
    //////////////////

    function enableUseDefaultGatewayFlag() external onlyAdmin {
        if (!useDefaultGateway) {
            revert UseDefaultGatewayAlreadySet();
        }
        useDefaultGateway = false;
        // Emit event
        emit UpdateUseDefaultGatewayFlag(useDefaultGateway);
    }

    function disableUseDefaultGatewayFlag() external onlyAdmin {
        if (useDefaultGateway) {
            revert UseDefaultGatewayAlreadySet();
        }
        useDefaultGateway = true;
        // Emit event
        emit UpdateUseDefaultGatewayFlag(useDefaultGateway);
    }

    function addAggchainRoute(
        bytes4 aggchainSelector,
        bytes32 aggchainVKey
    ) external onlyAdmin {
        if (aggchainVKey == bytes32(0)) {
            revert InvalidAggchainVKey();
        }
        AggchainVKeyRoute storage aggchainVKeyRoute = aggchainVKeyRoutes[
            aggchainSelector
        ];
        // Check already added
        if (aggchainVKeyRoute.aggchainVKey != bytes32(0)) {
            revert AggchainRouteAlreadyAdded();
        }
        aggchainVKeyRoute.aggchainVKey = aggchainVKey;
        emit AddAggchainVKey(aggchainSelector, aggchainVKey);
    }

    function updateAggchainRoute(
        bytes4 aggchainSelector,
        bytes32 updatedAggchainVKey
    ) external onlyAdmin {
        AggchainVKeyRoute storage aggchainVKeyRoute = aggchainVKeyRoutes[
            aggchainSelector
        ];
        // Check already added
        if (aggchainVKeyRoute.aggchainVKey == bytes32(0)) {
            revert AggchainRouteNotFound();
        }
        aggchainVKeyRoute.aggchainVKey = updatedAggchainVKey;
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
            aggchainVKey = aggchainVKeyRoutes[aggchainSelector].aggchainVKey;
        } else {
            // Retrieve aggchain key from AggLayerGateway
            aggchainVKey = aggLayerGateway.getDefaultAggchainVKey(
                aggchainSelector
            );
        }
    }

    function _getAggchainSelectorFromType(
        bytes2 aggchainType,
        bytes2 aggchainSelector
    ) internal pure returns (bytes4) {
        return bytes4(aggchainType) | (bytes4(aggchainSelector) >> 16);
    }
}
