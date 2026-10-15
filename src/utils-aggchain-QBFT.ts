import * as ethers from 'ethers';

/// ///////////////////////////////////
/// // Constants for Aggchain QBFT ////
/// ///////////////////////////////////

// aggchain type selector for QBFT
export const AGGCHAIN_TYPE_QBFT = '0x0002';

/// ///////////////////////////////////
/// // Functions for Aggchain QBFT ////
/// ///////////////////////////////////

export interface QbftVote {
    subject: string;
    voter: string;
    add: boolean;
}

/**
 * Function to encode the custom chain data for the `getAggchainHash` & `onVerifyPessimistic` functions
 * @param {String} aggchainVKeySelector aggchain vkey selector [program version 2B | AGGCHAIN_TYPE 2B]
 * @param {String} newBlockHash QBFT on-chain hash of the new last proven block
 * @param {Number|BigInt} newBlockNumber new last proven block number
 * @param {String} newConsensusStateHash consensus state hash after the new last proven block
 * @returns {String} encoded value in hexadecimal string (128 bytes)
 */
export function encodeAggchainDataQBFT(aggchainVKeySelector, newBlockHash, newBlockNumber, newConsensusStateHash) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes4', 'bytes32', 'uint64', 'bytes32'],
        [aggchainVKeySelector, newBlockHash, newBlockNumber, newConsensusStateHash],
    );
}

/**
 * Compute the consensus state hash: keccak256(abi.encode(address[] validators, Vote[] outstanding))
 * @param {String[]} validators validators sorted ascending
 * @param {QbftVote[]} outstandingVotes outstanding votes sorted by (subject, voter) ascending
 * @returns {String} consensus state hash
 */
export function computeConsensusStateHash(validators: string[], outstandingVotes: QbftVote[] = []): string {
    return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['address[]', 'tuple(address subject, address voter, bool add)[]'],
            [validators, outstandingVotes],
        ),
    );
}

/**
 * Compute the chain config hash: keccak256(abi.encode(uint64 chainId, uint64 epochLength, bytes32 genesisBlockHash))
 * @param {Number|BigInt} chainId chain id of the Besu network
 * @param {Number|BigInt} epochLength qbft epoch length
 * @param {String} genesisBlockHash QBFT hash of the starting block
 * @returns {String} chain config hash
 */
export function computeChainConfigHash(chainId, epochLength, genesisBlockHash): string {
    return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint64', 'uint64', 'bytes32'],
            [chainId, epochLength, genesisBlockHash],
        ),
    );
}

/**
 * Compute the aggchain parameters hash for QBFT (168 bytes packed preimage)
 * @param {String} prevBlockHash QBFT on-chain hash of the last proven block
 * @param {String} prevConsensusHash consensus state hash after the last proven block
 * @param {String} newBlockHash QBFT on-chain hash of the new block
 * @param {Number|BigInt} newBlockNumber new block number
 * @param {String} newConsensusHash consensus state hash after the new block
 * @param {String} chainConfigHash chain config hash
 * @returns aggchain param hash
 */
export function computeHashAggchainParamsQBFT(
    prevBlockHash,
    prevConsensusHash,
    newBlockHash,
    newBlockNumber,
    newConsensusHash,
    chainConfigHash,
) {
    // solidity keccak
    return ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'uint64', 'bytes32', 'bytes32'],
        [prevBlockHash, prevConsensusHash, newBlockHash, newBlockNumber, newConsensusHash, chainConfigHash],
    );
}
