// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './interfaces/IHouseDAO.sol';

contract HouseDAOV0 is IHouseDAO {
	mapping(address => Member) private members;
	mapping(uint => Proposal) public proposals;
	// use shares on member struct for balances
	uint public openProposalCount;
	uint public totalProposalCount;

	uint public totalContribution;

	bool public isPublic;
	uint public entryAmount;
	// address private initialCoordinator;

	address public ERC20Address;
	address public ERC721Address;

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
		address _ERC20Address,
		address _ERC721Address,
		bool _public,
		uint _entryAmount
	) {
		//initialCoordinator = msg.sender;
		for(uint i=0; i<heads.length; i++) {
			// create head of house member struct
			require(heads[i] != address(0));
			members[heads[i]].roles.headOfHouse = true;
			members[heads[i]].roles.member = true;
		}

		isPublic = _public;
		ERC20Address = _ERC20Address;
		ERC721Address = _ERC721Address;
		entryAmount = _entryAmount;
	}

	function nftMembershipEntry() public {
		require(ERC721Address != address(0));
		require(isPublic == true);
		require(IERC721(ERC721Address).balanceOf(msg.sender) >= entryAmount);
		members[msg.sender].roles.member = true;
	}

	function contributionEntry(uint _amount) public {
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

	function headOfHouseEnterMember(address _member, uint _contribution) public {
		require(isPublic == false);
		require(_contribution >= entryAmount);
		require(IERC20(ERC20Address).balanceOf(msg.sender) >= entryAmount);
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
		// calculate percentage of ownership as member.amount / totalContribution
		// remove ownership percent from totalContribution
		// remove amount from member
		// send funds
	}

	// the wealthy may choose a gallery / artist dao to endorse
	function commissionProposal() public {

	}

	// the wealthy may choose a gallery / artist dao to endorse
	function fundingProposal() public {

	}

	function executeCommissionProposal() public {

	}

	function executeFundingProposal() public {

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