import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { PolygonZkEVMGlobalExitRoot, PolygonZkEVMBridgeV2 } from '../../typechain-types';

const MerkleTreeBridge = MTBridge;
const { verifyMerkleProof, getLeafValue } = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}

describe('PolygonZkEVMBridge Contract claimMessage reentrancy', () => {
    upgrades.silenceWarnings();

    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let deployer: any;
    let rollupManager: any;
    let reentrancyContract: any;

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const LEAF_TYPE_MESSAGE = 1;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as PolygonZkEVMBridgeV2;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            polygonZkEVMBridgeContract.target,
        );

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            '0x',
        );

        // deploy bridgeReentrancy
        const reentrancyContractFactory = await ethers.getContractFactory('BridgeMessageReceiverMock');
        reentrancyContract = await reentrancyContractFactory.deploy(polygonZkEVMBridgeContract.target);
    });

    it('should check the initialize parameters', async () => {
        expect(await polygonZkEVMBridgeContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await polygonZkEVMBridgeContract.networkID()).to.be.equal(networkIDMainnet);
        expect(await polygonZkEVMBridgeContract.polygonRollupManager()).to.be.equal(rollupManager.address);

        // cannot initialzie again
        await expect(
            polygonZkEVMBridgeContract.initialize(
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRoot.target,
                rollupManager.address,
                '0x',
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should 2 claimMessage from Rollup to Mainnet, with reentrancy', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.ZeroAddress;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const deployerAddress = deployer.address;
        // contract with onMessageReceived with .claimMessage
        const reentrancyContractAddress = reentrancyContract.target;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        // add first leaf with destinationAddress == contract
        const leafValue2 = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            reentrancyContractAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue2);
        // add leaf with destinationAddress == deployer
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            deployerAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRoot,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const indexLocal = 1;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // check merkle proof
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup),
        ).to.be.equal(true);

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [
            polygonZkEVMBridgeContract.target,
            ethers.toBeHex(amount + amount),
        ]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(amount + amount);

        // update reentrancy contract with parameters for claim 2 (destinationAddress == deployer)
        await expect(
            reentrancyContract.updateParameters(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                deployerAddress,
                amount,
                metadata,
            ),
        ).to.emit(reentrancyContract, 'UpdateParameters');

        const indexLocal2 = 0;
        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexLocal2);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);

        // claim message with destinationAddress == reentrancyContract
        // ClaimEvent first with destinationAddress == deployer
        // ClaimEvent second with destinationAddress == reentrancyContract
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proofLocal2,
                proofRollup,
                globalIndex2,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                reentrancyContractAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, deployerAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, reentrancyContractAddress, amount);

        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // Try claim again with the same parameters destinationAddress == deployer
        const index2 = 1;
        const proof2 = merkleTreeLocal.getProofTreeByIndex(index2);

        expect(verifyMerkleProof(leafValue, proof2, index2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [polygonZkEVMBridgeContract.target, ethers.toBeHex(amount)]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(amount);

        // Already claimed deployer address
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proof2,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                deployerAddress,
                amount,
                metadata,
            ),
        ).revertedWithCustomError(polygonZkEVMBridgeContract, 'AlreadyClaimed');
    });
});
