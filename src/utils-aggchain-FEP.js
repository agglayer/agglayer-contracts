/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');

/// //////////////////////////////////
/// // Constants for Aggchain FEP ////
/// //////////////////////////////////

// aggchain type selector for FEP
const AGGCHAIN_TYPE_FEP = '0x0001';

/// //////////////////////////////////
/// // Functions for Aggchain FEP ////
/// //////////////////////////////////

/**
 * Function to encode the initialize bytes for the custom chain (version 0 --> initializerVersion = 0)
 * @param {Object} initParams initialization parameters
 * @param {Boolean} useDefaultGateway use owned gateway
 * @param {String} initOwnedAggchainVKey initial owned aggchain Vkey
 * @param {String} initAggchainVKeySelector initial aggchain Vkey selector
 * @param {String} vKeyManager vkey manager address
 * @param {String} admin admin address
 * @param {String} trustedSequencer trusted sequencer address
 * @param {String} gasTokenAddress gas token address
 * @param {String} trustedSequencerURL trusted sequencer URL
 * @param {String} networkName network name
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesAggchainFEPv0(
    initParams,
    useDefaultGateway,
    initOwnedAggchainVKey,
    initAggchainVKeySelector,
    vKeyManager,
    admin,
    trustedSequencer,
    gasTokenAddress,
    trustedSequencerURL,
    networkName,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        [
            'tuple(uint256, bytes32, bytes32, uint256, uint256, uint256, address, bytes32, bytes32)',
            'bool',
            'bytes32',
            'bytes4',
            'address',
            'address',
            'address',
            'address',
            'string',
            'string',
        ],
        [
            Object.values(initParams),
            useDefaultGateway,
            initOwnedAggchainVKey,
            initAggchainVKeySelector,
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
 * @param {Object} initParams initialization parameters
 * @param {Boolean} useDefaultGateway use owned gateway
 * @param {String} initOwnedAggchainVKey initial owned aggchain Vkey
 * @param {String} initAggchainVKeySelector initial aggchain Vkey version
 * @param {String} vKeyManager vkey manager address
 */
function encodeInitializeBytesAggchainFEPv1(
    initParams,
    useDefaultGateway,
    initOwnedAggchainVKey,
    initAggchainVKeySelector,
    vKeyManager,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        [
            'tuple(uint256, bytes32, bytes32, uint256, uint256, uint256, address, bytes32, bytes32)',
            'bool',
            'bytes32',
            'bytes4',
            'address',
        ],
        [
            Object.values(initParams),
            useDefaultGateway,
            initOwnedAggchainVKey,
            initAggchainVKeySelector,
            vKeyManager,
        ],
    );
}

/**
 * Function to encode the custom chain data for the `getAggchainHash` & `onVerifyPessimistic` functions
 * @param {String} aggchainVKeySelector aggchain vkey version
 * @param {String} outputRoot output root
 * @param {Number} l2BlockNumber L2 block number
 * @returns {String} encoded value in hexadecimal string
 */
function encodeAggchainDataFEP(aggchainVKeySelector, outputRoot, l2BlockNumber) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes4', 'bytes32', 'uint256'],
        [aggchainVKeySelector, outputRoot, l2BlockNumber],
    );
}

/**
 * Compute the aggchain Parameteres hash for FEP
 * @param {String} oldOutputRoot old output root
 * @param {String} newOutputRoot new output root
 * @param {BigInt} l2BlockNumber L2 block number
 * @param {BigInt} rollupConfigHash rollup config hash
 * @param {Bool} optimisticMode flag to optimistic mode
 * @param {String} trustedSequencer trusted sequencer address
 * @param {String} rangeVkeyCommitment rangeVkeyCommitment
 * @param {String} aggregationVkey aggregationVkey
 * @returns aggchain param hash
 */
function computeHashAggchainParamsFEP(
    oldOutputRoot,
    newOutputRoot,
    l2BlockNumber,
    rollupConfigHash,
    optimisticMode,
    trustedSequencer,
    rangeVkeyCommitment,
    aggregationVkey,
) {
    // solidity lkeccak
    return ethers.solidityPackedKeccak256(
        ['bytes32',
            'bytes32',
            'uint256',
            'uint256',
            'bool',
            'address',
            'bytes32',
            'bytes32',
        ],
        [oldOutputRoot,
            newOutputRoot,
            l2BlockNumber,
            rollupConfigHash,
            optimisticMode,
            trustedSequencer,
            rangeVkeyCommitment,
            aggregationVkey,
        ],
    );
}

module.exports = {
    AGGCHAIN_TYPE_FEP,
    encodeInitializeBytesAggchainFEPv0,
    encodeInitializeBytesAggchainFEPv1,
    encodeAggchainDataFEP,
    computeHashAggchainParamsFEP,
};
