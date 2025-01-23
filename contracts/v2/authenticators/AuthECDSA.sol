// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../interfaces/IALAuthenticator.sol";
import "../lib/ALAuthenticatorBase.sol";
import "../AggLayerGateway.sol";

contract AuthECDSA is ALAuthenticatorBase, IALAuthenticator {
    // Set the vKeyType of the authenticator
    ISP1VerifierGateway.AuthenticatorVKeyTypes public authenticatorVKeyType =
        ISP1VerifierGateway.AuthenticatorVKeyTypes.ECDSA;
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
        (address _trustedSequencer, bytes32 __authenticatorVKey) = abi.decode(
            initializeBytesCustomChain,
            (address, bytes32)
        );

        // set chain variables
        trustedSequencer = _trustedSequencer;
        _authenticatorVKey = __authenticatorVKey;
    }

    /**
     * Note Return the necessary authenticator information for the proof hashed
     * AuthenticatorHash:
     * Field:           | AUTH_TYPE | authenticatorVKey   | authConfig |
     * length (bits):   |    32     |       256           | 256       |
     * authConfig = keccak256(abi.encodePacked(trusted_sequencer))
     */
    function getAuthenticatorHash(
        bytes calldata aggLayerVerifyParameters,
        bytes memory
    ) external view returns (bytes32) {
        (, , , , , bytes memory proof) = abi.decode(
            aggLayerVerifyParameters,
            (uint32, bytes32, bytes32, bytes32, bytes, bytes)
        );
        // we need to use assembly to load the first 4 bytes of a non dynamic calldata array
        bytes4 selector;
        assembly {
            selector := mload(add(proof, 32)) // load first 4 byes of proof
        }
        return
            keccak256(
                abi.encodePacked(
                    _getAuthenticatorVKey(authenticatorVKeyType, selector),
                    keccak256(abi.encodePacked(trustedSequencer))
                )
            );
    }

    function getAuthenticatorVKey(
        bytes4 selector
    ) external view returns (bytes32) {
        return _getAuthenticatorVKey(authenticatorVKeyType, selector);
    }

    // function to save the customData
    function onVerifyPessimistic(
        bytes memory // customData
    ) external onlyRollupManager {
        // just throw an event
        emit OnVerifyPessimistic();
    }
}
