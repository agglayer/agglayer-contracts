/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");
import {logger} from "../../src/logger";

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades, run} from "hardhat";
import {GlobalExitRootManagerL2SovereignChainPessimistic, TimelockController} from "../../typechain-types";
import {genTimelockOperation, decodeScheduleData} from "../utils";
import {checkParams, getDeployerFromParameters} from "../../src/utils";

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

    // In case globalExitRootManagerL2SovereignChainAddress is not provided, use the default one, used by most chains in the genesis
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

    // Load deployer
    const deployer = await getDeployerFromParameters(ethers.provider, upgradeParameters, ethers);
    logger.info(`Upgrading with: ${deployer.address}`);

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
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);
    const timelockContract = (await timelockContractFactory.attach(timelockAddress)) as TimelockController;
    // take params delay, or minimum timelock dela
    const timelockDelay = upgradeParameters.timelockDelay || (await timelockContract.getMinDelay());

    // Upgrade BridgeL2SovereignChain
    const bridgeFactory = await ethers.getContractFactory("BridgeL2SovereignChain", deployer);
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

    logger.info({scheduleData});
    logger.info({executeData});

    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    const outputJson = {
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
        bridgeImplementationAddress: impBridge,
    } as any;

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);
    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
    logger.info(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
