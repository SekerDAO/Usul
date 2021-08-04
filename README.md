# TokenWalk-DAO-OS-Contracts

## About

Welcome to TokenWalk's Gnosis Safe DAO Module.

This OS is an attempt at building fully decentralized DAO contracts that make the least opinions that will prevent those who use this OS from being siloed into a technology choice. This works with standard erc20 tokens rather than specializd DeFi tokens. The contracts are modular and extensible, built on top of the Gnosis Safe that many already have deployed. All of the state remains on the Gnosis safe which is upgradeable. If new logic is desired on the proposal module a new module may be voted into the gnosis safe by the old proposal module. Roles and membership use a byte code registry that allows DAOs to enable any specific permission that they can think of, remove them later, and stay flexible over time.

### Proposal Module

This is the core module that is registed with the Gnosis Safe. 

### Voting Modules

These are external modules that allow DAOs to chose and change the voting strategy they wish to use. A DAO may start with linear weighted voting and choose swap to quadratic voting or any other strategy they would like to use.

### Roles Module

This module defines membership and specific permissions over actions on the Gnosis safe that bypass the token weighted proposal module. It may be desirable for DAOs to leave specific permission for quick actions that do not need to be brought before the entire communities vote.

This module uses a registery of byte code to enable all possible roles that a DAO can think of in the future.

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
- safe.executeContractCallWithSigners(safe, safe, "registerModule", [Proposal.address])
- safe.executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [voteModule.address])
``` 

## Error Codes
```
- TW001 "only gnosis safe may enter"
- TW002 "proposal was canceled"
- TW003 "proposal already executed"
- TW004 "proposal does not meet vote threshold"
- TW005 "no votes outweigh yes"
- TW006 "vote module does not exist"
- TW007 "already voted on proposal"
- TW008 "voting on canceled proposal"
- TW009 "voting on executed proposal"
- TW010 "voting on proposal past the deadline"
- TW011 "submit proposal more than one proposal at a time"
- TW012 "submit proposal does not have enough gov tokens"
- TW013 "start queue proposal already entered grace period"
- TW014 "start queue proposal deadline has not passed yet"
- TW015 "execute proposal grace period has not elapsed"
- TW016 "cancel proposal already canceled"
- TW017 "cancel proposal already executed"
- TW018 "cancel proposal already past deadline"
- TW019 "cancel proposal must be originator or Safe"
- TW020 "linear voting: can't undelegate more votes than delegated"
- TW021 "linear voting: cannot vote in the same block as delegation"
- TW022 "must register voting module before submitting a proposal"
```