/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { time, reset, setBalance, mine } from '@nomicfoundation/hardhat-network-helpers';
import {
    PolygonRollupManager,
    PolygonZkEVMTimelock,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMGlobalExitRootV2,
    AggLayerGateway,
} from '../../typechain-types';

import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';

import upgradeParams from './upgrade_parameters.json';
// import upgradeOutput from './upgrade_output.json'; // This will be generated after running the upgrade script

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Should shadow fork network, execute upgrade and validate Upgrade V12', () => {
    it('Should shadow fork network, execute upgrade and validate Upgrade V12', async () => {
        // Define expected versions for each contract after upgrade
        const ROLLUP_MANAGER_VERSION = 'v1.0.0';
        const AGGLAYER_GATEWAY_VERSION = 'v1.1.0';
        const BRIDGE_VERSION = 'v1.1.0';
        const GER_VERSION = 'v1.0.0';

        const mandatoryParameters = ['rollupManagerAddress', 'initializeAgglayerGateway'];
        checkParams(upgradeParams, mandatoryParameters);

        // Load upgrade output
        const upgradeOutput = require('./upgrade_output.json');

        if (!['mainnet', 'sepolia'].includes(upgradeParams.forkParams.network)) {
            throw new Error('Invalid network');
        }

        // hard fork
        const rpc =
            typeof upgradeParams.forkParams.rpc === 'undefined'
                ? `https://${upgradeParams.forkParams.network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
                : upgradeParams.forkParams.rpc;
        logger.info(`Shadow forking ${rpc}`);
        await reset(rpc, upgradeOutput.implementationDeployBlockNumber + 1);
        await mine();
        const forkedBlock = await ethers.provider.getBlockNumber();
        // If forked block is lower than implementation deploy block, wait until it is reached
        while (forkedBlock <= upgradeOutput.implementationDeployBlockNumber) {
            logger.info(
                `Forked block is ${forkedBlock}, waiting until ${upgradeOutput.implementationDeployBlockNumber}, wait 1 minute...`,
            );
            await new Promise((r) => {
                setTimeout(r, 60000);
            });
            logger.info('Retrying fork...');
            await reset(rpc);
        }
        logger.info('Shadow fork Succeed!');

        // Get contracts before upgrade
        const rollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager');
        const rollupManagerContract = rollupManagerFactory.attach(
            upgradeParams.rollupManagerAddress,
        ) as PolygonRollupManager;

        // Get addresses from rollupManager contract
        const bridgeV2Address = await rollupManagerContract.bridgeAddress();
        const globalExitRootV2Address = await rollupManagerContract.globalExitRootManager();

        // Get aggLayerGateway address from rollupManager
        let aggLayerGatewayAddress;
        try {
            aggLayerGatewayAddress = await rollupManagerContract.aggLayerGateway();
        } catch (error) {
            logger.error('Could not get aggLayerGateway address from rollupManager');
            throw error;
        }

        logger.info(`Addresses obtained from rollupManager for testing:`);
        logger.info(`- Bridge V2: ${bridgeV2Address}`);
        logger.info(`- Global Exit Root V2: ${globalExitRootV2Address}`);
        logger.info(`- AggLayer Gateway: ${aggLayerGatewayAddress}`);

        const aggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway');
        const aggLayerGatewayContract = aggLayerGatewayFactory.attach(
            aggLayerGatewayAddress,
        ) as AggLayerGateway;

        const bridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        const bridgeContract = bridgeFactory.attach(
            bridgeV2Address,
        ) as PolygonZkEVMBridgeV2;

        const gerFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2');
        const gerContract = gerFactory.attach(
            globalExitRootV2Address,
        ) as PolygonZkEVMGlobalExitRootV2;

        // Get admin address from rollup manager, should be a timelock and add balance
        const adminRoleFilter = rollupManagerContract.filters.RoleGranted(ethers.ZeroHash);
        const adminRoleEvents = await rollupManagerContract.queryFilter(adminRoleFilter, 0, 'latest');
        if (adminRoleEvents.length === 0) {
            throw new Error('No admin role granted');
        }
        const adminRoleAddress = adminRoleEvents[0].args.account;
        logger.info(`Default Admin rollup manager role address: ${adminRoleAddress}`);
        // Expect upgrade param timelock address to equal admin role address
        expect(upgradeOutput.timelockContractAddress).to.be.equal(adminRoleAddress);
        logger.info('✓ admin role is same as upgrade output file timelock address');

        // Get timelock admin role
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const timelockContract = (await timelockContractFactory.attach(adminRoleAddress)) as PolygonZkEVMTimelock;
        const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
        const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
        let proposerRoleAddress = (upgradeParams as any).timelockAdminAddress;
        if (typeof proposerRoleAddress === 'undefined') {
            // Try retrieve timelock admin address from events
            const proposerRoleFilter = timelockContract.filters.RoleGranted(PROPOSER_ROLE);
            // Increase provider timeout for query filter call
            const proposerRoleEvents = await timelockContract.queryFilter(proposerRoleFilter, 0, 'latest');
            if (proposerRoleEvents.length === 0) {
                throw new Error('No proposer role granted for timelock');
            }
            proposerRoleAddress = proposerRoleEvents[0].args.account;
        }
        const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, proposerRoleAddress);
        const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, proposerRoleAddress);
        if (!hasProposerRole || !hasExecutorRole) {
            throw new Error('Timelock admin address does not have proposer and executor role');
        }

        logger.info(`Proposer/executor timelock role address: ${proposerRoleAddress}`);
        await ethers.provider.send('hardhat_impersonateAccount', [proposerRoleAddress]);
        const proposerRoleSigner = await ethers.getSigner(proposerRoleAddress as any);
        await setBalance(proposerRoleAddress, 100n ** 18n);
        logger.info(`✓ Funded proposer account ${proposerRoleAddress}`);

        // Get current contract params to compare after upgrade

        // 1. Rollup Manager prev params
        const rollupManagerVersion = await rollupManagerContract.ROLLUP_MANAGER_VERSION();
        const calculateRewardPerBatch = await rollupManagerContract.calculateRewardPerBatch();
        const batchFee = await rollupManagerContract.getBatchFee();
        const forcedBatchFee = await rollupManagerContract.getForcedBatchFee();
        const isEmergencyState = await rollupManagerContract.isEmergencyState();
        const lastAggregationTimestamp = await rollupManagerContract.lastAggregationTimestamp();
        const lastDeactivatedEmergencyStateTimestamp =
            await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp();
        const pol = await rollupManagerContract.pol();
        const rollupCount = await rollupManagerContract.rollupCount();
        const rollupTypeCount = await rollupManagerContract.rollupTypeCount();
        const totalSequencedBatches = await rollupManagerContract.totalSequencedBatches();
        const totalVerifiedBatches = await rollupManagerContract.totalVerifiedBatches();
        const bridgeAddress = await rollupManagerContract.bridgeAddress();
        const globalExitRootManager = await rollupManagerContract.globalExitRootManager();

        logger.info(`✓ Captured Rollup Manager params - Version: ${rollupManagerVersion}`);

        // 3. Bridge prev params
        const bridgeVersion = await bridgeContract.BRIDGE_VERSION();
        const bridgeGlobalExitRootManager = await bridgeContract.globalExitRootManager();
        const bridgeLastUpdatedDepositCount = await bridgeContract.lastUpdatedDepositCount();
        const bridgeRollupManager = await bridgeContract.polygonRollupManager();
        const bridgeGasTokenAddress = await bridgeContract.gasTokenAddress();
        const bridgeGasTokenNetwork = await bridgeContract.gasTokenNetwork();
        const bridgeGasTokenMetadata = await bridgeContract.gasTokenMetadata();

        logger.info(`✓ Captured Bridge params - Version: ${bridgeVersion}`);

        // 4. GER prev params
        const gerVersion = await gerContract.GER_VERSION();
        const gerBridgeAddress = await gerContract.bridgeAddress();
        const gerRollupManager = await gerContract.rollupManager();

        logger.info(`✓ Captured Global Exit Root params - Version: ${gerVersion}`);

        // Send schedule transaction
        const txScheduleUpgrade = {
            to: upgradeOutput.timelockContractAddress,
            data: upgradeOutput.scheduleData,
        };
        await (await proposerRoleSigner.sendTransaction(txScheduleUpgrade)).wait();
        logger.info('✓ Sent schedule transaction');

        // Increase time to bypass the timelock delay
        const timelockDelay = upgradeOutput.decodedScheduleData.delay;
        await time.increase(Number(timelockDelay));
        logger.info(`✓ Increase time ${timelockDelay} seconds to bypass timelock delay`);

        // Send execute transaction
        const txExecuteUpgrade = {
            to: upgradeOutput.timelockContractAddress,
            data: upgradeOutput.executeData,
        };
        await (await proposerRoleSigner.sendTransaction(txExecuteUpgrade)).wait();
        logger.info(`✓ Sent execute transaction`);

        // Validate all contracts after upgrade

        // 1. Check rollup manager contract
        expect(await rollupManagerContract.version()).to.equal(ROLLUP_MANAGER_VERSION);
        expect(await rollupManagerContract.bridgeAddress()).to.equal(bridgeAddress);
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.equal(calculateRewardPerBatch);
        expect(await rollupManagerContract.getBatchFee()).to.equal(batchFee);
        expect(await rollupManagerContract.getForcedBatchFee()).to.equal(forcedBatchFee);
        expect(await rollupManagerContract.globalExitRootManager()).to.equal(globalExitRootManager);
        expect(await rollupManagerContract.isEmergencyState()).to.equal(isEmergencyState);
        expect(await rollupManagerContract.lastAggregationTimestamp()).to.equal(lastAggregationTimestamp);
        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.equal(
            lastDeactivatedEmergencyStateTimestamp,
        );
        expect(await rollupManagerContract.pol()).to.equal(pol);
        expect(await rollupManagerContract.rollupCount()).to.equal(rollupCount);
        expect(await rollupManagerContract.rollupTypeCount()).to.equal(rollupTypeCount);
        expect(await rollupManagerContract.totalSequencedBatches()).to.equal(totalSequencedBatches);
        expect(await rollupManagerContract.totalVerifiedBatches()).to.equal(totalVerifiedBatches);
        logger.info(`✓ Checked rollup manager contract storage parameters and new version: ${ROLLUP_MANAGER_VERSION}`);

        // 2. Check AggLayer Gateway contract
        expect(await aggLayerGatewayContract.version()).to.equal(AGGLAYER_GATEWAY_VERSION);

        // Check AggLayer Gateway initialization parameters
        const expectedSigners = upgradeParams.initializeAgglayerGateway.signersToAdd;
        const expectedThreshold = upgradeParams.initializeAgglayerGateway.newThreshold;
        const expectedMultisigRole = upgradeParams.initializeAgglayerGateway.multisigRole;

        // Verify signers were added correctly
        const actualSigners = await aggLayerGatewayContract.getAggchainSigners();
        expect(actualSigners.length).to.equal(expectedSigners.length);

        for (let i = 0; i < expectedSigners.length; i++) {
            expect(actualSigners).to.include(expectedSigners[i].addr);
            const signerUrl = await aggLayerGatewayContract.signerToURLs(expectedSigners[i].addr);
            expect(signerUrl).to.equal(expectedSigners[i].url);
        }

        // Verify threshold was set correctly
        const actualThreshold = await aggLayerGatewayContract.threshold();
        expect(actualThreshold).to.equal(expectedThreshold);

        // Verify multisig role was granted correctly
        const AL_MULTISIG_ROLE = ethers.id('AL_MULTISIG_ROLE');
        const hasMultisigRole = await aggLayerGatewayContract.hasRole(AL_MULTISIG_ROLE, expectedMultisigRole);
        expect(hasMultisigRole).to.be.true;

        // Verify AggLayer Gateway multisig hash was set (indicates successful initialization)
        const aggchainMultisigHash = await aggLayerGatewayContract.getAggchainMultisigHash();
        expect(aggchainMultisigHash).to.not.equal(ethers.ZeroHash);
        logger.info(`✓ AggLayer Gateway correctly initialized with multisig hash: ${aggchainMultisigHash}`);

        logger.info(`✓ Checked AggLayer Gateway contract storage parameters, initialization params and new version: ${AGGLAYER_GATEWAY_VERSION}`);

        // 3. Check bridge contract
        expect(await bridgeContract.version()).to.equal(BRIDGE_VERSION);
        expect(await bridgeContract.globalExitRootManager()).to.equal(bridgeGlobalExitRootManager);
        expect(await bridgeContract.lastUpdatedDepositCount()).to.equal(bridgeLastUpdatedDepositCount);
        expect(await bridgeContract.polygonRollupManager()).to.equal(bridgeRollupManager);
        expect(await bridgeContract.gasTokenAddress()).to.equal(bridgeGasTokenAddress);
        expect(await bridgeContract.gasTokenNetwork()).to.equal(bridgeGasTokenNetwork);
        expect(await bridgeContract.gasTokenMetadata()).to.equal(bridgeGasTokenMetadata);
        expect(await bridgeContract.getProxiedTokensManager()).to.equal(upgradeOutput.timelockContractAddress);
        expect(await bridgeContract.getWrappedTokenBridgeImplementation()).to.equal(
            upgradeOutput.deployedContracts.wrappedTokenBridgeImplementation,
        );
        expect(await bridgeContract.wrappedTokenBytecodeStorer()).to.equal(
            upgradeOutput.deployedContracts.wrappedTokenBytecodeStorer,
        );
        expect(await bridgeContract.bridgeLib()).to.equal(
            upgradeOutput.deployedContracts.bridgeLib,
        );
        logger.info(`✓ Checked bridge contract storage parameters and new version: ${BRIDGE_VERSION}`);

        // 4. Check Global Exit Root contract
        expect(await gerContract.version()).to.equal(GER_VERSION);
        expect(await gerContract.bridgeAddress()).to.equal(gerBridgeAddress);
        expect(await gerContract.rollupManager()).to.equal(gerRollupManager);
        logger.info(`✓ Checked global exit root contract storage parameters and new version: ${GER_VERSION}`);

        // Validate that all contracts cannot be re-initialized
        await expect(
            rollupManagerContract.initialize(),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        await expect(
            bridgeContract['initialize()'](),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        logger.info(`✓ Verified contracts cannot be re-initialized`);

        logger.info('✅ Finished shadow fork upgrade test successfully! All 4 contracts upgraded and validated.');
    }).timeout(0);
});
