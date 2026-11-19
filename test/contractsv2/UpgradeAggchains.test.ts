/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    PolygonPessimisticConsensus,
    AggchainFEPPrevious,
    AggchainFEP,
    AggchainECDSAMultisig,
    Address,
} from '../../typechain-types';

describe('UpgradeAggchains', () => {
    let pessimisticConsensus: PolygonPessimisticConsensus;
    let aggchainFEPPrevious: AggchainFEPPrevious;

    let admin: any;
    let trustedSequencer: any;
    let aggchainManager: any;
    let optimisticModeManager: any;
    let signer1: any;
    let signer2: any;
    let signer3: any;
    let rollupManagerSigner: any;
    let rollupManagerAddress: Address;
    // Contract addresses
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const bridgeAddressConst = '0xD00000000000000000000000000000000000000D' as unknown as Address;
    const aggLayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'testnet';
    const gasTokenAddress = ethers.ZeroAddress; // Native token

    beforeEach('Deploy base contracts', async () => {
        upgrades.silenceWarnings();

        // Load signers
        [
            admin,
            trustedSequencer,
            aggchainManager,
            optimisticModeManager,
            signer1,
            signer2,
            signer3,
            rollupManagerSigner,
        ] = await ethers.getSigners();

        rollupManagerAddress = rollupManagerSigner.address;

        // Deploy PolygonPessimisticConsensus
        const pessimisticConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        pessimisticConsensus = (await upgrades.deployProxy(pessimisticConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddressConst, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as PolygonPessimisticConsensus;
        await pessimisticConsensus.waitForDeployment();

        // Initialize PolygonPessimisticConsensus (must be called from rollup manager)
        await pessimisticConsensus.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            1, // network ID
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // Deploy previous version of AggchainFEP
        const aggchainFEPPreviousFactory = await ethers.getContractFactory('AggchainFEPPrevious');
        aggchainFEPPrevious = (await upgrades.deployProxy(aggchainFEPPreviousFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerSigner.address,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        })) as unknown as AggchainFEPPrevious;
        await aggchainFEPPrevious.waitForDeployment();
    });

    it('should upgrade from PolygonPessimisticConsensus to AggchainFEP through AggchainECDSAMultisig', async () => {
        // Verify initial state of PessimisticConsensus
        expect(await pessimisticConsensus.admin()).to.equal(admin.address);
        expect(await pessimisticConsensus.trustedSequencer()).to.equal(trustedSequencer.address);
        expect(await pessimisticConsensus.trustedSequencerURL()).to.equal(urlSequencer);
        expect(await pessimisticConsensus.networkName()).to.equal(networkName);
        expect(await pessimisticConsensus.gasTokenAddress()).to.equal(gasTokenAddress);

        // Step 1: upgrade from PessimisticConsensus to AggchainECDSAMultisig (without calling initializer)
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const upgradedECDSA = (await upgrades.upgradeProxy(pessimisticConsensus.target, aggchainECDSAMultisigFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerAddress,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AggchainECDSAMultisig;

        // Migrate from legacy consensus: aggchainManager = admin, trustedSequencer as single signer, threshold 1
        await upgradedECDSA.connect(rollupManagerSigner).migrateFromLegacyConsensus({ gasPrice: 0 });
        const aggchainMultisigHashECDSA = await upgradedECDSA.getAggchainMultisigHash();

        // Step 2: upgrade from AggchainECDSAMultisig to AggchainFEP (without calling initializer)
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');

        // Initialize parameters for FEP
        const initParams = {
            submissionInterval: 300, // 5 minutes
            l2BlockTime: 2, // 2 seconds
            startingBlockNumber: 100,
            startingTimestamp: 0,
            startingOutputRoot: ethers.id('startingOutputRoot'),
            rollupConfigHash: ethers.id('test_rollup_hash'),
            aggregationVkey: ethers.id('test_agg_vkey'),
            rangeVkeyCommitment: ethers.id('test_range_vkey'),
            optimisticModeManager: optimisticModeManager.address,
        };

        const upgradedFEP = (await upgrades.upgradeProxy(pessimisticConsensus.target, aggchainFEPFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerAddress,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        })) as unknown as AggchainFEP;

        // Now call initializeFromECDSAMultisig from aggchain manager (admin after the ECDSA migration)
        await upgradedFEP.connect(admin).initializeFromECDSAMultisig(
            initParams,
            false, // useDefaultVkeys
            ethers.id('test_vkey'),
            '0x00010001', // aggchainVKeySelector
            { gasPrice: 0 },
        );

        // Verify that base state is preserved
        expect(await upgradedFEP.admin()).to.equal(admin.address);
        expect(await upgradedFEP.trustedSequencer()).to.equal(trustedSequencer.address);
        expect(await upgradedFEP.trustedSequencerURL()).to.equal(urlSequencer);
        expect(await upgradedFEP.networkName()).to.equal(networkName);
        expect(await upgradedFEP.gasTokenAddress()).to.equal(gasTokenAddress);

        // Verify new FEP functionality is initialized
        expect(await upgradedFEP.SUBMISSION_INTERVAL()).to.equal(300);
        expect(await upgradedFEP.L2_BLOCK_TIME()).to.equal(2);
        expect(await upgradedFEP.startingBlockNumber()).to.equal(100);
        expect(await upgradedFEP.optimisticModeManager()).to.equal(optimisticModeManager.address);
        expect(await upgradedFEP.latestOutputIndex()).to.equal(0);

        // Verify aggchain parameters
        expect(await upgradedFEP.aggchainManager()).to.equal(admin.address);
        expect(await upgradedFEP.useDefaultVkeys()).to.equal(false);
        expect(await upgradedFEP.useDefaultSigners()).to.equal(false);
        expect(await upgradedFEP.ownedAggchainVKeys('0x00010001')).to.equal(ethers.id('test_vkey'));

        // Signers set by the ECDSA migration are preserved
        expect(await upgradedFEP.threshold()).to.equal(1);
        expect(await upgradedFEP.getAggchainSigners()).to.deep.equal([trustedSequencer.address]);
        expect(await upgradedFEP.getAggchainMultisigHash()).to.equal(aggchainMultisigHashECDSA);

        // Check that the OP config was properly set
        const genesisConfig = await upgradedFEP.opSuccinctConfigs(await upgradedFEP.GENESIS_CONFIG_NAME());
        expect(genesisConfig.aggregationVkey).to.equal(initParams.aggregationVkey);
        expect(genesisConfig.rangeVkeyCommitment).to.equal(initParams.rangeVkeyCommitment);
        expect(genesisConfig.rollupConfigHash).to.equal(initParams.rollupConfigHash);
        expect(await upgradedFEP.selectedOpSuccinctConfigName()).to.equal(await upgradedFEP.GENESIS_CONFIG_NAME());

        // Cannot be initialized twice
        await expect(
            upgradedFEP
                .connect(admin)
                .initializeFromECDSAMultisig(initParams, false, ethers.id('test_vkey'), '0x00010001', { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        // Test that FEP functions work
        await upgradedFEP.connect(admin).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            1,
        );
        expect(await upgradedFEP.getAggchainSignersCount()).to.equal(3);
        expect(await upgradedFEP.threshold()).to.equal(1);

        // Verify version
        expect(await upgradedFEP.version()).to.equal('v3.1.0');
    });

    it('should upgrade from PolygonPessimisticConsensus to AggchainECDSAMultisig', async () => {
        // Deploy a fresh PessimisticConsensus for this test
        const pessimisticConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const pessimisticConsensus2 = (await upgrades.deployProxy(pessimisticConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddressConst, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as PolygonPessimisticConsensus;
        await pessimisticConsensus2.waitForDeployment();

        // Initialize
        await pessimisticConsensus2.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            2, // different network ID
            gasTokenAddress,
            urlSequencer,
            'network2',
        );

        // Verify initial state
        expect(await pessimisticConsensus2.admin()).to.equal(admin.address);
        expect(await pessimisticConsensus2.trustedSequencer()).to.equal(trustedSequencer.address);
        expect(await pessimisticConsensus2.networkName()).to.equal('network2');

        // Prepare upgrade to AggchainECDSAMultisig
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');

        // Upgrade from PessimisticConsensus to AggchainECDSAMultisig (without calling initializer)
        const upgradedECDSA = (await upgrades.upgradeProxy(pessimisticConsensus2.target, aggchainECDSAMultisigFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerAddress,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AggchainECDSAMultisig;

        // Now call migrateFromLegacyConsensus from rollup manager
        await upgradedECDSA.connect(rollupManagerSigner).migrateFromLegacyConsensus({ gasPrice: 0 });

        // Verify that base state is preserved
        expect(await upgradedECDSA.admin()).to.equal(admin.address);
        expect(await upgradedECDSA.trustedSequencer()).to.equal(trustedSequencer.address);
        expect(await upgradedECDSA.trustedSequencerURL()).to.equal(urlSequencer);
        expect(await upgradedECDSA.networkName()).to.equal('network2');
        expect(await upgradedECDSA.gasTokenAddress()).to.equal(gasTokenAddress);

        // Verify migration specific setup
        expect(await upgradedECDSA.aggchainManager()).to.equal(admin.address);
        expect(await upgradedECDSA.threshold()).to.equal(1);
        expect(await upgradedECDSA.getAggchainSignersCount()).to.equal(1);

        // Check that trustedSequencer was added as initial signer
        const signers = await upgradedECDSA.getAggchainSigners();
        expect(signers[0]).to.equal(trustedSequencer.address);
        expect(await upgradedECDSA.isSigner(trustedSequencer.address)).to.be.equal(true);

        // Test that we can update signers
        await upgradedECDSA.connect(admin).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            2,
        );

        expect(await upgradedECDSA.getAggchainSignersCount()).to.equal(3);
        expect(await upgradedECDSA.threshold()).to.equal(2);

        // Verify version
        expect(await upgradedECDSA.version()).to.equal('v1.0.0');
    });

    it('should not allow initializing a previous AggchainFEP upgraded to current AggchainFEP', async () => {
        // Initialize the previous AggchainFEP
        await aggchainFEPPrevious.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address, {
            gasPrice: 0,
        });

        // Encode initialization parameters for AggchainFEPPrevious
        const initParams = {
            l2BlockTime: 2,
            rollupConfigHash: ethers.id('old_rollup_hash'),
            startingOutputRoot: ethers.ZeroHash,
            startingBlockNumber: 100,
            startingTimestamp: 0,
            submissionInterval: 300,
            optimisticModeManager: optimisticModeManager.address,
            aggregationVkey: ethers.id('old_agg_vkey'),
            rangeVkeyCommitment: ethers.id('old_range_vkey'),
        };

        const encodedInitBytes = ethers.AbiCoder.defaultAbiCoder().encode(
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
                Object.values(initParams),
                false, // useDefaultGateway
                ethers.id('old_vkey'), // initOwnedAggchainVKey
                '0x00010001', // initAggchainVKeySelector (type 0x0001)
                admin.address, // vKeyManager
                admin.address, // admin
                trustedSequencer.address, // trustedSequencer
                gasTokenAddress, // gasTokenAddress
                urlSequencer, // trustedSequencerURL
                networkName, // networkName
            ],
        );

        // Initialize with encoded bytes
        await aggchainFEPPrevious.connect(aggchainManager).initialize(encodedInitBytes, { gasPrice: 0 });

        // Verify old version state
        expect(await aggchainFEPPrevious.admin()).to.equal(admin.address);
        expect(await aggchainFEPPrevious.trustedSequencer()).to.equal(trustedSequencer.address);
        expect(await aggchainFEPPrevious.SUBMISSION_INTERVAL()).to.equal(300);
        expect(await aggchainFEPPrevious.L2_BLOCK_TIME()).to.equal(2);
        expect(await aggchainFEPPrevious.startingBlockNumber()).to.equal(100);

        // Store aggregation vkey and range vkey
        expect(await aggchainFEPPrevious.aggregationVkey()).to.equal(ethers.id('old_agg_vkey'));
        expect(await aggchainFEPPrevious.rangeVkeyCommitment()).to.equal(ethers.id('old_range_vkey'));
        expect(await aggchainFEPPrevious.rollupConfigHash()).to.equal(ethers.id('old_rollup_hash'));

        // Get the current AggchainFEP factory
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');

        // Upgrade from previous to current AggchainFEP (without calling initializer)
        const upgradedFEP = (await upgrades.upgradeProxy(aggchainFEPPrevious.target, aggchainFEPFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerAddress,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AggchainFEP;

        // upgradeFromPreviousFEP has been removed: all FEP chains are already on v3
        expect(aggchainFEPFactory.interface.getFunction('upgradeFromPreviousFEP')).to.equal(null);

        // Previous FEP is at initializer version 2 with l2Outputs already set: none of the remaining
        // initializers can be used on it
        await expect(
            upgradedFEP
                .connect(aggchainManager)
                .initializeFromECDSAMultisig(initParams, false, ethers.id('old_vkey'), '0x00010001', { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(upgradedFEP, 'InvalidInitializer');

        await expect(
            upgradedFEP
                .connect(aggchainManager)
                .initialize(
                    initParams,
                    [],
                    0,
                    false,
                    false,
                    ethers.id('old_vkey'),
                    '0x00010001',
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName,
                    { gasPrice: 0 },
                ),
        ).to.be.revertedWithCustomError(upgradedFEP, 'InvalidInitializer');

        // Previous state is untouched
        expect(await upgradedFEP.admin()).to.equal(admin.address);
        expect(await upgradedFEP.SUBMISSION_INTERVAL()).to.equal(300);
        expect(await upgradedFEP.selectedOpSuccinctConfigName()).to.equal(ethers.ZeroHash);
    });

    it('should test upgrade path with optimistic mode manager transfer', async () => {
        // This test verifies the upgrade preserves and allows transfer of optimistic mode manager role

        // Deploy and initialize a PessimisticConsensus
        const pessimisticConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const pessimisticConsensus3 = (await upgrades.deployProxy(pessimisticConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddressConst, rollupManagerSigner.address],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        })) as unknown as PolygonPessimisticConsensus;
        await pessimisticConsensus3.waitForDeployment();

        await pessimisticConsensus3
            .connect(rollupManagerSigner)
            .initialize(admin.address, trustedSequencer.address, 3, gasTokenAddress, urlSequencer, 'network3');

        // Upgrade to AggchainFEP
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const initParams = {
            submissionInterval: 600,
            l2BlockTime: 3,
            startingBlockNumber: 200,
            startingTimestamp: 0,
            startingOutputRoot: ethers.id('startingOutputRoot2'),
            rollupConfigHash: ethers.id('test_rollup_hash2'),
            aggregationVkey: ethers.id('test_agg_vkey2'),
            rangeVkeyCommitment: ethers.id('test_range_vkey2'),
            optimisticModeManager: optimisticModeManager.address,
        };

        // Legacy consensus must go through AggchainECDSAMultisig first (aggchainManager = admin)
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const upgradedECDSA = (await upgrades.upgradeProxy(pessimisticConsensus3.target, aggchainECDSAMultisigFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerAddress,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AggchainECDSAMultisig;
        await upgradedECDSA.connect(rollupManagerSigner).migrateFromLegacyConsensus({ gasPrice: 0 });

        const upgradedFEP = (await upgrades.upgradeProxy(pessimisticConsensus3.target, aggchainFEPFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddressConst,
                rollupManagerAddress,
                aggLayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AggchainFEP;

        // Now call initializeFromECDSAMultisig from aggchain manager
        await upgradedFEP.connect(admin).initializeFromECDSAMultisig(
            initParams,
            false, // useDefaultVkeys
            ethers.id('test_vkey2'),
            '0x00010001', // aggchainVKeySelector (type 0x0001 for FEP)
            { gasPrice: 0 },
        );

        // Test optimistic mode manager functionality
        expect(await upgradedFEP.optimisticModeManager()).to.equal(optimisticModeManager.address);
        expect(await upgradedFEP.optimisticMode()).to.be.equal(false);

        // Enable optimistic mode
        await upgradedFEP.connect(optimisticModeManager).enableOptimisticMode({ gasPrice: 0 });
        expect(await upgradedFEP.optimisticMode()).to.be.equal(true);

        // Transfer optimistic mode manager role
        const newOptimisticManager = signer3;
        await expect(
            upgradedFEP.connect(optimisticModeManager).transferOptimisticModeManagerRole(newOptimisticManager.address, {
                gasPrice: 0,
            }),
        ).to.emit(upgradedFEP, 'TransferOptimisticModeManagerRole');

        // Accept the role
        await expect(
            upgradedFEP.connect(newOptimisticManager).acceptOptimisticModeManagerRole({ gasPrice: 0 }),
        ).to.emit(upgradedFEP, 'AcceptOptimisticModeManagerRole');

        expect(await upgradedFEP.optimisticModeManager()).to.equal(newOptimisticManager.address);

        // Test that new manager can control optimistic mode
        await upgradedFEP.connect(newOptimisticManager).disableOptimisticMode({ gasPrice: 0 });
        expect(await upgradedFEP.optimisticMode()).to.be.equal(false);
    });
});
