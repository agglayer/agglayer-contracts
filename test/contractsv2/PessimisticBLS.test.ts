/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Address, PessimiticBLS } from '../../typechain-types';

describe('PessimisticBLS', () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;
    let user: any;

    let PessimisticBLSContract: PessimiticBLS;

    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'zkevm';
    const networkID = 1;

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // Sample BLS public key (48 bytes)
    const sampleBlsPublicKey = Array.from({ length: 48 }, (_, i) => `0x${(i + 1).toString(16).padStart(2, '0')}`);
    const updatedBlsPublicKey = Array.from({ length: 48 }, (_, i) => `0x${(i + 49).toString(16).padStart(2, '0')}`);

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin, user] = await ethers.getSigners();

        // deploy consensus
        // create PessimisticBLS implementation
        const pessimisticBLSFactory = await ethers.getContractFactory('PessimiticBLS');
        PessimisticBLSContract = await upgrades.deployProxy(pessimisticBLSFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        await PessimisticBLSContract.waitForDeployment();
    });

    it('should check the initialized parameters', async () => {
        // initialize zkEVM using non admin address
        await expect(
            PessimisticBLSContract.initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
            ),
        ).to.be.revertedWithCustomError(PessimisticBLSContract, 'OnlyRollupManager');

        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PessimisticBLSContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        expect(await PessimisticBLSContract.admin()).to.be.equal(admin.address);
        expect(await PessimisticBLSContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await PessimisticBLSContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await PessimisticBLSContract.networkName()).to.be.equal(networkName);
        expect(await PessimisticBLSContract.gasTokenAddress()).to.be.equal(gasTokenAddress);

        // Check initial BLS public key is empty
        const initialBlsKey = [];
        for (let i = 0; i < 48; i++) {
            initialBlsKey.push(await PessimisticBLSContract.blsPublicKey(i));
        }
        expect(initialBlsKey).to.deep.equal(Array(48).fill('0x00'));
        expect(await PessimisticBLSContract.blsPublicKeyHash()).to.be.equal(ethers.ZeroHash);

        // initialize again
        await expect(
            PessimisticBLSContract.connect(rollupManagerSigner).initialize(
                admin.address,
                trustedSequencer.address,
                networkID,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check admin functions', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PessimisticBLSContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // setTrustedSequencer
        await expect(PessimisticBLSContract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            PessimisticBLSContract,
            'OnlyAdmin',
        );

        await expect(PessimisticBLSContract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(PessimisticBLSContract, 'SetTrustedSequencer')
            .withArgs(deployer.address);

        // setTrustedSequencerURL
        await expect(PessimisticBLSContract.setTrustedSequencerURL('0x1253')).to.be.revertedWithCustomError(
            PessimisticBLSContract,
            'OnlyAdmin',
        );
        await expect(PessimisticBLSContract.connect(admin).setTrustedSequencerURL('0x1253'))
            .to.emit(PessimisticBLSContract, 'SetTrustedSequencerURL')
            .withArgs('0x1253');

        // transferAdminRole & acceptAdminRole
        await expect(PessimisticBLSContract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(PessimisticBLSContract, 'TransferAdminRole')
            .withArgs(deployer.address);

        await expect(PessimisticBLSContract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            PessimisticBLSContract,
            'OnlyPendingAdmin',
        );

        await expect(PessimisticBLSContract.connect(deployer).acceptAdminRole())
            .to.emit(PessimisticBLSContract, 'AcceptAdminRole')
            .withArgs(deployer.address);
    });

    it('should check BLS public key functions', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PessimisticBLSContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // setBLSPublicKey should fail if not called by admin
        await expect(
            PessimisticBLSContract.connect(user).setBLSPublicKey(sampleBlsPublicKey),
        ).to.be.revertedWithCustomError(PessimisticBLSContract, 'OnlyAdmin');

        // setBLSPublicKey should succeed when called by admin
        const expectedHash = ethers.keccak256(ethers.solidityPacked(['bytes1[48]'], [sampleBlsPublicKey]));
        await expect(PessimisticBLSContract.connect(admin).setBLSPublicKey(sampleBlsPublicKey))
            .to.emit(PessimisticBLSContract, 'BLSPublicKeyUpdated')
            .withArgs(sampleBlsPublicKey, expectedHash);

        // Check the stored values
        const storedBlsKey = [];
        for (let i = 0; i < 48; i++) {
            storedBlsKey.push(await PessimisticBLSContract.blsPublicKey(i));
        }
        expect(storedBlsKey).to.deep.equal(sampleBlsPublicKey);
        expect(await PessimisticBLSContract.blsPublicKeyHash()).to.be.equal(expectedHash);

        // Update the BLS public key
        const newExpectedHash = ethers.keccak256(ethers.solidityPacked(['bytes1[48]'], [updatedBlsPublicKey]));
        await expect(PessimisticBLSContract.connect(admin).setBLSPublicKey(updatedBlsPublicKey))
            .to.emit(PessimisticBLSContract, 'BLSPublicKeyUpdated')
            .withArgs(updatedBlsPublicKey, newExpectedHash);

        // Check the updated values
        const updatedStoredBlsKey = [];
        for (let i = 0; i < 48; i++) {
            updatedStoredBlsKey.push(await PessimisticBLSContract.blsPublicKey(i));
        }
        expect(updatedStoredBlsKey).to.deep.equal(updatedBlsPublicKey);
        expect(await PessimisticBLSContract.blsPublicKeyHash()).to.be.equal(newExpectedHash);
    });

    it('should check getConsensusHash with empty BLS key', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PessimisticBLSContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // PessimisticBLS CONSENSUS_TYPE = 2
        const CONSENSUS_TYPE = 2;
        const expectedConsensusHash = ethers.solidityPackedKeccak256(
            ['uint32', 'bytes32'],
            [CONSENSUS_TYPE, ethers.ZeroHash],
        );

        // getConsensusHash with empty BLS key
        const resGetConsensusHash = await PessimisticBLSContract.getConsensusHash();
        expect(resGetConsensusHash).to.be.equal(expectedConsensusHash);
    });

    it('should check getConsensusHash with BLS key set', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await PessimisticBLSContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Set BLS public key
        await PessimisticBLSContract.connect(admin).setBLSPublicKey(sampleBlsPublicKey);

        // PessimisticBLS CONSENSUS_TYPE = 2
        const CONSENSUS_TYPE = 2;
        const blsKeyHash = ethers.keccak256(ethers.solidityPacked(['bytes1[48]'], [sampleBlsPublicKey]));
        const expectedConsensusHash = ethers.solidityPackedKeccak256(
            ['uint32', 'bytes32'],
            [CONSENSUS_TYPE, blsKeyHash],
        );

        // getConsensusHash with BLS key set
        const resGetConsensusHash = await PessimisticBLSContract.getConsensusHash();
        expect(resGetConsensusHash).to.be.equal(expectedConsensusHash);
    });
});
