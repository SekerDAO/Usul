import hre, { ethers, network, waffle, deployments } from "hardhat";

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Gov = await ethers.getContractFactory("GovernanceToken");
  const gov = await Gov.deploy(
    "Test",
    "TST",
    ethers.BigNumber.from("100000000000000000000000"),
    {gasPrice: 20000000000}
  );

  console.log("Govtoken address:", gov.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });