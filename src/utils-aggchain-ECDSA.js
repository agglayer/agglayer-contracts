/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');

/// ////////////////////////////////////
/// // Constants for Aggchain ECDSA ////
/// ////////////////////////////////////

// aggchain type selector for ECDSA
const AGGCHAIN_TYPE_SELECTOR_ECDSA = '0x0000';

/// ////////////////////////////////////
/// // Functions for Aggchain ECDSA ////
/// ////////////////////////////////////

/**
 * Function to encode the initialize bytes for the custom chain (version 0 --> initializerVersion = 0)
 * @param {String} useDefaultGateway Indicates if the default gateway is used
 * @param {String} ownedAggchainVKey Owned aggchain vkey
 * @param {String} aggchainVKeySelectors Aggchain vkey selectors
 * @param {String} vKeyManager vkey manager address
 * @param {String} admin Admin address
 * @param {String} trustedSequencer Trusted sequencer address
 * @param {String} gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
 * @param {String} trustedSequencerURL Trusted sequencer URL
 * @param {String} networkName L2 network name
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesAggchainECDSAv0(
    useDefaultGateway,
    ownedAggchainVKey,
    aggchainVKeySelectors,
    vKeyManager,
    admin,
    trustedSequencer,
    gasTokenAddress,
    trustedSequencerURL,
    networkName,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'bytes32[]', 'bytes4[]', 'address', 'address', 'address', 'address', 'string', 'string'],
        [
            useDefaultGateway,
            ownedAggchainVKey,
            aggchainVKeySelectors,
            vKeyManager,
            admin,
            trustedSequencer,
            gasTokenAddress,
            trustedSequencerURL,
            networkName,
        ],
    );
}

/**
 * Function to encode the initialize bytes for the custom chain (version 1 --> initializerVersion = 1)
 * @param {String} useDefaultGateway Indicates if the default gateway is used
 * @param {String} ownedAggchainVKey Owned aggchain vkey
 * @param {String} aggchainVKeySelectors Aggchain vkey selectors
 * @param {String} vKeyManager vkey manager address
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesAggchainECDSAv1(
    useDefaultGateway,
    ownedAggchainVKey,
    aggchainVKeySelectors,
    vKeyManager,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'bytes32[]', 'bytes4[]', 'address'],
        [
            useDefaultGateway,
            ownedAggchainVKey,
            aggchainVKeySelectors,
            vKeyManager,
        ],
    );
}

/**
 * Function to encode the custom chain data for the `getAggchainHash` & `onVerifyPessimistic` functions
 * @param {String} aggchainVKeySelector aggchain selector
 * @param {String} newStateRoot new state root
 * @returns {String} encoded value in hexadecimal string
 */
function encodeAggchainDataECDSA(aggchainVKeySelector, newStateRoot) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes2', 'bytes32'], [aggchainVKeySelector, newStateRoot]);
}

/**
 *  Compute the aggchain parameters hash for ECDSA
 * @param {String} trustedSequencer Trusted sequencer address
 * @returns {String} hash of encoded value in hexadecimal string (32 bytes)
 */
function computeHashAggchainParamsECDSA(trustedSequencer) {
    return ethers.solidityPackedKeccak256(['address'], [trustedSequencer]);
}

module.exports = {
    AGGCHAIN_TYPE_SELECTOR_ECDSA,
    encodeInitializeBytesAggchainECDSAv0,
    encodeInitializeBytesAggchainECDSAv1,
    encodeAggchainDataECDSA,
    computeHashAggchainParamsECDSA,
};
