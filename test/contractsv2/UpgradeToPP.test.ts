/* eslint-disable no-unsafe-optional-chaining */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import {
    ERC20PermitMock,
    VerifierRollupHelperMock,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMGlobalExitRootV2,
    PolygonRollupManagerMock,
    PolygonValidiumEtrog,
    PolygonPessimisticConsensus,
} from '../../typechain-types';
import { encodeInitializeBytesLegacy } from '../../src/utils-common-aggchain';
import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';

const MerkleTreeBridge = MTBridge;
const { getLeafValue } = mtBridgeUtils;

describe('Upgradeable to PPV2', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let beneficiary: any;

    let polTokenContract: ERC20PermitMock;
    let PolygonPPConsensusContract: PolygonPessimisticConsensus;
    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
    let rollupManagerContract: PolygonRollupManagerMock;

    const networkIDMainnet = 0;

    let firstDeployment = true;
    const newCreatedRollupID = 1;
    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const rollupTypeIDPessimistic = 1;

    beforeEach('Deploy contracts & add type pp', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil, beneficiary] =
            await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock');
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy pol
        const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await polTokenFactory.deploy(
            polTokenName,
            polTokenSymbol,
            deployer.address,
            polTokenInitialBalance,
        );

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();

        if ((await upgrades.admin.getInstance()).target !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }

        // deploy AggLayerGateway
        const AggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway');
        const aggLayerGatewayContract = await upgrades.deployProxy(AggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });

        const nonceProxyBridge =
            Number(await ethers.provider.getTransactionCount(deployer.address)) + (firstDeployment ? 3 : 2);

        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyBridge,
        });
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyZkevm,
        });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        // deploy PolygonRollupManager
        const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManagerMock');

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call', 'state-variable-immutable'],
        })) as unknown as PolygonRollupManagerMock;

        await rollupManagerContract.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await expect(
            polygonZkEVMBridgeContract.initialize(
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRoot.target,
                rollupManagerContract.target,
                '0x',
            ),
        )
            .to.emit(polygonZkEVMBridgeContract, 'AcceptProxiedTokensManagerRole')
            .withArgs(ethers.ZeroAddress, deployer.address);

        // Initialize Mock
        await rollupManagerContract.initializeMock(
            trustedAggregator.address,
            admin.address,
            timelock.address,
            emergencyCouncil.address,
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));

        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );

        // Create pessimistic rollup type
        const forkID = 0; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        await rollupManagerContract
            .connect(timelock)
            .addNewRollupType(
                PolygonPPConsensusContract.target,
                verifierContract.target,
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            );
    });

    it('should create rollup type validium & migrate to PP', async () => {
        // Create etrog state transition chain
        const urlSequencer = 'http://zkevm-json-rpc:8123';
        const chainID = 1000;
        const networkName = 'zkevm';
        const forkID = 0;
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const rollupVerifierType = 0;
        const description = 'zkevm test';
        const programVKey = '0x0000000000000000000000000000000000000000000000000000000000000000';

        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;

        // deploy validium consensus
        const validiumEtrogFactory = await ethers.getContractFactory('PolygonValidiumEtrog');
        const validiumEtrogContract = await validiumEtrogFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await validiumEtrogContract.waitForDeployment();

        // Create new rollup type validium
        const newRollupTypeID = 2;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    validiumEtrogContract.target,
                    verifierContract.target,
                    forkID,
                    rollupVerifierType,
                    genesisRandom,
                    description,
                    programVKey,
                ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                newRollupTypeID,
                validiumEtrogContract.target,
                verifierContract.target,
                forkID,
                rollupVerifierType,
                genesisRandom,
                description,
                programVKey,
            );

        // Create rollup
        const newSequencedBatch = 1;
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        const rollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const validiumContract = validiumEtrogFactory.attach(rollupAddress) as PolygonValidiumEtrog;

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(newCreatedRollupID, newRollupTypeID, rollupAddress, chainID, gasTokenAddress)
            .to.emit(validiumContract, 'InitialSequenceBatches')
            .to.emit(rollupManagerContract, 'OnSequenceBatches')
            .withArgs(newCreatedRollupID, newSequencedBatch);

        // Set data availability protocol
        // Create PolygonDataCommittee
        const PolygonDataCommitteeFactory = await ethers.getContractFactory('PolygonDataCommittee');
        const PolygonDataCommittee = (await upgrades.deployProxy(PolygonDataCommitteeFactory, [], {
            unsafeAllow: ['constructor'],
        })) as any as PolygonDataCommittee;
        await expect(validiumContract.connect(admin).setDataAvailabilityProtocol(PolygonDataCommittee.target))
            .to.emit(validiumContract, 'SetDataAvailabilityProtocol')
            .withArgs(PolygonDataCommittee.target);

        // Sequence a batch
        const currentTime = Number((await ethers.provider.getBlock('latest'))?.timestamp);
        const l1InfoTreeLeafCount = 0;

        const l2txData = '0x123456';
        const hashedData = ethers.keccak256(l2txData) as any;
        const sequenceValidium = {
            transactionsHash: hashedData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as PolygonValidiumEtrog.ValidiumBatchDataStruct;

        const expectedAccInputHash = calculateAccInputHashEtrog(
            await validiumContract.lastAccInputHash(),
            hashedData,
            await polygonZkEVMGlobalExitRoot.getRoot(),
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash,
        );
        let message = '0x';
        const walletsDataCommittee = [] as any;
        for (let i = 0; i < 3; i++) {
            const newWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase('test test test test test test test test test test test junk'),
                `m/44'/60'/0'/0/${i}`,
            );
            walletsDataCommittee.push(newWallet);
        }
        // sort wallets
        walletsDataCommittee.sort((walleta: any, walletb: any) => {
            if (ethers.toBigInt(walleta.address) > ethers.toBigInt(walletb.address)) {
                return 1;
            }
            return -1;
        });
        const signedData = expectedAccInputHash;
        for (let i = 0; i < walletsDataCommittee.length; i++) {
            const newSignature = walletsDataCommittee[i].signingKey.sign(signedData);
            message += newSignature.serialized.slice(2);
        }
        let addrBytes = '0x';
        for (let i = 0; i < walletsDataCommittee.length; i++) {
            addrBytes += walletsDataCommittee[i].address.slice(2);
        }
        const dataAvailabilityMessage = message + addrBytes.slice(2);

        const requiredAmountOfSignatures = 3;
        const urls = ['onurl', 'twourl', 'threeurl'];
        const committeeHash = ethers.keccak256(addrBytes);
        await expect(PolygonDataCommittee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes))
            .to.emit(PolygonDataCommittee, 'CommitteeUpdated')
            .withArgs(committeeHash);

        // Approve tokens
        const maticAmount = await rollupManagerContract.getBatchFee();
        await expect(polTokenContract.connect(trustedSequencer).approve(validiumContract.target, maticAmount)).to.emit(
            polTokenContract,
            'Approval',
        );
        await expect(
            validiumContract
                .connect(trustedSequencer)
                .sequenceBatchesValidium(
                    [sequenceValidium],
                    l1InfoTreeLeafCount,
                    currentTime,
                    expectedAccInputHash,
                    trustedSequencer.address,
                    dataAvailabilityMessage,
                ),
        ).to.emit(validiumContract, 'SequenceBatches');

        // Call initMigrationToPP

        // Verify pending sequenced batches
        const pendingState = 0;
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const currentVerifiedBatch = 0;
        const newVerifiedBatch = newSequencedBatch + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        await rollupManagerContract
            .connect(trustedAggregator)
            .verifyBatchesTrustedAggregator(
                newCreatedRollupID,
                pendingState,
                currentVerifiedBatch,
                newVerifiedBatch,
                newLocalExitRoot,
                newStateRoot,
                trustedAggregator.address,
                zkProofFFlonk,
            );

        const rollupData = await rollupManagerContract.rollupIDToRollupDataV2Deserialized(newCreatedRollupID);
        const lastBatchSequenced = rollupData[5];
        const lastBatchVerified = rollupData[6];
        expect(lastBatchSequenced).to.be.equal(lastBatchVerified);

        await expect(
            rollupManagerContract.connect(timelock).initMigrationToPP(newCreatedRollupID, rollupTypeIDPessimistic),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(newCreatedRollupID, rollupTypeIDPessimistic, newVerifiedBatch);

        expect(await rollupManagerContract.isRollupMigratingToPP(newCreatedRollupID)).to.be.true;

        // Verify PP with mock "bootstrapBatch"
        const lastL1InfoTreeLeafCount = await polygonZkEVMGlobalExitRoot.depositCount();
        const newWrongLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const lastLER = rollupData[4];
        const newPPRoot = computeRandomBytes(32);
        const proofPP = '0x00';

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                lastL1InfoTreeLeafCount,
                newWrongLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is zero for pessimistic
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'NewLocalExitRootMustMatchLastLocalExitRoot');

        const prevPP = ethers.ZeroHash;
        const prevLER = ethers.ZeroHash;
        const lastL1InfoTreeRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(lastL1InfoTreeLeafCount);
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                lastL1InfoTreeLeafCount,
                lastLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is zero for pessimistic
            ),
        )
            .to.emit(rollupManagerContract, 'CompletedMigrationToPP')
            .withArgs(newCreatedRollupID)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newCreatedRollupID, 0, ethers.ZeroHash, lastLER, trustedAggregator.address)
            .to.emit(rollupManagerContract, 'VerifyPessimisticStateTransition')
            .withArgs(
                newCreatedRollupID,
                prevPP,
                newPPRoot,
                prevLER,
                lastLER,
                lastL1InfoTreeRoot,
                trustedAggregator.address,
            );

        expect(await rollupManagerContract.isRollupMigratingToPP(newCreatedRollupID)).to.be.false;
    });

    it('should create rollup type validium & migrate to PP all checks', async () => {
        // Create etrog state transition chain
        const urlSequencer = 'http://zkevm-json-rpc:8123';
        const chainID = 1000;
        const networkName = 'zkevm';
        const forkID = 0;
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const rollupVerifierType = 0;
        const description = 'zkevm test';
        const programVKey = '0x0000000000000000000000000000000000000000000000000000000000000000';

        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;

        // deploy validium consensus
        const validiumEtrogFactory = await ethers.getContractFactory('PolygonValidiumEtrog');
        const validiumEtrogContract = await validiumEtrogFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await validiumEtrogContract.waitForDeployment();

        // Create new rollup type validium
        const newRollupTypeID = 2;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    validiumEtrogContract.target,
                    verifierContract.target,
                    forkID,
                    rollupVerifierType,
                    genesisRandom,
                    description,
                    programVKey,
                ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                newRollupTypeID,
                validiumEtrogContract.target,
                verifierContract.target,
                forkID,
                rollupVerifierType,
                genesisRandom,
                description,
                programVKey,
            );

        // Create rollup
        const newSequencedBatch = 1;
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        const rollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const validiumContract = validiumEtrogFactory.attach(rollupAddress) as PolygonValidiumEtrog;

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(newCreatedRollupID, newRollupTypeID, rollupAddress, chainID, gasTokenAddress)
            .to.emit(validiumContract, 'InitialSequenceBatches')
            .to.emit(rollupManagerContract, 'OnSequenceBatches')
            .withArgs(newCreatedRollupID, newSequencedBatch);

        // Set data availability protocol
        // Create PolygonDataCommittee
        const PolygonDataCommitteeFactory = await ethers.getContractFactory('PolygonDataCommittee');
        const PolygonDataCommittee = (await upgrades.deployProxy(PolygonDataCommitteeFactory, [], {
            unsafeAllow: ['constructor'],
        })) as any as PolygonDataCommittee;
        await expect(validiumContract.connect(admin).setDataAvailabilityProtocol(PolygonDataCommittee.target))
            .to.emit(validiumContract, 'SetDataAvailabilityProtocol')
            .withArgs(PolygonDataCommittee.target);

        // Sequence a batch
        const currentTime = Number((await ethers.provider.getBlock('latest'))?.timestamp);
        const l1InfoTreeLeafCount = 0;

        const l2txData = '0x123456';
        const hashedData = ethers.keccak256(l2txData) as any;
        const sequenceValidium = {
            transactionsHash: hashedData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as PolygonValidiumEtrog.ValidiumBatchDataStruct;

        const expectedAccInputHash = calculateAccInputHashEtrog(
            await validiumContract.lastAccInputHash(),
            hashedData,
            await polygonZkEVMGlobalExitRoot.getRoot(),
            currentTime,
            trustedSequencer.address,
            ethers.ZeroHash,
        );
        let message = '0x';
        const walletsDataCommittee = [] as any;
        for (let i = 0; i < 3; i++) {
            const newWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase('test test test test test test test test test test test junk'),
                `m/44'/60'/0'/0/${i}`,
            );
            walletsDataCommittee.push(newWallet);
        }
        // sort wallets
        walletsDataCommittee.sort((walleta: any, walletb: any) => {
            if (ethers.toBigInt(walleta.address) > ethers.toBigInt(walletb.address)) {
                return 1;
            }
            return -1;
        });
        const signedData = expectedAccInputHash;
        for (let i = 0; i < walletsDataCommittee.length; i++) {
            const newSignature = walletsDataCommittee[i].signingKey.sign(signedData);
            message += newSignature.serialized.slice(2);
        }
        let addrBytes = '0x';
        for (let i = 0; i < walletsDataCommittee.length; i++) {
            addrBytes += walletsDataCommittee[i].address.slice(2);
        }
        const dataAvailabilityMessage = message + addrBytes.slice(2);

        const requiredAmountOfSignatures = 3;
        const urls = ['onurl', 'twourl', 'threeurl'];
        const committeeHash = ethers.keccak256(addrBytes);
        await expect(PolygonDataCommittee.setupCommittee(requiredAmountOfSignatures, urls, addrBytes))
            .to.emit(PolygonDataCommittee, 'CommitteeUpdated')
            .withArgs(committeeHash);

        // Approve tokens
        const maticAmount = await rollupManagerContract.getBatchFee();
        await expect(polTokenContract.connect(trustedSequencer).approve(validiumContract.target, maticAmount)).to.emit(
            polTokenContract,
            'Approval',
        );
        await expect(
            validiumContract
                .connect(trustedSequencer)
                .sequenceBatchesValidium(
                    [sequenceValidium],
                    l1InfoTreeLeafCount,
                    currentTime,
                    expectedAccInputHash,
                    trustedSequencer.address,
                    dataAvailabilityMessage,
                ),
        ).to.emit(validiumContract, 'SequenceBatches');

        // create new pessimistic
        const initializeBytesAggchainPP = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await rollupManagerContract
            .connect(admin)
            .attachAggchainToAL(rollupTypeIDPessimistic, chainID + 1, initializeBytesAggchainPP);

        const newPessimiticRollupID = 2;

        // Call initMigrationToPP

        await expect(
            rollupManagerContract.connect(admin).initMigrationToPP(newCreatedRollupID, rollupTypeIDPessimistic),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        // Check OnlyStateTransitionChains
        await expect(
            rollupManagerContract.connect(timelock).initMigrationToPP(newPessimiticRollupID, rollupTypeIDPessimistic),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'OnlyStateTransitionChains');

        // Check AllSequencedMustBeVerified
        await expect(
            rollupManagerContract.connect(timelock).initMigrationToPP(newCreatedRollupID, rollupTypeIDPessimistic),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'NoLERToMigrate');

        // Verify pending sequenced batches
        const pendingState = 0;
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const currentVerifiedBatch = 0;
        const newVerifiedBatch = newSequencedBatch + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        await rollupManagerContract
            .connect(trustedAggregator)
            .verifyBatchesTrustedAggregator(
                newCreatedRollupID,
                pendingState,
                currentVerifiedBatch,
                newVerifiedBatch,
                newLocalExitRoot,
                newStateRoot,
                trustedAggregator.address,
                zkProofFFlonk,
            );

        const rollupData = await rollupManagerContract.rollupIDToRollupDataV2Deserialized(newCreatedRollupID);
        const lastBatchSequenced = rollupData[5];
        const lastBatchVerified = rollupData[6];
        expect(lastBatchSequenced).to.be.equal(lastBatchVerified);

        // Check NewRollupTypeMustBePessimistic
        await expect(
            rollupManagerContract.connect(timelock).initMigrationToPP(newCreatedRollupID, newRollupTypeID), // validium
        ).to.be.revertedWithCustomError(rollupManagerContract, 'NewRollupTypeMustBePessimistic');

        await expect(
            rollupManagerContract.connect(timelock).initMigrationToPP(newCreatedRollupID, rollupTypeIDPessimistic),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(newCreatedRollupID, rollupTypeIDPessimistic, newVerifiedBatch);

        expect(await rollupManagerContract.isRollupMigratingToPP(newCreatedRollupID)).to.be.true;

        // Verify PP with mock "bootstrapBatch"
        const lastL1InfoTreeLeafCount = await polygonZkEVMGlobalExitRoot.depositCount();
        const newWrongLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const lastLER = rollupData[4];
        const newPPRoot = computeRandomBytes(32);
        const proofPP = '0x00';

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                lastL1InfoTreeLeafCount,
                newWrongLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is zero for pessimistic
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'NewLocalExitRootMustMatchLastLocalExitRoot');

        const prevPP = ethers.ZeroHash;
        const prevLER = ethers.ZeroHash;
        const lastL1InfoTreeRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(lastL1InfoTreeLeafCount);
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                lastL1InfoTreeLeafCount,
                lastLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is zero for pessimistic
            ),
        )
            .to.emit(rollupManagerContract, 'CompletedMigrationToPP')
            .withArgs(newCreatedRollupID)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newCreatedRollupID, 0, ethers.ZeroHash, lastLER, trustedAggregator.address)
            .to.emit(rollupManagerContract, 'VerifyPessimisticStateTransition')
            .withArgs(
                newCreatedRollupID,
                prevPP,
                newPPRoot,
                prevLER,
                lastLER,
                lastL1InfoTreeRoot,
                trustedAggregator.address,
            );

        expect(await rollupManagerContract.isRollupMigratingToPP(newCreatedRollupID)).to.be.false;
    });

    it('should create rollup type zkevm etrog & migrate to PP', async () => {
        // Create constants
        const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days
        const LEAF_TYPE_ASSET = 0;
        const networkIDRollup = 1;

        // Create etrog state transition chain
        const urlSequencer = 'http://zkevm-json-rpc:8123';
        const chainID = 1000;
        const networkName = 'zkevm';
        const forkID = 0;
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const rollupVerifierType = 0;
        const description = 'zkevm test';
        const programVKey = '0x0000000000000000000000000000000000000000000000000000000000000000';

        const gasTokenNetwork = 0; // 0 for native token
        const gasTokenAddress = '0x0000000000000000000000000000000000000000';

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory('PolygonZkEVMEtrog');
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Create new rollup type zkevm etrog
        const newRollupTypeID = 2;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    rollupVerifierType,
                    genesisRandom,
                    description,
                    programVKey,
                ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                rollupVerifierType,
                genesisRandom,
                description,
                programVKey,
            );

        // Create rollup
        const newSequencedBatch = 1;
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        const rollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const zkevmContract = PolygonZKEVMV2Factory.attach(rollupAddress) as PolygonValidiumEtrog;

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(newCreatedRollupID, newRollupTypeID, rollupAddress, chainID, gasTokenAddress)
            .to.emit(zkevmContract, 'InitialSequenceBatches')
            .to.emit(rollupManagerContract, 'OnSequenceBatches')
            .withArgs(newCreatedRollupID, newSequencedBatch);

        const blockCreatedRollup = await ethers.provider.getBlock('latest');

        // Assert new rollup created
        const timestampCreatedRollup = blockCreatedRollup?.timestamp;
        expect(await zkevmContract.admin()).to.be.equal(admin.address);
        expect(await zkevmContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await zkevmContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await zkevmContract.networkName()).to.be.equal(networkName);
        expect(await zkevmContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);

        // Cannot create 2 chains with the same chainID
        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'ChainIDAlreadyExist');

        const transaction = await zkevmContract.generateInitializeTransaction(
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
            '0x', // empty metadata
        );

        const expectedAccInputHash = calculateAccInputHashEtrog(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot(),
            timestampCreatedRollup,
            trustedSequencer.address,
            blockCreatedRollup?.parentHash,
        );

        // calcualte accINputHash
        expect(await zkevmContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        const sequencedBatchData = await rollupManagerContract.getRollupSequencedBatches(
            newCreatedRollupID,
            newSequencedBatch,
        );

        expect(sequencedBatchData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBatchData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBatchData.previousLastBatchSequenced).to.be.equal(0);

        // try verify batches
        const l2txData = '0x123456';
        const maticAmount = await rollupManagerContract.getBatchFee();

        const sequence = {
            transactions: l2txData,
            forcedGlobalExitRoot: ethers.ZeroHash,
            forcedTimestamp: 0,
            forcedBlockHashL1: ethers.ZeroHash,
        } as BatchDataStructEtrog;

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(zkevmContract.target, maticAmount)).to.emit(
            polTokenContract,
            'Approval',
        );

        // Sequence Batches
        const currentTime = Number((await ethers.provider.getBlock('latest'))?.timestamp);
        const l1InfoTreeLeafCount = 0;

        const lastBlock = await ethers.provider.getBlock('latest');

        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();

        const expectedAccInputHash2 = calculateAccInputHashEtrog(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            rootSC,
            lastBlock?.timestamp,
            trustedSequencer.address,
            ethers.ZeroHash,
        );

        await expect(
            zkevmContract
                .connect(trustedSequencer)
                .sequenceBatches(
                    [sequence],
                    l1InfoTreeLeafCount,
                    currentTime,
                    expectedAccInputHash2,
                    trustedSequencer.address,
                ),
        ).to.emit(zkevmContract, 'SequenceBatches');

        // calcualte accINputHash
        expect(await zkevmContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Create a new local exit root mocking some bridge
        const tokenName = 'Matic Token';
        const tokenSymbol = 'MATIC';
        const decimals = 18;
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [tokenName, tokenSymbol, decimals],
        );

        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = beneficiary.address;
        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreezkEVM = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        // Add 2 leafs
        merkleTreezkEVM.add(leafValue);
        merkleTreezkEVM.add(leafValue);

        // check merkle root with SC
        const rootzkEVM = merkleTreezkEVM.getRoot();

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const newVerifiedBatch = newSequencedBatch + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBatch = 0;

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        const lastGlobalExitRootS2 = calculateGlobalExitRoot(ethers.ZeroHash, rootRollups);
        const lastBlock2 = await ethers.provider.getBlock('latest');
        const lastBlockHash2 = lastBlock2?.hash;
        const leafValueUpdateGER2 = calculateGlobalExitRootLeaf(
            lastGlobalExitRootS2,
            lastBlockHash2,
            lastBlock2?.timestamp + 5,
        );
        const merkleTreeGLobalExitRoot = new MerkleTreeBridge(height);
        merkleTreeGLobalExitRoot.add(leafValueUpdateGER2);

        await ethers.provider.send('evm_setNextBlockTimestamp', [lastBlock2?.timestamp + 5]);

        // Verify batch
        const verifyBatchesTrustedAggregator = await rollupManagerContract
            .connect(trustedAggregator)
            .verifyBatchesTrustedAggregator(
                newCreatedRollupID,
                pendingState,
                currentVerifiedBatch,
                newVerifiedBatch,
                newLocalExitRoot,
                newStateRoot,
                beneficiary.address,
                zkProofFFlonk,
            );

        const rollupData = await rollupManagerContract.rollupIDToRollupDataV2Deserialized(newCreatedRollupID);

        // Retrieve l1InfoRoot
        const newL1InfoRoot = await polygonZkEVMGlobalExitRoot.getRoot();
        // Retrieve depositCount
        const depositCount = await polygonZkEVMGlobalExitRoot.depositCount();
        // Retrieve parentHash and timestamp
        const blockInfo = await ethers.provider.getBlock(verifyBatchesTrustedAggregator?.blockHash as any);

        await expect(verifyBatchesTrustedAggregator)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newCreatedRollupID, newVerifiedBatch, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateL1InfoTree')
            .withArgs(ethers.ZeroHash, rootRollups)
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateL1InfoTreeV2')
            .withArgs(newL1InfoRoot, depositCount, blockInfo?.parentHash, blockInfo?.timestamp);

        // Call initMigrationToPP
        await expect(
            rollupManagerContract.connect(timelock).initMigrationToPP(newCreatedRollupID, rollupTypeIDPessimistic),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(newCreatedRollupID, rollupTypeIDPessimistic, newVerifiedBatch);

        expect(await rollupManagerContract.isRollupMigratingToPP(newCreatedRollupID)).to.be.true;

        // Verify PP with mock "bootstrapBatch"
        const lastL1InfoTreeLeafCount = await polygonZkEVMGlobalExitRoot.depositCount();
        const newWrongLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const lastLER = rollupData[4];
        const newPPRoot = computeRandomBytes(32);
        const proofPP = '0x00';

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                lastL1InfoTreeLeafCount,
                newWrongLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is zero for pessimistic
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'NewLocalExitRootMustMatchLastLocalExitRoot');

        const prevPP = ethers.ZeroHash;
        const prevLER = ethers.ZeroHash;
        const lastL1InfoTreeRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(lastL1InfoTreeLeafCount);
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                newCreatedRollupID,
                lastL1InfoTreeLeafCount,
                lastLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData is zero for pessimistic
            ),
        )
            .to.emit(rollupManagerContract, 'CompletedMigrationToPP')
            .withArgs(newCreatedRollupID)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(newCreatedRollupID, 0, ethers.ZeroHash, lastLER, trustedAggregator.address)
            .to.emit(rollupManagerContract, 'VerifyPessimisticStateTransition')
            .withArgs(
                newCreatedRollupID,
                prevPP,
                newPPRoot,
                prevLER,
                lastLER,
                lastL1InfoTreeRoot,
                trustedAggregator.address,
            );

        expect(await rollupManagerContract.isRollupMigratingToPP(newCreatedRollupID)).to.be.false;
    });

    /**
     * Compute accumulateInputHash = Keccak256(oldAccInputHash, batchHashData, l1InfoTreeRoot, timestamp, seqAddress)
     * @param {String} oldAccInputHash - old accumulateInputHash
     * @param {String} batchHashData - Batch hash data
     * @param {String} globalExitRoot - Global Exit Root
     * @param {Number} timestamp - Block timestamp
     * @param {String} sequencerAddress - Sequencer address
     * @returns {String} - accumulateInputHash in hex encoding
     */
    function calculateAccInputHashEtrog(
        oldAccInputHash: any,
        batchHashData: any,
        l1InfoTreeRoot: any,
        timestamp: any,
        sequencerAddress: any,
        forcedBlockHash: any,
    ) {
        const hashKeccak = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32', 'bytes32', 'uint64', 'address', 'bytes32'],
            [oldAccInputHash, batchHashData, l1InfoTreeRoot, timestamp, sequencerAddress, forcedBlockHash],
        );

        return hashKeccak;
    }

    function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
        return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
    }

    function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
        return ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32', 'uint64'],
            [newGlobalExitRoot, lastBlockHash, timestamp],
        );
    }
});
