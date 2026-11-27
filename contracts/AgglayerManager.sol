// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "./interfaces/IAgglayerGER.sol";
import "./interfaces/IPolygonZkEVMBridge.sol";
import "./interfaces/IPolygonRollupBase.sol";
import "./lib/EmergencyManager.sol";
import "@openzeppelin/contracts-upgradeable4/token/ERC20/utils/SafeERC20Upgradeable.sol";
// @dev For ReentrancyGuardTransient there is no difference between upgradable and not upgradable contracts
import "@openzeppelin/contracts52/utils/ReentrancyGuardTransient.sol";
import "./lib/PolygonTransparentProxy.sol";
import "./lib/PolygonAccessControlUpgradeable.sol";
import "./lib/LegacyZKEVMStateVariables.sol";
import "./lib/PolygonConstantsBase.sol";
import "./interfaces/IAgglayerManager.sol";
import "./interfaces/IAggchainBase.sol";
import "./interfaces/IAgglayerGateway.sol";
import "./interfaces/IVersion.sol";
import "./lib/Hashes.sol";

/**
 * Contract responsible for managing rollups and the verification of their pessimistic proofs.
 * This contract will create and update rollups (aggchains) and verify their state transitions through the AgglayerGateway.
 * @dev Legacy StateTransition rollups can no longer sequence nor verify batches: they can only roll back
 * their unverified batches and migrate to ALGateway through `initMigration`.
 * Their data is kept in storage and exposed through the view functions for backwards compatibility.
 */
