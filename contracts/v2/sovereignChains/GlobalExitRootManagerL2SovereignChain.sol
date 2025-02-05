// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;
import "../../PolygonZkEVMGlobalExitRootL2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is
    PolygonZkEVMGlobalExitRootL2,
    Initializable
{
    // globalExitRootUpdater address
    address public globalExitRootUpdater;

    // globalExitRootRemover address
    // In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim, go back and the execution would be correctly proved.
    address public globalExitRootRemover;

    // Value of the global exit roots hash chain after last insertion
    bytes32 public currentHashChainValue;

    // Value of the removed global exit roots hash chain after last removal
    bytes32 public currentRemovalHashChainValue;

    /**
     * @dev Emitted when a new global exit root is inserted and added to the hash chain
     */
    event InsertGlobalExitRoot(
        bytes32 indexed newGlobalExitRoot,
        bytes32 indexed newHashChainValue
    );

    /**
     * @dev Emitted when the global exit root is removed and added to the removal hash chain
     */
    event RemoveGlobalExitRoot(
        bytes32 indexed removedGlobalExitRoot,
        bytes32 indexed newRemovalHashChainValue
    );

    /**
     * @dev Emitted when the globalExitRootUpdater is set
     */
    event SetGlobalExitRootUpdater(address indexed newGlobalExitRootUpdater);

    /**
     * @dev Emitted when the globalExitRootRemover is set
     */
    event SetGlobalExitRootRemover(address indexed newGlobalExitRootRemover);

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootL2(_bridgeAddress) {
        _disableInitializers();
    }

    /**
     * @notice Initialize contract
     * @param _globalExitRootUpdater setting the globalExitRootUpdater.
     * @param _globalExitRootRemover In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim and go back and the execution would be correctly proved.
     */
    function initialize(
        address _globalExitRootUpdater,
        address _globalExitRootRemover
    ) external virtual initializer {
        // set globalExitRootUpdater
        globalExitRootUpdater = _globalExitRootUpdater;
        // set globalExitRootRemover
        globalExitRootRemover = _globalExitRootRemover;
    }

    modifier onlyGlobalExitRootUpdater() {
        // Only allowed to be called by GlobalExitRootUpdater or coinbase if GlobalExitRootUpdater is zero
        if (globalExitRootUpdater == address(0)) {
            if (block.coinbase != msg.sender) {
                revert OnlyGlobalExitRootUpdater();
            }
        } else {
            if (globalExitRootUpdater != msg.sender) {
                revert OnlyGlobalExitRootUpdater();
            }
        }
        _;
    }

    modifier onlyGlobalExitRootRemover() {
        // Only allowed to be called by GlobalExitRootRemover
        if (globalExitRootRemover != msg.sender) {
            revert OnlyGlobalExitRootRemover();
        }
        _;
    }
    /**
     * @notice Insert a new global exit root
     * @dev After inserting the new global exit root, the hash chain value is updated.
     *      A hash chain is being used to make optimized proof generations of GERs.
     * @param _newRoot new global exit root to insert
     */
    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external onlyGlobalExitRootUpdater {
        // do not insert GER if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = block.timestamp;
            // Update hash chain value
            currentHashChainValue = keccak256(
                abi.encodePacked(currentHashChainValue, _newRoot)
            );
            emit InsertGlobalExitRoot(_newRoot, currentHashChainValue);
        } else {
            revert GlobalExitRootAlreadySet();
        }
    }

    /**
     * @notice Remove last global exit roots
     * @dev After removing a global exit root, the removal hash chain value is updated.
     *      A hash chain is being used to make optimized proof generations of removed GERs.
     * @param gersToRemove Array of gers to remove
     */
    function removeGlobalExitRoots(
        bytes32[] calldata gersToRemove
    ) external onlyGlobalExitRootRemover {
        // @dev A memory variable is used to reduce sload/sstore operations while the loop
        bytes32 nextRemovalHashChainValue = currentRemovalHashChainValue;
        for (uint256 i = 0; i < gersToRemove.length; i++) {
            // Check if the GER exists
            bytes32 gerToRemove = gersToRemove[i];
            if (globalExitRootMap[gerToRemove] == 0) {
                revert GlobalExitRootNotFound();
            }
            // Encode new removed GERs to generate the nextRemovalHashChainValue
            nextRemovalHashChainValue = keccak256(
                abi.encodePacked(nextRemovalHashChainValue, gerToRemove)
            );

            // Remove the GER from the map
            delete globalExitRootMap[gerToRemove];

            // Emit the removal event
            emit RemoveGlobalExitRoot(
                gerToRemove,
                nextRemovalHashChainValue
            );
        }
        // Update the currentRemovalHashChainValue
        currentRemovalHashChainValue = nextRemovalHashChainValue;
    }
    /**
     * @notice Set the globalExitRootUpdater
     * @param _globalExitRootUpdater new globalExitRootUpdater address
     */
    function setGlobalExitRootUpdater(
        address _globalExitRootUpdater
    ) external onlyGlobalExitRootUpdater {
        globalExitRootUpdater = _globalExitRootUpdater;
        emit SetGlobalExitRootUpdater(_globalExitRootUpdater);
    }

    /**
     * @notice Set the globalExitRootRemover
     * @param _globalExitRootRemover new globalExitRootRemover address
     */
    function setGlobalExitRootRemover(
        address _globalExitRootRemover
    ) external onlyGlobalExitRootRemover {
        globalExitRootRemover = _globalExitRootRemover;
        emit SetGlobalExitRootRemover(_globalExitRootRemover);
    }
}
