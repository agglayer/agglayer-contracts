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
    const programVKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
        const chainId = 1001;
        const forkId = 0;

        // Deploy FEP contract
        const aggchainFEPContract = await aggchainFEPFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );
        await aggchainFEPContract.waitForDeployment();

        // Deploy ECDSA contract
        const aggchainECDSAContract = await aggchainECDSAFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );
        await aggchainECDSAContract.waitForDeployment();

        // Create new rollup type for FEP. ID=1
        await rollupManagerContract.connect(timelock).addNewRollupType(
            aggchainFEPContract.target,
            ethers.ZeroAddress, // verifier
            forkId,
            VerifierType.ALGateway,
            ethers.ZeroHash, // genesis
            '', // description
            ethers.ZeroHash,
        )
        const rollupTypeFEPId = await rollupManagerContract.rollupTypeCount();

        // Create new rollup type for ECDSA. ID=2
        await rollupManagerContract.connect(timelock).addNewRollupType(
            aggchainECDSAContract.target,
            ethers.ZeroAddress, // verifier
            forkId,
            VerifierType.ALGateway,
            ethers.ZeroHash, // genesis
            '', // description
            ethers.ZeroHash,
        )
        const rollupTypeECDSAId = await rollupManagerContract.rollupTypeCount();

        const initializeBytesAggchain = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address'],
            [aggLayerAdmin.address]
        );

        // Attach the FEP aggchain to the AL
        await rollupManagerContract.connect(admin).attachAggchainToAL(rollupTypeFEPId, chainId, initializeBytesAggchain)

        // Get aggchain data
        const rollupID = await rollupManagerContract.chainIDToRollupID(chainId);
        const rollupData = await rollupManagerContract.rollupIDToRollupDataV2(rollupID);
        const aggchainContract = aggchainFEPFactory.attach(rollupData.rollupContract);

        // Initialize FEP contract with proper parameters to avoid latestOutputIndex underflow
        await aggchainContract.connect(aggLayerAdmin).initialize(
            {
                l2BlockTime: 2,
                rollupConfigHash: computeRandomBytes(32),
                startingOutputRoot: computeRandomBytes(32),
                startingBlockNumber: 0,
                startingTimestamp: ((await ethers.provider.getBlock('latest'))?.timestamp || 0) - 100,
                submissionInterval: 10,
                optimisticModeManager: admin.address,
                aggregationVkey: computeRandomBytes(32),
                rangeVkeyCommitment: computeRandomBytes(32),
            },
            [
                // signers
                { addr: trustedSequencer.address, url: 'http://sequencer.example.com' },
                { addr: trustedAggregator.address, url: 'http://aggregator.example.com' },
                { addr: emergencyCouncil.address, url: 'http://council.example.com' }
            ],
            2,     // threshold
            true,  // useDefaultVkeys
            false, // useDefaultSigners
            ethers.ZeroHash,  // initOwnedAggchainVKey (ignored when useDefaultVkeys is true)
            '0x00000000',     // initAggchainVKeySelector (ignored when useDefaultVkeys is true)
            admin.address,    // admin
            trustedSequencer.address, // trustedSequencer
            ethers.ZeroAddress,       // gasTokenAddress
            '',                       // trustedSequencerURL
            ''                        // networkName
        );

        

        // Verify pessimistic for FEP chain
        const lastL1InfoTreeLeafCount = await polygonZkEVMGlobalExitRoot.depositCount();
        const newLER = '0x1111111111111111111111111111111111111111111111111111111111111111';
        const newPPRoot = '0x2222222222222222222222222222222222222222222222222222222222222222';
        const proofPP = `${PESSIMISTIC_SELECTOR}0000000000000000000000000000000000000000000000000000000000000000`;

        // Aggchain data
        const aggchainVKeySelectorForData = '0x12340001';
        const outputRoot = computeRandomBytes(32);
        const l2BlockNumber = 10;

        const aggchainData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes4', 'bytes32', 'uint256'],
            [aggchainVKeySelectorForData, outputRoot, l2BlockNumber]
        );

        // Verify pessimistic proof before the migration to make it more realistic
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                rollupID,
                lastL1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                aggchainData,
            ),
        ).to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(rollupID, 0, ethers.ZeroHash, newLER, trustedAggregator.address);

        // Get the rollup data before migration (FEP)
        const rollupDataBefore = await rollupManagerContract.rollupIDToRollupDataV2(rollupID);
        const rollupTypeDataBefore = await rollupManagerContract.rollupTypeMap(rollupDataBefore.rollupTypeID);
        const implementationContractBefore = aggchainFEPFactory.attach(rollupTypeDataBefore.consensusImplementation);
        const aggchainTypeBefore = await implementationContractBefore.AGGCHAIN_TYPE();
        const totalVerifiedBatchesBefore = await rollupManagerContract.totalVerifiedBatches();
        
        // For completeness. Assert the rollup data before migration (FEP)
        expect(aggchainTypeBefore).to.equal('0x0001');
        expect(totalVerifiedBatchesBefore).to.equal(0);
        expect(rollupDataBefore.rollupTypeID).to.equal(rollupTypeFEPId);
        expect(rollupDataBefore.lastLocalExitRoot).to.equal(newLER);
        expect(rollupDataBefore.rollupVerifierType).to.equal(VerifierType.ALGateway);
        expect(rollupDataBefore.lastBatchSequenced).to.equal(0);
        expect(rollupDataBefore.lastVerifiedBatch).to.equal(0);
        expect(rollupDataBefore.lastPessimisticRoot).to.equal(newPPRoot);

        // Update rollup to ECDSA type (ID=2)
        await rollupManagerContract.connect(timelock).updateRollup(rollupDataBefore.rollupContract, rollupTypeECDSAId, "0x")

        // Get the rollup data after migration (ECDSA)
        const rollupDataAfter = await rollupManagerContract.rollupIDToRollupDataV2(rollupID);
        const rollupTypeDataAfter = await rollupManagerContract.rollupTypeMap(rollupDataAfter.rollupTypeID);
        const implementationContractAfter = aggchainFEPFactory.attach(rollupTypeDataAfter.consensusImplementation);
        const aggchainTypeAfter = await implementationContractAfter.AGGCHAIN_TYPE();
        
        // Ensure the migration was successful
        expect(aggchainTypeAfter).to.equal('0x0000');
        expect(rollupDataAfter.rollupTypeID).to.equal(rollupTypeECDSAId);

        // And that the old parameters are not changed
        expect(rollupDataAfter.lastLocalExitRoot).to.equal(newLER);
        expect(rollupDataAfter.rollupVerifierType).to.equal(VerifierType.ALGateway);
        expect(rollupDataAfter.lastPessimisticRoot).to.equal(newPPRoot);
        expect(rollupDataAfter.chainID).to.equal(chainId);
    });
});
