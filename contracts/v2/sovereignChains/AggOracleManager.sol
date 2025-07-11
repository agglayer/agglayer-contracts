// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable5/access/OwnableUpgradeable.sol";
import {GlobalExitRootManagerL2SovereignChain} from "./GlobalExitRootManagerL2SovereignChain.sol";
import {IAggOracleManager} from "../interfaces/IAggOracleManager.sol";

/**
 * @title AggOracleManager
 * @notice Contract responsible for managing the insertion of GERs into the GlobalExitRootManagerL2SovereignChain.
 */
contract AggOracleManager is IAggOracleManager, OwnableUpgradeable {
    /**
     * @notice Struct to store votes for GERs
     * @param votes Current number of votes for this report
     * @param timestamp Timestamp when the report was first proposed
     */
    struct Report {
        uint64 votes;
        uint64 timestamp;
    }

    // This value is reserved as an initial voted GER to mark an oracle address as active
    bytes32 public constant INITIAL_PROPOSED_GER = bytes32(uint256(1));
    // 0x0000000000000000000000000000000000000000000000000000000000000001;

    // Global exit root manager L2
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    GlobalExitRootManagerL2SovereignChain
        public immutable globalExitRootManagerL2Sovereign;

    // This array is used only to easily get the current oracle members' information
    address[] public aggOracleMembers;

    // Number of reports that must match to consolidate a new rewards root (N/M)
    uint64 public quorum;

    // Oracle member address --> current voted GER
    mapping(address => bytes32) public addressToLastProposedGER;

    // GER --> Report(votes)
    mapping(bytes32 => Report) public proposedGERToReport;

    /**
     * @notice Disables initializers on the implementation, following best practices.
     */
    constructor(GlobalExitRootManagerL2SovereignChain globalExitRootManager) {
        globalExitRootManagerL2Sovereign = globalExitRootManager;
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract.
     * @param _owner Owner of the contract, presumably a timelock
     * @param _aggOracleMembers Initial oracle members
     * @param _quorum Quorum required for consolidation
     */
    function initialize(
        address _owner,
        address[] calldata _aggOracleMembers,
        uint64 _quorum
    ) external initializer {
        require(_quorum != 0, QuorumCannotBeZero());

        // Set initialization parameters
        quorum = _quorum;

        // Add oracle members
        for (uint256 i = 0; i < _aggOracleMembers.length; i++) {
            _addOracleMember(_aggOracleMembers[i]);
        }

        // Initialize OpenZeppelin OwnableUpgradeable
        __Ownable_init(_owner);

        // Emit event
        emit UpdateQuorum(_quorum);
    }

    ////////////////////
    // Oracle functions
    ///////////////////

    /**
     * @notice Propose a global exit root.
     * This function can only be called by an oracle member.
     * If the quorum is reached, the GER is consolidated.
     * @param proposedGlobalExitRoot Global exit root proposed
     */
    function proposeGlobalExitRoot(bytes32 proposedGlobalExitRoot) external {
        // Check if it's a valid oracle member
        require(
            proposedGlobalExitRoot != INITIAL_PROPOSED_GER &&
                proposedGlobalExitRoot != bytes32(0),
            InvalidProposedGER()
        );

        // Check the last voted report
        bytes32 lastProposedGER = addressToLastProposedGER[msg.sender];

        // Check if it's a valid oracle member
        require(lastProposedGER != bytes32(0), NotOracleMember());

        // If it's not the initial report hash, check last report voted
        if (lastProposedGER != INITIAL_PROPOSED_GER) {
            Report storage lastVotedReport = proposedGERToReport[
                lastProposedGER
            ];

            // Subtract a vote on the last voted report
            // That report could have 0 votes because:
            // - The report was already consolidated
            // - Were subtracted all the votes from that report
            if (lastVotedReport.votes > 0) {
                unchecked {
                    lastVotedReport.votes--;
                }
            }
        }

        Report memory currentVotedReport = proposedGERToReport[
            proposedGlobalExitRoot
        ];

        // Check if it's a new report
        if (currentVotedReport.timestamp == 0) {
            // It's a new report, set slot and votes
            currentVotedReport.timestamp = uint64(block.timestamp);
            currentVotedReport.votes = 1;
        } else {
            // It's an existing report, add a new vote
            currentVotedReport.votes++;
        }

        // Emit Submit report before check the quorum
        emit ProposedGlobalExitRoot(proposedGlobalExitRoot, msg.sender);

        // Check if it reaches the quorum
        if (currentVotedReport.votes >= quorum) {
            delete proposedGERToReport[proposedGlobalExitRoot];

            // Consolidate report
            globalExitRootManagerL2Sovereign.insertGlobalExitRoot(
                proposedGlobalExitRoot
            );
            emit ConsolidatedGlobalExitRoot(proposedGlobalExitRoot);
        } else {
            // Store submitted report with a new added vote
            proposedGERToReport[proposedGlobalExitRoot] = currentVotedReport;

            // Store voted report hash
            addressToLastProposedGER[msg.sender] = proposedGlobalExitRoot;
        }
    }

    ////////////////////////
    // Owner functions
    ////////////////////////

    /**
     * @notice Add an oracle member.
     * Only the owner can call this function.
     * @param newOracleMember Address of the new oracle member
     */
    function addOracleMember(address newOracleMember) external onlyOwner {
        _addOracleMember(newOracleMember);
    }

    /**
     * @notice Internal function to add an oracle member.
     * @param newOracleMember Address of the new oracle member
     */
    function _addOracleMember(address newOracleMember) internal {
        require(
            newOracleMember != address(0),
            OracleMemberCannotBeZero()
        );

        require(
            addressToLastProposedGER[newOracleMember] == bytes32(0),
            AlreadyOracleMember()
        );

        // Add oracle member
        addressToLastProposedGER[newOracleMember] = INITIAL_PROPOSED_GER;

        // Add oracle member to the oracleMembers array
        aggOracleMembers.push(newOracleMember);

        emit AddAggOracleMember(newOracleMember);
    }

    /**
     * @notice Remove an oracle member.
     * Only the owner can call this function.
     * @param oracleMemberAddress Address of the oracle member to remove
     * @param oracleMemberIndex Index of the oracle member to remove
     */
    function removeOracleMember(
        address oracleMemberAddress,
        uint256 oracleMemberIndex
    ) external onlyOwner {
        bytes32 lastVotedReportHash = addressToLastProposedGER[
            oracleMemberAddress
        ];

        require(lastVotedReportHash != bytes32(0), WasNotOracleMember());

        require(
            aggOracleMembers[oracleMemberIndex] == oracleMemberAddress,
            OracleMemberIndexMismatch()
        );

        // If it's not the initial report hash, check last report voted
        if (lastVotedReportHash != INITIAL_PROPOSED_GER) {
            Report storage lastVotedReport = proposedGERToReport[
                lastVotedReportHash
            ];

            // Subtract a vote of this oracle member
            // If the votes == 0, that report was already consolidated
            if (lastVotedReport.votes > 0) {
                unchecked {
                    lastVotedReport.votes--;
                }
            }
        }

        // Remove oracle member
        addressToLastProposedGER[oracleMemberAddress] = bytes32(0);

        // Remove the oracle member from the aggOracleMembers array
        aggOracleMembers[oracleMemberIndex] = aggOracleMembers[
            aggOracleMembers.length - 1
        ];
        aggOracleMembers.pop();

        emit RemoveAggOracleMember(oracleMemberAddress);
    }

    /**
     * @notice Update the quorum value.
     * Only the owner can call this function.
     * @param newQuorum New quorum value
     */
    function updateQuorum(uint64 newQuorum) external onlyOwner {
        require(newQuorum != 0, QuorumCannotBeZero());
        quorum = newQuorum;
        emit UpdateQuorum(newQuorum);
    }

    /**
     * @notice Transfer the globalExitRootUpdater role.
     * This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process.
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external onlyOwner {
        globalExitRootManagerL2Sovereign.transferGlobalExitRootUpdater(
            _newGlobalExitRootUpdater
        );
    }

    /**
     * @notice Accept the globalExitRootUpdater role.
     */
    function acceptGlobalExitRootUpdater() external onlyOwner {
        globalExitRootManagerL2Sovereign.acceptGlobalExitRootUpdater();
    }

    ///////////////////
    // View functions
    ///////////////////

    /**
     * @notice Returns the index of an oracle member.
     * @param oracleMember Oracle member address
     */
    function getAggOracleMemberIndex(
        address oracleMember
    ) external view returns (uint256) {
        for (uint256 i = 0; i < aggOracleMembers.length; ++i) {
            if (aggOracleMembers[i] == oracleMember) {
                return i;
            }
        }

        // In case the oracle member does not exist, revert
        revert OracleMemberNotFound();
    }

    /**
     * @notice Returns all the oracle members.
     */
    function getAllAggOracleMembers() external view returns (address[] memory) {
        return aggOracleMembers;
    }

    /**
     * @notice Returns the number of oracle members.
     */
    function getAggOracleMembersCount() external view returns (uint256) {
        return aggOracleMembers.length;
    }
}
