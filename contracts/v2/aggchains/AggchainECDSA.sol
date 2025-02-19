// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";
import "../interfaces/IAggchain.sol";

/**
 * @title AggchainECDSA
 * @notice Generic aggchain based on ECDSA signature.
 * An address signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree & nullifier_tree).
 * That address is the trustedSequencer and is set during the chain initialization.
 */
contract AggchainECDSA is AggchainBase, IAggchain {
    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Aggchain type selector, hardcoded value used to force the first 2 byes of aggchain selector to retrieve  the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE_SELECTOR = 0;

    ////////////////////////////////////////////////////////////
    //                       Events                           //
    ////////////////////////////////////////////////////////////
    /**
     * @dev Emitted when Pessimistic proof is verified.
     */
    event OnVerifyPessimistic(bytes32 newStateRoot);

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////
    // @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        // Get initializer version from OZ initializer smart contract
        _initializerVersion = _getInitializedVersion();
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
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

    ////////////////////////////////////////////////////////////
    //              Functions: initialization                 //
    ////////////////////////////////////////////////////////////
    /**
     * @param initializeBytesAggchain Encoded params to initialize the chain.
     * Each aggchain has its decoded params.
     * @dev for this type of aggChain, there is no need to initialize again when upgrading from pessimistic type because the initialize is exactly the same.
     * @dev The reinitializer(2) is set because it can also be initialized differently with 'initializeAfterUpgrade' function but only be initialized once.
     */
    function initialize(
        bytes memory initializeBytesAggchain
    ) external onlyRollupManager getInitializedVersion reinitializer(2) {
        // If initializer version is 0, it means that the chain is being initialized for the first time, so the contract has just been deployed, is not an upgrade
        if (_initializerVersion == 0) {
            // custom parsing of the initializeBytesAggchain
            (
                // aggchainBase params
                bool _useDefaultGateway,
                bytes32[] memory _ownedAggchainVKeys,
                bytes4[] memory _aggchainVKeySelectors,
                address _vKeyManager,
                // PolygonConsensusBase params
                address _admin,
                address _trustedSequencer,
                address _gasTokenAddress,
                string memory _trustedSequencerURL,
                string memory _networkName
            ) = abi.decode(
                    initializeBytesAggchain,
                    (
                        bool,
                        bytes32[],
                        bytes4[],
                        address,
                        address,
                        address,
                        address,
                        string,
                        string
                    )
                );
            // Set aggchainBase variables
            _initializeAggchainBase(
                _useDefaultGateway,
                _ownedAggchainVKeys,
                _aggchainVKeySelectors,
                _vKeyManager
            );
            // init polygonConsensusBase params
            _initializePolygonConsensusBase(
                _admin,
                _trustedSequencer,
                _gasTokenAddress,
                _trustedSequencerURL,
                _networkName
            );
        } else if (_initializerVersion == 1) {
            // Only need to initialize values that are specific for ECDSA because we are performing an upgrade from a Pessimistic chain
            // aggchainBase params
            (
                bool _useDefaultGateway,
                bytes32[] memory _ownedAggchainVKeys,
                bytes4[] memory _aggchainVKeySelectors,
                address _vKeyManager
            ) = abi.decode(
                    initializeBytesAggchain,
                    (bool, bytes32[], bytes4[], address)
                );
            // Set aggchainBase variables
            _initializeAggchainBase(
                _useDefaultGateway,
                _ownedAggchainVKeys,
                _aggchainVKeySelectors,
                _vKeyManager
            );
        } else {
            // This case should never happen because reinitializer is 2 so initializer version is 0 or 1, but it's here to avoid any possible future issue if the reinitializer version is increased
            revert InvalidInitializer();
        }
    }

    /// @notice Initializer AggchainBase storage
    /// @param _useDefaultGateway Flag to setup initial values for the owned gateway
    /// @param _initOwnedAggchainVKey Initial owned aggchain verification key
    /// @param _initAggchainVKeySelector Initial aggchain selector
    /// @param _vKeyManager Initial vKeyManager
    function _initializeAggchainBase(
        bool _useDefaultGateway,
        bytes32[] memory _initOwnedAggchainVKey,
        bytes4[] memory _initAggchainVKeySelector,
        address _vKeyManager
    ) internal {
        useDefaultGateway = _useDefaultGateway;
        vKeyManager = _vKeyManager;
        // set the owned verification keys
        if (_initOwnedAggchainVKey.length != _initAggchainVKeySelector.length) {
            revert OwnedAggchainVKeyLengthMismatch();
        }

        for (uint256 i = 0; i < _initOwnedAggchainVKey.length; i++) {
            ownedAggchainVKeys[
                _initAggchainVKeySelector[i]
            ] = _initOwnedAggchainVKey[i];
        }
    }

    function _initializePolygonConsensusBase(
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) internal {
        admin = _admin;
        trustedSequencer = sequencer;

        trustedSequencerURL = sequencerURL;
        networkName = _networkName;

        gasTokenAddress = _gasTokenAddress;
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Callback while pessimistic proof is being verified from the rollup manager
     * @dev Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainConfig |
     * length (bits):   |    32         |       256      |     256       |
     * aggchainConfig = keccak256(abi.encodePacked(trusted_sequencer))
     * @param aggChainData custom bytes provided by the chain
     * @return aggchainHash resulting aggchain hash
     */
    /// @inheritdoc IAggchain
    function getAggchainHash(
        bytes memory aggChainData
    ) external view returns (bytes32) {
        // The second param is the new state root used at onVerifyPessimistic callback but now only aggchainVKeySelector is required
        (bytes2 aggchainVKeySelector, ) = abi.decode(
            aggChainData,
            (bytes2, bytes32)
        );
        bytes4 finalAggchainSelector = _getFinalAggchainVKeySelectorFromType(
            aggchainVKeySelector,
            AGGCHAIN_TYPE_SELECTOR
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

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /// @inheritdoc IAggchain
    function onVerifyPessimistic(
        bytes calldata aggChainData
    ) external onlyRollupManager {
        (, bytes32 newStateRoot) = abi.decode(aggChainData, (bytes2, bytes32));
        // Emit event
        emit OnVerifyPessimistic(newStateRoot);
    }
}
