// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../common/Enum.sol";
import "../interfaces/IProposal.sol";

contract LinearVoting {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );

    // todo FIX
    bytes32 public constant VOTE_TYPEHASH =
        0x72e9670a7ee00f5fbf1049b8c38e3f22fab7e9b85029e85cf9412f17fdd5c2ad;
    // keccak256(
    //     "vote(uint256 proposalId, bool vote)"
    // );

    struct Delegation {
        mapping(address => uint256) votes;
        uint256 undelegateDelay;
        uint256 lastBlock;
        uint256 total;
    }

    address private _governanceToken;
    address private _proposalModule;
    uint256 private _undelegateDelay;
    address private _roleModule;
    /// @dev Address that this module will pass transactions to.
    address public executor;

    mapping(address => uint256) public nonces;
    mapping(address => Delegation) public delegations;

    modifier onlyExecutor() {
        require(msg.sender == executor, "TW001");
        _;
    }

    event VotesDelegated(uint256 number);
    event VotesUndelegated(uint256 number);

    constructor(
        address governanceToken_,
        address proposalModule_,
        uint256 undelgateDelay_,
        address executor_
    ) {
        _governanceToken = governanceToken_;
        _proposalModule = proposalModule_;
        _undelegateDelay = undelgateDelay_;
        executor = executor_;
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setExecutor(address _executor) public onlyExecutor {
        executor = _executor;
    }

    function registerRoleModule(address module) external onlyExecutor {
        _roleModule = module;
    }

    function governanceToken() public view virtual returns (address) {
        return _governanceToken;
    }

    function getDelegatorVotes(address delegatee, address delegator)
        public
        view
        virtual
        returns (uint256)
    {
        return delegations[delegatee].votes[delegator];
    }

    // todo erc712 delegation

    function delegateVotes(address delegatee, uint256 amount) external {
        IERC20(_governanceToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        delegations[delegatee].votes[msg.sender] = amount;
        delegations[delegatee].lastBlock = block.number;
        // can make the total 1-1 here
        delegations[delegatee].total = delegations[delegatee].total.add(amount);
    }

    // todo remove

    function undelegateVotes(address delegatee, uint256 amount) external {
        require(
            delegations[delegatee].undelegateDelay <= block.timestamp,
            "TW024"
        );
        require(delegations[delegatee].votes[msg.sender] >= amount, "TW020");
        IERC20(_governanceToken).safeTransfer(msg.sender, amount);
        delegations[delegatee].votes[msg.sender] = delegations[delegatee]
            .votes[msg.sender]
            .sub(amount);
        delegations[delegatee].total = delegations[delegatee].total.sub(amount);
    }

    // todo: erc712 voting

    function vote(uint256 proposalId, bool vote) public {
        // if (_roleModule != address(0)) {
        //     require(IRoles(_roleModule).checkMembership(msg.sender), "TW028");
        // }
        startVoting(msg.sender);
        require(checkBlock(msg.sender), "TW021");
        IProposal(_proposalModule).receiveVote(
            msg.sender,
            proposalId,
            vote,
            calculateWeight(msg.sender)
        );
    }

    function voteSignature(
        address delegatee,
        uint256 proposalId,
        uint256 value,
        bool vote,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        bytes32 voteHash = getVoteHash(
            delegatee,
            proposalId,
            value,
            vote,
            deadline
        );
        address signer = ecrecover(voteHash, v, r, s);
        require(signer != address(0) && signer == delegatee, "signer doesn not match delegatee");
        startVoting(signer);
        require(checkBlock(msg.sender), "TW021");
        IProposal(_proposalModule).receiveVote(
            signer,
            proposalId,
            vote,
            calculateWeight(signer)
        );
    }

    function startVoting(address delegatee) internal {
        delegations[delegatee].undelegateDelay =
            block.timestamp +
            _undelegateDelay;
    }

    function calculateWeight(address delegatee) public view returns (uint256) {
        uint256 votes = delegations[delegatee].votes[delegatee];
        require(delegations[delegatee].total > 0, "TW035");
        return delegations[delegatee].total;
    }

    function checkBlock(address delegatee) public view returns (bool) {
        return (delegations[delegatee].lastBlock != block.number);
    }

    /// @dev Generates the data for the module transaction hash (required for signing)
    function generateVoteHashData(
        address delegatee,
        uint256 proposalId,
        bool vote,
        uint256 deadline
    ) public view returns (bytes memory) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this)
        );
        bytes32 voteHash = keccak256(
            abi.encode(
                VOTE_TYPEHASH,
                delegatee,
                proposalId,
                delegations[delegatee].votes[delegatee],
                vote,
                deadline,
                nonces[delegatee]
            )
        );
        return
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x01),
                domainSeparator,
                voteHash
            );
    }

    function getVoteHash(
        address delegatee,
        uint256 proposalId,
        uint256 value,
        bool vote,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            keccak256(
                generateVoteHashData(delegatee, proposalId, vote, deadline)
            );
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
