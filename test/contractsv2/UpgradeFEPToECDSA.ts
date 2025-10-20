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
    AggchainECDSAMultisig,
    AggchainFEP,
    AgglayerGateway,
} from '../../typechain-types';
import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';

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

        // Create new rollup type for FEP
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPProxy.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                1,
                aggchainFEPProxy.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );

        await rollupManagerContract.connect(admin).attachAggchainToAL(1, 1001, "0x")

        // Create new rollup type for ECDSA
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                2,
                aggchainECDSAContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );

        // Ensure migration works fine.
        await rollupManagerContract.connect(timelock).updateRollup(aggchainFEPProxy.target, 2, "0x")
        
        // TODO: Run asserts
        
    });
});
