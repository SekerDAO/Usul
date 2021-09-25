// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "../interfaces/IProposal.sol";

// refactor with OZ delegation 
contract LinearVoting is EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant VOTE_TYPEHASH = keccak256("Vote(uint256 proposalId,uint8 vote)");

    struct Delegation {
        mapping(address => uint256) votes;
        uint256 undelegateDelay;
        uint256 lastBlock;
        uint256 total;
    }

    address public governanceToken;
    address public proposalModule;
    uint256 public quorumThreshold; // minimum number of votes for proposal to succeed
    /// @dev Address that this module will pass transactions to.
    address public avatar;
    string private _name;

    mapping(address => uint256) public nonces;
    mapping(address => Delegation) public delegations;

    modifier onlyAvatar() {
        require(msg.sender == avatar, "TW001");
        _;
    }

    event VotesDelegated(uint256 number);
    event VotesUndelegated(uint256 number);

    constructor(
        address _governanceToken,
        address _proposalModule,
        uint256 _quorumThreshold,
        address _avatar,
        string memory name_
    ) EIP712(name_, version()) {
        governanceToken = _governanceToken;
        proposalModule = _proposalModule;
        quorumThreshold = _quorumThreshold;
        avatar = _avatar;
        _name = name_;
    }

    /**
     * @dev See {IGovernor-name}.
     */
    function name() public view virtual returns (string memory) {
        return _name;
    }

    /**
     * @dev See {IGovernor-version}.
     */
    function version() public view virtual returns (string memory) {
        return "1";
    }

    function getThreshold() external view returns (uint256) {
        return quorumThreshold;
    }

    function getDelegatorVotes(address delegatee, address delegator)
        public
        view
        virtual
        returns (uint256)
    {
        return delegations[delegatee].votes[delegator];
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setAvatar(address _avatar) public onlyAvatar {
        avatar = _avatar;
    }

    /// @dev Updates the quorum needed to pass a proposal, only executor.
    /// @param _quorumThreshold the voting quorum threshold.
    function updateThreshold(uint256 _quorumThreshold) external onlyAvatar {
        quorumThreshold = _quorumThreshold;
    }

    // todo erc712 delegation
    // ensure all votes are delegated
    function delegateVotes(address delegatee, uint256 amount) external {
        IERC20(governanceToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        delegations[delegatee].votes[msg.sender] = delegations[delegatee]
            .votes[msg.sender] + amount;
        delegations[delegatee].lastBlock = block.number;
        // can make the total 1-1 here
        delegations[delegatee].total = delegations[delegatee].total + amount;
    }

    // todo remove
    // move delegation to a compound specific module
    function undelegateVotes(address delegatee, uint256 amount) external {
        require(
            delegations[delegatee].undelegateDelay <= block.timestamp,
            "TW024"
        );
        require(delegations[delegatee].votes[msg.sender] >= amount, "TW020");
        IERC20(governanceToken).safeTransfer(msg.sender, amount);
        delegations[delegatee].votes[msg.sender] = delegations[delegatee]
            .votes[msg.sender] - amount;
        delegations[delegatee].total = delegations[delegatee].total - amount;
    }

    // todo: erc712 voting

    function vote(uint256 proposalId, uint8 vote) public {
        delegations[msg.sender].undelegateDelay =
            block.timestamp +
            IProposal(proposalModule).getProposalWindow();
        require(checkBlock(msg.sender), "TW021");
        IProposal(proposalModule).receiveVote(
            msg.sender,
            proposalId,
            vote,
            calculateWeight(msg.sender)
        );
    }

    function voteSignature(
        address delegatee,
        uint256 proposalId,
        uint8 vote,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        address voter = ECDSA.recover(
            _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, proposalId, vote))),
            v,
            r,
            s
        );
        require(
            voter != address(0) && voter == delegatee,
            "voter doesn not match delegatee"
        );
        delegations[voter].undelegateDelay =
            block.timestamp +
            IProposal(proposalModule).getProposalWindow();
        require(checkBlock(msg.sender), "TW021");
        IProposal(proposalModule).receiveVote(
            voter,
            proposalId,
            vote,
            calculateWeight(voter)
        );
    }

    function calculateWeight(address delegatee) public view returns (uint256) {
        uint256 votes = delegations[delegatee].votes[delegatee];
        require(delegations[delegatee].total > 0, "TW035");
        return delegations[delegatee].total;
    }

    function checkBlock(address delegatee) public view returns (bool) {
        return (delegations[delegatee].lastBlock != block.number);
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public view returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }
}
