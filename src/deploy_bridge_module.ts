import hre, { ethers, network, waffle, deployments } from "hardhat";

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const _owner = "" // kovan safe
  const _avatar = "" // kovan safe
  const _target = "" // kovan safe
  const _amb = "0xFe446bEF1DbF7AFE24E81e05BC8B271C1BA9a560" // kovan amb
  const _controller = "" // sokol gnosis safe
  const _chainId = "0x64" // kovan
  
  const Bridge = await ethers.getContractFactory("AMBModule");
  const bridge = await Bridge.deploy(
    _owner,
    _avatar,
    _target,
    _amb,
    _controller,
    _chainId
  );

  console.log("Bridge address:", bridge.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });