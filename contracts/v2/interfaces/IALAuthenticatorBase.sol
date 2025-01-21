// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IALAuthenticatorBaseEvents {
    /**
     * @dev Emitted when the admin updates the trusted sequencer address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when the admin updates the sequencer URL
     */
    event SetTrustedSequencerURL(string newTrustedSequencerURL);

    /**
     * @dev Emitted when the admin starts the two-step transfer role setting a new pending admin
     */
    event TransferAdminRole(address newPendingAdmin);

    /**
     * @dev Emitted when the pending admin accepts the admin role
     */
    event AcceptAdminRole(address newAdmin);

    /**
     * @dev Emitted when the admin updates the authenticator verification key
     */
    event SetAuthenticatorVKey(bytes32 newAuthenticatorVKey);
}

interface IALAuthenticatorBaseErrors {
    /**
     * @dev Thrown when the caller is not the admin
     */
    error OnlyAdmin();

    /**
     * @dev Thrown when the caller is not the pending admin
     */
    error OnlyPendingAdmin();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error OnlyRollupManager();
}

interface IALAuthenticatorBase is
    IALAuthenticatorBaseErrors,
    IALAuthenticatorBaseEvents
{
    function initialize(
        bytes calldata initializeBytesCustomChain
    ) external;

    function admin() external returns (address);

    function getAuthenticatorVKey() external returns (bytes32);
}
