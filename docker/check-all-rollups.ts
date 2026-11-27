import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { AggchainFEP, AggchainECDSA } from '../typechain-types';

const deployOutput = JSON.parse(fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'));
const { polygonRollupManagerAddress, polygonZkEVMBridgeAddress, polygonZkEVMGlobalExitRootAddress, polTokenAddress } =
    deployOutput;
const createRollupOutputFEP = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
);
const createRollupOutputECDSA = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output_v0.3.0-ecdsa.json'), 'utf8'),
);

describe('Docker build tests Contract', () => {
    it('should check AggchainFEP', async () => {
        const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const AggchainFEPContract = AggchainFEPFactory.attach(createRollupOutputFEP.rollupAddress) as AggchainFEP;
        expect(AggchainFEPContract.target).to.equal(createRollupOutputFEP.rollupAddress);
        expect(await AggchainFEPContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await AggchainFEPContract.pol()).to.equal(polTokenAddress);
        expect(await AggchainFEPContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await AggchainFEPContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await AggchainFEPContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });

    it('should check AggchainECDSA', async () => {
        const AggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSA');
        const AggchainECDSAContract = AggchainECDSAFactory.attach(
            createRollupOutputECDSA.rollupAddress,
        ) as AggchainECDSA;
        expect(AggchainECDSAContract.target).to.equal(createRollupOutputECDSA.rollupAddress);
        expect(await AggchainECDSAContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await AggchainECDSAContract.pol()).to.equal(polTokenAddress);
        expect(await AggchainECDSAContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await AggchainECDSAContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await AggchainECDSAContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });
});
