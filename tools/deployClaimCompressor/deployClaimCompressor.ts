/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers} from "hardhat";
import utils from "../utils";
const deployParameters = require("./deploy_claimCompressor.json");
const pathOutput = path.resolve(__dirname, "./deploy_claim_compressor_output.json");

async function main() {
    // Load provider
    const currentProvider = utils.loadProvider(deployParameters);

    // Load deployer
    const deployer = utils.loadDeployer(deployParameters, currentProvider);
    console.log("deploying with: ", deployer.address);

    /*
     * Deployment pol
     */
    const bridgeAddress = deployParameters.bridgeAddress;
    const networkId = deployParameters.networkId;

    const ClaimCompressor = await ethers.getContractFactory("ClaimCompressor", deployer);
    const ClaimCompressorContract = await ClaimCompressor.deploy(bridgeAddress, networkId);
    await ClaimCompressorContract.waitForDeployment();

    const outputJson = {
        deployer: deployer.address,
        ClaimCompressorContract: ClaimCompressorContract.target,
    };

    console.log("#######################\n");
    console.log("Claim Compressor deployed to:", ClaimCompressorContract.target);
    console.log("#######################\n");

    console.log("you can verify the contract address with:");
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${ClaimCompressorContract.target} --network ${process.env.HARDHAT_NETWORK}\n`
    );
    console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [bridgeAddress, networkId]);

    await fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
