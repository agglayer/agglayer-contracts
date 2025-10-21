/* eslint-disable no-unsafe-optional-chaining */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    ERC20PermitMock,
    VerifierRollupHelperMock,
    AgglayerBridge,
    AgglayerGER,
    AgglayerManagerMock,
    IAggchainBase,
    AggchainECDSAMultisig,
    AggchainFEP,
    AgglayerGateway,
} from '../../typechain-types';
import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';
import { encodeInitAggchainManager } from '../../src/utils-common-aggchain';

describe('Upgrade FEP to ECDSA', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let beneficiary: any;
    let aggLayerAdmin: any;

    let polTokenContract: ERC20PermitMock;
    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;
    let aggLayerGatewayContract: AgglayerGateway;

    let aggchainECDSAFactory: any;
    let aggchainFEPFactory: any;

    const networkIDMainnet = 0;

    let firstDeployment = true;
    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const PESSIMISTIC_SELECTOR = '0x00000001';
    const aggchainVKeySelector = '0x12340001';

    beforeEach('Deploy contracts', async () => {
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

        // deploy AgglayerGateway
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        aggLayerGatewayContract = await upgrades.deployProxy(AgglayerGatewayFactory, [], {
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
                ethers.ZeroAddress, // gas token address
                ethers.ZeroAddress, // gas token network
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

        const programVKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        // Create ALGateway rollup type
        // Initialize aggLayerGateway
        await aggLayerGatewayContract.initialize(
            admin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            PESSIMISTIC_SELECTOR,
            verifierContract.target,
            programVKey,
            admin.address, // multisigRole
            [], // signersToAdd
            0, // newThreshold
        );

        // Grant AL_MULTISIG_ROLE to initialize signers
        const AL_MULTISIG_ROLE = ethers.id('AL_MULTISIG_ROLE');
        await aggLayerGatewayContract.connect(admin).grantRole(AL_MULTISIG_ROLE, admin.address);

        // Initialize empty signers to avoid AggchainSignersHashNotInitialized error
        await aggLayerGatewayContract.connect(admin).updateSignersAndThreshold([], [], 0);

        const aggchainVKey = computeRandomBytes(32);

        // Compose selector for generated aggchain verification key
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(aggchainVKeySelector, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(aggchainVKeySelector, aggchainVKey);

        aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
    });

    it('should upgrade FEP to ECDSA', async () => {
        // Deploy FEP behind a proxy
        const aggchainFEPProxy = await upgrades.deployProxy(aggchainFEPFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });
        await aggchainFEPProxy.waitForDeployment();

        // Ensure FEP is upgradable to ECDSA
        await upgrades.upgradeProxy(aggchainFEPProxy, aggchainECDSAFactory, {
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });
    });

    it('should migrate FEP to ECDSA', async () => {
        // Deploy FEP contract directly.
        // TODO: Unsure if it has to be a proxy. With a proxy i get a circular reference when attaching.
        const aggchainFEPContract = await aggchainFEPFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );
        await aggchainFEPContract.waitForDeployment();

        // Deploy ECDSA contract
        const aggchainECDSAContract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });
        await aggchainECDSAContract.waitForDeployment();

        // Create new rollup type for FEP. ID=1
        await rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPContract.target, // Use direct contract instead of proxy
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway, // Back to ALGateway
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            )

        // Create new rollup type for ECDSA. ID=2
        await rollupManagerContract.connect(timelock).addNewRollupType(
            aggchainECDSAContract.target,
            ethers.ZeroAddress, // verifier
            0, // fork id
            VerifierType.ALGateway, // Back to ALGateway
            ethers.ZeroHash, // genesis
            '', // description
            ethers.ZeroHash, // programVKey
        )

        // Attach FEP aggchain to AL with the following parameters
            const initParams = {
                l2BlockTime: 2, // 2 seconds per block
                rollupConfigHash: computeRandomBytes(32),
                startingOutputRoot: computeRandomBytes(32),
                startingBlockNumber: 0,
                startingTimestamp: (await ethers.provider.getBlock('latest'))?.timestamp || 0,
                submissionInterval: 10, // Every 100 blocks
                optimisticModeManager: admin.address,
                aggregationVkey: computeRandomBytes(32),
                rangeVkeyCommitment: computeRandomBytes(32),
            };
    
            // convert init params into array with same order, all params
            const initParamsArray = [
                initParams.l2BlockTime,
                initParams.rollupConfigHash,
                initParams.startingOutputRoot,
                initParams.startingBlockNumber,
                initParams.startingTimestamp,
                initParams.submissionInterval,
                initParams.optimisticModeManager,
                initParams.aggregationVkey,
                initParams.rangeVkeyCommitment,
            ];

        
            const initializeBytesAggchain = ethers.AbiCoder.defaultAbiCoder().encode(
                [
                    'tuple(uint256,bytes32,bytes32,uint256,uint256,uint256,address,bytes32,bytes32)',
                    'bool',
                    'bytes32',
                    'bytes4',
                    'address',
                    'address',
                    'address',
                    'address',
                    'string',
                    'string',
                ],
                [
                    initParamsArray,
                    false, // useDefaultGateway
                    ethers.ZeroHash, // initOwnedAggchainVKey
                    '0x00000001', // initAggchainVKeySelector
                    
                    aggLayerAdmin.address,
                    admin.address,
                    trustedSequencer.address,
                    ethers.ZeroAddress, // gas token address
                    '', // trusted sequencer url
                    '', // network name
                ],
            );

        await rollupManagerContract.connect(admin).attachAggchainToAL(1, 1001, initializeBytesAggchain)
        
        // TODO: Assert stuff in here
        
        // Debug stuff
        const rollupID = await rollupManagerContract.chainIDToRollupID(1001);
        console.log("Rollup ID for chainID 1001:", rollupID.toString());
        
        // Get the actual rollup address that was created
        const rollupDataBefore = await rollupManagerContract.rollupIDToRollupDataV2(rollupID);
        const rollupTypeDataBefore = await rollupManagerContract.rollupTypeMap(rollupDataBefore.rollupTypeID);
        const implementationContractBefore = aggchainFEPFactory.attach(rollupTypeDataBefore.consensusImplementation);
        const aggchainTypeBefore = await implementationContractBefore.AGGCHAIN_TYPE();
        console.log("AGGCHAIN_TYPE()", aggchainTypeBefore);
        console.log("consensusImplementation", rollupTypeDataBefore.consensusImplementation);

        expect(aggchainTypeBefore).to.equal('0x0001');

        // Update rollup to ECDSA type (ID=2)
        await rollupManagerContract.connect(timelock).updateRollup(aggchainFEPContract.target, 2, "0x")

        // Check if the rollup was updated to ECDSA type 0x0000
        const rollupData2 = await rollupManagerContract.rollupIDToRollupDataV2(rollupID);
        const rollupTypeData2 = await rollupManagerContract.rollupTypeMap(rollupData2.rollupTypeID);
        const implementationContract2 = aggchainFEPFactory.attach(rollupTypeData2.consensusImplementation);
        const aggchainType2 = await implementationContract2.AGGCHAIN_TYPE();
        console.log("AGGCHAIN_TYPE()", aggchainType2);
        console.log("consensusImplementation", rollupTypeData2.consensusImplementation);

        expect(aggchainType2).to.equal('0x0000');
    });
});
