import hre, { ethers, network, waffle, deployments } from "hardhat";
import LinearVoting from "../artifacts/contracts/votingStrategies/OZLinearVoting.sol/OZLinearVoting.json"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const linearVotingAddress = "0x190612250203Eb8A20015daCFbB3e9dfB1B7872A"

  const linearVoting = new ethers.Contract(usulAddress, LinearVoting.abi, deployer)
  // go through safe to register usul
  
  console.log("OZLinearVoting address:", linear.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });