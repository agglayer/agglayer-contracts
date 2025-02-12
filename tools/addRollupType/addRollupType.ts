/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, run} from "hardhat";

const addRollupTypeParameters = require("./add_rollup_type.json");
const genesis = require("./genesis.json");

const dateStr = new Date().toISOString();
const pathOutputJson = addRollupTypeParameters.outputPath
    ? path.join(__dirname, addRollupTypeParameters.outputPath)
    : path.join(__dirname, `./add_rollup_type_output-${dateStr}.json`);

import {PolygonRollupManager} from "../../typechain-types";
import "../../deployment/helpers/utils";
import utils from "../utils.js";

async function main() {
    console.log(`Starting script to add new rollup type from ${addRollupTypeParameters.type}...`);
    const outputJson = {} as any;
    /*
     * Check parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = [
        "description",
        "forkID",
        "consensusContract",
        "polygonRollupManagerAddress",
        "verifierAddress",
        "genesisRoot",
        "programVKey",
        "type",
    ];

    utils.addTimelockDelayIfTimelock(addRollupTypeParameters, mandatoryDeploymentParameters);

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupTypeParameters[parameterName] === undefined || addRollupTypeParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        description,
        forkID,
        consensusContract,
        polygonRollupManagerAddress,
        verifierAddress,
        timelockDelay,
        genesisRoot,
        programVKey,
    } = addRollupTypeParameters;

    const supportedConsensus = ["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"];
    const isPessimistic = consensusContract === "PolygonPessimisticConsensus";

    if (!supportedConsensus.includes(consensusContract)) {
        throw new Error(`Consensus contract not supported, supported contracts are: ${supportedConsensus}`);
    }

    // Load provider
    const currentProvider = utils.loadProvider(addRollupTypeParameters);

    // Load deployer
    const deployer = utils.loadDeployer(addRollupTypeParameters, currentProvider);

    console.log("Using with: ", deployer.address);

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        polygonRollupManagerAddress
    ) as PolygonRollupManager;

    // get data from rollupManagerContract
    const polygonZkEVMBridgeAddress = await rollupManagerContract.bridgeAddress();
    const polygonZkEVMGlobalExitRootAddress = await rollupManagerContract.globalExitRootManager();
    const polTokenAddress = await rollupManagerContract.pol();

    if (!isPessimistic) {
        // checks for rollups
        // Sanity checks genesisRoot
        if (genesisRoot !== genesis.root) {
            throw new Error(`Genesis root in the 'add_rollup_type.json' does not match the root in the 'genesis.json'`);
        }

        // get bridge address in genesis file
        let genesisBridgeAddress = ethers.ZeroAddress;
        let bridgeContractName = "";
        for (let i = 0; i < genesis.genesis.length; i++) {
            if (utils.supportedBridgeContracts.includes(genesis.genesis[i].contractName)) {
                genesisBridgeAddress = genesis.genesis[i].address;
                bridgeContractName = genesis.genesis[i].contractName;
                break;
            }
        }

        if (polygonZkEVMBridgeAddress.toLowerCase() !== genesisBridgeAddress.toLowerCase()) {
            throw new Error(
                `'${bridgeContractName}' root in the 'genesis.json' does not match 'bridgeAddress' in the 'PolygonRollupManager'`
            );
        }
    }

    if (addRollupTypeParameters.type === utils.transactionTypes.EOA) {
        // Check roles
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
        if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) == false) {
            throw new Error(
                `Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment`
            );
        }

        // Since it's a mock deployment deployer has all the rights
        const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");

        // Check role:
        if ((await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, deployer.address)) == false)
            await rollupManagerContract.grantRole(ADD_ROLLUP_TYPE_ROLE, deployer.address);
    }

    // Create consensus implementation if needed
    let PolygonConsensusContractAddress;

    if (
        typeof addRollupTypeParameters.consensusContractAddress !== "undefined" &&
        ethers.isAddress(addRollupTypeParameters.consensusContractAddress)
    ) {
        PolygonConsensusContractAddress = addRollupTypeParameters.consensusContractAddress;
    } else {
        const PolygonConsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
        let PolygonConsensusContract;

        PolygonConsensusContract = await PolygonConsensusFactory.deploy(
            polygonZkEVMGlobalExitRootAddress,
            polTokenAddress,
            polygonZkEVMBridgeAddress,
            polygonRollupManagerAddress
        );
        await PolygonConsensusContract.waitForDeployment();
        console.log("#######################\n");
        console.log(`new consensus name: ${consensusContract}`);
        console.log(`new PolygonConsensusContract impl: ${PolygonConsensusContract.target}`);

        try {
            console.log("Verifying contract...");
            await run("verify:verify", {
                address: PolygonConsensusContract.target,
                constructorArguments: [
                    polygonZkEVMGlobalExitRootAddress,
                    polTokenAddress,
                    polygonZkEVMBridgeAddress,
                    polygonRollupManagerAddress,
                ],
            });
        } catch (e) {
            console.log("Automatic verification failed. Please verify the contract manually.");
            console.log("you can verify the new impl address with:");
            console.log(
                `npx hardhat verify --constructor-args upgrade/arguments.js ${PolygonConsensusContract.target} --network ${process.env.HARDHAT_NETWORK}\n`
            );
            console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
                polygonZkEVMGlobalExitRootAddress,
                polTokenAddress,
                polygonZkEVMBridgeAddress,
                polygonRollupManagerAddress,
            ]);
        }
        PolygonConsensusContractAddress = PolygonConsensusContract.target;
    }

    // Add a new rollup type
    let rollupVerifierType;
    let genesisFinal;
    let programVKeyFinal;

    if (consensusContract == "PolygonPessimisticConsensus") {
        rollupVerifierType = 1;
        genesisFinal = ethers.ZeroHash;
        programVKeyFinal = programVKey || ethers.ZeroHash;
    } else {
        rollupVerifierType = 0;
        genesisFinal = genesis.root;
        programVKeyFinal = ethers.ZeroHash;
    }

    if (addRollupTypeParameters.type === utils.transactionTypes.TIMELOCK) {
        // load timelock
        const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

        // generate operation
        const salt = addRollupTypeParameters.timelockSalt || ethers.ZeroHash;
        const predecessor = addRollupTypeParameters.predecessor || ethers.ZeroHash;

        const operation = utils.genOperation(
            polygonRollupManagerAddress,
            0, // value
            PolygonRollupManagerFactory.interface.encodeFunctionData("addNewRollupType", [
                PolygonConsensusContractAddress,
                verifierAddress,
                forkID,
                rollupVerifierType,
                genesisFinal,
                description,
                programVKeyFinal,
            ]),
            predecessor, // predecessor
            salt // salt
        );

        // Schedule operation
        const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);
        console.log("#######################\n");
        console.log({scheduleData});
        console.log({executeData});

        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        outputJson.id = operation.id;

        // Decode the scheduleData for better readability
        const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
        const objectDecoded = utils.decodeTimelockData(timelockTx, PolygonRollupManagerFactory);
        outputJson.decodedScheduleData = objectDecoded;
    } else {
        console.log(
            await (
                await rollupManagerContract.addNewRollupType(
                    PolygonConsensusContractAddress,
                    verifierAddress,
                    forkID,
                    rollupVerifierType,
                    genesisFinal,
                    description,
                    programVKeyFinal
                )
            ).wait()
        );
        console.log("#######################\n");
        console.log("Added new Rollup Type deployed");

        outputJson.rollupTypeID = await rollupManagerContract.rollupTypeCount();
        outputJson.programVKey = programVKeyFinal;
        outputJson.consensusContractAddress = PolygonConsensusContractAddress;
    }

    outputJson.genesis = genesis.root;
    outputJson.verifierAddress = verifierAddress;
    outputJson.consensusContract = consensusContract;

    // add time to output path
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
