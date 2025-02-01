// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../interfaces/IAggchain.sol";
import "../lib/AggchainBase.sol";

/**
 * @title AggchainECDSA
 * @notice Generic aggchain based on ECDSA signature.
 * An address signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree & nullifier_tree).
 * That address is the trustedSequencer and is set during the chain initialization.
 */
contract AggchainECDSA is AggchainBase, IAggchain {
    /**
     * @dev Emitted when Pessimistic proof is verified.
     */
    event OnVerifyPessimistic(bytes32 newStateRoot);

    /**
     * @param _rollupManager Rollup manager address.
     */
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
     * @param initializeBytesCustomChain Encoded params to initialize the chain.
     * Each aggchain has its decoded params.
     * @dev for this type of aggChain, there is no need to initialize again when upgrading from pessimistic type because the initialize is exactly the same.
     */
    function initialize(
        bytes memory initializeBytesCustomChain
    ) external override onlyRollupManager initializer {
        // custom parsing of the initializeBytesCustomChain
        (
            address _admin,
            address _trustedSequencer,
            address _gasTokenAddress,
            string memory _trustedSequencerURL,
            string memory _networkName
        ) = abi.decode(
                initializeBytesCustomChain,
                (address, address, address, string, string)
            );
        // set chain variables
        admin = _admin;
        gasTokenAddress = _gasTokenAddress;
        trustedSequencer = _trustedSequencer;
        trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;
    }

    /**
     * @dev Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainConfig |
     * length (bits):   |    32         |       256      |     256       |
     * aggchainConfig = keccak256(abi.encodePacked(trusted_sequencer))
     */
    /// @inheritdoc IAggchain
    function getAggchainHash(
        bytes memory customChainData
    ) external view returns (bytes32) {
        bytes2 aggchainSelector = abi.decode(customChainData, (bytes2));
        bytes4 finalAggchainSelector = _getAggchainSelectorFromType(
            AggchainType.ECDSA,
            aggchainSelector
        );
        return
            keccak256(
                abi.encodePacked(
                    AGGCHAIN_TYPE,
                    getAggchainVKey(finalAggchainSelector),
                    keccak256(abi.encodePacked(trustedSequencer))
                )
            );
    }

    /**
     * @notice For ECDSA chains, a plain event is emitted after pessimistic verification
     * @dev The customData is not used at this kind of chain, added to match the interface
     */
    function onVerifyPessimistic(
        bytes calldata customChainData
    ) external onlyRollupManager {
        bytes32 newStateRoot = abi.decode(customChainData, (bytes32));
        // Emit event
        emit OnVerifyPessimistic(newStateRoot);
    }
}
