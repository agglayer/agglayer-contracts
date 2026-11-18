/* eslint-disable @typescript-eslint/no-shadow */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { setCode } from '@nomicfoundation/hardhat-network-helpers';

import {
    AgglayerGateway,
    ERC20PermitMock,
    AgglayerManagerMock,
    AgglayerGER,
    AgglayerBridge,
    AggchainECDSAMultisig,
    AggchainFEP,
    VerifierRollupHelperMock,
    PolygonPessimisticConsensus,
} from '../../typechain-types';

import {
    CONSENSUS_TYPE,
    encodeInitAggchainManager,
    encodeInitializeBytesLegacy,
    computeAggchainHash,
    computeSignersHash,
} from '../../src/utils-common-aggchain';
import { NO_ADDRESS, AGGCHAIN_DEFAULT_VKEY_ROLE, AL_ADD_PP_ROUTE_ROLE, AL_MULTISIG_ROLE } from '../../src/constants';
import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';

const randomPessimisticVKey = computeRandomBytes(32);

describe('Polygon rollup manager aggregation layer v3 UPGRADED', () => {
    // SIGNERS
    let deployer: any;
    let trustedSequencer: any;
    let trustedAggregator: any;
    let aggchainManager: any;
    let admin: any;
    let timelock: any;
    let emergencyCouncil: any;
    let aggLayerAdmin: any;
    let tester: any;
    let aggchainVKey: any;
    let addPPRoute: any;
    let freezePPRoute: any;

    // CONTRACTS
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;
    let aggLayerGatewayContract: AgglayerGateway;
    let aggchainECDSAImplementationContract: AggchainECDSAMultisig;
    let verifierContract: VerifierRollupHelperMock;
    let PolygonPPConsensusImplementationContract: PolygonPessimisticConsensus;
    let aggchainFEPImplementationContract: AggchainFEP;

    /// CONSTANTS
    const POL_TOKEN_NAME = 'POL Token';
    const POL_TOKEN_SYMBOL = 'POL';
    const POL_INITIAL_BALANCE = ethers.parseEther('20000000');
    // BRIDGE CONSTANTS
    const NETWORK_ID_MAINNET = 0;
    // AGGLAYER CONSTANTS
    const PESSIMISTIC_SELECTOR = '0x00000001';
    // AGGCHAIN CONSTANTS
    // bytes2(version)=0x0001 | bytes2(type)=0x0002 => selector 0x00010002
    const AGGCHAIN_VKEY_SELECTOR = '0x00010002';
    const randomNewStateRoot = computeRandomBytes(32);
    const CUSTOM_DATA_ECDSA = '0x'; // ECDSA Multisig expects empty aggchainData
    upgrades.silenceWarnings();

    async function createPessimisticRollupType() {
        // Create rollup type for pessimistic
        const lastRollupTypeID = await rollupManagerContract.rollupTypeCount();
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                PolygonPPConsensusImplementationContract.target,
                verifierContract.target,
                0, // fork id
                VerifierType.Pessimistic,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                Number(lastRollupTypeID) + 1 /* rollupTypeID */,
                PolygonPPConsensusImplementationContract.target,
                verifierContract.target,
                0, // fork id
                VerifierType.Pessimistic,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );
        return Number(lastRollupTypeID) + 1;
    }
    async function createAggchainRollupType(implementationContract: any) {
        // Create rollup type for  ECDSA
        const lastRollupTypeID = await rollupManagerContract.rollupTypeCount();
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                implementationContract.target,
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
                Number(lastRollupTypeID) + 1 /* rollupTypeID */,
                implementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );
        return Number(lastRollupTypeID) + 1;
    }

    async function createECDSARollup(rollupTypeIdECDSA: number) {
        // For RollupManager tests, we don't need initializeBytesAggchain
        // as it's handled by the contract itself
        // initialize bytes aggchainManager
        const initBytesInitAggchainManager = encodeInitAggchainManager(aggchainManager.address);
        const rollupManagerNonce = await ethers.provider.getTransactionCount(rollupManagerContract.target);
        const rollupsCount = await rollupManagerContract.rollupCount();
        const precomputedAggchainECDSAAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: rollupManagerNonce,
        });
        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(
                rollupTypeIdECDSA, // rollupTypeID
                1001, // chainID
                initBytesInitAggchainManager,
            ),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(
                Number(rollupsCount) + 1, // rollupID
                rollupTypeIdECDSA, // rollupType ID
                precomputedAggchainECDSAAddress,
                1001, // chainID
                NO_ADDRESS, // gasTokenAddress
            );
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAContract = aggchainECDSAFactory.attach(precomputedAggchainECDSAAddress as string) as any;
        // Use explicit function selector to avoid ambiguity
        await aggchainECDSAContract
            .connect(aggchainManager)
            ['initialize(address,address,address,string,string,bool,(address,string)[],uint256)'](
                admin.address,
                trustedSequencer.address,
                ethers.ZeroAddress, // gas token address
                '', // trusted sequencer url
                '', // network name
                false, // useDefaultSigners
                [], // No signers to add initially
                0, // Threshold of 0 initially
            );

        // Initialize signers hash with empty signers (required for getAggchainHash to work)
        await aggchainECDSAContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        return [Number(rollupsCount) + 1, precomputedAggchainECDSAAddress];
    }

    beforeEach('Deploy contract', async () => {
        // load signers
        [
            deployer,
            trustedSequencer,
            trustedAggregator,
            admin,
            aggchainManager,
            timelock,
            emergencyCouncil,
            aggLayerAdmin,
            tester,
            aggchainVKey,
            addPPRoute,
            freezePPRoute,
        ] = await ethers.getSigners();

        // Deploy L1 contracts
        // deploy pol token contract
        const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await polTokenFactory.deploy(
            POL_TOKEN_NAME,
            POL_TOKEN_SYMBOL,
            deployer.address,
            POL_INITIAL_BALANCE,
        );

        // deploy AgglayerBridge, it's no initialized yet because rollupManager and globalExitRootManager addresses are not set yet (not deployed)
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as any;

        // Deploy aggLayerGateway and initialize it
        const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        aggLayerGatewayContract = (await upgrades.deployProxy(aggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer'],
        })) as any;

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock');
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // Initialize aggLayerGateway
        await aggLayerGatewayContract.initialize(
            admin.address,
            aggchainVKey.address,
            addPPRoute.address,
            freezePPRoute.address,
            PESSIMISTIC_SELECTOR,
            verifierContract.target,
            randomPessimisticVKey,
            admin.address, // multisigRole
            [], // signersToAdd
            0, // newThreshold
        );

        // Grant AL_MULTISIG_ROLE to initialize signers
        await aggLayerGatewayContract.connect(admin).grantRole(AL_MULTISIG_ROLE, admin.address);

        // Initialize empty signers to avoid AggchainSignersHashNotInitialized error
        await aggLayerGatewayContract.connect(admin).updateSignersAndThreshold([], [], 0);
        // Grant role to agglayer admin
        await aggLayerGatewayContract.connect(admin).grantRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address);
        // Add permission to add default aggchain verification key
        await aggLayerGatewayContract.connect(admin).grantRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address)).to.be.equal(
            true,
        );
        // The rollupManager address need to be precalculated because it's used in the globalExitRoot constructor
        const currentDeployerNonce = await ethers.provider.getTransactionCount(deployer.address);
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: currentDeployerNonce + 3,
        });
        // deploy globalExitRootV2
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGER');
        polygonZkEVMGlobalExitRoot = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, polygonZkEVMBridgeContract.target],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as any;

        // deploy AgglayerManager previous (pessimistic)
        const PolygonRollupManagerPreviousFactory = await ethers.getContractFactory('PolygonRollupManagerPessimistic');
        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerPreviousFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerManagerMock;

        await rollupManagerContract.waitForDeployment();
        // Initialize rollup manager with pessimistic
        await expect(rollupManagerContract.initialize())
            .to.emit(rollupManagerContract, 'UpdateRollupManagerVersion')
            .withArgs('pessimistic');
        // Upgrade rollup manager to v3
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');
        rollupManagerContract = (await upgrades.upgradeProxy(
            rollupManagerContract.target,
            PolygonRollupManagerFactory,
            {
                unsafeAllow: [
                    'constructor',
                    'state-variable-immutable',
                    'enum-definition',
                    'struct-definition',
                    'missing-initializer',
                    'missing-initializer-call',
                ],
                constructorArgs: [
                    polygonZkEVMGlobalExitRoot.target,
                    polTokenContract.target,
                    polygonZkEVMBridgeContract.target,
                    aggLayerGatewayContract.target,
                ],
            },
        )) as any;
        // Initialize rollup manager Mock v3
        await expect(
            rollupManagerContract.initializeMock(
                trustedAggregator.address,
                admin.address,
                timelock.address,
                emergencyCouncil.address,
            ),
        )
            .to.emit(rollupManagerContract, 'UpdateRollupManagerVersion')
            .withArgs('v1.0.0');

        // check precalculated address
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract.initialize(
            NETWORK_ID_MAINNET,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            '0x',
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));

        // deploy ECDSA implementation contract
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        aggchainECDSAImplementationContract = await aggchainECDSAFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );

        // Deploy pessimistic consensus contract
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusImplementationContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );

        // Deploy FEP consensus contract
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        aggchainFEPImplementationContract = await aggchainFEPFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );
    });

    it('should check initializers and deploy parameters', async () => {
        await expect(
            aggLayerGatewayContract.initialize(
                timelock.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                PESSIMISTIC_SELECTOR,
                verifierContract.target,
                randomPessimisticVKey,
                admin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidInitialization');
    });

    it('should create a ECDSA rollup type', async () => {
        // Create rollup type for ECDSA where verifier is not zero to trigger InvalidRollupType error
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAImplementationContract.target,
                trustedAggregator.address, // verifier wrong, must be zero
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');

        // Create rollup type for  ECDSA
        await createAggchainRollupType(aggchainECDSAImplementationContract);

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(1);

        const expectedRollupType = [
            aggchainECDSAImplementationContract.target,
            ethers.ZeroAddress,
            0,
            VerifierType.ALGateway,
            false,
            ethers.ZeroHash,
            ethers.ZeroHash,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);
    });

    it('should create a rollup with rollup type ECDSA', async () => {
        const rollupTypeIdECDSA = await createAggchainRollupType(aggchainECDSAImplementationContract);
        const [, rollupAddress] = await createECDSARollup(rollupTypeIdECDSA);

        // Check created rollup
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAContract = aggchainECDSAFactory.attach(rollupAddress as string) as any;
        expect(await aggchainECDSAContract.aggLayerGateway()).to.be.equal(aggLayerGatewayContract.target);
    });

    it('should getAggchainHash using default gateway', async () => {
        // Add default aggchain verification key
        // Generate random aggchain verification key
        const aggchainVKey = computeRandomBytes(32);

        // Compose selector for generated aggchain verification key
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(AGGCHAIN_VKEY_SELECTOR, aggchainVKey);

        // Try to add same key with same selector for reverting
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');

        // Try to add same key with wrong role
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');

        // Check added vkey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR)).to.be.equal(aggchainVKey);

        // Create ECDSA aggchain
        const rollupTypeIdECDSA = await createAggchainRollupType(aggchainECDSAImplementationContract);
        const [, aggchainECDSAAddress] = await createECDSARollup(rollupTypeIdECDSA);

        // Get aggchain hash
        // For ECDSA Multisig, getVKeyAndAggchainParams correctly returns (bytes32(0), bytes32(0))
        // because ECDSA Multisig uses only signersHash for consensus, not specific vKeys or params
        const actualAggchainVKey = ethers.ZeroHash; // Correctly zero for ECDSA Multisig
        const aggchainParams = ethers.ZeroHash; // Correctly zero for ECDSA Multisig
        const emptySignersHash = computeSignersHash(0, []);
        const precomputedAggchainHash = computeAggchainHash(
            CONSENSUS_TYPE.GENERIC,
            actualAggchainVKey,
            aggchainParams,
            emptySignersHash,
        );
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAContract = aggchainECDSAFactory.attach(aggchainECDSAAddress as string) as any;
        expect(await aggchainECDSAContract.getAggchainHash(CUSTOM_DATA_ECDSA)).to.be.equal(precomputedAggchainHash);
    });

    it('should verify a pessimistic proof for a ECDSA aggchain', async () => {
        // Ensure VKey is not set for this test (remove it if it was added by previous tests)
        try {
            await aggLayerGatewayContract.connect(aggLayerAdmin).unsetDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR);
        } catch (e) {
            // VKey might not exist, which is fine
        }

        // Create ECDSA aggchain
        const rollupTypeIdECDSA = await createAggchainRollupType(aggchainECDSAImplementationContract);
        const [aggchainECDSAId] = await createECDSARollup(rollupTypeIdECDSA);

        // Create a bridge to update the GER
        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(aggchainECDSAId, tester.address, true, '0x', {
                value: ethers.parseEther('1'),
            }),
        )
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateL1InfoTree')
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateL1InfoTreeV2');

        expect(await polygonZkEVMBridgeContract.depositCount()).to.be.equal(1);

        // call rollup manager verify function
        // Compute random values for proof generation
        const randomNewLocalExitRoot = computeRandomBytes(32);
        const randomNewPessimisticRoot = computeRandomBytes(32);
        const randomProof = computeRandomBytes(128);
        // append first 4 bytes to the proof to select the pessimistic vkey
        const proofWithSelector = `${PESSIMISTIC_SELECTOR}${randomProof.slice(2)}`;

        // verify pessimist proof with the new ECDSA rollup
        expect(
            await rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                aggchainECDSAId, // rollupID
                1, // l1InfoTreeCount
                randomNewLocalExitRoot,
                randomNewPessimisticRoot,
                proofWithSelector,
                CUSTOM_DATA_ECDSA,
            ),
        )
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .to.emit(aggchainECDSAImplementationContract, 'OnVerifyPessimistic')
            .withArgs(randomNewStateRoot);
    });

    it('should create a rollup with pessimistic consensus and upgrade it to aggchainECDSA', async () => {
        // Ensure VKey is not set for this test (remove it if it was added by previous tests)
        try {
            await aggLayerGatewayContract.connect(aggLayerAdmin).unsetDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR);
        } catch (e) {
            // VKey might not exist, which is fine
        }

        // Deploy pessimistic consensus contract
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');

        // Create new rollup type with pessimistic consensus
        const pessimisticRollupTypeID = await createPessimisticRollupType();

        // Create new rollup with pessimistic consensus
        const precomputedRollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: await ethers.provider.getTransactionCount(rollupManagerContract.target),
        });
        const pessimisticRollupContract = ppConsensusFactory.attach(
            precomputedRollupAddress,
        ) as PolygonPessimisticConsensus;
        const chainID = 5;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const pessimisticRollupID = 1; // Already aggchainECDSA rollup created created
        const initializeBytesPessimistic = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await expect(
            rollupManagerContract
                .connect(admin)
                .attachAggchainToAL(pessimisticRollupTypeID, chainID, initializeBytesPessimistic),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(pessimisticRollupID, pessimisticRollupTypeID, precomputedRollupAddress, chainID, gasTokenAddress);

        // Verify pessimist proof with pessimistic rollup
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

        // check JS function computeInputPessimisticBytes
        const newLER = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newPPRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const proofPP = '0x00';

        // verify pessimistic from the created pessimistic rollup
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
            .withArgs(
                pessimisticRollupID,
                0, // numBatch
                ethers.ZeroHash, // stateRoot
                newLER,
                trustedAggregator.address,
            );

        // Create rollup type ECDSA
        const rollupTypeECDSAId = await createAggchainRollupType(aggchainECDSAImplementationContract);
        // Update the rollup to ECDSA and initialize the new rollup type
        // Compute initialize upgrade data
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');

        // For migration from PessimisticConsensus, the migrateFromLegacyConsensus function
        // will be called automatically by the RollupManager
        // No initialization bytes needed for migration

        const upgradeData = aggchainECDSAFactory.interface.encodeFunctionData('initAggchainManager(address)', [
            aggchainManager.address,
        ]);

        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(pessimisticRollupContract.target, rollupTypeECDSAId, upgradeData),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(pessimisticRollupID, rollupTypeECDSAId, 0 /* lastVerifiedBatch */);
        const ECDSARollupContract = aggchainECDSAFactory.attach(pessimisticRollupContract.target) as any;

        const aggchainManagerSC = await ECDSARollupContract.aggchainManager();
        expect(aggchainManagerSC).to.be.equal(aggchainManager.address);

        // migrate from PessimisticConsensus
        // Impersonate rollup manager to call migrateFromLegacyConsensus
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerContract.target]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerContract.target as any);
        await ECDSARollupContract.connect(rollupManagerSigner).migrateFromLegacyConsensus({ gasPrice: 0 });

        // Try update rollup by rollupAdmin but trigger UpdateToOldRollupTypeID
        // Create a new pessimistic rollup type
        await createPessimisticRollupType();

        // Check new rollup data
        const resRollupData = await rollupManagerContract.rollupIDToRollupDataV2Deserialized(pessimisticRollupID);
        const expectedRollupData = [
            ECDSARollupContract.target,
            chainID,
            ethers.ZeroAddress, // newVerifier address, for ECDSA is zero because it is internally replaced by aggLayerGateway address
            0, // newForkID
            newLER, // lastLocalExitRoot
            0, // lastBatchSequenced
            0, // lastBatchVerified
            0, // lastVerifiedBatchBeforeUpgrade
            rollupTypeECDSAId,
            VerifierType.ALGateway,
            newPPRoot, // lastPessimisticRoot
            ethers.ZeroHash, // newProgramVKey
        ];

        expect(expectedRollupData).to.be.deep.equal(resRollupData);

        // Verify pessimist proof with the new ECDSA rollup
        const randomNewLocalExitRoot = computeRandomBytes(32);
        const randomNewPessimisticRoot = computeRandomBytes(32);
        const randomProof = computeRandomBytes(128);
        // append first 4 bytes to the proof to select the pessimistic vkey
        const proofWithSelector = `${PESSIMISTIC_SELECTOR}${randomProof.slice(2)}`;

        // Add default AggchainVKey (needed for verification)
        const aggchainVKey = computeRandomBytes(32);

        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(AGGCHAIN_VKEY_SELECTOR, aggchainVKey);

        // verify pessimist proof with the new ECDSA rollup
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                pessimisticRollupID, // rollupID
                lastL1InfoTreeLeafCount, // l1InfoTreeCount
                randomNewLocalExitRoot,
                randomNewPessimisticRoot,
                proofWithSelector,
                CUSTOM_DATA_ECDSA,
            ),
        )
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .to.emit(ECDSARollupContract, 'OnVerifyPessimisticECDSAMultisig');
    });

    it('should add existing rollup to ECDSA', async () => {
        // add existing rollup
        const rollupAddress = '0xAa000000000000000000000000000000000000Bb';
        const forkID = 0;
        const chainID = 2;
        const initLER = '0xff000000000000000000000000000000000000000000000000000000000000ff';
        const programVKey = ethers.ZeroHash;
        const initPessimisticRoot = computeRandomBytes(32);
        // add existing rollup: pessimistic type
        const newCreatedRollupID = 1;
        // Add arbitrary bytecode to the implementation
        await setCode(rollupAddress, computeRandomBytes(32));
        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                ethers.ZeroAddress, // Zero address verifier contract for aggchains
                forkID + 1, // Invalid
                chainID,
                initLER,
                VerifierType.ALGateway,
                programVKey,
                initPessimisticRoot,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidInputsForRollupType');
        // Should revert with InvalidInputsForRollupType
        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                ethers.ZeroAddress, // Zero address verifier contract for aggchains
                forkID,
                chainID,
                initLER,
                VerifierType.ALGateway,
                programVKey,
                initPessimisticRoot,
            ),
        )
            .to.emit(rollupManagerContract, 'AddExistingRollup')
            .withArgs(
                newCreatedRollupID,
                forkID,
                rollupAddress,
                chainID,
                VerifierType.ALGateway,
                0,
                programVKey,
                initPessimisticRoot,
            );
    });

    it('should throw reverts UpdateToOldRollupTypeID and  UpdateNotCompatible', async () => {
        // create two pessimistic rollup types
        const pessimisticRollupTypeID1 = await createPessimisticRollupType();
        const pessimisticRollupTypeID2 = await createPessimisticRollupType();

        const rollupManagerNonce = await ethers.provider.getTransactionCount(rollupManagerContract.target);
        const pessimisticRollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: rollupManagerNonce,
        });
        // Create pessimistic rollup
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            ethers.ZeroAddress,
            '',
            '',
        );
        await rollupManagerContract.connect(admin).attachAggchainToAL(
            pessimisticRollupTypeID2,
            2, // chainID
            initializeBytesAggchain,
        );
        expect(await rollupManagerContract.rollupAddressToID(pessimisticRollupAddress)).to.be.equal(1);

        // Try to upgrade from rollupType1 to rollupType2 should revert (lowest rollup typed id)
        await expect(
            rollupManagerContract
                .connect(admin)
                .updateRollupByRollupAdmin(pessimisticRollupAddress, pessimisticRollupTypeID1),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'UpdateToOldRollupTypeID');

        // Try to upgrade to a rollup type with different verifier type, should revert
        const ecdsaRollupType = await createAggchainRollupType(aggchainECDSAImplementationContract);
        await expect(
            rollupManagerContract.connect(admin).updateRollupByRollupAdmin(pessimisticRollupAddress, ecdsaRollupType),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'UpdateNotCompatible');

        // Try to upgrade to a pessimistic from an ecdsa rollup type, should revert
        const [, ecdsaRollupAddress] = await createECDSARollup(ecdsaRollupType);
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(ecdsaRollupAddress as string, pessimisticRollupTypeID1, '0x'),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'UpdateNotCompatible');

        // Trigger OnlyStateTransitionChains from onSequenceBatches
        await ethers.provider.send('hardhat_setBalance', [pessimisticRollupAddress, '0x100000000000000']);
        await ethers.provider.send('hardhat_impersonateAccount', [pessimisticRollupAddress]);
        const pessimisticRollupContract = await ethers.getSigner(pessimisticRollupAddress);
        await expect(
            rollupManagerContract.connect(pessimisticRollupContract).onSequenceBatches(3, computeRandomBytes(32)),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'OnlyStateTransitionChains');
    });

    it('should upgrade from Pessimistic consensus to ECDSA', async () => {
        // Create pessimistic rollup type
        const pessimisticRollupTypeID = await createPessimisticRollupType();

        // Create pessimistic rollup
        const precomputedRollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: await ethers.provider.getTransactionCount(rollupManagerContract.target),
        });
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const pessimisticRollupContract = ppConsensusFactory.attach(
            precomputedRollupAddress,
        ) as PolygonPessimisticConsensus;

        const chainID = 100;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const pessimisticRollupID = 1;

        const initializeBytesPessimistic = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            rollupManagerContract
                .connect(admin)
                .attachAggchainToAL(pessimisticRollupTypeID, chainID, initializeBytesPessimistic),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(pessimisticRollupID, pessimisticRollupTypeID, precomputedRollupAddress, chainID, gasTokenAddress);

        // Create ECDSA rollup type
        const rollupTypeECDSAId = await createAggchainRollupType(aggchainECDSAImplementationContract);

        // Upgrade from pessimistic to ECDSA
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');

        const initializeBytesWrongECDSA = aggchainECDSAFactory.interface.encodeFunctionData(
            'initialize(address,address,address,string,string,bool,(address,string)[],uint256)',
            [
                admin.address,
                trustedSequencer.address,
                ethers.ZeroAddress, // gas token address
                '', // trusted sequencer url
                '', // network name
                false, // useDefaultSigners
                [], // No signers to add initially
                0, // Threshold of 0 initially
            ],
        );

        const ECDSARollupContract = aggchainECDSAFactory.attach(pessimisticRollupContract.target) as any;

        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(pessimisticRollupContract.target, rollupTypeECDSAId, initializeBytesWrongECDSA),
        ).to.be.revertedWithCustomError(ECDSARollupContract, 'OnlyAggchainManager');

        // For ECDSA upgrade, we use initAggchainManager as ECDSA doesn't have special migration from pessimistic
        const upgradeData = aggchainECDSAFactory.interface.encodeFunctionData('migrateFromLegacyConsensus()');

        // Do not redeclare those variables, update the name
        const signersECDSA = [trustedSequencer.address];
        const thresholdECDSA = 1;
        const aggchainMultisigHashECDSA = computeSignersHash(thresholdECDSA, signersECDSA);

        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(pessimisticRollupContract.target, rollupTypeECDSAId, upgradeData),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(pessimisticRollupID, rollupTypeECDSAId, 0)
            .to.emit(ECDSARollupContract, 'SignersAndThresholdUpdated')
            .withArgs(signersECDSA, thresholdECDSA, aggchainMultisigHashECDSA);

        expect(await ECDSARollupContract.aggchainManager()).to.be.equal(admin.address);

        // check the signers and threshold and all the previosu params are coherent
        const signersECDSAFromContract = await ECDSARollupContract.getAggchainSigners();
        expect(signersECDSAFromContract).to.be.deep.equal(signersECDSA);
        const thresholdECDSAFromContract = await ECDSARollupContract.threshold();
        expect(thresholdECDSAFromContract).to.be.equal(thresholdECDSA);
        const aggchainMultisigHashECDSAFromContract = await ECDSARollupContract.getAggchainMultisigHash();
        expect(aggchainMultisigHashECDSAFromContract).to.be.equal(aggchainMultisigHashECDSA);
        const aggchainManagerFromContract = await ECDSARollupContract.aggchainManager();
        expect(aggchainManagerFromContract).to.be.equal(admin.address);
    });

    it('should upgrade from Pessimistic consensus to FEP through ECDSA', async () => {
        // Create pessimistic rollup type
        const pessimisticRollupTypeID = await createPessimisticRollupType();

        // Create pessimistic rollup
        const precomputedRollupAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: await ethers.provider.getTransactionCount(rollupManagerContract.target),
        });
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const pessimisticRollupContract = ppConsensusFactory.attach(
            precomputedRollupAddress,
        ) as PolygonPessimisticConsensus;

        const chainID = 200;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic-fep:8545';
        const networkName = 'testPessimisticToFEP';
        const pessimisticRollupID = 1;

        const initializeBytesPessimistic = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            rollupManagerContract
                .connect(admin)
                .attachAggchainToAL(pessimisticRollupTypeID, chainID, initializeBytesPessimistic),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(pessimisticRollupID, pessimisticRollupTypeID, precomputedRollupAddress, chainID, gasTokenAddress);

        // Create ECDSA and FEP rollup types (FEP must be newer to be able to update ECDSA -> FEP)
        const rollupTypeECDSAId = await createAggchainRollupType(aggchainECDSAImplementationContract);
        const rollupTypeFEPId = await createAggchainRollupType(aggchainFEPImplementationContract);

        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const FEPRollupContract = aggchainFEPFactory.attach(pessimisticRollupContract.target) as AggchainFEP;

        // Prepare InitParams for FEP initialization
        const initParams = {
            l2BlockTime: 2, // 2 seconds per block
            rollupConfigHash: computeRandomBytes(32),
            startingOutputRoot: computeRandomBytes(32),
            startingBlockNumber: 0,
            startingTimestamp: (await ethers.provider.getBlock('latest'))?.timestamp || 0,
            submissionInterval: 100, // Every 100 blocks
            optimisticModeManager: admin.address,
            aggregationVkey: computeRandomBytes(32),
            rangeVkeyCommitment: computeRandomBytes(32),
        };

        // Direct Pessimistic -> FEP with the removed initializeFromLegacyConsensus calldata is not possible anymore
        const legacyInitializeFEPData = new ethers.Interface([
            'function initializeFromLegacyConsensus((uint256,bytes32,bytes32,uint256,uint256,uint256,address,bytes32,bytes32),bool,bool,bytes32,bytes4,(address,string)[],uint256)',
        ]).encodeFunctionData('initializeFromLegacyConsensus', [
            Object.values(initParams),
            false, // useDefaultVkeys
            false, // useDefaultSigners
            ethers.ZeroHash, // initOwnedAggchainVKey
            '0x00010001', // initAggchainVKeySelector for FEP (AGGCHAIN_TYPE = 0x0001)
            [], // signersToAdd
            0, // newThreshold
        ]);
        expect(aggchainFEPFactory.interface.getFunction('initializeFromLegacyConsensus')).to.be.equal(null);
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(pessimisticRollupContract.target, rollupTypeFEPId, legacyInitializeFEPData),
        ).to.be.reverted;

        // Step 1: Pessimistic -> ECDSA multisig
        const ECDSARollupContract = aggchainECDSAFactory.attach(pessimisticRollupContract.target) as any;
        const signersECDSA = [trustedSequencer.address];
        const thresholdECDSA = 1;
        const aggchainMultisigHashECDSA = computeSignersHash(thresholdECDSA, signersECDSA);

        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(
                    pessimisticRollupContract.target,
                    rollupTypeECDSAId,
                    aggchainECDSAFactory.interface.encodeFunctionData('migrateFromLegacyConsensus()'),
                ),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(pessimisticRollupID, rollupTypeECDSAId, 0)
            .to.emit(ECDSARollupContract, 'SignersAndThresholdUpdated')
            .withArgs(signersECDSA, thresholdECDSA, aggchainMultisigHashECDSA);

        // migrateFromLegacyConsensus sets the admin as aggchainManager
        expect(await ECDSARollupContract.aggchainManager()).to.be.equal(admin.address);

        // Step 2: ECDSA multisig -> FEP
        // initializeFromECDSAMultisig is onlyAggchainManager, so it can not be the updateRollup calldata
        const upgradeDataFEP = aggchainFEPFactory.interface.encodeFunctionData('initializeFromECDSAMultisig', [
            initParams,
            false, // useDefaultVkeys
            ethers.ZeroHash, // initOwnedAggchainVKey
            '0x00010001', // initAggchainVKeySelector for FEP
        ]);
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(pessimisticRollupContract.target, rollupTypeFEPId, upgradeDataFEP),
        ).to.be.revertedWithCustomError(FEPRollupContract, 'OnlyAggchainManager');

        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(pessimisticRollupContract.target, rollupTypeFEPId, '0x'),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(pessimisticRollupID, rollupTypeFEPId, 0);

        // Only the aggchainManager can initialize
        await expect(
            FEPRollupContract.connect(aggchainManager).initializeFromECDSAMultisig(
                initParams,
                false, // useDefaultVkeys
                ethers.ZeroHash, // initOwnedAggchainVKey
                '0x00010001', // initAggchainVKeySelector for FEP
            ),
        ).to.be.revertedWithCustomError(FEPRollupContract, 'OnlyAggchainManager');

        // Fresh-deployment initializer (version 0) is not usable on a migrated chain
        await expect(
            FEPRollupContract.connect(admin).initialize(
                initParams,
                [], // No signers to add
                0, // Threshold
                false, // useDefaultVkeys
                false, // useDefaultSigners
                ethers.ZeroHash, // initOwnedAggchainVKey
                '0x00010001', // initAggchainVKeySelector
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
            ),
        ).to.be.revertedWithCustomError(FEPRollupContract, 'InvalidInitializer');

        const GENESIS_CONFIG_NAME = ethers.id('opsuccinct_genesis');
        await expect(
            FEPRollupContract.connect(admin).initializeFromECDSAMultisig(
                initParams,
                false, // useDefaultVkeys
                ethers.ZeroHash, // initOwnedAggchainVKey
                '0x00010001', // initAggchainVKeySelector for FEP
            ),
        )
            .to.emit(FEPRollupContract, 'OpSuccinctConfigSelected')
            .withArgs(GENESIS_CONFIG_NAME);

        // FEP initialized and ECDSA multisig state preserved
        expect(await FEPRollupContract.version()).to.be.equal('v3.1.0');
        expect(await FEPRollupContract.selectedOpSuccinctConfigName()).to.be.equal(GENESIS_CONFIG_NAME);
        expect(await FEPRollupContract.latestOutputIndex()).to.be.equal(0);
        const l2Output = await FEPRollupContract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);
        expect(await FEPRollupContract.aggchainManager()).to.be.equal(admin.address);
        expect(await FEPRollupContract.getAggchainMultisigHash()).to.be.equal(aggchainMultisigHashECDSA);
        expect(await FEPRollupContract.threshold()).to.be.equal(thresholdECDSA);
        expect(await FEPRollupContract.getAggchainSigners()).to.be.deep.equal(signersECDSA);
        expect(await FEPRollupContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await FEPRollupContract.networkName()).to.be.equal(networkName);
    });

    it('should upgrade from ECDSA to FEP', async () => {
        // Create ECDSA rollup type and rollup
        const rollupTypeECDSAId = await createAggchainRollupType(aggchainECDSAImplementationContract);
        const [ecdsaRollupID, ecdsaRollupAddress] = await createECDSARollup(rollupTypeECDSAId);

        // Create FEP rollup type
        const rollupTypeFEPId = await createAggchainRollupType(aggchainFEPImplementationContract);

        // Upgrade from ECDSA to FEP
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');

        // Prepare InitParams for FEP initialization from ECDSA
        const initParams = {
            l2BlockTime: 2, // 2 seconds per block
            rollupConfigHash: computeRandomBytes(32),
            startingOutputRoot: computeRandomBytes(32),
            startingBlockNumber: 0,
            startingTimestamp: (await ethers.provider.getBlock('latest'))?.timestamp || 0,
            submissionInterval: 100, // Every 100 blocks
            optimisticModeManager: admin.address,
            aggregationVkey: computeRandomBytes(32),
            rangeVkeyCommitment: computeRandomBytes(32),
        };

        // Encode upgrade data for initializeFromECDSAMultisig
        const upgradeData = aggchainFEPFactory.interface.encodeFunctionData(
            'initializeFromECDSAMultisig((uint256,bytes32,bytes32,uint256,uint256,uint256,address,bytes32,bytes32),bool,bytes32,bytes4)',
            [initParams, false, ethers.ZeroHash, '0x00010001'],
        );
        const FEPRollupContract = aggchainFEPFactory.attach(ecdsaRollupAddress as string) as any;

        // same as last test
        await expect(
            rollupManagerContract
                .connect(timelock)
                .updateRollup(ecdsaRollupAddress as string, rollupTypeFEPId, upgradeData),
        ).to.be.revertedWithCustomError(FEPRollupContract, 'OnlyAggchainManager');

        await expect(
            rollupManagerContract.connect(timelock).updateRollup(ecdsaRollupAddress as string, rollupTypeFEPId, '0x'),
        )
            .to.emit(rollupManagerContract, 'UpdateRollup')
            .withArgs(ecdsaRollupID, rollupTypeFEPId, 0);

        const GENESIS_CONFIG_NAME = ethers.id('opsuccinct_genesis');

        await expect(
            FEPRollupContract.connect(aggchainManager).initializeFromECDSAMultisig(
                initParams,
                false, // useDefaultVkeys
                ethers.ZeroHash, // initOwnedAggchainVKey
                '0x00010001', // initAggchainVKeySelector for FEP
            ),
        )
            .to.emit(FEPRollupContract, 'OpSuccinctConfigUpdated')
            .withArgs(
                GENESIS_CONFIG_NAME,
                initParams.aggregationVkey,
                initParams.rangeVkeyCommitment,
                initParams.rollupConfigHash,
            )
            .to.emit(FEPRollupContract, 'OpSuccinctConfigSelected')
            .withArgs(GENESIS_CONFIG_NAME);

        // Verify the upgrade
        expect(await FEPRollupContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await FEPRollupContract.version()).to.be.equal('v3.1.0');
    });
});
