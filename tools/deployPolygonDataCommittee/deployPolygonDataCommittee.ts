/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
import utils from "../utils";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, upgrades} from "hardhat";
const deployParameters = require("./deploy_dataCommittee_parameters.json");
const pathOZUpgradability = path.join(__dirname, `../../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);
const pathOutput = path.join(__dirname, `./deploy_dataCommittee_output.json`);

async function main() {
    const outputJson = {} as any;

    const attemptsDeployProxy = 20;

    // Check that there's no previous OZ deployment
    if (fs.existsSync(pathOZUpgradability)) {
        throw new Error(
            `There's upgradability information from previous deployments, it's mandatory to erase them before start a new one, path: ${pathOZUpgradability}`
        );
    }

    // Load provider
    const currentProvider = utils.loadProvider(deployParameters);

    // Load deployer
    const deployer = utils.loadDeployer(deployParameters, currentProvider);
    console.log("deploying with: ", deployer.address);

    /*
     *Deployment pol
     */
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

    console.log("#######################\n");
    console.log("PolygonDataCommittee deployed to:", polygonDataCommittee?.target);
    console.log("#######################\n");
    console.log("polygonDataCommittee deployed to:", polygonDataCommittee?.target);
    console.log("you can verify the new polygonDataCommittee address with:");
    console.log(`npx hardhat verify ${polygonDataCommittee?.target} --network ${process.env.HARDHAT_NETWORK}\n`);

    // tranfer ownership of the contract, and the proxy
    const proxyAdmin = await upgrades.admin.getInstance(); //await upgrades.erc1967.getAdminAddress(polygonDataCommittee.target);
    await (await proxyAdmin.transferOwnership(deployParameters.admin)).wait();
    await (await polygonDataCommittee?.transferOwnership(deployParameters.admin)).wait();

    outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    outputJson.proxyAdmin = proxyAdmin.target;

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
