import * as ethers from 'ethers';
import { TIMELOCK, STORAGE_ONE_VALUE } from '../constants';

/**
 * Storage slot of `account` in the timelock `_roles[role].members` mapping
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L55
 * @param {string} roleHash - Role identifier, e.g. keccak256("PROPOSER_ROLE")
 * @param {string} account - Role member
 * @returns {string} - Storage slot, set to 1 if `account` has the role
 */
export function getTimelockRoleMemberSlot(roleHash: string, account: string): string {
    const storagePosition = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256'],
        [roleHash, TIMELOCK.ROLES_MAPPING_STORAGE_POS],
    );

    return ethers.solidityPackedKeccak256(['uint256', 'uint256'], [account, storagePosition]);
}

export function setupRole(storage: Record<string, string>, address: string, roleHash: string) {
    storage[getTimelockRoleMemberSlot(roleHash, address)] = STORAGE_ONE_VALUE;
}

/**
 * This function aims to compute te storage when the timelock is deployed
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L77
 * @param {number} minDelay - Minimum delay for the timelock
 * @param {string} adminAddress - Grant admin, proposer, executor and canceller roles to this address
 * @param {string} timelockAddress - Grant admin to this address
 * @returns {Object} - Timelock storage slots
 */
export function initializeTimelockStorage(
    minDelay: ethers.BigNumberish,
    adminAddress: string,
    timelockAddress: string,
): Record<string, string> {
    const storage: Record<string, string> = {};

    // set TIMELOCK_ADMIN_ROLE as an adminRole to all timelock roles
    for (let i = 0; i < TIMELOCK.ROLES_HASH.length; i++) {
        const storagePosition = ethers.solidityPackedKeccak256(
            ['uint256', 'uint256'],
            [TIMELOCK.ROLES_HASH[i], TIMELOCK.ROLES_MAPPING_STORAGE_POS],
        );

        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L52
        const roleAdminSlot = ethers.zeroPadValue(ethers.toQuantity(ethers.toBigInt(storagePosition) + BigInt(1)), 32);

        storage[roleAdminSlot] = TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE;
    }

    // Self administration
    setupRole(storage, timelockAddress, TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE);

    // admin tole
    setupRole(storage, adminAddress, TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE);

    // register proposers and cancellers
    setupRole(storage, adminAddress, TIMELOCK.ROLES.PROPOSER_ROLE);
    setupRole(storage, adminAddress, TIMELOCK.ROLES.CANCELLER_ROLE);

    // register executors
    setupRole(storage, adminAddress, TIMELOCK.ROLES.EXECUTOR_ROLE);

    // set minDelay
    storage[ethers.toBeHex(TIMELOCK.MINDELAY_STORAGE_POS, 32)] = ethers.toBeHex(minDelay, 32);

    return storage;
}
