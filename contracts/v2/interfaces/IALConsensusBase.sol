// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IALConsensusBaseEvents {
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
     * @dev Emitted when the admin updates the consensu verification key
     */
    event SetConsensusVKey(bytes32 newConsensusVKey);
}

interface IALConsensusBaseErrors {
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

interface IALConsensusBase is IALConsensusBaseErrors, IALConsensusBaseEvents {
    function initialize(
        bytes32 _consensusVKey,
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) external;

    function admin() external returns (address);
}
