import hre, { ethers, network, waffle, deployments } from "hardhat";
import GnosisSafeProxyFactory from "../artifacts/@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json"
import GnosisSafeL2 from "../artifacts/@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol/GnosisSafeL2.json"
import { buildContractCall } from "../test/shared/utils"
import { AddressZero } from "@ethersproject/constants"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const GNOSISL2_MASTER_KOVAN = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const GNOSISL2_MASTER_SOKOL = "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8"
  const KOVAN_FACTORY = "0x64F9F99BBdC5Ef6CEEf5Acd9bAd7ea582589A00d"
  const SOKOL_FACTORY = "0xE89ce3bcD35bA068A9F9d906896D3d03Ad5C30EC"
  const SOKOL_MULTISEND = "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761"

  const factory = new ethers.Contract(
    //KOVAN_FACTORY,
    SOKOL_FACTORY,
    GnosisSafeProxyFactory.abi,
    deployer
  )

  const safeAddress = await factory.callStatic.createProxy(
    //GNOSISL2_MASTER,
    GNOSISL2_MASTER_SOKOL,
    "0x"
  )

  const safe = new ethers.Contract(safeAddress, GnosisSafeL2.abi, deployer)
  const safeSetupTx = buildContractCall(
    safe,
    "setup",
    [[deployer.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero],
    0
  )

  const createProxyTx = await factory.createProxy(
    //GNOSISL2_MASTER,
    GNOSISL2_MASTER_SOKOL,
    safeSetupTx.data,
    {gasPrice: 20000000000}
  )
  await createProxyTx.wait()

  console.log("Safe Deployed: " + safeAddress)

  // console.log("Deploying contracts with the account:", deployer.address);

  // console.log("Account balance:", (await deployer.getBalance()).toString());

  // const Factory = await ethers.getContractFactory("ModuleProxyFactory");
  // const factory = await Factory.deploy();

  // console.log("Factory address:", factory.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });