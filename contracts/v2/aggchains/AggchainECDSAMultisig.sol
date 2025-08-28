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
    bytes2 public constant AGGCHAIN_TYPE = 0x0000;

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
     * @notice Initialize the AggchainECDSAMultisig contract
     * @param _admin Admin address
     * @param _trustedSequencer Trusted sequencer address
     * @param _gasTokenAddress Gas token address
     * @param _trustedSequencerURL Trusted sequencer URL
     * @param _networkName Network name
     * @param _signersToAdd Array of signers to add
     * @param _newThreshold New threshold for multisig operations
     * @custom:security First initialization takes into account this contracts and all the inheritance contracts
     *                  This function can only be called when the contract is first deployed (version 0)
     * @dev The reinitializer(2) is set to support the upgrade from PolygonPessimisticConsensus to AggchainECDSAMultisig, where PolygonPessimisticConsensus is already initialized
     */
    function initialize(
        address _admin,
        address _trustedSequencer,
        address _gasTokenAddress,
        string memory _trustedSequencerURL,
        string memory _networkName,
        bool _useDefaultSigners,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) external onlyAggchainManager getInitializedVersion reinitializer(2) {
        if (_initializerVersion != 0) {
            revert InvalidInitializer();
        }

        // initOwnedAggchainVKey, initAggchainVKeySelector, and useDefaultVkeys are not used in this aggchain.
        _initializeAggchainBaseAndConsensusBase(
            _admin,
            _trustedSequencer,
            _gasTokenAddress,
            _trustedSequencerURL,
            _networkName,
            false, // useDefaultVkeys
            _useDefaultSigners,
            bytes32(0), // initOwnedAggchainVKey
            bytes4(0) // initAggchainVKeySelector
        );

        // update signers and threshold
        _updateSignersAndThreshold(
            new RemoveSignerInfo[](0), // No signers to remove
            _signersToAdd,
            _newThreshold
        );
    }

    /**
     * @notice Migrates from PolygonPessimisticConsensus to AggchainECDSAMultisig
     * @dev This function is called when upgrading from a PolygonPessimisticConsensus contract
     *      It sets up the initial multisig configuration using the existing admin and trustedSequencer
     *      Sets the threshold to 1 and adds the trustedSequencer as the initial signer
     */
    function migrateFromPessimisticConsensus()
        external
        onlyRollupManager
        getInitializedVersion
        reinitializer(2)
    {
        if (_initializerVersion != 1) {
            revert InvalidInitializer();
        }

        // aggchainManager
        aggchainManager = admin;

        // set signer to trustedSequencer and threshold to 1
        // handle trustedSequencerURL as empty string
        if (bytes(trustedSequencerURL).length == 0) {
            _addSignerInternal(trustedSequencer, "NO_URL"); // cannot be empty string
        } else {
            _addSignerInternal(trustedSequencer, trustedSequencerURL);
        }
        threshold = 1;

        // update aggchainSignersHash
        _updateAggchainSignersHash();
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
        if (aggchainData.length != 0) {
            revert InvalidAggchainDataLength();
        }

        // aggchainParams is not used in this implementation (signersHash and threshold are added directly in base)
        return (bytes32(0), bytes32(0));
    }

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /// @inheritdoc IAggchainBase
    function onVerifyPessimistic(
        bytes calldata aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != 0) {
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
