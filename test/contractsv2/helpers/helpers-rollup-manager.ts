import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AgglayerManagerMock } from '../../../typechain-types';

const UNSAFE_ALLOW: any[] = [
    'constructor',
    'missing-initializer',
    'missing-initializer-call',
    'state-variable-immutable',
];

/**
 * Deploys the archived v12 AgglayerManager (last version able to create, sequence and verify StateTransition rollups)
 * behind a proxy, so StateTransition state can be built before upgrading to the current AgglayerManager
 * @param constructorArgs [globalExitRootManager, pol, bridge, aggLayerGateway]
 */
export async function deployRollupManagerV12(constructorArgs: any[]) {
    const factory = await ethers.getContractFactory('AgglayerManagerV12Mock');
    const rollupManager = (await upgrades.deployProxy(factory, [], {
        initializer: false,
        constructorArgs,
        unsafeAllow: UNSAFE_ALLOW,
    })) as any;
    await rollupManager.waitForDeployment();
    return rollupManager;
}

/**
 * Upgrades an AgglayerManager proxy to the current AgglayerManagerMock implementation and calls `initialize`
 * @param proxyAddress AgglayerManager proxy address
 * @param constructorArgs [globalExitRootManager, pol, bridge, aggLayerGateway]
 */
export async function upgradeToCurrentRollupManager(proxyAddress: any, constructorArgs: any[]) {
    const factory = await ethers.getContractFactory('AgglayerManagerMock');
    const rollupManager = (await upgrades.upgradeProxy(proxyAddress, factory, {
        constructorArgs,
        unsafeAllow: UNSAFE_ALLOW,
        unsafeAllowRenames: false,
        call: { fn: 'initialize', args: [] },
    })) as unknown as AgglayerManagerMock;
    expect(await rollupManager.ROLLUP_MANAGER_VERSION()).to.be.equal('v2.0.0');
    return rollupManager;
}
