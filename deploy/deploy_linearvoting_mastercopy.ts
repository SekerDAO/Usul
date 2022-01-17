import hre, { ethers, network, waffle, deployments } from "hardhat";

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Linear = await ethers.getContractFactory("OZLinearVoting");
  const linear = await Linear.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      2, // number of votes wieghted to pass
      1,
      2, // number of days proposals are active
      "OZLinearVoting",
      {gasPrice: 20000000000}
  );

  console.log("OZLinearVoting address:", linear.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });