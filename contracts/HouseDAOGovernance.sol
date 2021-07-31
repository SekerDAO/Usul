// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './interfaces/IHouseDAO.sol';

contract HouseDAOGovernance is IHouseDAO {
    using SafeMath for uint;
    bool public initialized;

    string public name;

    mapping(address => Member) public members;
    mapping(uint => Proposal) public proposals;
    // use shares on member struct for balances
    uint public totalProposalCount;
    uint public memberCount;
    uint public proposalTime;
    uint public gracePeriod = 3 minutes;

    uint public totalContribution;
    uint public balance;

    uint public threshold;
    uint public minimumProposalAmount; // amount of gov tokens needed to participate
    uint public daoGovernanceSupply;
    uint public fundedProjects;

    address public governanceToken;
    address public WETH = address(0);

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
        uint _proposalTime,
        uint _daoGovernanceSupply,
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

        governanceToken = _governanceToken;
        proposalTime = _proposalTime * 1 minutes;
        threshold = _threshold;
        daoGovernanceSupply = _daoGovernanceSupply;
        minimumProposalAmount = _minimumProposalAmount;
        WETH = _weth;
    }

    function init() onlyHeadOfHouse public {
        require(initialized == false, "already initialized");
        initialized = true;
        if(daoGovernanceSupply > 0) {
            IERC20(governanceToken).transferFrom(msg.sender, address(this), daoGovernanceSupply);
        }
	}

    function vote(uint _proposalId, bool _vote) onlyMember public {
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
    function adminSendFunds(address _currency, uint _amount) onlyHeadOfHouse external {
    	IERC20(_currency).transferFrom(address(this), msg.sender, _amount);
    }

    // for now allow heads of house to update threshold
    function adminUpdateThreshold(uint _threshold) onlyHeadOfHouse external {
    	threshold = _threshold;
    }

    // for now allow heads of house to update minimumProposalAmount
    function adminUpdateMinimumProposalAmount(uint _minimumProposalAmount) onlyHeadOfHouse external {
    	minimumProposalAmount = _minimumProposalAmount;
    }

    function sendNFT(address _nftAddress, uint _nftId, address _recipient) onlyHeadOfHouse public {
        require(_nftAddress != address(0), "nft address is zero");
        require(_recipient != address(0), "_recipient is address zero");
        IERC721(_nftAddress).safeTransferFrom(address(this), _recipient, _nftId);
    }

    // make this the easy multisig version, split out
    function headOfHouseEnterMember(address _member) onlyHeadOfHouse external {
        require(IERC20(governanceToken).balanceOf(_member) >= minimumProposalAmount, "sponsor does not have enough gov tokens");
        members[_member].roles.member = true;
        memberCount++;
    }

	// for now we hard code weth as the bank token
	// function headOfhouseChangeEntryERC20(address _entryToken, uint _amount) onlyHeadOfHouse public {
	// 	require(_entryToken != address(0));
	// 	ERC20Address = _entryToken;
	// 	entryAmount = _amount;
	// }

    function addGovernanceTokens(uint _amount) external {
        require(IERC20(governanceToken).balanceOf(msg.sender) >= _amount, "member does not have enough gov tokens");
        daoGovernanceSupply = daoGovernanceSupply.add(_amount);
        require(IERC20(governanceToken).transferFrom(msg.sender, address(this), _amount));
    }

    function contribute(uint _contribution) onlyMember external {
        require(IERC20(WETH).balanceOf(msg.sender) >= _contribution, "member does not have enough weth");
        members[msg.sender].shares = members[msg.sender].shares.add(_contribution);
        totalContribution = totalContribution.add(_contribution);
        balance = balance.add(_contribution);
        require(IERC20(WETH).transferFrom(msg.sender, address(this), _contribution));
    }

    // TODO: consider only allowing withdraw durinb grace period and if they did a no vote
    function withdraw() onlyMember external {
        require(members[msg.sender].shares > 0, "no member contribution to withdraw");
        require(balance > 0, "nothing to withdraw");

        // todo: watch overflow here, work on precision 
        uint _withdrawalPercent = members[msg.sender].shares.mul(balance);
        uint _withdrawalAmount = _withdrawalPercent.div(totalContribution);

        // limited withdraw to user contribution. I think the math makes this always true
        // if(_withdrawalAmount > members[msg.sender].shares){
        // 	_withdrawalAmount = members[msg.sender].shares;
        // }

        // remove contribution percent from totalContribution
        totalContribution = totalContribution.sub(members[msg.sender].shares);
        // remove amount from member
        members[msg.sender].shares = 0;
        members[msg.sender].roles.member = false;
        members[msg.sender].roles.headOfHouse = false;
        // update the balance left
        balance = balance.sub(_withdrawalAmount);
        // send funds
        require(IERC20(WETH).transfer(msg.sender, _withdrawalAmount));
    }

    function joinDAOProposal(Role memory _role) external {
        require(members[msg.sender].roles.member == false, "already a member");
        require(IERC20(governanceToken).balanceOf(msg.sender) >= minimumProposalAmount, "join dao does not have enough gov tokens");

        proposals[totalProposalCount].role = _role;
        proposals[totalProposalCount].proposalType = 2; // 0 = funding proposal // 1 = commission art 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].hasVoted[msg.sender] = true;

        totalProposalCount++;

        emit ProposalCreated(totalProposalCount-1);
    }

    // change role, commission art, request funding
    function submitProposal(Role memory _role, address _recipient, uint _funding, uint8 _proposalType) onlyMember external {
        require(balance >= _funding, "more funds are request than the DAO currently has");
        require(members[msg.sender].activeProposal == false, "memeber has an active proposal already");
        require(IERC20(governanceToken).balanceOf(msg.sender) >= minimumProposalAmount, "submit proposal does not have enough gov tokens");

        members[msg.sender].activeProposal = true;
        proposals[totalProposalCount].fundsRequested = _funding;
        proposals[totalProposalCount].role = _role;
        proposals[totalProposalCount].proposalType = _proposalType; // 0 = funding proposal // 1 = change role // 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].targetAddress = _recipient; // can switch target to contract and provide call data
        proposals[totalProposalCount].hasVoted[msg.sender] = true;

        totalProposalCount++;
        emit ProposalCreated(totalProposalCount-1);
    }

    function submitModularProposal() public {
        // TODO
    }


    // Execute proposals
    function startFundingProposalGracePeriod(uint _proposalId) isPassed(_proposalId) external {
        require(proposals[_proposalId].proposalType == 0, "proposal is not a funding type");
        require(proposals[_proposalId].gracePeriod == 0, "proposal already entered grace period");
        require(proposals[_proposalId].deadline <= block.timestamp, "proposal deadline has not passed yet");
        proposals[_proposalId].gracePeriod = block.timestamp + gracePeriod;
        emit GracePeriodStarted(proposals[_proposalId].gracePeriod);
    }

    function startRoleProposalGracePeriod(uint _proposalId) isPassed(_proposalId) external {
        require(proposals[_proposalId].proposalType == 1 || proposals[_proposalId].proposalType == 2, "proposal is not a role type");
        require(proposals[_proposalId].gracePeriod == 0, "proposal already entered grace period");
        require(proposals[_proposalId].deadline <= block.timestamp, "proposal deadline has not passed yet");
        proposals[_proposalId].gracePeriod = block.timestamp + gracePeriod;
        emit GracePeriodStarted(proposals[_proposalId].gracePeriod);
    }

    // TODO: allow for a target erc20 so that any holdings on the dao can be sent
    // maybe do this in the general execution section
    function executeFundingProposal(uint _proposalId) isPassed(_proposalId) external {
        require(balance >= proposals[_proposalId].fundsRequested, "not enough funds on the DAO to finalize");
        require(block.timestamp >= proposals[_proposalId].gracePeriod && proposals[_proposalId].gracePeriod != 0, "grace period has not elapsed");
        balance = balance.sub(proposals[_proposalId].fundsRequested);
        members[proposals[_proposalId].proposer].activeProposal = false;
        proposals[_proposalId].executed = true;
        fundedProjects++;
        require(IERC20(WETH).transferFrom(address(this), proposals[_proposalId].targetAddress, proposals[_proposalId].fundsRequested));
    }

    //TODO: combine common requires to a modifier
    function executeChangeRoleProposal(uint _proposalId) isPassed(_proposalId) external {
        require(proposals[_proposalId].proposalType == 1, "proposal is not change role type");
        require(block.timestamp >= proposals[_proposalId].gracePeriod && proposals[_proposalId].gracePeriod != 0, "grace period has not elapsed");
        members[proposals[_proposalId].targetAddress].roles = proposals[_proposalId].role;
        members[proposals[_proposalId].proposer].activeProposal = false;
        proposals[_proposalId].executed = true;
    }

    function executeEnterDAOProposal(uint _proposalId) isPassed(_proposalId) external {
        require(proposals[_proposalId].proposalType == 2, "proposal is not enter dao type");
        require(block.timestamp >= proposals[_proposalId].gracePeriod, "grace period has not elapsed");
        members[proposals[_proposalId].proposer].roles.member = true;
        proposals[_proposalId].executed = true;
        members[proposals[_proposalId].proposer].activeProposal = false;
        memberCount++;
    }

    // actions
    function cancelEnterDAO(uint _proposalId) external {
        require(proposals[_proposalId].canceled == false, "join dao is already canceled");
        require(proposals[_proposalId].executed == false, "cannot cancel an execture join dao");
        proposals[_proposalId].canceled = true;
        members[proposals[_proposalId].proposer].activeProposal = false;
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
