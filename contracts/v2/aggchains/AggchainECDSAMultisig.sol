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
    //                       Storage                          //
    ////////////////////////////////////////////////////////////
    /// @notice Array of multisig signers
    address[] public signers;

    /// @notice Mapping to check if an address is a signer (gas optimization)
    mapping(address => bool) public isSignerMapping;

    /// @notice Threshold required for multisig operations
    uint32 public threshold;

    /// @notice Hash of the current signers array
    bytes32 public signersHash;

    ////////////////////////////////////////////////////////////
    //                       Events                           //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Emitted when Pessimistic proof is verified.
     */
    event OnVerifyPessimisticECDSAMultisig();

    /**
     * @notice Emitted when a signer is added to the multisig.
     * @param signer The address that was added as a signer.
     */
    event SignerAdded(address indexed signer);

    /**
     * @notice Emitted when a signer is removed from the multisig.
     * @param signer The address that was removed as a signer.
     */
    event SignerRemoved(address indexed signer);

    /**
     * @notice Emitted when the threshold is updated.
     * @param oldThreshold The previous threshold value.
     * @param newThreshold The new threshold value.
     */
    event ThresholdUpdated(uint32 oldThreshold, uint32 newThreshold);

    /**
     * @notice Emitted when the signers hash is updated.
     * @param newSignersHash The new hash of the signers array.
     */
    event SignersHashUpdated(bytes32 newSignersHash);

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////
    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    /// @notice Thrown when threshold is zero or greater than the number of signers.
    error InvalidThreshold();

    /// @notice Thrown when trying to add a signer that already exists.
    error SignerAlreadyExists();

    /// @notice Thrown when trying to remove a signer that doesn't exist.
    error SignerDoesNotExist();

    /// @notice Thrown when the signers array is empty.
    error EmptySignersArray();

    /// @notice Thrown when threshold would be greater than signers count after removal.
    error ThresholdTooHighAfterRemoval();

    /// @notice Thrown when trying to add a zero address as a signer.
    error SignerCannotBeZero();

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
                address[] memory _initialSigners,
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

            // Check the aggchainType embedded the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // Initialize multisig parameters
            _initializeMultisig(_initialSigners, _threshold);

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
                _vKeyManager
            );
        } else if (_initializerVersion == 1) {
            // Only need to initialize values that are specific for ECDSA Multisig because we are performing an upgrade from a Pessimistic Consensus
            (
                // multisig specific params
                address[] memory _initialSigners,
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

            // Check the aggchainType embedded the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // Initialize multisig parameters
            _initializeMultisig(_initialSigners, _threshold);

            // Set aggchainBase variables
            _initializeAggchainBase(
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager
            );
        } else {
            // This case should never happen because reinitializer is 2 so initializer version is 0 or 1, but it's here to avoid any possible future issue if the reinitializer version is increased
            revert InvalidInitializer();
        }
    }

    /**
     * @notice Initialize multisig parameters
     * @param _initialSigners Array of initial signer addresses
     * @param _threshold Required threshold for multisig operations
     */
    function _initializeMultisig(
        address[] memory _initialSigners,
        uint32 _threshold
    ) internal {
        if (_initialSigners.length == 0) {
            revert EmptySignersArray();
        }

        if (_threshold == 0 || _threshold > _initialSigners.length) {
            revert InvalidThreshold();
        }

        // Set signers array
        for (uint256 i = 0; i < _initialSigners.length; i++) {
            // Use internal function to add signer (duplicate check handled by _addSignerInternal)
            _addSignerInternal(_initialSigners[i]);
        }

        threshold = _threshold;
        _updateSignersHash();
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////
    /// @notice Callback while pessimistic proof is being verified from the rollup manager
    /// @notice Returns the aggchain hash for a given aggchain data
    ///
    ///     aggchain_hash:
    ///     Field:           | CONSENSUS_TYPE | aggchain_vkey  | aggchain_params  |
    ///     length (bits):   | 32             | 256            | 256              |
    ///
    ///     aggchain_params:
    ///     Field:           | signersHash    | threshold      |
    ///     length (bits):   | 256            | 32             |
    ///
    /// @param aggchainData custom bytes provided by the chain
    ///     aggchainData:
    ///     Field:           | _aggchainVKeySelector |
    ///     length (bits):   | 32                    |
    ///
    /// aggchainData._aggchainVKeySelector 4 bytes aggchain vkey selector (ABI-encoded as 32 bytes)
    ///
    /// @return aggchainHash resulting aggchain hash
    /// @inheritdoc IAggchainBase
    function getAggchainHash(
        bytes memory aggchainData
    ) external view returns (bytes32) {
        if (aggchainData.length != 32) {
            revert InvalidAggchainDataLength();
        }

        // Only aggchainVKeySelector is required (bytes4 ABI-encoded as 32 bytes)
        bytes4 aggchainVKeySelector = abi.decode(aggchainData, (bytes4));

        if (
            getAggchainTypeFromSelector(aggchainVKeySelector) != AGGCHAIN_TYPE
        ) {
            revert InvalidAggchainType();
        }

        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    getAggchainVKey(aggchainVKeySelector),
                    keccak256(abi.encodePacked(signersHash, threshold))
                )
            );
    }

    /**
     * @notice Get the number of signers
     * @return Number of signers in the multisig
     */
    function getSignersCount() external view returns (uint256) {
        return signers.length;
    }

    /**
     * @notice Get all signers
     * @return Array of signer addresses
     */
    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    /**
     * @notice Check if an address is a signer
     * @param _signer Address to check
     * @return True if the address is a signer
     */
    function isSigner(address _signer) external view returns (bool) {
        return isSignerMapping[_signer];
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

    ////////////////////////////////////////////////////////////
    //              AggchainManager Functions                 //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Add multiple new signers to the multisig
     * @param _signers Array of addresses of the new signers
     */
    function addMultiSigners(
        address[] calldata _signers
    ) external onlyAggchainManager {
        if (_signers.length == 0) {
            revert EmptySignersArray();
        }

        // Add all signers without updating hash each time
        for (uint256 i = 0; i < _signers.length; i++) {
            // Duplicate check handled by _addSignerInternal
            _addSignerInternal(_signers[i]);
        }

        // Update hash once after all signers are added
        _updateSignersHash();
    }

    /**
     * @notice Add a single new signer to the multisig
     * @param _signer Address of the new signer
     */
    function addSigner(address _signer) external onlyAggchainManager {
        _addSignerInternal(_signer);
        _updateSignersHash();
    }

    /**
     * @notice Remove a signer from the multisig
     * @param _signer Address of the signer to remove
     * @param _signerIndex Index of the signer in the signers array
     */
    function removeSigner(
        address _signer,
        uint256 _signerIndex
    ) external onlyAggchainManager {
        // Check array is not empty
        if (signers.length == 0) {
            revert SignerDoesNotExist();
        }

        // Check that threshold won't be greater than remaining signers
        if (threshold > signers.length - 1) {
            revert ThresholdTooHighAfterRemoval();
        }

        _removeSignerInternal(_signer, _signerIndex);
        _updateSignersHash();
    }

    /**
     * @notice Update the threshold for multisig operations
     * @param _newThreshold New threshold value
     */
    function updateThreshold(
        uint32 _newThreshold
    ) external onlyAggchainManager {
        if (_newThreshold == 0 || _newThreshold > signers.length) {
            revert InvalidThreshold();
        }

        uint32 oldThreshold = threshold;
        threshold = _newThreshold;

        emit ThresholdUpdated(oldThreshold, _newThreshold);
    }

    ////////////////////////////////////////////////////////////
    //                   Internal Functions                   //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Internal function to add a signer with validation
     * @param _signer Address of the signer to add
     */
    function _addSignerInternal(address _signer) internal {
        if (_signer == address(0)) {
            revert SignerCannotBeZero();
        }

        if (isSignerMapping[_signer]) {
            revert SignerAlreadyExists();
        }

        signers.push(_signer);
        isSignerMapping[_signer] = true;
        emit SignerAdded(_signer);
    }

    /**
     * @notice Internal function to remove a signer with validation
     * @param _signer Address of the signer to remove
     * @param _signerIndex Index of the signer in the signers array
     */
    function _removeSignerInternal(
        address _signer,
        uint256 _signerIndex
    ) internal {
        // Validate input parameters
        if (_signerIndex >= signers.length) {
            revert SignerDoesNotExist();
        }

        if (signers[_signerIndex] != _signer) {
            revert SignerDoesNotExist();
        }

        // sanity check the signer is in the mapping
        if (!isSignerMapping[_signer]) {
            revert SignerDoesNotExist();
        }

        // Remove from mapping
        isSignerMapping[_signer] = false;

        // Move the last element to the deleted spot and remove the last element
        signers[_signerIndex] = signers[signers.length - 1];
        signers.pop();

        emit SignerRemoved(_signer);
    }

    /**
     * @notice Update the hash of the signers array
     */
    function _updateSignersHash() internal {
        signersHash = keccak256(abi.encodePacked(signers));
        emit SignersHashUpdated(signersHash);
    }
}
