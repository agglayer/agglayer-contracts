/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, upgrades} from "hardhat";
const deployParameters = require("./deploy_verifier_parameters.json");
const pathOutput = path.resolve(__dirname, "./deploy_verifier_output.json")

async function main() {
    // Load provider
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(deployParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(deployParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(deployParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(deployParameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (deployParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(deployParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

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
        verifierContract: verifierContract.target
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
