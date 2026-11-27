/* eslint-disable no-unsafe-optional-chaining */
/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge } from '@0xpolygonhermez/zkevm-commonjs';
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    AgglayerManagerMock,
    AgglayerGER,
    AgglayerBridge,
} from '../../typechain-types';
import { VerifierType } from '../../src/pessimistic-utils';
import {
    DEFAULT_ADMIN_ROLE,
    ADD_ROLLUP_TYPE_ROLE,
    OBSOLETE_ROLLUP_TYPE_ROLE,
    CREATE_ROLLUP_ROLE,
    ADD_EXISTING_ROLLUP_ROLE,
    UPDATE_ROLLUP_ROLE,
    TRUSTED_AGGREGATOR_ROLE,
    TRUSTED_AGGREGATOR_ROLE_ADMIN,
    STOP_EMERGENCY_ROLE,
    EMERGENCY_COUNCIL_ROLE,
    EMERGENCY_COUNCIL_ADMIN,
} from '../../src/constants';

const MerkleTreeBridge = MTBridge;

describe('Polygon Rollup Manager', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;

    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;

    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    // Bridge constants
    const networkIDMainnet = 0;

    let firstDeployment = true;

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil] = await ethers.getSigners();

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

        // deploy AgglayerGateway
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const aggLayerGatewayContract = await upgrades.deployProxy(AgglayerGatewayFactory, [], {
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
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGER');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        // deploy AgglayerManager
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call', 'state-variable-immutable'],
        })) as unknown as AgglayerManagerMock;

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
    });

    it('should check the initialized parameters', async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

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
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(
            true,
        );
        expect(await rollupManagerContract.version()).to.be.equal('v2.0.0');
    });

    it('should check the emergency state', async () => {
        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        await expect(rollupManagerContract.activateEmergencyState()).to.be.revertedWithCustomError(
            rollupManagerContract,
            'HaltTimeoutNotExpired',
        );
        await expect(rollupManagerContract.connect(emergencyCouncil).activateEmergencyState())
            .to.emit(rollupManagerContract, 'EmergencyStateActivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateActivated');

        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(true);

        await expect(
            rollupManagerContract.connect(emergencyCouncil).deactivateEmergencyState(),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        await expect(rollupManagerContract.connect(admin).deactivateEmergencyState())
            .to.emit(rollupManagerContract, 'EmergencyStateDeactivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateDeactivated');

        const timestampDeactivatedEmergency = (await ethers.provider.getBlock('latest'))?.timestamp;

        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.be.equal(
            timestampDeactivatedEmergency,
        );

        expect(await rollupManagerContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);
    });

    it('Should test obsolete rollup', async () => {
        const forkID = 0;
        const genesisRandom = ethers.ZeroHash;
        const rollupVerifierType = VerifierType.ALGateway;
        const description = 'ecdsa multisig test';
        const programVKey = ethers.ZeroHash;
        const zeroVerifier = ethers.ZeroAddress;

        // In order to create a new rollup type, create an implementation of the contract
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const PolygonZKEVMV2Contract = await aggchainECDSAFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            await rollupManagerContract.aggLayerGateway(),
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // StateTransition rollup types can no longer be added
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    VerifierType.StateTransition,
                    ethers.id('genesis'),
                    description,
                    programVKey,
                ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');

        // ALGateway rollup types must have zero verifier, forkID, genesis and programVKey
        const invalidALGatewayParams: any[] = [
            [verifierContract.target, 0, ethers.ZeroHash, ethers.ZeroHash],
            [ethers.ZeroAddress, 1, ethers.ZeroHash, ethers.ZeroHash],
            [ethers.ZeroAddress, 0, ethers.id('genesis'), ethers.ZeroHash],
            [ethers.ZeroAddress, 0, ethers.ZeroHash, ethers.id('vkey')],
        ];
        for (let i = 0; i < invalidALGatewayParams.length; i++) {
            const [verifier, fork, genesis, vKey] = invalidALGatewayParams[i];
            await expect(
                rollupManagerContract
                    .connect(timelock)
                    .addNewRollupType(
                        PolygonZKEVMV2Contract.target,
                        verifier,
                        fork,
                        VerifierType.ALGateway,
                        genesis,
                        description,
                        vKey,
                    ),
            ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');
        }

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    zeroVerifier,
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
                zeroVerifier,
                forkID,
                rollupVerifierType,
                genesisRandom,
                description,
                programVKey,
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            zeroVerifier,
            forkID,
            rollupVerifierType,
            false,
            genesisRandom,
            programVKey,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            'AddressDoNotHaveRequiredRole',
        );

        // Try to obsolete unexisting types
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            'RollupTypeDoesNotExist',
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(2)).to.be.revertedWithCustomError(
            rollupManagerContract,
            'RollupTypeDoesNotExist',
        );

        // added correctly
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, 'ObsoleteRollupType')
            .withArgs(newRollupTypeID);

        // already obsolete
        await expect(
            rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'RollupTypeObsolete');
    });

    it('Should test global exit root', async () => {
        // In order to create a new rollup type, create an implementation of the contract
        expect(await rollupManagerContract.getRollupExitRoot()).to.be.equal(ethers.ZeroHash);

        async function testRollupExitRoot(rollupsRootsArray: any) {
            const height = 32;
            const merkleTree = new MerkleTreeBridge(height);

            await rollupManagerContract.prepareMockCalculateRoot(rollupsRootsArray);
            for (let i = 0; i < rollupsRootsArray.length; i++) {
                merkleTree.add(rollupsRootsArray[i]);
            }
            const rootSC = await rollupManagerContract.getRollupExitRoot();
            const rootJS = merkleTree.getRoot();
            expect(rootSC).to.be.equal(rootJS);
        }

        // put 100
        for (let i = 1; i < 4; i++) {
            const newRootsArray = [];
            for (let j = 0; j < i; j++) {
                newRootsArray.push(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
            await testRollupExitRoot(newRootsArray);
        }
    });
});
