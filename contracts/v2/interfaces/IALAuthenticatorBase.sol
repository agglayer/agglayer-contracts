// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IALAuthenticatorBaseEvents {

    /**
     * @dev Emitted when the admin updates the authenticator verification key
     */
    event AddAuthenticatorVKey(bytes4 selector, bytes32 newAuthenticatorVKey);

    event UpdateAuthenticatorVKey(bytes4 selector, bytes32 newAuthenticatorVKey);

    event UpdateUseCustomChainGatewayFlag(bool useCustomChainGateway);
}

interface IALAuthenticatorBaseErrors {

    error InvalidAuthVKey();

    error AuthRouteAlreadyAdded();

    error AuthRouteNotFound();
}

interface IALAuthenticatorBase is
    IALAuthenticatorBaseErrors,
    IALAuthenticatorBaseEvents
{
    function initialize(bytes calldata initializeBytesCustomChain) external;

    function getAuthenticatorVKey(
        bytes4 selector
    ) external returns (bytes32);
}
