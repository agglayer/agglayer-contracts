const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.env.HARDHAT_NETWORK = "hardhat";
const { ethers } = require("hardhat");
const { expect } = require('chai');

const deployMainnet = require("./mainnetDeployment.json");
const mainnetDeployParameters = require("./mainnetDeployParameters.json");

const artifactsPath = {
  fflonkVerifier: '../artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json',
  polygonZkEVMDeployer: '../artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json',
  polygonZkEVMBridge: '../artifacts/contracts/PolygonZkEVMBridge.sol/PolygonZkEVMBridge.json',
  transparentProxyOZUpgradeDep: '../node_modules/@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json',
  proxyAdmin: '../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json',
  transparentProxy: '../artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json',
  polygonZkEVMTimelock: '../artifacts/contracts/PolygonZkEVMTimelock.sol/PolygonZkEVMTimelock.json',
  polygonZkEVM: '../artifacts/contracts/PolygonZkEVM.sol/PolygonZkEVM.json',
  polygonZkEVMGlobalExitRoot: '../artifacts/contracts/PolygonZkEVMGlobalExitRoot.sol/PolygonZkEVMGlobalExitRoot.json'
};

// Load contract artifacts
const FflonkVerifier = require(artifactsPath.fflonkVerifier);
const PolygonZkEVMDeployer = require(artifactsPath.polygonZkEVMDeployer);
const PolygonZkEVMBridge = require(artifactsPath.polygonZkEVMBridge);
const TransparentProxyOZUpgradeDep = require(artifactsPath.transparentProxyOZUpgradeDep);
const ProxyAdmin = require(artifactsPath.proxyAdmin);
const TransparentProxy = require(artifactsPath.transparentProxy);

const etherscanURL = "https://etherscan.io/address/";

async function main() {
  const mainnetProvider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);

  // Verify contracts
  await verifyContract(mainnetProvider, deployMainnet.fflonkVerifierAddress, FflonkVerifier, 'FflonkVerifier');
  await verifyContract(mainnetProvider, deployMainnet.polygonZkEVMDeployerAddress, PolygonZkEVMDeployer, 'PolygonZkEVMDeployer');

  // Verify Bridge implementation
  const polygonZkEVMBridgeImpl = await getImplementationAddress(deployMainnet.polygonZkEVMBridgeAddress, mainnetProvider);
  await verifyImplementation(mainnetProvider, polygonZkEVMBridgeImpl, PolygonZkEVMBridge, 'PolygonZkEVMBridge', deployMainnet.polygonZkEVMBridgeAddress);

  // Verify Transparent Proxies
  await verifyProxy(mainnetProvider, deployMainnet.polygonZkEVMBridgeAddress, TransparentProxy, 'PolygonZkEVMBridgeAddress proxy');

  // Verify Timelock contract
  await verifyTimelockContract(mainnetProvider);

  // Verify Global Exit Root contract
  await verifyGlobalExitRootContract(mainnetProvider);

  // Verify PolygonZkEVM contract
  await verifyPolygonZkEVMContract(mainnetProvider);

  // Verify Proxy Admin contract
  await verifyProxyAdmin(mainnetProvider);

  // Verify Genesis root
  await verifyGenesisRoot(mainnetProvider);

  console.log("Verification complete!");
}

async function verifyContract(provider, contractAddress, contractArtifact, name) {
  expect(await provider.getCode(contractAddress)).to.be.equal(contractArtifact.deployedBytecode);
  console.log(`${name} was correctly verified`);
  console.log(`Etherscan URL: ${etherscanURL}${contractAddress}`);
  console.log(`Path file: ${path.join(__dirname, artifactsPath[name.toLowerCase()])}`);
  console.log();
}

async function verifyImplementation(provider, implAddress, contractArtifact, name, contractAddress) {
  expect(await provider.getCode(implAddress)).to.be.equal(contractArtifact.deployedBytecode);
  console.log(`${name} implementation was correctly verified`);
  console.log(`Etherscan URL: ${etherscanURL}${implAddress}`);
  console.log(`Path file: ${path.join(__dirname, artifactsPath[name.toLowerCase()])}`);
  console.log();
}

