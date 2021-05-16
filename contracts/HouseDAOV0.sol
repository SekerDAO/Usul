// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './interfaces/IHouseDAO.sol';

contract HouseDAOV0 is IHouseDAO {
	mapping(address => Member) private members;
	mapping(uint => Proposal) public proposals;
	// use shares on member struct for balances
	uint public proposalCount;

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
		}

		isPublic = _public;
		ERC20Address = _ERC20Address;
		ERC721Address = _ERC721Address;
		entryAmount = _entryAmount;
	}

	function nftMembershipEntry() public {
		require(isPublic == true);
		require(IERC721(ERC721Address).balanceOf(msg.sender) >= entryAmount);
		// require nft balance is equal to entry amount
		// don't collect the nft
		// just register
	}

	function contributionEntry() public {
		require(isPublic == true);
		require(IERC20(ERC20Address).balanceOf(msg.sender) >= entryAmount);
	}

	function headOfHouseEnterMember(address _member, uint _contribution) public {
		require(isPublic == false);
		// mark how much contributed
	}

	function headOfhouseChangeEntryERC20(address _entryToken, uint _amount) public {
		require(_entryToken != address(0));
		ERC20Address = _entryToken;
		entryAmount = _amount;
	}

	function headOfhouseChangeEntryERC721(address _entryToken, uint _amount) public {
		require(_entryToken != address(0));
		ERC721Address = _entryToken;
		entryAmount = _amount;
	}

	function addMoreContribution(uint _amount) public {
		// add more to the conributor amount
	}

	function withdraw(uint _amount) public {
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