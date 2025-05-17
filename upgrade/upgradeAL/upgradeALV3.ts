/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from "chai";
import path = require("path");
import fs = require("fs");
import { utils } from "ffjavascript";
import { logger } from "../../src/logger";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { ethers, upgrades } from "hardhat";
import { PolygonRollupManagerPessimistic } from "../../typechain-types";
import { genTimelockOperation, verifyContractEtherscan, decodeScheduleData } from "../utils";
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from "../../src/utils";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ["rollupManagerAddress", "aggLayerGatewayAddress", "timelockDelay", "proxiedTokensManagerAddress"];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { rollupManagerAddress, timelockDelay, aggLayerGatewayAddress, proxiedTokensManagerAddress } = upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load onchain parameters
    let polygonRMPreviousFactory = await ethers.getContractFactory("PolygonRollupManagerPessimistic");
    const rollupManagerPessimisticContract = (await polygonRMPreviousFactory.attach(
        rollupManagerAddress
    )) as PolygonRollupManagerPessimistic;

    const globalExitRootManagerAddress = await rollupManagerPessimisticContract.globalExitRootManager();
    const polAddress = await rollupManagerPessimisticContract.pol();
    const bridgeAddress = await rollupManagerPessimisticContract.bridgeAddress();

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info("deploying implementation with: ", deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(rollupManagerAddress as string)).to.be.equal(proxyAdmin.target);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // prepare upgrades

    // Upgrade to rollup manager v3
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, PolygonRollupManagerFactory, {
        constructorArgs: [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress],
        unsafeAllow: ["constructor"],
    });

    logger.info("#######################\n");
    logger.info(`Polygon rollup manager implementation deployed at: ${implRollupManager}`);

    await verifyContractEtherscan(implRollupManager as string, [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress]);

    const operationRollupManager = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            rollupManagerAddress,
            implRollupManager,
            PolygonRollupManagerFactory.interface.encodeFunctionData("initialize", []),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Upgrade bridge
    const bridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);
    const impBridge = await upgrades.prepareUpgrade(bridgeAddress, bridgeFactory, {
        unsafeAllow: ["constructor", "missing-initializer", "missing-initializer-call"],
    });
    logger.info("#######################\n");
    logger.info(`Polygon bridge implementation deployed at: ${impBridge}`);

    await verifyContractEtherscan(impBridge as string, []);

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            bridgeAddress,
            impBridge,
            bridgeFactory.interface.encodeFunctionData("initialize(address)", [proxiedTokensManagerAddress])
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    /// Upgrade PolygonZkEVMGlobalExitRootV2
    const globalExitRootManagerFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);
    const globalExitRootManagerImp = await upgrades.prepareUpgrade(globalExitRootManagerAddress, globalExitRootManagerFactory, {
        constructorArgs: [rollupManagerAddress, bridgeAddress],
        unsafeAllow: ["constructor", "missing-initializer"],
    });
    logger.info("#######################\n");
    logger.info(`Polygon global exit root manager implementation deployed at: ${globalExitRootManagerImp}`);

    await verifyContractEtherscan(globalExitRootManagerImp as string, [rollupManagerAddress, bridgeAddress]);

    const operationGlobalExitRoot = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgrade", [globalExitRootManagerAddress, globalExitRootManagerImp]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("scheduleBatch", [
        [operationRollupManager.target, operationBridge.target, operationGlobalExitRoot.target],
        [operationRollupManager.value, operationBridge.value, operationGlobalExitRoot.value],
        [operationRollupManager.data, operationBridge.data, operationGlobalExitRoot.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("executeBatch", [
        [operationRollupManager.target, operationBridge.target, operationGlobalExitRoot.target],
        [operationRollupManager.value, operationBridge.value, operationGlobalExitRoot.value],
        [operationRollupManager.data, operationBridge.data, operationGlobalExitRoot.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });
    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    const outputJson = {
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
    };

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);


    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 2));
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
