import hre, { ethers, network, waffle, deployments } from "hardhat";
import Usul from "../artifacts/contracts/Usul.sol/Usul.json"
import GnosisSafeL2 from "../artifacts/@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol/GnosisSafeL2.json"
import { buildContractCall, buildContractCallVariable, buildMultiSendSafeTx, safeSignMessage, executeTx } from "../test/shared/utils"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const SOKOL_USUL = "0xcAf5ceB533e9B92713d127e30CfC7A4481B254e2"
  const SOKOL_SAFE = "0xd3138C773Db0618106a4d9967040137A68c255B1"

  const usulDeployed = new ethers.Contract(
    SOKOL_USUL,
    Usul.abi,
    deployer
  )

  const safeDeployed = new ethers.Contract(
    SOKOL_SAFE,
    GnosisSafeL2.abi,
    deployer
  )

  const Linear = await ethers.getContractFactory("OZLinearVoting");
  const linear = await Linear.deploy(
      SOKOL_SAFE, // owner
      "0x4D5Ad17E0877B72D15545A4855208a2b30d09336", // governance token
      SOKOL_USUL, // Usul
      120, // voting period
      1, // quorum numerator
      0, // timelock
      "linearVoting",
      {gasPrice: 20000000000}
  );

  console.log("OZLinearVoting address:", linear.address);

  let nonce = await safeDeployed.nonce()
  const registerTx = buildContractCall(
    usulDeployed,
    "enableStrategy",
    [linear.address],
    nonce
  );
  console.log("enabling new strat on usul")
  const enableSig = await safeSignMessage(deployer, safeDeployed, registerTx)
  const tx = await executeTx(safeDeployed, registerTx, [enableSig], {gasPrice: 40000000000})
  await tx.wait()

  const usulStratEnabled = await usulDeployed.isStrategyEnabled(linear.address)
  console.log("Linear strat is enabled: " + usulStratEnabled)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });