/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");
import {utils} from "ffjavascript";

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades, run} from "hardhat";
import {GlobalExitRootManagerL2SovereignChainPessimistic} from "../../typechain-types";
import {genTimelockOperation} from "../utils";
import {checkParams} from "../../src/utils";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {
    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ["timelockDelay"];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const {timelockDelay} = upgradeParameters;
    // In case globalExitRootManagerL2SovereignChainAddress is not provided, use the default one, used by most chains in the genesis
    const globalExitRootManagerL2SovereignChainAddress = typeof upgradeParameters.globalExitRootManagerL2SovereignChainAddress === "undefined" ? "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa" : upgradeParameters.globalExitRootManagerL2SovereignChainAddress;
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
    let deployer;
    if (upgradeParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(upgradeParameters.deployerPvtKey, ethers.provider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(ethers.provider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(gerManagerL2SovereignChainContract.target);
    const proxyAdminFactory = await ethers.getContractFactory(
        "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin"
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // prepare upgrades
    // Force import the current deployed proxy and implementation for storage layout upgrade checks
    await upgrades.forceImport(
        globalExitRootManagerL2SovereignChainAddress,
        gerManagerL2SovereignChainPessimisticFactory,
        {
            constructorArgs: [bridgeAddress],
            kind: "transparent",
        }
    );
    // Upgrade to GlobalExitRootManagerL2SovereignChain
    console.log("deploying with: ", deployer.address);
    const gerManagerL2SovereignChainFactory = await ethers.getContractFactory("GlobalExitRootManagerL2SovereignChain", deployer);
    const gerManagerL2SovereignChainImplementation = await upgrades.prepareUpgrade(
        globalExitRootManagerL2SovereignChainAddress,
        gerManagerL2SovereignChainFactory,
        {
            constructorArgs: [bridgeAddress],
            unsafeAllow: ["constructor"],
        }
    );

    console.log("#######################\n");
    console.log(`GERManagerL2Sovereign implementation: ${gerManagerL2SovereignChainImplementation}`);
    try {
        console.log("Trying to verify the new implementation contract");
        // wait a few seconds before trying etherscan verification
        await new Promise((r) => setTimeout(r, 5000));
        // verify
        await run("verify:verify", {
            address: gerManagerL2SovereignChainImplementation,
            constructorArguments: [bridgeAddress],
        });
    } catch (error) {
        console.log("Error verifying the new implementation contract: ", error);
        console.log("you can verify the new impl address with:");
        console.log(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${gerManagerL2SovereignChainImplementation} --network ${process.env.HARDHAT_NETWORK}\n`
        );
        console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [bridgeAddress]);
    }
    // Get initialize values
    const globalExitRootUpdater = await gerManagerL2SovereignChainContract.globalExitRootUpdater();
    const globalExitRootRemover = await gerManagerL2SovereignChainContract.globalExitRootRemover();

    const timelockOperation = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            globalExitRootManagerL2SovereignChainAddress,
            gerManagerL2SovereignChainImplementation,
            gerManagerL2SovereignChainFactory.interface.encodeFunctionData("initialize", [
                globalExitRootUpdater,
                globalExitRootRemover,
            ]),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        timelockOperation.target,
        timelockOperation.value,
        timelockOperation.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        timelockOperation.target,
        timelockOperation.value,
        timelockOperation.data,
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
    console.log(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
