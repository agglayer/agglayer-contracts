/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
import * as ethers from 'ethers';

/// ////////////////////////////////////
/// // Constants for Aggchain ECDSA Multisig ////
/// ////////////////////////////////////

// aggchain type selector for ECDSA Multisig
export const AGGCHAIN_TYPE_ECDSA_MULTISIG = '0x0002';

/// ////////////////////////////////////
/// // Functions for Aggchain ECDSA Multisig ////
/// ////////////////////////////////////

/**
 * @deprecated Initialize functions are no longer needed as contracts accept direct parameters
 * The initialize() function now takes parameters directly, not through encoding
 */

/**
 * Function to encode the custom chain data for the `getAggchainHash` & `onVerifyPessimistic` functions
 * @param {String} aggchainVKeySelector aggchain selector
 * @returns {String} encoded value in hexadecimal string
 */
export function encodeAggchainDataECDSAMultisig(aggchainVKeySelector) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes4'], [aggchainVKeySelector]);
}

/**
 *  Compute the aggchain parameters hash for ECDSA Multisig
 * @param {String} signersHash Hash of the signers array
 * @param {Number} threshold Required threshold for multisig operations
 * @returns {String} hash of encoded value in hexadecimal string (32 bytes)
 */
export function computeHashAggchainParamsECDSAMultisig(signersHash, threshold) {
    return ethers.solidityPackedKeccak256(['bytes32', 'uint32'], [signersHash, threshold]);
}
