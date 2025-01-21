// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../lib/ALAuthenticatorBase.sol";
import "../interfaces/IALAuthenticator.sol";
import "../PolygonVerifierGateway.sol";

contract AuthFEP is ALAuthenticatorBase, IALAuthenticator {
    // final vKey to verify final FEP aggregation
    bytes32 public aggregationVkey;
    bytes32 public chainConfigHash;
    bytes32 public rangeVkeyCommitment;

    struct ChainData {
        bytes32 lastStateRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    ChainData[] public chainData;

    //////////
    // Events
    /////////

    event OnStoreCustomChainData(
        bytes32 lastStateRoot,
        uint128 timestamp,
        uint128 l2BlockNumber
    );

    event OnVerifyPessimistic(
        bytes32 initStateRoot,
        uint128 initTimestamp,
        uint128 initL2BlockNumber
    );

    /**
     * @param _rollupManager TODO
     */
    constructor(
        PolygonRollupManager _rollupManager
    ) ALAuthenticatorBase(_rollupManager) {}

    /**
     * @param initializeBytesCustomChain  Encoded params to initialize the chain
     */
    function initialize(
        bytes memory initializeBytesCustomChain
    ) external override onlyRollupManager initializer {
        // custom parsing of the initializeBytesCustomChain
        (
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber,
            address _admin,
            bytes32 __authenticatorVKey,
            bytes32 _aggregationVkey,
            bytes32 _chainConfigHash,
            bytes32 _rangeVkeyCommitment
        ) = abi.decode(
                initializeBytesCustomChain,
                (
                    bytes32,
                    uint128,
                    uint128,
                    address,
                    bytes32,
                    bytes32,
                    bytes32,
                    bytes32
                )
            );

        // set the admin
        admin = _admin;
        _authenticatorVKey = __authenticatorVKey;
        aggregationVkey = _aggregationVkey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
        // storage chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );
    }

    /**
     * Note Return the necessary authenticator information for the proof hashed
     * AuthenticatorHash:
     * Field:           | AUTH_TYPE | authenticatorVKey   | authConfig |
     * length (bits):   |    32     |       256           | 256       |
     * uint256 auth_config = keccak256(abi.encodePacked(l1Head, l2PreRoot, claimRoot, claimBlockNum, rollupConfigHash, rangeVkeyCommitment, aggregationVkey))
     * @param configParams TODO
     */
    function getAuthenticatorHash(
        bytes memory configParams
    ) external view returns (bytes32) {
        (
            bytes32 l1Head,
            bytes32 l2PreRoot,
            bytes32 claimRoot,
            uint256 claimBlockNum
        ) = abi.decode(configParams, (bytes32, bytes32, bytes32, uint256));
        bytes32 authConfig = keccak256(
            abi.encodePacked(
                l1Head,
                l2PreRoot,
                claimRoot,
                claimBlockNum,
                chainConfigHash,
                rangeVkeyCommitment,
                aggregationVkey
            )
        );

        return
            keccak256(
                abi.encodePacked(
                    AUTH_TYPE,
                    _getAuthenticatorVKey(),
                    chainConfigHash,
                    rangeVkeyCommitment,
                    authConfig
                )
            );
    }

    function getAuthenticatorVKey() external view returns (bytes32) {
        return _getAuthenticatorVKey();
    }

    // function to store the customData
    function storeCustomChainData(
        bytes memory consensusData
    ) external onlyRollupManager {
        // custom parsing of the consensusData
        (bytes32 lastStateRoot, uint128 timestamp, uint128 l2BlockNumber) = abi
            .decode(consensusData, (bytes32, uint128, uint128));

        // store the chain data
        chainData.push(ChainData(lastStateRoot, timestamp, l2BlockNumber));

        // Emit event
        emit OnStoreCustomChainData(lastStateRoot, timestamp, l2BlockNumber);
    }

    /**
     * Note set the verification key of a zkVM program used to verify the execution-proof
     * TODO: add a timelock delay to avoid invalidate proofs
     * TODO: Same for trusted sequencer
     */
    function setAggregationVKey(bytes32 _aggregationVkey) external onlyAdmin {
        aggregationVkey = _aggregationVkey;
    }

    // function to save the customData
    function onVerifyPessimistic(
        bytes memory customData
    ) external onlyRollupManager {
        (
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber
        ) = abi.decode(customData, (bytes32, uint128, uint128));
        // storage chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );

        emit OnVerifyPessimistic(
            initStateRoot,
            initTimestamp,
            initL2BlockNumber
        );
    }
}

// another approach is to get the data from the rollupManager contract
// if the networkID is known, then:
// rollup.lastStateRoot --> call
// newStateRoot --> calldata first context (cannot be read unless it is forwarded)
// newL2BlockNumber --> calldata first context (cannot be read unless it is forwarded)
