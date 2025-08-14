/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Address, AggchainECDSAMultisig } from '../../typechain-types';
import * as utilsAggchain from '../../src/utils-common-aggchain';
import * as utilsECDSAMultisig from '../../src/utils-aggchain-ECDSA-multisig';

describe('AggchainECDSAMultisig', () => {
    let trustedSequencer: any;
    let admin: any;
    let vKeyManager: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;
    let signer1: any;
    let signer2: any;
    let signer3: any;
    let signer4: any;
    let nonSigner: any;

    let aggchainECDSAMultisigContract: AggchainECDSAMultisig;

    // Default values initialization
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
    const agglayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'zkevm';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggchain variables
    const useDefaultGateway = false;
    const aggchainVKeySelector = '0x12340002';
    const newAggchainVKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [, trustedSequencer, admin, vKeyManager, aggchainManager, signer1, signer2, signer3, signer4, nonSigner] =
            await ethers.getSigners();

        // deploy aggchain
        // create aggchainECDSAMultisig implementation
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        aggchainECDSAMultisigContract = await upgrades.deployProxy(aggchainECDSAMultisigFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await aggchainECDSAMultisigContract.waitForDeployment();

        // rollupSigner
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
    });

    it('should check the v0 initialized parameters', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        // Test invalid initializations first
        // Empty signers array
        let invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // ECDSA multisig no longer initializes signers/threshold in v0; it only sets base/consensus. So no revert here.
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .initialize(invalidInitializeBytes, { gasPrice: 0 });

        // Zero threshold
        // Re-initialize should revert because already initialized
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        // Threshold greater than signers count
        // No longer applicable; removal of threshold/signers from initializer

        // Signer with zero address
        // No longer applicable in initializer

        // Duplicate signers
        // No longer applicable in initializer

        // Invalid aggchain type - test with a new contract
        const aggchainECDSAMultisigFactory2 = await ethers.getContractFactory('AggchainECDSAMultisig');
        const freshContract = await upgrades.deployProxy(aggchainECDSAMultisigFactory2, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });
        await freshContract.waitForDeployment();
        await freshContract.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        const invalidSelector = '0x12340001'; // Wrong type
        invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            invalidSelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            freshContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(freshContract, 'InvalidAggchainType');

        // After base init, signer set/threshold must be configured via batch update
        // We already initialized aggchainECDSAMultisigContract above
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);

        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(initialSigners.length);
        const signersAfter = await aggchainECDSAMultisigContract.getAggchainSigners();
        expect(signersAfter).to.deep.equal(initialSigners);
        for (let i = 0; i < initialSigners.length; i++) {
            expect(await aggchainECDSAMultisigContract.isSigner(initialSigners[i])).to.be.equal(true);
        }

        // Check aggchainBase parameters
        expect(await aggchainECDSAMultisigContract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainECDSAMultisigContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
            newAggchainVKey,
        );

        // Check PolygonConsensusBase parameters
        expect(await aggchainECDSAMultisigContract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAMultisigContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAMultisigContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAMultisigContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAMultisigContract.networkName()).to.be.equal(networkName);

        // Try to initialize again
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check the v1 initialized parameters', async () => {
        const networkID = 1;
        const initialSigners = [signer1.address, signer2.address];
        const threshold = 1;

        // Deploy previous ECDSA pessimistic contract
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const PolygonPPConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await PolygonPPConsensusContract.waitForDeployment();

        // initialize pessimistic consensus (ECDSA v0.2.0)
        await PolygonPPConsensusContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Upgrade proxy to ECDSA Multisig implementation
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        await upgrades.upgradeProxy(PolygonPPConsensusContract.target, aggchainECDSAMultisigFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        // New interface according to the new implementation
        aggchainECDSAMultisigContract = aggchainECDSAMultisigFactory.attach(
            PolygonPPConsensusContract.target,
        ) as unknown as AggchainECDSAMultisig;

        const initializeBytesAggchain = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv1(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .initialize(initializeBytesAggchain, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            threshold,
        );

        // Check storage
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(threshold);
        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(initialSigners.length);

        // Check that PolygonConsensusBase parameters are preserved from v0
        expect(await aggchainECDSAMultisigContract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAMultisigContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAMultisigContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAMultisigContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAMultisigContract.networkName()).to.be.equal(networkName);
    });

    it('should check getAggchainHash without signers initialized', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Try to get aggchain hash without initializing signers
        const aggchainData = utilsECDSAMultisig.encodeAggchainDataECDSAMultisig(aggchainVKeySelector);
        await expect(aggchainECDSAMultisigContract.getAggchainHash(aggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'AggchainSignersHashNotInitialized',
        );
    });

    it('should check getAggchainHash', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        // Test invalid aggchain data length
        await expect(aggchainECDSAMultisigContract.getAggchainHash('0x')).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'InvalidAggchainDataLength',
        );

        // Test invalid aggchain type
        const invalidSelector = '0x12340001';
        const invalidAggchainData = utilsECDSAMultisig.encodeAggchainDataECDSAMultisig(invalidSelector);
        await expect(aggchainECDSAMultisigContract.getAggchainHash(invalidAggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'InvalidAggchainType',
        );

        // Test correct aggchain hash calculation
        const aggchainData = utilsECDSAMultisig.encodeAggchainDataECDSAMultisig(aggchainVKeySelector);
        const aggchainHashSC = await aggchainECDSAMultisigContract.getAggchainHash(aggchainData);

        // Calculate expected hash in JS
        const signersHash = await aggchainECDSAMultisigContract.aggchainSignersHash();

        // The aggchain hash is calculated as: keccak256(consensusType, aggchainVKey, aggchainParams, signersHash)
        // Since getAggchainParamsAndVKeySelector returns (0, 0), both aggchainVKey and aggchainParams are zero
        const consensusType = await aggchainECDSAMultisigContract.CONSENSUS_TYPE();
        const expectedAggchainHash = ethers.solidityPackedKeccak256(
            ['uint32', 'bytes32', 'bytes32', 'bytes32'],
            [consensusType, ethers.ZeroHash, ethers.ZeroHash, signersHash],
        );

        expect(aggchainHashSC).to.be.equal(expectedAggchainHash);
    });

    it('should check view functions', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        // Test getSignersCount
        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(initialSigners.length);

        // Test getSigners
        const storedSigners = await aggchainECDSAMultisigContract.getAggchainSigners();
        expect(storedSigners).to.deep.equal(initialSigners);

        // Test isSigner
        for (let i = 0; i < initialSigners.length; i++) {
            expect(await aggchainECDSAMultisigContract.isSigner(initialSigners[i])).to.be.equal(true);
        }
        expect(await aggchainECDSAMultisigContract.isSigner(nonSigner.address)).to.be.equal(false);
        expect(await aggchainECDSAMultisigContract.isSigner(ethers.ZeroAddress)).to.be.equal(false);

        // Test threshold
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(threshold);

        // Test signersHash
        const expectedSignersHash = ethers.solidityPackedKeccak256(
            ['uint32', 'address[]'],
            [threshold, initialSigners],
        );
        expect(await aggchainECDSAMultisigContract.aggchainSignersHash()).to.be.equal(expectedSignersHash);
    });

    it('should check onVerifyPessimistic', async () => {
        const initialSigners = [signer1.address, signer2.address];
        const threshold = 1;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            threshold,
        );

        const aggchainData = utilsECDSAMultisig.encodeAggchainDataECDSAMultisig(aggchainVKeySelector);

        // Test onVerifyPessimistic: not rollup manager
        await expect(aggchainECDSAMultisigContract.onVerifyPessimistic(aggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyRollupManager',
        );

        // Test successful onVerifyPessimistic
        await expect(
            aggchainECDSAMultisigContract
                .connect(rollupManagerSigner)
                .onVerifyPessimistic(aggchainData, { gasPrice: 0 }),
        ).to.emit(aggchainECDSAMultisigContract, 'OnVerifyPessimisticECDSAMultisig');
    });

    it('should check signer management functions', async () => {
        const initialSigners = [signer1.address, signer2.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Initialize signers
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            threshold,
        );

        // Test updateSignersAndThreshold - not aggchain manager
        await expect(
            aggchainECDSAMultisigContract.updateSignersAndThreshold(
                [],
                [{ addr: signer3.address, url: 'u' }],
                threshold,
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyAggchainManager');

        // Test add signer - zero address
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: ethers.ZeroAddress, url: 'url' }], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerCannotBeZero');

        // Test add signer - already exists
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer1.address, url: 'url' }], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Test add signer - empty URL
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer3.address, url: '' }], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerURLCannotBeEmpty');

        // Test successful add signer
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer3.address, url: 'http://signer3' }], threshold),
        )
            .to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated')
            .and.to.emit(aggchainECDSAMultisigContract, 'AggchainSignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer3.address)).to.be.equal(true);

        // Test batch add with duplicate in same batch
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
                [],
                [
                    { addr: signer4.address, url: 'http://signer4' },
                    { addr: signer4.address, url: 'dup' },
                ],
                threshold,
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Test successful batch add
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer4.address, url: 'http://signer4' }], threshold),
        )
            .to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated')
            .and.to.emit(aggchainECDSAMultisigContract, 'AggchainSignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(4);

        // Test remove signer - indices not in descending order
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
                [
                    { addr: signer1.address, index: 0 },
                    { addr: signer2.address, index: 1 },
                ],
                [],
                threshold,
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'IndicesNotInDescendingOrder');

        // Test successful remove signer
        const signersBeforeRemove = await aggchainECDSAMultisigContract.getAggchainSigners();
        const signer4Index = signersBeforeRemove.indexOf(signer4.address);

        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([{ addr: signer4.address, index: signer4Index }], [], threshold),
        )
            .to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated')
            .and.to.emit(aggchainECDSAMultisigContract, 'AggchainSignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer4.address)).to.be.equal(false);

        // Test remove signer - invalid index
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([{ addr: signer1.address, index: 10 }], [], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test remove signer - index doesn't match address
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([{ addr: signer1.address, index: 1 }], [], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test complex batch operation - remove and add in same transaction
        const signersBeforeBatch = await aggchainECDSAMultisigContract.getAggchainSigners();
        const signer3Index = signersBeforeBatch.indexOf(signer3.address);

        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold(
                    [{ addr: signer3.address, index: signer3Index }],
                    [{ addr: signer4.address, url: 'http://signer4' }],
                    3,
                ),
        )
            .to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated')
            .and.to.emit(aggchainECDSAMultisigContract, 'AggchainSignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer3.address)).to.be.equal(false);
        expect(await aggchainECDSAMultisigContract.isSigner(signer4.address)).to.be.equal(true);
    });

    it('should check threshold management', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        // Test updateThreshold - not aggchain manager
        await expect(aggchainECDSAMultisigContract.updateSignersAndThreshold([], [], 3)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyAggchainManager',
        );

        // Test updateThreshold - zero threshold is valid since we have signers
        // Zero threshold is actually allowed, so this should succeed
        await expect(aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0))
            .to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated')
            .and.to.emit(aggchainECDSAMultisigContract, 'AggchainSignersHashUpdated');

        // Restore threshold
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], threshold);

        // Test updateThreshold - threshold greater than signers count
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 5),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Test successful updateThreshold
        const oldThreshold = await aggchainECDSAMultisigContract.threshold();
        const newThreshold = 3;

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], newThreshold),
        )
            .to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated')
            .and.to.emit(aggchainECDSAMultisigContract, 'AggchainSignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(newThreshold);
    });

    it('should check constants and version', async () => {
        expect(await aggchainECDSAMultisigContract.AGGCHAIN_TYPE()).to.be.equal('0x0002');
        expect(await aggchainECDSAMultisigContract.AGGCHAIN_ECDSA_MULTISIG_VERSION()).to.be.equal('v1.0.0');
    });

    it('should check invalid initializer scenarios', async () => {
        // Deploy fresh contract for this test
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const freshContract = await upgrades.deployProxy(aggchainECDSAMultisigFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await freshContract.waitForDeployment();

        await freshContract.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Test with invalid initializer version (this would be version 2 which should revert)
        // This is a bit tricky to test as we need to simulate the internal state
        // For now, let's test that initialize with aggchainManager not set first fails

        // should set the aggchainManager: error "OnlyRollupManager"
        const freshContract2 = await upgrades.deployProxy(aggchainECDSAMultisigFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await expect(freshContract2.initAggchainManager(aggchainManager.address)).to.be.revertedWithCustomError(
            freshContract2,
            'OnlyRollupManager',
        );
    });

    it('should test edge cases for signers array manipulation', async () => {
        // Test with single signer and threshold 1
        const initialSigners = [signer1.address];
        const threshold = 1;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Initialize with single signer
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .updateSignersAndThreshold([], [{ addr: signer1.address, url: 'http://signer1' }], threshold);

        // Try to remove the only signer when threshold would still be 1 (should fail)
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
                [{ addr: signer1.address, index: 0 }],
                [],
                1, // threshold stays 1 but no signers left
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Add another signer
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .updateSignersAndThreshold([], [{ addr: signer2.address, url: 'http://signer2' }], threshold);

        // Now we can remove one signer (since 2-1=1 >= threshold=1)
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .updateSignersAndThreshold([{ addr: signer2.address, index: 1 }], [], threshold);

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(1);
        expect(await aggchainECDSAMultisigContract.isSigner(signer1.address)).to.be.equal(true);
        expect(await aggchainECDSAMultisigContract.isSigner(signer2.address)).to.be.equal(false);
    });

    it('should check vKeyManager functions', async () => {
        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Check initial vKeyManager
        expect(await aggchainECDSAMultisigContract.vKeyManager()).to.be.equal(vKeyManager.address);

        // Test transfer vKeyManager role - not vKeyManager
        await expect(
            aggchainECDSAMultisigContract.transferVKeyManagerRole(nonSigner.address),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyVKeyManager');

        // Test successful transfer
        await expect(aggchainECDSAMultisigContract.connect(vKeyManager).transferVKeyManagerRole(nonSigner.address))
            .to.emit(aggchainECDSAMultisigContract, 'TransferVKeyManagerRole')
            .withArgs(vKeyManager.address, nonSigner.address);

        expect(await aggchainECDSAMultisigContract.pendingVKeyManager()).to.be.equal(nonSigner.address);

        // Test accept role - not pending
        await expect(aggchainECDSAMultisigContract.acceptVKeyManagerRole()).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyPendingVKeyManager',
        );

        // Test successful accept
        await expect(aggchainECDSAMultisigContract.connect(nonSigner).acceptVKeyManagerRole())
            .to.emit(aggchainECDSAMultisigContract, 'AcceptVKeyManagerRole')
            .withArgs(vKeyManager.address, nonSigner.address);

        expect(await aggchainECDSAMultisigContract.vKeyManager()).to.be.equal(nonSigner.address);
        expect(await aggchainECDSAMultisigContract.pendingVKeyManager()).to.be.equal(ethers.ZeroAddress);

        // Test addOwnedAggchainVKey - not vKeyManager
        await expect(
            aggchainECDSAMultisigContract.addOwnedAggchainVKey('0x00010001', ethers.randomBytes(32)),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyVKeyManager');

        // Test addOwnedAggchainVKey - zero value
        await expect(
            aggchainECDSAMultisigContract.connect(nonSigner).addOwnedAggchainVKey('0x00010001', ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'ZeroValueAggchainVKey');

        // Test addOwnedAggchainVKey - already added
        await expect(
            aggchainECDSAMultisigContract
                .connect(nonSigner)
                .addOwnedAggchainVKey(aggchainVKeySelector, ethers.randomBytes(32)),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OwnedAggchainVKeyAlreadyAdded');

        // Test successful add
        const newSelector = '0x00010001';
        const newVKey = ethers.hexlify(ethers.randomBytes(32));
        await expect(aggchainECDSAMultisigContract.connect(nonSigner).addOwnedAggchainVKey(newSelector, newVKey))
            .to.emit(aggchainECDSAMultisigContract, 'AddAggchainVKey')
            .withArgs(newSelector, newVKey);

        expect(await aggchainECDSAMultisigContract.ownedAggchainVKeys(newSelector)).to.be.equal(newVKey);

        // Test updateOwnedAggchainVKey - not found
        await expect(
            aggchainECDSAMultisigContract
                .connect(nonSigner)
                .updateOwnedAggchainVKey('0x99999999', ethers.randomBytes(32)),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OwnedAggchainVKeyNotFound');

        // Test successful update
        const updatedVKey = ethers.hexlify(ethers.randomBytes(32));
        await expect(aggchainECDSAMultisigContract.connect(nonSigner).updateOwnedAggchainVKey(newSelector, updatedVKey))
            .to.emit(aggchainECDSAMultisigContract, 'UpdateAggchainVKey')
            .withArgs(newSelector, newVKey, updatedVKey);

        expect(await aggchainECDSAMultisigContract.ownedAggchainVKeys(newSelector)).to.be.equal(updatedVKey);
    });

    it('should check gateway flag functions', async () => {
        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Check initial useDefaultGateway
        expect(await aggchainECDSAMultisigContract.useDefaultGateway()).to.be.equal(useDefaultGateway);

        // Test enable gateway - not vKeyManager
        await expect(aggchainECDSAMultisigContract.enableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyVKeyManager',
        );

        // Since useDefaultGateway is false initially, we can enable it
        await expect(aggchainECDSAMultisigContract.connect(vKeyManager).enableUseDefaultGatewayFlag()).to.emit(
            aggchainECDSAMultisigContract,
            'EnableUseDefaultGatewayFlag',
        );

        expect(await aggchainECDSAMultisigContract.useDefaultGateway()).to.be.equal(true);

        // Test enable again - already enabled
        await expect(
            aggchainECDSAMultisigContract.connect(vKeyManager).enableUseDefaultGatewayFlag(),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'UseDefaultGatewayAlreadyEnabled');

        // Test disable gateway - not vKeyManager
        await expect(aggchainECDSAMultisigContract.disableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyVKeyManager',
        );

        // Test successful disable
        await expect(aggchainECDSAMultisigContract.connect(vKeyManager).disableUseDefaultGatewayFlag()).to.emit(
            aggchainECDSAMultisigContract,
            'DisableUseDefaultGatewayFlag',
        );

        expect(await aggchainECDSAMultisigContract.useDefaultGateway()).to.be.equal(false);

        // Test disable again - already disabled
        await expect(
            aggchainECDSAMultisigContract.connect(vKeyManager).disableUseDefaultGatewayFlag(),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'UseDefaultGatewayAlreadyDisabled');
    });

    it('should test the maximum uint32 threshold edge case', async () => {
        const initialSigners = [signer1.address, signer2.address];

        // Test with maximum possible threshold in initialization validation
        const maxUint32 = 2 ** 32 - 1;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Initialize signers first
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            2,
        );

        // Try to set threshold to maximum uint32 (should fail because threshold > signers.length)
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], maxUint32),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');
    });

    it('should test getAggchainVKey functions', async () => {
        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Test getAggchainVKey with useDefaultGateway false
        const vKey = await aggchainECDSAMultisigContract.getAggchainVKey(aggchainVKeySelector);
        expect(vKey).to.be.equal(newAggchainVKey);

        // Test getAggchainVKey with non-existent selector
        await expect(aggchainECDSAMultisigContract.getAggchainVKey('0x99999999')).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'AggchainVKeyNotFound',
        );

        // Test getAggchainVKeySelector
        const selector = await aggchainECDSAMultisigContract.getAggchainVKeySelector('0x0001', '0x0002');
        expect(selector).to.be.equal('0x00010002');

        // Test getAggchainTypeFromSelector
        const aggchainType = await aggchainECDSAMultisigContract.getAggchainTypeFromSelector(aggchainVKeySelector);
        expect(aggchainType).to.be.equal('0x0002');

        // Test getAggchainVKeyVersionFromSelector
        const version = await aggchainECDSAMultisigContract.getAggchainVKeyVersionFromSelector(aggchainVKeySelector);
        expect(version).to.be.equal('0x1234');
    });

    it('should test signerToURLs and empty signers edge case', async () => {
        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Initialize with empty signers (should set aggchainSignersHash)
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        // Verify empty signers hash is set
        const emptySignersHash = await aggchainECDSAMultisigContract.aggchainSignersHash();
        expect(emptySignersHash).to.not.equal(ethers.ZeroHash);

        // Now we can call getAggchainHash
        const aggchainData = utilsECDSAMultisig.encodeAggchainDataECDSAMultisig(aggchainVKeySelector);
        const aggchainHash = await aggchainECDSAMultisigContract.getAggchainHash(aggchainData);
        expect(aggchainHash).to.not.equal(ethers.ZeroHash);

        // Add signers and check URLs
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1-url' },
                { addr: signer2.address, url: 'http://signer2-url' },
            ],
            1,
        );

        expect(await aggchainECDSAMultisigContract.signerToURLs(signer1.address)).to.be.equal('http://signer1-url');
        expect(await aggchainECDSAMultisigContract.signerToURLs(signer2.address)).to.be.equal('http://signer2-url');
        expect(await aggchainECDSAMultisigContract.signerToURLs(nonSigner.address)).to.be.equal('');
    });

    it('should test aggchainManager role functions', async () => {
        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Check initial aggchainManager
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);

        // Test transfer aggchainManager role - not aggchainManager
        await expect(
            aggchainECDSAMultisigContract.transferAggchainManagerRole(nonSigner.address),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyAggchainManager');

        // Test transfer to zero address
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).transferAggchainManagerRole(ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidZeroAddress');

        // Test successful transfer
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).transferAggchainManagerRole(nonSigner.address),
        )
            .to.emit(aggchainECDSAMultisigContract, 'TransferAggchainManagerRole')
            .withArgs(aggchainManager.address, nonSigner.address);

        expect(await aggchainECDSAMultisigContract.pendingAggchainManager()).to.be.equal(nonSigner.address);

        // Test accept role - not pending
        await expect(aggchainECDSAMultisigContract.acceptAggchainManagerRole()).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyPendingAggchainManager',
        );

        // Test successful accept
        await expect(aggchainECDSAMultisigContract.connect(nonSigner).acceptAggchainManagerRole())
            .to.emit(aggchainECDSAMultisigContract, 'AcceptAggchainManagerRole')
            .withArgs(aggchainManager.address, nonSigner.address);

        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(nonSigner.address);
        expect(await aggchainECDSAMultisigContract.pendingAggchainManager()).to.be.equal(ethers.ZeroAddress);
    });

    it('should test getAggchainParamsAndVKeySelector', async () => {
        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(initializeBytes, { gasPrice: 0 });

        // Test invalid data length
        await expect(
            aggchainECDSAMultisigContract.getAggchainParamsAndVKeySelector('0x1234'),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidAggchainDataLength');

        // Test invalid aggchain type
        const invalidData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes4'], ['0x12340001']);
        await expect(
            aggchainECDSAMultisigContract.getAggchainParamsAndVKeySelector(invalidData),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidAggchainType');

        // Test valid data
        const validData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes4'], [aggchainVKeySelector]);
        const [vKey, params] = await aggchainECDSAMultisigContract.getAggchainParamsAndVKeySelector(validData);

        // Should return zeros for both vKey and params in this implementation
        expect(vKey).to.equal(ethers.ZeroHash);
        expect(params).to.equal(ethers.ZeroHash);
    });
});
