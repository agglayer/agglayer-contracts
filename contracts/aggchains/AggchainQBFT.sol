// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

// imports aggLayer
import "../lib/AggchainBase.sol";

/// @custom:implementation
/// @title AggchainQBFT
/// @notice Aggchain implementation for chains that run Hyperledger Besu with QBFT consensus (block-header validator mode)
///         and are attached to the aggLayer. State transitions are proven by an SP1 program that verifies the QBFT
///         commit seals and validator-set votes of the chain's headers, together with the usual bridge constraints.
/// @dev Modelled on AggchainFEP: same AggchainBase, same signers/vkey handling, same aggchain hash. The contract keeps
///      the last proven block and the hash of the consensus state (validators + outstanding votes) after that block.
///      `aggchainParams` is rebuilt from that stored state plus the new state submitted in `aggchainData`, so the proof
///      is bound to the state stored by the previous settlement.
contract AggchainQBFT is AggchainBase {
    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    /// @notice Parameters to initialize the AggchainQBFT contract.
    /// @custom:field startingBlockNumber Block the chain starts settling from, usually 0.
    /// @custom:field startingBlockHash   QBFT on-chain hash of that block.
    /// @custom:field startingValidators  `validators[]` of that block's extraData, sorted ascending.
    /// @custom:field startingOutstandingVotes Outstanding votes of the tally after that block, strictly ascending by
    ///                                   (subject, voter). Must be empty when the block is genesis or an epoch block.
    /// @custom:field chainId             Chain id of the Besu network.
    /// @custom:field epochLength         `qbft.epochlength` from the genesis.
    struct InitParams {
        uint64 startingBlockNumber;
        bytes32 startingBlockHash;
        address[] startingValidators;
        Vote[] startingOutstandingVotes;
        uint64 chainId;
        uint64 epochLength;
    }

    /// @notice A validator-set vote tracked by the QBFT vote tally.
    /// @dev Only used to document and compute the consensus state hash:
    ///      consensusStateHash = keccak256(abi.encode(address[] validators, Vote[] outstanding)).
    /// @custom:field subject Validator the vote is about.
    /// @custom:field voter   Validator that cast the vote.
    /// @custom:field add     True for an add vote, false for a drop vote.
    struct Vote {
        address subject;
        address voter;
        bool add;
    }

    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////

    /// @notice Value to detect which initializer version the contract had previous to the current `reinitializer` call.
    ///         This mechanism is used to migrate chains that have been already initialized as `AggchainECDSAMultisig`
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////

    // Aggchain type selector, hardcoded value used to force the last 2 bytes of aggchain selector to retrieve the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE = 0x0002;

    /// @notice AggchainQBFT semantic version.
    /// @custom:semver v1.0.0
    string public constant AGGCHAIN_QBFT_VERSION = "v1.0.0";

    /// @notice Length in bytes of the abi encoded `aggchainData`:
    ///         (bytes4 aggchainVKeySelector, bytes32 newBlockHash, uint64 newBlockNumber, bytes32 newConsensusStateHash)
    uint256 private constant _AGGCHAIN_DATA_LENGTH = 32 * 4;

    ////////////////////////////////////////////////////////////
    //                       Storage                          //
    ////////////////////////////////////////////////////////////

    /// @notice Last block a settled certificate proved against.
    uint64 public lastProvenBlockNumber;

    /// @notice QBFT on-chain hash of `lastProvenBlockNumber`.
    bytes32 public lastProvenBlockHash;

    /// @notice keccak256(abi.encode(address[] validators, Vote[] outstanding)) after `lastProvenBlockNumber`.
    /// @dev It is the only consensus state kept on L1, the validator list is reconstructed by the prover.
    bytes32 public consensusStateHash;

    /// @notice keccak256(abi.encode(chainId, epochLength, genesisBlockHash)); fixed at initialization.
    bytes32 public chainConfigHash;

    /// @notice Informational copy of the epoch length, also committed inside `chainConfigHash`.
    uint64 public epochLength;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * 5 storage slots used above, 50 slots reserved in total for this contract.
     */
    uint256[45] private __gap;

    ////////////////////////////////////////////////////////////
    //                         Events                         //
    ////////////////////////////////////////////////////////////

    /// @notice Emitted when a QBFT block range is proven and the state advances.
    /// @param newBlockNumber         The new last proven block number.
    /// @param newBlockHash           The QBFT on-chain hash of the new last proven block.
    /// @param newConsensusStateHash  The consensus state hash after the new last proven block.
    event BlockProven(
        uint64 newBlockNumber,
        bytes32 newBlockHash,
        bytes32 newConsensusStateHash
    );

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////

    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    /// @notice Thrown when the new block number is not greater than the last proven block number.
    error BlockNotAdvancing();

    /// @notice Thrown when the new block hash or the new consensus state hash is zero.
    error InvalidAggchainData();

    /// @notice Thrown when the starting validators array is empty.
    error StartingValidatorsCannotBeEmpty();

    /// @notice Thrown when the starting validators are not strictly sorted in ascending order (or contain address zero).
    error StartingValidatorsNotSorted();

    /// @notice Thrown when the starting outstanding votes are not strictly ascending by (subject, voter).
    error OutstandingVotesNotSorted();

    /// @notice Thrown when a starting outstanding vote was cast by an address that is not a starting validator.
    error OutstandingVoteFromNonValidator();

    /// @notice Thrown when there are starting outstanding votes at genesis or at an epoch block.
    error OutstandingVotesMustBeEmptyAtEpoch();

    /// @notice Thrown when the starting block hash is zero.
    error StartingBlockHashCannotBeZero();

    /// @notice Thrown when the epoch length is zero.
    error EpochLengthMustBeGreaterThanZero();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    /// @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        _initializerVersion = _getInitializedVersion();
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////

    /// @notice Constructor AggchainQBFT contract
    /// @param _globalExitRootManager Global exit root manager address
    /// @param _pol POL token address
    /// @param _bridgeAddress Bridge address
    /// @param _rollupManager Rollup manager address
    /// @param _aggLayerGateway agglayer gateway address
    constructor(
        IAgglayerGER _globalExitRootManager,
        IERC20Upgradeable _pol,
        IAgglayerBridge _bridgeAddress,
        AgglayerManager _rollupManager,
        IAgglayerGateway _aggLayerGateway
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

    /// @notice Initialize function for fresh deployment
    /// @custom:security Initializes all contracts including PolygonConsensusBase
    /// @dev reinitializer(3) keeps the same initializer numbering as AggchainFEP, so the ECDSA multisig
    ///      migration (which starts from initializer version 2) can use the same version.
    /// @param _initParams The initialization parameters for QBFT
    /// @param _signersToAdd Array of signers to add to the multisig
    /// @param _newThreshold New threshold for multisig operations
    /// @param _useDefaultVkeys Whether to use default verification keys from gateway
    /// @param _useDefaultSigners Whether to use default signers from gateway
    /// @param _initOwnedAggchainVKey The owned aggchain verification key
    /// @param _initAggchainVKeySelector The aggchain verification key selector
    /// @param _admin The admin address
    /// @param _trustedSequencer The trusted sequencer address
    /// @param _gasTokenAddress The gas token address
    /// @param _trustedSequencerURL The trusted sequencer URL
    /// @param _networkName The network name
    function initialize(
        InitParams memory _initParams,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold,
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _admin,
        address _trustedSequencer,
        address _gasTokenAddress,
        string memory _trustedSequencerURL,
        string memory _networkName
    ) external onlyAggchainManager getInitializedVersion reinitializer(3) {
        if (_initializerVersion != 0) {
            revert InvalidInitializer();
        }

        // Check the use default vkeys is consistent
        _validateVKeysConsistency(
            _useDefaultVkeys,
            _initAggchainVKeySelector,
            _initOwnedAggchainVKey,
            AGGCHAIN_TYPE
        );

        // Set aggchainBase variables
        _initializeAggchainBaseAndConsensusBase(
            _admin,
            _trustedSequencer,
            _gasTokenAddress,
            _trustedSequencerURL,
            _networkName,
            _useDefaultVkeys,
            _useDefaultSigners,
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );

        // init QBFT params
        _initializeAggchain(_initParams);

        // Check the used default signers is consistent
        if (_useDefaultSigners) {
            if (_signersToAdd.length != 0 || threshold != 0) {
                revert ConflictingDefaultSignersConfiguration();
            }
        } else {
            // update signers and threshold
            _updateSignersAndThreshold(
                new RemoveSignerInfo[](0), // No signers to remove
                _signersToAdd,
                _newThreshold
            );
        }
    }

    /**
     * @notice Initialize function for upgrade from AggchainECDSAMultisig to AggchainQBFT
     * @custom:security Only initializes QBFT specific parameters, assumes base and consensus are already initialized
     * @dev Keeps the existing admin, signers, threshold and vkey flags. The starting block is the last L2 block of the
     *      last settled ECDSA certificate. Owned vkeys are not touched: the aggchain manager must add the QBFT owned
     *      vkey (or enable the default vkeys flag) afterwards.
     * @param _initParams The initialization parameters for QBFT
     */
    function initializeFromECDSAMultisig(
        InitParams memory _initParams
    ) external onlyAggchainManager getInitializedVersion reinitializer(3) {
        // Only callable on a contract that finished the v2 initialization (AggchainECDSAMultisig)
        if (_initializerVersion != 2) {
            revert InvalidInitializer();
        }

        // init QBFT params
        _initializeAggchain(_initParams);
    }

    /**
     * @notice Initializer AggchainQBFT storage
     * @dev Internal function to set up QBFT-specific parameters. Validates all parameters before setting.
     * @param _initParams The initialization parameters for the contract
     */
    function _initializeAggchain(InitParams memory _initParams) internal {
        if (_initParams.startingValidators.length == 0) {
            revert StartingValidatorsCannotBeEmpty();
        }

        if (_initParams.startingBlockHash == bytes32(0)) {
            revert StartingBlockHashCannotBeZero();
        }

        if (_initParams.epochLength == 0) {
            revert EpochLengthMustBeGreaterThanZero();
        }

        // The consensus state hash commits to the validators sorted ascending: reject a list the prover could never match
        address previousValidator = address(0);
        for (uint256 i = 0; i < _initParams.startingValidators.length; i++) {
            address validator = _initParams.startingValidators[i];
            if (validator <= previousValidator) {
                revert StartingValidatorsNotSorted();
            }
            previousValidator = validator;
        }

        // Outstanding votes are cleared by every epoch block (and are empty at genesis)
        Vote[] memory votes = _initParams.startingOutstandingVotes;
        if (
            votes.length != 0 &&
            _initParams.startingBlockNumber % _initParams.epochLength == 0
        ) {
            revert OutstandingVotesMustBeEmptyAtEpoch();
        }

        // Votes must be canonical (strictly ascending by (subject, voter)) and cast by a current validator
        for (uint256 i = 0; i < votes.length; i++) {
            if (i != 0) {
                Vote memory prev = votes[i - 1];
                if (
                    votes[i].subject < prev.subject ||
                    (votes[i].subject == prev.subject &&
                        votes[i].voter <= prev.voter)
                ) {
                    revert OutstandingVotesNotSorted();
                }
            }
            bool isValidator = false;
            for (
                uint256 j = 0;
                j < _initParams.startingValidators.length;
                j++
            ) {
                if (_initParams.startingValidators[j] == votes[i].voter) {
                    isValidator = true;
                    break;
                }
            }
            if (!isValidator) {
                revert OutstandingVoteFromNonValidator();
            }
        }

        lastProvenBlockNumber = _initParams.startingBlockNumber;
        lastProvenBlockHash = _initParams.startingBlockHash;

        consensusStateHash = keccak256(
            abi.encode(_initParams.startingValidators, votes)
        );

        chainConfigHash = keccak256(
            abi.encode(
                _initParams.chainId,
                _initParams.epochLength,
                _initParams.startingBlockHash
            )
        );
        epochLength = _initParams.epochLength;
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////

    /// @dev Validates the provided aggchain data and returns the computed aggchain parameters and vkey
    ///
    ///     aggchain_params:
    ///     Field:           | prevBlockHash | prevConsensusHash | newBlockHash | newBlockNumber | newConsensusHash | chainConfigHash |
    ///     length (bits):   | 256           | 256               | 256          | 64             | 256              | 256             |
    ///
    /// @param aggchainData custom bytes provided by the chain, encoded in ABI solidity format
    ///     aggchainData:
    ///     Field:                  | _aggchainVKeySelector | _newBlockHash | _newBlockNumber | _newConsensusStateHash |
    ///     length (bits):          | 32                    | 256           | 64              | 256                    |
    ///     ABI encoding (bits):    | 256                   | 256           | 256             | 256                    |
    ///
    /// aggchainData._aggchainVKeySelector First 4 bytes of the aggchain vkey selector
    /// aggchainData._newBlockHash QBFT on-chain hash of the new last proven block
    /// aggchainData._newBlockNumber New last proven block number
    /// aggchainData._newConsensusStateHash Consensus state hash after the new last proven block
    ///
    /// @return aggchainVKey The aggchain verification key decoded from the input data
    /// @return aggchainParams The computed aggchain parameters hash
    /// @inheritdoc AggchainBase
    function getVKeyAndAggchainParams(
        bytes memory aggchainData
    ) public view override returns (bytes32, bytes32) {
        if (aggchainData.length != _AGGCHAIN_DATA_LENGTH) {
            revert InvalidAggchainDataLength();
        }

        // decode the aggchainData
        (
            bytes4 _aggchainVKeySelector,
            bytes32 _newBlockHash,
            uint64 _newBlockNumber,
            bytes32 _newConsensusStateHash
        ) = abi.decode(aggchainData, (bytes4, bytes32, uint64, bytes32));

        // Check the aggchainType embedded in the _aggchainVKeySelector is valid
        if (
            getAggchainTypeFromSelector(_aggchainVKeySelector) != AGGCHAIN_TYPE
        ) {
            revert InvalidAggchainType();
        }

        // check the block number advances
        if (_newBlockNumber <= lastProvenBlockNumber) {
            revert BlockNotAdvancing();
        }

        // check non-zero hashes
        if (
            _newBlockHash == bytes32(0) || _newConsensusStateHash == bytes32(0)
        ) {
            revert InvalidAggchainData();
        }

        bytes32 aggchainParams = keccak256(
            abi.encodePacked(
                lastProvenBlockHash,
                consensusStateHash,
                _newBlockHash,
                _newBlockNumber,
                _newConsensusStateHash,
                chainConfigHash
            )
        );

        return (getAggchainVKey(_aggchainVKeySelector), aggchainParams);
    }

    ////////////////////////////////////////////////////////////
    //         Functions: rollup manager callback             //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Callback when pessimistic proof is verified, can only be called by the rollup manager
     * @dev Stores the new proven state. The rollup manager calls `getAggchainHash` (and therefore
     *      `getVKeyAndAggchainParams`, which validates the data against the pre-settlement state) before this callback.
     * @param aggchainData Custom data provided by the chain containing the new block hash, number and consensus state hash
     */
    function onVerifyPessimistic(
        bytes memory aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != _AGGCHAIN_DATA_LENGTH) {
            revert InvalidAggchainDataLength();
        }

        // decode the aggchainData
        (
            ,
            bytes32 _newBlockHash,
            uint64 _newBlockNumber,
            bytes32 _newConsensusStateHash
        ) = abi.decode(aggchainData, (bytes4, bytes32, uint64, bytes32));

        lastProvenBlockNumber = _newBlockNumber;
        lastProvenBlockHash = _newBlockHash;
        consensusStateHash = _newConsensusStateHash;

        emit BlockProven(
            _newBlockNumber,
            _newBlockHash,
            _newConsensusStateHash
        );
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return AGGCHAIN_QBFT_VERSION;
    }
}
