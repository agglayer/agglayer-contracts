// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IAggchainBaseEvents {
    /**
     * @dev Emitted when the admin updates the aggchain verification key
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);

    event UpdateAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);

    event UpdateUseDefaultGatewayFlag(bool useDefaultGateway);
}

interface IAggchainBaseErrors {
    error InvalidAggchainVKey();

    error OwnedAggchainVKeyAlreadyAdded();

    error OwnedAggchainVKeyNotFound();

    /**
     * @dev Thrown when trying to initialize the incorrect initialize function
     */
    error InvalidInitializeFunction();

    error UseDefaultGatewayAlreadySet();
    // Thrown when trying to initialize the wrong initialize function
    error InvalidInitializer();
}

interface IAggchainBase is IAggchainBaseErrors, IAggchainBaseEvents {

}
