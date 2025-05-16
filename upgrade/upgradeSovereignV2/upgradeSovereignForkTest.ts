/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");
import {logger} from "../../src/logger";

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades, run} from "hardhat";
import {
    GlobalExitRootManagerL2SovereignChainPessimistic,
    TimelockController,
    BridgeL2SovereignChain,
} from "../../typechain-types";
import {genTimelockOperation, decodeScheduleData} from "../utils";
import {checkParams, getDeployerFromParameters} from "../../src/utils";
import {takeSnapshot, time, reset, setBalance, setStorageAt} from "@nomicfoundation/hardhat-network-helpers";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {
    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = [
        "proxiedTokensManagerAddress",
        "emergencyBridgePauserAddress",
        "emergencyBridgeUnpauserAddress",
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const {emergencyBridgePauserAddress, emergencyBridgeUnpauserAddress, proxiedTokensManagerAddress} =
        upgradeParameters;

    // ############
    // FORK config
    // ############
    // load fork params
    const {rpc, timelockAdmin} = upgradeParameters.forkParams;
    if (!rpc || !timelockAdmin) {
        throw new Error("Missing fork parameters: 'rpc' or 'timelockAdmin' is not defined.");
    }
    logger.info(`Using fork RPC: ${rpc}`);

    await reset(rpc);
    // Get timelock multisig
    await ethers.provider.send("hardhat_impersonateAccount", [timelockAdmin]);
    const timelockSigner = await ethers.getSigner(timelockAdmin as any);
    await setBalance(timelockAdmin, 100n ** 18n);

    const globalExitRootManagerL2SovereignChainAddress =
        typeof upgradeParameters.globalExitRootManagerL2SovereignChainAddress === "undefined"
            ? "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa"
            : upgradeParameters.globalExitRootManagerL2SovereignChainAddress;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load onchain parameters
    const gerManagerL2SovereignChainPessimisticFactory = await ethers.getContractFactory(
        "GlobalExitRootManagerL2SovereignChainPessimistic"
    );
    const gerManagerL2SovereignChainContract = (await gerManagerL2SovereignChainPessimisticFactory.attach(
        globalExitRootManagerL2SovereignChainAddress
    )) as GlobalExitRootManagerL2SovereignChainPessimistic;

    const bridgeAddress = await gerManagerL2SovereignChainContract.bridgeAddress();

    logger.info(`Upgrading with: ${timelockSigner.address}`);

    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    await upgrades.forceImport(
        globalExitRootManagerL2SovereignChainAddress,
        gerManagerL2SovereignChainPessimisticFactory,
        {
            constructorArgs: [bridgeAddress],
            kind: "transparent",
        }
    );

    const proxyAdmin = await upgrades.admin.getInstance();
    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(globalExitRootManagerL2SovereignChainAddress as string)).to.be.equal(
        proxyAdmin.target
    );

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", timelockSigner);
    const timelockContract = (await timelockContractFactory.attach(timelockAddress)) as TimelockController;
    // take params delay, or minimum timelock dela
    const timelockDelay = upgradeParameters.timelockDelay || (await timelockContract.getMinDelay());

    // Upgrade BridgeL2SovereignChain
    const bridgeFactory = await ethers.getContractFactory("BridgeL2SovereignChain", timelockSigner);
    await upgrades.forceImport(bridgeAddress, bridgeFactory, {
        constructorArgs: [],
        kind: "transparent",
    });

    const impBridge = await upgrades.prepareUpgrade(bridgeAddress, bridgeFactory, {
        unsafeAllow: ["constructor", "missing-initializer", "missing-initializer-call"],
        redeployImplementation: "always",
    });
    logger.info("#######################\n");
    logger.info(`Polygon sovereign bridge implementation deployed at: ${impBridge}`);

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            bridgeAddress,
            impBridge,
            bridgeFactory.interface.encodeFunctionData("initialize(bytes32[],uint256[],address,address,address)", [
                [],
                [],
                emergencyBridgePauserAddress,
                emergencyBridgeUnpauserAddress,
                proxiedTokensManagerAddress,
            ]),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operationBridge.target,
        operationBridge.value,
        operationBridge.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operationBridge.target,
        operationBridge.value,
        operationBridge.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    // send mutlsig transaction
    const txSchedule = {
        to: timelockContract.target,
        data: scheduleData,
    };
    await (await timelockSigner.sendTransaction(txSchedule)).wait();

    await time.increase(timelockDelay);

    const txExecute = {
        to: timelockContract.target,
        data: executeData,
    };
    await (await timelockSigner.sendTransaction(txExecute)).wait();

    logger.info("#######################\n");
    logger.info("Upgrade executed successfully");

    const AL_VERSION = "al-v0.3.1";
    const bridgeContract = bridgeFactory.attach(bridgeAddress) as BridgeL2SovereignChain;

    expect(await bridgeContract.BRIDGE_SOVEREIGN_VERSION()).to.equal(AL_VERSION);
    expect(await bridgeContract.proxiedTokensManager()).to.equal(proxiedTokensManagerAddress);
    expect(await bridgeContract.emergencyBridgePauser()).to.equal(emergencyBridgePauserAddress);
    expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(emergencyBridgeUnpauserAddress);
    expect(await bridgeContract.bridgeManager()).to.equal(timelockSigner.address);
    expect(await bridgeContract.pendingProxiedTokensManager()).to.equal(ethers.ZeroAddress);
    expect(await bridgeContract.gasTokenAddress()).to.equal(ethers.ZeroAddress);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