async function verifyProxy(provider, proxyAddress, proxyArtifact, name) {
  expect(await provider.getCode(proxyAddress)).to.be.equal(proxyArtifact.deployedBytecode);
  console.log(`${name} was correctly verified`);
  console.log(`Etherscan URL: ${etherscanURL}${proxyAddress}`);
  console.log(`Path file: ${path.join(__dirname, artifactsPath.transparentProxy)}`);
  console.log();
}

async function verifyTimelockContract(provider) {
  const PolygonZkEVMTimelockFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
  const timelockAddress = mainnetDeployParameters.timelockAddress;
  const minDelayTimelock = mainnetDeployParameters.minDelayTimelock;

  const timelockContract = await PolygonZkEVMTimelockFactory.deploy(
    minDelayTimelock,
    [timelockAddress],
    [timelockAddress],
    timelockAddress,
    deployMainnet.polygonZkEVMAddress,
  );
  await timelockContract.deployed();

  const deployedBytecodeTimelock = await ethers.provider.getCode(timelockContract.address);
  expect(await provider.getCode(deployMainnet.polygonZkEVMTimelockAddress)).to.be.equal(deployedBytecodeTimelock);
  console.log("Timelock contract was correctly verified");
  console.log(`Etherscan URL: ${etherscanURL}${deployMainnet.polygonZkEVMTimelockAddress}`);
  console.log(`Path file: ${path.join(__dirname, artifactsPath.polygonZkEVMTimelock)}`);
  console.log();
}

async function verifyGlobalExitRootContract(provider) {
  const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
  const globalExitRootContract = await PolygonZkEVMGlobalExitRootFactory.deploy(
    deployMainnet.polygonZkEVMAddress,
    deployMainnet.polygonZkEVMBridgeAddress
  );
  await globalExitRootContract.deployed();

  const deployedBytecodeGlobalExitRoot = await ethers.provider.getCode(globalExitRootContract.address);
  const globalExitRootImpl = await getImplementationAddress(deployMainnet.polygonZkEVMGlobalExitRootAddress, provider);

  expect(await provider.getCode(globalExitRootImpl)).to.be.equal(deployedBytecodeGlobalExitRoot);
  console.log("Global Exit Root contract implementation was correctly verified");
  console.log(`Etherscan URL: ${etherscanURL}${globalExitRootImpl}`);
  console.log(`Path file: ${path.join(__dirname, artifactsPath.polygonZkEVMGlobalExitRoot)}`);
  console.log();
}

async function verifyPolygonZkEVMContract(provider) {
  const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM');
  const polygonZkEVMContract = await PolygonZkEVMFactory.deploy(
    deployMainnet.polygonZkEVMGlobalExitRootAddress,
    mainnetDeployParameters.maticTokenAddress,
    deployMainnet.fflonkVerifierAddress,
    deployMainnet.polygonZkEVMBridgeAddress,
    mainnetDeployParameters.chainID,
    mainnetDeployParameters.forkID,
  );
  await polygonZkEVMContract.deployed();

  const deployedBytecodePolygonZkEVM = await ethers.provider.getCode(polygonZkEVMContract.address);
  const polygonZkEVMImpl = await getImplementationAddress(deployMainnet.polygonZkEVMAddress, provider);

  expect(await provider.getCode(polygonZkEVMImpl)).to.be.equal(deployedBytecodePolygonZkEVM);
  console.log("PolygonZkEVM contract implementation was correctly verified");
  console.log(`Etherscan URL: ${etherscanURL}${polygonZkEVMImpl}`);
  console.log(`Path file: ${path.join(__dirname, artifactsPath.polygonZkEVM)}`);
  console.log();
}

async function verifyProxyAdmin(provider) {
  const proxyAdminAddress = await getProxyAdminAddress(deployMainnet.polygonZkEVMBridgeAddress, provider);
  const polygonZkEVMAdmin = await getProxyAdminAddress(deployMainnet.polygonZkEVMAddress, provider);
  const globalExitRootAdmin = await getProxyAdminAddress(deployMainnet.polygonZkEVMGlobalExitRootAddress, provider);

  expect(proxyAdminAddress).to.be.equal(polygonZkEVMAdmin);
  expect(polygonZkEVMAdmin).to.be.equal(globalExitRootAdmin);
  expect(await provider.getCode(polygonZkEVMAdmin)).to.be.equal(ProxyAdmin.deployedBytecode);

  console.log("