contract AgglayerManager is
    PolygonAccessControlUpgradeable,
    EmergencyManager,
    LegacyZKEVMStateVariables,
    PolygonConstantsBase,
    IAgglayerManager,
    ReentrancyGuardTransient,
    IVersion
{
    /**
     * @notice Struct which to store the rollup type data
     * @param consensusImplementation Consensus implementation ( contains the consensus logic for the transparent proxy)
     * @param address verifier
     * @param forkID fork ID
     * @param rollupVerifierType Rollup compatibility ID, to check upgradability between rollup types
     * @param obsolete Indicates if the rollup type is obsolete
     * @param genesis Genesis block of the rollup, note that will only be used on creating new rollups, not upgrade them
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    struct RollupType {
        address consensusImplementation;
        address verifier;
        uint64 forkID;
        /// @custom:oz-renamed-from rollupCompatibilityID
        /// @custom:oz-retyped-from uint8
        VerifierType rollupVerifierType;
        bool obsolete;
        bytes32 genesis;
        bytes32 programVKey;
    }

    /**
     * @notice Struct which to store the rollup data of each chain
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param batchNumToStateRoot State root mapping
     * @param sequencedBatches Queue of batches that defines the virtual state
     * @param _legacyPendingStateTransitions Pending state mapping (deprecated)
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param _legacyLastPendingState Last pending state (deprecated)
     * @param _legacyLastPendingStateConsolidated Last pending state consolidated (deprecated)
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupVerifierType Rollup ID used for compatibility checks when upgrading
     * @param lastPessimisticRoot Pessimistic info, currently contains the local balance tree and the local nullifier tree hashed
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    struct RollupData {
        address rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        mapping(uint64 batchNum => bytes32) batchNumToStateRoot;
        mapping(uint64 batchNum => SequencedBatchData) sequencedBatches;
        /// @custom:oz-renamed-from pendingStateTransitions
        mapping(uint256 pendingStateNum => PendingState) _legacyPendingStateTransitions;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        /// @custom:oz-renamed-from lastPendingState
        uint64 _legacyLastPendingState;
        /// @custom:oz-renamed-from lastPendingStateConsolidated
        uint64 _legacyLastPendingStateConsolidated;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        /// @custom:oz-renamed-from rollupCompatibilityID
        /// @custom:oz-retyped-from uint8
        VerifierType rollupVerifierType;
        bytes32 lastPessimisticRoot;
        bytes32 programVKey;
    }

    /**
     * @notice Struct to return all the necessary rollup info: VerifierType StateTransition
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param _legacyLastPendingState Last pending state (deprecated)
     * @param _legacyLastPendingStateConsolidated Last pending state consolidated (deprecated)
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupVerifierType Rollup ID used for compatibility checks when upgrading
     */
    struct RollupDataReturn {
        address rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 _legacyLastPendingState;
        uint64 _legacyLastPendingStateConsolidated;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        VerifierType rollupVerifierType;
    }

    /**
     * @notice Struct which to store the rollup data of each chain
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupVerifierType Rollup ID used for compatibility checks when upgrading
     * @param lastPessimisticRoot Pessimistic info, currently contains the local balance tree and the local nullifier tree hashed
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    struct RollupDataReturnV2 {
        address rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        VerifierType rollupVerifierType;
        bytes32 lastPessimisticRoot;
        bytes32 programVKey;
    }

    // Exit merkle tree levels
    uint256 internal constant _EXIT_TREE_DEPTH = 32;

    // Roles

    // Be able to add a new rollup type
    bytes32 internal constant _ADD_ROLLUP_TYPE_ROLE =
        keccak256("ADD_ROLLUP_TYPE_ROLE");

    // Be able to obsolete a rollup type, which means that new rollups cannot use this type
    bytes32 internal constant _OBSOLETE_ROLLUP_TYPE_ROLE =
        keccak256("OBSOLETE_ROLLUP_TYPE_ROLE");

    // Be able to create a new rollup using a rollup type
    bytes32 internal constant _CREATE_ROLLUP_ROLE =
        keccak256("CREATE_ROLLUP_ROLE");

    // Be able to create a new rollup which does not have to follow any rollup type.
    // Also sets the genesis block for that network
    bytes32 internal constant _ADD_EXISTING_ROLLUP_ROLE =
        keccak256("ADD_EXISTING_ROLLUP_ROLE");

    // Be able to update a rollup to a new rollup type that it's compatible
    bytes32 internal constant _UPDATE_ROLLUP_ROLE =
        keccak256("UPDATE_ROLLUP_ROLE");

    // Be able to that has priority to verify batches and consolidates the state instantly
    bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE =
        keccak256("TRUSTED_AGGREGATOR_ROLE");

    // Be able to set the trusted aggregator address
    bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE_ADMIN =
        keccak256("TRUSTED_AGGREGATOR_ROLE_ADMIN");

    // Be able to stop the emergency state
    bytes32 internal constant _STOP_EMERGENCY_ROLE =
        keccak256("STOP_EMERGENCY_ROLE");

    // Be able to activate the emergency state without any further condition
    bytes32 internal constant _EMERGENCY_COUNCIL_ROLE =
        keccak256("EMERGENCY_COUNCIL_ROLE");

    // Be able to set the emergency council address
    bytes32 internal constant _EMERGENCY_COUNCIL_ADMIN =
        keccak256("EMERGENCY_COUNCIL_ADMIN");

    // Current rollup manager version
    string public constant ROLLUP_MANAGER_VERSION = "v2.0.0";

    // Hardcoded address used to indicate that this address triggered in an event should not be considered as valid.
    address private constant _NO_ADDRESS =
        0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;

    // Global Exit Root address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerGER public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IPolygonZkEVMBridge public immutable bridgeAddress;

    // POL token address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20Upgradeable public immutable pol;

    // Polygon Verifier Gateway address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerGateway public immutable aggLayerGateway;

    // Number of rollup types added, every new type will be assigned sequentially a new ID
    uint32 public rollupTypeCount;

    // Rollup type mapping
    /// @custom:oz-retyped-from PolygonRollupManagerPrevious.RollupType
    mapping(uint32 rollupTypeID => RollupType) public rollupTypeMap;

    // Number of rollups added, every new rollup will be assigned sequentially a new ID
    uint32 public rollupCount;

    // Rollups ID mapping
    /// @custom:oz-retyped-from PolygonRollupManagerPrevious.RollupData
    mapping(uint32 rollupID => RollupData) internal _rollupIDToRollupData;

    // Rollups address mapping
    mapping(address rollupAddress => uint32 rollupID) public rollupAddressToID;

    // Chain ID mapping for nullifying
    // note we will take care to avoid that current known chainIDs are not reused in our networks (example: 1)
    mapping(uint64 chainID => uint32 rollupID) public chainIDToRollupID;

    // Total sequenced batches across all rollups (deprecated: batches are no longer sequenced)
    /// @custom:oz-renamed-from totalSequencedBatches
    uint64 internal __legacyTotalSequencedBatches;

    // Total verified batches across all rollups (deprecated: batches are no longer verified)
    /// @custom:oz-renamed-from totalVerifiedBatches
    uint64 internal __legacyTotalVerifiedBatches;

    // Last timestamp when an aggregation happen
    uint64 public lastAggregationTimestamp;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    /// @custom:oz-renamed-from trustedAggregatorTimeout
    uint64 internal __legacyTrustedAggregatorTimeout;

    // Once a pending state exceeds this timeout it can be consolidated (deprecated)
    /// @custom:oz-renamed-from pendingStateTimeout
    uint64 internal __legacyPendingStateTimeout;

    // Time target of the verification of a batch
    // Adaptively the batchFee will be updated to achieve this target
    /// @custom:oz-renamed-from verifyBatchTimeTarget
    uint64 internal __legacyVerifyBatchTimeTarget;

    // Batch fee multiplier with 3 decimals that goes from 1000 - 1023
    /// @custom:oz-renamed-from multiplierBatchFee
    uint16 internal __legacyMultiplierBatchFee;

    // POL fee per batch sequenced (deprecated: batches are no longer sequenced)
    /// @custom:oz-renamed-from _batchFee
    uint256 internal __legacyBatchFee;

    // Timestamp when the last emergency state was deactivated
    uint64 public lastDeactivatedEmergencyStateTimestamp;

    // Mapping to track chains in migration
    mapping(uint32 rollupID => bool) public isRollupMigrating;

    /**
     * @dev Emitted when a new rollup type is added
     */
    event AddNewRollupType(
        uint32 indexed rollupTypeID,
        address consensusImplementation,
        address verifier,
        uint64 forkID,
        VerifierType rollupVerifierType,
        bytes32 genesis,
        string description,
        bytes32 programVKey
    );

    /**
     * @dev Emitted when a a rollup type is obsoleted
     */
    event ObsoleteRollupType(uint32 indexed rollupTypeID);

    /**
     * @dev Emitted when a new rollup is created based on a rollupType
     */
    event CreateNewRollup(
        uint32 indexed rollupID,
        uint32 rollupTypeID,
        address rollupAddress,
        uint64 chainID,
        address gasTokenAddress
    );

    /**
     * @dev Emitted when an existing rollup is added
     */
    event AddExistingRollup(
        uint32 indexed rollupID,
        uint64 forkID,
        address rollupAddress,
        uint64 chainID,
        VerifierType rollupVerifierType,
        uint64 lastVerifiedBatchBeforeUpgrade,
        bytes32 programVKey,
        bytes32 initPessimisticRoot
    );

    /**
     * @dev Emitted when a rollup is updated
     */
    event UpdateRollup(
        uint32 indexed rollupID,
        uint32 newRollupTypeID,
        uint64 lastVerifiedBatchBeforeUpgrade
    );

    /**
     * @dev Emitted when the trusted aggregator verifies a pessimistic proof, kept for backwards compatibility
     */
    event VerifyBatchesTrustedAggregator(
        uint32 indexed rollupID,
        uint64 numBatch,
        bytes32 stateRoot,
        bytes32 exitRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when rollback batches
     */
    event RollbackBatches(
        uint32 indexed rollupID,
        uint64 indexed targetBatch,
        bytes32 accInputHashToRollback
    );

    /**
     * @dev Emitted when rollup manager is upgraded
     */
    event UpdateRollupManagerVersion(string rollupManagerVersion);

    /**
     * @notice Emitted when a ALGateway or Pessimistic chain verifies a pessimistic proof
     * @param rollupID Rollup ID
     * @param prevPessimisticRoot Previous pessimistic root
     * @param newPessimisticRoot New pessimistic root
     * @param prevLocalExitRoot Previous local exit root
     * @param newLocalExitRoot New local exit root
     * @param l1InfoRoot L1 info root
     * @param trustedAggregator Trusted aggregator address
     */
    event VerifyPessimisticStateTransition(
        uint32 indexed rollupID,
        bytes32 prevPessimisticRoot,
        bytes32 newPessimisticRoot,
        bytes32 prevLocalExitRoot,
        bytes32 newLocalExitRoot,
        bytes32 l1InfoRoot,
        address indexed trustedAggregator
    );

    /**
     * @dev Emitted when a new rollup is created based on a rollupType
     */
    event CreateNewAggchain(
        uint32 indexed rollupID,
        uint32 rollupTypeID,
        address rollupAddress,
        uint64 chainID,
        uint8 rollupVerifierType,
        bytes initializeBytesAggchain
    );

    /**
     * @dev Emitted when `initMigration` is called
     * @param rollupID Rollup ID that is being migrated
     * @param newRollupTypeID New rollup type ID that the rollup will be migrated to
     */
    event InitMigration(uint32 indexed rollupID, uint32 newRollupTypeID);

    /**
     * @dev Emitted when a rollup completes the migration to Pessimistic or ALGateway, just after proving bootstrapped batch
     * @param rollupID Rollup ID that completed the migration
     */
    event CompletedMigration(uint32 indexed rollupID);

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _aggLayerGateway Polygon Verifier Gateway address
     */
    constructor(
        IAgglayerGER _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridge _bridgeAddress,
        IAgglayerGateway _aggLayerGateway
    ) {
        // Check non zero inputs
        if (
            address(_globalExitRootManager) == address(0) ||
            address(_pol) == address(0) ||
            address(_bridgeAddress) == address(0) ||
            address(_aggLayerGateway) == address(0)
        ) {
            revert InvalidConstructorInputs();
        }
        globalExitRootManager = _globalExitRootManager;
        pol = _pol;
        bridgeAddress = _bridgeAddress;
        aggLayerGateway = _aggLayerGateway;

        // Disable initializers on the implementation following the best practices
        _disableInitializers();
    }

    /**
     * Initializer function to set new rollup manager version
     */
    function initialize() external virtual reinitializer(6) {
        emit UpdateRollupManagerVersion(ROLLUP_MANAGER_VERSION);
    }

    ///////////////////////////////////////
    // Rollups management functions
    ///////////////////////////////////////

    ////////////////
    // Rollups Types
    ////////////////

    /**
     * @notice Add a new rollup type
     * @param consensusImplementation Consensus implementation
     * @param verifier Verifier address
     * @param forkID ForkID of the verifier
     * @param rollupVerifierType rollup verifier type
     * @param genesis Genesis block of the rollup
     * @param description Description of the rollup type
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    function addNewRollupType(
        address consensusImplementation,
        address verifier,
        uint64 forkID,
        VerifierType rollupVerifierType,
        bytes32 genesis,
        string memory description,
        bytes32 programVKey
    ) external onlyRole(_ADD_ROLLUP_TYPE_ROLE) {
        // Check proposed address is not this contract to avoid self-referential loops causing infinite delegate calls
        if (consensusImplementation == address(this)) {
            revert InvalidImplementationAddress();
        }

        // Only ALGateway rollup types can be added: VerifierType.StateTransition and VerifierType.Pessimistic are deprecated
        // Those params should be zero for ALGateway rollup types
        if (
            rollupVerifierType != VerifierType.ALGateway ||
            verifier != address(0) ||
            forkID != 0 ||
            genesis != bytes32(0) ||
            programVKey != bytes32(0)
        ) revert InvalidRollupType();

        uint32 rollupTypeID = ++rollupTypeCount;

        rollupTypeMap[rollupTypeID] = RollupType({
            consensusImplementation: consensusImplementation,
            verifier: verifier,
            forkID: forkID,
            rollupVerifierType: rollupVerifierType,
            obsolete: false,
            genesis: genesis,
            programVKey: programVKey
        });

        emit AddNewRollupType(
            rollupTypeID,
            consensusImplementation,
            verifier,
            forkID,
            rollupVerifierType,
            genesis,
            description,
            programVKey
        );
    }

    /**
     * @notice Obsolete Rollup type
     * @param rollupTypeID Rollup type to obsolete
     */
    function obsoleteRollupType(
        uint32 rollupTypeID
    ) external onlyRole(_OBSOLETE_ROLLUP_TYPE_ROLE) {
        // Check that rollup type exists
        if (rollupTypeID == 0 || rollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }

        // Check rollup type is not obsolete
        RollupType storage currentRollupType = rollupTypeMap[rollupTypeID];
        if (currentRollupType.obsolete) {
            revert RollupTypeObsolete();
        }

        currentRollupType.obsolete = true;

        emit ObsoleteRollupType(rollupTypeID);
    }

    /**
     * @notice Create a new rollup
     * @param rollupTypeID Rollup type to deploy
     * @param chainID ChainID of the rollup, must be a new one, can not have more than 32 bits
     * @param initializeBytesAggchain Encoded params to initialize the chain. Each aggchain has its encoded params.
     * @dev Only ALGateway rollup types can be used: the first encoded param is the aggchain manager
     */
    function attachAggchainToAL(
        uint32 rollupTypeID,
        uint64 chainID,
        bytes memory initializeBytesAggchain
    ) external onlyRole(_CREATE_ROLLUP_ROLE) {
        // Check that rollup type exists
        if (rollupTypeID == 0 || rollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }
        // Check rollup type is not obsolete
        RollupType storage rollupType = rollupTypeMap[rollupTypeID];
        if (rollupType.obsolete) {
            revert RollupTypeObsolete();
        }

        // VerifierType.StateTransition and VerifierType.Pessimistic are deprecated:
        // legacy rollup types may still exist but can not be used
        if (rollupType.rollupVerifierType != VerifierType.ALGateway) {
            revert InvalidRollupType();
        }

        // check chainID max value
        // Currently we have this limitation by the circuit, might be removed in a future
        if (chainID > type(uint32).max) {
            revert ChainIDOutOfRange();
        }
        // Check chainID nullifier
        if (chainIDToRollupID[chainID] != 0) {
            revert ChainIDAlreadyExist();
        }

        // Create a new Rollup, using a transparent proxy pattern
        // Consensus will be the implementation, and this contract the admin
        uint32 rollupID = ++rollupCount;
        address rollupAddress = address(
            new PolygonTransparentProxy(
                rollupType.consensusImplementation,
                address(this),
                new bytes(0)
            )
        );

        // Set chainID to rollup id mapping
        chainIDToRollupID[chainID] = rollupID;
        // Set rollup address to rollup id mapping
        rollupAddressToID[rollupAddress] = rollupID;

        // Set rollup data
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollup.rollupContract = rollupAddress;
        rollup.chainID = chainID;
        rollup.rollupTypeID = rollupTypeID;
        rollup.rollupVerifierType = VerifierType.ALGateway;

        // Emit create new aggchain event
        emit CreateNewAggchain(
            rollupID,
            rollupTypeID,
            rollupAddress,
            chainID,
            uint8(VerifierType.ALGateway),
            initializeBytesAggchain
        );

        // This event is emitted for backwards compatibility
        /// @dev the address is hardcoded as it doesn't apply for aggchains and zero address is used for ether
        emit CreateNewRollup(
            rollupID,
            rollupTypeID,
            rollupAddress,
            chainID,
            _NO_ADDRESS
        );

        address aggchainManager = abi.decode(
            initializeBytesAggchain,
            (address)
        );

        // Set the aggchain manager, aggchain contract will be initialized later
        // through the aggchain manager
        IAggchainBase(rollupAddress).initAggchainManager(aggchainManager);
    }

    /**
     * @notice Add an already deployed rollup
     * note that this rollup does not follow any rollupType. Only ALGateway rollups can be added
     * @param rollupAddress Rollup address
     * @param verifier Must be zero, kept for interface compatibility
     * @param forkID Must be zero, kept for interface compatibility
     * @param chainID Chain id of the added rollup
     * @param initRoot Local exit root of the added rollup
     * @param rollupVerifierType Must be VerifierType.ALGateway
     * @param programVKey Must be zero, kept for interface compatibility
     * @param initPessimisticRoot Pessimistic root to init the chain.
     */
    function addExistingRollup(
        address rollupAddress,
        address verifier,
        uint64 forkID,
        uint64 chainID,
        bytes32 initRoot,
        VerifierType rollupVerifierType,
        bytes32 programVKey,
        bytes32 initPessimisticRoot
    ) external onlyRole(_ADD_EXISTING_ROLLUP_ROLE) {
        // Check chainID nullifier
        if (chainIDToRollupID[chainID] != 0) {
            revert ChainIDAlreadyExist();
        }

        // check chainID max value
        // Currently we have this limitation by the circuit, might be removed in a future
        if (chainID > type(uint32).max) {
            revert ChainIDOutOfRange();
        }

        // Check if rollup address was already added
        if (rollupAddressToID[address(rollupAddress)] != 0) {
            revert RollupAddressAlreadyExist();
        }

        // Check proposed address is not this contract to avoid self-referential loops causing infinite delegate calls
        if (rollupAddress == address(this) || rollupAddress.code.length == 0) {
            revert InvalidImplementationAddress();
        }

        // Increment rollup count
        uint32 rollupID = ++rollupCount;

        // Set chainID nullifier
        chainIDToRollupID[chainID] = rollupID;

        // Store rollup data
        rollupAddressToID[address(rollupAddress)] = rollupID;

        // VerifierType.StateTransition and VerifierType.Pessimistic are deprecated: no rollups can be added with them
        if (rollupVerifierType != VerifierType.ALGateway) {
            revert InvalidRollupType();
        }

        if (
            verifier != address(0) || forkID != 0 || programVKey != bytes32(0)
        ) {
            revert InvalidInputsForRollupType();
        }

        RollupData storage rollup = _rollupIDToRollupData[rollupID];
        rollup.rollupContract = rollupAddress;
        rollup.chainID = chainID;
        rollup.rollupVerifierType = VerifierType.ALGateway;
        rollup.lastPessimisticRoot = initPessimisticRoot;
        rollup.lastLocalExitRoot = initRoot;

        emit AddExistingRollup(
            rollupID,
            forkID,
            address(rollupAddress),
            chainID,
            rollupVerifierType,
            0,
            programVKey,
            initPessimisticRoot
        );
    }

    /**
     * @notice Upgrade an existing rollup from the rollup admin address
     * This address is able to update the rollup with more restrictions that the _UPDATE_ROLLUP_ROLE
     * @dev No initialization call by design: the rollup admin must not trigger initializers reserved to the rollup manager.
     * Upgrades needing one (e.g. AggchainBase.initAggchainManager) must use updateRollup. onlyAggchainManager initializers can still be called afterwards
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rollupTypeID to upgrade to
     */
    function updateRollupByRollupAdmin(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID
    ) external {
        RollupData storage rollup = _rollupIDToRollupData[
            rollupAddressToID[address(rollupContract)]
        ];

        if (rollup.rollupVerifierType == VerifierType.ALGateway) {
            // Check aggchain manager is msg.sender
            if (
                IAggchainBase(address(rollupContract)).aggchainManager() !=
                msg.sender
            ) {
                revert OnlyAggchainManager();
            }

            // Check AGGCHAIN_TYPE is the same (both are ALGateway at this point)
            if (
                IAggchainBase(address(rollupContract)).AGGCHAIN_TYPE() !=
                IAggchainBase(
                    rollupTypeMap[newRollupTypeID].consensusImplementation
                ).AGGCHAIN_TYPE()
            ) {
                revert UpdateNotCompatible();
            }
        } else {
            // Legacy rollups: check admin of the network is msg.sender
            // StateTransition rollups can not be updated to a StateTransition rollup type, see `_updateRollup`
            if (
                IPolygonRollupBase(address(rollupContract)).admin() !=
                msg.sender
            ) {
                revert OnlyRollupAdmin();
            }
        }

        // Not allowed to update to an older rollup type id, only supported from updateRollup function
        // Rollups added via 'addExistingRollup' has rollupTypeID = 0
        if (rollup.rollupTypeID >= newRollupTypeID) {
            revert UpdateToOldRollupTypeID();
        }

        // note that for rollups via 'addExistingRollup', the rollupTypeID is set to 0
        // Admin can't update to a different rollup type
        if (
            rollup.rollupVerifierType !=
            rollupTypeMap[newRollupTypeID].rollupVerifierType
        ) {
            revert UpdateNotCompatible();
        }

        _updateRollup(rollupContract, newRollupTypeID, new bytes(0));
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rollupTypeID to upgrade to
     * @param upgradeData Upgrade data
     */
    function updateRollup(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external onlyRole(_UPDATE_ROLLUP_ROLE) {
        uint32 rollupID = rollupAddressToID[address(rollupContract)];
        RollupData storage rollup = _rollupIDToRollupData[rollupID];
        // Only allow update rollupVerifierType when updating to ALGateway
        // StateTransition rollups must use initMigration to change their rollupVerifierType
        if (
            rollup.rollupVerifierType !=
            rollupTypeMap[newRollupTypeID].rollupVerifierType &&
            (rollupTypeMap[newRollupTypeID].rollupVerifierType !=
                VerifierType.ALGateway ||
                rollup.rollupVerifierType == VerifierType.StateTransition)
        ) {
            revert UpdateNotCompatible();
        }

        _updateRollup(rollupContract, newRollupTypeID, upgradeData);
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rollupTypeID to upgrade to
     * @param upgradeData Upgrade data
     */
    function _updateRollup(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) internal {
        // Check that rollup type exists
        if (newRollupTypeID == 0 || newRollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }

        // Check the rollup exists
        uint32 rollupID = rollupAddressToID[address(rollupContract)];
        if (rollupID == 0) {
            revert RollupMustExist();
        }

        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        // The update must be to a new rollup type
        if (rollup.rollupTypeID == newRollupTypeID) {
            revert UpdateToSameRollupTypeID();
        }

        RollupType storage newRollupType = rollupTypeMap[newRollupTypeID];

        // Check rollup type is not obsolete
        if (newRollupType.obsolete) {
            revert RollupTypeObsolete();
        }

        // VerifierType.StateTransition is deprecated: StateTransition rollups can only migrate to ALGateway through `initMigration`
        if (newRollupType.rollupVerifierType == VerifierType.StateTransition) {
            revert InvalidRollupType();
        }

        // Update rollup parameters
        rollup.verifier = newRollupType.verifier;
        rollup.forkID = newRollupType.forkID;
        rollup.programVKey = newRollupType.programVKey;
        rollup.rollupTypeID = newRollupTypeID;
        rollup.rollupVerifierType = newRollupType.rollupVerifierType;

        uint64 lastVerifiedBatch = getLastVerifiedBatch(rollupID);
        rollup.lastVerifiedBatchBeforeUpgrade = lastVerifiedBatch;
        // Upgrade rollup
        rollupContract.upgradeToAndCall(
            newRollupType.consensusImplementation,
            upgradeData
        );
        emit UpdateRollup(rollupID, newRollupTypeID, lastVerifiedBatch);
    }

    /**
     * @notice Function to init migration to ALGateway
     * @param rollupID Rollup ID that is being migrated
     * @param newRollupTypeID New rollup type ID that the rollup will be migrated to
     * @param upgradeData Upgrade data
     */
    function initMigration(
        uint32 rollupID,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external onlyRole(_UPDATE_ROLLUP_ROLE) {
        /// @dev Rollup existence check is done at `_updateRollup`function
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        // Only for StateTransition chains
        require(
            rollup.rollupVerifierType == VerifierType.StateTransition,
            OnlyStateTransitionChains()
        );

        // No pending batches to verify allowed before migration
        // Batches can no longer be verified: unverified sequenced batches must be removed first with `rollbackBatches`
        if (rollup.lastBatchSequenced != rollup.lastVerifiedBatch) {
            revert AllSequencedMustBeVerified();
        }

        // NewRollupType must be ALGateway
        require(
            rollupTypeMap[newRollupTypeID].rollupVerifierType ==
                VerifierType.ALGateway,
            InvalidRollupType()
        );

        // Add rollupID to migration mapping
        isRollupMigrating[rollupID] = true;

        // Update rollup type to new type
        _updateRollup(
            ITransparentUpgradeableProxy(rollup.rollupContract),
            newRollupTypeID,
            upgradeData
        );

        // Emit event
        emit InitMigration(rollupID, newRollupTypeID);
    }

    /**
     * @notice Rollback batches of the target rollup
     * Only applies to state transition rollups. Batches can no longer be verified, so this is used to remove
     * the unverified sequenced batches before migrating the rollup to ALGateway with `initMigration`
     * @param rollupContract Rollup consensus proxy address
     * @param targetBatch Batch to rollback up to but not including this batch
     */
    function rollbackBatches(
        IPolygonRollupBase rollupContract,
        uint64 targetBatch
    ) external nonReentrant {
        // Check msg.sender has _UPDATE_ROLLUP_ROLE rol or is the admin of the network
        if (
            !hasRole(_UPDATE_ROLLUP_ROLE, msg.sender) &&
            IPolygonRollupBase(address(rollupContract)).admin() != msg.sender
        ) {
            revert NotAllowedAddress();
        }

        // Check the rollup exists
        uint32 rollupID = rollupAddressToID[address(rollupContract)];
        if (rollupID == 0) {
            revert RollupMustExist();
        }

        // Load rollup
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        if (rollup.rollupVerifierType != VerifierType.StateTransition) {
            revert OnlyStateTransitionChains();
        }

        uint64 lastBatchSequenced = rollup.lastBatchSequenced;

        // Batch to rollback should be already sequenced
        if (
            targetBatch >= lastBatchSequenced ||
            targetBatch < rollup.lastVerifiedBatch
        ) {
            revert RollbackBatchIsNotValid();
        }

        uint64 currentBatch = lastBatchSequenced;

        // delete sequence batches structs until the targetBatch
        while (currentBatch != targetBatch) {
            // Load previous end of sequence batch
            uint64 previousBatch = rollup
                .sequencedBatches[currentBatch]
                .previousLastBatchSequenced;

            // Batch to rollback must be end of a sequence
            if (previousBatch < targetBatch) {
                revert RollbackBatchIsNotEndOfSequence();
            }

            // delete sequence information
            delete rollup.sequencedBatches[currentBatch];

            // Update current batch for next iteration
            currentBatch = previousBatch;
        }

        // Update last batch sequenced on rollup data
        rollup.lastBatchSequenced = targetBatch;

        // Clean pending state if any
        rollupContract.rollbackBatches(
            targetBatch,
            rollup.sequencedBatches[targetBatch].accInputHash
        );

        emit RollbackBatches(
            rollupID,
            targetBatch,
            rollup.sequencedBatches[targetBatch].accInputHash
        );
    }

    ////////////////////
    // Verify functions
    ////////////////////

    /**
     * @notice Allows a trusted aggregator to verify pessimistic proof
     * @param rollupID Rollup identifier
     * @param l1InfoTreeLeafCount Count of the L1InfoTree leaf that will be used to verify imported bridge exits
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     * @param proof SP1 proof (Plonk)
     * @param aggchainData Specific custom data to verify Aggregation layer chains
     * @dev A reentrancy measure has been applied because this function calls `onVerifyPessimistic`, is an open function implemented by the aggchains
     * @dev the function can not be a view because the nonReentrant uses a transient storage variable
     */
    function verifyPessimisticTrustedAggregator(
        uint32 rollupID,
        uint32 l1InfoTreeLeafCount,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata proof,
        bytes calldata aggchainData
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) nonReentrant {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        // Not for state transition chains
        if (rollup.rollupVerifierType == VerifierType.StateTransition) {
            revert StateTransitionChainsNotAllowed();
        }

        // Check l1InfoTreeLeafCount has a valid l1InfoTreeRoot
        bytes32 l1InfoRoot = globalExitRootManager.l1InfoRootMap(
            l1InfoTreeLeafCount
        );

        if (l1InfoRoot == bytes32(0)) {
            revert L1InfoTreeLeafCountInvalid();
        }

        // In case of a chain in migration, the inputs are a special case.
        if (isRollupMigrating[rollupID]) {
            // If we are migrating, the proof is proving a "bootstrapCertificate" containing all the bridges involved in the network since the genesis.
            // It's a hard requirement that the newLocalExitRoot matches the current lastLocalExitRoot meaning that the certificates covers all the bridges
            /// @dev  If the lastLocalExitRoot is zero, it means that the rollup has never verified a batch with bridges.
            ///       In this special case, newLocalExitRoot must also be zero as defined in the PP program circuit.
            require(
                newLocalExitRoot == rollup.lastLocalExitRoot,
                InvalidNewLocalExitRoot()
            );
            // In this special case, we consider lastLocalExitRoot is zero.
            // This is intentional, as we need a valid prover input.
            // Since the proof includes all bridges involved in the network, we assume
            // lastLocalExitRoot is bytes32(0), and the expectedNewLocalExitRoot will
            // already contain the full network state (lastLocalExitRoot).
            rollup.lastLocalExitRoot = bytes32(0);
            // Finally, after proving the "bootstrapCertificate", the migration will be completed
            isRollupMigrating[rollupID] = false;

            // Emit event
            emit CompletedMigration(rollupID);
        }

        bytes memory inputPessimisticBytes = _getInputPessimisticBytes(
            rollupID,
            rollup,
            l1InfoRoot,
            newLocalExitRoot,
            newPessimisticRoot,
            aggchainData
        );

        // Verify proof. The pessimistic proof selector is attached at the first 4 bytes of the proof
        // proof[0:4]: 4 bytes selector pp
        // proof[4:8]: 4 bytes selector SP1 verifier
        // proof[8:]: proof
        aggLayerGateway.verifyPessimisticProof(inputPessimisticBytes, proof);

        // Update aggregation parameters
        lastAggregationTimestamp = uint64(block.timestamp);

        // Consolidate state
        bytes32 prevLocalExitRoot = rollup.lastLocalExitRoot;
        rollup.lastLocalExitRoot = newLocalExitRoot;
        bytes32 prevPessimisticRoot = rollup.lastPessimisticRoot;
        rollup.lastPessimisticRoot = newPessimisticRoot;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        // Same event as verifyBatches to support current bridge service to synchronize everything
        /// @dev moved newLocalExitRoot to aux variable to avoid stack too deep errors at compilation
        bytes32 newLocalExitRootAux = newLocalExitRoot;
        emit VerifyBatchesTrustedAggregator(
            rollupID,
            0, // final batch: does not  apply in pessimistic
            bytes32(0), // new state root: does not apply in pessimistic
            newLocalExitRootAux,
            msg.sender
        );

        /// @dev emit a second event with more data, not updated/removed the other one for backwards compatibility reasons
        emit VerifyPessimisticStateTransition(
            rollupID,
            prevPessimisticRoot,
            newPessimisticRoot,
            prevLocalExitRoot,
            newLocalExitRootAux,
            l1InfoRoot,
            msg.sender
        );

        // Allow chains to manage customData
        // Callback to the rollup address
        IAggchainBase(rollup.rollupContract).onVerifyPessimistic(aggchainData);
    }

    ////////////////////////
    // Emergency state functions
    ////////////////////////

    /**
     * @notice Function to activate emergency state, which also enables the emergency mode on both AgglayerManager and PolygonZkEVMBridge contracts
     * If not called by the owner must not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period and an emergency state was not happened in the same period
     */
    function activateEmergencyState() external {
        if (!hasRole(_EMERGENCY_COUNCIL_ROLE, msg.sender)) {
            if (
                lastAggregationTimestamp == 0 ||
                lastAggregationTimestamp + _HALT_AGGREGATION_TIMEOUT >
                block.timestamp ||
                lastDeactivatedEmergencyStateTimestamp +
                    _HALT_AGGREGATION_TIMEOUT >
                block.timestamp
            ) {
                revert HaltTimeoutNotExpired();
            }
        }
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate emergency state on both AgglayerManager and PolygonZkEVMBridge contracts
     */
    function deactivateEmergencyState()
        external
        onlyRole(_STOP_EMERGENCY_ROLE)
    {
        // Set last deactivated emergency state
        lastDeactivatedEmergencyStateTimestamp = uint64(block.timestamp);

        // Deactivate emergency state on PolygonZkEVMBridge
        bridgeAddress.deactivateEmergencyState();

        // Deactivate emergency state on this contract
        super._deactivateEmergencyState();
    }

    /**
     * @notice Internal function to activate emergency state on both AgglayerManager and PolygonZkEVMBridge contracts
     */
    function _activateEmergencyState() internal override {
        // Activate emergency state on PolygonZkEVM Bridge
        bridgeAddress.activateEmergencyState();

        // Activate emergency state on this contract
        super._activateEmergencyState();
    }

    ////////////////////////
    // view/pure functions
    ///////////////////////

    /**
     * @notice Get the current rollup exit root
     * Compute using all the local exit roots of all rollups the rollup exit root
     * Since it's expected to have no more than 10 rollups in this first version, even if this approach
     * has a gas consumption that scales linearly with the rollups added, it's ok
     * In a future versions this computation will be done inside the circuit
     */
    function getRollupExitRoot() public view returns (bytes32) {
        uint256 currentNodes = rollupCount;

        // If there are no nodes return 0
        if (currentNodes == 0) {
            return bytes32(0);
        }

        // This array will contain the nodes of the current iteration
        bytes32[] memory tmpTree = new bytes32[](currentNodes);

        // In the first iteration the nodes will be the leafs which are the local exit roots of each network
        for (uint256 i = 0; i < currentNodes; i++) {
            // The first rollup ID starts on 1
            tmpTree[i] = _rollupIDToRollupData[uint32(i + 1)].lastLocalExitRoot;
        }

        // This variable will keep track of the zero hashes
        bytes32 currentZeroHashHeight = 0;

        // This variable will keep track of the remaining levels to compute
        uint256 remainingLevels = _EXIT_TREE_DEPTH;

        // Calculate the root of the sub-tree that contains all the localExitRoots
        while (currentNodes != 1) {
            uint256 nextIterationNodes = currentNodes / 2 + (currentNodes % 2);
            bytes32[] memory nextTmpTree = new bytes32[](nextIterationNodes);
            for (uint256 i = 0; i < nextIterationNodes; i++) {
                // if we are on the last iteration of the current level and the nodes are odd
                if (i == nextIterationNodes - 1 && (currentNodes % 2) == 1) {
                    nextTmpTree[i] = Hashes.efficientKeccak256(
                        tmpTree[i * 2],
                        currentZeroHashHeight
                    );
                } else {
                    nextTmpTree[i] = Hashes.efficientKeccak256(
                        tmpTree[i * 2],
                        tmpTree[(i * 2) + 1]
                    );
                }
            }

            // Update tree variables
            tmpTree = nextTmpTree;
            currentNodes = nextIterationNodes;
            currentZeroHashHeight = Hashes.efficientKeccak256(
                currentZeroHashHeight,
                currentZeroHashHeight
            );
            remainingLevels--;
        }

        bytes32 currentRoot = tmpTree[0];

        // Calculate remaining levels, since it's a sequential merkle tree, the rest of the tree are zeroes
        for (uint256 i = 0; i < remainingLevels; i++) {
            currentRoot = Hashes.efficientKeccak256(
                currentRoot,
                currentZeroHashHeight
            );
            currentZeroHashHeight = Hashes.efficientKeccak256(
                currentZeroHashHeight,
                currentZeroHashHeight
            );
        }
        return currentRoot;
    }

    /**
     * @notice Get the last verified batch
     */
    function getLastVerifiedBatch(
        uint32 rollupID
    ) public view returns (uint64) {
        return _rollupIDToRollupData[rollupID].lastVerifiedBatch;
    }

    /**
     * @notice Function to calculate the pessimistic input bytes
     * @param rollupID Rollup id used to calculate the input snark bytes
     * @param l1InfoTreeRoot L1 Info tree root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     * @param aggchainData Specific custom data to verify Aggregation layer chains
     */
    function getInputPessimisticBytes(
        uint32 rollupID,
        bytes32 l1InfoTreeRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata aggchainData
    ) external view returns (bytes memory) {
        return
            _getInputPessimisticBytes(
                rollupID,
                _rollupIDToRollupData[rollupID],
                l1InfoTreeRoot,
                newLocalExitRoot,
                newPessimisticRoot,
                aggchainData
            );
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param rollupID Rollup identifier
     * @param rollup Rollup data storage pointer
     * @param l1InfoTreeRoot L1 Info tree root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     */
    function _getInputPessimisticBytes(
        uint32 rollupID,
        RollupData storage rollup,
        bytes32 l1InfoTreeRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata aggchainData
    ) internal view returns (bytes memory inputPessimisticBytes) {
        bytes32 aggchainHash = IAggchainBase(rollup.rollupContract)
            .getAggchainHash(aggchainData);

        inputPessimisticBytes = abi.encodePacked(
            rollup.lastLocalExitRoot,
            rollup.lastPessimisticRoot,
            l1InfoTreeRoot,
            rollupID,
            aggchainHash,
            newLocalExitRoot,
            newPessimisticRoot
        );
    }

    /**
     * @notice Get rollup state root given a batch number
     * @param rollupID Rollup identifier
     * @param batchNum Batch number
     */
    function getRollupBatchNumToStateRoot(
        uint32 rollupID,
        uint64 batchNum
    ) public view returns (bytes32) {
        return _rollupIDToRollupData[rollupID].batchNumToStateRoot[batchNum];
    }

    /**
     * @notice Get rollup sequence batches struct given a batch number
     * @param rollupID Rollup identifier
     * @param batchNum Batch number
     */
    function getRollupSequencedBatches(
        uint32 rollupID,
        uint64 batchNum
    ) public view returns (SequencedBatchData memory) {
        return _rollupIDToRollupData[rollupID].sequencedBatches[batchNum];
    }

    /**
     * @notice Get rollup data: VerifierType StateTransition
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupData(
        uint32 rollupID
    ) public view returns (RollupDataReturn memory rollupData) {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupData.rollupContract = rollup.rollupContract;
        rollupData.chainID = rollup.chainID;
        rollupData.verifier = rollup.verifier;
        rollupData.forkID = rollup.forkID;
        rollupData.lastLocalExitRoot = rollup.lastLocalExitRoot;
        rollupData.lastBatchSequenced = rollup.lastBatchSequenced;
        rollupData.lastVerifiedBatch = rollup.lastVerifiedBatch;
        rollupData._legacyLastPendingState = rollup._legacyLastPendingState;
        rollupData._legacyLastPendingStateConsolidated = rollup
            ._legacyLastPendingStateConsolidated;
        rollupData.lastVerifiedBatchBeforeUpgrade = rollup
            .lastVerifiedBatchBeforeUpgrade;
        rollupData.rollupTypeID = rollup.rollupTypeID;
        rollupData.rollupVerifierType = rollup.rollupVerifierType;
    }

    /**
     * @notice Get rollup data: VerifierType State transition
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupDataDeserialized(
        uint32 rollupID
    )
        public
        view
        returns (
            address rollupContract,
            uint64 chainID,
            address verifier,
            uint64 forkID,
            bytes32 lastLocalExitRoot,
            uint64 lastBatchSequenced,
            uint64 lastVerifiedBatch,
            uint64 legacyLastPendingState,
            uint64 legacyLastPendingStateConsolidated,
            uint64 lastVerifiedBatchBeforeUpgrade,
            uint64 rollupTypeID,
            VerifierType rollupVerifierType
        )
    {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupContract = rollup.rollupContract;
        chainID = rollup.chainID;
        verifier = rollup.verifier;
        forkID = rollup.forkID;
        lastLocalExitRoot = rollup.lastLocalExitRoot;
        lastBatchSequenced = rollup.lastBatchSequenced;
        lastVerifiedBatch = rollup.lastVerifiedBatch;
        legacyLastPendingState = rollup._legacyLastPendingState;
        legacyLastPendingStateConsolidated = rollup
            ._legacyLastPendingStateConsolidated;
        lastVerifiedBatchBeforeUpgrade = rollup.lastVerifiedBatchBeforeUpgrade;
        rollupTypeID = rollup.rollupTypeID;
        rollupVerifierType = rollup.rollupVerifierType;
    }

    /**
     * @notice Get rollup data: VerifierType Pessimistic
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupDataV2(
        uint32 rollupID
    ) public view returns (RollupDataReturnV2 memory rollupData) {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupData.rollupContract = rollup.rollupContract;
        rollupData.chainID = rollup.chainID;
        rollupData.verifier = rollup.verifier;
        rollupData.forkID = rollup.forkID;
        rollupData.lastLocalExitRoot = rollup.lastLocalExitRoot;
        rollupData.lastBatchSequenced = rollup.lastBatchSequenced;
        rollupData.lastVerifiedBatch = rollup.lastVerifiedBatch;
        rollupData.lastVerifiedBatchBeforeUpgrade = rollup
            .lastVerifiedBatchBeforeUpgrade;
        rollupData.rollupTypeID = rollup.rollupTypeID;
        rollupData.rollupVerifierType = rollup.rollupVerifierType;
        rollupData.lastPessimisticRoot = rollup.lastPessimisticRoot;
        rollupData.programVKey = rollup.programVKey;
    }

    /**
     * @notice Get rollup data deserialized
     * @dev A deserialized version of the rollup data done for a better parsing from etherscan
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupDataV2Deserialized(
        uint32 rollupID
    )
        public
        view
        returns (
            address rollupContract,
            uint64 chainID,
            address verifier,
            uint64 forkID,
            bytes32 lastLocalExitRoot,
            uint64 lastBatchSequenced,
            uint64 lastVerifiedBatch,
            uint64 lastVerifiedBatchBeforeUpgrade,
            uint64 rollupTypeID,
            VerifierType rollupVerifierType,
            bytes32 lastPessimisticRoot,
            bytes32 programVKey
        )
    {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupContract = rollup.rollupContract;
        chainID = rollup.chainID;
        verifier = rollup.verifier;
        forkID = rollup.forkID;
        lastLocalExitRoot = rollup.lastLocalExitRoot;
        lastBatchSequenced = rollup.lastBatchSequenced;
        lastVerifiedBatch = rollup.lastVerifiedBatch;
        lastVerifiedBatchBeforeUpgrade = rollup.lastVerifiedBatchBeforeUpgrade;
        rollupTypeID = rollup.rollupTypeID;
        rollupVerifierType = rollup.rollupVerifierType;
        lastPessimisticRoot = rollup.lastPessimisticRoot;
        programVKey = rollup.programVKey;
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return ROLLUP_MANAGER_VERSION;
    }
}
