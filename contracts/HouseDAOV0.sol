// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract HouseDAOV0 {
	// mapping(address => Member) private members;
	// mapping(uint => Proposal) public proposals;
	// mapping(address => uint) public donators; // donator => amount donated in eth

	// uint public proposalCount;

	// address private initialCoordinator;

	// address public tokenAddress;

	// uint public tokenSupply;

 //    modifier onlyMember {
 //        require(members[msg.sender].member == true, "not a member");
 //        _;
 //    }

 //    modifier onlyArtist {
 //        require(members[msg.sender].artist == true, "not an artist");
 //        _;
 //    }

 //    modifier onlyCurator {
 //        require(members[msg.sender].curator == true, "not a curator");
 //        _;
 //    }

 //    modifier onlyAdmin {
 //        require(members[msg.sender].admin == true, "not an admin");
 //        _;
 //    }

	// constructor(uint _initialTokenSupply, address _token) {
	// 	tokenSupply = _initialTokenSupply
	// 	initialCoordinator = msg.sender;
	// 	tokenAddress = _token;
	// }

	// // the wealthy may choose a gallery / artist dao to endorse
	// function commissionProposal() onlyMember {

	// }

	// // anyone may fund this?
	// function fund() payable {

	// }

	// // native token of the dao
	// function updateToken() public onlyAdmin {

	// }

	// function burnCoordinator() public {
	// 	require(msg.sender == initialCoordinator, "only coordinator can remove themselves")
	// 	initialCoordinator = address(0);
	// }

}