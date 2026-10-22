/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AggOracleCommitteeV2, AgglayerGERL2 } from '../../typechain-types';

describe('AggOracleCommitteeV2 tests', () => {
    upgrades.silenceWarnings();

    let aggOracleCommitteeContract: AggOracleCommitteeV2;
    let globalExitRootManagerContract: AgglayerGERL2;

    let deployer: any;
    let owner: any;
    let proposer: any;
    let notOwner: any;
    let bridge: any;
    let newGlobalExitRootUpdater: any;

    // validators are random wallets: they only sign off-chain, they never send transactions
    let validator1: any;
    let validator2: any;
    let validator3: any;
    let validator4: any;
    let notValidator: any;

    // secp256k1 curve order, used to build malleable (high-s) signatures
    const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

    /**
     * Builds the validator info array expected by the contract
     */
    function toValidatorInfo(wallets: any[], url = '') {
        return wallets.map((w) => ({ addr: w.address, url }));
    }

    /**
     * Sorts wallets by address in ascending order, as required by the signature verification
     */
    function sortByAddress(wallets: any[]) {
        return [...wallets].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
    }

    /**
     * Message signed by the validators: keccak256(abi.encodePacked(globalExitRoot))
     */
    function buildGERMessage(globalExitRoot: string) {
        return ethers.solidityPackedKeccak256(['bytes32'], [globalExitRoot]);
    }

    /**
     * Signs the GER message with every wallet (no sorting) and returns the packed signatures (r, s, v)
     */
    function signGER(globalExitRoot: string, wallets: any[]) {
        const messageHash = buildGERMessage(globalExitRoot);
        return ethers.concat(wallets.map((w) => w.signingKey.sign(messageHash).serialized));
    }

    /**
     * Signs the GER message with the wallets sorted by address
     */
    function signGERSorted(globalExitRoot: string, wallets: any[]) {
        return signGER(globalExitRoot, sortByAddress(wallets));
    }

    async function initializeDefault(wallets: any[], threshold: number) {
        await aggOracleCommitteeContract.initialize(
            owner.address,
            proposer.address,
            toValidatorInfo(wallets, 'https://validator.url'),
            threshold,
        );
    }

    async function setCommitteeAsGERUpdater() {
        await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);
        await aggOracleCommitteeContract.connect(owner).acceptGlobalExitRootUpdater();
    }

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, owner, proposer, notOwner, bridge, newGlobalExitRootUpdater] = await ethers.getSigners();

        // create validators
        [validator1, validator2, validator3, validator4, notValidator] = [0, 1, 2, 3, 4].map(() =>
            ethers.Wallet.createRandom(),
        );

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory('AgglayerGERL2');
        globalExitRootManagerContract = (await upgrades.deployProxy(
            GlobalExitRootManagerL2SovereignChainFactory,
            [deployer.address, deployer.address], // Initializer params
            {
                initializer: 'initialize', // initializer function name
                constructorArgs: [bridge.address], // Constructor arguments
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            },
        )) as unknown as AgglayerGERL2;

        // deploy AggOracleCommitteeV2
        const AggOracleCommitteeV2Factory = await ethers.getContractFactory('AggOracleCommitteeV2');
        aggOracleCommitteeContract = (await upgrades.deployProxy(AggOracleCommitteeV2Factory, [], {
            initializer: false,
            constructorArgs: [globalExitRootManagerContract.target],
            unsafeAllow: ['constructor'],
        })) as unknown as AggOracleCommitteeV2;
    });

    describe('Deployment and Initialization', () => {
        it('Should fail to deploy with zero AgglayerGERL2 address', async () => {
            const AggOracleCommitteeV2Factory = await ethers.getContractFactory('AggOracleCommitteeV2');
            await expect(AggOracleCommitteeV2Factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                AggOracleCommitteeV2Factory,
                'AgglayerGERL2CannotBeZero',
            );
        });

        it('Should disable initializers on the implementation', async () => {
            const AggOracleCommitteeV2Factory = await ethers.getContractFactory('AggOracleCommitteeV2');
            const implementation = await AggOracleCommitteeV2Factory.deploy(globalExitRootManagerContract.target);

            await expect(
                implementation.initialize(owner.address, proposer.address, toValidatorInfo([validator1]), 1),
            ).to.be.revertedWithCustomError(implementation, 'InvalidInitialization');
        });

        it('Should initialize with correct parameters', async () => {
            const threshold = 2;
            const validators = [validator1, validator2, validator3];

            await expect(
                aggOracleCommitteeContract.initialize(
                    owner.address,
                    proposer.address,
                    toValidatorInfo(validators, 'https://validator.url'),
                    threshold,
                ),
            )
                .to.emit(aggOracleCommitteeContract, 'OwnershipTransferred')
                .withArgs(ethers.ZeroAddress, owner.address)
                .to.emit(aggOracleCommitteeContract, 'UpdateAggOracleProposer')
                .withArgs(proposer.address)
                .to.emit(aggOracleCommitteeContract, 'ValidatorsAndThresholdUpdated')
                .withArgs(
                    validators.map((v) => v.address),
                    threshold,
                );

            expect(await aggOracleCommitteeContract.owner()).to.equal(owner.address);
            expect(await aggOracleCommitteeContract.proposer()).to.equal(proposer.address);
            expect(await aggOracleCommitteeContract.threshold()).to.equal(threshold);
            expect(await aggOracleCommitteeContract.getValidatorsCount()).to.equal(3);
            for (let i = 0; i < validators.length; i++) {
                expect(await aggOracleCommitteeContract.validators(i)).to.equal(validators[i].address);
                expect(await aggOracleCommitteeContract.isValidator(validators[i].address)).to.equal(true);
            }
        });

        it('Should initialize with a single validator and threshold one', async () => {
            await initializeDefault([validator1], 1);

            expect(await aggOracleCommitteeContract.threshold()).to.equal(1);
            expect(await aggOracleCommitteeContract.getValidatorsCount()).to.equal(1);
        });

        it('Should allow validators with an empty url', async () => {
            await aggOracleCommitteeContract.initialize(
                owner.address,
                proposer.address,
                toValidatorInfo([validator1]),
                1,
            );

            const validatorInfo = await aggOracleCommitteeContract.validatorInfo(validator1.address);
            expect(validatorInfo.isValidator).to.equal(true);
            expect(validatorInfo.url).to.equal('');
        });

        it('Should fail to initialize with zero owner', async () => {
            await expect(
                aggOracleCommitteeContract.initialize(
                    ethers.ZeroAddress,
                    proposer.address,
                    toValidatorInfo([validator1]),
                    1,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnerCannotBeZero');
        });

        it('Should fail to initialize with zero proposer', async () => {
            await expect(
                aggOracleCommitteeContract.initialize(
                    owner.address,
                    ethers.ZeroAddress,
                    toValidatorInfo([validator1]),
                    1,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ProposerCannotBeZero');
        });

        it('Should fail to initialize with zero threshold', async () => {
            await expect(
                aggOracleCommitteeContract.initialize(
                    owner.address,
                    proposer.address,
                    toValidatorInfo([validator1, validator2]),
                    0,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeZero');
        });

        it('Should fail to initialize without validators', async () => {
            await expect(
                aggOracleCommitteeContract.initialize(owner.address, proposer.address, [], 0),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeZero');

            await expect(
                aggOracleCommitteeContract.initialize(owner.address, proposer.address, [], 1),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeGreaterThanValidators');
        });

        it('Should fail to initialize with threshold greater than validators', async () => {
            await expect(
                aggOracleCommitteeContract.initialize(
                    owner.address,
                    proposer.address,
                    toValidatorInfo([validator1, validator2]),
                    3,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeGreaterThanValidators');
        });

        it('Should fail to initialize with duplicated validators', async () => {
            await expect(
                aggOracleCommitteeContract.initialize(
                    owner.address,
                    proposer.address,
                    toValidatorInfo([validator1, validator1]),
                    1,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorAlreadyExists');
        });

        it('Should fail to reinitialize', async () => {
            await initializeDefault([validator1, validator2], 2);

            await expect(
                aggOracleCommitteeContract.initialize(
                    owner.address,
                    proposer.address,
                    toValidatorInfo([validator1, validator2]),
                    2,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidInitialization');
        });

        it('Should properly set agglayerGERL2', async () => {
            expect(await aggOracleCommitteeContract.agglayerGERL2()).to.equal(globalExitRootManagerContract.target);
        });

        it('Should return the correct version and constants', async () => {
            expect(await aggOracleCommitteeContract.version()).to.equal('v1.0.0');
            expect(await aggOracleCommitteeContract.VERSION_AGG_ORACLE_COMMITTEE_V2()).to.equal('v1.0.0');
            expect(await aggOracleCommitteeContract.MAX_VALIDATORS()).to.equal(255);
        });
    });

    describe('Validators and Threshold Management', () => {
        beforeEach(async () => {
            await initializeDefault([validator1, validator2], 2);
        });

        it('Should add a new validator', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([], toValidatorInfo([validator3], 'https://v3.url'), 2),
            )
                .to.emit(aggOracleCommitteeContract, 'ValidatorsAndThresholdUpdated')
                .withArgs([validator1.address, validator2.address, validator3.address], 2);

            expect(await aggOracleCommitteeContract.getValidatorsCount()).to.equal(3);
            const validatorInfo = await aggOracleCommitteeContract.validatorInfo(validator3.address);
            expect(validatorInfo.isValidator).to.equal(true);
            expect(validatorInfo.url).to.equal('https://v3.url');
        });

        it('Should update only the threshold', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold([], [], 1))
                .to.emit(aggOracleCommitteeContract, 'ValidatorsAndThresholdUpdated')
                .withArgs([validator1.address, validator2.address], 1);

            expect(await aggOracleCommitteeContract.threshold()).to.equal(1);
        });

        it('Should fail to add zero address as validator', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([], [{ addr: ethers.ZeroAddress, url: '' }], 2),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorCannotBeZero');
        });

        it('Should fail to add the contract itself as validator', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([], [{ addr: aggOracleCommitteeContract.target, url: '' }], 2),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorCannotBeThisContract');
        });

        it('Should fail to add existing validator', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([], toValidatorInfo([validator1]), 2),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorAlreadyExists');
        });

        it('Should fail to update validators if not owner', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(notOwner)
                    .updateValidatorsAndThreshold([], toValidatorInfo([validator3]), 2),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });

        it('Should remove a validator', async () => {
            const index = await aggOracleCommitteeContract.getValidatorIndex(validator1.address);

            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([{ addr: validator1.address, index }], [], 1),
            )
                .to.emit(aggOracleCommitteeContract, 'ValidatorsAndThresholdUpdated')
                .withArgs([validator2.address], 1);

            expect(await aggOracleCommitteeContract.getValidatorsCount()).to.equal(1);
            expect(await aggOracleCommitteeContract.isValidator(validator1.address)).to.equal(false);
            const validatorInfo = await aggOracleCommitteeContract.validatorInfo(validator1.address);
            expect(validatorInfo.url).to.equal('');
        });

        it('Should fail to remove a validator with an out of bounds index', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([{ addr: validator1.address, index: 2 }], [], 1),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorIndexOutOfBounds');
        });

        it('Should fail to remove a validator with a wrong index', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([{ addr: validator1.address, index: 1 }], [], 1),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorIndexMismatch');
        });

        it('Should fail to remove a non-existent validator', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([{ addr: notValidator.address, index: 0 }], [], 1),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorIndexMismatch');
        });

        it('Should fail to remove validators if indices are not in descending order', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold(
                    [
                        { addr: validator1.address, index: 0 },
                        { addr: validator2.address, index: 1 },
                    ],
                    toValidatorInfo([validator3]),
                    1,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'IndicesNotInDescendingOrder');
        });

        it('Should fail to remove validators with repeated indices', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold(
                    [
                        { addr: validator2.address, index: 1 },
                        { addr: validator2.address, index: 1 },
                    ],
                    toValidatorInfo([validator3]),
                    1,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'IndicesNotInDescendingOrder');
        });

        it('Should remove multiple validators in descending order and add new ones', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold(
                    [
                        { addr: validator2.address, index: 1 },
                        { addr: validator1.address, index: 0 },
                    ],
                    toValidatorInfo([validator3, validator4]),
                    2,
                ),
            )
                .to.emit(aggOracleCommitteeContract, 'ValidatorsAndThresholdUpdated')
                .withArgs([validator3.address, validator4.address], 2);

            expect(await aggOracleCommitteeContract.isValidator(validator1.address)).to.equal(false);
            expect(await aggOracleCommitteeContract.isValidator(validator2.address)).to.equal(false);
            expect(await aggOracleCommitteeContract.isValidator(validator3.address)).to.equal(true);
            expect(await aggOracleCommitteeContract.isValidator(validator4.address)).to.equal(true);
        });

        it('Should allow removing and re-adding the same validator in one call', async () => {
            await aggOracleCommitteeContract
                .connect(owner)
                .updateValidatorsAndThreshold(
                    [{ addr: validator1.address, index: 0 }],
                    toValidatorInfo([validator1], 'https://new.url'),
                    2,
                );

            expect(await aggOracleCommitteeContract.getValidatorIndex(validator1.address)).to.equal(1);
            const validatorInfo = await aggOracleCommitteeContract.validatorInfo(validator1.address);
            expect(validatorInfo.url).to.equal('https://new.url');
        });

        it('Should handle array reordering when removing a validator (swap and pop)', async () => {
            await aggOracleCommitteeContract
                .connect(owner)
                .updateValidatorsAndThreshold([], toValidatorInfo([validator3, validator4]), 2);

            // validators: [v1, v2, v3, v4] -> remove v1 -> [v4, v2, v3]
            await aggOracleCommitteeContract
                .connect(owner)
                .updateValidatorsAndThreshold([{ addr: validator1.address, index: 0 }], [], 2);

            expect(await aggOracleCommitteeContract.validators(0)).to.equal(validator4.address);
            expect(await aggOracleCommitteeContract.validators(1)).to.equal(validator2.address);
            expect(await aggOracleCommitteeContract.validators(2)).to.equal(validator3.address);
            expect(await aggOracleCommitteeContract.getValidatorIndex(validator4.address)).to.equal(0);
        });

        it('Should fail to remove all validators', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold(
                    [
                        { addr: validator2.address, index: 1 },
                        { addr: validator1.address, index: 0 },
                    ],
                    [],
                    0,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeZero');

            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold(
                    [
                        { addr: validator2.address, index: 1 },
                        { addr: validator1.address, index: 0 },
                    ],
                    [],
                    1,
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeGreaterThanValidators');
        });

        it('Should fail to update threshold to zero', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold([], [], 0),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeZero');
        });

        it('Should fail to update threshold above the number of validators', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold([], [], 3),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeGreaterThanValidators');
        });

        it('Should fail to remove a validator if the threshold is not lowered', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([{ addr: validator1.address, index: 0 }], [], 2),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ThresholdCannotBeGreaterThanValidators');
        });

        it('Should allow up to MAX_VALIDATORS validators and fail above it', async () => {
            const maxValidators = Number(await aggOracleCommitteeContract.MAX_VALIDATORS());
            // 2 validators already exist
            const newValidators = Array.from({ length: maxValidators - 2 }, () => ({
                addr: ethers.Wallet.createRandom().address,
                url: '',
            }));

            await aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold([], newValidators, 2);
            expect(await aggOracleCommitteeContract.getValidatorsCount()).to.equal(maxValidators);

            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .updateValidatorsAndThreshold([], toValidatorInfo([validator3]), 2),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'TooManyValidators');
        });
    });

    describe('Proposer Management', () => {
        beforeEach(async () => {
            await initializeDefault([validator1, validator2], 2);
        });

        it('Should update the proposer', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).updateAggOracleProposer(notOwner.address))
                .to.emit(aggOracleCommitteeContract, 'UpdateAggOracleProposer')
                .withArgs(notOwner.address);

            expect(await aggOracleCommitteeContract.proposer()).to.equal(notOwner.address);
        });

        it('Should fail to update the proposer to zero address', async () => {
            await expect(
                aggOracleCommitteeContract.connect(owner).updateAggOracleProposer(ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ProposerCannotBeZero');
        });

        it('Should fail to update the proposer if not owner', async () => {
            await expect(
                aggOracleCommitteeContract.connect(proposer).updateAggOracleProposer(notOwner.address),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });

        it('Should not allow the old proposer to inject after being replaced', async () => {
            await setCommitteeAsGERUpdater();
            await aggOracleCommitteeContract.connect(owner).updateAggOracleProposer(notOwner.address);

            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OnlyAggOracleProposerCanCall');

            await expect(aggOracleCommitteeContract.connect(notOwner).injectGER(globalExitRoot, signatures))
                .to.emit(aggOracleCommitteeContract, 'GERInjected')
                .withArgs(globalExitRoot);
        });
    });

    describe('Ownership', () => {
        beforeEach(async () => {
            await initializeDefault([validator1, validator2], 2);
        });

        it('Should fail to renounce ownership', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).renounceOwnership()).to.be.revertedWithCustomError(
                aggOracleCommitteeContract,
                'RenounceOwnershipDisabled',
            );
            expect(await aggOracleCommitteeContract.owner()).to.equal(owner.address);
        });

        it('Should transfer ownership in two steps', async () => {
            // step 1: the owner proposes the new owner, ownership does not change yet
            await expect(aggOracleCommitteeContract.connect(owner).transferOwnership(notOwner.address))
                .to.emit(aggOracleCommitteeContract, 'OwnershipTransferStarted')
                .withArgs(owner.address, notOwner.address);

            expect(await aggOracleCommitteeContract.owner()).to.equal(owner.address);
            expect(await aggOracleCommitteeContract.pendingOwner()).to.equal(notOwner.address);

            // step 2: the pending owner accepts
            await expect(aggOracleCommitteeContract.connect(notOwner).acceptOwnership())
                .to.emit(aggOracleCommitteeContract, 'OwnershipTransferred')
                .withArgs(owner.address, notOwner.address);

            expect(await aggOracleCommitteeContract.owner()).to.equal(notOwner.address);
            expect(await aggOracleCommitteeContract.pendingOwner()).to.equal(ethers.ZeroAddress);
        });

        it('Should fail to accept ownership if not the pending owner', async () => {
            await aggOracleCommitteeContract.connect(owner).transferOwnership(notOwner.address);

            await expect(aggOracleCommitteeContract.connect(proposer).acceptOwnership())
                .to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount')
                .withArgs(proposer.address);

            expect(await aggOracleCommitteeContract.owner()).to.equal(owner.address);
        });

        it('Should allow the owner to overwrite or cancel a pending ownership transfer', async () => {
            // overwrite the pending owner
            await aggOracleCommitteeContract.connect(owner).transferOwnership(notOwner.address);
            await aggOracleCommitteeContract.connect(owner).transferOwnership(proposer.address);
            expect(await aggOracleCommitteeContract.pendingOwner()).to.equal(proposer.address);

            await expect(aggOracleCommitteeContract.connect(notOwner).acceptOwnership()).to.be.revertedWithCustomError(
                aggOracleCommitteeContract,
                'OwnableUnauthorizedAccount',
            );

            // cancel the pending transfer
            await aggOracleCommitteeContract.connect(owner).transferOwnership(ethers.ZeroAddress);
            expect(await aggOracleCommitteeContract.pendingOwner()).to.equal(ethers.ZeroAddress);

            await expect(aggOracleCommitteeContract.connect(proposer).acceptOwnership()).to.be.revertedWithCustomError(
                aggOracleCommitteeContract,
                'OwnableUnauthorizedAccount',
            );
        });

        it('Should fail to start an ownership transfer if not owner', async () => {
            await expect(
                aggOracleCommitteeContract.connect(notOwner).transferOwnership(notOwner.address),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });
    });

    describe('Global Exit Root Injection', () => {
        beforeEach(async () => {
            await initializeDefault([validator1, validator2, validator3], 2);
            await setCommitteeAsGERUpdater();
        });

        it('Should inject a global exit root', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            await expect(aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures))
                .to.emit(aggOracleCommitteeContract, 'GERInjected')
                .withArgs(globalExitRoot)
                .to.emit(globalExitRootManagerContract, 'UpdateHashChainValue');

            expect(await globalExitRootManagerContract.globalExitRootMap(globalExitRoot)).to.not.equal(0);
        });

        it('Should inject several global exit roots with different subsets of validators', async () => {
            const subsets = [
                [validator1, validator2],
                [validator2, validator3],
                [validator1, validator3],
            ];

            for (let i = 0; i < subsets.length; i++) {
                const subset = subsets[i];
                const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
                await expect(
                    aggOracleCommitteeContract
                        .connect(proposer)
                        .injectGER(globalExitRoot, signGERSorted(globalExitRoot, subset)),
                )
                    .to.emit(aggOracleCommitteeContract, 'GERInjected')
                    .withArgs(globalExitRoot);
            }
        });

        it('Should fail to inject if not proposer', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            await expect(
                aggOracleCommitteeContract.connect(owner).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OnlyAggOracleProposerCanCall');
        });

        it('Should fail to inject zero global exit root', async () => {
            const signatures = signGERSorted(ethers.ZeroHash, [validator1, validator2]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(ethers.ZeroHash, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERCannotBeZero');
        });

        it('Should fail to inject with fewer signatures than the threshold', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidSignaturesLength');
        });

        it('Should fail to inject with more signatures than the threshold', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2, validator3]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidSignaturesLength');
        });

        it('Should fail to inject with trailing bytes in the signatures', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = ethers.concat([signGERSorted(globalExitRoot, [validator1, validator2]), '0x00']);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidSignaturesLength');
        });

        it('Should fail to inject with empty signatures', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, '0x'),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidSignaturesLength');
        });

        it('Should fail to inject with a signature from a non-validator', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, notValidator]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorDoesNotExist');
        });

        it('Should fail to inject with signatures not ordered by address', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const sorted = sortByAddress([validator1, validator2]);
            const signatures = signGER(globalExitRoot, [sorted[1], sorted[0]]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorsNotOrdered');
        });

        it('Should fail to inject with a duplicated signature', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGER(globalExitRoot, [validator1, validator1]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorsNotOrdered');
        });

        it('Should fail to inject with signatures over a different GER', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const otherGlobalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(otherGlobalExitRoot, [validator1, validator2]);

            // recovered signers are random addresses, so they are not validators
            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorDoesNotExist');
        });

        it('Should fail to inject with an invalid signature', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const validSignature = signGER(globalExitRoot, [sortByAddress([validator1, validator2])[0]]);
            // r = 0 makes ecrecover return the zero address
            const invalidSignature = ethers.concat([ethers.ZeroHash, ethers.ZeroHash, '0x1b']);

            await expect(
                aggOracleCommitteeContract
                    .connect(proposer)
                    .injectGER(globalExitRoot, ethers.concat([validSignature, invalidSignature])),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ECDSAInvalidSignature');
        });

        it('Should fail to inject with a malleable (high-s) signature', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const sorted = sortByAddress([validator1, validator2]);
            const sig = sorted[1].signingKey.sign(buildGERMessage(globalExitRoot));

            // build the equivalent signature (r, n - s, flipped v)
            const highS = ethers.toBeHex(SECP256K1_N - BigInt(sig.s), 32);
            const flippedV = sig.v === 27 ? '0x1c' : '0x1b';
            const malleableSignature = ethers.concat([sig.r, highS, flippedV]);

            const signatures = ethers.concat([signGER(globalExitRoot, [sorted[0]]), malleableSignature]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ECDSAInvalidSignatureS');
        });

        it('Should fail to inject with signatures from a removed validator', async () => {
            const index = await aggOracleCommitteeContract.getValidatorIndex(validator1.address);
            await aggOracleCommitteeContract
                .connect(owner)
                .updateValidatorsAndThreshold([{ addr: validator1.address, index }], [], 2);

            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorDoesNotExist');
        });

        it('Should fail to inject an already injected global exit root', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            expect(await aggOracleCommitteeContract.injectedGERs(globalExitRoot)).to.equal(false);
            await aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures);
            expect(await aggOracleCommitteeContract.injectedGERs(globalExitRoot)).to.equal(true);

            await expect(
                aggOracleCommitteeContract.verifyGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERAlreadyInjected');

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERAlreadyInjected');
        });

        it('Should fail to re-inject a global exit root removed from the AgglayerGERL2 (replay)', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            await aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures);

            // the globalExitRootRemover (deployer) removes the GER
            await globalExitRootManagerContract.removeGlobalExitRoots([globalExitRoot]);
            expect(await globalExitRootManagerContract.globalExitRootMap(globalExitRoot)).to.equal(0);

            // the old signatures can not be replayed
            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERAlreadyInjected');

            // fresh signatures from the validators can not re-inject it either
            const freshSignatures = signGERSorted(globalExitRoot, [validator2, validator3]);
            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, freshSignatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERAlreadyInjected');
        });

        it('Should only mark a global exit root already set by another updater, and block its replay after removal', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            // move the updater role to the deployer, insert the GER and give the role back to the committee
            await aggOracleCommitteeContract.connect(owner).transferGlobalExitRootUpdater(deployer.address);
            await globalExitRootManagerContract.acceptGlobalExitRootUpdater();
            await globalExitRootManagerContract.insertGlobalExitRoot(globalExitRoot);
            await setCommitteeAsGERUpdater();
            const insertedTimestamp = await globalExitRootManagerContract.globalExitRootMap(globalExitRoot);

            // the GER is marked as injected without being inserted again
            await expect(aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures))
                .to.emit(aggOracleCommitteeContract, 'GERMarkedAsInjected')
                .withArgs(globalExitRoot)
                .to.not.emit(aggOracleCommitteeContract, 'GERInjected')
                .to.not.emit(globalExitRootManagerContract, 'UpdateHashChainValue');
            expect(await aggOracleCommitteeContract.injectedGERs(globalExitRoot)).to.equal(true);
            expect(await globalExitRootManagerContract.globalExitRootMap(globalExitRoot)).to.equal(insertedTimestamp);

            // after the remover deletes it, the old signatures can not be replayed
            await globalExitRootManagerContract.removeGlobalExitRoots([globalExitRoot]);
            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERAlreadyInjected');
        });

        it('Should fail to inject if the committee is not the globalExitRootUpdater', async () => {
            await aggOracleCommitteeContract
                .connect(owner)
                .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address);
            await globalExitRootManagerContract.connect(newGlobalExitRootUpdater).acceptGlobalExitRootUpdater();

            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator2]);

            await expect(
                aggOracleCommitteeContract.connect(proposer).injectGER(globalExitRoot, signatures),
            ).to.be.revertedWithCustomError(globalExitRootManagerContract, 'OnlyGlobalExitRootUpdater');
        });

        it('Should respect a threshold change for subsequent injections', async () => {
            await aggOracleCommitteeContract.connect(owner).updateValidatorsAndThreshold([], [], 3);

            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));

            await expect(
                aggOracleCommitteeContract
                    .connect(proposer)
                    .injectGER(globalExitRoot, signGERSorted(globalExitRoot, [validator1, validator2])),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidSignaturesLength');

            await expect(
                aggOracleCommitteeContract
                    .connect(proposer)
                    .injectGER(globalExitRoot, signGERSorted(globalExitRoot, [validator1, validator2, validator3])),
            )
                .to.emit(aggOracleCommitteeContract, 'GERInjected')
                .withArgs(globalExitRoot);
        });
    });

    describe('Global Exit Root Verification', () => {
        beforeEach(async () => {
            await initializeDefault([validator1, validator2, validator3], 2);
        });

        it('Should verify a valid global exit root', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));
            const signatures = signGERSorted(globalExitRoot, [validator1, validator3]);

            expect(await aggOracleCommitteeContract.verifyGER(globalExitRoot, signatures)).to.equal(true);
        });

        it('Should revert verifying an invalid global exit root', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));

            await expect(
                aggOracleCommitteeContract.verifyGER(
                    ethers.ZeroHash,
                    signGERSorted(ethers.ZeroHash, [validator1, validator2]),
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'GERCannotBeZero');

            await expect(
                aggOracleCommitteeContract.verifyGER(globalExitRoot, signGERSorted(globalExitRoot, [validator1])),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidSignaturesLength');

            await expect(
                aggOracleCommitteeContract.verifyGER(
                    globalExitRoot,
                    signGERSorted(globalExitRoot, [validator1, notValidator]),
                ),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorDoesNotExist');
        });

        it('Should not require the committee to be the globalExitRootUpdater', async () => {
            const globalExitRoot = ethers.hexlify(ethers.randomBytes(32));

            expect(
                await aggOracleCommitteeContract.verifyGER(
                    globalExitRoot,
                    signGERSorted(globalExitRoot, [validator1, validator2]),
                ),
            ).to.equal(true);
        });
    });

    describe('Global Exit Root Updater Role Transfer', () => {
        beforeEach(async () => {
            await initializeDefault([validator1, validator2], 2);
        });

        it('Should transfer globalExitRootUpdater role', async () => {
            // First transfer to aggOracleCommitteeV2
            await setCommitteeAsGERUpdater();

            expect(await globalExitRootManagerContract.globalExitRootUpdater()).to.equal(
                aggOracleCommitteeContract.target,
            );

            // Now transfer from aggOracleCommitteeV2 to another address
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address),
            )
                .to.emit(globalExitRootManagerContract, 'TransferGlobalExitRootUpdater')
                .withArgs(aggOracleCommitteeContract.target, newGlobalExitRootUpdater.address);

            expect(await globalExitRootManagerContract.pendingGlobalExitRootUpdater()).to.equal(
                newGlobalExitRootUpdater.address,
            );
        });

        it('Should fail to transfer if not owner', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(notOwner)
                    .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });

        it('Should accept globalExitRootUpdater role', async () => {
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);

            await expect(aggOracleCommitteeContract.connect(owner).acceptGlobalExitRootUpdater())
                .to.emit(globalExitRootManagerContract, 'AcceptGlobalExitRootUpdater')
                .withArgs(deployer.address, aggOracleCommitteeContract.target);

            expect(await globalExitRootManagerContract.globalExitRootUpdater()).to.equal(
                aggOracleCommitteeContract.target,
            );
        });

        it('Should fail to accept if not owner', async () => {
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);

            await expect(
                aggOracleCommitteeContract.connect(notOwner).acceptGlobalExitRootUpdater(),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });
    });

    describe('View Functions', () => {
        beforeEach(async () => {
            await aggOracleCommitteeContract.initialize(
                owner.address,
                proposer.address,
                [
                    { addr: validator1.address, url: 'https://v1.url' },
                    { addr: validator2.address, url: '' },
                    { addr: validator3.address, url: 'https://v3.url' },
                ],
                2,
            );
        });

        it('Should get validator index', async () => {
            expect(await aggOracleCommitteeContract.getValidatorIndex(validator1.address)).to.equal(0);
            expect(await aggOracleCommitteeContract.getValidatorIndex(validator2.address)).to.equal(1);
            expect(await aggOracleCommitteeContract.getValidatorIndex(validator3.address)).to.equal(2);
        });

        it('Should revert when getting index of non-validator', async () => {
            await expect(
                aggOracleCommitteeContract.getValidatorIndex(notValidator.address),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'ValidatorNotFound');
        });

        it('Should get all validators info', async () => {
            const validatorsInfo = await aggOracleCommitteeContract.getValidatorsInfo();

            expect(validatorsInfo.length).to.equal(3);
            expect(validatorsInfo[0].addr).to.equal(validator1.address);
            expect(validatorsInfo[0].url).to.equal('https://v1.url');
            expect(validatorsInfo[1].addr).to.equal(validator2.address);
            expect(validatorsInfo[1].url).to.equal('');
            expect(validatorsInfo[2].addr).to.equal(validator3.address);
            expect(validatorsInfo[2].url).to.equal('https://v3.url');
        });

        it('Should get validators count', async () => {
            expect(await aggOracleCommitteeContract.getValidatorsCount()).to.equal(3);
        });

        it('Should get validator by index', async () => {
            expect(await aggOracleCommitteeContract.validators(0)).to.equal(validator1.address);
            expect(await aggOracleCommitteeContract.validators(1)).to.equal(validator2.address);
            expect(await aggOracleCommitteeContract.validators(2)).to.equal(validator3.address);
        });

        it('Should check if an address is a validator', async () => {
            expect(await aggOracleCommitteeContract.isValidator(validator1.address)).to.equal(true);
            expect(await aggOracleCommitteeContract.isValidator(notValidator.address)).to.equal(false);
        });

        it('Should get validator info from the public mapping', async () => {
            const validatorInfo = await aggOracleCommitteeContract.validatorInfo(validator1.address);
            expect(validatorInfo.isValidator).to.equal(true);
            expect(validatorInfo.url).to.equal('https://v1.url');

            const notValidatorInfo = await aggOracleCommitteeContract.validatorInfo(notValidator.address);
            expect(notValidatorInfo.isValidator).to.equal(false);
            expect(notValidatorInfo.url).to.equal('');
        });
    });

    describe('Upgradeability', () => {
        it('Should upgrade the proxy and keep the storage', async () => {
            await initializeDefault([validator1, validator2, validator3], 2);

            const AggOracleCommitteeV2Factory = await ethers.getContractFactory('AggOracleCommitteeV2');
            const upgraded = (await upgrades.upgradeProxy(
                aggOracleCommitteeContract.target,
                AggOracleCommitteeV2Factory,
                {
                    constructorArgs: [globalExitRootManagerContract.target],
                    unsafeAllow: ['constructor'],
                },
            )) as unknown as AggOracleCommitteeV2;

            expect(await upgraded.owner()).to.equal(owner.address);
            expect(await upgraded.proposer()).to.equal(proposer.address);
            expect(await upgraded.threshold()).to.equal(2);
            expect(await upgraded.getValidatorsCount()).to.equal(3);
            expect(await upgraded.isValidator(validator2.address)).to.equal(true);
        });
    });
});
