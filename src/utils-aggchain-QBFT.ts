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

/// ////////////////////////////////////////////////////////
/// // Pre-flight validation of the initialization params ////
/// ////////////////////////////////////////////////////////

// Address of the unified bridge, same on L1 and on every L2 genesis
export const DEFAULT_L2_BRIDGE_ADDRESS = '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe';

export interface QbftInitParams {
    startingBlockNumber: number | bigint | string;
    startingBlockHash: string;
    startingValidators: string[];
    startingOutstandingVotes: QbftVote[];
    chainId: number | bigint | string;
    epochLength: number | bigint | string;
}

/**
 * Minimal provider interface needed by the validation (an ethers JsonRpcProvider satisfies it)
 */
export interface RpcSender {
    send(method: string, params: any[]): Promise<any>;
}

/**
 * Fail fast when the multisig configuration would leave the aggchain without a usable committee
 * (the aggsender refuses to produce certificates with an empty committee)
 * @param {Boolean} useDefaultSigners use the signers of the AgglayerGateway
 * @param {Array} signers signers to add
 * @param {Number} threshold multisig threshold
 */
export function checkQbftSignersConfig(useDefaultSigners: boolean, signers: any[] | undefined, threshold: any) {
    const signersLength = signers ? signers.length : 0;
    if (useDefaultSigners) {
        if (signersLength !== 0) {
            throw new Error('useDefaultSigners is true: signers must be empty (the gateway signers are used)');
        }
        return;
    }
    if (signersLength === 0) {
        throw new Error(
            'useDefaultSigners is false and signers is empty: the aggsender would have an empty committee and could never send a certificate. Set at least one signer',
        );
    }
    if (Number(threshold) < 1) {
        throw new Error(`useDefaultSigners is false: threshold must be >= 1, got ${threshold}`);
    }
    if (Number(threshold) > signersLength) {
        throw new Error(`threshold ${threshold} is greater than the number of signers ${signersLength}`);
    }
}

/**
 * Offline checks of the qbftParams that the contract also enforces, with explicit messages
 * @param {QbftInitParams} qbftParams params to initialize AggchainQBFT
 */
export function checkQbftParamsOffline(qbftParams: QbftInitParams) {
    const { startingOutstandingVotes, startingBlockNumber, epochLength, startingValidators } = qbftParams;
    if (BigInt(epochLength) === 0n) {
        throw new Error('qbftParams.epochLength must be > 0');
    }
    if (!startingValidators || startingValidators.length === 0) {
        throw new Error('qbftParams.startingValidators must not be empty');
    }
    if (BigInt(startingBlockNumber) % BigInt(epochLength) === 0n && startingOutstandingVotes.length !== 0) {
        throw new Error(
            `startingBlockNumber ${startingBlockNumber} is genesis/an epoch block (epochLength ${epochLength}): startingOutstandingVotes must be []`,
        );
    }
    if (BigInt(startingBlockNumber) % BigInt(epochLength) !== 0n && startingOutstandingVotes.length === 0) {
        // not an error (the tally may really be empty) but very often a mistake: warn through the caller
        return {
            warnings: [
                'startingBlockNumber is not an epoch block and startingOutstandingVotes is []: make sure the tally has no outstanding votes (see `aggkit-prover-qbft init-params`)',
            ],
        };
    }
    return { warnings: [] as string[] };
}

/**
 * Re-verify the qbftParams against the live L2 (Besu) RPC so a typo cannot brick the chain
 * @param {RpcSender} l2Provider provider of the Besu L2 node
 * @param {QbftInitParams} qbftParams params to initialize AggchainQBFT
 * @param {Object} options.expectedLastLocalExitRoot (migration only) lastLocalExitRoot of the rollup in the AgglayerManager
 * @param {String} options.l2BridgeAddress L2 bridge address (default DEFAULT_L2_BRIDGE_ADDRESS)
 */
