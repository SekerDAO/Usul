import hre, { ethers, network, waffle, deployments } from "hardhat";
import GnosisSafeProxyFactory from "../artifacts/@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json"
import GnosisSafeL2 from "../artifacts/@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol/GnosisSafeL2.json"
import Usul from "../artifacts/contracts/Usul.sol/Usul.json"
import LinearVoting from "../artifacts/contracts/votingStrategies/OZLinearVoting.sol/OZLinearVoting.json"
import MultiSend from "../artifacts/@gnosis.pm/safe-contracts/contracts/libraries/MultiSend.sol/MultiSend.json"
import ModuleFactory from "../artifacts/@gnosis.pm/zodiac/contracts/factory/ModuleProxyFactory.sol/ModuleProxyFactory.json"
import { buildContractCall, buildContractCallVariable, buildMultiSendSafeTx, safeSignMessage, executeTx } from "../test/shared/utils"
import { AddressZero } from "@ethersproject/constants"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying Sokol contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const _amb = "0xFe446bEF1DbF7AFE24E81e05BC8B271C1BA9a560" // kovan and sokol amb
  const SOKOL_GNOSISL2_MASTER = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const SOKOL_FACTORY = "0xE89ce3bcD35bA068A9F9d906896D3d03Ad5C30EC"
  const SOKOL_USUL_MASTER = "0x9679F571963FeA9b82601d89Fc46b0C5f3De882b"
  const SOKOL_MULTISEND = "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761"
  const SOKOL_LINEARVOTING_MASTER = "0xeA0D53049A0F930DbC9502B38B0eC305C167f98E"
  const SOKOL_MODULE_FACTORY = "0x15403F93cc56E7bA23ca85a107D2493a3fC13cC6"

  const SOKOL_SAFE = "0xd3138C773Db0618106a4d9967040137A68c255B1"
  const SOKOL_USUL = "0xcAf5ceB533e9B92713d127e30CfC7A4481B254e2"
  const SOKOL_LINEAR = "0xAD19c42f3460D9453946B26C0545d53A794A4037"

  const KOVAN_GNOSISL2_MASTER = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const KOVAN_FACTORY = "0x64F9F99BBdC5Ef6CEEf5Acd9bAd7ea582589A00d"
  const KOVAN_USUL_MASTER = "0x5BAC25BF575Cec88EAC9e95938Cd1F9D9D11F098"
  const KOVAN_MULTISEND = "0xfe933df9FDD13b8f52D97ad4b1C2fBBB81be5CC9"
  const KOVAN_LINEARVOTING_MASTER = "0x66E3493d36FF942b2D6897d53C2d46435862e527"

  // deploy order:
  // 1. Deploy safe on sokol
  // 2. Deploy Usul on sokol
  //  2a. Deploy Strat
  //  2b. Deploy Usul (with strat)
  //  2c. Set Usul on strat
  //  2d. Register usul with safe
  // 3. Deploy safe on mainnet
  // 4. Deploy bridge and set it as safe mod

  const moduleFactory = new ethers.Contract(
    SOKOL_MODULE_FACTORY,
    ModuleFactory.abi,
    deployer
  )

  // deploy safe on sokol
  console.log("Deploying Sokol Safe through proxy factory")
  const factory = new ethers.Contract(
    SOKOL_FACTORY,
    GnosisSafeProxyFactory.abi,
    deployer
  )
  const sokolSafeAddress = await factory.callStatic.createProxy(
    SOKOL_GNOSISL2_MASTER,
    "0x"
  )
  const safeSokol = new ethers.Contract(sokolSafeAddress, GnosisSafeL2.abi, deployer)
  const safeSetupTx = buildContractCall(
    safeSokol,
    "setup",
    [[deployer.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero],
    0
  )
  const createProxyTx = await factory.createProxy(
    SOKOL_GNOSISL2_MASTER,
    safeSetupTx.data,
    {gasPrice: 20000000000}
  )
  await createProxyTx.wait()
  console.log("Sokol Safe Deployed: " + sokolSafeAddress)

  // TODO: remove owner TX

  // -----------------------------------
  // Deploy Linear Voting strat on Sokol
  const linearVotingMaster = new ethers.Contract(
    SOKOL_LINEARVOTING_MASTER,
    LinearVoting.abi,
    deployer
  )
  const encodedLinearInitParams = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "address", "uint256", "uint256", "uint256", "string"],
      [
          sokolSafeAddress, // owner
          "0x4D5Ad17E0877B72D15545A4855208a2b30d09336", // governance token
          "0x0000000000000000000000000000000000000001", // Usul
          120, // voting period
          1, // quorum numerator
          0, // timelock
          "linearVoting"
      ]
  )
  const initLinearData = linearVotingMaster.interface.encodeFunctionData("setUp", [
      encodedLinearInitParams
  ])
  const masterLinearCopyAddress = linearVotingMaster.address.toLowerCase().replace(/^0x/, "")
  const byteCodeLinear =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterLinearCopyAddress +
      "5af43d82803e903d91602b57fd5bf3"
  const saltLinear = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [ethers.utils.solidityKeccak256(["bytes"], [initLinearData]), "0x01"]
  )
  const expectedLinearAddress = ethers.utils.getCreate2Address(
      moduleFactory.address,
      saltLinear,
      ethers.utils.solidityKeccak256(["bytes"], [byteCodeLinear])
  )
  const deployLinear = buildContractCall(
      moduleFactory,
      "deployModule",
      [linearVotingMaster.address, initLinearData, "0x01"],
      0
  )

  console.log("OZLinearVoting expected address: " + expectedLinearAddress);

  // -----------------------------------
  // Deploy Usul on Sokol
  // const factory = new ethers.Contract(
  //   SOKOL_FACTORY,
  //   GnosisSafeProxyFactory.abi,
  //   deployer
  // )
  const usul = new ethers.Contract(SOKOL_USUL_MASTER, Usul.abi, deployer)
  const encodedInitParams = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "address", "address[]"],
    [      
      sokolSafeAddress,
      sokolSafeAddress,
      sokolSafeAddress,
      [expectedLinearAddress]
    ]
  )
  const initData = usul.interface.encodeFunctionData("setUp", [encodedInitParams])
  const masterCopyAddress = usul.address.toLowerCase().replace(/^0x/, "")
  const byteCode =
    "0x602d8060093d393df3363d3d373d3d3d363d73" +
    masterCopyAddress +
    "5af43d82803e903d91602b57fd5bf3"
  const salt = ethers.utils.solidityKeccak256(["bytes32", "uint256"], [ethers.utils.solidityKeccak256(["bytes"], [initData]), "0x01"])
  const expectedAddress = ethers.utils.getCreate2Address(moduleFactory.address, salt, ethers.utils.solidityKeccak256(["bytes"], [byteCode]))
  const deployUsul = buildContractCall(
    moduleFactory,
    "deployModule",
    [usul.address, initData, "0x01"],
    0
  )
  console.log("expected usul address: " + expectedAddress)

  // -----------------------------------
  // Set Usul with Strategies Sokol
  const setUsul = buildContractCallVariable(
    linearVotingMaster,
    expectedLinearAddress,
    "setUsul",
    [expectedAddress],
    0
  )
  console.log("set Usul transaction built")

  // -----------------------------------
  // Register Usul with Safe sokol
  const registerUsul = buildContractCall(
    safeSokol,
    "enableModule",
    [expectedAddress],
    0
  )
  console.log("register Usul transaction built")

  // -----------------------------------
  // send multisend tx
  let nonce = await safeSokol.nonce()
  const multiSend = new ethers.Contract(
    SOKOL_MULTISEND,
    MultiSend.abi,
    deployer
  )
  const multiSendTx = buildMultiSendSafeTx(
    multiSend,
    [deployLinear, deployUsul, setUsul, registerUsul],
    nonce
  )
  console.log("deploying usul through multisend")
  const multiSendSig = await safeSignMessage(deployer, safeSokol, multiSendTx)
  const tx = await executeTx(safeSokol, multiSendTx, [multiSendSig], {gasPrice: 20000000000})
  await tx.wait()
  console.log("Finished deploying Sokol Voting System")
  console.log("Checking deployment")
  const linearVotingDeployed = new ethers.Contract(
    expectedLinearAddress,
    LinearVoting.abi,
    deployer
  )
  const linearUsul = await linearVotingDeployed.UsulModule()
  console.log("linear usul set to: " + linearUsul)
  const usulDeployed = new ethers.Contract(
    expectedAddress,
    Usul.abi,
    deployer
  )
  const usulStratEnabled = await usulDeployed.isStrategyEnabled(expectedLinearAddress)
  console.log("Linear strat is enabled: " + usulStratEnabled)
  const safeDeployed = new ethers.Contract(
    sokolSafeAddress,
    GnosisSafeL2.abi,
    deployer
  )
  const usulEnabled = await safeDeployed.isModuleEnabled(expectedAddress)
  console.log("Usul is enabled: " + usulEnabled)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });