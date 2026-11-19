/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { AgglayerManager, PolygonRollupManagerPreviousV1toV2 } from '../../typechain-types';
import getRollupParams from './rollupDataParams.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const pathCreateRollupOutput = path.join(__dirname, './create_rollup_output');

async function main() {
    const RollupManagerFactory = await ethers.getContractFactory('PolygonRollupManagerPreviousV1toV2');

    const rollupManager = (await RollupManagerFactory.attach(
        getRollupParams.polygonRollupManagerAddress,
    )) as PolygonRollupManagerPreviousV1toV2;

    const polygonZkEVMBridgeAddress = await rollupManager.bridgeAddress();
    const polygonZkEVMGlobalExitRootAddress = await rollupManager.globalExitRootManager();
    const polTokenAddress = await rollupManager.pol();
    // Initialized event (previous PolygonRollupManagerPreviousV1toV2 ABI): rollup manager
    // deployment block. In production environments this event will always be the same.
    const filterInit = rollupManager.filters.Initialized(undefined);
    const eventsInit = await rollupManager.queryFilter(filterInit, 0, 'latest');
    const deploymentRollupManagerBlockNumber = eventsInit[0].blockNumber;

    // AddExistingRollup event (previous PolygonRollupManagerPreviousV1toV2 ABI, topic
    // 0xadfc7d56f7e39b08b321534f14bfb135ad27698f7d2f5ad0edc2356ea9a3f850): ULxLy migration block.
    // In production environments this event will always be the same.
    const filter = rollupManager.filters.AddExistingRollup(1);
    const eventsAddRollup = await rollupManager.queryFilter(filter, 0, 'latest');
    let upgradeToULxLyBlockNumber;
    if (eventsAddRollup.length > 0) {
        upgradeToULxLyBlockNumber = eventsAddRollup[0].blockNumber;
    } else {
        console.log('No event AddExistingRollup');
        upgradeToULxLyBlockNumber = eventsInit[0].blockNumber;
    }

    const deployOutput = {
        polygonRollupManagerAddress: rollupManager.target,
        polygonZkEVMBridgeAddress,
        polygonZkEVMGlobalExitRootAddress,
        polTokenAddress,
        deploymentRollupManagerBlockNumber,
        upgradeToULxLyBlockNumber,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(deployOutput, null, 1));

    // CreateNewRollup event (previous PolygonRollupManagerPreviousV1toV2 ABI): data of the
    // created rollup. The event signature has not changed across AgglayerManager versions.
    const filter2 = rollupManager.filters.CreateNewRollup(
        getRollupParams.rollupID,
        undefined,
        undefined,
        undefined,
        undefined,
    );
    const eventsCreateNewRollup = await rollupManager.queryFilter(filter2, 0, 'latest');

    if (eventsCreateNewRollup.length > 0) {
        const { rollupID, rollupAddress, chainID, gasTokenAddress, rollupTypeID } = eventsCreateNewRollup[0].args;

        // AddNewRollupType: try the newest AgglayerManager ABI first; if it errors or finds no
        // matching event, fall back to the previous PolygonRollupManagerPreviousV1toV2 ABI.
        let genesis;
        let description;
        try {
            const NewestRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
            const newestRollupManager = (await NewestRollupManagerFactory.attach(
                getRollupParams.polygonRollupManagerAddress,
            )) as AgglayerManager;

            const filter3 = newestRollupManager.filters.AddNewRollupType(
                rollupTypeID,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
            );
            const eventsAddRollupType = await newestRollupManager.queryFilter(filter3, 0, 'latest');
            if (eventsAddRollupType.length === 0) {
                throw new Error('No AddNewRollupType event found with the newest ABI');
            }
            ({ genesis, description } = eventsAddRollupType[0].args);
        } catch (e) {
            console.log('AddNewRollupType: newest ABI failed, retrying with the previous version', e);
            const filter3 = rollupManager.filters.AddNewRollupType(
                rollupTypeID,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
            );
            const eventsAddRollupType = await rollupManager.queryFilter(filter3, 0, 'latest');
            ({ genesis, description } = eventsAddRollupType[0].args);
        }

        // Add the first batch of the created rollup
        const outputCreateRollup = {} as any;
        outputCreateRollup.genesis = genesis;
        outputCreateRollup.createRollupBlockNumber = eventsCreateNewRollup[0].blockNumber;
        outputCreateRollup.rollupAddress = rollupAddress;
        outputCreateRollup.consensusContract = description;
        outputCreateRollup.rollupID = Number(rollupID);
        outputCreateRollup.L2ChainID = Number(chainID);
        outputCreateRollup.gasTokenAddress = gasTokenAddress;

        await fs.writeFileSync(
            `${pathCreateRollupOutput}_${rollupID}.json`,
            JSON.stringify(outputCreateRollup, null, 1),
        );
    } else {
        console.log('No event CreateNewRollup');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
