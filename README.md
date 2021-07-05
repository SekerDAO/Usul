# gallery-dao
something's happening here i think

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