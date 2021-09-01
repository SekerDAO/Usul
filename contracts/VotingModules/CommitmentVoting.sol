// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../common/Enum.sol";
import "../interfaces/IProposal.sol";

contract MemberQuadraticVoting {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public memberCount;
    uint256 public unstakeDelay;
    address private _governanceToken;
    address private _proposalModule;
    /// @dev Address that this module will pass transactions to.
    address public avatar;

    struct Votes {
        bool member;
        uint256 votes;
        uint256 stakedAt;
        uint256 unstakeDelay;
    }

    mapping(address => Votes) public votes;

    modifier onlyAvatar() {
        require(msg.sender == avatar, "TW001");
        _;
    }

    modifier onlyMember() {
        require(votes[msg.sender].member == true);
        _;
    }

    event VotesStaked(uint256 number);
    event VotesUnstaked(uint256 number);

    constructor(
        address governanceToken_,
        address proposalModule_,
        address avatar_,
        uint256 unstakeDelay_
    ) {
        _governanceToken = governanceToken_;
        _proposalModule = proposalModule_;
        avatar = avatar_;
        unstakeDelay = unstakeDelay_;
    }

    function addMember(address member) public onlyAvatar {
        votes[member].member = true;
        memberCount++;
    }

    function removeMember(address member) public onlyAvatar {
        votes[member].member = false;
        memberCount--;
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setavatar(address _avatar) public onlyAvatar {
        avatar = _avatar;
    }

    function governanceToken() public view virtual returns (address) {
        return _governanceToken;
    }

    // todo erc712 delegation

    function stakeVotes(address voter, uint256 amount) external onlyMember {
        IERC20(_governanceToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        votes[voter].votes = votes[voter].votes.add(amount);
        votes[voter].stakedAt = block.number;
        // can make the total 1-1 here
    }

    // todo erc712 undelegation

    function unstakeVotes(uint256 amount) external {
        require(votes[msg.sender].unstakeDelay <= block.timestamp, "TW024");
        require(votes[msg.sender].votes >= amount, "TW020");
        IERC20(_governanceToken).safeTransfer(msg.sender, amount);
        votes[msg.sender].votes = votes[msg.sender].votes.sub(amount);
        votes[msg.sender].stakedAt = 0;
    }

    // todo: erc712 voting

    function vote(uint256 proposalId, bool vote) external onlyMember {
        startVoting(msg.sender);
        require(checkBlock(msg.sender), "TW021");
        IProposal(_proposalModule).receiveVote(
            msg.sender,
            proposalId,
            vote,
            calculateWeight(msg.sender)
        );
    }

    function startVoting(address voter) internal {
        votes[voter].unstakeDelay = block.timestamp + unstakeDelay;
    }

    function calculateWeight(address voter) public view returns (uint256) {
        require(votes[voter].votes > 0, "TW035");
        return weighByTime(votes[voter].votes, votes[voter].stakedAt);
    }

    function checkBlock(address voter) public view returns (bool) {
        return (votes[voter].stakedAt != block.number);
    }

    function weighByTime(uint256 votes, uint256 stakedAt) internal view returns (uint256) {
    	return votes.mul(block.timestamp - stakedAt);
    }
}
