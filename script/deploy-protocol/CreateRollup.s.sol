// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

import {FflonkVerifier_10} from "contracts/verifiers/FflonkVerifier_10.sol";
import {FflonkVerifier_11} from "contracts/verifiers/FflonkVerifier_11.sol";
import {FflonkVerifier_12} from "contracts/verifiers/FflonkVerifier_12.sol";
import {FflonkVerifier_13} from "contracts/verifiers/FflonkVerifier_13.sol";
import {PolygonDataCommittee} from "contracts/consensus/validium/PolygonDataCommittee.sol";
import {PolygonRollupManager} from "contracts/PolygonRollupManager.sol";
import {PolygonValidiumEtrog} from "contracts/consensus/validium/PolygonValidiumEtrog.sol";
import {PolygonZkEVMBridgeV2} from "contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";
import {PolygonZkEVMEtrog} from "contracts/consensus/zkEVM/PolygonZkEVMEtrog.sol";
import {PolygonZkEVMGlobalExitRootV2} from "contracts/PolygonZkEVMGlobalExitRootV2.sol";

import "contracts/interfaces/IPolygonZkEVMBridgeV2.sol";
import "contracts/interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract CreateRollup is Script {
    using stdJson for string;

    // config parameters
    address internal adminZkEVM;
    address internal gasTokenAddress;
    address internal polygonRollupManager;
    address internal polToken;
    address internal polygonZkEVMBridge;
    address internal polygonZkEVMGlobalExitRoot;
    address internal trustedSequencer;
    bool internal realVerifier;
    string internal consensusContract;
    string internal dataAvailabilityProtocol;
    string internal description;
    string internal networkName;
    string internal trustedSequencerURL;
    string internal verifier;
    uint256 internal chainID;
    uint256 internal deployerPvtKey;
    uint256 internal forkID;
    uint256 internal maxFeePerGas;
    uint256 internal maxPriorityFeePerGas;
    uint256 internal multiplierGas;

    string[] internal supportedConsensusContracts = ["PolygonZkEVMEtrog", "PolygonValidiumEtrog"];
    string[] internal supportedDataAvailabilityProtocols = ["PolygonDataCommittee"];
    string[] internal supportedVerfiers =
        ["FflonkVerifier_10", "FflonkVerifier_11", "FflonkVerifier_12", "FflonkVerifier_13"];

    mapping(string => bool) internal supportedConsensusContractsMap;
    mapping(string => bool) internal supportedDataAvailabilityProtocolsMap;
    mapping(string => bool) internal supportedVerifiersMap;

    function run() public {
        _initializeMappings();
        loadConfig();
        address consensusContractAddr = _getConsensusContract(consensusContract);
        console.log("Consensus Contract address: %s", consensusContractAddr);

        address dataAvailabilityProtocolAddr = _getDataAvailabilityProtocol(dataAvailabilityProtocol);
        console.log("Data Availability Protocol address: %s", dataAvailabilityProtocolAddr);

        address verifierAddr = _getVerifierContract(verifier);
        console.log("Verifier address: %s", verifierAddr);

        // PolygonRollupManager rollupManager = PolygonRollupManager(polygonRollupManager);
        // PolygonZkEVMBridgeV2 zkEVMBridge = PolygonZkEVMBridgeV2(polygonZkEVMBridge);
        // PolygonZkEVMGlobalExitRootV2 zkEVMGlobalExitRoot = PolygonZkEVMGlobalExitRootV2(polygonZkEVMGlobalExitRoot);
    }

    function loadConfig() public {
        string memory inputPath = "script/inputs/createRollupParameters.json";
        console.log("Reading config from path: %s \n", inputPath);

        string memory input = vm.readFile(inputPath);
        adminZkEVM = input.readAddress(".adminZkEVM");
        gasTokenAddress = input.readAddress(".gasTokenAddress");
        polygonRollupManager = input.readAddress(".polygonRollupManager");
        polToken = input.readAddress(".polToken");
        polygonZkEVMBridge = input.readAddress(".polygonZkEVMBridge");
        polygonZkEVMGlobalExitRoot = input.readAddress(".polygonZkEVMGlobalExitRoot");
        trustedSequencer = input.readAddress(".trustedSequencer");
        realVerifier = input.readBool(".realVerifier");
        consensusContract = input.readString(".consensusContract");
        dataAvailabilityProtocol = input.readString(".dataAvailabilityProtocol");
        description = input.readString(".description");
        networkName = input.readString(".networkName");
        trustedSequencerURL = input.readString(".trustedSequencerURL");
        verifier = input.readString(".verifier");
        chainID = input.readUint(".chainID");
        deployerPvtKey = input.readUint(".deployerPvtKey");
        forkID = input.readUint(".forkID");
        maxFeePerGas = input.readUint(".maxFeePerGas");
        maxPriorityFeePerGas = input.readUint(".maxPriorityFeePerGas");
        multiplierGas = input.readUint(".multiplierGas");

        require(supportedConsensusContractsMap[consensusContract], "Unsupported consensus contract");
        if (_stringHash(consensusContract) == _stringHash("PolygonValidiumEtrog")) {
            require(
                supportedDataAvailabilityProtocolsMap[dataAvailabilityProtocol],
                "Unsupported data availability protocol"
            );
        }
        require(supportedVerifiersMap[verifier], "Unsupported verifier");

        console.log("ZkEVM Admin: %s", adminZkEVM);
        console.log("Gas Token Address: %s", gasTokenAddress);
        console.log("Polygon Rollup Manager: %s", polygonRollupManager);
        console.log("POL Token: %s", polToken);
        console.log("Polygon ZkEVM Bridge: %s", polygonZkEVMBridge);
        console.log("Polygon ZkEVM Global Exit Root: %s", polygonZkEVMGlobalExitRoot);
        console.log("Trusted Sequencer: %s", trustedSequencer);
        console.log("Real Verifier: %s", realVerifier);
        console.log("Consensus Contract: ", consensusContract);
        console.log("Data Availability Protocol: %s", dataAvailabilityProtocol);
        console.log("Deployer Private Key: %s", deployerPvtKey);
        console.log("Description: %s", description);
        console.log("Network Name: %s", networkName);
        console.log("Trusted Sequencer URL: %s", trustedSequencerURL);
        console.log("Verifier: %s", verifier);
        console.log("Chain ID: %s", chainID);
        console.log("Fork ID: %s", forkID);
        console.log("Max Fee Per Gas: %s", maxFeePerGas);
        console.log("Max Priority Fee Per Gas: %s", maxPriorityFeePerGas);
        console.log("Multiplier Gas: %s\n", multiplierGas);
        console.log("Config loaded successfully!\n");
    }

    function _initializeMappings() internal {
        for (uint256 i = 0; i < supportedConsensusContracts.length; i++) {
            supportedConsensusContractsMap[supportedConsensusContracts[i]] = true;
        }
        for (uint256 i = 0; i < supportedDataAvailabilityProtocols.length; i++) {
            supportedDataAvailabilityProtocolsMap[supportedDataAvailabilityProtocols[i]] = true;
        }
        for (uint256 i = 0; i < supportedVerfiers.length; i++) {
            supportedVerifiersMap[supportedVerfiers[i]] = true;
        }
    }

    function _getConsensusContract(string memory consensusContractStr)
        internal
        returns (address consensusContractAddr)
    {
        vm.startBroadcast(deployerPvtKey);
        if (_stringHash(consensusContractStr) == _stringHash("PolygonZkEVMEtrog")) {
            consensusContractAddr = address(
                new PolygonZkEVMEtrog(
                    IPolygonZkEVMGlobalExitRootV2(polygonZkEVMGlobalExitRoot),
                    IERC20Upgradeable(polToken),
                    IPolygonZkEVMBridgeV2(polygonZkEVMBridge),
                    PolygonRollupManager(polygonRollupManager)
                )
            );
        } else if (_stringHash(consensusContractStr) == _stringHash("PolygonValidiumEtrog")) {
            consensusContractAddr = address(
                new PolygonValidiumEtrog(
                    IPolygonZkEVMGlobalExitRootV2(polygonZkEVMGlobalExitRoot),
                    IERC20Upgradeable(polToken),
                    IPolygonZkEVMBridgeV2(polygonZkEVMBridge),
                    PolygonRollupManager(polygonRollupManager)
                )
            );
        } else {
            consensusContractAddr = address(0);
        }
        vm.stopBroadcast();
    }

    function _getDataAvailabilityProtocol(string memory dataAvailabilityProtocolStr)
        internal
        returns (address dataAvailabilityProtocolAddr)
    {
        vm.startBroadcast(deployerPvtKey);
        if (_stringHash(dataAvailabilityProtocolStr) == _stringHash("PolygonDataCommittee")) {
            dataAvailabilityProtocolAddr = address(new PolygonDataCommittee());
        } else {
            dataAvailabilityProtocolAddr = address(0);
        }
        vm.stopBroadcast();
    }

    function _getVerifierContract(string memory verifierStr) internal returns (address verifierAddr) {
        vm.startBroadcast(deployerPvtKey);
        if (_stringHash(verifierStr) == _stringHash("FflonkVerifier_10")) {
            verifierAddr = address(new FflonkVerifier_10());
        } else if (_stringHash(verifierStr) == _stringHash("FflonkVerifier_11")) {
            verifierAddr = address(new FflonkVerifier_11());
        } else if (_stringHash(verifierStr) == _stringHash("FflonkVerifier_12")) {
            verifierAddr = address(new FflonkVerifier_12());
        } else if (_stringHash(verifierStr) == _stringHash("FflonkVerifier_13")) {
            verifierAddr = address(new FflonkVerifier_13());
        } else {
            verifierAddr = address(0);
        }
        vm.stopBroadcast();
    }

    function _stringHash(string memory input) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(input));
    }
}
