import { expect } from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { ethers, upgrades } from "hardhat";
const deployParameters = require("./deploy_parameters.json");
const pathOutput = path.join(__dirname, `./deploy_output.json`);
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from "../../src/utils";
import { verifyContractEtherscan, getGitInfo } from "../../upgrade/utils";
import { AggLayerGateway } from "../../typechain-types";

async function main() {

    const mandatoryUpgradeParameters = [
        "defaultAdminAddress",
        "aggchainDefaultVKeyRoleAddress",
        "addRouteRoleAddress",
        "freezeRouteRoleAddress",
        "verifierAddress",
        "ppVKey",
        "ppVKeySelector",
    ];
    checkParams(deployParameters, mandatoryUpgradeParameters);
    const {
        defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
        verifierAddress,
        ppVKey,
        ppVKeySelector
    } = deployParameters;
    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);
    console.log("deploying with: ", deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();
    const proxyOwnerAddress = await proxyAdmin.owner();

    /*
     * Deployment of AggLayerGateway
     */
    const aggLayerGatewayFactory = await ethers.getContractFactory("AggLayerGateway", deployer);
    const aggLayerGatewayContract = await upgrades.deployProxy(aggLayerGatewayFactory, [
        defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
        ppVKeySelector,
        verifierAddress,
        ppVKey,
    ], {
        unsafeAllow: ["constructor"],
    });
    await aggLayerGatewayContract.waitForDeployment();

    console.log("#######################\n");
    console.log("aggLayerGatewayContract deployed to:", aggLayerGatewayContract.target);
    console.log("#######################\n\n");

    expect(await upgrades.erc1967.getAdminAddress(aggLayerGatewayContract.target as string)).to.be.equal(proxyAdmin.target);

    await verifyContractEtherscan(aggLayerGatewayContract.target as string, []);

    // Check deployment
    const aggLayerGateway = aggLayerGatewayFactory.attach(aggLayerGatewayContract.target) as AggLayerGateway;
    // Check already initialized
    await expect(aggLayerGateway.initialize(
        defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
        ppVKeySelector,
        verifierAddress,
        ppVKey
    )).to.be.revertedWithCustomError(aggLayerGatewayContract, "InvalidInitialization");

    // Check initializer params (ROLES)
    const AGGCHAIN_DEFAULT_VKEY_ROLE = ethers.id("AGGCHAIN_DEFAULT_VKEY_ROLE");
    const AL_ADD_PP_ROUTE_ROLE = ethers.id("AL_ADD_PP_ROUTE_ROLE");
    const AL_FREEZE_PP_ROUTE_ROLE = ethers.id("AL_FREEZE_PP_ROUTE_ROLE");
    // Admin role
    expect(await aggLayerGateway.hasRole(ethers.ZeroHash, defaultAdminAddress)).to.be.true;
    // Other roles
    expect(await aggLayerGateway.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainDefaultVKeyRoleAddress)).to.be.true;
    expect(await aggLayerGateway.hasRole(AL_ADD_PP_ROUTE_ROLE, addRouteRoleAddress)).to.be.true;
    expect(await aggLayerGateway.hasRole(AL_FREEZE_PP_ROUTE_ROLE, freezeRouteRoleAddress)).to.be.true;


    // Compute output
    const outputJson = {
        gitInfo: getGitInfo(),
        aggLayerGatewayAddress: aggLayerGatewayContract.target,
        deployer: deployer.address,
        proxyAdminAddress: proxyAdmin.target,
        proxyOwnerAddress: proxyOwnerAddress,
        defaultAdminRoleAddress: defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
        ppVKey,
        ppVKeySelector,
        verifierAddress,
    };

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
    console.log("Finished deploying AggLayerGateway");
    console.log("Output saved to: ", pathOutput);
    console.log("#######################\n");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
