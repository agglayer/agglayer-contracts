/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { setCode } from '@nomicfoundation/hardhat-network-helpers';

import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    Address,
    PolygonPessimisticConsensus,
} from '../../typechain-types';

import {
    VerifierType,
    computeInputPessimisticBytes,
    computeConsensusHashEcdsa,
    computeRandomBytes,
} from '../../src/pessimistic-utils';
import { encodeInitializeBytesLegacy } from '../../src/utils-common-aggchain';

describe('Polygon Rollup Manager with Polygon Pessimistic Consensus', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let beneficiary: any;
    let aggLayerAdmin: any;

    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
    let rollupManagerContract: PolygonRollupManagerMock;
    let PolygonPPConsensusContract: PolygonPessimisticConsensus;

    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const PESSIMISTIC_SELECTOR = '0x00000001';
    const randomPessimisticVKey = computeRandomBytes(32);

    // Bridge constants
    const networkIDMainnet = 0;
    let firstDeployment = true;

    // roles
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const ADD_ROLLUP_TYPE_ROLE = ethers.id('ADD_ROLLUP_TYPE_ROLE');
    const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.id('OBSOLETE_ROLLUP_TYPE_ROLE');
    const CREATE_ROLLUP_ROLE = ethers.id('CREATE_ROLLUP_ROLE');
    const ADD_EXISTING_ROLLUP_ROLE = ethers.id('ADD_EXISTING_ROLLUP_ROLE');
    const UPDATE_ROLLUP_ROLE = ethers.id('UPDATE_ROLLUP_ROLE');
    const TRUSTED_AGGREGATOR_ROLE = ethers.id('TRUSTED_AGGREGATOR_ROLE');
    const TRUSTED_AGGREGATOR_ROLE_ADMIN = ethers.id('TRUSTED_AGGREGATOR_ROLE_ADMIN');
    const TWEAK_PARAMETERS_ROLE = ethers.id('TWEAK_PARAMETERS_ROLE');
    const SET_FEE_ROLE = ethers.id('SET_FEE_ROLE');
    const STOP_EMERGENCY_ROLE = ethers.id('STOP_EMERGENCY_ROLE');
    const EMERGENCY_COUNCIL_ROLE = ethers.id('EMERGENCY_COUNCIL_ROLE');
    const EMERGENCY_COUNCIL_ADMIN = ethers.id('EMERGENCY_COUNCIL_ADMIN');

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil, beneficiary, aggLayerAdmin] =
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

        // Initialize aggLayerGateway
        await aggLayerGatewayContract.initialize(
            admin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            PESSIMISTIC_SELECTOR,
            verifierContract.target,
            randomPessimisticVKey,
        );

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

        // deploy polygon rollup manager mock
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

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            '0x',
        );

        // Initialize Mock
        rollupManagerContract.initializeMock(
            trustedAggregator.address,
            admin.address,
            timelock.address,
            emergencyCouncil.address,
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));
    });

    it('should check the initalized parameters', async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther('0.1'));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther('10'));
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.be.equal(0);

        // Check roles
        expect(await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_EXISTING_ROLLUP_ROLE, timelock.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator.address)).to.be.equal(
            true,
        );

        expect(await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE_ADMIN, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(SET_FEE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(
            true,
        );
    });

    it('should add a new rollup type: PolygonConsensusPessimistic', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = ethers.ZeroHash;
        const newRollupTypeID = 1;
        const nonZeroGenesis = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        // sender does not have _ADD_ROLLUP_TYPE_ROLE role
        await expect(
            rollupManagerContract.addNewRollupType(
                PolygonPPConsensusContract.target,
                verifierContract.target,
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        // genesis != 0 on Pessimistic Verifier type
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonPPConsensusContract.target,
                    verifierContract.target,
                    forkID,
                    VerifierType.Pessimistic,
                    nonZeroGenesis,
                    description,
                    programVKey,
                ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');

        // correct add new rollup via timelock
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                PolygonPPConsensusContract.target,
                ethers.ZeroAddress, // verifier address
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                newRollupTypeID,
                PolygonPPConsensusContract.target,
                ethers.ZeroAddress, // verifier address
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonPPConsensusContract.target,
            ethers.ZeroAddress, // verifier address
            forkID,
            VerifierType.Pessimistic,
            false,
            genesis,
            programVKey,
        ];

        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // do obsoleteRollupType
        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            'AddressDoNotHaveRequiredRole',
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, 'ObsoleteRollupType')
            .withArgs(newRollupTypeID);
    });

    it('should create a new rollup: PolygonConsensusPessimistic', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = ethers.ZeroHash;
        const newRollupTypeID = 1;

        // correct add new rollup via timelock
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                PolygonPPConsensusContract.target,
                ethers.ZeroAddress, // verifier address
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                newRollupTypeID,
                PolygonPPConsensusContract.target,
                ethers.ZeroAddress, // verifier address
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            );

        // create new pessimsitic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const newCreatedRollupID = 1;
        const nonExistentRollupID = 4;

        // Only admin can create new zkEVMs
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await expect(
            rollupManagerContract.attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        // rollupTypeID does not exist
        await expect(
            rollupManagerContract
                .connect(admin)
                .attachAggchainToAL(nonExistentRollupID, chainID, initializeBytesAggchain),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'RollupTypeDoesNotExist');

        // create new pessimistic
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });
        const newZkEVMContract = ppConsensusFactory.attach(newZKEVMAddress) as PolygonPessimisticConsensus;

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress);

        // assert new rollup created
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);

        // assert new rollup
        const resRollupData = await rollupManagerContract.rollupIDToRollupDataV2(newCreatedRollupID);

        const expectedRollupData = [
            newZKEVMAddress,
            chainID,
            ethers.ZeroAddress, // verifier address
            forkID,
            ethers.ZeroHash,
            0,
            0,
            0,
            newRollupTypeID,
            VerifierType.Pessimistic,
            ethers.ZeroHash,
            programVKey,
        ];

        expect(expectedRollupData).to.be.deep.equal(resRollupData);
    });

    it('should add an existing rollup: PolygonConsensusPessimistic', async () => {
        // add existing rollup
        const rollupAddress = '0xAa000000000000000000000000000000000000Bb';
        const forkID = 1;
        const chainID = 1;
        const initLER = '0xff000000000000000000000000000000000000000000000000000000000000ff';
        const programVKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const initPessimisticRoot = ethers.id('initPessimisticRoot');

        // add existing rollup: pessimistic type
        const newCreatedRollupID = 1;
        // Add arbitrary bytecode to the implementation
        await setCode(rollupAddress, computeRandomBytes(32));
        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                verifierContract.target,
                forkID,
                chainID,
                initLER,
                VerifierType.Pessimistic,
                programVKey,
                initPessimisticRoot, // initPessimisticRoot
            ),
        )
            .to.emit(rollupManagerContract, 'AddExistingRollup')
            .withArgs(
                newCreatedRollupID,
                forkID,
                rollupAddress,
                chainID,
                VerifierType.Pessimistic,
                0,
                programVKey,
                initPessimisticRoot,
            );
    });

    it('should prevent to update rollup with different VerifierTypes', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = ethers.ZeroHash;
        const newRollupTypeID = 1;

        // correct add new rollup via timelock
        await rollupManagerContract.connect(timelock).addNewRollupType(
            PolygonPPConsensusContract.target,
            ethers.ZeroAddress, // verifier address
            forkID,
            VerifierType.Pessimistic,
            genesis,
            description,
            programVKey,
        );

        // create new pessimsitic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';

        // create new pessimistic
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        rollupManagerContract.connect(admin).attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain);

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory('PolygonZkEVMEtrog');
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const description2 = 'description';
        const chainID2 = 2;
        const stateTransistionRollupID = 2;

        // add new rollup type StateTransistion with programVKey != 0
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                PolygonZKEVMV2Contract.target,
                ethers.ZeroAddress, // verifier address
                forkID,
                VerifierType.StateTransition,
                genesisRandom,
                description2,
                computeRandomBytes(32), // wrong program v key
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');

        // add new rollup type stateTranstion correctly
        const newRollupTypeID2 = 2;

        await rollupManagerContract
            .connect(timelock)
            .addNewRollupType(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                VerifierType.StateTransition,
                genesisRandom,
                description2,
                ethers.ZeroHash,
            );

        // create new rollup
        await rollupManagerContract
            .connect(admin)
            .attachAggchainToAL(newRollupTypeID2, chainID2, initializeBytesAggchain);

        // get rollup data
        const rollupStateTransition = await rollupManagerContract.rollupIDToRollupData(stateTransistionRollupID);

        // try to update rollup from Pessimistic to stateTransition
        // await expect(
        //     rollupManagerContract.connect(timelock).updateRollup(rollupPessimistic[0] as unknown as Address, 2, "0x")
        // ).to.be.revertedWithCustomError(rollupManagerContract, "UpdateNotCompatible");

        // // try to update rollup from StateTransition to Pessimistic
        // await expect(
        //     rollupManagerContract
        //         .connect(timelock)
        //         .updateRollup(rollupStateTransition[0] as unknown as Address, 1, "0x")
        // ).to.be.revertedWithCustomError(rollupManagerContract, "UpdateNotCompatible");

        // try to update rollup with rollupType = 0
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(rollupStateTransition[0] as unknown as Address, 0, '0x'),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'RollupTypeDoesNotExist');

        // try to update rollup with a greater rollupType that the last created
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(rollupStateTransition[0] as unknown as Address, 4, '0x'),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'RollupTypeDoesNotExist');
    });

    it('should update rollup: pessismsitic type', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = ethers.ZeroHash;
        const rollupTypeID = 1;

        // correct add new rollup via timelock
        await rollupManagerContract.connect(timelock).addNewRollupType(
            PolygonPPConsensusContract.target,
            ethers.ZeroAddress, // verifier address
            forkID,
            VerifierType.Pessimistic,
            genesis,
            description,
            programVKey,
        );

        // create new pessimsitic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const pessimisticRollupID = 1;

        // create new pessimistic
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await rollupManagerContract.connect(admin).attachAggchainToAL(rollupTypeID, chainID, initializeBytesAggchain);

        // Try to add a new rollup type
        const newForkID = 11; // just metadata for pessimistic consensus
        const newProgramVKey = ethers.ZeroHash;
        const newRollupTypeID = 2;
        const newVerifier = ethers.ZeroAddress as unknown as Address;

        // correct add new rollup via timelock
        await rollupManagerContract
            .connect(timelock)
            .addNewRollupType(
                PolygonPPConsensusContract.target,
                newVerifier,
                newForkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                newProgramVKey,
            );

        // get rollup data
        const rollupPessimistic = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        // try to update rollup from StateTransition to Pessimistic
        await rollupManagerContract
            .connect(timelock)
            .updateRollup(rollupPessimistic[0] as unknown as Address, newRollupTypeID, '0x');

        // assert new rollup
        const resRollupData = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        const expectedRollupData = [
            newZKEVMAddress,
            chainID,
            newVerifier,
            newForkID,
            ethers.ZeroHash,
            0,
            0,
            0,
            newRollupTypeID,
            VerifierType.Pessimistic,
            ethers.ZeroHash,
            newProgramVKey,
        ];

        expect(expectedRollupData).to.be.deep.equal(resRollupData);
    });

    it('should not allow rollback sequences: pessismsitic type', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const rollupTypeID = 1;

        // correct add new rollup via timelock
        await rollupManagerContract.connect(timelock).addNewRollupType(
            PolygonPPConsensusContract.target,
            ethers.ZeroAddress, // verifier address
            forkID,
            VerifierType.Pessimistic,
            genesis,
            description,
            ethers.ZeroHash, // programVKey
        );

        // create new pessimsitic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const pessimisticRollupID = 1;

        // create new pessimistic
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await rollupManagerContract.connect(admin).attachAggchainToAL(rollupTypeID, chainID, initializeBytesAggchain);

        // get rollup data
        const rollupPessimistic = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        // try to rollback sequences
        await expect(
            rollupManagerContract.connect(admin).rollbackBatches(rollupPessimistic[0] as unknown as Address, 2),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'OnlyStateTransitionChains');
    });

    it('should verify pessimistic proof: pessimistic type', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const rollupTypeID = 1;

        // correct add new rollup via timelock
        await rollupManagerContract.connect(timelock).addNewRollupType(
            PolygonPPConsensusContract.target,
            ethers.ZeroAddress, // verifier address
            forkID,
            VerifierType.Pessimistic,
            genesis,
            description,
            ethers.ZeroHash, // program vkey
        );

        // create new pessimistic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const pessimisticRollupID = 1;

        // create new pessimistic
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await rollupManagerContract.connect(admin).attachAggchainToAL(rollupTypeID, chainID, initializeBytesAggchain);

        // select unexistent global exit root
        const unexistentL1InfoTreeCount = 2;
        const newLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newPPRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const proofPP = `${PESSIMISTIC_SELECTOR}00`;

        // not trusted aggregator
        await expect(
            rollupManagerContract.verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                unexistentL1InfoTreeCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        // global exit root does not exist
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                unexistentL1InfoTreeCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'L1InfoTreeLeafCountInvalid');

        // Check AggchainDataMustBeZeroForPessimisticVerifierType
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                unexistentL1InfoTreeCount,
                newLER,
                newPPRoot,
                proofPP,
                computeRandomBytes(32), // customChainData random bytes, invalid
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AggchainDataMustBeZeroForPessimisticVerifierType');

        // create a bridge to generate a new GER and add another value in the l1IfoRootMap
        const tokenAddress = ethers.ZeroAddress;
        const amount = ethers.parseEther('1');
        await polygonZkEVMBridgeContract.bridgeAsset(
            pessimisticRollupID,
            polTokenContract.target,
            amount,
            tokenAddress,
            true,
            '0x',
            {
                value: amount,
            },
        );

        // get last L1InfoTreeLeafCount
        const lastL1InfoTreeLeafCount = await polygonZkEVMGlobalExitRoot.depositCount();
        const lastL1InfoTreeRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(0);

        // check JS function computeInputPessimisticBytes
        const inputPessimisticBytes = await rollupManagerContract.getInputPessimisticBytes(
            pessimisticRollupID,
            lastL1InfoTreeRoot,
            newLER,
            newPPRoot,
            '0x', // aggchainData
        );

        const infoRollup = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        const consensusHash = computeConsensusHashEcdsa(trustedSequencer.address);

        const expectedInputPessimsiticBytes = computeInputPessimisticBytes(
            infoRollup[4],
            infoRollup[10],
            lastL1InfoTreeRoot,
            pessimisticRollupID,
            consensusHash,
            newLER,
            newPPRoot,
        );

        expect(inputPessimisticBytes).to.be.equal(expectedInputPessimsiticBytes);

        // verify pessimistic
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                lastL1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        )
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(pessimisticRollupID, 0, ethers.ZeroHash, newLER, trustedAggregator.address);

        // assert rollup data
        const resRollupData = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        const expectedRollupData = [
            newZKEVMAddress,
            chainID,
            ethers.ZeroAddress, // verifier address
            forkID,
            newLER,
            0,
            0,
            0,
            rollupTypeID,
            VerifierType.Pessimistic,
            newPPRoot,
            ethers.ZeroHash, // programVkey
        ];

        expect(expectedRollupData).to.be.deep.equal(resRollupData);

        // not allow verifyBatchesTrustedAggregator from a Pessimistic chain
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    pessimisticRollupID,
                    0,
                    0,
                    0,
                    newLER,
                    newPPRoot,
                    beneficiary.address,
                    new Array(24).fill(ethers.ZeroHash),
                ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'OnlyStateTransitionChains');

        // pendingstate != 0
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    pessimisticRollupID,
                    42,
                    0,
                    0,
                    newLER,
                    newPPRoot,
                    beneficiary.address,
                    new Array(24).fill(ethers.ZeroHash),
                ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'PendingStateNumExist');
    });

    it('should not verify pessimistic proof from stateTransistion chain', async () => {
        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory('PolygonZkEVMEtrog');
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const genesisRandom = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const description = 'description';
        const forkID = 1;
        const chainID = 1;
        const stateTransistionRollupID = 1;

        // add new rollup type stateTranstion correctly
        const newRollupTypeID = 1;

        await rollupManagerContract
            .connect(timelock)
            .addNewRollupType(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                VerifierType.StateTransition,
                genesisRandom,
                description,
                ethers.ZeroHash,
            );

        // create new rollup
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await rollupManagerContract
            .connect(admin)
            .attachAggchainToAL(newRollupTypeID, chainID, initializeBytesAggchain);

        // try to verify
        const unexistentL1InfoTreeLeafcount = 2;
        const newLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newPPRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const proofPP = '0x00';

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                stateTransistionRollupID,
                unexistentL1InfoTreeLeafcount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'StateTransitionChainsNotAllowed');
    });
});
