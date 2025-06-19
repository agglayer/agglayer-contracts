// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../interfaces/IBridgeMessageReceiver.sol";
import "../v2/interfaces/IPolygonZkEVMBridgeV2.sol";

contract BridgeMessageReceiverMock is IBridgeMessageReceiver {
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    event MessageReceived(address destinationAddress);
    event UpdateParameters();

    IPolygonZkEVMBridgeV2 public immutable bridgeAddress;
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot;
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot;
    uint256 globalIndex;
    bytes32 mainnetExitRoot;
    bytes32 rollupExitRoot;
    uint32 originNetwork;
    address originAddress;
    uint32 destinationNetwork;
    address destinationAddress;
    uint256 amount;
    bytes metadata;

    constructor(IPolygonZkEVMBridgeV2 _bridgeAddress) {
        bridgeAddress = _bridgeAddress;
    }

    function updateParameters(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata msmtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata msmtProofRollupExitRoot,
        uint256 mglobalIndex,
        bytes32 mmainnetExitRoot,
        bytes32 mrollupExitRoot,
        uint32 moriginNetwork,
        address moriginAddress,
        uint32 mdestinationNetwork,
        address mdestinationAddress,
        uint256 mamount,
        bytes calldata mmetadata
    ) public {
        smtProofLocalExitRoot = msmtProofLocalExitRoot;
        smtProofRollupExitRoot = msmtProofRollupExitRoot;
        globalIndex = mglobalIndex;
        mainnetExitRoot = mmainnetExitRoot;
        rollupExitRoot = mrollupExitRoot;
        originNetwork = moriginNetwork;
        originAddress = moriginAddress;
        destinationNetwork = mdestinationNetwork;
        destinationAddress = mdestinationAddress;
        amount = mamount;
        metadata = mmetadata;

        emit UpdateParameters();
    }

    /// @inheritdoc IBridgeMessageReceiver
    function onMessageReceived(
        address originAddress,
        uint32 originNetwork,
        bytes memory data
    ) external payable {
        bridgeAddress.claimMessage(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata
        );
    }
}
