import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AgglayerBridgeL2, AgglayerGERL2, BridgeCallerMock, ERC20PermitMock } from '../../typechain-types';

describe('AgglayerBridgeL2 DetailedBridgeEvent', () => {
    upgrades.silenceWarnings();

    let bridge: AgglayerBridgeL2;
    let ger: AgglayerGERL2;
    let token: ERC20PermitMock;
    let deployer: any;
    let bridgeManager: any;
    let user: any;

    const networkID = 2;
    const destinationNetwork = 1;
    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        ['Matic Token', 'MATIC', 18],
    );

    beforeEach('Deploy contracts', async () => {
        [deployer, bridgeManager, user] = await ethers.getSigners();
        bridge = (await upgrades.deployProxy(await ethers.getContractFactory('AgglayerBridgeL2'), [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;
        ger = (await upgrades.deployProxy(await ethers.getContractFactory('AgglayerGERL2'), [], {
            initializer: false,
            constructorArgs: [bridge.target],
            unsafeAllow: ['constructor', 'missing-initializer', 'state-variable-immutable'],
        })) as unknown as AgglayerGERL2;
        await ger.initialize(deployer.address, deployer.address);
        await bridge.initialize(
            networkID,
            ethers.ZeroAddress, // ether as gas token
            0,
            ger.target,
            ethers.ZeroAddress,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
            deployer.address,
            deployer.address,
            deployer.address,
        );
        token = await (
            await ethers.getContractFactory('ERC20PermitMock')
        ).deploy('Matic Token', 'MATIC', user.address, ethers.parseEther('100'));
    });

    it('emits BridgeEvent and DetailedBridgeEvent on bridgeAsset with the EOA as tx.origin and msg.sender', async () => {
        const amount = ethers.parseEther('10');
        const depositCount = await bridge.depositCount();
        await token.connect(user).approve(bridge.target, amount);

        const tx = bridge
            .connect(user)
            .bridgeAsset(destinationNetwork, deployer.address, amount, token.target, true, '0x');
        await expect(tx)
            .to.emit(bridge, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                networkID,
                token.target,
                destinationNetwork,
                deployer.address,
                amount,
                metadataToken,
                depositCount,
            );
        await expect(tx)
            .to.emit(bridge, 'DetailedBridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                networkID,
                token.target,
                destinationNetwork,
                deployer.address,
                amount,
                metadataToken,
                depositCount,
                user.address,
                user.address,
            );
    });

    it('emits DetailedBridgeEvent with tx.origin and msg.sender when a contract bridges a message', async () => {
        const caller = (await (await ethers.getContractFactory('BridgeCallerMock')).deploy()) as BridgeCallerMock;
        // zero value: the local balance tree has no ether to send out of this chain
        const amount = 0n;
        const metadata = '0x1234';
        const depositCount = await bridge.depositCount();

        const tx = caller
            .connect(user)
            .bridgeMessage(bridge.target, destinationNetwork, deployer.address, true, metadata, { value: amount });
        await expect(tx)
            .to.emit(bridge, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                networkID,
                caller.target,
                destinationNetwork,
                deployer.address,
                amount,
                metadata,
                depositCount,
            );
        await expect(tx).to.emit(bridge, 'DetailedBridgeEvent').withArgs(
            LEAF_TYPE_MESSAGE,
            networkID,
            caller.target,
            destinationNetwork,
            deployer.address,
            amount,
            metadata,
            depositCount,
            user.address, // tx.origin
            caller.target, // msg.sender
        );
    });

    it('emits one DetailedBridgeEvent per leaf, matching the BridgeEvent depositCount', async () => {
        await bridge.connect(user).bridgeMessage(destinationNetwork, deployer.address, true, '0x', { value: 0 });
        const receipt = await (
            await bridge.connect(user).bridgeMessage(destinationNetwork, deployer.address, true, '0x', { value: 0 })
        ).wait();
        const parsed = receipt!.logs
            .filter((log) => log.address === bridge.target)
            .map((log) => bridge.interface.parseLog(log))
            .filter((log) => log && ['BridgeEvent', 'DetailedBridgeEvent'].includes(log.name));
        expect(parsed.map((log) => log!.name)).to.deep.equal(['BridgeEvent', 'DetailedBridgeEvent']);
        expect(parsed[0]!.args.depositCount).to.equal(1n);
        expect(parsed[1]!.args.depositCount).to.equal(1n);
    });

    it('is not part of the L1 AgglayerBridge ABI', async () => {
        const l1 = await ethers.getContractFactory('AgglayerBridge');
        expect(l1.interface.getEvent('DetailedBridgeEvent')).to.equal(null);
    });
});
