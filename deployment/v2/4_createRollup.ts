/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";

const pathGenesis = path.join(__dirname, "./genesis.json");
const pathGenesisSovereign = path.join(__dirname, "./genesis_sovereign.json");
import {processorUtils, Constants} from "@0xpolygonhermez/zkevm-commonjs";

const createRollupParameters = require("./create_rollup_parameters.json");
let genesis = require(pathGenesis);
const deployOutput = require("./deploy_output.json");
import "../helpers/utils";
import updateVanillaGenesis from "./utils/updateVanillaGenesis";

const pathOutputJson = path.join(__dirname, "./create_rollup_output.json");

import {
    PolygonRollupManager,
    PolygonZkEVMEtrog,
    PolygonZkEVMBridgeV2,
    PolygonValidiumEtrog,
    PolygonPessimisticConsensus,
} from "../../typechain-types";

async function main() {
    const attemptsDeployProxy = 20;

    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "realVerifier",
        "trustedSequencerURL",
        "networkName",
        "description",
        "trustedSequencer",
        "chainID",
        "adminZkEVM",
        "forkID",
        "consensusContract",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (createRollupParameters[parameterName] === undefined || createRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        realVerifier,
        trustedSequencerURL,
        networkName,
        description,
        trustedSequencer,
        chainID,
        adminZkEVM,
        forkID,
        consensusContract,
        isVanillaClient,
        sovereignParams,
    } = createRollupParameters;

    const supportedConsensus = ["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"];

    if (!supportedConsensus.includes(consensusContract)) {
        throw new Error(`Consensus contract not supported, supported contracts are: ${supportedConsensus}`);
    }

    // Check consensus compatibility
    if (isVanillaClient) {
        if (consensusContract !== "PolygonPessimisticConsensus") {
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
    }

    const dataAvailabilityProtocol = createRollupParameters.dataAvailabilityProtocol || "PolygonDataCommittee";

    const supportedDataAvailabilityProtocols = ["PolygonDataCommittee"];

    if (
        consensusContract.includes("PolygonValidiumEtrog") &&
        !supportedDataAvailabilityProtocols.includes(dataAvailabilityProtocol)
    ) {
        throw new Error(
            `Data availability protocol not supported, supported data availability protocols are: ${supportedDataAvailabilityProtocols}`
        );
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (createRollupParameters.multiplierGas || createRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (createRollupParameters.maxPriorityFeePerGas && createRollupParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${createRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${createRollupParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(createRollupParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(createRollupParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", createRollupParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) /
                            1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (createRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(createRollupParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        deployOutput.polygonRollupManagerAddress
    ) as PolygonRollupManager;

    // Load global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);
    const globalExitRootManagerContract = globalExitRootManagerFactory.attach(
        deployOutput.polygonZkEVMGlobalExitRootAddress
    ) as PolygonRollupManager;

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) == false) {
        throw new Error(
            `Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment`
        );
    }

    let verifierContract;
    let verifierName;
    if (realVerifier === true) {
        if (consensusContract != "PolygonPessimisticConsensus") {
            verifierName = `FflonkVerifier_${forkID}`;

            const VerifierRollup = await ethers.getContractFactory(verifierName, deployer);
            verifierContract = await VerifierRollup.deploy();
            await verifierContract.waitForDeployment();
        } else {
            verifierName = "SP1VerifierPlonk";
            const VerifierRollup = await ethers.getContractFactory(verifierName, deployer);
            verifierContract = await VerifierRollup.deploy();
            await verifierContract.waitForDeployment();
        }
    } else {
        verifierName = "VerifierRollupHelperMock";
        const VerifierRollupHelperFactory = await ethers.getContractFactory(verifierName, deployer);
        verifierContract = await VerifierRollupHelperFactory.deploy();
        await verifierContract.waitForDeployment();
    }
    console.log("#######################\n");
    console.log("Verifier name:", verifierName);
    console.log("Verifier deployed to:", verifierContract.target);

    // Since it's a mock deployment deployer has all the rights
    const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");
    const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");

    // Check role:

    if ((await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, deployer.address)) == false)
        await rollupManagerContract.grantRole(ADD_ROLLUP_TYPE_ROLE, deployer.address);

    if ((await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, deployer.address)) == false)
        await rollupManagerContract.grantRole(CREATE_ROLLUP_ROLE, deployer.address);

    // Create consensus implementation
    const PolygonconsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
    let PolygonconsensusContract;

    PolygonconsensusContract = await PolygonconsensusFactory.deploy(
        deployOutput.polygonZkEVMGlobalExitRootAddress,
        deployOutput.polTokenAddress,
        deployOutput.polygonZkEVMBridgeAddress,
        deployOutput.polygonRollupManagerAddress
    );
    await PolygonconsensusContract.waitForDeployment();

    // Add a new rollup type with timelock
    let rollupVerifierType;
    let genesisFinal;
    let programVKey;

    if (consensusContract == "PolygonPessimisticConsensus") {
        rollupVerifierType = 1;
        genesisFinal = ethers.ZeroHash;
        programVKey = createRollupParameters.programVKey || ethers.ZeroHash;
    } else {
        rollupVerifierType = 0;
        genesisFinal = genesis.root;
        programVKey = ethers.ZeroHash;
    }

    await (
        await rollupManagerContract.addNewRollupType(
            PolygonconsensusContract.target,
            verifierContract.target,
            forkID,
            rollupVerifierType,
            genesisFinal,
            description,
            programVKey
        )
    ).wait();

    console.log("#######################\n");
    console.log("Added new Rollup Type deployed");
    const newRollupTypeID = await rollupManagerContract.rollupTypeCount();

    let gasTokenAddress, gasTokenNetwork, gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);
    const polygonZkEVMBridgeContract = bridgeFactory.attach(
        deployOutput.polygonZkEVMBridgeAddress
    ) as PolygonZkEVMBridgeV2;
    if (
        createRollupParameters.gasTokenAddress &&
        createRollupParameters.gasTokenAddress !== "" &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress
    ) {
        // Get token metadata
        gasTokenMetadata = await polygonZkEVMBridgeContract.getTokenMetadata(createRollupParameters.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes("124e4f545f56414c49445f454e434f44494e47")) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createRollupParameters.gasTokenAddress}`
            );
        }
        const wrappedData = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(
            createRollupParameters.gasTokenAddress
        );
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
    outputJson.gasTokenAddress = gasTokenAddress;
    const nonce = await currentProvider.getTransactionCount(rollupManagerContract.target);
    const newZKEVMAddress = ethers.getCreateAddress({
        from: rollupManagerContract.target as string,
        nonce: nonce,
    });

    // Create new rollup
    const txDeployRollup = await rollupManagerContract.createNewRollup(
        newRollupTypeID,
        chainID,
        adminZkEVM,
        trustedSequencer,
        gasTokenAddress,
        trustedSequencerURL,
        networkName
    );

    const receipt = (await txDeployRollup.wait()) as any;
    const blockDeploymentRollup = await receipt?.getBlock();
    const timestampReceipt = blockDeploymentRollup.timestamp;
    const rollupID = await rollupManagerContract.chainIDToRollupID(chainID);

    console.log("#######################\n");
    console.log(`Created new ${consensusContract} Rollup:`, newZKEVMAddress);

    if (consensusContract.includes("PolygonValidiumEtrog") && dataAvailabilityProtocol === "PolygonDataCommittee") {
        // deploy data committee
        const PolygonDataCommitteeContract = (await ethers.getContractFactory("PolygonDataCommittee", deployer)) as any;
        let polygonDataCommittee;

        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonDataCommittee = await upgrades.deployProxy(PolygonDataCommitteeContract, [], {
                    unsafeAllow: ["constructor"],
                });
                break;
            } catch (error: any) {
                console.log(`attempt ${i}`);
                console.log("upgrades.deployProxy of polygonDataCommittee ", error.message);
            }
            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error("polygonDataCommittee contract has not been deployed");
            }
        }
        await polygonDataCommittee?.waitForDeployment();

        // Load data commitee
        const PolygonValidiumContract = (await PolygonconsensusFactory.attach(newZKEVMAddress)) as PolygonValidiumEtrog;
        // add data commitee to the consensus contract
        if ((await PolygonValidiumContract.admin()) == deployer.address) {
            await (
                await PolygonValidiumContract.setDataAvailabilityProtocol(polygonDataCommittee?.target as any)
            ).wait();

            // // Setup data commitee to 0
            // await (await polygonDataCommittee?.setupCommittee(0, [], "0x")).wait();
        } else {
            await (await polygonDataCommittee?.transferOwnership(adminZkEVM)).wait();
        }

        outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    }

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(newZKEVMAddress)).to.be.equal(rollupManagerContract.target);
    expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress)).to.be.equal(
        PolygonconsensusContract.target
    );

    // Search added global exit root on the logs
    let globalExitRoot;
    for (const log of receipt?.logs) {
        if (log.address == newZKEVMAddress) {
            const parsedLog = PolygonconsensusFactory.interface.parseLog(log);
            if (parsedLog != null && parsedLog.name == "InitialSequenceBatches") {
                globalExitRoot = parsedLog.args.lastGlobalExitRoot;
            }
        }
    }

    let batchData = "";
    /**
    If the system is running a "vanilla client" (i.e., a basic, unmodified Ethereum client or rollup setup), the genesis block should include the deployment of the sovereign contracts, and these contracts should already be initialized with their required initial state and configurations. This means that the genesis block will contain the initial state for these contracts, allowing the system to start running without needing any additional initialization steps. However, for other rollups, additional configuration is needed. In this case, instead of having everything pre-initialized in the genesis block, we must inject an "initialization batch" into the genesis file. This batch will contain specific instructions for initializing the contracts at the time of rollup deployment. The injected initialization batch allows the system to be configured dynamically during deployment.
     */
    if (isVanillaClient) {
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
            const wethObject = genesis.genesis.find(function (obj) {
                return obj.contractName == "WETH";
            });
            outputJson.WETHAddress = wethObject.address;
        }
    } else {
        if (consensusContract === "PolygonPessimisticConsensus") {
            // Add the first batch of the created rollup
            const newZKEVMContract = (await PolygonconsensusFactory.attach(
                newZKEVMAddress
            )) as PolygonPessimisticConsensus;

            // Get last GER
            const lastGER = await globalExitRootManagerContract.getLastGlobalExitRoot();

            const dataInjectedTx = await polygonZkEVMBridgeContract.interface.encodeFunctionData("initialize", [
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
                to: await newZKEVMContract.bridgeAddress(),
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
            batchData = {
                batchL2Data: customData,
                globalExitRoot: lastGER,
                timestamp: blockDeploymentRollup.timestamp,
                sequencer: trustedSequencer,
                l1BlockNumber: blockDeploymentRollup.number,
                l1BlockHash: blockDeploymentRollup.hash,
                l1ParentHash: blockDeploymentRollup.parentHash,
            };
        } else {
            // Add the first batch of the created rollup
            const newZKEVMContract = (await PolygonconsensusFactory.attach(newZKEVMAddress)) as PolygonZkEVMEtrog;
            batchData = {
                batchL2Data: await newZKEVMContract.generateInitializeTransaction(
                    rollupID,
                    gasTokenAddress,
                    gasTokenNetwork,
                    gasTokenMetadata as any
                ),
                globalExitRoot: globalExitRoot,
                timestamp: timestampReceipt,
                sequencer: trustedSequencer,
            };
        }
    }
    outputJson.firstBatchData = batchData;
    outputJson.genesis = genesis.root;
    outputJson.createRollupBlockNumber = blockDeploymentRollup.number;
    outputJson.rollupAddress = newZKEVMAddress;
    outputJson.verifierAddress = verifierContract.target;
    outputJson.consensusContract = consensusContract;
    outputJson.consensusContractAddress = PolygonconsensusContract.target;
    outputJson.rollupTypeId = newRollupTypeID;
    outputJson.programVKey = programVKey;

    // Rewrite updated genesis in case of vanilla client
    if (isVanillaClient) {
        fs.writeFileSync(pathGenesisSovereign, JSON.stringify(genesis, null, 1));
    }
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
