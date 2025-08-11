// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";

/**
 * @title AggchainECDSAMultisig
 * @notice Generic aggchain based on ECDSA multisig signature.
 * An array of addresses signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree, nullifier_tree & height).
 * The addresses and threshold are managed by the aggchainManager.
 */
contract AggchainECDSAMultisig is AggchainBase {
    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Aggchain type selector, hardcoded value used to force the last 2 bytes of aggchain selector to retrieve the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE = 0x0002;

    /// @notice Aggchain version
    string public constant AGGCHAIN_ECDSA_MULTISIG_VERSION = "v1.0.0";

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////
    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    ////////////////////////////////////////////////////////////
    //                         Events                         //
    ////////////////////////////////////////////////////////////
    /// @notice Emitted when pessimistic verification is completed.
    event OnVerifyPessimisticECDSAMultisig();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////
    /// @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        // Get initializer version from OZ initializer smart contract
        _initializerVersion = _getInitializedVersion();
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token contract address.
     * @param _bridgeAddress Bridge contract address.
     * @param _rollupManager Rollup manager contract address.
     * @param _aggLayerGateway AggLayerGateway contract address.
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
     * @param initializeBytesAggchain Encoded bytes to initialize the chain.
     * Each aggchain has its decoded params.
     * @custom:security First initialization takes into account this contracts and all the inheritance contracts
     *                  Second initialization does not initialize PolygonConsensusBase parameters
     *                  Second initialization can happen if a chain is upgraded from a PolygonPessimisticConsensus
     * @dev The reinitializer(2) is set to support the upgrade from PolygonPessimisticConsensus to AggchainECDSAMultisig, where PolygonPessimisticConsensus is already initialized
     */
    function initialize(
        bytes memory initializeBytesAggchain
    ) external onlyAggchainManager getInitializedVersion reinitializer(2) {
        // If initializer version is 0, it means that the chain is being initialized for the first time, so the contract has just been deployed, is not an upgrade
        if (_initializerVersion == 0) {
            // custom parsing of the initializeBytesAggchain
            (
                // multisig specific params
                address[] memory _initialAggchainSigners,
                uint32 _threshold,
                // aggchainBase params
                bool _useDefaultGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes4 _initAggchainVKeySelector,
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
                        address[],
                        uint32,
                        bool,
                        bytes32,
                        bytes4,
                        address,
                        address,
                        address,
                        address,
                        string,
                        string
                    )
                );

            // Check the aggchainType embedded in the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // Set aggchainBase variables
            _initializeAggchainBaseAndConsensusBase(
                _admin,
                _trustedSequencer,
                _gasTokenAddress,
                _trustedSequencerURL,
                _networkName,
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager,
                _initialAggchainSigners,
                _threshold
            );
        } else if (_initializerVersion == 1) {
            // Only need to initialize values that are specific for ECDSA Multisig because we are performing an upgrade from a Pessimistic Consensus
            (
                // multisig specific params
                address[] memory _initialAggchainSigners,
                uint32 _threshold,
                // aggchainBase params
                bool _useDefaultGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes4 _initAggchainVKeySelector,
                address _vKeyManager
            ) = abi.decode(
                    initializeBytesAggchain,
                    (address[], uint32, bool, bytes32, bytes4, address)
                );

            // Check the aggchainType embedded in the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // Set aggchainBase variables
            _initializeAggchainBase(
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager,
                _initialAggchainSigners,
                _threshold
            );
        } else {
            // This case should never happen because reinitializer is 2 so initializer version is 0 or 1, but it's here to avoid any possible future issue if the reinitializer version is increased
            revert InvalidInitializer();
        }
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////
    /// @dev Validates the provided aggchain data and returns the computed aggchain parameters and vkey
    ///
    ///     aggchain_hash:
    ///     Field:           | CONSENSUS_TYPE | aggchain_vkey  | aggchain_params  |
    ///     length (bits):   | 32             | 256            | 256              |
    ///
    ///     aggchain_params:
    ///     Field:           | aggchainSignersHash    | threshold      |
    ///     length (bits):   | 256            | 32             |
    ///
    /// @param aggchainData custom bytes provided by the chain
    ///     aggchainData:
    ///     Field:           | _aggchainVKeySelector |
    ///     length (bits):   | 32                    |
    ///
    /// aggchainData._aggchainVKeySelector 4 bytes aggchain vkey selector (ABI-encoded as 32 bytes)
    ///
    /// @return aggchainVKey The aggchain verification key
    /// @return aggchainParams The computed aggchain parameters hash
    /// @inheritdoc AggchainBase
    function getAggchainParamsAndVKeySelector(
        bytes memory aggchainData
    ) public pure override returns (bytes32, bytes32) {
        if (aggchainData.length != 32) {
            revert InvalidAggchainDataLength();
        }

        // Only aggchainVKeySelector is required (bytes4 ABI-encoded as 32 bytes)
        bytes4 _aggchainVKeySelector = abi.decode(aggchainData, (bytes4));

        if (
            getAggchainTypeFromSelector(_aggchainVKeySelector) != AGGCHAIN_TYPE
        ) {
            revert InvalidAggchainType();
        }

        // aggchainParams and aggchainVKey are not used in this implementation
        return (bytes32(0), bytes32(0));
    }

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /// @inheritdoc IAggchainBase
    function onVerifyPessimistic(
        bytes calldata aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != 32) {
            revert InvalidAggchainDataLength();
        }

        // Only aggchainVKeySelector is provided (bytes4 ABI-encoded as 32 bytes), no need to decode anything
        // Just emit event to confirm verification
        emit OnVerifyPessimisticECDSAMultisig();
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return AGGCHAIN_ECDSA_MULTISIG_VERSION;
    }
}
