pragma solidity ^0.8.0;

import IERC20 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import IGalleryDAO from './interfaces/IGalleryDAO';

contract GalleryDAO is IGalleryDAO {
	mapping(address => bool) private members;
	mapping(address => bool) private curators;
	mapping(address => bool) private admins;
	mapping(address => bool) private artists;

	address private initialCoordinator;

	address public tokenAddress;

	uint public tokenSupply;

	constructor(uint _initialTokenSupply, address _token) {
		tokenSupply = _initialTokenSupply
		initialCoordinator = msg.sender;
		tokenAddress = _token;
	}


	function createProposal(Proposal _type) {

	}

}