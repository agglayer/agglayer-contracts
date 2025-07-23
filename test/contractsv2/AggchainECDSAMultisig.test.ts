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
            [],
            threshold,
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

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'EmptySignersArray');

        // Zero threshold
        invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            0,
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

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Threshold greater than signers count
        invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            5,
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

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Signer with zero address
        const invalidSigners = [signer1.address, ethers.ZeroAddress, signer3.address];
        invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            invalidSigners,
            2,
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

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerCannotBeZero');

        // Duplicate signers
        const duplicateSigners = [signer1.address, signer2.address, signer1.address];
        invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            duplicateSigners,
            2,
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

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Invalid aggchain type
        const invalidSelector = '0x12340001'; // Wrong type
        invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            threshold,
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
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidAggchainType');

        // Correct initialization
        const validInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            threshold,
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

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(validInitializeBytes, { gasPrice: 0 });

        // Check initialized storage
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(threshold);
        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(initialSigners.length);

        const storedSigners = await aggchainECDSAMultisigContract.getSigners();
        expect(storedSigners).to.have.lengthOf(initialSigners.length);
        for (let i = 0; i < initialSigners.length; i++) {
            expect(storedSigners[i]).to.equal(initialSigners[i]);
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
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(validInitializeBytes, { gasPrice: 0 }),
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
            initialSigners,
            threshold,
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

        // Check storage
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(threshold);
        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(initialSigners.length);

        // Check that PolygonConsensusBase parameters are preserved from v0
        expect(await aggchainECDSAMultisigContract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAMultisigContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAMultisigContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAMultisigContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAMultisigContract.networkName()).to.be.equal(networkName);
    });

    it('should check getAggchainHash', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            threshold,
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
        const finalVKey = await aggchainECDSAMultisigContract.ownedAggchainVKeys(aggchainVKeySelector);
        const signersHash = await aggchainECDSAMultisigContract.signersHash();
        const currentThreshold = await aggchainECDSAMultisigContract.threshold();

        const aggchainParamsHash = utilsECDSAMultisig.computeHashAggchainParamsECDSAMultisig(
            signersHash,
            currentThreshold,
        );
        const consensusType = await aggchainECDSAMultisigContract.CONSENSUS_TYPE();
        const expectedAggchainHash = utilsAggchain.computeAggchainHash(consensusType, finalVKey, aggchainParamsHash);

        expect(aggchainHashSC).to.be.equal(expectedAggchainHash);
    });

    it('should check view functions', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            threshold,
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

        // Test getSignersCount
        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(initialSigners.length);

        // Test getSigners
        const storedSigners = await aggchainECDSAMultisigContract.getSigners();
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
        const expectedSignersHash = ethers.solidityPackedKeccak256(['address[]'], [initialSigners]);
        expect(await aggchainECDSAMultisigContract.signersHash()).to.be.equal(expectedSignersHash);
    });

    it('should check onVerifyPessimistic', async () => {
        const initialSigners = [signer1.address, signer2.address];
        const threshold = 1;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            threshold,
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

        const aggchainData = utilsECDSAMultisig.encodeAggchainDataECDSAMultisig(aggchainVKeySelector);

        // Test onVerifyPessimistic: not rollup manager
        await expect(aggchainECDSAMultisigContract.onVerifyPessimistic(aggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyRollupManager',
        );

        // Test invalid aggchain data length
        await expect(
            aggchainECDSAMultisigContract.connect(rollupManagerSigner).onVerifyPessimistic('0x', { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidAggchainDataLength');

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
            initialSigners,
            threshold,
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

        // Test addSigner - not aggchain manager
        await expect(aggchainECDSAMultisigContract.addSigner(signer3.address)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyAggchainManager',
        );

        // Test addSigner - zero address
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).addSigner(ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerCannotBeZero');

        // Test addSigner - already exists
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).addSigner(signer1.address),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Test successful addSigner
        await expect(aggchainECDSAMultisigContract.connect(aggchainManager).addSigner(signer3.address))
            .to.emit(aggchainECDSAMultisigContract, 'SignerAdded')
            .withArgs(signer3.address)
            .and.to.emit(aggchainECDSAMultisigContract, 'SignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer3.address)).to.be.equal(true);

        // Test addMultiSigners - not aggchain manager
        await expect(aggchainECDSAMultisigContract.addMultiSigners([signer4.address])).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyAggchainManager',
        );

        // Test addMultiSigners - empty array
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).addMultiSigners([]),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'EmptySignersArray');

        // Test addMultiSigners - with duplicate
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).addMultiSigners([signer4.address, signer1.address]),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Test successful addMultiSigners
        await expect(aggchainECDSAMultisigContract.connect(aggchainManager).addMultiSigners([signer4.address]))
            .to.emit(aggchainECDSAMultisigContract, 'SignerAdded')
            .withArgs(signer4.address)
            .and.to.emit(aggchainECDSAMultisigContract, 'SignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(4);

        // Test removeSigner - not aggchain manager
        await expect(aggchainECDSAMultisigContract.removeSigner(signer4.address, 3)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyAggchainManager',
        );

        // Test removeSigner - threshold too high after removal
        // We currently have 4 signers (signer1, signer2, signer3, signer4) and threshold=2
        // Remove signer4 first (safe since 4-1=3 >= 2)
        await aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer4.address, 3);

        // Remove signer3 (safe since 3-1=2 >= 2)
        await aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer3.address, 2);

        // Now we have 2 signers and threshold=2, removing one more would leave 1 signer < threshold=2
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer2.address, 1),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'ThresholdTooHighAfterRemoval');

        // Add signer back for other tests
        await aggchainECDSAMultisigContract.connect(aggchainManager).addSigner(signer3.address);

        // Test removeSigner - invalid index
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer1.address, 10),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test removeSigner - index doesn't match address
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer1.address, 1),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test removeSigner - signer not in mapping
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(nonSigner.address, 0),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test successful removeSigner
        const initialCount = await aggchainECDSAMultisigContract.getSignersCount();
        await expect(aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer3.address, 2))
            .to.emit(aggchainECDSAMultisigContract, 'SignerRemoved')
            .withArgs(signer3.address)
            .and.to.emit(aggchainECDSAMultisigContract, 'SignersHashUpdated');

        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(initialCount - 1n);
        expect(await aggchainECDSAMultisigContract.isSigner(signer3.address)).to.be.equal(false);
    });

    it('should check threshold management', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        const initializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            threshold,
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

        // Test updateThreshold - not aggchain manager
        await expect(aggchainECDSAMultisigContract.updateThreshold(3)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyAggchainManager',
        );

        // Test updateThreshold - zero threshold
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateThreshold(0),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Test updateThreshold - threshold greater than signers count
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateThreshold(5),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Test successful updateThreshold
        const oldThreshold = await aggchainECDSAMultisigContract.threshold();
        const newThreshold = 3;

        await expect(aggchainECDSAMultisigContract.connect(aggchainManager).updateThreshold(newThreshold))
            .to.emit(aggchainECDSAMultisigContract, 'ThresholdUpdated')
            .withArgs(oldThreshold, newThreshold);

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
            initialSigners,
            threshold,
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

        // Try to remove the only signer (should fail due to threshold)
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer1.address, 0),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'ThresholdTooHighAfterRemoval');

        // Add another signer and then we can remove one
        await aggchainECDSAMultisigContract.connect(aggchainManager).addSigner(signer2.address);

        // Now we can remove signer (since 2-1=1 >= threshold=1)
        await aggchainECDSAMultisigContract.connect(aggchainManager).removeSigner(signer2.address, 1);

        expect(await aggchainECDSAMultisigContract.getSignersCount()).to.be.equal(1);
        expect(await aggchainECDSAMultisigContract.isSigner(signer1.address)).to.be.equal(true);
        expect(await aggchainECDSAMultisigContract.isSigner(signer2.address)).to.be.equal(false);
    });

    it('should test the maximum uint32 threshold edge case', async () => {
        const initialSigners = [signer1.address, signer2.address];

        // Test with maximum possible threshold in initialization validation
        const maxUint32 = 2 ** 32 - 1;

        const invalidInitializeBytes = utilsECDSAMultisig.encodeInitializeBytesAggchainECDSAMultisigv0(
            initialSigners,
            maxUint32, // This should fail because threshold > signers.length
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

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(invalidInitializeBytes, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');
    });
});
