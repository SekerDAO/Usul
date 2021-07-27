// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './interfaces/IDAO.sol';
import "./common/Enum.sol";

interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external returns (bool success);
}

contract Governance is IDAO {
    using SafeMath for uint;

    // DAO name
    uint private _totalProposalCount;
    uint private _proposalTime;
    uint private _gracePeriod = 60 seconds; //3 days;
    uint private _threshold;
    uint private _minimumProposalAmount; // amount of gov tokens needed to participate
    address private _safe;
    address private _governanceToken;
    address private _recoveryGuardian;

    mapping(uint => Proposal) public _proposals;
    mapping(address => Delegation) public _delegations;

    // TODO: Create a role module that is updatable and programable
    modifier onlySafe {
        require(msg.sender == _safe, "only gnosis safe may enter");
        _;
    }

    modifier isPassed(uint proposalId) {
        require(_proposals[proposalId].canceled == false, "proposal was canceled");
        require(_proposals[proposalId].executed == false, "proposal already executed");
        require(_proposals[proposalId].yesVotes >= _threshold, "proposal does not meet vote threshold");
        require(_proposals[proposalId].yesVotes >= _proposals[proposalId].noVotes, "no votes outweigh yes");
    	_;
    }

    event ProposalCreated(uint number);
    event GracePeriodStarted(uint endDate);

    constructor(
        address governanceToken_,
        address safe_,
        uint proposalTime_,
        uint threshold_,
        uint minimumProposalAmount_
    ) {
        _safe = safe_;
        _governanceToken = governanceToken_;
        _proposalTime = proposalTime_ * 1 minutes;//days;
        _threshold = threshold_;
        _minimumProposalAmount = minimumProposalAmount_;
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

    // function members(uint id) public view virtual returns (Member memory) {
    //     return _members[id];
    // }

    // function proposals(uint id) public view virtual returns (Proposal memory) {
    //     return _proposals[id];
    // }

    function delegate() external {
        // lock tokens
        // find a way to ensure only one proposal at a time
    }

    function vote(uint proposalId, bool vote) external {
        require(_proposals[proposalId].hasVoted[msg.sender] == false, "already voted");
        require(_proposals[proposalId].canceled == false, "proposal has been canceled");
        require(_proposals[proposalId].executed == false, "proposal is already executed");
        require(_proposals[proposalId].deadline >= block.timestamp, "proposal is past the deadline");

        _proposals[proposalId].hasVoted[msg.sender] = true;

        if(vote == false){
            _proposals[proposalId].noVotes = _proposals[proposalId].noVotes.add(IERC20(_governanceToken).balanceOf(msg.sender));
        } else {
            _proposals[proposalId].yesVotes = _proposals[proposalId].yesVotes.add(IERC20(_governanceToken).balanceOf(msg.sender));
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
        //require(_members[msg.sender].activeProposal == false, "memeber has an active proposal already");
        require(IERC20(_governanceToken).balanceOf(msg.sender) >= _minimumProposalAmount, "submit proposal does not have enough gov tokens");
        // store calldata for tx to be executed
        //_members[msg.sender].activeProposal = true;
        _proposals[_totalProposalCount].value = value;
        _proposals[_totalProposalCount].yesVotes = IERC20(_governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        _proposals[_totalProposalCount].deadline = block.timestamp + _proposalTime;
        _proposals[_totalProposalCount].proposer = msg.sender;
        _proposals[_totalProposalCount].hasVoted[msg.sender] = true;
        _proposals[_totalProposalCount].targetAddress = to; // can switch target to contract and provide call data
        _proposals[_totalProposalCount].data = data;
        _proposals[_totalProposalCount].operation = Enum.Operation.Call;

        _totalProposalCount++;
        emit ProposalCreated(_totalProposalCount-1);
    }

    // Execute proposals
    function startModularGracePeriod(uint proposalId) isPassed(proposalId) external {
        require(_proposals[proposalId].gracePeriod == 0, "proposal already entered grace period");
        require(_proposals[proposalId].deadline <= block.timestamp, "proposal deadline has not passed yet");
        _proposals[proposalId].gracePeriod = block.timestamp + _gracePeriod;
        emit GracePeriodStarted(_proposals[proposalId].gracePeriod);
    }

    function executeModularProposal(uint proposalId) isPassed(proposalId) external {
        require(block.timestamp >= _proposals[proposalId].gracePeriod && _proposals[proposalId].gracePeriod != 0, "grace period has not elapsed");
        //_members[_proposals[proposalId].proposer].activeProposal = false;
        _proposals[proposalId].executed = true;
        ISafe(_safe).execTransactionFromModule(
            _proposals[proposalId].targetAddress,
            _proposals[proposalId].value,
            _proposals[proposalId].data,
            _proposals[proposalId].operation
        );
    }

    function cancelProposal(uint proposalId) external {
        require(_proposals[proposalId].canceled == false);
        require(_proposals[proposalId].executed == false);
        require(_proposals[proposalId].deadline >= block.timestamp);
        require(_proposals[proposalId].proposer == msg.sender);
        _proposals[proposalId].canceled = true;
        //_members[_proposals[proposalId].proposer].activeProposal = false;
    }

    // todo: consider putting this in roles, and requiring roles module to burn federation
    function burnFederation(address lastAdmin) external {
        // require sender is last admin
        _recoveryGuardian = lastAdmin;
        // construct calldata for setting last safe admin to burn address
    }

    function restoreFederation() external {
        // only recoveryGuardian
        // replace burn admin with guardian
        // remove dao module
    }
}
