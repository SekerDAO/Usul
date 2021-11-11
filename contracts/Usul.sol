// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./interfaces/IStrategy.sol";

/// @title Usul Module - A Zodiac module that enables a voting agnostic proposal mechanism.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract Usul is Module {
    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );

    bytes32 public constant TRANSACTION_TYPEHASH =
        0x72e9670a7ee00f5fbf1049b8c38e3f22fab7e9b85029e85cf9412f17fdd5c2ad;
    // keccak256(
    //     "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)"
    // );

    enum ProposalState {
        Active,
        Canceled,
        TimeLocked,
        Executed,
        Executing,
        Uninitialized
    }

    struct Proposal {
        bool canceled;
        uint256 timeLockPeriod; // queue period for safety
        bytes32[] txHashes;
        uint256 executionCounter;
        address strategy; // the module that is allowed to vote on this
    }

    uint256 public totalProposalCount; // total number of submitted proposals
    address internal constant SENTINEL_STRATEGY = address(0x1);

    // mapping of proposal id to proposal
    mapping(uint256 => Proposal) public proposals;
    // Mapping of modules
    mapping(address => address) internal strategies;

    event ProposalCreated(
        address strategy,
        uint256 proposalNumber,
        address proposer
    );
    event ProposalCanceled(uint256 proposalId);
    event TransactionExecuted(uint256 proposalId, bytes32 txHash);
    event TransactionExecutedBatch(uint256 startIndex, uint256 endIndex);
    event StrategyFinalized(uint256 proposalId, uint256 endDate);
    event ProposalExecuted(uint256 id);
    event UsulSetup(
        address indexed initiator,
        address indexed owner,
        address indexed avatar,
        address target
    );
    event EnabledStrategy(address strategy);
    event DisabledStrategy(address strategy);

    constructor(
        address _owner,
        address _avatar,
        address _target,
        address[] memory _strategies
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _avatar,
            _target,
            _strategies
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _avatar,
            address _target,
            address[] memory _strategies
        ) = abi.decode(initParams, (address, address, address, address[]));
        __Ownable_init();
        avatar = _avatar;
        target = _target;
        setupStrategies(_strategies);
        transferOwnership(_owner);
        emit UsulSetup(msg.sender, _owner, _avatar, _target);
    }

    function setupStrategies(address[] memory _strategies) internal {
        require(
            strategies[SENTINEL_STRATEGY] == address(0),
            "setUpModules has already been called"
        );
        strategies[SENTINEL_STRATEGY] = SENTINEL_STRATEGY;
        for (uint256 i = 0; i < _strategies.length; i++) {
            enableStrategy(_strategies[i]);
        }
    }

    /// @dev Disables a voting strategy on the module
    /// @param prevStrategy Strategy that pointed to the strategy to be removed in the linked list
    /// @param strategy Strategy to be removed
    /// @notice This can only be called by the owner
    function disableStrategy(address prevStrategy, address strategy)
        public
        onlyOwner
    {
        require(
            strategy != address(0) && strategy != SENTINEL_STRATEGY,
            "Invalid strategy"
        );
        require(
            strategies[prevStrategy] == strategy,
            "Strategy already disabled"
        );
        strategies[prevStrategy] = strategies[strategy];
        strategies[strategy] = address(0);
        emit DisabledStrategy(strategy);
    }

    /// @dev Enables a voting strategy that can vote on proposals
    /// @param strategy Address of the strategy to be enabled
    /// @notice This can only be called by the owner
    function enableStrategy(address strategy) public onlyOwner {
        require(
            strategy != address(0) && strategy != SENTINEL_STRATEGY,
            "Invalid strategy"
        );
        require(strategies[strategy] == address(0), "Strategy already enabled");
        strategies[strategy] = strategies[SENTINEL_STRATEGY];
        strategies[SENTINEL_STRATEGY] = strategy;
        emit EnabledStrategy(strategy);
    }

    /// @dev Returns if a strategy is enabled
    /// @return True if the strategy is enabled
    function isStrategyEnabled(address _strategy) public view returns (bool) {
        return
            SENTINEL_STRATEGY != _strategy &&
            strategies[_strategy] != address(0);
    }

    /// @dev Returns array of strategy.
    /// @param start Start of the page.
    /// @param pageSize Maximum number of strategy that should be returned.
    /// @return array Array of strategy.
    /// @return next Start of the next page.
    function getStrategiesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory array, address next)
    {
        // Init array with max page size
        array = new address[](pageSize);

        // Populate return array
        uint256 strategyCount = 0;
        address currentStrategy = strategies[start];
        while (
            currentStrategy != address(0x0) &&
            currentStrategy != SENTINEL_STRATEGY &&
            strategyCount < pageSize
        ) {
            array[strategyCount] = currentStrategy;
            currentStrategy = strategies[currentStrategy];
            strategyCount++;
        }
        next = currentStrategy;
        // Set correct size of returned array
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(array, strategyCount)
        }
    }

    /// @dev Returns true if a proposal transaction by index is exectuted.
    /// @param proposalId the proposal to inspect.
    /// @param index the transaction to inspect.
    /// @return boolean.
    function isTxExecuted(uint256 proposalId, uint256 index)
        public
        view
        returns (bool)
    {
        require(
            proposals[proposalId].txHashes.length > 0,
            "no executions in this proposal"
        );
        return proposals[proposalId].executionCounter > index;
    }

    /// @dev Returns the hash of a transaction in a proposal.
    /// @param proposalId the proposal to inspect.
    /// @param index the transaction to inspect.
    /// @return transaction hash.
    function getTxHash(uint256 proposalId, uint256 index)
        public
        view
        returns (bytes32)
    {
        return proposals[proposalId].txHashes[index];
    }

    /// @dev Submits a new proposal.
    /// @param txHashes an array of hashed transaction data to execute
    /// @param strategy the voting strategy to be used with this proposal
    /// @param data any extra data to pass to the strategy
    function submitProposal(
        bytes32[] memory txHashes,
        address strategy,
        bytes memory data
    ) external {
        require(
            isStrategyEnabled(strategy),
            "voting strategy is not enabled for proposal"
        );
        require(txHashes.length > 0, "proposal must contain transactions");
        proposals[totalProposalCount].txHashes = txHashes;
        proposals[totalProposalCount].strategy = strategy;
        totalProposalCount++;
        IStrategy(strategy).receiveProposal(
            abi.encode(totalProposalCount - 1, txHashes, data)
        );
        emit ProposalCreated(strategy, totalProposalCount - 1, msg.sender);
    }

    /// @dev Cancels a proposal.
    /// @param proposalIds array of proposals to cancel.
    function cancelProposals(uint256[] memory proposalIds) external onlyOwner {
        for (uint256 i = 0; i < proposalIds.length; i++) {
            Proposal storage _proposal = proposals[proposalIds[i]];
            require(
                _proposal.executionCounter < _proposal.txHashes.length,
                "nothing to cancel"
            );
            require(
                _proposal.canceled == false,
                "proposal is already canceled"
            );
            _proposal.canceled = true;
            emit ProposalCanceled(proposalIds[i]);
        }
    }

    /// @dev Signals a successful proposal, timelock is optional
    /// @param proposalId the identifier of the proposal
    /// @param timeLockPeriod the optional delay time
    function receiveStrategy(uint256 proposalId, uint256 timeLockPeriod)
        external
    {
        require(
            strategies[msg.sender] != address(0),
            "Strategy not authorized"
        );
        require(
            state(proposalId) == ProposalState.Active,
            "cannot receive strategy, proposal is not active"
        );
        require(
            msg.sender == proposals[proposalId].strategy,
            "cannot receive strategy, incorrect strategy for proposal"
        );
        proposals[proposalId].timeLockPeriod = block.timestamp + timeLockPeriod;
        emit StrategyFinalized(
            proposalId,
            proposals[proposalId].timeLockPeriod
        );
    }

    /// @dev Executes a transaction inside of a proposal.
    /// @notice Transactions must be called in ascending index order
    /// @param proposalId the identifier of the proposal
    /// @param target the contract to be called by the avatar
    /// @param value ether value to pass with the call
    /// @param data the data to be executed from the call
    /// @param operation Call or Delegatecall
    function executeProposalByIndex(
        uint256 proposalId,
        address target,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) public {
        // force calls from strat so we can scope
        require(
            state(proposalId) == ProposalState.Executing,
            "proposal is not in execution state"
        );
        bytes32 txHash = getTransactionHash(target, value, data, operation);
        require(
            proposals[proposalId].txHashes[
                proposals[proposalId].executionCounter
            ] == txHash,
            "transaction hash does not match indexed hash"
        );
        proposals[proposalId].executionCounter++;
        require(
            exec(target, value, data, operation),
            "Module transaction failed"
        );
        emit TransactionExecuted(proposalId, txHash);
    }

    /// @dev Executes batches of transactions inside of a proposal.
    /// @notice Transactions must be called in ascending index order
    /// @param proposalId the identifier of the proposal
    /// @param targets the contracts to be called by the avatar
    /// @param values ether values to pass with the calls
    /// @param data the data to be executed from the calls
    /// @param operations Calls or Delegatecalls
    function executeProposalBatch(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory data,
        Enum.Operation[] memory operations
    ) external {
        require(
            targets.length != 0,
            "no transactions to execute supplied to batch"
        );
        require(
            targets.length == values.length &&
                targets.length == data.length &&
                targets.length == operations.length,
            "execution parameters missmatch"
        );
        require(
            proposals[proposalId].executionCounter + targets.length <=
                proposals[proposalId].txHashes.length,
            "attempting to execute too many transactions"
        );
        for (uint256 i = 0; i < targets.length; i++) {
            executeProposalByIndex(
                proposalId,
                targets[i],
                values[i],
                data[i],
                operations[i]
            );
        }
        emit TransactionExecutedBatch(
            proposals[proposalId].executionCounter,
            proposals[proposalId].executionCounter + targets.length
        );
    }

    /// @dev Get the state of a proposal
    /// @param proposalId the identifier of the proposal
    /// @return ProposalState the enum of the state of the proposal
    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage _proposal = proposals[proposalId];
        if (_proposal.strategy == address(0)) {
            return ProposalState.Uninitialized;
        } else if (_proposal.executionCounter == _proposal.txHashes.length) {
            return ProposalState.Executed;
        } else if (_proposal.canceled) {
            return ProposalState.Canceled;
        } else if (_proposal.timeLockPeriod == 0) {
            return ProposalState.Active;
        } else if (block.timestamp < _proposal.timeLockPeriod) {
            return ProposalState.TimeLocked;
        } else if (block.timestamp >= _proposal.timeLockPeriod) {
            return ProposalState.Executing;
        } else {
            revert("unknown proposal id state");
        }
    }

    /// @dev Generates the data for the module transaction hash (required for signing)
    function generateTransactionHashData(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 nonce
    ) public view returns (bytes memory) {
        uint256 chainId = block.chainid;
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this)
        );
        bytes32 transactionHash = keccak256(
            abi.encode(
                TRANSACTION_TYPEHASH,
                to,
                value,
                keccak256(data),
                operation,
                nonce
            )
        );
        return
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x01),
                domainSeparator,
                transactionHash
            );
    }

    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) public view returns (bytes32) {
        return
            keccak256(
                generateTransactionHashData(to, value, data, operation, 0)
            );
    }
}