export async function verifyQbftInitParamsOnL2(
    l2Provider: RpcSender,
    qbftParams: QbftInitParams,
    options: { expectedLastLocalExitRoot?: string; l2BridgeAddress?: string } = {},
) {
    const blockTag = ethers.toQuantity(BigInt(qbftParams.startingBlockNumber));

    // chain id
    const rpcChainId = BigInt(await l2Provider.send('eth_chainId', []));
    if (rpcChainId !== BigInt(qbftParams.chainId)) {
        throw new Error(`chainId mismatch: qbftParams.chainId=${qbftParams.chainId}, L2 RPC eth_chainId=${rpcChainId}`);
    }

    // starting block hash
    const block = await l2Provider.send('eth_getBlockByNumber', [blockTag, false]);
    if (!block || !block.hash) {
        throw new Error(`Block ${qbftParams.startingBlockNumber} not found on the L2 RPC`);
    }
    if (String(block.hash).toLowerCase() !== qbftParams.startingBlockHash.toLowerCase()) {
        throw new Error(
            `startingBlockHash mismatch at block ${qbftParams.startingBlockNumber}: qbftParams=${qbftParams.startingBlockHash}, L2 RPC=${block.hash}`,
        );
    }

    // validators in force
    const rpcValidators: string[] = await l2Provider.send('qbft_getValidatorsByBlockNumber', [blockTag]);
    const sortedRpc = rpcValidators.map((a) => a.toLowerCase()).sort();
    const given = qbftParams.startingValidators.map((a) => a.toLowerCase());
    if (sortedRpc.length !== given.length || sortedRpc.some((a, i) => a !== given[i])) {
        throw new Error(
            `startingValidators mismatch at block ${qbftParams.startingBlockNumber}: qbftParams=[${given}] (must be sorted ascending), L2 RPC (sorted)=[${sortedRpc}]`,
        );
    }

    // migration: the chosen block must be the one of the last settled LER
    if (options.expectedLastLocalExitRoot !== undefined) {
        const bridge = options.l2BridgeAddress || DEFAULT_L2_BRIDGE_ADDRESS;
        const root = await l2Provider.send('eth_call', [
            { to: bridge, data: ethers.id('getRoot()').slice(0, 10) },
            blockTag,
        ]);
        if (String(root).toLowerCase() !== options.expectedLastLocalExitRoot.toLowerCase()) {
            throw new Error(
                `startingBlockNumber ${qbftParams.startingBlockNumber} is not the last settled block: L2 bridge getRoot()=${root} but the rollup lastLocalExitRoot in the AgglayerManager is ${options.expectedLastLocalExitRoot}. ` +
                    'Choosing another block would skip (or replay) the bridge claims/exits between the last settled block and the chosen one',
            );
        }
    }
}

/**
 * Run all the pre-flight checks of the qbftParams before sending the initialization transaction.
 * The L2 checks are skipped with a loud warning when no L2 RPC url is available.
 * @param {QbftInitParams} qbftParams params to initialize AggchainQBFT
 * @param {Object} options.l2RpcUrl L2 Besu RPC url (falls back to env L2_RPC_URL)
 * @param {Object} options.l2BridgeAddress optional L2 bridge address
 * @param {Object} options.expectedLastLocalExitRoot (migration only) lastLocalExitRoot of the rollup in the AgglayerManager
 * @param {Function} options.warn logger for warnings
 */
export async function preflightQbftInit(
    qbftParams: QbftInitParams,
    options: {
        l2RpcUrl?: string;
        l2BridgeAddress?: string;
        expectedLastLocalExitRoot?: string;
        warn?: (msg: string) => void;
    } = {},
) {
    const warn = options.warn || (() => undefined);
    const { warnings } = checkQbftParamsOffline(qbftParams) as { warnings: string[] };
    warnings.forEach((w) => warn(w));

    const l2RpcUrl = options.l2RpcUrl || process.env.L2_RPC_URL;
    if (!l2RpcUrl) {
        warn(
            '!!! NO L2 RPC URL (aggchainParams.l2RpcUrl / env L2_RPC_URL): startingBlockHash, startingValidators, chainId' +
                ' and the settled LER were NOT verified against the L2. A wrong value bricks the chain !!!',
        );
        return;
    }
    await verifyQbftInitParamsOnL2(new ethers.JsonRpcProvider(l2RpcUrl), qbftParams, {
        expectedLastLocalExitRoot: options.expectedLastLocalExitRoot,
        l2BridgeAddress: options.l2BridgeAddress,
    });
}
