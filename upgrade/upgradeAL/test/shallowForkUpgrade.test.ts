/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { ethers } from "hardhat";
import { PolygonRollupManager, PolygonZkEVMTimelock, PolygonRollupManagerPessimistic } from "../../typechain-types";

import { time, reset, setBalance, setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { checkParams } from "../../../src/utils";

const upgradeParams = require("../upgrade_parameters.json");
const upgradeOutput = require("../upgrade_output.json");

describe('Should shallow fork network, execute upgrade and validate Upgrade', () => {
    it('Should shallow fork network, execute upgrade and validate Upgrade', async () => {
        const mandatoryParameters = ["network", "rollupManagerAddress"];
        checkParams(upgradeParams, mandatoryParameters);
        if (!["mainnet", "sepolia"].includes(upgradeParams.network)) {
            throw new Error("Invalid network");
        }

        // hard fork
        const rpc = typeof upgradeParams.rpc === "undefined" ? `https://${upgradeParams.network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}` : upgradeParams.rpc;
        console.log(`Shallow forking ${rpc}`);
        await reset(rpc);
        // Get contracts
        const rollupManagerPessimisticFactory = await ethers.getContractFactory("PolygonRollupManagerPessimistic");
        const rollupManagerPessimisticContract = rollupManagerPessimisticFactory.attach(
            upgradeParams.rollupManagerAddress
        ) as PolygonRollupManagerPessimistic;
        // Get admin address from grant role events, should be a timelock and add balance
        const adminRoleFilter = rollupManagerPessimisticContract.filters.RoleGranted(ethers.ZeroHash, null, null);
        const adminRoleEvents = await rollupManagerPessimisticContract.queryFilter(adminRoleFilter, 0, "latest");
        if (adminRoleEvents.length === 0) {
            throw new Error("No admin role granted");
        }
        const adminRoleAddress = adminRoleEvents[0].args.account;
        console.log(`Default Admin rollup manager role address: ${adminRoleAddress}`);
        // Expect upgrade param timelock address to equal admin role address
        expect(upgradeOutput.timelockContractAddress).to.be.equal(adminRoleAddress);
        console.log("✓ admin role is same as upgrade output file timelock address");

        // Get timelock admin role
        // TODO: move this logic to utils
        const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
        const timelockContract = (await timelockContractFactory.attach(adminRoleAddress)) as PolygonZkEVMTimelock;
        const PROPOSER_ROLE = ethers.id("PROPOSER_ROLE");
        const EXECUTOR_ROLE = ethers.id("EXECUTOR_ROLE");
        let proposerRoleAddress = upgradeParams.timelockAdminAddress;
        if (typeof proposerRoleAddress === "undefined") {
            // Try retrieve timelock admin address from events
            const proposerRoleFilter = timelockContract.filters.RoleGranted(PROPOSER_ROLE, null, null);
            const proposerRoleEvents = await timelockContract.queryFilter(proposerRoleFilter, 0, "latest");
            if (proposerRoleEvents.length === 0) {
                throw new Error("No proposer role granted for timelock");
            }
            proposerRoleAddress = proposerRoleEvents[0].args.account;
        }
        const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, proposerRoleAddress);
        const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, proposerRoleAddress);
        if (!hasProposerRole || !hasExecutorRole) {
            throw new Error("Timelock admin address does not have proposer and executor role");
        }

        console.log(`Proposer/executor timelock role address: ${proposerRoleAddress}`);
        await ethers.provider.send("hardhat_impersonateAccount", [proposerRoleAddress]);
        const proposerRoleSigner = await ethers.getSigner(proposerRoleAddress as any);
        await setBalance(proposerRoleAddress, 100n ** 18n);
        console.log(`✓ Funded proposer account ${proposerRoleAddress}`);

        // Get current rollupManager params to compare after upgrade
        const rollupManagerVersion = await rollupManagerPessimisticContract.ROLLUP_MANAGER_VERSION();
        expect(rollupManagerVersion).to.equal("pessimistic");
        const bridgeAddress = await rollupManagerPessimisticContract.bridgeAddress();
        const calculateRewardPerBatch = await rollupManagerPessimisticContract.calculateRewardPerBatch();
        const batchFee = await rollupManagerPessimisticContract.getBatchFee();
        const forcedBatchFee = await rollupManagerPessimisticContract.getForcedBatchFee();
        const globalExitRootManager = await rollupManagerPessimisticContract.globalExitRootManager();
        const isEmergencyState = await rollupManagerPessimisticContract.isEmergencyState();
        const lastAggregationTimestamp = await rollupManagerPessimisticContract.lastAggregationTimestamp();
        const lastDeactivatedEmergencyStateTimestamp =
            await rollupManagerPessimisticContract.lastDeactivatedEmergencyStateTimestamp();
        const pol = await rollupManagerPessimisticContract.pol();
        const rollupCount = await rollupManagerPessimisticContract.rollupCount();
        const rollupTypeCount = await rollupManagerPessimisticContract.rollupTypeCount();
        const totalSequencedBatches = await rollupManagerPessimisticContract.totalSequencedBatches();
        const totalVerifiedBatches = await rollupManagerPessimisticContract.totalVerifiedBatches();

        // Send schedule transaction
        const txScheduleUpgrade = {
            to: upgradeOutput.timelockContractAddress,
            data: upgradeOutput.scheduleData,
        };
        await (await proposerRoleSigner.sendTransaction(txScheduleUpgrade)).wait();
        console.log("✓ Sent schedule transaction");
        // Increase time to bypass the timelock delay
        const timelockDelay = upgradeOutput.decodedScheduleData.delay;
        await time.increase(Number(timelockDelay));
        console.log(`✓ Increase time ${timelockDelay} seconds to bypass timelock delay`);
        // Send execute transaction
        const txExecuteUpgrade = {
            to: upgradeOutput.timelockContractAddress,
            data: upgradeOutput.executeData,
        };
        await (await proposerRoleSigner.sendTransaction(txExecuteUpgrade)).wait();
        console.log(`✓ Sent execute transaction`);
        const rollupMangerFactory = await ethers.getContractFactory("PolygonRollupManager");
        const rollupManagerContract = rollupMangerFactory.attach(
            upgradeParams.rollupManagerAddress
        ) as PolygonRollupManager;
        expect(await rollupManagerContract.bridgeAddress()).to.equal(bridgeAddress);
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.equal(calculateRewardPerBatch);
        expect(await rollupManagerContract.getBatchFee()).to.equal(batchFee);
        expect(await rollupManagerContract.getForcedBatchFee()).to.equal(forcedBatchFee);
        expect(await rollupManagerContract.globalExitRootManager()).to.equal(globalExitRootManager);
        expect(await rollupManagerContract.isEmergencyState()).to.equal(isEmergencyState);

        expect(await rollupManagerContract.lastAggregationTimestamp()).to.equal(lastAggregationTimestamp);
        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.equal(
            lastDeactivatedEmergencyStateTimestamp
        );
        expect(await rollupManagerContract.pol()).to.equal(pol);
        expect(await rollupManagerContract.rollupCount()).to.equal(rollupCount);
        expect(await rollupManagerContract.rollupTypeCount()).to.equal(rollupTypeCount);
        expect(await rollupManagerContract.totalSequencedBatches()).to.equal(totalSequencedBatches);
        expect(await rollupManagerContract.totalVerifiedBatches()).to.equal(totalVerifiedBatches);
        console.log(`✓ Checked rollup manager contract storage parameters and new version`);
        console.log("Finished shallow fork upgrade");
    });
}).timeout(1000000);