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

    string public name;

    mapping(address => Member) public members;
    mapping(uint => Proposal) public proposals;

    uint public totalProposalCount;
    uint public memberCount;
    uint public proposalTime;
    uint public gracePeriod = 60 seconds; //3 days;

    uint public threshold;
    uint public minimumProposalAmount; // amount of gov tokens needed to participate

    address public safe;
    address public governanceToken;
    address public WETH = address(0);

    // TODO: Create a role module that is updatable and programable
    modifier onlySafe {
        require(msg.sender == safe, "only gnosis safe may enter");
        _;
    }

    modifier onlyMember {
        require(members[msg.sender].roles.member == true, "not a member");
        _;
    }

    modifier onlyHeadOfHouse {
        require(members[msg.sender].roles.headOfHouse == true, "not a head of house");
        _;
    }

    modifier isPassed(uint _proposalId) {
        require(proposals[_proposalId].canceled == false, "proposal was canceled");
        require(proposals[_proposalId].executed == false, "proposal already executed");
        require(proposals[_proposalId].yesVotes >= threshold, "proposal does not meet vote threshold");
        require(proposals[_proposalId].yesVotes >= proposals[_proposalId].noVotes, "no votes outweigh yes");
    	_;
    }

    event ProposalCreated(uint number);
    event GracePeriodStarted(uint endDate);

    constructor(
        address[] memory heads,
        address _governanceToken,
        address _safe,
        uint _proposalTime,
        uint _threshold,
        uint _minimumProposalAmount,
        address _weth //finance token... hard code as ether for v0
    ) {
        for(uint i=0; i<heads.length; i++) {
            // create head of house member struct
            require(heads[i] != address(0));
            members[heads[i]].roles.headOfHouse = true;
            members[heads[i]].roles.member = true;
            memberCount++;
        }
        safe = _safe;
        governanceToken = _governanceToken;
        proposalTime = _proposalTime * 1 minutes;//days;
        threshold = _threshold;
        minimumProposalAmount = _minimumProposalAmount;
        WETH = _weth;
    }

    function vote(uint _proposalId, bool _vote) onlyMember external {
        require(proposals[_proposalId].hasVoted[msg.sender] == false, "already voted");
        require(proposals[_proposalId].canceled == false, "proposal has been canceled");
        require(proposals[_proposalId].executed == false, "proposal is already executed");
        require(proposals[_proposalId].deadline >= block.timestamp, "proposal is past the deadline");

        proposals[_proposalId].hasVoted[msg.sender] = true;

        if(_vote == false){
            proposals[_proposalId].noVotes = proposals[_proposalId].noVotes.add(IERC20(governanceToken).balanceOf(msg.sender));
        } else {
            proposals[_proposalId].yesVotes = proposals[_proposalId].yesVotes.add(IERC20(governanceToken).balanceOf(msg.sender));
        }
    }

    // for now allow heads of house to update threshold
    function updateThreshold(uint _threshold) onlySafe external {
    	threshold = _threshold;
    }

    // for now allow heads of house to update minimumProposalAmount
    function updateMinimumProposalAmount(uint _minimumProposalAmount) onlySafe external {
    	minimumProposalAmount = _minimumProposalAmount;
    }

    // for now allow heads of house to update minimumProposalAmount
    function updateProposalTime(uint _newTime) onlySafe external {
        proposalTime = _newTime;
    }

    // make this the easy multisig version, split out
    function headOfHouseEnterMember(address _member) onlySafe external {
        require(IERC20(governanceToken).balanceOf(_member) >= minimumProposalAmount, "sponsor does not have enough gov tokens");
        members[_member].roles.member = true;
        memberCount++;
    }

    function headOfHouseRemoveMember(address _member) onlySafe external {
        require(IERC20(governanceToken).balanceOf(_member) >= minimumProposalAmount, "sponsor does not have enough gov tokens");
        members[_member].roles.member = false;
        members[_member].roles.headOfHouse = false;
        memberCount--;
    }

    function submitModularProposal(
        address _to,
        uint256 _value,
        bytes memory _data
        //Enum.Operation _operation
    ) public {
        require(members[msg.sender].activeProposal == false, "memeber has an active proposal already");
        require(IERC20(governanceToken).balanceOf(msg.sender) >= minimumProposalAmount, "submit proposal does not have enough gov tokens");
        // store calldata for tx to be executed
        members[msg.sender].activeProposal = true;
        proposals[totalProposalCount].value = _value;
        proposals[totalProposalCount].proposalType = 3; // 0 = funding proposal // 1 = change role // 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].hasVoted[msg.sender] = true;
        proposals[totalProposalCount].targetAddress = _to; // can switch target to contract and provide call data
        proposals[totalProposalCount].data = _data;
        proposals[totalProposalCount].operation = Enum.Operation.Call;

        totalProposalCount++;
        emit ProposalCreated(totalProposalCount-1);
    }

    // Execute proposals
    function startModularGracePeriod(uint _proposalId) isPassed(_proposalId) external {
        require(proposals[_proposalId].proposalType == 3, "proposal is not a funding type");
        require(proposals[_proposalId].gracePeriod == 0, "proposal already entered grace period");
        require(proposals[_proposalId].deadline <= block.timestamp, "proposal deadline has not passed yet");
        proposals[_proposalId].gracePeriod = block.timestamp + gracePeriod;
        emit GracePeriodStarted(proposals[_proposalId].gracePeriod);
    }

    function executeModularProposal(uint _proposalId) isPassed(_proposalId) external {
        require(proposals[_proposalId].proposalType == 3, "proposal is not change role type");
        require(block.timestamp >= proposals[_proposalId].gracePeriod && proposals[_proposalId].gracePeriod != 0, "grace period has not elapsed");
        members[proposals[_proposalId].proposer].activeProposal = false;
        proposals[_proposalId].executed = true;
        ISafe(safe).execTransactionFromModule(
            proposals[_proposalId].targetAddress,
            proposals[_proposalId].value,
            proposals[_proposalId].data,
            proposals[_proposalId].operation
        );
    }

    function cancelProposal(uint _proposalId) external {
        require(proposals[_proposalId].canceled == false);
        require(proposals[_proposalId].executed == false);
        require(proposals[_proposalId].deadline >= block.timestamp);
        require(proposals[_proposalId].proposer == msg.sender);
        proposals[_proposalId].canceled = true;
        members[proposals[_proposalId].proposer].activeProposal = false;
    }
}
