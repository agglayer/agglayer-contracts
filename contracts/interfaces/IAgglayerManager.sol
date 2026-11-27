// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

import "./IPolygonRollupBase.sol";
import {ITransparentUpgradeableProxy} from "@openzeppelin/contracts5/proxy/transparent/TransparentUpgradeableProxy.sol";

interface IAgglayerManager {
    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error UpdateToSameRollupTypeID();

    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error RollupMustExist();

    /**
     * @dev Thrown when the halt timeout is not expired when attempting to activate the emergency state
     */
    error HaltTimeoutNotExpired();

    /**
     * @dev Thrown when the caller is not the pending admin
     */
    error ChainIDAlreadyExist();

    /**
     * @dev When a rollup type does not exist
     */
    error RollupTypeDoesNotExist();

    /**
     * @dev When a rollup type does not exist
     */
    error RollupTypeObsolete();

    /**
     * @dev When a rollup type does not exist
     */
    error UpdateNotCompatible();

    /**
     * @dev When adding an existing rollup where the rollup address already was added
     */
    error RollupAddressAlreadyExist();

    /**
     * @dev When try to create a new rollup and set a chainID bigger than 32 bits
     */
    error ChainIDOutOfRange();

    /**
     * @dev When try to upgrade a rollup a sender that's not the admin of the rollup
     */
    error OnlyRollupAdmin();

    /**
     * @dev When try to upgrade a rollup a sender that's not the aggchain manager
     */
    error OnlyAggchainManager();

    /**
     * @dev When try to update a rollup with sequences pending to verify
     */
    error AllSequencedMustBeVerified();

    /**
     * @dev Update to old rollup ID
     */
    error UpdateToOldRollupTypeID();

    /**
     * @dev Rollback batch is not sequenced
     */
    error RollbackBatchIsNotValid();

    /**
     * @dev Rollback batch is not the end of any sequence
     */
    error RollbackBatchIsNotEndOfSequence();

    /**
     * @dev rollbackBatches is called from a non authorized address
     */
    error NotAllowedAddress();

    /**
     * @dev Invalid Rollup type parameters
     */
    error InvalidRollupType();

    /**
     * @dev Not valid L1 info tree leaf count
     */
    error L1InfoTreeLeafCountInvalid();

    /**
     * @dev Only State Transition Chains
     */
    error OnlyStateTransitionChains();

    /**
     * @dev Thrown when a function is executed for a State transition chains when it is not allowed
     * @dev This function was previously called `OnlyChainsWithPessimisticProofs`but with the new ALGateway verifier Type
     *      state transitions must be excluded
     */
    error StateTransitionChainsNotAllowed();

    /**
     * @dev Thrown when trying to deploy rollup Manager with some zero address as the input
     */
    error InvalidConstructorInputs();

    /**
     * @dev Thrown when trying to create a rollup but the input parameters are not  according with the chosen rollupType
     */
    error InvalidInputsForRollupType();

    /**
     * @dev Thrown when trying to add an existing rollup or create a new rollup type with an invalid consensus implementation address
     */
    error InvalidImplementationAddress();

    /**
     * @dev Thrown when trying to finish a migration of a rollup to a pessimistic rollup type with `verifyPessimisticTrustedAggregator` function and the proposed new local exit root does not match the expected new local exit root
     */
    error InvalidNewLocalExitRoot();

    enum VerifierType {
        // Deprecated: no new rollup types or rollups can be created with this type, nor updated to it. Existing rollups can only migrate to ALGateway (initMigration)
        StateTransition,
        // Deprecated: no new rollup types or rollups can be created with this type, nor migrated to/from it. Kept for storage/ABI compatibility
        Pessimistic,
        ALGateway
    }

    function addNewRollupType(
        address consensusImplementation,
        address verifier,
        uint64 forkID,
        VerifierType rollupVerifierType,
        bytes32 initRoot,
        string memory description,
        bytes32 programVKey
    ) external;

    function obsoleteRollupType(uint32 rollupTypeID) external;

    function attachAggchainToAL(
        uint32 rollupTypeID,
        uint64 chainID,
        bytes memory initializeBytesAggchain
    ) external;

    function addExistingRollup(
        address rollupAddress,
        address verifier,
        uint64 forkID,
        uint64 chainID,
        bytes32 initRoot,
        VerifierType rollupVerifierType,
        bytes32 programVKey,
        bytes32 initPessimisticRoot
    ) external;

    function updateRollupByRollupAdmin(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID
    ) external;

    function updateRollup(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external;

    function rollbackBatches(
        IPolygonRollupBase rollupContract,
        uint64 targetBatch
    ) external;

    function verifyPessimisticTrustedAggregator(
        uint32 rollupID,
        uint32 l1InfoTreeLeafCount,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata proof,
        bytes memory aggchainData
    ) external;

    function activateEmergencyState() external;

    function deactivateEmergencyState() external;

    function getRollupExitRoot() external view returns (bytes32);

    function getLastVerifiedBatch(
        uint32 rollupID
    ) external view returns (uint64);

    function getInputPessimisticBytes(
        uint32 rollupID,
        bytes32 selectedGlobalExitRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes memory aggchainData
    ) external view returns (bytes memory);

    function getRollupBatchNumToStateRoot(
        uint32 rollupID,
        uint64 batchNum
    ) external view returns (bytes32);

    function lastDeactivatedEmergencyStateTimestamp()
        external
        view
        returns (uint64);
}
