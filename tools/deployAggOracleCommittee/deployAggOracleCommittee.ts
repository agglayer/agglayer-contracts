/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */

import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters, getGitInfo } from '../../src/utils';
import { verifyContractEtherscan } from '../../upgrade/utils';
import { AggOracleCommittee } from '../../typechain-types';
import deployParameters from './deploy_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pathOutput = path.join(__dirname, `./deploy_output.json`);

async function main() {
    const mandatoryUpgradeParameters = [
        'globalExitRootManagerL2SovereignAddress',
        'ownerAddress',
        'proposerAddress',
        'validators',
        'threshold',
    ];
    checkParams(deployParameters, mandatoryUpgradeParameters);
    const { globalExitRootManagerL2SovereignAddress, ownerAddress, proposerAddress, validators, threshold } =
        deployParameters;

    // Check zero address for globalExitRootManagerL2Sovereign
    if (globalExitRootManagerL2SovereignAddress === ethers.ZeroAddress) {
        throw new Error('globalExitRootManagerL2SovereignAddress cannot be zero address');
    }

    // Check owner and proposer
    for (const [name, value] of Object.entries({ ownerAddress, proposerAddress })) {
        if (!ethers.isAddress(value) || value === ethers.ZeroAddress) {
            throw new Error(`${name} must be a valid non-zero address`);
        }
    }

    // Check validators: valid non-zero addresses, no duplicates and a string url (can be empty)
    if (!Array.isArray(validators) || validators.length === 0 || validators.length > 255) {
        throw new Error('validators must be an array with between 1 and 255 validators');
    }
    const seenValidators = {};
    for (const validator of validators) {
        if (!ethers.isAddress(validator.addr) || validator.addr === ethers.ZeroAddress) {
            throw new Error(`validator ${validator.addr}: not a valid non-zero address`);
        }
        if (seenValidators[validator.addr.toLowerCase()] !== undefined) {
            throw new Error(`validator ${validator.addr}: duplicated address`);
        }
        seenValidators[validator.addr.toLowerCase()] = true;
        if (typeof validator.url !== 'string') {
            throw new Error(`validator ${validator.addr}: url must be a string (it can be empty)`);
        }
    }

    // Check threshold: 1 <= threshold <= validators
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > validators.length) {
        throw new Error(`threshold must be an integer between 1 and the number of validators (${validators.length})`);
    }

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);
    console.log('deploying with: ', deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();
    const proxyAdminOwnerAddress = await proxyAdmin.owner();

    /*
     * Deployment of AggOracleCommittee
     */
    const aggOracleCommitteeFactory = await ethers.getContractFactory('AggOracleCommittee', deployer);
    const aggOracleCommitteeContract = await upgrades.deployProxy(
        aggOracleCommitteeFactory,
        [ownerAddress, proposerAddress, validators, threshold],
        {
            constructorArgs: [globalExitRootManagerL2SovereignAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        },
    );
    await aggOracleCommitteeContract.waitForDeployment();

    console.log('#######################\n');
    console.log('aggOracleCommitteeContract deployed to:', aggOracleCommitteeContract.target);
    console.log('#######################\n\n');

    expect(await upgrades.erc1967.getAdminAddress(aggOracleCommitteeContract.target as string)).to.be.equal(
        proxyAdmin.target,
    );

    await verifyContractEtherscan(aggOracleCommitteeContract.target as string, [
        globalExitRootManagerL2SovereignAddress,
    ]);

    // Check deployment
    const aggOracleCommittee = aggOracleCommitteeFactory.attach(
        aggOracleCommitteeContract.target,
    ) as AggOracleCommittee;
    // Check already initialized
    await expect(
        aggOracleCommittee.initialize(ownerAddress, proposerAddress, validators, threshold),
    ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidInitialization');

    // Check initializer params
    // Check owner
    const contractOwner = await aggOracleCommittee.owner();
    expect(contractOwner).to.be.equal(ownerAddress);

    // Check no pending owner
    expect(await aggOracleCommittee.pendingOwner()).to.be.equal(ethers.ZeroAddress);

    // Check proposer
    expect(await aggOracleCommittee.proposer()).to.be.equal(proposerAddress);

    // Check threshold
    const contractThreshold = await aggOracleCommittee.threshold();
    expect(contractThreshold).to.be.equal(BigInt(threshold));

    // Check validators
    const contractValidators = await aggOracleCommittee.getValidatorsInfo();
    expect(contractValidators.length).to.be.equal(validators.length);
    for (let i = 0; i < validators.length; i++) {
        expect(contractValidators[i].addr).to.be.equal(ethers.getAddress(validators[i].addr));
        expect(contractValidators[i].url).to.be.equal(validators[i].url);
        expect(await aggOracleCommittee.isValidator(validators[i].addr)).to.be.equal(true);
    }

    // Check agglayerGERL2
    const contractAgglayerGERL2 = await aggOracleCommittee.agglayerGERL2();
    expect(contractAgglayerGERL2).to.be.equal(globalExitRootManagerL2SovereignAddress);

    // Check validators count
    const validatorsCount = await aggOracleCommittee.getValidatorsCount();
    expect(validatorsCount).to.be.equal(BigInt(validators.length));

    // Compute output
    const outputJson = {
        gitInfo: getGitInfo(),
        aggOracleCommitteeAddress: aggOracleCommitteeContract.target,
        deployer: deployer.address,
        proxyAdminAddress: proxyAdmin.target,
        proxyAdminOwnerAddress,
        aggOracleOwnerAddress: ownerAddress,
        globalExitRootManagerL2SovereignAddress,
        proposerAddress,
        validators,
        threshold,
    };

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
    console.log('Finished deploying AggOracleCommittee');
    console.log('Output saved to: ', pathOutput);
    console.log('#######################\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
