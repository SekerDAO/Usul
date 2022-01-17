import hre, { ethers, network, waffle, deployments } from "hardhat";
import GnosisSafeProxyFactory from "../artifacts/@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json"
import GnosisSafeL2 from "../artifacts/@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol/GnosisSafeL2.json"
import Usul from "../artifacts/contracts/Usul.sol/Usul.json"
import LinearVoting from "../artifacts/contracts/votingStrategies/OZLinearVoting.sol/OZLinearVoting.json"
import MultiSend from "../artifacts/@gnosis.pm/safe-contracts/contracts/libraries/MultiSend.sol/MultiSend.json"
import ModuleFactory from "../artifacts/@gnosis.pm/zodiac/contracts/factory/ModuleProxyFactory.sol/ModuleProxyFactory.json"
import AMB from "../artifacts/contracts/test/AMBModule.sol/AMBModule.json"
import { buildContractCall, buildContractCallVariable, buildMultiSendSafeTx, safeSignMessage, executeTx } from "../test/shared/utils"
import { AddressZero } from "@ethersproject/constants"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying Sokol contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const SOKOL_GNOSISL2_MASTER = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const SOKOL_FACTORY = "0xE89ce3bcD35bA068A9F9d906896D3d03Ad5C30EC"
  const SOKOL_USUL_MASTER = "0x9679F571963FeA9b82601d89Fc46b0C5f3De882b"
  const SOKOL_MULTISEND = "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761"
  const SOKOL_LINEARVOTING_MASTER = "0xeA0D53049A0F930DbC9502B38B0eC305C167f98E"
  const SOKOL_MODULE_FACTORY = "0x15403F93cc56E7bA23ca85a107D2493a3fC13cC6"

  const SOKOL_SAFE = "0xd3138C773Db0618106a4d9967040137A68c255B1"
  const SOKOL_USUL = "0xcAf5ceB533e9B92713d127e30CfC7A4481B254e2"
  const SOKOL_LINEAR = "0x74C8C82e33963c55260b65c12C380e704ec8A7EE"

  const KOVAN_GNOSISL2_MASTER = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const KOVAN_FACTORY = "0x64F9F99BBdC5Ef6CEEf5Acd9bAd7ea582589A00d"
  const KOVAN_USUL_MASTER = "0x5BAC25BF575Cec88EAC9e95938Cd1F9D9D11F098"
  const KOVAN_MULTISEND = "0xfe933df9FDD13b8f52D97ad4b1C2fBBB81be5CC9"
  const KOVAN_LINEARVOTING_MASTER = "0x66E3493d36FF942b2D6897d53C2d46435862e527"
  const KOVAN_MODULE_FACTORY = "0x85f56447c8b90214aC69d457b5E2B937f73793aE"

  const KOVAN_SAFE = "0x3759fD4603d316546e546d6cB09d9D19251d8417"
  const KOVAN_BRIDGE_MASTER = "0x3faa96D7124a1b5b0FcabFbE488456f675025614"
  const KOVAN_BRIDGE = "0xdFdF12f152cE13B91aEEbfD07D66DD4e3cd5B654"

  // deploy order:
  // 1. Deploy safe on mainnet
  // 2. Deploy bridge module mainnet
  // 3. Enable bridge module

  const moduleFactory = new ethers.Contract(
    KOVAN_MODULE_FACTORY,
    ModuleFactory.abi,
    deployer
  )

  const kovanSafe = new ethers.Contract(
    KOVAN_SAFE,
    GnosisSafeL2.abi,
    deployer
  )

  // deploy safe on sokol
  // console.log("Deploying Kovan Safe through proxy factory")
  // const factory = new ethers.Contract(
  //   KOVAN_FACTORY,
  //   GnosisSafeProxyFactory.abi,
  //   deployer
  // )
  // const kovanSafeAddress = await factory.callStatic.createProxy(
  //   KOVAN_GNOSISL2_MASTER,
  //   "0x"
  // )
  // const safeKovan = new ethers.Contract(kovanSafeAddress, GnosisSafeL2.abi, deployer)
  // const safeSetupTx = buildContractCall(
  //   safeKovan,
  //   "setup",
  //   [[deployer.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero],
  //   0
  // )
  // const createProxyTx = await factory.createProxy(
  //   KOVAN_GNOSISL2_MASTER,
  //   safeSetupTx.data,
  //   {gasPrice: 20000000000}
  // )
  // await createProxyTx.wait()
  // console.log("Kovan Safe Deployed: " + kovanSafeAddress)

  // TODO: remove owner TX

  // -----------------------------------

  const _owner = KOVAN_SAFE // kovan safe
  const _avatar = KOVAN_SAFE // kovan safe
  const _target = KOVAN_SAFE // kovan safe
  const _amb = "0xFe446bEF1DbF7AFE24E81e05BC8B271C1BA9a560" // kovan and sokol amb
  const _controller = SOKOL_SAFE // sokol gnosis safe
  const _chainId = "0x000000000000000000000000000000000000000000000000000000000000004d" // kovan

  const bridge = new ethers.Contract(KOVAN_BRIDGE_MASTER, AMB.abi, deployer)
  const encodedInitParams = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "address", "address", "address", "bytes32"],
    [      
      _owner,
      _avatar,
      _target,
      _amb,
      _controller,
      _chainId
    ]
  )
  const initData = bridge.interface.encodeFunctionData("setUp", [encodedInitParams])
  const masterCopyAddress = bridge.address.toLowerCase().replace(/^0x/, "")
  const byteCode =
    "0x602d8060093d393df3363d3d373d3d3d363d73" +
    masterCopyAddress +
    "5af43d82803e903d91602b57fd5bf3"
  const salt = ethers.utils.solidityKeccak256(["bytes32", "uint256"], [ethers.utils.solidityKeccak256(["bytes"], [initData]), "0x01"])
  const expectedAddress = ethers.utils.getCreate2Address(moduleFactory.address, salt, ethers.utils.solidityKeccak256(["bytes"], [byteCode]))
  const deployBridge = buildContractCall(
    moduleFactory,
    "deployModule",
    [bridge.address, initData, "0x01"],
    0
  )
  console.log("expected bridge address: " + expectedAddress)

  // -----------------------------------
  // Register Usul with Safe sokol
  const registerBridge = buildContractCall(
    kovanSafe,
    "enableModule",
    [expectedAddress],
    0
  )
  console.log("register bridge transaction built")

  // -----------------------------------
  // send multisend tx
  let nonce = await kovanSafe.nonce()
  const multiSend = new ethers.Contract(
    KOVAN_MULTISEND,
    MultiSend.abi,
    deployer
  )
  const multiSendTx = buildMultiSendSafeTx(
    multiSend,
    [deployBridge, registerBridge],
    nonce
  )
  console.log("deploying bridge through multisend")
  const multiSendSig = await safeSignMessage(deployer, kovanSafe, multiSendTx)
  const tx = await executeTx(kovanSafe, multiSendTx, [multiSendSig])
  await tx.wait()

  console.log("Bridge address:", expectedAddress);
  const bridgeEnabled = await kovanSafe.isModuleEnabled(expectedAddress)
  console.log("Bridge is enabled: " + bridgeEnabled)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });