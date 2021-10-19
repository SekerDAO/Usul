import hre, { ethers, network, waffle, deployments } from "hardhat";

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Seele = await ethers.getContractFactory("Seele");
  const seele = await Seele.deploy(
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000001",
    []
  );

  console.log("Seele address:", seele.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });