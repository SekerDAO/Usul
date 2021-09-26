// // SPDX-License-Identifier: LGPL-3.0-only

// pragma solidity ^0.8.6;

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// import "../common/Enum.sol";
// import "../interfaces/IProposal.sol";

// // create POAP version
// // create BrightID version
// contract SingleVoting {
//     using SafeMath for uint256;
//     using SafeERC20 for IERC20;

//     uint256 public memberCount;
//     address private _governanceToken;
//     address private _proposalModule;
//     /// @dev Address that this module will pass transactions to.
//     address public avatar;

//     mapping(address => bool) public members;

//     modifier onlyAvatar() {
//         require(msg.sender == avatar, "TW001");
//         _;
//     }

//     modifier onlyMember() {
//         require(members[msg.sender] == true);
//         _;
//     }

//     constructor(
//         address governanceToken_,
//         address proposalModule_,
//         address _avatar
//     ) {
//         _governanceToken = governanceToken_;
//         _proposalModule = proposalModule_;
//         avatar = _avatar;
//     }

//     function addMember(address member) public onlyAvatar {
//         members[member] = true;
//         memberCount++;
//     }

//     function removeMember(address member) public onlyAvatar {
//         members[member] = false;
//         memberCount--;
//     }

//     /// @dev Sets the Avatar to a new account (`newAvatar`).
//     /// @notice Can only be called by the current owner.
//     function setAvatar(address _avatar) public onlyAvatar {
//         avatar = _avatar;
//     }

//     function governanceToken() public view virtual returns (address) {
//         return _governanceToken;
//     }

//     // todo: erc712 voting

//     function vote(uint256 proposalId, uint8 vote) external onlyMember {
//         IProposal(_proposalModule).receiveVote(msg.sender, proposalId, vote, 1);
//     }
// }
