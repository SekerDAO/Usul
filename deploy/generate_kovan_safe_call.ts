import hre, { ethers, network, waffle, deployments } from "hardhat";
import GnosisSafeProxyFactory from "../artifacts/@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json"
import GnosisSafeL2 from "../artifacts/@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol/GnosisSafeL2.json"
import Usul from "../artifacts/contracts/Usul.sol/Usul.json"
import LinearVoting from "../artifacts/contracts/votingStrategies/OZLinearVoting.sol/OZLinearVoting.json"
import MultiSend from "../artifacts/@gnosis.pm/safe-contracts/contracts/libraries/MultiSend.sol/MultiSend.json"
import ModuleFactory from "../artifacts/@gnosis.pm/zodiac/contracts/factory/ModuleProxyFactory.sol/ModuleProxyFactory.json"
import AMB from "../artifacts/contracts/test/AMBModule.sol/AMBModule.json"
import GovToken from "../artifacts/contracts/test/GovernanceToken.sol/GovernanceToken.json"
import { buildContractCall, buildContractCallVariable, buildMultiSendSafeTx, safeSignMessage, executeTx } from "../test/shared/utils"
import { AddressZero } from "@ethersproject/constants"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying Sokol contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const _amb = "0xFe446bEF1DbF7AFE24E81e05BC8B271C1BA9a560"
  const SOKOL_GNOSISL2_MASTER = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const SOKOL_FACTORY = "0xE89ce3bcD35bA068A9F9d906896D3d03Ad5C30EC"
  const SOKOL_USUL_MASTER = "0x9679F571963FeA9b82601d89Fc46b0C5f3De882b"
  const SOKOL_MULTISEND = "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761"
  const SOKOL_LINEARVOTING_MASTER = "0xeA0D53049A0F930DbC9502B38B0eC305C167f98E"
  const SOKOL_MODULE_FACTORY = "0x15403F93cc56E7bA23ca85a107D2493a3fC13cC6"

  const SOKOL_SAFE = "0xd3138C773Db0618106a4d9967040137A68c255B1"
  const SOKOL_USUL = "0xcAf5ceB533e9B92713d127e30CfC7A4481B254e2"
  const SOKOL_LINEAR = "0xAD19c42f3460D9453946B26C0545d53A794A4037"
  const SOKOL_GOVTOKEN = "0x4D5Ad17E0877B72D15545A4855208a2b30d09336"

  const KOVAN_GNOSISL2_MASTER = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const KOVAN_FACTORY = "0x64F9F99BBdC5Ef6CEEf5Acd9bAd7ea582589A00d"
  const KOVAN_USUL_MASTER = "0x5BAC25BF575Cec88EAC9e95938Cd1F9D9D11F098"
  const KOVAN_MULTISEND = "0xfe933df9FDD13b8f52D97ad4b1C2fBBB81be5CC9"
  const KOVAN_LINEARVOTING_MASTER = "0x66E3493d36FF942b2D6897d53C2d46435862e527"
  const KOVAN_MODULE_FACTORY = "0x85f56447c8b90214aC69d457b5E2B937f73793aE"

  const KOVAN_SAFE = "0x3759fD4603d316546e546d6cB09d9D19251d8417"
  const KOVAN_BRIDGE_MASTER = "0x3faa96D7124a1b5b0FcabFbE488456f675025614"
  const KOVAN_BRIDGE = "0xdFdF12f152cE13B91aEEbfD07D66DD4e3cd5B654"

  const safeKovan = new ethers.Contract(
    KOVAN_SAFE,
    GnosisSafeL2.abi,
    deployer
  )
  const safeSokol = new ethers.Contract(
    SOKOL_SAFE,
    GnosisSafeL2.abi,
    deployer
  )
  const usulSokol = new ethers.Contract(
    SOKOL_USUL,
    Usul.abi,
    deployer
  )
  const AMBSokol = new ethers.Contract(
    _amb,
    AMB.abi,
    deployer
  )

  const bridgeKovan = new ethers.Contract(
    KOVAN_BRIDGE,
    AMB.abi,
    deployer
  )

  const govtoken = new ethers.Contract(
    SOKOL_GOVTOKEN,
    GovToken.abi,
    deployer
  )

  let isOwner = await safeKovan.isOwner(KOVAN_BRIDGE)
  console.log(isOwner)

  //const nonce = await safeKovan.nonce()
  const addCall = buildContractCall(
    safeKovan,
    "addOwnerWithThreshold",
    [KOVAN_BRIDGE, 1],
    0
  );
  //console.log("nonce: "+nonce)
  console.log("to: "+addCall.to)
  console.log("value: "+addCall.value)
  console.log("data: "+addCall.data)
  console.log("operation: "+addCall.operation)

  const bridgeCall = buildContractCall(
    bridgeKovan,
    "executeTransaction",
    [safeKovan.address, 0, addCall.data, 0],
    0
  );

  console.log(bridgeCall.data)

  const ambCall = buildContractCall(
    AMBSokol,
    "requireToPassMessage",
    [bridgeKovan.address, bridgeCall.data, 1000000],
    0
  );

  console.log(ambCall.data)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });