/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge } from '@0xpolygonhermez/zkevm-commonjs';
import { PolygonZkEVMGlobalExitRoot, AgglayerManagerGER } from '../../typechain-types';

const MerkleTreeBridge = MTBridge;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'uint64'],
        [newGlobalExitRoot, lastBlockHash, timestamp],
    );
}
describe('Polygon Global exit root v2', () => {
    let rollupManager: any;
    let bridge: any;

    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;
    let polygonZkEVMGlobalExitRootV2: AgglayerManagerGER;

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [, bridge, rollupManager] = await ethers.getSigners();

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [rollupManager.address, bridge.address],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as any;

        expect(await polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.equal(rollupManager.address);

        const PolygonZkEVMGlobalExitRootV2Factory = await ethers.getContractFactory('AgglayerManagerGER');
        await upgrades.upgradeProxy(polygonZkEVMGlobalExitRoot.target, PolygonZkEVMGlobalExitRootV2Factory, {
            constructorArgs: [rollupManager.address, bridge.address],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        polygonZkEVMGlobalExitRootV2 = (await PolygonZkEVMGlobalExitRootV2Factory.attach(
            polygonZkEVMGlobalExitRoot.target,
        )) as AgglayerManagerGER;
    });

    it('should check the initialized parameters', async () => {
        expect(await polygonZkEVMGlobalExitRootV2.bridgeAddress()).to.be.equal(bridge.address);
        expect(await polygonZkEVMGlobalExitRootV2.rollupManager()).to.be.equal(rollupManager.address);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.reverted;

        expect(await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot()).to.be.equal(ethers.ZeroHash);
        expect(await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);
        expect(await polygonZkEVMGlobalExitRootV2.version()).to.be.equal('v1.0.0');
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.hexlify(ethers.randomBytes(32));
        await expect(polygonZkEVMGlobalExitRootV2.updateExitRoot(newRootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRootV2,
            'OnlyAllowedContracts',
        );
        const blockUpdates = [];
        // Update Exit root
        const updateExitRoot = await polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(newRootRollup);
        // Retrieve l1InfoRoot
        const currentL1InfoRoot = await polygonZkEVMGlobalExitRootV2.getRoot();
        // Retrieve depositCount
        const depositCount = await polygonZkEVMGlobalExitRootV2.depositCount();

        // Retrieve parentHash and timestamp
        const blockInfo = await ethers.provider.getBlock(updateExitRoot?.blockHash as any);

        // Check event
        await expect(updateExitRoot)
            .to.emit(polygonZkEVMGlobalExitRootV2, 'UpdateL1InfoTree')
            .withArgs(ethers.ZeroHash, newRootRollup);

        await expect(updateExitRoot)
            .to.emit(polygonZkEVMGlobalExitRootV2, 'UpdateL1InfoTreeV2')
            .withArgs(currentL1InfoRoot, depositCount, blockInfo?.parentHash, blockInfo?.timestamp);

        blockUpdates.push({
            block: await ethers.provider.getBlock('latest'),
            globalExitRoot: calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup),
        });

        expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup),
        );

        // Update root from the PolygonZkEVMBridge
        const newRootBridge = ethers.hexlify(ethers.randomBytes(32));
        // Update Bridge Exit root
        const updateBridgeExitRoot = await polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(newRootBridge);
        // Retrieve l1InfoRoot
        const newUpdatedL1InfoRoot = await polygonZkEVMGlobalExitRootV2.getRoot();
        // Retrieve depositCount
        const newDepositCount = await polygonZkEVMGlobalExitRootV2.depositCount();
        // Retrieve parentHash and timestamp
        const newBlockInfo = await ethers.provider.getBlock(updateBridgeExitRoot?.blockHash as any);

        await expect(updateBridgeExitRoot)
            .to.emit(polygonZkEVMGlobalExitRootV2, 'UpdateL1InfoTree')
            .withArgs(newRootBridge, newRootRollup);

        await expect(updateBridgeExitRoot)
            .to.emit(polygonZkEVMGlobalExitRootV2, 'UpdateL1InfoTreeV2')
            .withArgs(newUpdatedL1InfoRoot, newDepositCount, newBlockInfo?.parentHash, newBlockInfo?.timestamp);

        const newGlobalExitRoot = calculateGlobalExitRoot(newRootBridge, newRootRollup);
        blockUpdates.push({
            block: await ethers.provider.getBlock('latest'),
            globalExitRoot: newGlobalExitRoot,
        });

        expect(await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot()).to.be.equal(newRootBridge);

        expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(newGlobalExitRoot);

        // Check the leaf created
        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // eslint-disable-next-line no-restricted-syntax
        for (const blockStruct of blockUpdates) {
            const { block, globalExitRoot } = blockStruct as any;
            const currentBlockNumber = block?.number;
            const previousBlock = await ethers.provider.getBlock((currentBlockNumber as number) - 1);
            const leafValueJs = calculateGlobalExitRootLeaf(globalExitRoot, previousBlock?.hash, block?.timestamp);
            const leafValueSC = await polygonZkEVMGlobalExitRootV2.getLeafValue(
                globalExitRoot,
                previousBlock?.hash as any,
                block?.timestamp as any,
            );

            expect(leafValueJs).to.be.equal(leafValueSC);
            merkleTree.add(leafValueJs);
        }

        const rootSC = await polygonZkEVMGlobalExitRootV2.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });
    it('should synch every root through events', async () => {});
});
