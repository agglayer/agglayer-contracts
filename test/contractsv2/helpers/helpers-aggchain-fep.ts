import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';

async function getSignerFor(address: string) {
    await ethers.provider.send('hardhat_impersonateAccount', [address]);
    if ((await ethers.provider.getBalance(address)) < ethers.parseEther('1')) {
        await setBalance(address, ethers.parseEther('1'));
    }
    return ethers.getSigner(address);
}

/**
 * Checks that on an AggchainFEP the legacy admin functions are controlled by the aggchain manager and not by the admin
 * @param aggchainFEP AggchainFEP contract
 */
export async function checkLegacyAdminFunctionsGatedByAggchainManager(aggchainFEP: any) {
    const adminAddress = await aggchainFEP.admin();
    const aggchainManagerAddress = await aggchainFEP.aggchainManager();
    expect(adminAddress).to.not.equal(aggchainManagerAddress);

    const admin = await getSignerFor(adminAddress);
    const aggchainManager = await getSignerFor(aggchainManagerAddress);
    const newTrustedSequencer = ethers.Wallet.createRandom().address;
    const newTrustedSequencerURL = 'http://new-sequencer';
    const newPendingAdmin = ethers.Wallet.createRandom().address;

    // The legacy admin can not call any admin function
    await expect(aggchainFEP.connect(admin).setTrustedSequencer(newTrustedSequencer)).to.be.revertedWithCustomError(
        aggchainFEP,
        'OnlyAggchainManager',
    );
    await expect(
        aggchainFEP.connect(admin).setTrustedSequencerURL(newTrustedSequencerURL),
    ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainManager');
    await expect(aggchainFEP.connect(admin).transferAdminRole(newPendingAdmin)).to.be.revertedWithCustomError(
        aggchainFEP,
        'OnlyAggchainManager',
    );

    // The aggchain manager can
    await expect(aggchainFEP.connect(aggchainManager).setTrustedSequencer(newTrustedSequencer))
        .to.emit(aggchainFEP, 'SetTrustedSequencer')
        .withArgs(newTrustedSequencer);
    expect(await aggchainFEP.trustedSequencer()).to.equal(newTrustedSequencer);

    await expect(aggchainFEP.connect(aggchainManager).setTrustedSequencerURL(newTrustedSequencerURL))
        .to.emit(aggchainFEP, 'SetTrustedSequencerURL')
        .withArgs(newTrustedSequencerURL);
    expect(await aggchainFEP.trustedSequencerURL()).to.equal(newTrustedSequencerURL);

    await expect(aggchainFEP.connect(aggchainManager).transferAdminRole(newPendingAdmin))
        .to.emit(aggchainFEP, 'TransferAdminRole')
        .withArgs(newPendingAdmin);
    expect(await aggchainFEP.pendingAdmin()).to.equal(newPendingAdmin);
    expect(await aggchainFEP.admin()).to.equal(adminAddress);
}
