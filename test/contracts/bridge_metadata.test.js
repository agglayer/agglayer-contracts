/**
 * Test suite for PolygonZkEVMBridge contract focusing on token metadata handling
 * Tests various edge cases with unusual/malformed token metadata
 */

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const MerkleTreeBridge = require('@0xpolygonhermez/zkevm-commonjs').MTBridge;
const {
    getLeafValue,
} = require('@0xpolygonhermez/zkevm-commonjs').mtBridgeUtils;

/**
 * Test constants
 * networkIDMainnet: ID representing the mainnet network (0)
 * networkIDRollup: ID representing the rollup network (1)
 * LEAF_TYPE_ASSET: Identifier for asset type leaves in the Merkle tree (0)
 */

describe('PolygonZkEVMBridge Contract werid metadata', () => {
    let deployer;
    let rollup;

    let polygonZkEVMGlobalExitRoot;
    let polygonZkEVMBridgeContract;
    let tokenContract;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther('20000000');

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const LEAF_TYPE_ASSET = 0;

    const polygonZkEVMAddress = ethers.ZeroAddress;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollup] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy global exit root manager
        const polygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await polygonZkEVMGlobalExitRootFactory.deploy(rollup.address, polygonZkEVMBridgeContract.address);

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMAddress);

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('TokenWrapped');
        tokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            decimals,
        );
        await tokenContract.deployed();

        await tokenContract.mint(deployer.address, tokenInitialBalance);
    });

    /**
     * Test case 1: Bridge transfer with non-standard token metadata
     * Uses a custom ERC20 token that returns metadata in bytes32/bytes format
     * Verifies bridge handles unusual but valid metadata correctly
     */
    it('should PolygonZkEVMBridge with weird token metadata', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20WeirdMetadata');

        const nameWeird = 'nameToken';
        const symbolWeird = 'NTK';

        const nameWeirdBytes32 = ethers.formatBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 14;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        );
        await weirdTokenContract.deployed();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.address, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.address;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameWeird, symbolWeird, decimalsWeird],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(polygonZkEVMBridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x'))
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .withArgs(LEAF_TYPE_ASSET, originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount);

        expect(await polygonZkEVMBridgeContract.getDepositRoot()).to.be.equal(rootJSMainnet);
    });

    /**
     * Test case 2: Bridge transfer with invalid/reverting metadata
     * Tests bridge behavior when token contract reverts on metadata calls
     * Ensures bridge can handle failing metadata calls gracefully
     */
    it('should PolygonZkEVMBridge with weird token metadata with reverts', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20WeirdMetadata');

        const nameWeird = 'nameToken';
        const symbolWeird = 'NTK';

        const nameWeirdBytes32 = ethers.formatBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = ethers.MaxUint256;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        );
        await weirdTokenContract.deployed();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.address, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.address;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Since cannot decode decimals
        await expect(polygonZkEVMBridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x')).to.be.reverted;

        // toogle revert
        await weirdTokenContract.toggleIsRevert();
        // Use revert strings
        const nameRevert = 'NO_NAME';
        const symbolRevert = 'NO_SYMBOL';
        const decimalsTooRevert = 18;
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameRevert, symbolRevert, decimalsTooRevert],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(polygonZkEVMBridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x'))
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .withArgs(LEAF_TYPE_ASSET, originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount);

        expect(await polygonZkEVMBridgeContract.getDepositRoot()).to.be.equal(rootJSMainnet);
    });

    /**
     * Test case 3: Bridge transfer with empty metadata
     * Tests bridge behavior with empty strings and edge case values
     * Verifies handling of empty/invalid metadata encoding
     */
    it('should PolygonZkEVMBridge with weird token metadata with empty data', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20WeirdMetadata');

        const nameWeird = '';
        const symbolWeird = '';

        const nameWeirdBytes32 = ethers.formatBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 255;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        );
        await weirdTokenContract.deployed();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.address, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.address;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Empty bytes32 is a not valid encoding
        const nameEmpty = 'NOT_VALID_ENCODING'; // bytes32 empty
        const symbolEmpty = '';

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameEmpty, symbolEmpty, decimalsWeird],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(polygonZkEVMBridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x'))
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .withArgs(LEAF_TYPE_ASSET, originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount);

        expect(await polygonZkEVMBridgeContract.getDepositRoot()).to.be.equal(rootJSMainnet);
    });
});
