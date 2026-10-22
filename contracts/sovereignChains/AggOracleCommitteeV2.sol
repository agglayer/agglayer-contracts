// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable5/access/Ownable2StepUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts5/utils/cryptography/ECDSA.sol";
import {IAgglayerGERL2} from "../interfaces/IAgglayerGERL2.sol";
import {IAggOracleCommitteeV2} from "../interfaces/IAggOracleCommitteeV2.sol";
import {IVersion} from "../interfaces/IVersion.sol";

/**
 * @title AggOracleCommitteeV2
 * @notice Contract responsible for managing the insertion of GERs (Global Exit Roots)
 * @notice Proposer-validator management is the same as the one implemented in the AggchainSigners contract, with one minor modification:
 *         the `url` of a validator is allowed to be empty. This contract is deployed on L2, therefore gas costs are not an issue.
 * @dev This contract uses signature verification similar to Safe multisig for permissioned injection of GERs.
 *      It implements a threshold-based multi-signature scheme where a minimum number of oracle validators must sign
 *      each GER injection before it can be executed.
 *      Ownership is transferred in two steps: the new owner must accept it.
 *      This contract is meant for fresh deployments only: there is no upgrade path from AggOracleCommittee (V1),
 *      since both storage layouts are incompatible.
 */
contract AggOracleCommitteeV2 is
    Ownable2StepUpgradeable,
    IVersion,
    IAggOracleCommitteeV2
{
    ////////////////////
    // Immutables & Constants
    ////////////////////

    /// @notice Version constant
    string public constant VERSION_AGG_ORACLE_COMMITTEE_V2 = "v1.0.0";

    /// @notice Maximum number of oracle validators
    uint256 public constant MAX_VALIDATORS = 255;

    /// @notice Global exit root manager L2 - manages the GER tree
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerGERL2 public immutable agglayerGERL2;

    ////////////////////
    // Storage
    ////////////////////

    /// @notice Array of oracle validator addresses
    address[] public validators;

    /// @notice Number of signatures required to inject a GER
    uint256 public threshold;

    /// @notice Mapping to track if an address is an authorized oracle validator
    mapping(address => ValidatorInternalInfo) public validatorInfo;

    /// @notice Address authorized to propose GER injections
    address public proposer;

    /// @notice GERs already processed by this contract (inserted, or marked because they were already set in the
    ///         AgglayerGERL2). A processed GER can never be injected again, even if it is later removed from the
    ///         AgglayerGERL2, so its validator signatures can not be replayed.
    /// @dev A GER inserted by another updater and removed before this contract processed it is not tracked here:
    ///      validators must not sign a GER that has been removed from the AgglayerGERL2
    mapping(bytes32 => bool) public injectedGERs;

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    // slither-disable-next-line unused-state,naming-convention
    uint256[45] private __gap;

    ////////////////////
    // Modifiers
    ////////////////////

    /**
     * @notice Modifier to restrict access to the oracle proposer
     * @dev Reverts if the caller is not the designated oracle proposer
     */
    modifier onlyAggOracleProposer() {
        if (msg.sender != proposer) {
            revert OnlyAggOracleProposerCanCall();
        }
        _;
    }

    ////////////////////
    // Constructor
    ////////////////////

    /**
     * @notice Contract constructor
     * @dev Disables initializers on the implementation contract following proxy pattern best practices
     * @param _agglayerGERL2 Address of the Agglayer Global Exit Root manager L2
     */
    constructor(IAgglayerGERL2 _agglayerGERL2) {
        if (address(_agglayerGERL2) == address(0)) {
            revert AgglayerGERL2CannotBeZero();
        }

        agglayerGERL2 = _agglayerGERL2;
        _disableInitializers();
    }

    ////////////////////
    // Initializer
    ////////////////////

    /**
     * @notice Initializes the contract with initial configuration
     * @dev Can only be called once due to initializer modifier. Sets up the owner, validators, threshold, and proposer
     * @param _owner Owner of the contract, presumably a multisig for governance
     * @param _newProposer Address authorized to propose GER injections
     * @param _newValidators Initial array of oracle validator addresses
     * @param _newThreshold Number of signatures required for GER injection
     */
    function initialize(
        address _owner,
        address _newProposer,
        ValidatorInfo[] memory _newValidators,
        uint256 _newThreshold
    ) external initializer {
        // Validate owner is not zero address
        if (_owner == address(0)) {
            revert OwnerCannotBeZero();
        }

        // Initialize ownership
        __Ownable_init(_owner);
        __Ownable2Step_init();

        // Set the proposer, validated in the internal function _updateAggOracleProposer
        _updateAggOracleProposer(_newProposer);

        // threshold and validators are validated in the internal function _updateValidatorsAndThreshold
        _updateValidatorsAndThreshold(
            new RemoveValidatorInfo[](0), // No validators to remove
            _newValidators,
            _newThreshold
        );
    }

    ////////////////////
    // Oracle Proposer Functions
    ////////////////////

    /**
     * @notice Inject a Global Exit Root (GER) with signature verification
     * @dev The GER must be signed by exactly `threshold` oracle validators
     *      Signatures must be ordered by signer address in ascending order to prevent duplicates
     *      A GER can only be processed once: once processed, it can never be injected again, even if it is later
     *      removed from the AgglayerGERL2 (see `injectedGERs` for the GERs this guarantee does not cover)
     *      If the GER is already set in the AgglayerGERL2 (e.g. by a previous updater), it is only marked as injected
     * @param _globalExitRoot The global exit root to inject into the GER manager
     * @param _signatures Concatenated signatures for the global exit root (65 bytes per signature: r+s+v)
     */
    // slither-disable-next-line reentrancy-events (only view call to the trusted immutable agglayerGERL2 before the events)
    function injectGER(
        bytes32 _globalExitRoot,
        bytes calldata _signatures
    ) external onlyAggOracleProposer {
        // Validate the GER
        _validateGER(_globalExitRoot, _signatures);

        // Mark the GER as injected before any external call
        injectedGERs[_globalExitRoot] = true;

        // If the GER was already set by another updater, only mark it: skipping the insertion avoids a revert
        // that would roll back the mark
        if (agglayerGERL2.globalExitRootMap(_globalExitRoot) != 0) {
            emit GERMarkedAsInjected(_globalExitRoot);
            return;
        }

        emit GERInjected(_globalExitRoot);

        // Insert the GER into the global exit root manager
        agglayerGERL2.insertGlobalExitRoot(_globalExitRoot);
    }

    ////////////////////
    // Owner Functions
    ////////////////////

    /**
     * @notice Update the oracle proposer address
     * @dev Only callable by the contract owner. Proposer address cannot be zero
     * @param _newProposer New proposer address
     */
    function updateAggOracleProposer(address _newProposer) external onlyOwner {
        _updateAggOracleProposer(_newProposer);
    }

    /**
     * @notice Transfer the globalExitRootUpdater role to a new address
     * @dev Only callable by the contract owner. This is step 1 of a two-step transfer process
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external onlyOwner {
        agglayerGERL2.transferGlobalExitRootUpdater(_newGlobalExitRootUpdater);
    }

    /**
     * @notice Accept the globalExitRootUpdater role
     * @dev Only callable by the contract owner. This is step 2 of a two-step transfer process
     */
    function acceptGlobalExitRootUpdater() external onlyOwner {
        agglayerGERL2.acceptGlobalExitRootUpdater();
    }

    /**
     * @notice Update the validators and threshold
     * @dev Only callable by the contract owner. Validators and threshold are updated in a single transaction
     * @param _validatorsToRemove Array of validators to remove with their indices (MUST be in descending index order)
     * @param _validatorsToAdd Array of new validators to add with their URLs
     * @param _newThreshold New threshold value
     */
    function updateValidatorsAndThreshold(
        RemoveValidatorInfo[] memory _validatorsToRemove,
        ValidatorInfo[] memory _validatorsToAdd,
        uint256 _newThreshold
    ) external onlyOwner {
        _updateValidatorsAndThreshold(
            _validatorsToRemove,
            _validatorsToAdd,
            _newThreshold
        );
    }

    /**
     * @notice Renouncing ownership is disabled
     * @dev Without an owner, validators, threshold and proposer could never be updated again
     */
    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    ////////////////////
    // Internal Functions
    ////////////////////

    /**
     * @notice Internal function to update the oracle proposer
     * @dev Validates that the proposer is not the zero address
     * @param _newProposer New proposer address
     */
    function _updateAggOracleProposer(address _newProposer) internal {
        // Validate proposer is not zero address
        if (_newProposer == address(0)) {
            revert ProposerCannotBeZero();
        }

        proposer = _newProposer;
        emit UpdateAggOracleProposer(_newProposer);
    }

    /**
     * @notice Internal function to add an oracle validator
     * @dev Validates that the address is not zero, not this contract and not already a validator
     * @param _newValidator Address of the new validator
     * @param _url URL of the validator
     */
    function _addValidator(address _newValidator, string memory _url) internal {
        // Validate address is not zero
        if (_newValidator == address(0)) {
            revert ValidatorCannotBeZero();
        }

        // Validate address is not this contract
        if (_newValidator == address(this)) {
            revert ValidatorCannotBeThisContract();
        }

        // Validate address is not already a validator
        if (validatorInfo[_newValidator].isValidator) {
            revert ValidatorAlreadyExists();
        }

        // Add validator to array
        validators.push(_newValidator);
        // Add validator to mapping
        validatorInfo[_newValidator] = ValidatorInternalInfo({
            isValidator: true,
            url: _url
        });
    }

    /**
     * @notice Internal function to remove an existing oracle validator
     * @dev Uses swap-and-pop pattern for gas-efficient removal
     * @param _oracleValidatorAddress Address of the oracle validator to remove
     * @param _oracleValidatorIndex Index of the validator in the validators array
     */
    function _removeValidator(
        address _oracleValidatorAddress,
        uint256 _oracleValidatorIndex
    ) internal {
        // cache array length
        uint256 validatorsLength = validators.length;

        // Validate index is within bounds
        if (_oracleValidatorIndex >= validatorsLength) {
            revert ValidatorIndexOutOfBounds();
        }

        // Validate address is a current validator
        if (validators[_oracleValidatorIndex] != _oracleValidatorAddress) {
            revert ValidatorIndexMismatch();
        }

        // Remove validator status
        // use delete to remove from mapping
        delete validatorInfo[_oracleValidatorAddress];

        // Remove from array using swap-and-pop pattern
        validators[_oracleValidatorIndex] = validators[validatorsLength - 1];
        validators.pop();
    }

    /**
     * @notice Internal function to update the threshold
     * @dev Same rule as a Safe wallet: 1 <= threshold <= number of validators.
     *      This also forces at least one validator to exist
     * @param _newThreshold New threshold value
     */
    function _updateThreshold(uint256 _newThreshold) internal {
        // Validate threshold is not zero
        if (_newThreshold == 0) {
            revert ThresholdCannotBeZero();
        }

        // Validate threshold doesn't exceed number of validators
        if (_newThreshold > validators.length) {
            revert ThresholdCannotBeGreaterThanValidators();
        }

        threshold = _newThreshold;
    }

    /**
     * @notice Internal function to update validators (added and/or removed) and the threshold
     * @dev Removes validators first (in descending index order), then adds new validators, then updates the threshold
     * @param _validatorsToRemove Array of validators to remove with their indices (MUST be in descending index order)
     * @param _validatorsToAdd Array of new validators to add with their URLs
     * @param _newThreshold New threshold value
     */
    function _updateValidatorsAndThreshold(
        RemoveValidatorInfo[] memory _validatorsToRemove,
        ValidatorInfo[] memory _validatorsToAdd,
        uint256 _newThreshold
    ) internal {
        // Validate descending order of indices for removal to avoid index shifting issues
        // When removing multiple validators, we must process them from highest index to lowest
        if (_validatorsToRemove.length > 1) {
            for (uint256 i = 0; i < _validatorsToRemove.length - 1; i++) {
                if (
                    _validatorsToRemove[i].index <=
                    _validatorsToRemove[i + 1].index
                ) {
                    revert IndicesNotInDescendingOrder();
                }
            }
        }

        // Remove validators (in descending index order to avoid index shifting issues)
        for (uint256 i = 0; i < _validatorsToRemove.length; i++) {
            _removeValidator(
                _validatorsToRemove[i].addr,
                _validatorsToRemove[i].index
            );
        }

        // Add new validators
        for (uint256 i = 0; i < _validatorsToAdd.length; i++) {
            _addValidator(_validatorsToAdd[i].addr, _validatorsToAdd[i].url);
        }

        // Validate the number of validators does not exceed the maximum
        if (validators.length > MAX_VALIDATORS) {
            revert TooManyValidators();
        }

        _updateThreshold(_newThreshold);

        emit ValidatorsAndThresholdUpdated(validators, threshold);
    }

    /**
     * @notice Build message hash for GER verification
     * @dev Virtual function to allow for different hashing schemes in derived contracts
     * @param _globalExitRoot The GER to build message for
     * @return The message hash to be signed by oracle validators
     */
    function _buildGERMessage(
        bytes32 _globalExitRoot
    ) internal pure virtual returns (bytes32) {
        return keccak256(abi.encodePacked(_globalExitRoot));
    }

    /**
     * @notice Validate a GER
     * @dev Validates the GER is not zero, has not been injected before and builds the message hash to verify
     * @param _globalExitRoot The GER to validate
     * @param _signatures The signatures to verify
     */
    function _validateGER(
        bytes32 _globalExitRoot,
        bytes calldata _signatures
    ) internal view {
        // Validate GER is not zero
        if (_globalExitRoot == bytes32(0)) {
            revert GERCannotBeZero();
        }

        // Validate GER has not been injected before
        if (injectedGERs[_globalExitRoot]) {
            revert GERAlreadyInjected();
        }

        // Build the message hash to verify
        bytes32 messageHash = _buildGERMessage(_globalExitRoot);

        // Verify required number of valid signatures
        _verifySignatures(messageHash, _signatures);
    }

    /**
     * @notice Verify signatures meet the threshold requirement
     * @notice Heavily based on the Safe multisig implementation: https://github.com/safe-fndn/safe-smart-account/blob/v1.5.0/contracts/Safe.sol#L287
     * @dev Implements signature verification similar to Safe multisig
     *      - Expects tightly packed signatures (r, s, v) where v is 27 or 28
     *      - Requires exactly `threshold` number of signatures
     *      - Signers must be in ascending address order to prevent duplicate signatures
     *      - ECDSA.recover reverts on invalid signatures and malleable (high-s) signatures
     * @param _messageHash The message hash that was signed
     * @param _signatures Concatenated signatures (65 bytes each: 32 bytes r + 32 bytes s + 1 byte v)
     */
    function _verifySignatures(
        bytes32 _messageHash,
        bytes calldata _signatures
    ) internal view {
        // cache threshold
        uint256 currentThreshold = threshold;

        // Validate signatures length is exactly threshold * 65 bytes
        if (_signatures.length != currentThreshold * 65) {
            revert InvalidSignaturesLength();
        }

        address lastValidator = address(0);
        address currentValidator;

        // Verify each required signature
        for (uint256 i = 0; i < currentThreshold; i++) {
            // Recover the signer address from the i-th 65 bytes signature (r, s, v)
            currentValidator = ECDSA.recover(
                _messageHash,
                _signatures[i * 65:(i + 1) * 65]
            );

            // Validate signer is an authorized oracle validator
            if (!validatorInfo[currentValidator].isValidator) {
                revert ValidatorDoesNotExist();
            }

            // Validate signers are in ascending order (prevents duplicate signatures)
            if (currentValidator <= lastValidator) {
                revert ValidatorsNotOrdered();
            }

            lastValidator = currentValidator;
        }
    }

    ////////////////////
    // View Functions
    ////////////////////

    /**
     * @notice Verify a GER with signatures without injecting it
     * @dev Reverts if the GER or the signatures are not valid
     * @param _globalExitRoot The GER to verify
     * @param _signatures The signatures to verify
     * @return True if the GER is valid
     */
    function verifyGER(
        bytes32 _globalExitRoot,
        bytes calldata _signatures
    ) external view returns (bool) {
        _validateGER(_globalExitRoot, _signatures);
        return true;
    }

    /**
     * @notice Returns the index of an oracle validator in the validators array
     * @dev Reverts if the validator is not found. Used for off-chain index lookups
     * @param _validator Oracle validator address to search for
     * @return The index of the oracle validator
     */
    function getValidatorIndex(
        address _validator
    ) external view returns (uint256) {
        uint256 validatorsLength = validators.length;
        for (uint256 i = 0; i < validatorsLength; ++i) {
            if (validators[i] == _validator) {
                return i;
            }
        }
        revert ValidatorNotFound();
    }

    /**
     * @notice Returns all oracle validators with their information
     * @dev Returns a memory copy of the validators array along with their URLs
     * @return Array of all oracle validators information
     */
    function getValidatorsInfo()
        external
        view
        returns (ValidatorInfo[] memory)
    {
        uint256 validatorsLength = validators.length;
        ValidatorInfo[] memory validatorInfos = new ValidatorInfo[](
            validatorsLength
        );
        for (uint256 i = 0; i < validatorsLength; i++) {
            validatorInfos[i] = ValidatorInfo({
                addr: validators[i],
                url: validatorInfo[validators[i]].url
            });
        }
        return validatorInfos;
    }

    /**
     * @notice Returns the total number of oracle validators
     * @dev More gas-efficient than calling getValidatorsInfo() for just the count
     * @return The count of oracle validators
     */
    function getValidatorsCount() external view returns (uint256) {
        return validators.length;
    }

    /**
     * @notice Returns the version of the contract
     * @return The version of the contract
     */
    function version() external pure returns (string memory) {
        return VERSION_AGG_ORACLE_COMMITTEE_V2;
    }

    /**
     * @notice Returns if an address is a validator
     * @param _validator The address to check
     * @return True if the address is a validator
     */
    function isValidator(address _validator) external view returns (bool) {
        return validatorInfo[_validator].isValidator;
    }
}
