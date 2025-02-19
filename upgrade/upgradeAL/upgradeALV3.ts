/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");
import {utils} from "ffjavascript";

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades, run} from "hardhat";
import {PolygonRollupManagerPessimistic} from "../../typechain-types";
import {genTimelockOperation} from "../utils";
import {checkParams} from "../../src/utils";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {
    //upgrades.silenceWarnings();

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ["rollupManagerAddress", "aggLayerGatewayAddress", "timelockDelay"];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const {rollupManagerAddress, timelockDelay, aggLayerGatewayAddress} = upgradeParameters;
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
    const currentProvider = ethers.provider;
    if (upgradeParameters.multiplierGas || upgradeParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (upgradeParameters.maxPriorityFeePerGas && upgradeParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${upgradeParameters.maxPriorityFeePerGas} gwei, MaxFee${upgradeParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(upgradeParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(upgradeParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", upgradeParameters.multiplierGas);
                async function overrideFeeData() {
                    const feeData = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feeData.maxFeePerGas as bigint) * BigInt(upgradeParameters.multiplierGas)) / 1000n,
                        ((feeData.maxPriorityFeePerGas as bigint) * BigInt(upgradeParameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (upgradeParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(upgradeParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("deploying with: ", deployer.address);

    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(rollupManagerPessimisticContract.target);
    const proxyAdminFactory = await ethers.getContractFactory(
        "@openzeppelin/contracts5/proxy/transparent/ProxyAdmin.sol:ProxyAdmin"
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // prepare upgrades
    // Force import the current deployed proxy and implementation for storage layout upgrade checks
    await upgrades.forceImport(rollupManagerAddress, polygonRMPreviousFactory, {
        constructorArgs: [globalExitRootManagerAddress, polAddress, bridgeAddress],
        kind: "transparent",
    });
    // Upgrade to rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, PolygonRollupManagerFactory, {
        constructorArgs: [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress],
        unsafeAllow: ["constructor"],
    });

    console.log("#######################\n");
    console.log(`Polygon rollup manager: ${implRollupManager}`);
    try {
        console.log("Trying to verify the new implementation contract");
        // wait a few seconds before trying etherscan verification
        await new Promise((r) => setTimeout(r, 5000));
        // verify
        await run("verify:verify", {
            address: implRollupManager,
            constructorArguments: [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress],
        });
    } catch (error) {
        console.log("Error verifying the new implementation contract: ", error);
        console.log("you can verify the new impl address with:");
        console.log(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${implRollupManager} --network ${process.env.HARDHAT_NETWORK}\n`
        );
        console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
            globalExitRootManagerAddress,
            polAddress,
            bridgeAddress,
            aggLayerGatewayAddress,
        ]);
    }

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

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operationRollupManager.target,
        operationRollupManager.value,
        operationRollupManager.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operationRollupManager.target,
        operationRollupManager.value,
        operationRollupManager.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    console.log({scheduleData});
    console.log({executeData});

    const outputJson = {
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
    };

    // Decode the scheduleData for better readability
    const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
    const paramsArray = timelockTx?.fragment.inputs as any;
    const objectDecoded = {} as any;

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "data") {
            const decodedProxyAdmin = proxyAdmin.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {} as any;
            const paramsArrayData = decodedProxyAdmin?.fragment.inputs as any;

            objectDecodedData.signature = decodedProxyAdmin?.signature;
            objectDecodedData.selector = decodedProxyAdmin?.selector;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedProxyAdmin?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }

    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
