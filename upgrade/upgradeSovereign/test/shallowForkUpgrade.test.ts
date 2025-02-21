/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {
    PolygonZkEVMTimelock,
    GlobalExitRootManagerL2SovereignChainPessimistic,
    GlobalExitRootManagerL2SovereignChain,
} from "../../../typechain-types";

import {time, reset, setBalance, mine} from "@nomicfoundation/hardhat-network-helpers";
import {checkParams} from "../../../src/utils";

const upgradeParams = require("../upgrade_parameters.json");
const upgradeOutput = require("../upgrade_output.json");

async function main() {
    const mandatoryParameters = ["timelockAdminAddress", "rpc"];
    checkParams(upgradeParams, mandatoryParameters);

    // hard fork
    console.log(`Shallow forking ${upgradeParams.rpc}`);
    await reset(upgradeParams.rpc);
    await mine();

    // In case globalExitRootManagerL2SovereignChainAddress is not provided, use the default one, used by most chains in the genesis
    const globalExitRootManagerL2SovereignChainAddress =
        typeof upgradeParams.globalExitRootManagerL2SovereignChainAddress === "undefined"
            ? "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa"
            : upgradeParams.globalExitRootManagerL2SovereignChainAddress;
    // Get contracts
    const gerManagerL2SovereignChainPessimisticFactory = await ethers.getContractFactory(
        "GlobalExitRootManagerL2SovereignChainPessimistic"
    );
    const gerManagerL2SovereignContractPessimistic = gerManagerL2SovereignChainPessimisticFactory.attach(
        globalExitRootManagerL2SovereignChainAddress
    ) as GlobalExitRootManagerL2SovereignChainPessimistic;

    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(gerManagerL2SovereignContractPessimistic.target);
    const proxyAdminFactory = await ethers.getContractFactory(
        "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin"
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const ownerAddress = await proxyAdmin.owner();
    expect(upgradeOutput.timelockContractAddress).to.be.equal(ownerAddress);
    console.log("✓ proxy admin role is same as upgrade output file timelock address");

    // Check proposed timelock admin address has proposer and executor role
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
    const timelockContract = (await timelockContractFactory.attach(ownerAddress)) as PolygonZkEVMTimelock;
    const PROPOSER_ROLE = ethers.id("PROPOSER_ROLE");
    const EXECUTOR_ROLE = ethers.id("EXECUTOR_ROLE");
    const proposerRoleAddress = upgradeParams.timelockAdminAddress;
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

    // Get current contract params to compare after upgrade
    const globalExitRootUpdater = await gerManagerL2SovereignContractPessimistic.globalExitRootUpdater();
    const globalExitRootRemover = await gerManagerL2SovereignContractPessimistic.globalExitRootRemover();
    const insertedGERCount = await gerManagerL2SovereignContractPessimistic.insertedGERCount();

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
    const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory("GlobalExitRootManagerL2SovereignChain");
    const gerManagerL2SovereignContract = GlobalExitRootManagerL2SovereignChainFactory.attach(
        globalExitRootManagerL2SovereignChainAddress
    ) as GlobalExitRootManagerL2SovereignChain;
    expect(await gerManagerL2SovereignContract.globalExitRootUpdater()).to.equal(globalExitRootUpdater);
    expect(await gerManagerL2SovereignContract.globalExitRootRemover()).to.equal(globalExitRootRemover);
    expect(await gerManagerL2SovereignContract._legacyInsertedGERCount()).to.equal(insertedGERCount);

    console.log(`✓ Checked GlobalExitRootManagerL2SovereignChain contract storage parameters`);
    console.log("Finished shallow fork upgrade");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
