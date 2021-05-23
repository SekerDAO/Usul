// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './interfaces/IHouseDAO.sol';

contract HouseDAOGovernance is IHouseDAO {
	using SafeMath for uint;

	mapping(address => Member) private members;
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
		uint _threshold
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
		proposalTime = _proposalTime;
		threshold = _threshold;
		totalGovernanceSupply = _totalGovernanceSupply;
		remainingSupply = _totalGovernanceSupply;

		IERC20(_governanceToken).transferFrom(msg.sender, address(this), _totalGovernanceSupply);
	}

	function vote(uint _proposalId, bool _vote) public onlyMember {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].deadline >= block.timestamp);

		if(_vote == false){
			proposals[_proposalId].noVotes = proposals[_proposalId].noVotes.add(members[msg.sender].shares);
		} else {
			proposals[_proposalId].yesVotes = proposals[_proposalId].yesVotes.add(members[msg.sender].shares);
		}
	}

	// make this the easy multisig version, split out
	function headOfHouseEnterMember(address _member, uint _contribution) public {
		require(_contribution >= entryAmount);
		require(IERC20(WETH).balanceOf(_member) >= _contribution);

		members[_member].roles.member = true;
		members[_member].shares = _contribution;
		if(_contribution > 0) {
			totalContribution = totalContribution.add(_contribution);
			balance = balance.add(_contribution);
			IERC20(WETH).transferFrom(_member, address(this), _contribution);
			IERC20(governanceToken).transferFrom(address(this), _member, _contribution);
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
		require(_contribution >= entryAmount);
		require(IERC20(WETH).balanceOf(msg.sender) >= _contribution);

		members[msg.sender].shares = members[msg.sender].shares.add(_contribution);
		totalContribution = totalContribution.add(_contribution);
		balance = balance.add(_contribution);

		require(IERC20(WETH).transferFrom(msg.sender, address(this), _contribution));

		// check to see if there are enough gov tokens left to award
		if(IERC20(governanceToken).balanceOf(address(this)) > _contribution) {
			require(IERC20(governanceToken).transferFrom(address(this), msg.sender, _contribution));
		}

		remainingSupply = remainingSupply.sub(_contribution);
	}

	function withdraw(uint _amount) onlyMember public {
		require(members[msg.sender].shares >= _amount);

		uint _withdrawalPercent = members[msg.sender].shares.div(totalContribution);
		uint _withdrawalAmount = balance.mul(_withdrawalPercent);

		// remove amount from member
		members[msg.sender].shares = members[msg.sender].shares.sub(_amount);
		// remove ownership percent from totalContribution
		totalContribution = totalContribution.sub(_amount);
		// update the balance left
		balance = balance.sub(_withdrawalAmount);
		// send funds
		require(IERC20(WETH).transfer(msg.sender, _withdrawalAmount));
	}

	function sendNFT(address _nftAddress, uint _nftId, address _recipient) onlyHeadOfHouse public {
		IERC721(_nftAddress).safeTransferFrom(address(this), _recipient, _nftId);
	}


	// change this, no contribution needed, use a gov token
	// if you have a gov token you get a membership
	// if you don't you can put up an entry proposal and get issued gov tokens
	function enterDAOProposal(uint _contribution, Role memory _role) public {
		require(_contribution >= entryAmount);
		require(IERC20(WETH).balanceOf(msg.sender) >= _contribution);

    	proposals[totalProposalCount].fundsRequested = _contribution;
    	proposals[totalProposalCount].role = _role;
    	proposals[totalProposalCount].proposalType = 2; // 0 = funding proposal // 1 = commission art 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;

        require(IERC20(WETH).transferFrom(msg.sender, address(this), _contribution));

        totalProposalCount++;
	}

	// used for
	// change role, commission art, request funcing
	function submitProposal(Role memory _role, address _recipient, uint _funding, uint8 _proposalType) onlyMember public {
		require(balance >= _funding);

    	proposals[totalProposalCount].fundsRequested = _funding;
    	proposals[totalProposalCount].role = _role;
    	proposals[totalProposalCount].proposalType = _proposalType; // 0 = funding proposal // 1 = change role // 2 = entry
        proposals[totalProposalCount].yesVotes = IERC20(governanceToken).balanceOf(msg.sender); // the total number of YES votes for this proposal    
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].targetAddress = _recipient;

        totalProposalCount++;
	}


	// Execute proposals
	function executeFundingProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].proposalType == 0);
		require(balance >= proposals[totalProposalCount].fundsRequested);
		require(proposals[_proposalId].yesVotes >= threshold);
		require(proposals[_proposalId].deadline >= block.timestamp);

		proposals[_proposalId].executed = true;
		proposals[_proposalId].gracePeriod = block.timestamp + gracePeriod;
	}

	function finalizeFundingProposal(uint _proposalId) public {
		require(balance >= proposals[_proposalId].fundsRequested);
		require(proposals[_proposalId].executed == true);
		require(block.timestamp >= proposals[_proposalId].gracePeriod);

		balance = balance.sub(proposals[_proposalId].fundsRequested);
		require(IERC20(WETH).transferFrom(address(this), proposals[_proposalId].targetAddress, proposals[_proposalId].fundsRequested));
	}

	function executeChangeRoleProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].proposalType == 1);

		members[proposals[_proposalId].targetAddress].roles = proposals[_proposalId].role;
		proposals[_proposalId].executed == true;

	}

	function executeEnterDAOProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].proposalType == 2);

		members[msg.sender].roles.member = true;
		members[msg.sender].shares = proposals[_proposalId].fundsRequested;
		totalContribution = totalContribution.add(proposals[_proposalId].fundsRequested);

		if(proposals[_proposalId].fundsRequested > IERC20(governanceToken).balanceOf(address(this))) {
			IERC20(governanceToken).transferFrom(msg.sender, address(this), proposals[_proposalId].fundsRequested);
		}

		proposals[_proposalId].executed == true;
	}

	// actions
	function cancelEnterDAO(uint _proposalId) public {
		// refund the contribution for failed entry
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);

		require(IERC20(WETH).transferFrom(address(this), proposals[totalProposalCount].targetAddress, proposals[totalProposalCount].fundsRequested));
		proposals[_proposalId].canceled == true;
	}

	function cancelProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].deadline >= block.timestamp);
		require(proposals[_proposalId].proposer == msg.sender);
		proposals[_proposalId].canceled = true;
	}
}