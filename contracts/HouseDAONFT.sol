// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import './interfaces/IHouseDAO.sol';

contract HouseDAONFT is IHouseDAO {
	using SafeMath for uint;

	mapping(address => Member) private members;
	mapping(uint => Proposal) public proposals;
	// use shares on member struct for balances
	uint public totalProposalCount = 0;
	uint public proposalTime;

	uint public totalContributions;
	uint public entryAmount;
	uint public threshold;
	// address private initialCoordinator;

	address public ERC721Address;
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
		address _ERC721Address,
		uint _proposalTime,
		uint _entryAmount, // hardcode in ui to 1 for now
		uint _threshold
	) {
		//initialCoordinator = msg.sender;
		for(uint i=0; i<heads.length; i++) {
			// create head of house member struct
			require(heads[i] != address(0));
			members[heads[i]].roles.headOfHouse = true;
			members[heads[i]].roles.member = true;
		}

		entryAmount = _entryAmount;
		ERC721Address = _ERC721Address;
		proposalTime = _proposalTime;
		threshold = _threshold;
	}

	function nftMembershipEntry() public {
		require(members[msg.sender].roles.member == false);
		require(ERC721Address != address(0));
		require(IERC721(ERC721Address).balanceOf(msg.sender) >= entryAmount);
		members[msg.sender].roles.member = true;
		members[msg.sender].shares = 1;
	}

	// this is non refundable
	function fundDAO(uint _amount) public {
		require(_amount > 0);
		require(IERC20(WETH).balanceOf(msg.sender) >= _amount);
		totalContributions += _amount;
		IERC20(WETH).transferFrom(msg.sender, address(this), _amount);
	}

	// make nft and erc20 version different contracts
	function headOfhouseChangeEntryERC721(address _entryToken, uint _amount) onlyHeadOfHouse public {
		require(_entryToken != address(0));
		ERC721Address = _entryToken;
		entryAmount = _amount;
	}

	function submitProposal(uint _funding, address _recipient, Role memory _role) onlyMember public {
		require(_recipient != address(0));
		
    	proposals[totalProposalCount].fundsRequested = _funding;
    	proposals[totalProposalCount].role = _role;
    	proposals[totalProposalCount].proposalType = 0; // 0 = funding proposal // 1 = commission art etc
        proposals[totalProposalCount].yesVotes = members[msg.sender].shares; // the total number of YES votes for this proposal
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].targetAddress = _recipient;

        totalProposalCount++;
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

	function executeFundingProposal(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].deadline >= block.timestamp);
		require(proposals[_proposalId].fundsRequested <= totalContributions);
		require(proposals[_proposalId].yesVotes >= threshold);
		require(proposals[_proposalId].targetAddress != address(0));

		proposals[_proposalId].executed == true;
		require(IERC20(WETH).transferFrom(address(this), proposals[_proposalId].targetAddress, proposals[_proposalId].fundsRequested));
	}

	function executeRoleChange(uint _proposalId) public {
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].deadline >= block.timestamp);
		require(proposals[_proposalId].yesVotes >= threshold);

		proposals[_proposalId].executed = true;
		members[proposals[_proposalId].proposer].roles = proposals[_proposalId].role;
	}

	function cancelProposal(uint _proposalId) public {
		require(proposals[_proposalId].executed == false);
		require(proposals[_proposalId].canceled == false);
		require(proposals[_proposalId].deadline >= block.timestamp);
		require(proposals[_proposalId].proposer == msg.sender);
		proposals[_proposalId].canceled = true;
	}
}