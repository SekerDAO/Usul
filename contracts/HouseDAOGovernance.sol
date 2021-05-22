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
	uint public entryAmount;
	// address private initialCoordinator;

	address public governanceToken;

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
	}

	// make this the easy multisig version, split out
	function headOfHouseEnterMember(address _member, uint _contribution) public {
		require(isPublic == false);
		require(_contribution >= entryAmount);
		require(IERC20(WETH).balanceOf(msg.sender) >= entryAmount);
		members[msg.sender].roles.member = true;
		members[msg.sender].shares = _contribution;
		if(entryAmount > 0) {
			totalContribution += _contribution;
			IERC20(ERC20Address).transferFrom(msg.sender, address(this), _contribution);
		}	
	}

	function headOfhouseChangeEntryERC20(address _entryToken, uint _amount) onlyHeadOfHouse public {
		require(_entryToken != address(0));
		ERC20Address = _entryToken;
		entryAmount = _amount;
	}

	// make nft and erc20 version different contracts
	function headOfhouseChangeEntryERC721(address _entryToken, uint _amount) onlyHeadOfHouse public {
		require(_entryToken != address(0));
		ERC721Address = _entryToken;
		entryAmount = _amount;
	}

	function addMoreContribution(uint _contribution) onlyMember public {
		require(_contribution >= entryAmount);
		require(IERC20(ERC20Address).balanceOf(msg.sender) >= _contribution);
		members[msg.sender].shares += _contribution;
		totalContribution += _contribution;
		IERC20(ERC20Address).transferFrom(msg.sender, address(this), _contribution);
	}

	function withdraw(uint _amount) onlyMember public {
		require(members[msg.sender].shares >= _amount);
		// remove amount from member
		members[msg.sender].shares = members[msg.sender].shares.sub(_amount);
		// calculate percentage of ownership as member.amount / totalContribution
		uint _withdrawalAmount = _amount.div(totalContribution);
		// remove ownership percent from totalContribution
		totalContribution = totalContribution.sub(_withdrawalAmount);
		// send funds
		require(IERC20(ERC20Address).transfer(msg.sender, _withdrawalAmount));
	}

	function sendNFT(address _nftAddress, uint _nftId, address _recipient) onlyHeadOfHouse public {
		IERC721(_nftAddress).safeTransferFrom(address(this), _recipient, _nftId);
	}

	// change this, no contribution needed, use a gov token
	// if you have a gov token you get a membership
	// if you don't you can put up an entry proposal and get issued gov tokens
	function enterDAOProposal(uint _amount) public {

	}


	// the wealthy may choose a gallery / artist dao to endorse
	function commissionProposal(uint _funding, address _artist) onlyMember public {
    	proposals[totalProposalCount].fundsRequested = _funding;
    	proposals[totalProposalCount].proposalType = 1; // 0 = funding proposal // 1 = commission art etc
        proposals[totalProposalCount].yesVotes = members[msg.sender].shares; // the total number of YES votes for this proposal
        proposals[totalProposalCount].noVotes = 0; // the total number of NO votes for this proposal     
        proposals[totalProposalCount].executed = false;
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
	}

	function fundingProposal(uint _funding, address _recipient) public {
    	proposals[totalProposalCount].fundsRequested = _funding;
    	proposals[totalProposalCount].proposalType = 0; // 0 = funding proposal // 1 = commission art etc
        proposals[totalProposalCount].yesVotes = members[msg.sender].shares; // the total number of YES votes for this proposal
        proposals[totalProposalCount].noVotes = 0; // the total number of NO votes for this proposal     
        proposals[totalProposalCount].executed = false;
        proposals[totalProposalCount].deadline = block.timestamp + proposalTime;
        proposals[totalProposalCount].proposer = msg.sender;
	}



	function executeCommissionProposal(address _nftAddress, uint _nftId) public {
		IERC721(_nftAddress).transferFrom(msg.sender, address(this), _nftId);

	}

	function executeFundingProposal() public {

	}

	function executeEnterDAOProposal() public {
		require(ERC20Address != address(0));
		require(isPublic == true);
		require(_amount >= entryAmount);
		require(IERC20(ERC20Address).balanceOf(msg.sender) >= entryAmount);
		members[msg.sender].roles.member = true;
		members[msg.sender].shares = _amount;
		if(entryAmount > 0) {
			totalContribution += _amount;
			IERC20(ERC20Address).transferFrom(msg.sender, address(this), _amount);
		}	
	}

	// native token of the dao
	function updateTokenERC20(address _token) public onlyHeadOfHouse {
		require(_token != address(0));
		ERC20Address = _token;
	}

	// native token of the dao
	function updateTokenERC721(address _nft) public onlyHeadOfHouse {
		require(_nft != address(0));
		ERC721Address = _nft;
	}
}