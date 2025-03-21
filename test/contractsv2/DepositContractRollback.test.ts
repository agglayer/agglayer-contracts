/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DepositContractRollback } from "../../typechain-types";
import { MTBridge } from "@0xpolygonhermez/zkevm-commonjs";

describe("DepositContractRollback", () => {
    let deployer: any;
    let rollbackManager: any;
    let depositContract: DepositContractRollback;

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, rollbackManager] = await ethers.getSigners();

        // deploy aggchain
        // create aggchainFEP implementation
        const depositContractRollbackFactory = await ethers.getContractFactory("DepositContractRollback");
        depositContract = await upgrades.deployProxy(depositContractRollbackFactory, [], {
            initializer: false,
            unsafeAllow: ["missing-initializer-call"],
        });

        await depositContract.waitForDeployment();
    });

    it("add leafs merke tree and rollback", async () => {
        // intialize the contract
        await depositContract.initialize(rollbackManager);

        const height = 32;
        const merkleTree = new MTBridge(height);

        const leafValue = ethers.encodeBytes32String('123');
        const leafValue2 = ethers.encodeBytes32String('456');

        // add first leaf
        merkleTree.add(leafValue); // depositCount = 1
        await depositContract.addLeaf(leafValue);
        const firstRoot = merkleTree.getRoot();
        const firstRootSC = await depositContract.getRoot();
        expect(firstRoot).to.be.equal(firstRootSC);

        // add second leaf
        merkleTree.add(leafValue2); // depositCount = 2
        await depositContract.addLeaf(leafValue2);
        const secondRoot = merkleTree.getRoot();
        const secondRootSC = await depositContract.getRoot();
        expect(secondRoot).to.be.equal(secondRootSC);

        // rollback
        merkleTree.rollbackTree(1);
        const frontierOne = merkleTree.frontier;
        await depositContract.connect(rollbackManager).rollbackTree(1, frontierOne);
        const rootRollbackOne = await depositContract.getRoot();

        expect(rootRollbackOne).to.be.equal(firstRoot);
        expect(merkleTree.getRoot()).to.be.equal(firstRoot);
        expect(merkleTree.getRootFromFrontier()).to.be.equal(firstRoot);
        expect(merkleTree.depositCount).to.be.equal(1);

        merkleTree.add(leafValue2);
        await depositContract.connect(rollbackManager).addLeaf(leafValue2);
        const secondRootSCAfterRollback = await depositContract.getRoot();

        expect(secondRootSCAfterRollback).to.be.equal(secondRoot);
        expect(merkleTree.getRoot()).to.be.equal(secondRoot);
        expect(merkleTree.getRootFromFrontier()).to.be.equal(secondRoot);
        expect(merkleTree.depositCount).to.be.equal(2);
    });

    it("Rollback 100 leaves", async () => {
        // intialize the contract
        await depositContract.initialize(rollbackManager);

        const height = 32;
        const merkleTree = new MTBridge(height);

        // add leaves (snaphot at middle)
        const numInsertions = 100;
        const snapshot = Math.floor(numInsertions / 2);
        let snapshotRoot;
        let snapshotDepositCount;

        const leaves = [];
        for (let i = 0; i < numInsertions; i++) {
            const leafValue = ethers.encodeBytes32String(i.toString());
            leaves.push(leafValue);
            merkleTree.add(leafValue);
            await depositContract.addLeaf(leafValue);

            if (i === snapshot) {
                snapshotDepositCount = merkleTree.depositCount;
                snapshotRoot = merkleTree.getRoot();
                const rootFromFrontier = merkleTree.getRootFromFrontier();
                const rootSC = await depositContract.getRoot();

                expect(rootFromFrontier).to.be.equal(rootSC);
                expect(rootFromFrontier).to.be.equal(snapshotRoot);
            }
        }

        // check root
        const rootSC = await depositContract.getRoot();
        const root = merkleTree.getRoot();
        const rootFromFrontier = merkleTree.getRootFromFrontier();

        expect(rootSC).to.be.equal(root);
        expect(rootFromFrontier).to.be.equal(root);

        // check depositCount
        expect(merkleTree.depositCount).to.be.equal(numInsertions);
        expect(merkleTree.historicFrontiers.length - 1).to.be.equal(numInsertions);

        // rollback to snapshot
        // take frontier from historicFrontiers
        const frontierSnaphot = merkleTree.historicFrontiers[snapshotDepositCount];
        merkleTree.rollbackTree(snapshotDepositCount);
        await depositContract.connect(rollbackManager).rollbackTree(snapshotDepositCount, frontierSnaphot);

        expect(merkleTree.frontier).to.be.equal(frontierSnaphot);

        // check again root
        const rootSCAfterRollback = await depositContract.getRoot();
        const rootAfterRollback = merkleTree.getRoot();
        const rootAfterRollbackFromFrontier = merkleTree.getRootFromFrontier();
        expect(rootAfterRollback).to.be.equal(snapshotRoot);
        expect(rootAfterRollbackFromFrontier).to.be.equal(snapshotRoot);
        expect(rootSCAfterRollback).to.be.equal(snapshotRoot);
    });
});
