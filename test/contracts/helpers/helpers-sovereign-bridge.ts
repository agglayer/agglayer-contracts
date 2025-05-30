import { ethers } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { valueToStorageBytes } from '../../../src/utils';

const { getLeafValue } = mtBridgeUtils;
const MerkleTreeBridge = MTBridge;

// Constants
// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

export function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}

export function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

export function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'uint64'],
        [newGlobalExitRoot, lastBlockHash, timestamp],
    );
}

export async function computeWrappedTokenProxyAddress(
    networkId: any,
    tokenAddress: string,
    bridgeContract: any,
    isWETH: boolean,
) {
    const salt = isWETH
        ? ethers.ZeroHash
        : ethers.solidityPackedKeccak256(['uint32', 'address'], [networkId, tokenAddress]);

    const minimalBytecodeProxy = await bridgeContract.INIT_BYTECODE_TRANSPARENT_PROXY();

    const hashInitCode = ethers.solidityPackedKeccak256(['bytes'], [minimalBytecodeProxy]);

    // eslint-disable-next-line @typescript-eslint/return-await
    return await ethers.getCreate2Address(bridgeContract.target as string, salt, hashInitCode);
}

export async function createClaimAndAddGER(
    leafType: any,
    originNetwork: any,
    tokenAddress: any,
    destinationNetwork: any,
    destinationAddress: any,
    amount: any,
    metadata: any,
    sovereignChainGlobalExitRootContract: any,
    sovereignChainBridgeContract: any,
    tokenContract: any,
    _indexLocal: any,
) {
    const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);
    const height = 32;

    let leafValue;
    let rollupLER;
    let mainnetLER;
    let indexRollup = 0;
    const merkleTreeLocal = new MerkleTreeBridge(height);
    const indexLocal = _indexLocal;

    if (originNetwork === 0) {
        // rollupLER
        rollupLER = ethers.ZeroHash;
        // mainnetLER
        leafValue = getLeafValue(
            leafType,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress, // does not really matter
            amount,
            metadataHash,
        );
        for (let i = 0; i < 100; i++) {
            if (i === indexLocal) {
                merkleTreeLocal.add(leafValue);
            } else {
                merkleTreeLocal.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }
        mainnetLER = merkleTreeLocal.getRoot();
    } else {
        // build GER
        indexRollup = originNetwork - 1;
        //   - mainnet LER
        mainnetLER = ethers.ZeroHash;
        //   - rollupLER
        leafValue = getLeafValue(
            leafType,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress, // does not reallty matter
            amount,
            metadataHash,
        );

        for (let i = 0; i < 100; i++) {
            if (i === indexLocal) {
                merkleTreeLocal.add(leafValue);
            } else {
                merkleTreeLocal.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }
        rollupLER = merkleTreeLocal.getRoot();
    }

    // merkle tree rollups
    const merkleTreeRollupLERS = new MerkleTreeBridge(height);
    for (let i = 0; i < 10; i++) {
        if (i === indexRollup) {
            merkleTreeRollupLERS.add(rollupLER);
        } else {
            merkleTreeRollupLERS.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
        }
    }
    const rootRollupsLERS = merkleTreeRollupLERS.getRoot();
    const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetLER, rootRollupsLERS);

    // insert GER
    await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot);

    // claim
    const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
    const proofRollup = merkleTreeRollupLERS.getProofTreeByIndex(indexRollup);
    let globalIndex;
    if (originNetwork === 0) {
        globalIndex = computeGlobalIndex(indexLocal, indexRollup, true);
    } else {
        globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);
    }

    // send assets to the bridge
    const gasTokenAddress = await sovereignChainBridgeContract.gasTokenAddress();
    const gasTokenNetwork = await sovereignChainBridgeContract.gasTokenNetwork();

    // eslint-disable-next-line eqeqeq
    if (gasTokenAddress == tokenAddress && gasTokenNetwork == originNetwork) {
        await ethers.provider.send('hardhat_setBalance', [sovereignChainBridgeContract.target, ethers.toBeHex(amount)]);
    } else if (tokenAddress !== ethers.ZeroAddress) {
        await tokenContract.transfer(sovereignChainBridgeContract.target, amount);
    } else {
        await ethers.provider.send('hardhat_setBalance', [sovereignChainBridgeContract.target, ethers.toBeHex(amount)]);
    }

    return {
        proofLocal,
        proofRollup,
        globalIndex,
        mainnetLER,
        rootRollupsLERS,
    };
}

export async function claimBeforeBridge(
    leafType: any,
    originNetwork: any,
    tokenAddress: any,
    destinationNetwork: any,
    destinationAddress: any,
    amount: any,
    metadata: any,
    sovereignChainGlobalExitRootContract: any,
    sovereignChainBridgeContract: any,
    tokenContract: any,
    _indexLocal: any,
) {
    const res = await createClaimAndAddGER(
        leafType,
        originNetwork,
        tokenAddress,
        destinationNetwork,
        destinationAddress,
        amount,
        metadata,
        sovereignChainGlobalExitRootContract,
        sovereignChainBridgeContract,
        tokenContract,
        _indexLocal,
    );

    await sovereignChainBridgeContract.claimAsset(
        res.proofLocal,
        res.proofRollup,
        res.globalIndex,
        res.mainnetLER,
        res.rootRollupsLERS,
        originNetwork,
        tokenAddress,
        destinationNetwork,
        destinationAddress,
        amount,
        metadata,
    );
}

export function newHashChainValue(prevHashChainValue: any, valueToAdd: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [prevHashChainValue, valueToAdd]);
}

export function newClaimedGlobalIndexValue(globalIndex: any, leafValue: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [valueToStorageBytes(globalIndex), leafValue]);
}

/**
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, batchHashData, globalExitRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} batchHashData - Batch hash data
 * @param {String} globalExitRoot - Global Exit Root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
export function calculateAccInputHashetrog(
    oldAccInputHash: any,
    batchHashData: any,
    globalExitRoot: any,
    timestamp: any,
    sequencerAddress: any,
    forcedBlockHash: any,
) {
    const hashKeccak = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'uint64', 'address', 'bytes32'],
        [oldAccInputHash, batchHashData, globalExitRoot, timestamp, sequencerAddress, forcedBlockHash],
    );

    return hashKeccak;
}
