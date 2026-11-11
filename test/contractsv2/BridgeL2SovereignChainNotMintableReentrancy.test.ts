import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    AgglayerBridgeL2,
    AgglayerGERL2,
    BridgeL2ReentrantSenderMock,
    ERC20PermitMock,
    ERC20SenderHookMock,
} from '../../typechain-types';
import { claimBeforeBridge, createClaimAndAddGER } from './helpers/helpers-sovereign-bridge';

// Reentrancy through a not-mintable token with a sender hook: the bridge credits `balanceAfter - balanceBefore`,
// so a nested deposit of the same token inside `transferFrom` would be counted twice
describe('AgglayerBridgeL2 not-mintable token reentrancy', () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: AgglayerBridgeL2;
    let sovereignChainGlobalExitRoot: AgglayerGERL2;
    let hookWETH: ERC20SenderHookMock;
    let attacker: BridgeL2ReentrantSenderMock;

    let deployer: any;
    let rollupManager: any;
    let bridgeManager: any;
    let emergencyBridgePauser: any;
    let proxiedTokensManager: any;

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const networkIDRollup2 = 2;
    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    const REENTRY_NONE = 0;
    const REENTRY_BRIDGE_MESSAGE_WETH = 1;
    const REENTRY_BRIDGE_ASSET = 2;
    const REENTRY_MIGRATE_LEGACY_TOKEN = 3;

    const amountOuter = ethers.parseEther('100');
    const amountInner = ethers.parseEther('50');
    const fundedAmount = ethers.parseEther('1000');
    const reentrancyError = 'ReentrancyGuard: reentrant call';

    beforeEach('Deploy contracts', async () => {
        [deployer, rollupManager, bridgeManager, emergencyBridgePauser, proxiedTokensManager] =
            await ethers.getSigners();

        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);

        const bridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        sovereignChainBridgeContract = (await upgrades.deployProxy(bridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

        const gerFactory = await ethers.getContractFactory('AgglayerGERL2');
        sovereignChainGlobalExitRoot = await gerFactory.deploy(sovereignChainBridgeContract.target);

        // gas token network, so WETH is a token
        const polFactory = await ethers.getContractFactory('ERC20PermitMock');
        const polTokenContract = await polFactory.deploy('POL', 'POL', deployer.address, fundedAmount);
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            ['POL', 'POL', 18],
        );

        await sovereignChainBridgeContract.initialize(
            networkIDRollup2,
            polTokenContract.target,
            networkIDMainnet,
            sovereignChainGlobalExitRoot.target,
            rollupManager.address,
            metadataToken,
            ethers.Typed.address(bridgeManager.address),
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // Remap WETH to a not-mintable token with a sender hook
        const hookTokenFactory = await ethers.getContractFactory('ERC20SenderHookMock');
        hookWETH = await hookTokenFactory.deploy('Hook WETH', 'HWETH');
        await sovereignChainBridgeContract.connect(bridgeManager).setSovereignWETHAddress(hookWETH.target, true);

        const attackerFactory = await ethers.getContractFactory('BridgeL2ReentrantSenderMock');
        attacker = await attackerFactory.deploy(sovereignChainBridgeContract.target, networkIDMainnet);
    });

    async function fundAttackerWithWETH() {
        // Claim ether (WETH on this chain) to the attacker so the LBT holds the funds being bridged out
        // claimBeforeBridge only funds the bridge with native ether for this leaf, so send it the WETH paid out
        await hookWETH.mint(sovereignChainBridgeContract.target, fundedAmount);
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            ethers.ZeroAddress,
            networkIDRollup2,
            attacker.target,
            fundedAmount,
            '0x',
            sovereignChainGlobalExitRoot,
            sovereignChainBridgeContract,
            hookWETH,
            0,
        );
    }

    async function deployRemappedLegacyToken(attackerLegacyBalance: bigint) {
        const originTokenAddress = ethers.Wallet.createRandom().address;
        const hookTokenFactory = await ethers.getContractFactory('ERC20SenderHookMock');
        const hookLegacy = await hookTokenFactory.deploy('Hook Legacy', 'HLEG');
        const tokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        const newToken = (await tokenFactory.deploy(
            'New',
            'NEW',
            sovereignChainBridgeContract.target,
            fundedAmount,
        )) as ERC20PermitMock;

        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setMultipleSovereignTokenAddress([networkIDRollup], [originTokenAddress], [hookLegacy.target], [true]);

        if (attackerLegacyBalance > 0n) {
            // Claim the legacy token to the attacker so the LBT holds the funds being bridged out
            await hookLegacy.mint(deployer.address, attackerLegacyBalance);
            await claimBeforeBridge(
                LEAF_TYPE_ASSET,
                networkIDRollup,
                originTokenAddress,
                networkIDRollup2,
                attacker.target,
                attackerLegacyBalance,
                '0x',
                sovereignChainGlobalExitRoot,
                sovereignChainBridgeContract,
                hookLegacy,
                0,
            );
        }

        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setMultipleSovereignTokenAddress([networkIDRollup], [originTokenAddress], [newToken.target], [true]);

        return { hookLegacy, newToken };
    }

    it('should revert bridgeMessageWETH re-entered from the token hook by bridgeMessageWETH', async () => {
        await fundAttackerWithWETH();
        await attacker.setup(hookWETH.target, REENTRY_BRIDGE_MESSAGE_WETH, ethers.ZeroAddress, amountInner);

        await expect(attacker.bridgeMessageWETH(amountOuter)).to.be.revertedWith(reentrancyError);
    });

    it('should revert bridgeMessageWETH re-entered from the token hook by bridgeAsset', async () => {
        await fundAttackerWithWETH();
        await attacker.setup(hookWETH.target, REENTRY_BRIDGE_ASSET, hookWETH.target, amountInner);

        await expect(attacker.bridgeMessageWETH(amountOuter)).to.be.revertedWith(reentrancyError);
    });

    it('should revert migrateLegacyToken re-entered from the token hook by migrateLegacyToken', async () => {
        const { hookLegacy, newToken } = await deployRemappedLegacyToken(0n);
        await hookLegacy.mint(attacker.target, fundedAmount);
        await attacker.setup(hookLegacy.target, REENTRY_MIGRATE_LEGACY_TOKEN, hookLegacy.target, amountInner);

        await expect(attacker.migrateLegacyToken(hookLegacy.target, amountOuter)).to.be.revertedWith(reentrancyError);
        expect(await newToken.balanceOf(attacker.target)).to.be.equal(0n);
    });

    it('should revert bridgeAsset re-entered from the token hook by migrateLegacyToken', async () => {
        const { hookLegacy } = await deployRemappedLegacyToken(fundedAmount);
        await attacker.setup(hookLegacy.target, REENTRY_MIGRATE_LEGACY_TOKEN, hookLegacy.target, amountInner);

        await expect(attacker.bridgeAsset(hookLegacy.target, amountOuter)).to.be.revertedWith(reentrancyError);
    });

    it('should credit the received amount when the hook does not re-enter', async () => {
        await fundAttackerWithWETH();
        await attacker.setup(hookWETH.target, REENTRY_NONE, ethers.ZeroAddress, 0n);

        const depositCount = await sovereignChainBridgeContract.depositCount();
        await expect(attacker.bridgeMessageWETH(amountOuter))
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                networkIDRollup2,
                attacker.target,
                networkIDMainnet,
                attacker.target,
                amountOuter,
                '0x',
                depositCount,
            );
    });

    it('should keep claimMessage composable: onMessageReceived can bridgeMessageWETH the funds back', async () => {
        await attacker.setup(hookWETH.target, REENTRY_NONE, ethers.ZeroAddress, 0n);
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [amountOuter]);
        const originAddress = deployer.address;

        // createClaimAndAddGER funds the bridge with the WETH paid out by the message
        await hookWETH.mint(deployer.address, amountOuter);
        const claim = await createClaimAndAddGER(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            originAddress,
            networkIDRollup2,
            attacker.target,
            amountOuter,
            metadata,
            sovereignChainGlobalExitRoot,
            sovereignChainBridgeContract,
            hookWETH,
            0,
        );

        const depositCount = await sovereignChainBridgeContract.depositCount();
        await expect(
            sovereignChainBridgeContract.claimMessage(
                claim.proofLocal,
                claim.proofRollup,
                claim.globalIndex,
                claim.mainnetLER,
                claim.rootRollupsLERS,
                networkIDMainnet,
                originAddress,
                networkIDRollup2,
                attacker.target,
                amountOuter,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                networkIDRollup2,
                attacker.target,
                networkIDMainnet,
                attacker.target,
                amountOuter,
                '0x',
                depositCount,
            );
        expect(await hookWETH.balanceOf(attacker.target)).to.be.equal(0n);
    });
});
