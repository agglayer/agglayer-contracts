// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IAggchainBaseEvents {
    /**
     * @dev Emitted when the admin updates the aggchain verification key
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);

    event UpdateAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);

    event UpdateUseOwnedGatewayFlag(bool useOwnedGateway);
}

interface IAggchainBaseErrors {
    error InvalidAggchainVKey();

    error AggchainRouteAlreadyAdded();

    error AggchainRouteNotFound();

    /**
     * @dev Thrown when trying to initialize the incorrect initialize function
     */
    error InvalidInitializeFunction();

    error useOwnedGatewayAlreadySet();
}

interface IAggchainBase is IAggchainBaseErrors, IAggchainBaseEvents {
    function initialize(bytes calldata initializeBytesCustomChain) external;
}
