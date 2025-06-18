/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Address, AggchainECDSAV2 } from '../../typechain-types';
import * as utilsFEP from '../../src/utils-aggchain-FEP';
import * as utilsAggchain from '../../src/utils-common-aggchain';

describe('AggchainECDSAV2', () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;
    let vKeyManager: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;
    let optModeManager: any;

    let aggchainECDSAV2Contract: AggchainECDSAV2;

    // Default values initialization
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'zkevm';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    beforeEach('Deploy contracts', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin, vKeyManager, aggchainManager, optModeManager] = await ethers.getSigners();

        // deploy aggchain
        // create aggchainFEP implementation
        const aggchainECDSAV2Factory = await ethers.getContractFactory('AggchainECDSAV2');
        aggchainECDSAV2Contract = await upgrades.deployProxy(aggchainECDSAV2Factory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await aggchainECDSAV2Contract.waitForDeployment();

        // rollupSigner
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
    });

    it('Initialize aggchainECDSAV2', async () => {

        const initializeBytesAggchain = utilsAggchain.encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // should set the aggchainManager: error "OnlyRollupManager"
        await expect(aggchainECDSAV2Contract.initAggchainManager(aggchainManager.address)).to.be.revertedWithCustomError(
            aggchainECDSAV2Contract,
            'OnlyRollupManager',
        );

        // initialize using rollup manager
        await aggchainECDSAV2Contract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAV2Contract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // check all SC storage slots are correctly initialized
        // aggchainBase
        expect(await aggchainECDSAV2Contract.useDefaultGateway()).to.be.equal(false);

        // PolygonConsensusBase
        expect(await aggchainECDSAV2Contract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAV2Contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAV2Contract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAV2Contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAV2Contract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainECDSAV2Contract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check getAggchainHash', async () => {

        // initialize using rollup manager
        const initializeBytesAggchain = utilsAggchain.encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await aggchainECDSAV2Contract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAV2Contract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        const aggchainHashSC = await aggchainECDSAV2Contract.getAggchainHash("0x");

        const CONSENSUS_TYPE_PESSIMISTIC = 0;
        const aggchainHashJS = ethers.solidityPackedKeccak256(
            ['uint32', 'address'],
            [CONSENSUS_TYPE_PESSIMISTIC, trustedSequencer.address],
        );
        expect(aggchainHashSC).to.be.equal(aggchainHashJS);
    });

    it('should check onVerifyPessimistic', async () => {
        // onVerifyPessimistic
        await expect(aggchainECDSAV2Contract
            .connect(rollupManagerSigner)
            .onVerifyPessimistic("0x", { gasPrice: 0 }))
            .to.emit(aggchainECDSAV2Contract, 'OnVerifyPessimisticECDSAV2');
    });

    it('should check aggchainManager role', async () => {

        // initialize using rollup manager
        const initializeBytesAggchain = utilsAggchain.encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await aggchainECDSAV2Contract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAV2Contract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // aggchainManager: managing role
        await expect(aggchainECDSAV2Contract.transferAggchainManagerRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainECDSAV2Contract,
            'OnlyAggchainManager',
        );
        await expect(
            aggchainECDSAV2Contract.connect(aggchainManager).transferAggchainManagerRole(ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(aggchainECDSAV2Contract, 'InvalidZeroAddress');

        await expect(aggchainECDSAV2Contract.connect(aggchainManager).transferAggchainManagerRole(deployer.address))
            .to.emit(aggchainECDSAV2Contract, 'TransferAggchainManagerRole')
            .withArgs(aggchainManager, deployer.address);

        const pendingAggchainManager = await aggchainECDSAV2Contract.pendingAggchainManager();
        expect(pendingAggchainManager).to.be.equal(deployer.address);

        await expect(
            aggchainECDSAV2Contract.connect(aggchainManager).acceptAggchainManagerRole(),
        ).to.be.revertedWithCustomError(aggchainECDSAV2Contract, 'OnlyPendingAggchainManager');

        await expect(aggchainECDSAV2Contract.acceptAggchainManagerRole())
            .to.emit(aggchainECDSAV2Contract, 'AcceptAggchainManagerRole')
            .withArgs(aggchainManager, deployer.address);

        const finalAggchainManager = await aggchainECDSAV2Contract.aggchainManager();
        expect(finalAggchainManager).to.be.equal(deployer.address);
    });
});
