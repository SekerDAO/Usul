// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "../interfaces/IProposal.sol";

// refactor with OZ delegation 
contract LinearVoting is EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant VOTE_TYPEHASH = keccak256("Vote(uint256 proposalId,uint8 vote)");

    struct Delegation {
        mapping(address => uint256) votes;
        uint256 undelegateDelay;
        uint256 lastBlock;
        uint256 total;
    }

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
        mapping(address => bool) hasVoted;
    }

    uint256 public proposalWindow; // the length of time voting is valid for a proposal
    address public governanceToken;
    address public seeleModule;
    uint256 public quorumThreshold; // minimum number of votes for proposal to succeed
    uint256 public totalProposalCount; // total number of submitted proposals
    /// @dev Address that this module will pass transactions to.
    address public avatar;
    string private _name;

    mapping(address => uint256) public nonces;
    mapping(address => Delegation) public delegations;
    mapping(uint256 => ProposalVoting) public proposals;

    modifier onlyAvatar() {
        require(msg.sender == avatar, "TW001");
        _;
    }

    modifier onlySeele() {
        require(msg.sender == seeleModule, "only seele module may enter");
        _;
    }

    event VotesDelegated(uint256 number);
    event VotesUndelegated(uint256 number);

    constructor(
        uint256 _proposalWindow,
        address _governanceToken,
        address _seeleModule,
        uint256 _quorumThreshold,
        address _avatar,
        string memory name_
    ) EIP712(name_, version()) {
        proposalWindow = _proposalWindow;
        governanceToken = _governanceToken;
        seeleModule = _seeleModule;
        quorumThreshold = _quorumThreshold;
        avatar = _avatar;
        _name = name_;
    }

    /**
     * @dev See {IGovernor-name}.
     */
    function name() public view virtual returns (string memory) {
        return _name;
    }

    /**
     * @dev See {IGovernor-version}.
     */
    function version() public view virtual returns (string memory) {
        return "1";
    }

    function getThreshold() external view returns (uint256) {
        return quorumThreshold;
    }

    function getDelegatorVotes(address delegatee, address delegator)
        public
        view
        virtual
        returns (uint256)
    {
        return delegations[delegatee].votes[delegator];
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setAvatar(address _avatar) public onlyAvatar {
        avatar = _avatar;
    }

    /// @dev Updates the quorum needed to pass a proposal, only executor.
    /// @param _quorumThreshold the voting quorum threshold.
    function updateThreshold(uint256 _quorumThreshold) external onlyAvatar {
        quorumThreshold = _quorumThreshold;
    }

    // todo erc712 delegation
    // ensure all votes are delegated
    function delegateVotes(address delegatee, uint256 amount) external {
        IERC20(governanceToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        delegations[delegatee].votes[msg.sender] = delegations[delegatee]
            .votes[msg.sender] + amount;
        delegations[delegatee].lastBlock = block.number;
        // can make the total 1-1 here
        delegations[delegatee].total = delegations[delegatee].total + amount;
    }

    // todo remove
    // move delegation to a compound specific module
    function undelegateVotes(address delegatee, uint256 amount) external {
        require(
            delegations[delegatee].undelegateDelay <= block.timestamp,
            "TW024"
        );
        require(delegations[delegatee].votes[msg.sender] >= amount, "TW020");
        IERC20(governanceToken).safeTransfer(msg.sender, amount);
        delegations[delegatee].votes[msg.sender] = delegations[delegatee]
            .votes[msg.sender] - amount;
        delegations[delegatee].total = delegations[delegatee].total - amount;
    }

    /// @dev Updates the time that proposals are active for voting.
    /// @return proposal time window.
    function getProposalWindow() public view returns (uint256) {
        return proposalWindow;
    }

    /// @dev Updates the time that proposals are active for voting.
    /// @param newWindow the voting window.
    function updateproposalWindow(uint256 newWindow) external onlyAvatar {
        proposalWindow = newWindow;
    }

    // todo: erc712 voting
    /// @dev Returns true if an account has voted on a specific proposal.
    /// @param proposalId the proposal to inspect.
    /// @param account the account to inspect.
    /// @return boolean.
    function hasVoted(uint256 proposalId, address account) public view returns (bool) {
        return proposals[proposalId].hasVoted[account];
    }

    function vote(uint256 proposalId, uint8 vote) public {
        delegations[msg.sender].undelegateDelay =
            block.timestamp +
            IProposal(proposalModule).getProposalWindow();
        require(checkBlock(msg.sender), "TW021");

        proposals[proposalId].hasVoted[voter] = true;
        uint256 weight = calculateWeight(msg.sender);
        if (vote == uint8(VoteType.Against)) {
            proposals[proposalId].noVotes =
                proposals[proposalId].noVotes +
                weight;
        } else if (vote == uint8(VoteType.For)) {
            proposals[proposalId].yesVotes =
                proposals[proposalId].yesVotes +
                weight;
        } else if (vote == uint8(VoteType.Abstain)) {
            proposals[proposalId].abstainVotes =
                proposals[proposalId].abstainVotes +
                weight;
        } else {
            revert("invalid value for enum VoteType");
        }
        // IProposal(proposalModule).receiveVote(
        //     msg.sender,
        //     proposalId,
        //     vote,
        //     calculateWeight(msg.sender)
        // );
    }

    function receiveProposal(uint256 proposalId, uint8 vote) public {
        delegations[msg.sender].undelegateDelay =
            block.timestamp +
            IProposal(proposalModule).getProposalWindow();
        require(checkBlock(msg.sender), "TW021");
        IProposal(proposalModule).receiveVote(
            msg.sender,
            proposalId,
            vote,
            calculateWeight(msg.sender)
        );
    }

    function voteSignature(
        address delegatee,
        uint256 proposalId,
        uint8 vote,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        address voter = ECDSA.recover(
            _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, proposalId, vote))),
            v,
            r,
            s
        );
        require(
            voter != address(0) && voter == delegatee,
            "voter doesn not match delegatee"
        );
        delegations[voter].undelegateDelay =
            block.timestamp +
            IProposal(proposalModule).getProposalWindow();
        require(checkBlock(msg.sender), "TW021");
        IProposal(proposalModule).receiveVote(
            voter,
            proposalId,
            vote,
            calculateWeight(voter)
        );
    }

    function isPassed(uint256 proposalId, address votingStrategy) public view returns (bool) {
        require(proposals[proposalId].canceled == false, "the proposal was canceled before passing");
        require(proposals[proposalId].yesVotes > proposals[proposalId].noVotes, "the yesVotes must be strictly over the noVotes");
        require(proposals[proposalId].yesVotes + proposals[proposalId].abstainVotes >= IVoting(votingStrategy).getThreshold(), "a quorum has not been reached for the proposal");
        return true;
    }

    function cancelProposal(uint256 proposalId) external {
        Proposal storage _proposal = proposals[proposalId];
        require(_proposal.canceled == false, "TW016");
        require(_proposal.executionCounter > 0, "TW017");
        // proposal guardian can be put in the roles module
        require(
            _proposal.proposer == msg.sender ||
                msg.sender == avatar,
            "TW019"
        );
        _proposal.canceled = true;
        //activeProposal[proposals[proposalId].proposer] = false;
    }
    
    function calculateWeight(address delegatee) public view returns (uint256) {
        uint256 votes = delegations[delegatee].votes[delegatee];
        require(delegations[delegatee].total > 0, "TW035");
        return delegations[delegatee].total;
    }

    function checkBlock(address delegatee) public view returns (bool) {
        return (delegations[delegatee].lastBlock != block.number);
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
