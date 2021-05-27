// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './interfaces/IHouseDAO.sol';

contract HouseDAOGovernance is IHouseDAO {
	using SafeMath for uint;
	bool public initialized = false;

	mapping(address => Member) public members;
	mapping(uint => Proposal) public proposals;
	// use shares on member struct for balances
	uint public totalProposalCount = 0;
	uint public proposalTime;
	uint public gracePeriod = 3 days;

	uint public totalContribution;
	uint public balance;

	uint public threshold;
	uint public entryAmount;
	uint public totalGovernanceSupply;
	uint public remainingSupply;
	// address private initialCoordinator;

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

	constructor(
		address[] memory heads,
		address _governanceToken,
		uint _entryAmount,
		uint _proposalTime,
		uint _totalGovernanceSupply,
		uint _threshold,
		address _weth
	) {
		//initialCoordinator = msg.sender;
		for(uint i=0; i<heads.length; i++) {
			// create head of house member struct
			require(heads[i] != address(0));
			members[heads[i]].roles.headOfHouse = true;
			members[heads[i]].roles.member = true;
		}

		governanceToken = _governanceToken;
		entryAmount = _entryAmount;
		proposalTime = _proposalTime * 1 days;
		threshold = _threshold;
		totalGovernanceSupply = _totalGovernanceSupply;
		remainingSupply = _totalGovernanceSupply;
		WETH = _weth;
	}

	function init() onlyHeadOfHouse public {
		require(initialized == false, "already initialized");
		initialized = true;
		IERC20(governanceToken).transferFrom(msg.sender, address(this), totalGovernanceSupply);
	}

	function vote(uint _proposalId, bool _vote) onlyMember public {
		require(proposals[_proposalId].proposer != msg.sender, "cannot vote for yourself again");
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

	// make this the easy multisig version, split out
	function headOfHouseEnterMember(address _member, uint _contribution) onlyHeadOfHouse public {
		require(_contribution >= entryAmount, "Head did not sponsor enough");
		require(IERC20(WETH).balanceOf(_member) >= _contribution, "sponsor does not have contribution");

		members[_member].roles.member = true;
		members[_member].shares = _contribution;

		if(_contribution > 0) {
			totalContribution = totalContribution.add(_contribution);
			balance = balance.add(_contribution);
			IERC20(WETH).transferFrom(_member, address(this), _contribution);
			IERC20(governanceToken).transfer(_member, _contribution);
			remainingSupply = remainingSupply.sub(_contribution);
		}	
	}

	// for now we hard code weth as the bank token
	// function headOfhouseChangeEntryERC20(address _entryToken, uint _amount) onlyHeadOfHouse public {
	// 	require(_entryToken != address(0));
	// 	ERC20Address = _entryToken;
	// 	entryAmount = _amount;
	// }

	function addMoreContribution(uint _contribution) onlyMember public {
		require(IERC20(WETH).balanceOf(msg.sender) >= _contribution, "member does not have enough weth");

		members[msg.sender].shares = members[msg.sender].shares.add(_contribution);
		totalContribution = totalContribution.add(_contribution);
		balance = balance.add(_contribution);

		require(IERC20(WETH).transferFrom(msg.sender, address(this), _contribution));

		// check to see if there are enough gov tokens left to award
		if(IERC20(governanceToken).balanceOf(address(this)) > _contribution) {
			require(IERC20(governanceToken).transfer(msg.sender, _contribution));
		}

		remainingSupply = remainingSupply.sub(_contribution);
	}

	function withdraw() onlyMember public {
		require(members[msg.sender].shares > 0, "no member contribution to withdraw");

		// todo: watch overflow here, work on precision 
		uint _withdrawalPercent = members[msg.sender].shares.mul(balance);
		uint _withdrawalAmount = _withdrawalPercent.div(totalContribution);

		// remove contribution percent from totalContribution
		totalContribution = totalContribution.sub(members[msg.sender].shares);
		// remove amount from member
		members[msg.sender].shares = 0;
		// update the balance left
		balance = balance.sub(_withdrawalAmount);
		// send funds
		require(IERC20(WETH).transfer(msg.sender, _withdrawalAmount));
	}

	function sendNFT(address _nftAddress, uint _nftId, address _recipient) onlyHeadOfHouse public {
		require(_nftAddress != address(0), "nft address is zero");
		require(_recipient != address(0), "_recipient is address zero");
		IERC721(_nftAddress).safeTransferFrom(address(this), _recipient, _nftId);
	}


	// change this, no contribution needed, use a gov token
	// if you have a gov token you get a membership
	// if you don't you can put up an entry proposal and get issued gov tokens
	function joinDAOProposal(uint _contribution, Role memory _role) public {
		require(_contribution >= entryAmount, "contribution is not higher than minimum");
		require(IERC20(WETH).balanceOf(msg.sender) >= _contribution, "proposer does not have enough weth");

    	proposals[totalProposalCount].fundsRequested = _contribution;
    	proposals[totalProposalCount].role = _role;
    	proposals[totalProposalCount].proposalType = 2; // 0 = funding proposal // 1 = commission art 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].hasVoted[msg.sender] = true;

        totalProposalCount++;

        require(IERC20(WETH).transferFrom(msg.sender, address(this), _contribution));
	}

	// used for
	// change role, commission art, request funcing
	function submitProposal(Role memory _role, address _recipient, uint _funding, uint8 _proposalType) onlyMember public {
		require(balance >= _funding, "more funds are request than the DAO currently has");

    	proposals[totalProposalCount].fundsRequested = _funding;
    	proposals[totalProposalCount].role = _role;
    	proposals[totalProposalCount].proposalType = _proposalType; // 0 = funding proposal // 1 = change role // 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].targetAddress = _recipient; // can switch target to contract and provide call data
        proposals[totalProposalCount].hasVoted[msg.sender] = true;

        totalProposalCount++;
	}


	// Execute proposals
	// todo: maybe check if over threshold on every vote, if so start grace period
	function startFundingProposalGracePeriod(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false, "proposal was canceled");
		require(proposals[_proposalId].executed == false, "proposal already executed");
		require(proposals[_proposalId].proposalType == 0, "proposal is not a funding type");
		require(proposals[_proposalId].yesVotes >= threshold, "votes do not meet the threshold");
		require(proposals[_proposalId].gracePeriod == 0, "proposal already entered grace period");
		
		proposals[_proposalId].gracePeriod = block.timestamp + gracePeriod;
	}

	function finalizeFundingProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false, "proposal canceled or already finalized");
		require(balance >= proposals[_proposalId].fundsRequested, "not enough funds on the DAO to finalize");
		require(proposals[_proposalId].executed == false, "proposal has already been executed");
		require(block.timestamp >= proposals[_proposalId].gracePeriod, "grace period has not elapsed");

		balance = balance.sub(proposals[_proposalId].fundsRequested);
		proposals[_proposalId].executed = true;
		require(IERC20(WETH).transferFrom(address(this), proposals[_proposalId].targetAddress, proposals[_proposalId].fundsRequested));
	}

	function executeChangeRoleProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false, "change role proposal canceled");
		require(proposals[_proposalId].executed == false, "change role proposal already executed");
		require(proposals[_proposalId].proposalType == 1, "proposal is not change role type");
		require(proposals[_proposalId].yesVotes >= threshold, "change role does not meet vote threshold");

		members[proposals[_proposalId].targetAddress].roles = proposals[_proposalId].role;
		proposals[_proposalId].executed = true;
	}

	function executeEnterDAOProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false, "enter dao is canceled");
		require(proposals[_proposalId].executed == false, "enter dao already executed");
		require(proposals[_proposalId].proposalType == 2, "proposal is not enter dao type");
		require(proposals[_proposalId].yesVotes >= threshold, "enter dao does not meet vote threshold");

		members[msg.sender].roles.member = true;
		members[msg.sender].shares = proposals[_proposalId].fundsRequested;
		proposals[_proposalId].executed = true;
		totalContribution = totalContribution.add(proposals[_proposalId].fundsRequested);
		balance = balance.add(proposals[_proposalId].fundsRequested);

		if(proposals[_proposalId].fundsRequested <= IERC20(governanceToken).balanceOf(address(this))) {
			IERC20(governanceToken).transfer(proposals[_proposalId].proposer, proposals[_proposalId].fundsRequested);
		}
	}

	// actions
	function cancelEnterDAO(uint _proposalId) public {
		// refund the contribution for failed entry
		require(proposals[_proposalId].canceled == false, "join dao is already canceled");
		require(proposals[_proposalId].executed == false, "cannot cancel an execture join dao");

		proposals[_proposalId].canceled = true;
		require(IERC20(WETH).transferFrom(address(this), proposals[totalProposalCount].targetAddress, proposals[totalProposalCount].fundsRequested));
	}

	function cancelProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].deadline >= block.timestamp);
		require(proposals[_proposalId].proposer == msg.sender);
		proposals[_proposalId].canceled = true;
	}
}