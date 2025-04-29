/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
// external dependencies
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, hardhatArguments} from "hardhat";

// internal dependencies
import {MemDB, ZkEVMDB, getPoseidon, smtUtils} from "@0xpolygonhermez/zkevm-commonjs";
import updateVanillaGenesis from "../../deployment/v2/utils/updateVanillaGenesis";
import { PolygonRollupManager, PolygonZkEVMBridgeV2} from "../../typechain-types";
import "../../deployment/helpers/utils";
import { initializeTimelockStorage } from "../../src/genesis/genesis-helpers";
import { checkParams } from '../../src/utils';
import { logger } from "../../src/logger";
import { formatGenesis, getGitInfo } from "./helpers";
import { checkBridgeAddress } from "../utils";

// script utils
const dateStr = new Date().toISOString();

// read files
const genesisBase = require("./genesis-base.json");
const createGenesisSovereignParams = require("./create-genesis-sovereign-params.json");

async function main() {
    logger.info('Start create-sovereign-genesis tool');

    /////////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /////////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = [
        "rollupManagerAddress",
        "rollupID",
        "chainID",
        "bridgeManager",
        "gasTokenAddress",
        "sovereignWETHAddress",
        "sovereignWETHAddressIsNotMintable",
        "globalExitRootUpdater",
        "globalExitRootRemover",
        "emergencyBridgePauser",
        "setPreMintAccounts",
        "setTimelockParameters",
    ];

    // check global parameters
    checkParams(createGenesisSovereignParams, mandatoryParameters);

    // check preMintedAccounts parameters
    if (createGenesisSovereignParams.setPreMintAccounts === true) {
        if (createGenesisSovereignParams.preMintAccounts === undefined || createGenesisSovereignParams.preMintAccounts === '') {
            logger.error('setPreMintAccounts is set to true but missing parameter preMintAccounts');
            process.exit(1);
        }

        // Check all preMintAccounts parameters
        for (const preMintAccount of createGenesisSovereignParams.preMintAccounts) {
            const paramsPreMintAccount = [
                'balance',
                'address',
            ];

            checkParams(preMintAccount, paramsPreMintAccount);

            if (ethers.isAddress(preMintAccount.address) == false) {
                logger.error(`preMintAccount.address ${preMintAccount.address}: not a valid address`);
                process.exit(1);
            }
        }
    }

    // check timelock parameters
    if (createGenesisSovereignParams.setTimelockParameters === true) {
        if (createGenesisSovereignParams.timelockParameters === undefined || createGenesisSovereignParams.timelockParameters === '') {
            logger.error('setTimelockParameters is set to true but missing parameter timelockParameters');
            process.exit(1);
        }

        const paramsTimelockParameters = [
            'adminAddress',
            'minDelay',
        ];

        checkParams(createGenesisSovereignParams.timelockParameters, paramsTimelockParameters);
    }

    /////////////////////////////////////////////
    ///    CHECK SC PARAMS & ON-CHAIN DATA    ///
    /////////////////////////////////////////////
    logger.info('Check SovereignBridge requirements for its correct initialization');

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        createGenesisSovereignParams.rollupManagerAddress
    ) as PolygonRollupManager;

    // Checks like in bridge contract
    if (
        ethers.isAddress(createGenesisSovereignParams.gasTokenAddress) &&
        createGenesisSovereignParams.gasTokenAddress !== ethers.ZeroAddress &&
        createGenesisSovereignParams.sovereignWETHAddress === ethers.ZeroAddress &&
        createGenesisSovereignParams.sovereignWETHAddressIsNotMintable === true
    ) {
        throw new Error(
            "InvalidSovereignWETHAddressParams: if gasTokenAddress is not 0x0, and sovereignWETHAddress is 0x0, sovereignWETHAddressIsNotMintable must be false"
        );
    }

    if (
        createGenesisSovereignParams.gasTokenAddress === ethers.ZeroAddress &&
        (createGenesisSovereignParams.sovereignWETHAddress !== ethers.ZeroAddress ||
            createGenesisSovereignParams.sovereignWETHAddressIsNotMintable === true)
    ) {
        throw new Error(
            "InvalidSovereignWETHAddressParams: If gasTokenAddress is 0x0, sovereignWETHAddress must be 0x0 and sovereignWETHAddressIsNotMintable must be false"
        );
    }

    // Create output
    const outputJson = {} as any;

    // get token information
    let gasTokenAddress, gasTokenNetwork, gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
    const bridgeContractAddress = await rollupManagerContract.bridgeAddress();
    const rollupBridgeContract = bridgeFactory.attach(bridgeContractAddress) as PolygonZkEVMBridgeV2;

    // check bridge address is the same in genesisBase and on-chain
    checkBridgeAddress(genesisBase, bridgeContractAddress);

    if (
        ethers.isAddress(createGenesisSovereignParams.gasTokenAddress) &&
        createGenesisSovereignParams.gasTokenAddress !== ethers.ZeroAddress
    ) {
        logger.info('Getting data from the gasTokenAddress');
        // Get token metadata
        gasTokenMetadata = await rollupBridgeContract.getTokenMetadata(createGenesisSovereignParams.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes("124e4f545f56414c49445f454e434f44494e47")) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createGenesisSovereignParams.gasTokenAddress}`
            );
        }
        const wrappedData = await rollupBridgeContract.wrappedTokenToTokenInfo(createGenesisSovereignParams.gasTokenAddress);
        if (wrappedData.originNetwork != 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createGenesisSovereignParams.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = "0x";
    }


    ////////////////////////////////////
    ///    FINAL GENESIS CREATION    ///
    ////////////////////////////////////

    // start final genesis creation
    let finalGenesis = genesisBase;

    // initialize sovereign bridge parameters
    const initializeParams = {
        rollupID: createGenesisSovereignParams.rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        polygonRollupManager: ethers.ZeroAddress,
        gasTokenMetadata,
        bridgeManager: createGenesisSovereignParams.bridgeManager,
        sovereignWETHAddress: createGenesisSovereignParams.sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable: createGenesisSovereignParams.sovereignWETHAddressIsNotMintable,
        globalExitRootUpdater: createGenesisSovereignParams.globalExitRootUpdater,
        globalExitRootRemover: createGenesisSovereignParams.globalExitRootRemover,
        emergencyBridgePauser: createGenesisSovereignParams.emergencyBridgePauser,
    };

    logger.info('Update genesis-base to the SovereignContracts');
    finalGenesis = await updateVanillaGenesis(finalGenesis, createGenesisSovereignParams.chainID, initializeParams);

    // Add weth address to deployment output if gas token address is provided and sovereignWETHAddress is not provided
    let outWETHAddress;
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (createGenesisSovereignParams.sovereignWETHAddress === ethers.ZeroAddress ||
            !ethers.isAddress(createGenesisSovereignParams.sovereignWETHAddress))
    ) {
        console.log("Rollup with custom gas token, adding WETH address to deployment output...");
        const wethObject = genesisBase.genesis.find(function (obj: {contractName: string}) {
            return obj.contractName == "WETH";
        });
        outWETHAddress = wethObject.address;
    }

    // set preMintAccounts
    let totalPreMintedAmount = BigInt(0);
    if (createGenesisSovereignParams.setPreMintAccounts === true) {
        logger.info('Add preMintAccounts');

        // iterate over all premintAccounts
        for (let i = 0; i < createGenesisSovereignParams.preMintAccounts.length; i++) {
            const preMintAccount = createGenesisSovereignParams.preMintAccounts[i];

            // check if preMintAccount is in the current genesis
            const preMintAccountExist = finalGenesis.genesis.find(function (obj) {
                return obj.address.toLowerCase() === preMintAccount.address.toLowerCase();
            });

            if (typeof preMintAccountExist !== 'undefined') {
                // check if preMintAccount has code
                if (preMintAccountExist.bytecode !== undefined) {
                    logger.error(`preMintAccount ${preMintAccount.address} code is not empty`);
                    process.exit(1);
                }
                preMintAccountExist.balance = BigInt(preMintAccount.balance).toString();
            } else {
                // add preMintAccount.address & preMintAccount.balance
                finalGenesis.genesis.push({
                    accountName: `preMintAccount_${i}`,
                    balance: BigInt(preMintAccount.balance).toString(),
                    address: preMintAccount.address,
                });
            }

            totalPreMintedAmount += BigInt(preMintAccount.balance);
        }
    }

    // set timelock storage
    if (createGenesisSovereignParams.setTimelockParameters === true) {
        logger.info('Add timelockParameters');
        const timelockContractInfo = finalGenesis.genesis.find(function (obj) {
            return obj.contractName === 'PolygonZkEVMTimelock';
        });

        const storageTimelock = initializeTimelockStorage(
            createGenesisSovereignParams.timelockParameters.minDelay,
            createGenesisSovereignParams.timelockParameters.adminAddress,
            timelockContractInfo.address,
        );

        timelockContractInfo.storage = storageTimelock;
    }

    // regenerate root with the zkEVM root
    const poseidon = await getPoseidon();
    const {F} = poseidon;

    const zkEVMDB = await ZkEVMDB.newZkEVM(
        new MemDB(F),
        poseidon,
        [F.zero, F.zero, F.zero, F.zero],
        [F.zero, F.zero, F.zero, F.zero],
        finalGenesis.genesis,
        null,
        null,
        createGenesisSovereignParams.chainID
    );

    // update genesis root
    finalGenesis.root = smtUtils.h4toString(zkEVMDB.getCurrentStateRoot());

    // extract all [names <--> address] from genesis
    const genesisSCNames = finalGenesis.genesis.reduce((acc: any, obj: any) => {
        if (obj.bytecode !== undefined) {
            acc[obj.contractName] = obj.address;
        }
        return acc;
    }, {});

    // format genesis
    if (createGenesisSovereignParams.formatGenesis !== undefined) {
        logger.info(`Formatting genesis output to: ${createGenesisSovereignParams.formatGenesis}`);
        finalGenesis = formatGenesis(finalGenesis, createGenesisSovereignParams.formatGenesis);
    }

    // get L1 information
    logger.info(`Getting L1 information`);
    const RollupManagerInfo = {} as any;

    const rollupData = await rollupManagerContract.rollupIDToRollupData(createGenesisSovereignParams.rollupID);

    RollupManagerInfo.bridgeAddress = await rollupManagerContract.bridgeAddress();
    RollupManagerInfo.globalExitRootManager = await rollupManagerContract.globalExitRootManager();
    RollupManagerInfo.pol = await rollupManagerContract.pol();
    RollupManagerInfo.rollupData = {
        rollupID: createGenesisSovereignParams.rollupID,
        rollupAddress: rollupData[0],
    }

    // Populate final output
    const gitInfo = getGitInfo();
    outputJson.gitInfo = gitInfo;
    outputJson.network = hardhatArguments.network;
    outputJson.rollupManagerAddress = createGenesisSovereignParams.rollupManagerAddress;
    outputJson.RollupManagerInfo = RollupManagerInfo;
    outputJson.gasTokenAddress = gasTokenAddress;
    outputJson.gasTokenNetwork = gasTokenNetwork;
    outputJson.gasTokenMetadata = gasTokenMetadata;
    outputJson.chainID = createGenesisSovereignParams.chainID;
    outputJson.bridgeManager = createGenesisSovereignParams.bridgeManager;
    outputJson.sovereignWETHAddress = createGenesisSovereignParams.sovereignWETHAddress;
    outputJson.sovereignWETHAddressIsNotMintable = createGenesisSovereignParams.sovereignWETHAddressIsNotMintable;
    outputJson.globalExitRootUpdater = createGenesisSovereignParams.globalExitRootUpdater;
    outputJson.globalExitRootRemover = createGenesisSovereignParams.globalExitRootRemover;
    outputJson.genesisSCNames = genesisSCNames;

    if (createGenesisSovereignParams.setPreMintAccounts === true) {
        outputJson.preMintAccounts = createGenesisSovereignParams.preMintAccounts;
        outputJson.totalPreMintedAmount = totalPreMintedAmount.toString();
    }

    if (createGenesisSovereignParams.setTimelockParameters === true) {
        outputJson.timelockParameters = createGenesisSovereignParams.timelockParameters;
    }

    if (typeof outWETHAddress !== 'undefined') {
        outputJson.WETHAddress = outWETHAddress;
    }

    if (createGenesisSovereignParams.formatGenesis !== undefined) {
        outputJson.formatGenesis = createGenesisSovereignParams.formatGenesis;
    }


    ///////////////////////////////////
    ///      WRITE FINAL FILES      ///
    ///////////////////////////////////
    logger.info('Writing final output files');

    // path output genesis
    const pathOutputGenesisJson = createGenesisSovereignParams.outputGenesisPath
    ? path.join(__dirname, createGenesisSovereignParams.outputGenesisPath)
    : path.join(__dirname, `./genesis-rollupID-${createGenesisSovereignParams.rollupID}__${dateStr}.json`);

    const pathOutputJson = createGenesisSovereignParams.outputPath
    ? path.join(__dirname, createGenesisSovereignParams.outputPath)
    : path.join(__dirname, `./output-rollupID-${createGenesisSovereignParams.rollupID}__${dateStr}.json`);

    // write files
    fs.writeFileSync(pathOutputGenesisJson, JSON.stringify(finalGenesis, null, 1));
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    logger.info("Output saved at:");
    logger.info(`   output genesis: ${pathOutputGenesisJson}`);
    logger.info(`   output info   : ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
