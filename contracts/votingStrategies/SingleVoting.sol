// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./Strategy.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract SingleVoting is Strategy, EIP712 {
    bytes32 public constant VOTE_TYPEHASH =
        keccak256("Vote(uint256 proposalId,uint8 vote)");

    enum VoteType {
        Against,
        For,
        Abstain
    }

    struct ProposalVoting {
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        uint256 abstainVotes; // introduce abstain votes
        uint256 deadline; // voting deadline TODO: consider using block number
        uint256 startBlock; // the starting block of the proposal
        mapping(address => bool) hasVoted;
    }

    uint256 public votingPeriod; // the length of time voting is valid for a proposal
    uint256 public quorumThreshold; // minimum number of votes for proposal to succeed
    uint256 public timeLockPeriod;
    string private _name;
    uint256 public memberCount;

    mapping(address => uint256) public nonces;
    mapping(uint256 => ProposalVoting) public proposals;
    mapping(address => bool) public members;

    modifier onlyMember() {
        require(members[msg.sender] == true);
        _;
    }

    event TimeLockUpdated(uint256 newTimeLockPeriod);

    constructor(
        uint256 _votingPeriod,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        address _avatar,
        string memory name_
    ) EIP712(name_, version()) {
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        seeleModule = _seeleModule;
        quorumThreshold = _quorumThreshold;
        avatar = _avatar;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
    }

    /// @dev ERC712 name.
    function name() public view virtual returns (string memory) {
        return _name;
    }

    ///@dev ERC712 version.
    function version() public view virtual returns (string memory) {
        return "1";
    }

    function getThreshold() external view returns (uint256) {
        return quorumThreshold;
    }

    /// @dev Updates the quorum needed to pass a proposal, only executor.
    /// @param _quorumThreshold the voting quorum threshold.
    function updateThreshold(uint256 _quorumThreshold) external onlyAvatar {
        quorumThreshold = _quorumThreshold;
    }

    /// @dev Updates the time that proposals are active for voting.
    /// @param newPeriod the voting window.
    function updateVotingPeriod(uint256 newPeriod) external onlyAvatar {
        votingPeriod = newPeriod;
    }

    /// @dev Updates the grace period time after a proposal passed before it can execute.
    /// @param newTimeLockPeriod the new delay before execution.
    function updateTimeLockPeriod(uint256 newTimeLockPeriod)
        external
        onlyAvatar
    {
        timeLockPeriod = newTimeLockPeriod;
        emit TimeLockUpdated(newTimeLockPeriod);
    }

    function addMember(address member) public onlyAvatar {
        members[member] = true;
        memberCount++;
    }

    function removeMember(address member) public onlyAvatar {
        members[member] = false;
        memberCount--;
    }

    /// @dev Returns true if an account has voted on a specific proposal.
    /// @param proposalId the proposal to inspect.
    /// @param account the account to inspect.
    /// @return boolean.
    function hasVoted(uint256 proposalId, address account)
        public
        view
        returns (bool)
    {
        return proposals[proposalId].hasVoted[account];
    }

    /// @dev Submits a vote for a proposal.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    function vote(uint256 proposalId, uint8 support) external virtual {
        _vote(proposalId, msg.sender, support);
    }

    /// @dev Submits a vote for a proposal by ERC712 signature.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    /// @param v the Signature v value.
    /// @param r the Signature r value.
    /// @param s the Signature s value.
    function voteSignature(
        uint256 proposalId,
        uint8 support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual {
        address voter = ECDSA.recover(
            _hashTypedDataV4(
                keccak256(abi.encode(VOTE_TYPEHASH, proposalId, support))
            ),
            v,
            r,
            s
        );
        _vote(proposalId, voter, support);
    }

    function _vote(
        uint256 proposalId,
        address voter,
        uint8 support
    ) internal {
        require(
            block.timestamp <= proposals[proposalId].deadline,
            "voting period has passed"
        );
        require(!hasVoted(proposalId, voter), "voter has already voted");
        uint256 weight = calculateWeight(msg.sender);
        proposals[proposalId].hasVoted[voter] = true;
        if (support == uint8(VoteType.Against)) {
            proposals[proposalId].noVotes =
                proposals[proposalId].noVotes +
                weight;
        } else if (support == uint8(VoteType.For)) {
            proposals[proposalId].yesVotes =
                proposals[proposalId].yesVotes +
                weight;
        } else if (support == uint8(VoteType.Abstain)) {
            proposals[proposalId].abstainVotes =
                proposals[proposalId].abstainVotes +
                weight;
        } else {
            revert("invalid value for enum VoteType");
        }
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data) external override onlySeele {
        uint256 proposalId = abi.decode(data, (uint256));
        proposals[proposalId].deadline = votingPeriod + block.timestamp;
        proposals[proposalId].startBlock = block.number;
    }

    /// @dev Calls the proposal module to notify that a quorum has been reached.
    /// @param proposalId the proposal to vote for.
    function finalizeVote(uint256 proposalId) public override {
        if (isPassed(proposalId)) {
            IProposal(seeleModule).receiveStrategy(proposalId, timeLockPeriod);
        }
    }

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view override returns (bool) {
        require(
            proposals[proposalId].yesVotes > proposals[proposalId].noVotes,
            "the yesVotes must be strictly over the noVotes"
        );
        require(
            proposals[proposalId].yesVotes +
                proposals[proposalId].abstainVotes >=
                quorumThreshold,
            "a quorum has not been reached for the proposal"
        );
        require(
            proposals[proposalId].deadline < block.timestamp,
            "voting period has not passed yet"
        );
        return true;
    }

    function calculateWeight(address voter) public view returns (uint256) {
        require(members[voter], "voter is not a member");
        return 1;
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public view returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }
}
