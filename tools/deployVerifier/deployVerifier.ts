/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
import utils from "../utils";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, upgrades} from "hardhat";
const deployParameters = require("./deploy_verifier_parameters.json");
const pathOutput = path.resolve(__dirname, "./deploy_verifier_output.json");

async function main() {
    // Load provider
    const currentProvider = utils.loadProvider(deployParameters);

    // Load deployer
    const deployer = utils.loadDeployer(deployParameters, currentProvider);
    console.log("deploying with: ", deployer.address);

    console.log("--> Deploying with: ", deployer.address);

    /*
     * Deployment Verifier
     */
    const verifierName = `FflonkVerifier_${deployParameters.forkID}`;
    let verifierContract;
    if (deployParameters.realVerifier === true) {
        const VerifierRollup = await ethers.getContractFactory(verifierName, deployer);
        console.log(`--> Deploying verifier: ${verifierName}`);
        verifierContract = await VerifierRollup.deploy();
        await verifierContract.waitForDeployment();
    } else {
        const VerifierRollupHelperFactory = await ethers.getContractFactory("VerifierRollupHelperMock", deployer);
        console.log("Deploying verifier VerifierRollupHelperMock");
        verifierContract = await VerifierRollupHelperFactory.deploy();
        await verifierContract.waitForDeployment();
    }
    const outputJson = {
        deployer: deployer.address,
        verifier: verifierName,
        verifierContract: verifierContract.target,
    };
    // print contract address deployed
    console.log("\n#######################");
    console.log("Verifier deployed to:", verifierContract.target);
    console.log("#######################\n");
    // print verification command line
    console.log("#######################");
    console.log("you can verify the new verifierContract address with the following command:");
    console.log(`npx hardhat verify ${verifierContract.target} --network ${process.env.HARDHAT_NETWORK}`);
    console.log("#######################");

    await fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
