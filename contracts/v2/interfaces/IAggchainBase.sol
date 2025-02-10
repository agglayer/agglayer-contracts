// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IAggchainBaseEvents {
    /**
     * @dev Emitted when the admin adds an aggchain verification key
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);
    /**
     * @dev Emitted when the admin updates the aggchain verification key
     */
    event UpdateAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);
    /**
     * @dev Emitted when the admin switches the use of the default gateway to manage the aggchain keys
     */
    event UpdateUseDefaultGatewayFlag(bool useDefaultGateway);
}

interface IAggchainBaseErrors {
    // Thrown when trying to add an invalid verification key
    error InvalidAggchainVKey();
    // Thrown when trying to add an aggchain verification key that already exists
    error OwnedAggchainVKeyAlreadyAdded();
    // Thrown when trying to retrieve an aggchain verification key that does not exist
    error OwnedAggchainVKeyNotFound();
    // Thrown when trying to initialize the incorrect initialize function
    error InvalidInitializeFunction();
    // Thrown when trying to enable or disable the default gateway when it is already set
    error UseDefaultGatewayAlreadySet();
    // Thrown when trying to initialize the wrong initialize function
    error InvalidInitializer();
}

interface IAggchainBase is IAggchainBaseErrors, IAggchainBaseEvents {}
