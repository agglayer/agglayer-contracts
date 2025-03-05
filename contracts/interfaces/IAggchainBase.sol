// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IAggchainBaseEvents {
    /**
     * @notice Emitted when the admin adds an aggchain verification key.
     * @param selector The selector of the verification key to add.
     * @param newAggchainVKey The new aggchain verification key.
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);
    /**
     * @notice Emitted when the admin updates the aggchain verification key.
     * @param selector The selector of the verification key to update.
     * @param previousAggchainVKey The previous aggchain verification key.
     * @param newAggchainVKey The new new aggchain verification key.
     */
    event UpdateAggchainVKey(
        bytes4 selector,
        bytes32 previousAggchainVKey,
        bytes32 newAggchainVKey
    );
    /**
     * @notice Emitted when the admin set the flag useDefaultGateway to true.
     */
    event EnableUseDefaultGatewayFlag();

    /**
     * @notice Emitted when the admin set the flag useDefaultGateway to false.
     */
    event DisableUseDefaultGatewayFlag();

    /**
     * @notice Emitted when the vKeyManager starts the two-step transfer role setting a new pending vKeyManager.
     * @param newVKeyManager The new vKeyManager.
     */
    event TransferVKeyManagerRole(address newVKeyManager);
    /**
     * @notice Emitted when the pending vKeyManager accepts the vKeyManager role.
     * @param newVKeyManager The new vKeyManager.
     * @param oldVKeyManager The previous vKeyManager.
     */
    event AcceptVKeyManagerRole(address oldVKeyManager, address newVKeyManager);
}

interface IAggchainBaseErrors {
    /// @notice Thrown when trying to add zero value verification key.
    error ZeroValueAggchainVKey();
    /// @notice Thrown when trying to add an aggchain verification key that already exists.
    error OwnedAggchainVKeyAlreadyAdded();
    /// @notice Thrown when trying to retrieve an aggchain verification key that does not exist.
    error OwnedAggchainVKeyNotFound();
    /// @notice Thrown when trying to initialize the incorrect initialize function.
    error InvalidInitializeFunction();
    /// @notice Thrown when trying to enable the default gateway when it is already enabled.
    error UseDefaultGatewayAlreadyEnabled();
    /// @notice Thrown when trying to disable the default gateway when it is already disabled.
    error UseDefaultGatewayAlreadyDisabled();
    /// @notice Thrown when trying to call a function that only the VKeyManager can call.
    error OnlyVKeyManager();
    /// @notice Thrown when trying to call a function that only the pending VKeyManager can call.
    error OnlyPendingVKeyManager();
    /// @notice Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists.
    error AggchainVKeyNotFound();
}

/**
 * @title IAggchainBase
 * @notice Shared interface for native aggchain implementations.
 */
interface IAggchainBase is IAggchainBaseErrors, IAggchainBaseEvents {
    /**
     * @notice Gets aggchain hash.
     * @dev Each chain should properly manage its own aggchain hash.
     * @param customChainData Custom chain data to build the consensus hash.
     */
    function getAggchainHash(
        bytes calldata customChainData
    ) external view returns (bytes32);

    /**
     * @notice Callback from the PolygonRollupManager to update the chain's state.
     * @dev Each chain should properly manage its own state.
     * @param data Custom chain data to update chain's state
     */
    function onVerifyPessimistic(bytes calldata data) external;

    /**
     * @notice Initialize function of the aggchain where initial values are set.
     * @param initializeBytesCustomChain Encoded initialize params for the aggchain.
     */
    function initialize(bytes calldata initializeBytesCustomChain) external;

    /// @notice Returns the unique aggchain type identifier.
    function AGGCHAIN_TYPE() external view returns (bytes2);
}
