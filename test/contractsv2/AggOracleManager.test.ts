/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AggOracleManager, GlobalExitRootManagerL2SovereignChain } from '../../typechain-types';

describe('AggOracleManager tests', () => {
    upgrades.silenceWarnings();

    let aggOracleManagerContract: AggOracleManager;
    let globalExitRootManagerContract: GlobalExitRootManagerL2SovereignChain;

    let deployer: any;
    let owner: any;
    let oracle1: any;
    let oracle2: any;
    let oracle3: any;
    let oracle4: any;
    let notOracle: any;
    let bridge: any;
    let newGlobalExitRootUpdater: any;

    const INITIAL_PROPOSED_GER = ethers.solidityPacked(['uint256'], [1]);

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, owner, oracle1, oracle2, oracle3, oracle4, notOracle, bridge, newGlobalExitRootUpdater] =
            await ethers.getSigners();

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory(
            'GlobalExitRootManagerL2SovereignChain',
        );
        globalExitRootManagerContract = (await upgrades.deployProxy(
            GlobalExitRootManagerL2SovereignChainFactory,
            [deployer.address, deployer.address], // Initializer params
            {
                initializer: 'initialize', // initializer function name
                constructorArgs: [bridge.address], // Constructor arguments
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            },
        )) as unknown as GlobalExitRootManagerL2SovereignChain;

        // deploy AggOracleManager
        const AggOracleManagerFactory = await ethers.getContractFactory('AggOracleManager');
        aggOracleManagerContract = (await upgrades.deployProxy(AggOracleManagerFactory, [], {
            initializer: false,
            constructorArgs: [globalExitRootManagerContract.target],
            unsafeAllow: ['constructor'],
        })) as unknown as AggOracleManager;
    });

    it('should check deployment and initialization', async () => {
        // Check constants
        expect(await aggOracleManagerContract.INITIAL_PROPOSED_GER()).to.be.equal(INITIAL_PROPOSED_GER);
        expect(await aggOracleManagerContract.globalExitRootManagerL2Sovereign()).to.be.equal(
            globalExitRootManagerContract.target,
        );

        // Check initial state
        expect(await aggOracleManagerContract.owner()).to.be.equal(ethers.ZeroAddress);
        expect(await aggOracleManagerContract.quorum()).to.be.equal(0);
        expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(0);
    });

    it('should check initialize function with valid parameters', async () => {
        const quorum = 2;
        const oracleMembers = [oracle1.address, oracle2.address, oracle3.address];

        await expect(aggOracleManagerContract.initialize(owner.address, oracleMembers, quorum))
            .to.emit(aggOracleManagerContract, 'UpdateQuorum')
            .withArgs(quorum)
            .to.emit(aggOracleManagerContract, 'AddAggOracleMember')
            .withArgs(oracle1.address)
            .to.emit(aggOracleManagerContract, 'AddAggOracleMember')
            .withArgs(oracle2.address)
            .to.emit(aggOracleManagerContract, 'AddAggOracleMember')
            .withArgs(oracle3.address);

        // Check state after initialization
        expect(await aggOracleManagerContract.owner()).to.be.equal(owner.address);
        expect(await aggOracleManagerContract.quorum()).to.be.equal(quorum);
        expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(3);

        // Check oracle members
        const allMembers = await aggOracleManagerContract.getAllAggOracleMembers();
        expect(allMembers.length).to.be.equal(3);
        expect(allMembers).to.deep.equal(oracleMembers);

        // Check individual oracle members
        expect(await aggOracleManagerContract.addressToLastProposedGER(oracle1.address)).to.be.equal(
            INITIAL_PROPOSED_GER,
        );
        expect(await aggOracleManagerContract.addressToLastProposedGER(oracle2.address)).to.be.equal(
            INITIAL_PROPOSED_GER,
        );
        expect(await aggOracleManagerContract.addressToLastProposedGER(oracle3.address)).to.be.equal(
            INITIAL_PROPOSED_GER,
        );
    });

    it('should revert initialize with invalid parameters', async () => {
        // Test with quorum = 0
        await expect(
            aggOracleManagerContract.initialize(owner.address, [oracle1.address], 0),
        ).to.be.revertedWithCustomError(aggOracleManagerContract, 'QuorumCannotBeZero');

        // Test duplicate oracle members
        await expect(
            aggOracleManagerContract.initialize(owner.address, [oracle1.address, oracle1.address], 2),
        ).to.be.revertedWithCustomError(aggOracleManagerContract, 'AlreadyOracleMember');
    });

    it('should revert when trying to initialize twice', async () => {
        await aggOracleManagerContract.initialize(owner.address, [oracle1.address, oracle2.address], 2);

        await expect(
            aggOracleManagerContract.initialize(owner.address, [oracle3.address], 1),
        ).to.be.revertedWithCustomError(aggOracleManagerContract, 'InvalidInitialization');
    });

    describe('After initialization', () => {
        beforeEach('Initialize contract', async () => {
            await aggOracleManagerContract.initialize(
                owner.address,
                [oracle1.address, oracle2.address, oracle3.address],
                2, // quorum
            );

            // Transfer globalExitRootUpdater role to AggOracleManager
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleManagerContract.target);
            await aggOracleManagerContract.connect(owner).acceptGlobalExitRootUpdater();
        });

        describe('proposeGlobalExitRoot', () => {
            it('should propose a global exit root successfully', async () => {
                const proposedGER = ethers.hexlify(ethers.randomBytes(32));

                await expect(aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER))
                    .to.emit(aggOracleManagerContract, 'ProposedGlobalExitRoot')
                    .withArgs(proposedGER, oracle1.address);

                // Check the report
                const report = await aggOracleManagerContract.proposedGERToReport(proposedGER);
                expect(report.votes).to.be.equal(1);
                expect(report.timestamp).to.be.greaterThan(0);

                // Check oracle member's last proposed GER
                expect(await aggOracleManagerContract.addressToLastProposedGER(oracle1.address)).to.be.equal(
                    proposedGER,
                );
            });

            it('should revert with NotOracleMember', async () => {
                const proposedGER = ethers.hexlify(ethers.randomBytes(32));

                await expect(
                    aggOracleManagerContract.connect(notOracle).proposeGlobalExitRoot(proposedGER),
                ).to.be.revertedWithCustomError(aggOracleManagerContract, 'NotOracleMember');
            });

            it('should revert with InvalidProposedGER for zero or initial value', async () => {
                await expect(
                    aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(ethers.ZeroHash),
                ).to.be.revertedWithCustomError(aggOracleManagerContract, 'InvalidProposedGER');

                await expect(
                    aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(INITIAL_PROPOSED_GER),
                ).to.be.revertedWithCustomError(aggOracleManagerContract, 'InvalidProposedGER');
            });

            it('should consolidate when quorum is reached', async () => {
                const proposedGER = ethers.hexlify(ethers.randomBytes(32));

                // First vote
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

                // Second vote - should consolidate
                await expect(aggOracleManagerContract.connect(oracle2).proposeGlobalExitRoot(proposedGER))
                    .to.emit(aggOracleManagerContract, 'ProposedGlobalExitRoot')
                    .withArgs(proposedGER, oracle2.address)
                    .to.emit(aggOracleManagerContract, 'ConsolidatedGlobalExitRoot')
                    .withArgs(proposedGER)
                    .to.emit(globalExitRootManagerContract, 'UpdateHashChainValue')
                    .withArgs(
                        proposedGER,
                        ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [ethers.ZeroHash, proposedGER]),
                    );

                // Check that the report was deleted after consolidation
                const report = await aggOracleManagerContract.proposedGERToReport(proposedGER);
                expect(report.votes).to.be.equal(0);
                expect(report.timestamp).to.be.equal(0);
            });

            it('should handle vote changes correctly', async () => {
                const proposedGER1 = ethers.hexlify(ethers.randomBytes(32));
                const proposedGER2 = ethers.hexlify(ethers.randomBytes(32));

                // Oracle1 votes for GER1
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);

                let report1 = await aggOracleManagerContract.proposedGERToReport(proposedGER1);
                expect(report1.votes).to.be.equal(1);

                // Oracle2 votes for GER1
                await aggOracleManagerContract.connect(oracle2).proposeGlobalExitRoot(proposedGER1);

                // GER1 should be consolidated and deleted
                report1 = await aggOracleManagerContract.proposedGERToReport(proposedGER1);
                expect(report1.votes).to.be.equal(0);

                // Oracle1 changes vote to GER2
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER2);

                const report2 = await aggOracleManagerContract.proposedGERToReport(proposedGER2);
                expect(report2.votes).to.be.equal(1);
            });

            it('should handle multiple proposals and vote switching', async () => {
                const proposedGER1 = ethers.hexlify(ethers.randomBytes(32));
                const proposedGER2 = ethers.hexlify(ethers.randomBytes(32));

                // Oracle1 and Oracle2 vote for GER1
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);

                let report1 = await aggOracleManagerContract.proposedGERToReport(proposedGER1);
                expect(report1.votes).to.be.equal(1);

                // Oracle1 switches to GER2 before consolidation
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER2);

                // Check that vote was subtracted from GER1
                report1 = await aggOracleManagerContract.proposedGERToReport(proposedGER1);
                expect(report1.votes).to.be.equal(0);

                const report2 = await aggOracleManagerContract.proposedGERToReport(proposedGER2);
                expect(report2.votes).to.be.equal(1);
            });

            it('should not subtract votes from already consolidated reports', async () => {
                const proposedGER1 = ethers.hexlify(ethers.randomBytes(32));
                const proposedGER2 = ethers.hexlify(ethers.randomBytes(32));

                // Consolidate GER1
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);
                await aggOracleManagerContract.connect(oracle2).proposeGlobalExitRoot(proposedGER1);

                // Oracle1 proposes GER2 (their last vote was on consolidated GER1)
                await expect(aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER2))
                    .to.emit(aggOracleManagerContract, 'ProposedGlobalExitRoot')
                    .withArgs(proposedGER2, oracle1.address);

                const report2 = await aggOracleManagerContract.proposedGERToReport(proposedGER2);
                expect(report2.votes).to.be.equal(1);
            });
        });

        describe('addOracleMember', () => {
            it('should add a new oracle member', async () => {
                await expect(aggOracleManagerContract.connect(owner).addOracleMember(oracle4.address))
                    .to.emit(aggOracleManagerContract, 'AddAggOracleMember')
                    .withArgs(oracle4.address);

                expect(await aggOracleManagerContract.addressToLastProposedGER(oracle4.address)).to.be.equal(
                    INITIAL_PROPOSED_GER,
                );
                expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(4);

                const allMembers = await aggOracleManagerContract.getAllAggOracleMembers();
                expect(allMembers[3]).to.be.equal(oracle4.address);
            });

            it('should revert when not owner', async () => {
                await expect(aggOracleManagerContract.connect(notOracle).addOracleMember(oracle4.address))
                    .to.be.revertedWithCustomError(aggOracleManagerContract, 'OwnableUnauthorizedAccount')
                    .withArgs(notOracle.address);
            });

            it('should revert when adding existing member', async () => {
                await expect(
                    aggOracleManagerContract.connect(owner).addOracleMember(oracle1.address),
                ).to.be.revertedWithCustomError(aggOracleManagerContract, 'AlreadyOracleMember');
            });
        });

        describe('removeOracleMember', () => {
            it('should remove an oracle member', async () => {
                // First get the index
                const index = await aggOracleManagerContract.getAggOracleMemberIndex(oracle2.address);

                await expect(aggOracleManagerContract.connect(owner).removeOracleMember(oracle2.address, index))
                    .to.emit(aggOracleManagerContract, 'RemoveAggOracleMember')
                    .withArgs(oracle2.address);

                expect(await aggOracleManagerContract.addressToLastProposedGER(oracle2.address)).to.be.equal(
                    ethers.ZeroHash,
                );
                expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(2);
            });

            it('should remove oracle member with active votes', async () => {
                const proposedGER = ethers.hexlify(ethers.randomBytes(32));

                // Oracle1 votes
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

                let report = await aggOracleManagerContract.proposedGERToReport(proposedGER);
                expect(report.votes).to.be.equal(1);

                // Remove oracle1
                const index = await aggOracleManagerContract.getAggOracleMemberIndex(oracle1.address);
                await aggOracleManagerContract.connect(owner).removeOracleMember(oracle1.address, index);

                // Check that vote was subtracted
                report = await aggOracleManagerContract.proposedGERToReport(proposedGER);
                expect(report.votes).to.be.equal(0);
            });

            it('should handle removing last member in array', async () => {
                // Get the last member
                const members = await aggOracleManagerContract.getAllAggOracleMembers();
                const lastMember = members[members.length - 1];
                const index = members.length - 1;

                await aggOracleManagerContract.connect(owner).removeOracleMember(lastMember, index);

                const newMembers = await aggOracleManagerContract.getAllAggOracleMembers();
                expect(newMembers.length).to.be.equal(members.length - 1);
            });

            it('should revert when not owner', async () => {
                await expect(aggOracleManagerContract.connect(notOracle).removeOracleMember(oracle1.address, 0))
                    .to.be.revertedWithCustomError(aggOracleManagerContract, 'OwnableUnauthorizedAccount')
                    .withArgs(notOracle.address);
            });

            it('should revert with WasNotOracleMember', async () => {
                await expect(
                    aggOracleManagerContract.connect(owner).removeOracleMember(notOracle.address, 0),
                ).to.be.revertedWithCustomError(aggOracleManagerContract, 'WasNotOracleMember');
            });

            it('should revert with OracleMemberIndexMismatch', async () => {
                await expect(
                    aggOracleManagerContract.connect(owner).removeOracleMember(oracle1.address, 1),
                ).to.be.revertedWithCustomError(aggOracleManagerContract, 'OracleMemberIndexMismatch');
            });

            it('should not revert when removing member whose vote was on consolidated report', async () => {
                const proposedGER = ethers.hexlify(ethers.randomBytes(32));

                // Consolidate a report
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);
                await aggOracleManagerContract.connect(oracle2).proposeGlobalExitRoot(proposedGER);

                // Remove oracle1 (who voted on the consolidated report)
                const index = await aggOracleManagerContract.getAggOracleMemberIndex(oracle1.address);
                await expect(aggOracleManagerContract.connect(owner).removeOracleMember(oracle1.address, index)).to.not
                    .be.reverted;
            });
        });

        describe('updateQuorum', () => {
            it('should update quorum', async () => {
                const newQuorum = 3;

                await expect(aggOracleManagerContract.connect(owner).updateQuorum(newQuorum))
                    .to.emit(aggOracleManagerContract, 'UpdateQuorum')
                    .withArgs(newQuorum);

                expect(await aggOracleManagerContract.quorum()).to.be.equal(newQuorum);
            });

            it('should revert when not owner', async () => {
                await expect(aggOracleManagerContract.connect(notOracle).updateQuorum(3))
                    .to.be.revertedWithCustomError(aggOracleManagerContract, 'OwnableUnauthorizedAccount')
                    .withArgs(notOracle.address);
            });

            it('should revert with QuorumCannotBe0', async () => {
                await expect(aggOracleManagerContract.connect(owner).updateQuorum(0)).to.be.revertedWithCustomError(
                    aggOracleManagerContract,
                    'QuorumCannotBeZero',
                );
            });
        });

        describe('transferGlobalExitRootUpdater', () => {
            it('should transfer global exit root updater', async () => {
                await expect(
                    aggOracleManagerContract
                        .connect(owner)
                        .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address),
                )
                    .to.emit(globalExitRootManagerContract, 'TransferGlobalExitRootUpdater')
                    .withArgs(aggOracleManagerContract.target, newGlobalExitRootUpdater.address);
            });

            it('should revert when not owner', async () => {
                await expect(
                    aggOracleManagerContract
                        .connect(notOracle)
                        .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address),
                )
                    .to.be.revertedWithCustomError(aggOracleManagerContract, 'OwnableUnauthorizedAccount')
                    .withArgs(notOracle.address);
            });
        });

        describe('acceptGlobalExitRootUpdater', () => {
            beforeEach('Transfer role', async () => {
                // First transfer the role back to owner from AggOracleManager
                await aggOracleManagerContract.connect(owner).transferGlobalExitRootUpdater(owner.address);
                await globalExitRootManagerContract.connect(owner).acceptGlobalExitRootUpdater();

                // Now transfer to AggOracleManager again
                await globalExitRootManagerContract
                    .connect(owner)
                    .transferGlobalExitRootUpdater(aggOracleManagerContract.target);
            });

            it('should accept global exit root updater', async () => {
                await expect(aggOracleManagerContract.connect(owner).acceptGlobalExitRootUpdater())
                    .to.emit(globalExitRootManagerContract, 'AcceptGlobalExitRootUpdater')
                    .withArgs(owner.address, aggOracleManagerContract.target);
            });

            it('should revert when not owner', async () => {
                await expect(aggOracleManagerContract.connect(notOracle).acceptGlobalExitRootUpdater())
                    .to.be.revertedWithCustomError(aggOracleManagerContract, 'OwnableUnauthorizedAccount')
                    .withArgs(notOracle.address);
            });
        });

        describe('View functions', () => {
            describe('getAggOracleMemberIndex', () => {
                it('should return correct index for oracle members', async () => {
                    expect(await aggOracleManagerContract.getAggOracleMemberIndex(oracle1.address)).to.be.equal(0);
                    expect(await aggOracleManagerContract.getAggOracleMemberIndex(oracle2.address)).to.be.equal(1);
                    expect(await aggOracleManagerContract.getAggOracleMemberIndex(oracle3.address)).to.be.equal(2);
                });

                it('should revert for non-member', async () => {
                    await expect(
                        aggOracleManagerContract.getAggOracleMemberIndex(notOracle.address),
                    ).to.be.revertedWithCustomError(aggOracleManagerContract, 'OracleMemberNotFound');
                });
            });

            describe('getAllAggOracleMembers', () => {
                it('should return all oracle members', async () => {
                    const members = await aggOracleManagerContract.getAllAggOracleMembers();
                    expect(members.length).to.be.equal(3);
                    expect(members[0]).to.be.equal(oracle1.address);
                    expect(members[1]).to.be.equal(oracle2.address);
                    expect(members[2]).to.be.equal(oracle3.address);
                });
            });

            describe('getAggOracleMembersCount', () => {
                it('should return correct count', async () => {
                    expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(3);

                    // Add a member
                    await aggOracleManagerContract.connect(owner).addOracleMember(oracle4.address);
                    expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(4);

                    // Remove a member
                    const index = await aggOracleManagerContract.getAggOracleMemberIndex(oracle4.address);
                    await aggOracleManagerContract.connect(owner).removeOracleMember(oracle4.address, index);
                    expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(3);
                });
            });
        });

        describe('Complex scenarios', () => {
            it('should handle quorum of 1', async () => {
                // Update quorum to 1
                await aggOracleManagerContract.connect(owner).updateQuorum(1);

                const proposedGER = ethers.hexlify(ethers.randomBytes(32));

                // Single vote should consolidate
                await expect(aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER))
                    .to.emit(aggOracleManagerContract, 'ConsolidatedGlobalExitRoot')
                    .withArgs(proposedGER);
            });

            it('should handle adding and removing multiple members', async () => {
                // Add oracle4
                await aggOracleManagerContract.connect(owner).addOracleMember(oracle4.address);
                expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(4);

                // Remove oracle2 (middle of array)
                let index = await aggOracleManagerContract.getAggOracleMemberIndex(oracle2.address);
                await aggOracleManagerContract.connect(owner).removeOracleMember(oracle2.address, index);

                // Check that oracle4 was moved to oracle2's position
                const members = await aggOracleManagerContract.getAllAggOracleMembers();
                expect(members[1]).to.be.equal(oracle4.address);
                expect(members.length).to.be.equal(3);

                // Remove oracle1 (beginning of array)
                index = await aggOracleManagerContract.getAggOracleMemberIndex(oracle1.address);
                await aggOracleManagerContract.connect(owner).removeOracleMember(oracle1.address, index);
                expect(await aggOracleManagerContract.getAggOracleMembersCount()).to.be.equal(2);
            });

            it('should handle edge case with many votes and changes', async () => {
                const proposedGER1 = ethers.hexlify(ethers.randomBytes(32));
                const proposedGER2 = ethers.hexlify(ethers.randomBytes(32));
                const proposedGER3 = ethers.hexlify(ethers.randomBytes(32));

                // Add oracle4 for more complex voting
                await aggOracleManagerContract.connect(owner).addOracleMember(oracle4.address);

                // Update quorum to 3
                await aggOracleManagerContract.connect(owner).updateQuorum(3);

                // Everyone votes for different GERs
                await aggOracleManagerContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);
                await aggOracleManagerContract.connect(oracle2).proposeGlobalExitRoot(proposedGER2);
                await aggOracleManagerContract.connect(oracle3).proposeGlobalExitRoot(proposedGER3);
                await aggOracleManagerContract.connect(oracle4).proposeGlobalExitRoot(proposedGER1);

                // Check votes
                expect((await aggOracleManagerContract.proposedGERToReport(proposedGER1)).votes).to.be.equal(2);
                expect((await aggOracleManagerContract.proposedGERToReport(proposedGER2)).votes).to.be.equal(1);
                expect((await aggOracleManagerContract.proposedGERToReport(proposedGER3)).votes).to.be.equal(1);

                // Oracle2 switches to GER1 - should consolidate
                await expect(aggOracleManagerContract.connect(oracle2).proposeGlobalExitRoot(proposedGER1))
                    .to.emit(aggOracleManagerContract, 'ConsolidatedGlobalExitRoot')
                    .withArgs(proposedGER1);

                // Check that GER2 lost a vote
                expect((await aggOracleManagerContract.proposedGERToReport(proposedGER2)).votes).to.be.equal(0);
            });
        });
    });
});
