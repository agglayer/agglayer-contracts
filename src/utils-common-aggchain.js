const ethers = require('ethers');

/// //////////////////////////////
/// // Constants for Aggchain ////
/// //////////////////////////////

// aggchain type constant to define an aggchain using pessimistic proof v0.3.0
const AGGCHAIN_TYPE = 1;

/// //////////////////////////////
/// // Functions for Aggchain ////
/// //////////////////////////////

/**
 * Compute aggchain hash
 * @param {Number} aggchainType agg chain type (ECDSA: 0, FEP: 1)
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
    if (aggchainType !== AGGCHAIN_TYPE) {
        throw new Error(`Invalid aggchain type for v0.3.0. Must be ${AGGCHAIN_TYPE}`);
    }

    // solidity keccak
    return ethers.solidityPackedKeccak256(
        ['uint32', 'bytes32', 'bytes32'],
        [aggchainType, aggchainVKey, hashAggchainParams],
    );
}

/**
 * Encodes the final selector for aggchain
 * @param {String} _aggChainType aggchain selector type (ECDSA:0, FEP: 1)
 * @param {String} _aggchainSelector aggchain custom selector
 * @returns Final selector
 */
function getFinalAggchainVKeySelectorFromType(_aggChainTypeSelector, _aggchainSelector) {
    // remove "0x" if ot exist on _aggChainTypeSelector with startWith method
    const aggChainType = _aggChainTypeSelector.startsWith('0x') ? _aggChainTypeSelector.slice(2) : _aggChainTypeSelector;

    // remove "0x" if ot exist on aggchainSelector with startWith method
    const aggchainSelector = _aggchainSelector.startsWith('0x') ? _aggchainSelector.slice(2) : _aggchainSelector;

    // check lenght ois 2 bytes
    if (aggChainType.length !== 4) {
        throw new Error('aggChainType must be 2 bytes long');
    }

    if (aggchainSelector.length !== 4) {
        throw new Error('aggchainSelector must be 2 bytes long');
    }

    return `0x${aggChainType}${aggchainSelector}`;
}

module.exports = {
    AGGCHAIN_TYPE,
    computeAggchainHash,
    getFinalAggchainVKeySelectorFromType,
};
