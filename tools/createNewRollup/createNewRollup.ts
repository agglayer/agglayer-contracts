/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");
import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {processorUtils, Constants} from "@0xpolygonhermez/zkevm-commonjs";
import {VerifierType, ConsensusContracts} from "../../src/pessimistic-utils";
const createRollupParameters = require("./create_new_rollup.json");
import utils from "../utils";
import updateVanillaGenesis from "../../deployment/v2/utils/updateVanillaGenesis";

import {
    PolygonRollupManager,
    PolygonZkEVMEtrog,
    PolygonZkEVMBridgeV2,
    PolygonValidiumEtrog,
    PolygonPessimisticConsensus,
} from "../../typechain-types";

async function main() {
    console.log(`Starting script to create new rollup from ${createRollupParameters.type}...`);

    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = createRollupParameters.outputPath
        ? path.join(__dirname, createRollupParameters.outputPath)
        : path.join(__dirname, `create_new_rollup_output_${createRollupParameters.type}_${dateStr}.json`);

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = [
        "trustedSequencerURL",
        "networkName",
        "trustedSequencer",
        "chainID",
        "rollupAdminAddress",
        "consensusContractName",
        "rollupManagerAddress",
        "rollupTypeId",
        "gasTokenAddress",
        "type",
    ];

    utils.addTimelockDelayIfTimelock(createRollupParameters, mandatoryDeploymentParameters);

    for (const parameterName of mandatoryDeploymentParameters) {
        if (createRollupParameters[parameterName] === undefined || createRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        trustedSequencerURL,
        networkName,
        trustedSequencer,
        chainID,
        rollupAdminAddress,
        consensusContractName,
        isVanillaClient,
        sovereignParams,
    } = createRollupParameters;

    // Check supported consensus is correct
    const supportedConsensus = [
        ConsensusContracts.PolygonZkEVMEtrog,
        ConsensusContracts.PolygonValidiumEtrog,
        ConsensusContracts.PolygonPessimisticConsensus,
    ];

    if (!supportedConsensus.includes(consensusContractName)) {
        throw new Error(
            `Consensus contract ${consensusContractName} not supported, supported contracts are: ${supportedConsensus}`
        );
    }

    // Check consensus compatibility
    if (isVanillaClient) {
        if (consensusContractName !== "PolygonPessimisticConsensus") {
            throw new Error(`Vanilla client only supports PolygonPessimisticConsensus`);
        }
        // Check sovereign params
        const mandatorySovereignParams = [
            "bridgeManager",
            "sovereignWETHAddress",
            "sovereignWETHAddressIsNotMintable",
            "globalExitRootUpdater",
            "globalExitRootRemover",
        ];
        for (const parameterName of mandatorySovereignParams) {
            if (typeof sovereignParams[parameterName] === undefined || sovereignParams[parameterName] === "") {
                throw new Error(`Missing sovereign parameter: ${parameterName}`);
            }
        }
        // Vanilla checks like in bridge contract
        if (
            ethers.isAddress(createRollupParameters.gasTokenAddress) &&
            createRollupParameters.gasTokenAddress !== ethers.ZeroAddress &&
            sovereignParams.sovereignWETHAddress === ethers.ZeroAddress &&
            sovereignParams.sovereignWETHAddressIsNotMintable === true
        ) {
            throw new Error(
                "InvalidSovereignWETHAddressParams: if gasTokenAddress is not 0x0, and sovereignWETHAddress is 0x0, sovereignWETHAddressIsNotMintable must be false"
            );
        }

        if (
            createRollupParameters.gasTokenAddress === ethers.ZeroAddress &&
            (sovereignParams.sovereignWETHAddress !== ethers.ZeroAddress ||
                sovereignParams.sovereignWETHAddressIsNotMintable === true)
        ) {
            throw new Error(
                "InvalidSovereignWETHAddressParams: If gasTokenAddress is 0x0, sovereignWETHAddress must be 0x0 and sovereignWETHAddressIsNotMintable must be false"
            );
        }
    }

    // Load provider
    const currentProvider = utils.loadProvider(createRollupParameters);

    // Load deployer
    const deployer = utils.loadDeployer(createRollupParameters, currentProvider);

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        createRollupParameters.rollupManagerAddress
    ) as PolygonRollupManager;

    // Load global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);
    const globalExitRootManagerAddress = await rollupManagerContract.globalExitRootManager();
    const globalExitRootManagerContract = globalExitRootManagerFactory.attach(
        globalExitRootManagerAddress
    ) as PolygonRollupManager;

    // Check chainID
    let rollupID = await rollupManagerContract.chainIDToRollupID(chainID);
    if (Number(rollupID) !== 0) {
        throw new Error(`Rollup with chainID ${chainID} already exists`);
    }

    // Check rollupTypeId
    const rollupType = await rollupManagerContract.rollupTypeMap(createRollupParameters.rollupTypeId);
    const consensusContractAddress = rollupType[0];
    const verifierType = Number(rollupType[3]);
    if (
        consensusContractName === ConsensusContracts.PolygonPessimisticConsensus &&
        verifierType !== VerifierType.Pessimistic
    ) {
        throw new Error(
            `Mismatch RollupTypeID: Verifier type should be ${VerifierType.StateTransition} for ${consensusContractName}`
        );
    }
    if (consensusContractName !== ConsensusContracts.PolygonPessimisticConsensus) {
        if (verifierType !== VerifierType.StateTransition) {
            throw new Error(
                `Mismatch RollupTypeID: Verifier type should be ${VerifierType.Pessimistic} for ${consensusContractName}`
            );
        }
        const polygonValidiumConsensusFactory = (await ethers.getContractFactory(
            ConsensusContracts.PolygonValidiumEtrog,
            deployer
        )) as any;
        const polygonValidiumConsensusContract = polygonValidiumConsensusFactory.attach(
            consensusContractAddress
        ) as PolygonValidiumEtrog;

        let hasMethodImplemented;

        try {
            hasMethodImplemented = await polygonValidiumConsensusContract.isSequenceWithDataAvailabilityAllowed();
        } catch (error) {
            console.log("RollupTypeID selected ");
        }

        // Consensus PolygonZkEVMEtrog: if 'hasMethodImplemented' does not have any value
        if (typeof hasMethodImplemented === "undefined") {
            if (consensusContractName === ConsensusContracts.PolygonValidiumEtrog) {
                throw new Error(
                    `The consensus contract at ${consensusContractAddress} does not have the public method "isSequenceWithDataAvailabilityAllowed", this means is a rollup and you are trying to create a validium`
                );
            }
        } else {
            // Consensus PolygonValidiumEtrog: if 'hasMethodImplemented' does not have any value
            if (consensusContractName === ConsensusContracts.PolygonZkEVMEtrog) {
                throw new Error(
                    `The consensus contract at ${consensusContractAddress} does have the public var "isSequenceWithDataAvailabilityAllowed", this means is a validium and you are trying to create a rollup`
                );
            }
        }
    }

    // Get rollup address deterministically
    const nonce = await currentProvider.getTransactionCount(rollupManagerContract.target);
    const createdRollupAddress = ethers.getCreateAddress({
        from: rollupManagerContract.target as string,
        nonce: nonce,
    });
    let globalExitRoot = "";
    let batchData = {};
    // Populate output json
    outputJson.consensusContractName = consensusContractName;
    outputJson.rollupAddress = createdRollupAddress;
    outputJson.genesis = rollupType.genesis;
    outputJson.gasTokenAddress = createRollupParameters.gasTokenAddress;
    outputJson.rollupManagerAddress = createRollupParameters.rollupManagerAddress;

    if (createRollupParameters.type === utils.transactionTypes.TIMELOCK) {
        console.log("Creating timelock txs for rollup creation...");
        const salt = createRollupParameters.timelockSalt || ethers.ZeroHash;
        const predecessor = ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);
        const operation = utils.genOperation(
            createRollupParameters.rollupManagerAddress,
            0, // value
            PolygonRollupManagerFactory.interface.encodeFunctionData("createNewRollup", [
                createRollupParameters.rollupTypeId,
                chainID,
                rollupAdminAddress,
                trustedSequencer,
                createRollupParameters.gasTokenAddress,
                trustedSequencerURL,
                networkName,
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
            createRollupParameters.timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);
        console.log({scheduleData});
        console.log({executeData});
        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;

        // Decode the scheduleData for better readability
        const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
        const objectDecoded = utils.decodeTimelockTx(timelockTx, PolygonRollupManagerFactory);
        outputJson.decodedScheduleData = utils.convertBigIntsToNumbers(objectDecoded);

        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        console.log("Finished script, output saved at: ", destPath);
        process.exit(0);
    } else if (createRollupParameters.type === utils.transactionTypes.MULTISIG) {
        console.log("Creating calldata for rollup creation from multisig...");
        const txDeployRollupCalldata = PolygonRollupManagerFactory.interface.encodeFunctionData("createNewRollup", [
            createRollupParameters.rollupTypeId,
            chainID,
            rollupAdminAddress,
            trustedSequencer,
            createRollupParameters.gasTokenAddress,
            trustedSequencerURL,
            networkName,
        ]);
        outputJson.txDeployRollupCalldata = txDeployRollupCalldata;
        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        console.log("Finished script, output saved at: ", destPath);
        process.exit(0);
    } else {
        // Check if the deployer has right to deploy new rollups from rollupManager contract
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
        if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) == false) {
            throw new Error(
                `Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment`
            );
        }
        // Grant role CREATE_ROLLUP_ROLE to deployer
        const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");
        if ((await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, deployer.address)) == false)
            await rollupManagerContract.grantRole(CREATE_ROLLUP_ROLE, deployer.address);

        console.log("Deploying rollup....");
        // Create new rollup
        const txDeployRollup = await rollupManagerContract.createNewRollup(
            createRollupParameters.rollupTypeId,
            chainID,
            rollupAdminAddress,
            trustedSequencer,
            createRollupParameters.gasTokenAddress,
            trustedSequencerURL,
            networkName
        );

        const receipt = (await txDeployRollup.wait()) as any;
        const blockDeploymentRollup = await receipt?.getBlock();

        batchData = {
            timestamp: blockDeploymentRollup.timestamp,
            l1BlockNumber: blockDeploymentRollup.number,
            l1BlockHash: blockDeploymentRollup.hash,
            l1ParentHash: blockDeploymentRollup.parentHash,
        };
        outputJson.createRollupBlockNumber = blockDeploymentRollup.number;
        console.log("#######################\n");
        console.log(
            `Created new ${consensusContractName} Rollup: ${createdRollupAddress} with rollupTypeId: ${createRollupParameters.rollupTypeId}`
        );

        // Search added global exit root on the logs
        const polygonConsensusFactory = (await ethers.getContractFactory(consensusContractName, deployer)) as any;
        for (const log of receipt?.logs) {
            if (log.address == createdRollupAddress) {
                const parsedLog = polygonConsensusFactory.interface.parseLog(log);
                if (parsedLog != null && parsedLog.name == "InitialSequenceBatches") {
                    globalExitRoot = parsedLog.args.lastGlobalExitRoot;
                }
            }
        }
        // Assert admin address
        expect(await upgrades.erc1967.getAdminAddress(createdRollupAddress)).to.be.equal(rollupManagerContract.target);
        expect(await upgrades.erc1967.getImplementationAddress(createdRollupAddress)).to.be.equal(
            consensusContractAddress
        );
    }
    // Update rollupId
    rollupID = await rollupManagerContract.chainIDToRollupID(chainID);

    // If is a validium, data committee must be set up
    const dataAvailabilityProtocol = createRollupParameters.dataAvailabilityProtocol || "PolygonDataCommittee";
    if (consensusContractName.includes("PolygonValidiumEtrog") && dataAvailabilityProtocol === "PolygonDataCommittee") {
        console.log("Is a validium, setting up data committee...");
        // deploy data committee
        const PolygonDataCommitteeContract = (await ethers.getContractFactory("PolygonDataCommittee", deployer)) as any;
        let polygonDataCommittee = await upgrades.deployProxy(PolygonDataCommitteeContract, [], {
            unsafeAllow: ["constructor"],
        });
        await polygonDataCommittee?.waitForDeployment();
        console.log(`Deployed PolygonDataCommittee at ${polygonDataCommittee?.address}`);
        // Load data committee
        const PolygonValidiumContract = (await polygonConsensusFactory.attach(
            createdRollupAddress
        )) as PolygonValidiumEtrog;
        // add data committee to the consensus contract
        if ((await PolygonValidiumContract.admin()) == deployer.address) {
            await (
                await PolygonValidiumContract.setDataAvailabilityProtocol(polygonDataCommittee?.target as any)
            ).wait();
        } else {
            console.log("Is a validium, setting up data committee...");
            await (await polygonDataCommittee?.transferOwnership(rollupAdminAddress)).wait();
            console.log(`Transferred ownership of PolygonDataCommittee to ${rollupAdminAddress}`);
        }
        outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    }

    let gasTokenAddress, gasTokenNetwork, gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);
    const bridgeContractAddress = await rollupManagerContract.bridgeAddress();
    const rollupBridgeContract = bridgeFactory.attach(bridgeContractAddress) as PolygonZkEVMBridgeV2;
    if (
        ethers.isAddress(createRollupParameters.gasTokenAddress) &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress
    ) {
        // Get token metadata
        gasTokenMetadata = await rollupBridgeContract.getTokenMetadata(createRollupParameters.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes("124e4f545f56414c49445f454e434f44494e47")) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createRollupParameters.gasTokenAddress}`
            );
        }
        const wrappedData = await rollupBridgeContract.wrappedTokenToTokenInfo(createRollupParameters.gasTokenAddress);
        if (wrappedData.originNetwork != 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createRollupParameters.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = "0x";
    }

    /**
    If the system is running a "vanilla client" (i.e., a basic, unmodified Ethereum client or rollup setup), the genesis block should include the deployment of the sovereign contracts, and these contracts should already be initialized with their required initial state and configurations. This means that the genesis block will contain the initial state for these contracts, allowing the system to start running without needing any additional initialization steps. However, for other rollups, additional configuration is needed. In this case, instead of having everything pre-initialized in the genesis block, we must inject an "initialization batch" into the genesis file. This batch will contain specific instructions for initializing the contracts at the time of rollup deployment. The injected initialization batch allows the system to be configured dynamically during deployment.
    */

    if (isVanillaClient) {
        console.log("Vanilla client detected, updating genesis...");
        const pathGenesis = path.join(__dirname, "./genesis.json");
        let genesis = JSON.parse(fs.readFileSync(pathGenesis, "utf8"));
        const initializeParams = {
            rollupID: rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            polygonRollupManager: ethers.ZeroAddress,
            gasTokenMetadata,
            bridgeManager: sovereignParams.bridgeManager,
            sovereignWETHAddress: sovereignParams.sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable: sovereignParams.sovereignWETHAddressIsNotMintable,
            globalExitRootUpdater: sovereignParams.globalExitRootUpdater,
            globalExitRootRemover: sovereignParams.globalExitRootRemover,
        };
        genesis = await updateVanillaGenesis(genesis, chainID, initializeParams);
        // Add weth address to deployment output if gas token address is provided and sovereignWETHAddress is not provided
        if (
            gasTokenAddress !== ethers.ZeroAddress &&
            ethers.isAddress(gasTokenAddress) &&
            (sovereignParams.sovereignWETHAddress === ethers.ZeroAddress ||
                !ethers.isAddress(sovereignParams.sovereignWETHAddress))
        ) {
            console.log("Rollup with custom gas token, adding WETH address to deployment output...");
            const wethObject = genesis.genesis.find(function (obj: {contractName: string}) {
                return obj.contractName == "WETH";
            });
            outputJson.WETHAddress = wethObject.address;
        }
        outputJson.genesis_sovereign = genesis;
    } else {
        if (consensusContractName === "PolygonPessimisticConsensus") {
            console.log("Pessimistic rollup detected, injecting initialization batch...");
            // Add the first batch of the created rollup
            const newPessimisticRollup = (await polygonConsensusFactory.attach(
                createdRollupAddress
            )) as PolygonPessimisticConsensus;

            // Get last GER
            const lastGER = await globalExitRootManagerContract.getLastGlobalExitRoot();

            const dataInjectedTx = await rollupBridgeContract.interface.encodeFunctionData("initialize", [
                rollupID,
                gasTokenAddress,
                gasTokenNetwork,
                Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2, // Global exit root address on L2
                ethers.ZeroAddress, // Rollup manager on L2 does not exist
                gasTokenMetadata as any,
            ]);

            // check maximum length is 65535
            if ((dataInjectedTx.length - 2) / 2 > 0xffff) {
                // throw error
                throw new Error(`HugeTokenMetadataNotSupported`);
            }

            const injectedTx = {
                type: 0, // force ethers to parse it as a legacy transaction
                chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
                to: await newPessimisticRollup.bridgeAddress(),
                value: 0,
                gasPrice: 0,
                gasLimit: 30000000,
                nonce: 0,
                data: dataInjectedTx,
                signature: {
                    v: "0x1b",
                    r: "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0",
                    s: "0x000000000000000000000000000000000000000000000000000000005ca1ab1e",
                },
            };

            // serialize transactions
            const txObject = ethers.Transaction.from(injectedTx);

            const customData = processorUtils.rawTxToCustomRawTx(txObject.serialized);
            batchData = Object.assign(batchData, {
                batchL2Data: customData,
                globalExitRoot: lastGER,
                sequencer: trustedSequencer,
            });
        } else {
            console.log("Setting initialization batch for the rollup...");
            // Add the first batch of the created rollup
            const newRollupContract = (await polygonConsensusFactory.attach(createdRollupAddress)) as PolygonZkEVMEtrog;
            batchData = Object.assign(batchData, {
                batchL2Data: await newRollupContract.generateInitializeTransaction(
                    Number(rollupID),
                    gasTokenAddress,
                    gasTokenNetwork,
                    gasTokenMetadata as any
                ),
                globalExitRoot: globalExitRoot,
                sequencer: trustedSequencer,
            });
        }
    }
    outputJson.firstBatchData = batchData;
    outputJson.rollupID = Number(rollupID);

    fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
    console.log("Finished script, output saved at: ", destPath);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
