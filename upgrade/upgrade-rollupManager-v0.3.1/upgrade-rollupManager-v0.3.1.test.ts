/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { time, reset, setBalance, mine } from '@nomicfoundation/hardhat-network-helpers';
import { AgglayerManager, PolygonZkEVMTimelock } from '../../typechain-types';

import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';

import upgradeParams from './upgrade_parameters.json';
import upgradeOutput from './upgrade_output.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Should shallow fork network, execute upgrade and validate Upgrade', () => {
    it('Should shallow fork network, execute upgrade and validate Upgrade', async () => {
        const VERSION = 'al-v0.3.1';
        const PREV_VERSION = 'al-v0.3.0';
        const mandatoryParameters = ['rollupManagerAddress'];
        checkParams(upgradeParams, mandatoryParameters);

        // hard fork
        const { rpc } = upgradeParams.forkParams;
        const { rollupManagerAddress } = upgradeParams;
        logger.info(`Shallow forking ${rpc}`);
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
        logger.info('Shallow fork Succeed!');

        // Get proxy admin
        const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(rollupManagerAddress);
        const proxyAdminFactory = await ethers.getContractFactory(
            '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        );
        const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
        // Get proxy admin owner, should be the timelock
        const timelockAddress = await proxyAdmin.owner();
        logger.info(`Bridge proxy owner: ${timelockAddress}`);
        // Expect upgrade param timelock address to equal admin role address
        expect(upgradeOutput.timelockContractAddress).to.be.equal(timelockAddress);
        logger.info('✓ admin role is same as upgrade output file timelock address');

        // Get timelock admin role
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const timelockContract = (await timelockContractFactory.attach(timelockAddress)) as PolygonZkEVMTimelock;
        const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
        const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
        let proposerRoleAddress = upgradeParams.timelockAdminAddress;
        if (typeof proposerRoleAddress === 'undefined') {
            // Try retrieve timelock admin address from events
            const proposerRoleFilter = timelockContract.filters.RoleGranted(PROPOSER_ROLE, null, null);
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

        // Get contract
        const rollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = rollupManagerFactory.attach(rollupManagerAddress) as AgglayerManager;

        // Bridge prev params
        const version = await rollupManagerContract.ROLLUP_MANAGER_VERSION();
        expect(version).to.equal(PREV_VERSION);

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

        // Check bridge contract
        expect(await rollupManagerContract.ROLLUP_MANAGER_VERSION()).to.equal(VERSION);

        // Check can not be reinitialized
        await expect(rollupManagerContract.initialize()).to.be.revertedWith(
            'Initializable: contract is already initialized',
        );
        logger.info(`✓ Checked bridge contract storage parameters`);

        logger.info('Finished shallow fork upgrade test successfully!');
    }).timeout(0);
});
