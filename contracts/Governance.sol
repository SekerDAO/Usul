// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import "./common/Enum.sol";

interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external returns (bool success);
}

contract Governance {
    using SafeMath for uint;

    struct Delegation {
        mapping(address => uint) votes;
        uint lastBlock;
        uint total;
    }

    struct Proposal {
        uint256 value;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal        
        bool executed;
        bool queued;
        uint deadline;
        address proposer;
        bool canceled;
        uint gracePeriod;
        mapping(address => bool) hasVoted;
        address targetAddress;
        bytes data;
        Enum.Operation operation;
    }

    // DAO name
    uint private _totalProposalCount;
    uint private _proposalTime;
    uint private _gracePeriod = 60 seconds; //3 days;
    uint private _threshold;
    uint private _minimumProposalAmount; // amount of gov tokens needed to participate
    address private _safe;
    address private _governanceToken;
    address private _guardian;

    mapping(uint => Proposal) public proposals;
    mapping(address => Delegation) delegations;

    // TODO: Create a role module that is updatable and programable
    modifier onlySafe {
        require(msg.sender == _safe, "only gnosis safe may enter");
        _;
    }

    modifier isPassed(uint proposalId) {
        require(proposals[proposalId].canceled == false, "proposal was canceled");
        require(proposals[proposalId].executed == false, "proposal already executed");
        require(proposals[proposalId].yesVotes >= _threshold, "proposal does not meet vote threshold");
        require(proposals[proposalId].yesVotes >= proposals[proposalId].noVotes, "no votes outweigh yes");
    	_;
    }

    event ProposalCreated(uint number);
    event GracePeriodStarted(uint endDate);

    constructor(
        address governanceToken_,
        address safe_,
        uint proposalTime_,
        uint threshold_,
        uint minimumProposalAmount_,
        address guardian_
    ) {
        _safe = safe_;
        _governanceToken = governanceToken_;
        _proposalTime = proposalTime_ * 1 minutes;//days;
        _threshold = threshold_;
        _minimumProposalAmount = minimumProposalAmount_;
        _guardian = guardian_;
    }

    // getters
    function threshold() public view virtual returns (uint) {
        return _threshold;
    }

    function totalProposalCount() public view virtual returns (uint) {
        return _totalProposalCount;
    }

    function gracePeriod() public view virtual returns (uint) {
        return _gracePeriod;
    }

    function minimumProposalAmount() public view virtual returns (uint) {
        return _minimumProposalAmount;
    }

    function delegateVotes(address delegatee, uint amount) external {
        // lock tokens
        // find a way to ensure only one proposal at a time
        IERC20(_governanceToken).transferFrom(msg.sender, address(this), amount);
        delegations[delegatee].votes[msg.sender] = amount;
        delegations[delegatee].lastBlock = block.number;
        delegations[delegatee].total = delegations[delegatee].total.add(amount);
    }

    function undelegateVotes(address delegatee, uint amount) external {
        require(delegations[delegatee].votes[msg.sender] >= amount);
        IERC20(_governanceToken).transfer(msg.sender, amount);
        delegations[delegatee].votes[msg.sender] = delegations[delegatee].votes[msg.sender].sub(amount);
    }

    function vote(uint proposalId, bool vote) external {
        require(proposals[proposalId].hasVoted[msg.sender] == false, "already voted");
        require(proposals[proposalId].canceled == false, "proposal has been canceled");
        require(proposals[proposalId].executed == false, "proposal is already executed");
        require(proposals[proposalId].deadline >= block.timestamp, "proposal is past the deadline");
        require(delegations[msg.sender].lastBlock < block.number, "cannot vote in the same block as delegation");

        proposals[proposalId].hasVoted[msg.sender] = true;

        if(vote == false){
            proposals[proposalId].noVotes = proposals[proposalId].noVotes.add(delegations[msg.sender].total);
        } else {
            proposals[proposalId].yesVotes = proposals[proposalId].yesVotes.add(delegations[msg.sender].total);
        }
    }

    // for now allow heads of house to update threshold
    function updateThreshold(uint threshold) onlySafe external {
    	_threshold = threshold;
    }

    // for now allow heads of house to update minimumProposalAmount
    function updateMinimumProposalAmount(uint minimumProposalAmount) onlySafe external {
    	_minimumProposalAmount = minimumProposalAmount;
    }

    // for now allow heads of house to update proposalTime
    function updateProposalTime(uint newTime) onlySafe external {
        _proposalTime = newTime;
    }

    // for now allow heads of house to update gracePeriod
    function updateGracePeriod(uint gracePeriod) onlySafe external {
        _gracePeriod = gracePeriod;
    }

    function submitModularProposal(
        address to,
        uint256 value,
        bytes memory data
        //Enum.Operation _operation
    ) public {
        require(IERC20(_governanceToken).balanceOf(msg.sender) >= _minimumProposalAmount, "submit proposal does not have enough gov tokens");
        // store calldata for tx to be executed
        proposals[_totalProposalCount].value = value;
        proposals[_totalProposalCount].yesVotes = IERC20(_governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[_totalProposalCount].deadline = block.timestamp + _proposalTime;
        proposals[_totalProposalCount].proposer = msg.sender;
        proposals[_totalProposalCount].hasVoted[msg.sender] = true;
        proposals[_totalProposalCount].targetAddress = to; // can switch target to contract and provide call data
        proposals[_totalProposalCount].data = data;
        proposals[_totalProposalCount].operation = Enum.Operation.Call;

        _totalProposalCount++;
        emit ProposalCreated(_totalProposalCount-1);
    }

    // Execute proposals
    function startModularGracePeriod(uint proposalId) isPassed(proposalId) external {
        require(proposals[proposalId].gracePeriod == 0, "proposal already entered grace period");
        require(proposals[proposalId].deadline <= block.timestamp, "proposal deadline has not passed yet");
        proposals[proposalId].gracePeriod = block.timestamp + _gracePeriod;
        emit GracePeriodStarted(proposals[proposalId].gracePeriod);
    }

    function executeModularProposal(uint proposalId) isPassed(proposalId) external {
        require(block.timestamp >= proposals[proposalId].gracePeriod && proposals[proposalId].gracePeriod != 0, "grace period has not elapsed");
        proposals[proposalId].executed = true;
        ISafe(_safe).execTransactionFromModule(
            proposals[proposalId].targetAddress,
            proposals[proposalId].value,
            proposals[proposalId].data,
            proposals[proposalId].operation
        );
    }

    function cancelProposal(uint proposalId) external {
        require(proposals[proposalId].canceled == false);
        require(proposals[proposalId].executed == false);
        require(proposals[proposalId].deadline >= block.timestamp);
        // proposal guardian can be put in the roles module
        require(proposals[proposalId].proposer == msg.sender || _guardian == msg.sender);
        proposals[proposalId].canceled = true;
    }
}