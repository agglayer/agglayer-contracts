import { expect } from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { ethers, upgrades } from "hardhat";
const deployParameters = require("./deploy_parameters.json");
const pathOutput = path.join(__dirname, `./deploy_output.json`);
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from "../../../src/utils";
import { verifyContractEtherscan } from "../../../upgrade/utils";
import { AggLayerGateway } from "../../../typechain-types";

async function main() {

    const mandatoryUpgradeParameters = ["defaultAdminAddress",
        "aggchainDefaultVKeyRoleAddress",
        "addRouteRoleAddress",
        "freezeRouteRoleAddress"];
    checkParams(deployParameters, mandatoryUpgradeParameters);
    const { defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress } = deployParameters;
    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);
    console.log("deploying with: ", deployer.address);

    /*
     * Deployment of AggLayerGateway
     */
    const aggLayerGatewayFactory = await ethers.getContractFactory("AggLayerGateway", deployer);

    const aggLayerGatewayContract = await upgrades.deployProxy(aggLayerGatewayFactory, [defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress], {
        unsafeAllow: ["constructor"],
    });
    await aggLayerGatewayContract.waitForDeployment();

    console.log("#######################\n");
    console.log("aggLayerGatewayContract deployed to:", aggLayerGatewayContract.target);
    console.log("#######################\n");
    await verifyContractEtherscan(aggLayerGatewayContract.target as string, [defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress]);

    // Check deployment
    const aggLayerGateway = aggLayerGatewayFactory.attach(aggLayerGatewayContract.target) as AggLayerGateway;
    // Check already initialized
    await expect(aggLayerGateway.initialize(defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress)).to.be.revertedWith("Initializable: contract is already initialized");

    // Check initializer params (ROLES)
    const AGGCHAIN_DEFAULT_VKEY_ROLE = ethers.id("AGGCHAIN_DEFAULT_VKEY_ROLE");
    const AGGLAYER_ADD_ROUTE_ROLE = ethers.id("AGGLAYER_ADD_ROUTE_ROLE");
    const AGGLAYER_FREEZE_ROUTE_ROLE = ethers.id("AGGLAYER_FREEZE_ROUTE_ROLE");
    // Admin role
    expect(await aggLayerGateway.hasRole(ethers.ZeroHash, defaultAdminAddress)).to.be.true;
    // Other roles
    expect(await aggLayerGateway.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainDefaultVKeyRoleAddress)).to.be.true;
    expect(await aggLayerGateway.hasRole(AGGLAYER_ADD_ROUTE_ROLE, addRouteRoleAddress)).to.be.true;
    expect(await aggLayerGateway.hasRole(AGGLAYER_FREEZE_ROUTE_ROLE, freezeRouteRoleAddress)).to.be.true;

    // Check proxy owner is deployer
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(aggLayerGatewayContract.target as string);
    const proxyAdminFactory = await ethers.getContractFactory(
        "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin"
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const proxyOwnerAddress = await proxyAdmin.owner();

    // Compute output
    const outputJson = {
        aggLayerGatewayAddress: aggLayerGatewayContract.target,
        deployer: deployer.address,
        proxyAdminAddress: proxyAdminAddress,
        proxyOwnerAddress,
        defaultAdminRoleAddress: defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
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
