# Usul Zodiac Module

<p align="center">
  <img width="600" src="https://dunenovels.com/wp-content/uploads/2020/11/WindsofDune-2.jpg">
</p>

## About

Welcome to the [Zodiac](https://github.com/gnosis/zodiac) Usul Module.

This module — another tool in the Zodiac DAO standard — provides a proposal core that can register swappable voting contracts called `Strategies`, allowing DAOs to choose from various on-chain voting methods that best suit their needs.

The available voting methods as of this time are...
- OZ Linear Voting ERC20
- OZ Linear Voting ERC20 + Membership Gate
- Comp Governor Bravo Linear Voting ERC20
- Single Weight ERC20
- Simple Membership Voting (No Token)
- Quadratic Voting ERC20 + Membership Gate

The following strategies are a WIP (PRs welcome for additional strategies!)
- Conviction ERC20 Voting
- NFT Voting (Weighted and Single)
- BrightID Member Voting
- PoH Member Voting
- MACI ZKSNARK Voting
- Optimistic Voting
- StarkWare ZKSNARK voting
- Bridge Voting

## Usul Module (Proposal Core)

This is the core of the module that is registered with the Gnosis Safe as a Zodiac module. This module is agnostic to voting, or strategies, as strategies are conducted with separate contracts that can be registered with the proposal core. This core recognizes that all DAO contracts have a proposal registry in common, and only differ in how a decission is made on whether or not to execute that data. This module seperates the concerns of registering the data and applying logic allowing for any kind of logic to easily be attached to proposal registration. This creates a suite of choices to compose a DAO, allows DAOs to use multiple strategies in concert to create sub-DAOs or committees, and DAOs can easily enable or disable strategies to evolve the DAO over time. 

This core expects to call the voting strategy after a proposal is initiated to start any kind of voting logic. After some logic decides to pass the proposal, the strategy contracts will call back to the core to initiate either a time lock (decided by the strategy) or allow the data to be executed. This module adds a batching feature to the execution phase.

### Proposal Structure
```
address proposer;
bool canceled;
uint256 timeLockPeriod; // queue period for safety
bool[] executed; // maybe can be derived from counter
bytes32[] txHashes;
uint256 executionCounter;
address votingStrategy; // the module that is allowed to vote on this
```

### Proposal States
```
Active
Canceled
TimeLocked
Executed
Executing
Uninitialized
```

### Proposal API
```
/// @dev Enables a voting strategy that can vote on proposals
/// @param strategy Address of the strategy to be enabled
/// @notice This can only be called by the owner
UsulModuleenableStrategy(address strategy)

/// @dev Disables a voting strategy on the module
/// @param prevStrategy Strategy that pointed to the strategy to be removed in the linked list
/// @param strategy Strategy to be removed
/// @notice This can only be called by the owner
UsulModule.disableStrategy(address prevStrategy, address strategy)

/// @dev Returns if a strategy is enabled
/// @return True if the strategy is enabled
UsulModule.isStrategyEnabled(address _strategy)

/// @dev Returns array of strategy.
/// @param start Start of the page.
/// @param pageSize Maximum number of strategy that should be returned.
/// @return array Array of strategy.
/// @return next Start of the next page.
UsulModule.getStrategiesPaginated(address start, uint256 pageSize)

/// @dev Returns true if a proposal transaction by index is exectuted.
/// @param proposalId the proposal to inspect.
/// @param index the transaction to inspect.
/// @return boolean.
UsulModule.isTxExecuted(uint256 proposalId, uint256 index)

/// @dev Returns the hash of a transaction in a proposal.
/// @param proposalId the proposal to inspect.
/// @param index the transaction to inspect.
/// @return transaction hash.
UsulModule.getTxHash(uint256 proposalId, uint256 index)

/// @dev Submits a new proposal.
/// @param txHashes an array of hashed transaction data to execute
/// @param votingStrategy the voting strategy to be used with this proposal
/// @param data any extra data to pass to the voting strategy
UsulModule.submitProposal(
    bytes32[] memory txHashes,
    address votingStrategy,
    bytes memory data
) 

/// @dev Cancels a proposal. Only callable by governance owner
/// @param proposalIds array of proposals to cancel.
UsulModule.cancelProposals(uint256[] memory proposalIds)

/// @dev Begins the timelock phase of a successful proposal, only callable by register strat
/// @param proposalId the identifier of the proposal
UsulModule.receiveStrategy(uint256 proposalId, uint256 timeLockPeriod)

/// @dev The execution of a transaction contained within a passed proposal
/// @param proposalID The ID of the queued proposal to execute
/// @param target The address that the Gnosis Safe targets execution to
/// @param value The Ether value to pass to the execution
/// @param data The data to be executed on the Gnosis Safe
/// @param operation The enumarated call or delegatecall option
/// @param txIndex the index of the transaction to be executed in proposal.txHashes array
UsulModule.executeProposalByIndex

/// @dev This performs a batch of transaction executions in one ethereum transaction
/// @param proposalID The ID of the queued proposal to execute
/// @param targets The array of address that the Gnosis Safe targets execution to
/// @param values The array of Ether value to pass to the execution
/// @param datas The array of datas to be executed on the Gnosis Safe
/// @param operations The array of enumarated call or delegatecall option
/// @param startIndex The starting index of the transaction to be executed in proposal.txHashes array
/// @param txCount The number of transactions to be executed in this batch
UsulModule.executeProposalBatch

/// @dev Get the state of a proposal
/// @param proposalId the identifier of the proposal
/// @return ProposalState the enum of the state of the proposal
UsulModule.state(uint256 proposalId)

/// @dev A view that returns if all transactions have been executed in a proposal
UsulModule.isProposalFullyExecuted
/// @param proposalId the id of the proposal that you would like see is fully executed or not

/// @dev A view to that returns the transaction for given transaction data
UsulModule.generateTransactionHashData
/// @param target The address that the Gnosis Safe targets execution to
/// @param value The Ether value to pass to the execution
/// @param data The data to be executed on the Gnosis Safe
/// @param operation The enumarated call or delegatecall option
```

## Strategies

These are logic contracts registered with the Usul proposal module that allow DAOs to choose, change, combine the voting strategies they wish to use. A DAO may start with linear weighted voting and then swap to quadratic voting or any other strategy they would like to use. This includes non-token based voting using the membership voting contracts in conjunction with a system like PoH or BrightID.

Strategies are built with abstract base contracts to provide composability in creation of new strategies.

### (OpenZepplin) Linear Voting ERC20

This strategy is similar to Compound or Gitcoin. It's inspired by the redesign of Governor Bravo by OpenZepplin uses token weighted voting only with one-to-one weights based on token ownership.

Membership versions are supplied to gate voters similar to Moloch.

### (Compound) Governor Bravo Linear Voting

This strategy is a 1-1 functionally complete Governor Bravo from Compound. There are a few design choices that we make that separate this strategy from Governor Bravo like storing transaction hashes rather than transaction data directly on the proposal when initialized.

Membership versions are supplied to gate voters similar to Moloch.

### Quadratic Voting

This strategy scales the power that large token holders have down. This needs to come with sybil protection in the form of PoH or BrightID membership gating.

### Single Weight ERC20 Voting

This strategy reduces all token holder balances to one vote.

### Simple Member Voting

This strategy is a non-token based one. This is simply one vote per human.

### Conviction Voting

This strategy was created by Commons Stack and creates a non-time-boxed method of voting.

## Deploy 

```
- Proxy Factory
- Safe Singleton
- factory.createProxy(signleton, '0x') // TODO: use with salt
- safe = Safe.attach(proxy)
- safe.setup([owners])
- ERC20 Governance token
- token.transfer(safe, (1-foundersPortion))
- Deploy Proposal Module
- Deploy Desired Voting Module
- Deploy Roles module (if desired)
- safe.executeContractCallWithSigners(safe, safe, "registerModule", [Proposal.address])
- safe.executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [voteModule.address])
- safe.executeContractCallWithSigners(safe, safe, "registerModule", [Roles.address])
``` 
