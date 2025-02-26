const ethers = require('ethers');

/// //////////////////////////////
/// // Constants for Aggchain ////
/// //////////////////////////////

// aggchain type constant to define an aggchain using pessimistic proof v0.3.0
const AggchainType = {
    LEGACY: 0,
    GENERIC: 1,
};

const AggchainsContracts = {
    AggchainECDSA: 'AggchainECDSA',
    AggchainFEP: 'AggchainFEP'

};
/// //////////////////////////////
/// // Functions for Aggchain ////
/// //////////////////////////////

/**
 * Compute aggchain hash
 * @param {Number|BigInt} aggchainType agg chain type (ECDSA: 0, FEP: 1)
 * @param {String} aggchainVKey aggchain verification key
 * @param {String} hashAggchainParams hash aggchain params
 * @returns compute aggchain hash
 */
function computeAggchainHash(
    aggchainType,
    aggchainVKey,
    hashAggchainParams,
) {
    // sanity check
    if (Number(aggchainType) !== AggchainType.GENERIC) {
        throw new Error(`Invalid aggchain type for v0.3.0. Must be ${AggchainType.GENERIC}`);
    }

    // solidity keccak
    return ethers.solidityPackedKeccak256(
        ['uint32', 'bytes32', 'bytes32'],
        [aggchainType, aggchainVKey, hashAggchainParams],
    );
}

/**
 * Encodes the final selector for aggchain
 * @param {String} _aggchainVKeySelector aggchain vkey selector
 * @param {String} _aggchainType aggchain selector type (ECDSA:0, FEP: 1)
 * @returns Final selector
 */
function getFinalAggchainVKeySelectorFromType(_aggchainVKeySelector, _aggchainType) {
    // remove "0x" if ot exist on aggchainSelector with startWith method
    const aggchainVKeySelector = _aggchainVKeySelector.startsWith('0x') ? _aggchainVKeySelector.slice(2) : _aggchainVKeySelector;

    // remove "0x" if ot exist on _aggchainType with startWith method
    const aggChainType = _aggchainType.startsWith('0x') ? _aggchainType.slice(2) : _aggchainType;

    // check lenght ois 2 bytes
    if (aggChainType.length !== 4) {
        throw new Error('aggChainType must be 2 bytes long');
    }

    if (aggchainVKeySelector.length !== 4) {
        throw new Error('aggchainVKeySelector must be 2 bytes long');
    }

    return `0x${aggchainVKeySelector}${aggChainType}`;
}

/**
 * Function to encode the initialize bytes for pessimistic or state transition rollups
 * @param {String} admin Admin address
 * @param {String} trustedSequencer Trusted sequencer address
 * @param {String} gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
 * @param {String} trustedSequencerURL Trusted sequencer URL
 * @param {String} networkName L2 network name
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesPessimistic(
    admin,
    sequencer,
    gasTokenAddress,
    sequencerURL,
    networkName,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address', 'string', 'string'],
        [
            admin,
            sequencer,
            gasTokenAddress,
            sequencerURL,
            networkName,
        ],
    );
}

module.exports = {
    AggchainType,
    AggchainsContracts,
    computeAggchainHash,
    getFinalAggchainVKeySelectorFromType,
    encodeInitializeBytesPessimistic,
};
