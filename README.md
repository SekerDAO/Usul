# TokenWalk-DAO-OS-Contracts

## Deploy 

```
- Proxy Factory
- Safe Singleton
- factory.createProxy(signleton, '0x')
- safe = Safe.attach(proxy)
- safe.setup([owners])
- ERC20 Governance token
- token.transfer(safe, (1-foundersPortion))
- Governance Module
- safe.executeContractCallWithSigners(safe, safe, "registerModule", [Governance.address])
``` 

## Error Codes
```
- TW001 "only gnosis safe may enter"
- TW002 "proposal was canceled"
- TW003 "proposal already executed"
- TW004 "proposal does not meet vote threshold"
- TW005 "no votes outweigh yes"
- TW006 "vote module does not exist"
- TW007 "already voted"
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