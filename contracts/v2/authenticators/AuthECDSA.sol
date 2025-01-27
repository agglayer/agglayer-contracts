// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../interfaces/IALAuthenticator.sol";
import "../lib/ALAuthenticatorBase.sol";
import "../AggLayerGateway.sol";

contract AuthECDSA is ALAuthenticatorBase, IALAuthenticator {
    //////////
    // Events
    /////////

    event OnVerifyPessimistic();

    /**
     * @param _rollupManager Rollup manager address
     */
    constructor(
        PolygonRollupManager _rollupManager
    ) ALAuthenticatorBase(_rollupManager) {}

    /**
     * @param initializeBytesCustomChain Encoded params to initialize the chain
     */
    function initialize(
        bytes memory initializeBytesCustomChain
    ) external override onlyRollupManager initializer {
        // custom parsing of the initializeBytesCustomChain
        address _trustedSequencer = abi.decode(
            initializeBytesCustomChain,
            (address)
        );

        // set chain variables
        trustedSequencer = _trustedSequencer;
    }

    /**
     * Note Return the necessary authenticator information for the proof hashed
     * AuthenticatorHash:
     * Field:           | AUTH_TYPE | authenticatorVKey   | authConfig |
     * length (bits):   |    32     |       256           | 256       |
     * authConfig = keccak256(abi.encodePacked(trusted_sequencer))
     */
    function getAuthenticatorHash(
        bytes memory customChainData
    ) external view returns (bytes32) {
        bytes4 selector = abi.decode(customChainData, (bytes4));
        return
            keccak256(
                abi.encodePacked(
                    _getAuthenticatorVKey(selector),
                    keccak256(abi.encodePacked(trustedSequencer))
                )
            );
    }

    function getAuthenticatorVKey(
        bytes4 selector
    ) external view returns (bytes32) {
        return _getAuthenticatorVKey(selector);
    }

    // function to save the customData
    function onVerifyPessimistic(
        bytes memory // customData
    ) external onlyRollupManager {
        // just throw an event
        emit OnVerifyPessimistic();
    }
}
