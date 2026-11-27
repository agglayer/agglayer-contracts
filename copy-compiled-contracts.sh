#!/bin/bash
## Copies the contract artifacts exposed in compiled-contracts/.
## Run after `npx hardhat compile --force`. Used by .githooks/pre-commit and CI (compiled-contracts drift check).
set -euo pipefail

## V1 contracts
cp artifacts/contracts/LegacyAgglayerGERL2.sol/LegacyAgglayerGERL2.json compiled-contracts/
cp artifacts/contracts/lib/TokenWrapped.sol/TokenWrapped.json compiled-contracts/
cp artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json compiled-contracts/
cp artifacts/contracts/AgglayerTimelock.sol/AgglayerTimelock.json compiled-contracts/

## Mocks
cp artifacts/contracts/mocks/PolygonZkEVMBridgeMock.sol/PolygonZkEVMBridgeMock.json compiled-contracts/
cp artifacts/contracts/mocks/ERC20PermitMock.sol/ERC20PermitMock.json compiled-contracts/
cp artifacts/contracts/mocks/LegacyAgglayerGERL2Mock.sol/LegacyAgglayerGERL2Mock.json compiled-contracts/
cp artifacts/contracts/mocks/PolygonZkEVMGlobalExitRootMock.sol/PolygonZkEVMGlobalExitRootMock.json compiled-contracts/
cp artifacts/contracts/mocks/PolygonZkEVMMock.sol/PolygonZkEVMMock.json compiled-contracts/
cp artifacts/contracts/mocks/VerifierRollupHelperMock.sol/VerifierRollupHelperMock.json compiled-contracts/
cp artifacts/contracts/mocks/AgglayerManagerMock.sol/AgglayerManagerMock.json compiled-contracts/

## Verifiers
cp artifacts/contracts/verifiers/FflonkVerifier_10.sol/FflonkVerifier_10.json compiled-contracts/FflonkVerifier.json
cp artifacts/@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json compiled-contracts/
cp artifacts/@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json compiled-contracts/
cp artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json compiled-contracts/
cp artifacts/contracts/verifiers/v6.1.0/SP1VerifierPlonk.sol/SP1VerifierPlonk.json compiled-contracts/SP1VerifierPlonk.json
cp artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json compiled-contracts/

## openzeppelin
cp artifacts/@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json compiled-contracts/
cp artifacts/@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json compiled-contracts/

## V2 General
cp artifacts/contracts/AgglayerManager.sol/AgglayerManager.json compiled-contracts/
cp artifacts/contracts/AgglayerBridge.sol/AgglayerBridge.json compiled-contracts/
cp artifacts/contracts/AgglayerGER.sol/AgglayerGER.json compiled-contracts/
cp artifacts/contracts/AgglayerGER.sol/AgglayerGER.json compiled-contracts/

## V2 Consensus
cp artifacts/contracts/previousVersions/v12/PolygonZkEVMEtrog.sol/PolygonZkEVMEtrog.json compiled-contracts/
cp artifacts/contracts/previousVersions/v12/PolygonZkEVMExistentEtrog.sol/PolygonZkEVMExistentEtrog.json compiled-contracts/
cp artifacts/contracts/previousVersions/v12/PolygonValidiumEtrog.sol/PolygonValidiumEtrog.json compiled-contracts/
cp artifacts/contracts/previousVersions/v12/PolygonDataCommittee.sol/PolygonDataCommittee.json compiled-contracts/
cp artifacts/contracts/consensus/pessimistic/PolygonPessimisticConsensus.sol/PolygonPessimisticConsensus.json compiled-contracts/

## V2 utils
cp artifacts/contracts/periphery/ClaimCompressor.sol/ClaimCompressor.json compiled-contracts/

## al-v0.3.0
cp artifacts/contracts/sovereignChains/AgglayerGERL2.sol/AgglayerGERL2.json compiled-contracts/
cp artifacts/contracts/sovereignChains/AgglayerBridgeL2.sol/AgglayerBridgeL2.json compiled-contracts/
cp artifacts/contracts/AgglayerGateway.sol/AgglayerGateway.json compiled-contracts/
cp artifacts/contracts/lib/AggchainBase.sol/AggchainBase.json compiled-contracts/
cp artifacts/contracts/aggchains/AggchainECDSAMultisig.sol/AggchainECDSAMultisig.json compiled-contracts/
cp artifacts/contracts/aggchains/AggchainFEP.sol/AggchainFEP.json compiled-contracts/
cp artifacts/contracts/sovereignChains/AgglayerBridgeL2FromEtrog.sol/AgglayerBridgeL2FromEtrog.json compiled-contracts/
