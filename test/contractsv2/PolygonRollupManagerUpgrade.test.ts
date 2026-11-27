/* eslint-disable @typescript-eslint/no-shadow */
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
    PolygonZkEVM,
    PolygonZkEVMExistentEtrog,
    AgglayerGateway,
} from '../../typechain-types';
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

describe('Polygon Rollup manager upgraded', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;

    let polygonZkEVMContract: PolygonZkEVM;
    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;

    const latestVersionRollupManager = 'v2.0.0';
    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const version = '0.0.1';
    const forkID = 0;
    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeout = 100;

    // BRidge constants
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
        const nonceProxyBridge =
            Number(await ethers.provider.getTransactionCount(deployer.address)) + (firstDeployment ? 3 : 2);

        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyBridge,
        });
        const precalculatezkEVM = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyZkevm,
        });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGER');
        polygonZkEVMGlobalExitRoot = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculatezkEVM, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as any;

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as any;

        // deploy PolygonZkEVM
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMUpgraded');
        polygonZkEVMContract = (await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                verifierContract.target,
                polygonZkEVMBridgeContract.target,
                chainID,
                forkID,
                0,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer'],
        })) as any;
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculatezkEVM).to.be.equal(polygonZkEVMContract.target);

        // get previous versions
        const PolygonRollupManagerFactoryV1toV2 = await ethers.getContractFactory('PolygonRollupManagerPreviousV1toV2');
        const PolygonRollupManagerFactoryPrevious = await ethers.getContractFactory('PolygonRollupManagerPrevious');
        const PolygonRollupManagerFactoryPessimistic = await ethers.getContractFactory(
            'PolygonRollupManagerPessimistic',
        );
        const PolygonRollupManagerFactoryCurrent = await ethers.getContractFactory('AgglayerManagerMock');

        rollupManagerContract = PolygonRollupManagerFactoryCurrent.attach(polygonZkEVMContract.target) as any;
        await polygonZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        );

        // Get bridge proxy admin
        const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(polygonZkEVMBridgeContract.target);
        const proxyAdminFactory = await ethers.getContractFactory(
            '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        );
        const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
        const ownerAddress = await proxyAdmin.owner();

        await expect(
            await polygonZkEVMBridgeContract.initialize(
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRoot.target,
                rollupManagerContract.target,
                '0x',
            ),
        )
            .to.emit(polygonZkEVMBridgeContract, 'AcceptProxiedTokensManagerRole')
            .withArgs(ethers.ZeroAddress, ownerAddress);

        expect(await polygonZkEVMBridgeContract.getProxiedTokensManager()).to.be.equal(ownerAddress);

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));

        // DEploy new zkEVM
        const PolygonZkEVMV2ExistentFactory = await ethers.getContractFactory('PolygonZkEVMExistentEtrog');

        const newPolygonZkEVMContract = (await upgrades.deployProxy(PolygonZkEVMV2ExistentFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as any as PolygonZkEVMExistentEtrog;

        // upgrade from V1 to V2
        await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactoryV1toV2, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
            unsafeAllowRenames: true,
            call: {
                fn: 'initialize',
                args: [
                    trustedAggregator.address,
                    pendingStateTimeoutDefault,
                    trustedAggregatorTimeout,
                    admin.address,
                    timelock.address,
                    emergencyCouncil.address,
                    newPolygonZkEVMContract.target,
                    verifierContract.target,
                    forkID,
                    chainID,
                ],
            },
        });

        // upgrade from V2 to Banana
        await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactoryPrevious, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ['constructor', 'missing-initializer', 'state-variable-immutable'],
            unsafeAllowRenames: true,
            unsafeAllowCustomTypes: true,
            unsafeSkipStorageCheck: true,
        });

        // upgrade Banana to pessimistic
        await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactoryPessimistic, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: [
                'constructor',
                'missing-initializer-call',
                'state-variable-immutable',
                'enum-definition',
                'struct-definition',
            ],
            unsafeAllowRenames: true,
            unsafeAllowCustomTypes: true,
            unsafeSkipStorageCheck: true,
        });

        // deploy AgglayerGateway
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const aggLayerGatewayContract = (await upgrades.deployProxy(AgglayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        })) as unknown as AgglayerGateway;

        // upgrade pessimistic to v12 (ALv3, last version with StateTransition support)
        const PolygonRollupManagerFactoryV12 = await ethers.getContractFactory('AgglayerManagerV12');
        await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactoryV12, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call', 'state-variable-immutable'],
            unsafeAllowRenames: true,
            unsafeAllowCustomTypes: true,
            unsafeSkipStorageCheck: true,
            call: {
                fn: 'initialize',
            },
        });

        // upgrade v12 to current: StateTransition rollups can no longer sequence nor verify batches
        await upgrades.upgradeProxy(polygonZkEVMContract.target, PolygonRollupManagerFactoryCurrent, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call', 'state-variable-immutable'],
            unsafeAllowRenames: true,
            unsafeAllowCustomTypes: true,
            unsafeSkipStorageCheck: true,
            call: {
                fn: 'initialize',
            },
        });
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

        expect(await rollupManagerContract.ROLLUP_MANAGER_VERSION()).to.be.equal(latestVersionRollupManager);
    });

    it('should keep the legacy zkEVM StateTransition rollup data after the upgrade', async () => {
        const zkEVMRollupID = 1;
        expect(await rollupManagerContract.rollupCount()).to.be.equal(1);
        const rollupData = await rollupManagerContract.rollupIDToRollupDataV2Deserialized(zkEVMRollupID);
        expect(rollupData.chainID).to.be.equal(chainID);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.rollupVerifierType).to.be.equal(0); // StateTransition
        expect(await rollupManagerContract.getRollupBatchNumToStateRoot(zkEVMRollupID, 0)).to.be.equal(genesisRoot);
        expect(await rollupManagerContract.getLastVerifiedBatch(zkEVMRollupID)).to.be.equal(
            rollupData.lastVerifiedBatch,
        );

        // StateTransition rollup types can no longer be added
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                rollupData.rollupContract,
                verifierContract.target,
                forkID,
                0, // StateTransition
                genesisRoot,
                'zkevm test',
                ethers.ZeroHash,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');
    });

    it('Should test obsolete rollup', async () => {
        const forkID = 0;
        const genesisRandom = ethers.ZeroHash;
        const rollupVerifierType = 2; // ALGateway
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
