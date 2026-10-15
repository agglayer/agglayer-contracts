/* eslint-disable no-plusplus, no-await-in-loop, no-restricted-syntax */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { ethers, upgrades } from 'hardhat';
import { Address, AggchainQBFT, AggchainECDSAMultisig } from '../../typechain-types';
import * as utilsQBFT from '../../src/utils-aggchain-QBFT';
import * as utilsAggchain from '../../src/utils-common-aggchain';

// Vectors copied from prover-besu-qbft@6815011, see test/test-vectors/aggchainQBFT/README.md
const pathTestvectors = path.join(__dirname, '../test-vectors/aggchainQBFT');
const readJson = (...parts: string[]) => JSON.parse(fs.readFileSync(path.join(pathTestvectors, ...parts), 'utf8'));
const genesisHeader = readJson('headers', '000000-genesis.json');
const replaySteps = readJson('tally', 'replay.json').steps;
const aggchainParamsVectors = fs
    .readdirSync(path.join(pathTestvectors, 'aggchain_params'))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, ...readJson('aggchain_params', file) }));

const replayStep27 = replaySteps[27];

describe('AggchainQBFT', () => {
    let trustedSequencer: any;
    let admin: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;
    let signer1: any;
    let signer2: any;

    let aggchainQBFTContract: AggchainQBFT;

    // Default values initialization
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
    const agglayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

    const constructorArgs = [
        gerManagerAddress,
        polTokenAddress,
        bridgeAddress,
        rollupManagerAddress,
        agglayerGatewayAddress,
    ];
    const unsafeAllow = ['constructor', 'state-variable-immutable', 'missing-initializer-call'];

    const urlSequencer = 'http://besu-rpc:8545';
    const networkName = 'besu-qbft';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggchain variables
    const useDefaultVkeys = false;
    const useDefaultSigners = false;
    // selector = [program version 0x0001 | AGGCHAIN_TYPE 0x0002]
    const aggchainVKeySelector = '0x00010002';
    const newAggchainVKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    // genesis vector
    const genesisValidators: string[] = genesisHeader.validators_in_force;
    const genesisBlockHash: string = genesisHeader.block_hash;
    const genesisConsensusHash: string = genesisHeader.consensus_hash_after;
    const { chain_id: chainId, epoch_length: epochLength } = aggchainParamsVectors[0];

    const initParams = {
        startingBlockNumber: genesisHeader.number,
        startingBlockHash: genesisBlockHash,
        startingValidators: genesisValidators,
        startingOutstandingVotes: [] as any[],
        chainId,
        epochLength,
    };

    // helper to initialize a fresh (v0) AggchainQBFT contract
    async function initializeQBFT(contract: AggchainQBFT, params = initParams) {
        return contract.connect(aggchainManager).initialize(
            params,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );
    }

    async function deployQBFTProxy(): Promise<AggchainQBFT> {
        const aggchainQBFTFactory = await ethers.getContractFactory('AggchainQBFT');
        const contract = (await upgrades.deployProxy(aggchainQBFTFactory, [], {
            initializer: false,
            constructorArgs,
            unsafeAllow,
        })) as unknown as AggchainQBFT;
        await contract.waitForDeployment();
        await contract.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        return contract;
    }

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [, trustedSequencer, admin, aggchainManager, signer1, signer2] = await ethers.getSigners();

        // rollupSigner
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);

        aggchainQBFTContract = await deployQBFTProxy();
    });

    it('should check the vectors are consistent with the genesis consensus state', async () => {
        // consensus hash of the genesis validator set with no outstanding votes
        expect(utilsQBFT.computeConsensusStateHash(genesisValidators, [])).to.be.equal(genesisConsensusHash);
        // the 5 aggchain_params vectors are present
        expect(aggchainParamsVectors.length).to.be.equal(5);
    });

    it('should check the v0 initialized parameters', async () => {
        const initializeArgs = (params: any, extra: any = {}) => [
            params,
            extra.signers ?? [],
            extra.threshold ?? 0,
            extra.useDefaultVkeys ?? useDefaultVkeys,
            extra.useDefaultSigners ?? useDefaultSigners,
            extra.ownedVKey ?? newAggchainVKey,
            extra.selector ?? aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        ];

        // not the aggchain manager
        await expect(
            (aggchainQBFTContract.connect(admin) as any).initialize(...initializeArgs(initParams)),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'OnlyAggchainManager');

        // empty validators
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs({ ...initParams, startingValidators: [] }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'StartingValidatorsCannotBeEmpty');

        // validators not sorted ascending
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs({ ...initParams, startingValidators: [...genesisValidators].reverse() }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'StartingValidatorsNotSorted');

        // duplicated validators
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs({
                    ...initParams,
                    startingValidators: [genesisValidators[0], genesisValidators[0]],
                }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'StartingValidatorsNotSorted');

        // zero address validator
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs({
                    ...initParams,
                    startingValidators: [ethers.ZeroAddress, genesisValidators[0]],
                }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'StartingValidatorsNotSorted');

        // zero starting block hash
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs({ ...initParams, startingBlockHash: ethers.ZeroHash }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'StartingBlockHashCannotBeZero');

        // zero epoch length
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs({ ...initParams, epochLength: 0 }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'EpochLengthMustBeGreaterThanZero');

        // vkeys consistency: useDefaultVkeys with a selector
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs(initParams, { useDefaultVkeys: true }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidInitAggchainVKey');

        // vkeys consistency: selector of another aggchain type (FEP = 0x0001)
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs(initParams, { selector: '0x00010001' }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidAggchainType');

        // zero admin
        await expect(
            aggchainQBFTContract
                .connect(aggchainManager)
                .initialize(
                    initParams,
                    [],
                    0,
                    useDefaultVkeys,
                    useDefaultSigners,
                    newAggchainVKey,
                    aggchainVKeySelector,
                    ethers.ZeroAddress,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName,
                    { gasPrice: 0 },
                ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidZeroAddress');

        // default signers with signers to add
        await expect(
            (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
                ...initializeArgs(initParams, {
                    useDefaultSigners: true,
                    signers: [{ addr: signer1.address, url: 'http://signer1' }],
                    threshold: 1,
                }),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'ConflictingDefaultSignersConfiguration');

        // correct initialization, with a signer and a threshold
        await (aggchainQBFTContract.connect(aggchainManager) as any).initialize(
            ...initializeArgs(initParams, {
                signers: [
                    { addr: signer1.address, url: 'http://signer1' },
                    { addr: signer2.address, url: 'http://signer2' },
                ],
                threshold: 2,
            }),
        );

        // QBFT storage
        expect(await aggchainQBFTContract.lastProvenBlockNumber()).to.be.equal(initParams.startingBlockNumber);
        expect(await aggchainQBFTContract.startingBlockNumber()).to.be.equal(initParams.startingBlockNumber);
        expect(await aggchainQBFTContract.lastProvenBlockHash()).to.be.equal(genesisBlockHash);
        expect(await aggchainQBFTContract.consensusStateHash()).to.be.equal(genesisConsensusHash);
        expect(await aggchainQBFTContract.epochLength()).to.be.equal(epochLength);
        expect(await aggchainQBFTContract.chainConfigHash()).to.be.equal(
            utilsQBFT.computeChainConfigHash(chainId, epochLength, genesisBlockHash),
        );
        expect(await aggchainQBFTContract.chainConfigHash()).to.be.equal(aggchainParamsVectors[0].chain_config_hash);

        // aggchainBase
        expect(await aggchainQBFTContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await aggchainQBFTContract.useDefaultVkeys()).to.be.equal(useDefaultVkeys);
        expect(await aggchainQBFTContract.useDefaultSigners()).to.be.equal(useDefaultSigners);
        expect(await aggchainQBFTContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggchainVKey);
        expect(await aggchainQBFTContract.getAggchainSignersCount()).to.be.equal(2);
        expect(await aggchainQBFTContract.threshold()).to.be.equal(2);

        // PolygonConsensusBase
        expect(await aggchainQBFTContract.admin()).to.be.equal(admin.address);
        expect(await aggchainQBFTContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainQBFTContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainQBFTContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainQBFTContract.networkName()).to.be.equal(networkName);

        // constants
        expect(await aggchainQBFTContract.AGGCHAIN_TYPE()).to.be.equal(utilsQBFT.AGGCHAIN_TYPE_QBFT);
        expect(await aggchainQBFTContract.CONSENSUS_TYPE()).to.be.equal(utilsAggchain.CONSENSUS_TYPE.GENERIC);
        expect(await aggchainQBFTContract.AGGCHAIN_QBFT_VERSION()).to.be.equal('v1.0.0');
        expect(await aggchainQBFTContract.version()).to.be.equal('v1.0.0');

        // try to initialize again
        await expect(initializeQBFT(aggchainQBFTContract)).to.be.revertedWith(
            'Initializable: contract is already initialized',
        );

        // initializeFromECDSAMultisig is not callable on a v0 initialized contract
        await expect(
            aggchainQBFTContract.connect(aggchainManager).initializeFromECDSAMultisig(initParams, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should initialize with a non zero starting block and a validator set that differs from the genesis one', async () => {
        const startingValidators = [...genesisValidators.slice(0, 3)];
        const params = {
            startingBlockNumber: 1234,
            startingBlockHash: ethers.id('startingBlockHash'),
            startingValidators,
            startingOutstandingVotes: [],
            chainId: 7,
            epochLength: 30000,
        };
        await initializeQBFT(aggchainQBFTContract, params);

        expect(await aggchainQBFTContract.lastProvenBlockNumber()).to.be.equal(1234);
        expect(await aggchainQBFTContract.startingBlockNumber()).to.be.equal(1234);
        expect(await aggchainQBFTContract.lastProvenBlockHash()).to.be.equal(params.startingBlockHash);
        expect(await aggchainQBFTContract.consensusStateHash()).to.be.equal(
            utilsQBFT.computeConsensusStateHash(startingValidators, []),
        );
        expect(await aggchainQBFTContract.chainConfigHash()).to.be.equal(
            utilsQBFT.computeChainConfigHash(7, 30000, params.startingBlockHash),
        );
    });

    it('should check the getVKeyAndAggchainParams and onVerifyPessimistic against the vectors', async () => {
        for (const vector of aggchainParamsVectors) {
            // fresh contract per vector
            const contract = await deployQBFTProxy();
            await initializeQBFT(contract);

            // genesis state: consensus hash of the genesis validators equals the vector one
            expect(await contract.consensusStateHash()).to.be.equal(genesisConsensusHash);
            expect(await contract.chainConfigHash()).to.be.equal(vector.chain_config_hash);

            // move the contract to the previous state of the vector (only needed when it is not the genesis)
            if (vector.prev_block_number !== 0) {
                const prevAggchainData = utilsQBFT.encodeAggchainDataQBFT(
                    vector.aggchain_vkey_selector,
                    vector.prev_block_hash,
                    vector.prev_block_number,
                    vector.prev_consensus_hash,
                );
                await contract.connect(rollupManagerSigner).onVerifyPessimistic(prevAggchainData, { gasPrice: 0 });
            }
            expect(await contract.lastProvenBlockNumber()).to.be.equal(vector.prev_block_number);
            expect(await contract.lastProvenBlockHash()).to.be.equal(vector.prev_block_hash);
            expect(await contract.consensusStateHash()).to.be.equal(vector.prev_consensus_hash);

            // aggchain_data produced by the reference implementation
            expect((vector.aggchain_data.length - 2) / 2).to.be.equal(128);

            // byte equality of aggchain_params and vkey
            const [aggchainVKey, aggchainParams] = await contract.getVKeyAndAggchainParams(vector.aggchain_data);
            expect(aggchainParams, `${vector.file} aggchain_params`).to.be.equal(vector.aggchain_params);
            expect(aggchainVKey).to.be.equal(newAggchainVKey);

            // getAggchainHash is inherited from AggchainBase
            const multisigHash = await contract.getAggchainMultisigHash();
            expect(await contract.getAggchainHash(vector.aggchain_data)).to.be.equal(
                utilsAggchain.computeAggchainHash(
                    utilsAggchain.CONSENSUS_TYPE.GENERIC,
                    newAggchainVKey,
                    vector.aggchain_params,
                    multisigHash,
                ),
            );

            // state advance
            await expect(
                contract.connect(rollupManagerSigner).onVerifyPessimistic(vector.aggchain_data, { gasPrice: 0 }),
            )
                .to.emit(contract, 'BlockProven')
                .withArgs(vector.new_block_number, vector.new_block_hash, vector.new_consensus_hash);

            expect(await contract.lastProvenBlockNumber()).to.be.equal(vector.new_block_number);
            expect(await contract.lastProvenBlockHash()).to.be.equal(vector.new_block_hash);
            expect(await contract.consensusStateHash()).to.be.equal(vector.new_consensus_hash);
            // chain config is immutable
            expect(await contract.chainConfigHash()).to.be.equal(vector.chain_config_hash);

            // the same data does not advance anymore
            await expect(contract.getVKeyAndAggchainParams(vector.aggchain_data)).to.be.revertedWithCustomError(
                contract,
                'BlockNotAdvancing',
            );
        }
    });

    it('should check the getVKeyAndAggchainParams rejections', async () => {
        await initializeQBFT(aggchainQBFTContract);

        const vector = aggchainParamsVectors[0];
        const newBlockHash = vector.new_block_hash;
        const newConsensusHash = vector.new_consensus_hash;
        const encode = (selector: string, blockHash: string, blockNumber: number, consensusHash: string) =>
            utilsQBFT.encodeAggchainDataQBFT(selector, blockHash, blockNumber, consensusHash);

        // sanity: valid data
        await aggchainQBFTContract.getVKeyAndAggchainParams(
            encode(aggchainVKeySelector, newBlockHash, 2, newConsensusHash),
        );

        // wrong length: empty, 3 words (FEP shape) and 5 words
        await expect(aggchainQBFTContract.getVKeyAndAggchainParams('0x')).to.be.revertedWithCustomError(
            aggchainQBFTContract,
            'InvalidAggchainDataLength',
        );
        const threeWords = ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes4', 'bytes32', 'uint256'],
            [aggchainVKeySelector, newBlockHash, 2],
        );
        await expect(aggchainQBFTContract.getVKeyAndAggchainParams(threeWords)).to.be.revertedWithCustomError(
            aggchainQBFTContract,
            'InvalidAggchainDataLength',
        );
        const fiveWords = `${encode(aggchainVKeySelector, newBlockHash, 2, newConsensusHash)}${'00'.repeat(32)}`;
        await expect(aggchainQBFTContract.getVKeyAndAggchainParams(fiveWords)).to.be.revertedWithCustomError(
            aggchainQBFTContract,
            'InvalidAggchainDataLength',
        );

        // wrong selector type: FEP (0x0001) and ECDSA (0x0000)
        for (const wrongSelector of ['0x00010001', '0x00010000', '0x00010003']) {
            await expect(
                aggchainQBFTContract.getVKeyAndAggchainParams(encode(wrongSelector, newBlockHash, 2, newConsensusHash)),
            ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidAggchainType');
        }

        // not advancing: equal to the last proven block (0) and the block number zero
        await expect(
            aggchainQBFTContract.getVKeyAndAggchainParams(
                encode(aggchainVKeySelector, newBlockHash, 0, newConsensusHash),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'BlockNotAdvancing');

        // not advancing: lower than the last proven block
        await aggchainQBFTContract
            .connect(rollupManagerSigner)
            .onVerifyPessimistic(encode(aggchainVKeySelector, newBlockHash, 10, newConsensusHash), { gasPrice: 0 });
        for (const blockNumber of [10, 9, 1]) {
            await expect(
                aggchainQBFTContract.getVKeyAndAggchainParams(
                    encode(aggchainVKeySelector, newBlockHash, blockNumber, newConsensusHash),
                ),
            ).to.be.revertedWithCustomError(aggchainQBFTContract, 'BlockNotAdvancing');
        }
        // advancing by one is accepted
        await aggchainQBFTContract.getVKeyAndAggchainParams(
            encode(aggchainVKeySelector, newBlockHash, 11, newConsensusHash),
        );

        // zero hashes
        await expect(
            aggchainQBFTContract.getVKeyAndAggchainParams(
                encode(aggchainVKeySelector, ethers.ZeroHash, 11, newConsensusHash),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidAggchainData');
        await expect(
            aggchainQBFTContract.getVKeyAndAggchainParams(
                encode(aggchainVKeySelector, newBlockHash, 11, ethers.ZeroHash),
            ),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidAggchainData');

        // vkey not found for another program version
        await expect(
            aggchainQBFTContract.getVKeyAndAggchainParams(encode('0x00020002', newBlockHash, 11, newConsensusHash)),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'AggchainVKeyNotFound');
    });

    it('should check onVerifyPessimistic', async () => {
        await initializeQBFT(aggchainQBFTContract);

        const newBlockHash = ethers.id('newBlockHash');
        const newConsensusHash = ethers.id('newConsensusHash');
        const newBlockNumber = 104;
        const aggchainData = utilsQBFT.encodeAggchainDataQBFT(
            aggchainVKeySelector,
            newBlockHash,
            newBlockNumber,
            newConsensusHash,
        );

        // not rollup manager
        await expect(aggchainQBFTContract.onVerifyPessimistic(aggchainData)).to.be.revertedWithCustomError(
            aggchainQBFTContract,
            'OnlyRollupManager',
        );
        await expect(
            aggchainQBFTContract.connect(aggchainManager).onVerifyPessimistic(aggchainData),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'OnlyRollupManager');

        // wrong length
        await expect(
            aggchainQBFTContract.connect(rollupManagerSigner).onVerifyPessimistic('0x', { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidAggchainDataLength');

        // params of the first proof are computed against the genesis state
        const [, paramsFirst] = await aggchainQBFTContract.getVKeyAndAggchainParams(aggchainData);
        expect(paramsFirst).to.be.equal(
            utilsQBFT.computeHashAggchainParamsQBFT(
                genesisBlockHash,
                genesisConsensusHash,
                newBlockHash,
                newBlockNumber,
                newConsensusHash,
                await aggchainQBFTContract.chainConfigHash(),
            ),
        );

        await expect(
            aggchainQBFTContract.connect(rollupManagerSigner).onVerifyPessimistic(aggchainData, { gasPrice: 0 }),
        )
            .to.emit(aggchainQBFTContract, 'BlockProven')
            .withArgs(newBlockNumber, newBlockHash, newConsensusHash);

        expect(await aggchainQBFTContract.lastProvenBlockNumber()).to.be.equal(newBlockNumber);
        // the starting block number is never modified by settlements
        expect(await aggchainQBFTContract.startingBlockNumber()).to.be.equal(initParams.startingBlockNumber);
        expect(await aggchainQBFTContract.lastProvenBlockHash()).to.be.equal(newBlockHash);
        expect(await aggchainQBFTContract.consensusStateHash()).to.be.equal(newConsensusHash);

        // second proof is chained to the first one
        const secondBlockHash = ethers.id('secondBlockHash');
        const secondConsensusHash = ethers.id('secondConsensusHash');
        const secondData = utilsQBFT.encodeAggchainDataQBFT(
            aggchainVKeySelector,
            secondBlockHash,
            200,
            secondConsensusHash,
        );
        const [, paramsSecond] = await aggchainQBFTContract.getVKeyAndAggchainParams(secondData);
        expect(paramsSecond).to.be.equal(
            utilsQBFT.computeHashAggchainParamsQBFT(
                newBlockHash,
                newConsensusHash,
                secondBlockHash,
                200,
                secondConsensusHash,
                await aggchainQBFTContract.chainConfigHash(),
            ),
        );
        expect(paramsSecond).to.not.be.equal(paramsFirst);

        // the first data can not be replayed
        await expect(aggchainQBFTContract.getVKeyAndAggchainParams(aggchainData)).to.be.revertedWithCustomError(
            aggchainQBFTContract,
            'BlockNotAdvancing',
        );
    });

    it('should use the default vkeys from the gateway when useDefaultVkeys is true', async () => {
        const contract = await deployQBFTProxy();
        await contract.connect(aggchainManager).initialize(
            initParams,
            [],
            0,
            true, // useDefaultVkeys
            false,
            ethers.ZeroHash, // must be zero with default vkeys
            '0x00000000', // must be zero with default vkeys
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );
        expect(await contract.useDefaultVkeys()).to.be.equal(true);

        // the gateway of the test is a fake address, the call to fetch the default vkey fails: it proves the gateway is used
        const vector = aggchainParamsVectors[0];
        await expect(contract.getVKeyAndAggchainParams(vector.aggchain_data)).to.be.reverted;
    });

    it('should migrate from AggchainECDSAMultisig with initializeFromECDSAMultisig', async () => {
        // Deploy and initialize an AggchainECDSAMultisig proxy
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSA = (await upgrades.deployProxy(aggchainECDSAFactory, [], {
            initializer: false,
            constructorArgs,
            unsafeAllow,
        })) as unknown as AggchainECDSAMultisig;
        await aggchainECDSA.waitForDeployment();
        await aggchainECDSA.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        const signers = [
            { addr: signer1.address, url: 'http://signer1' },
            { addr: signer2.address, url: 'http://signer2' },
        ];
        await aggchainECDSA.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            signers,
            2, // threshold
            { gasPrice: 0 },
        );
        const multisigHashBefore = await aggchainECDSA.getAggchainMultisigHash();

        // Upgrade the proxy to the AggchainQBFT implementation (without calling an initializer)
        const aggchainQBFTFactory = await ethers.getContractFactory('AggchainQBFT');
        const upgraded = (await upgrades.upgradeProxy(aggchainECDSA.target, aggchainQBFTFactory, {
            constructorArgs,
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as AggchainQBFT;

        // QBFT state is empty until the reinitializer is called
        expect(await upgraded.lastProvenBlockHash()).to.be.equal(ethers.ZeroHash);
        expect(await upgraded.chainConfigHash()).to.be.equal(ethers.ZeroHash);

        // only the aggchain manager
        await expect(upgraded.connect(admin).initializeFromECDSAMultisig(initParams)).to.be.revertedWithCustomError(
            upgraded,
            'OnlyAggchainManager',
        );

        // invalid params are rejected
        await expect(
            upgraded
                .connect(aggchainManager)
                .initializeFromECDSAMultisig({ ...initParams, startingValidators: [] }, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(upgraded, 'StartingValidatorsCannotBeEmpty');
        await expect(
            upgraded
                .connect(aggchainManager)
                .initializeFromECDSAMultisig({ ...initParams, startingBlockHash: ethers.ZeroHash }, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(upgraded, 'StartingBlockHashCannotBeZero');
        await expect(
            upgraded
                .connect(aggchainManager)
                .initializeFromECDSAMultisig({ ...initParams, epochLength: 0 }, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(upgraded, 'EpochLengthMustBeGreaterThanZero');

        // the starting block is the last L2 block of the last settled ECDSA certificate
        const migrationParams = {
            startingBlockNumber: 27,
            startingBlockHash: ethers.id('lastEcdsaSettledBlock'),
            startingValidators: replayStep27.validators_after,
            startingOutstandingVotes: replayStep27.outstanding_after,
            chainId,
            epochLength,
        };
        await upgraded.connect(aggchainManager).initializeFromECDSAMultisig(migrationParams, { gasPrice: 0 });

        // QBFT state
        expect(await upgraded.lastProvenBlockNumber()).to.be.equal(27);
        expect(await upgraded.startingBlockNumber()).to.be.equal(27);
        expect(await upgraded.lastProvenBlockHash()).to.be.equal(migrationParams.startingBlockHash);
        expect(await upgraded.consensusStateHash()).to.be.equal(replayStep27.consensus_hash_after);
        expect(await upgraded.epochLength()).to.be.equal(epochLength);
        expect(await upgraded.chainConfigHash()).to.be.equal(
            utilsQBFT.computeChainConfigHash(chainId, epochLength, migrationParams.startingBlockHash),
        );

        // existing admin, signers, threshold and vkey flags are kept
        expect(await upgraded.admin()).to.be.equal(admin.address);
        expect(await upgraded.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await upgraded.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await upgraded.threshold()).to.be.equal(2);
        expect(await upgraded.getAggchainSignersCount()).to.be.equal(2);
        expect(await upgraded.isSigner(signer1.address)).to.be.equal(true);
        expect(await upgraded.isSigner(signer2.address)).to.be.equal(true);
        expect(await upgraded.getAggchainMultisigHash()).to.be.equal(multisigHashBefore);
        expect(await upgraded.useDefaultVkeys()).to.be.equal(false);
        expect(await upgraded.version()).to.be.equal('v1.0.0');
        expect(await upgraded.AGGCHAIN_TYPE()).to.be.equal('0x0002');

        // can not be called twice
        await expect(
            upgraded.connect(aggchainManager).initializeFromECDSAMultisig(migrationParams, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
        // nor the fresh initializer
        await expect(initializeQBFT(upgraded)).to.be.revertedWith('Initializable: contract is already initialized');

        // no owned vkey yet: the aggchain manager has to add the QBFT vkey
        const data = utilsQBFT.encodeAggchainDataQBFT(
            aggchainVKeySelector,
            ethers.id('newBlockHash'),
            30,
            ethers.id('newConsensusHash'),
        );
        await expect(upgraded.getVKeyAndAggchainParams(data)).to.be.revertedWithCustomError(
            upgraded,
            'AggchainVKeyNotFound',
        );
        await upgraded
            .connect(aggchainManager)
            .addOwnedAggchainVKey(aggchainVKeySelector, newAggchainVKey, { gasPrice: 0 });

        // the proof now chains from the migration state
        const [vkey, params] = await upgraded.getVKeyAndAggchainParams(data);
        expect(vkey).to.be.equal(newAggchainVKey);
        expect(params).to.be.equal(
            utilsQBFT.computeHashAggchainParamsQBFT(
                migrationParams.startingBlockHash,
                replayStep27.consensus_hash_after,
                ethers.id('newBlockHash'),
                30,
                ethers.id('newConsensusHash'),
                await upgraded.chainConfigHash(),
            ),
        );
        await expect(upgraded.connect(rollupManagerSigner).onVerifyPessimistic(data, { gasPrice: 0 })).to.emit(
            upgraded,
            'BlockProven',
        );
    });

    it('should initialize at a non epoch block with outstanding votes (tally/replay.json)', async () => {
        for (const stepNumber of [11, 26, 27, 55, 56]) {
            const step = replaySteps[stepNumber];
            expect(step.outstanding_after.length).to.be.greaterThan(0);
            expect(stepNumber % epochLength).to.not.be.equal(0);

            const contract = await deployQBFTProxy();
            await initializeQBFT(contract, {
                ...initParams,
                startingBlockNumber: stepNumber,
                startingValidators: step.validators_after,
                startingOutstandingVotes: step.outstanding_after,
            });
            // same hash as the reference tally after that header
            expect(await contract.consensusStateHash()).to.be.equal(step.consensus_hash_after);
        }
    });

    it('should check the starting outstanding votes validation', async () => {
        const step = replaySteps[27];
        const [vote1, vote2] = step.outstanding_after;
        const base = {
            ...initParams,
            startingBlockNumber: 27,
            startingValidators: step.validators_after,
            startingOutstandingVotes: step.outstanding_after,
        };
        // sanity
        await initializeQBFT(await deployQBFTProxy(), base);

        const expectRevert = async (params: any, error: string) => {
            const contract = await deployQBFTProxy();
            await expect(initializeQBFT(contract, params)).to.be.revertedWithCustomError(contract, error);
        };

        // not sorted (voter order swapped)
        await expectRevert({ ...base, startingOutstandingVotes: [vote2, vote1] }, 'OutstandingVotesNotSorted');
        // duplicated vote
        await expectRevert({ ...base, startingOutstandingVotes: [vote1, vote1] }, 'OutstandingVotesNotSorted');
        // subject not sorted
        const otherSubject = { ...vote1, subject: step.validators_after[0] };
        await expectRevert({ ...base, startingOutstandingVotes: [vote1, otherSubject] }, 'OutstandingVotesNotSorted');
        // voter that is not a validator
        await expectRevert(
            { ...base, startingOutstandingVotes: [{ ...vote1, voter: signer1.address }] },
            'OutstandingVoteFromNonValidator',
        );
        // votes at an epoch block
        await expectRevert({ ...base, startingBlockNumber: 20 }, 'OutstandingVotesMustBeEmptyAtEpoch');
        // votes at genesis
        await expectRevert({ ...base, startingBlockNumber: 0 }, 'OutstandingVotesMustBeEmptyAtEpoch');
        // empty votes are always accepted, also at an epoch block
        await initializeQBFT(await deployQBFTProxy(), {
            ...base,
            startingBlockNumber: 20,
            startingOutstandingVotes: [],
        });
    });

    it('should revert initializeFromECDSAMultisig on a fresh (v0) contract', async () => {
        await expect(
            aggchainQBFTContract.connect(aggchainManager).initializeFromECDSAMultisig(initParams, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainQBFTContract, 'InvalidInitializer');
    });
});
