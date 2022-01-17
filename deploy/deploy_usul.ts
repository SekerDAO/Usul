import hre, { ethers, network, waffle, deployments } from "hardhat";
import GnosisSafeProxyFactory from "../artifacts/@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json"
import Usul from "../artifacts/contracts/Usul.sol/Usul.json"
import { buildContractCall } from "../test/shared/utils"
import { AddressZero } from "@ethersproject/constants"

async function main() {
  const { deployments } = hre;
  const [deployer] = await ethers.getSigners();
  const { deploy } = deployments;

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const SOKOL_FACTORY = "0xE89ce3bcD35bA068A9F9d906896D3d03Ad5C30EC"
  const SOKOL_USUL_MASTER = "0x9679F571963FeA9b82601d89Fc46b0C5f3De882b"

  const factory = new ethers.Contract(
    //KOVAN_FACTORY,
    SOKOL_FACTORY,
    GnosisSafeProxyFactory.abi,
    deployer
  )

  const usul = new ethers.Contract(usulAddress, Usul.abi, deployer)
  const encodedInitParams = ethers.defaultAbiCoder.encode(
    ["address", "address", "address", "address[]"],
    [      
      "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
      "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
      "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
      ["0x190612250203Eb8A20015daCFbB3e9dfB1B7872A"]
    ]
  )
  const initData = usul.interface.encodeFunctionData("setUp", [encodedInitParams])
  const masterCopyAddress = usul.address.toLowerCase().replace(/^0x/, "")
  const byteCode =
    "0x602d8060093d393df3363d3d373d3d3d363d73" +
    masterCopyAddress +
    "5af43d82803e903d91602b57fd5bf3"
  const salt = keccak256(["bytes32", "uint256"], [keccak256(["bytes"], [initData]), "0x01"])
  const expectedAddress = getCreate2Address(factory.address, salt, keccak256(["bytes"], [byteCode]))
  const deployUsul = buildContractCall(
    factory,
    "deployModule",
    [usulMaster.address, initData, "0x01"],
    0
  )
  // const usulSetupTx = buildContractCall(
  //   usul,
  //   "setUp",
  //   [
  //     "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
  //     "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
  //     "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
  //     ["0x190612250203Eb8A20015daCFbB3e9dfB1B7872A"]
  //   ],
  //   0
  // )

  const createProxyTx = await factory.createProxy(
    //GNOSISL2_MASTER,
    SOKOL_USUL_MASTER,
    deployUsul.data,
    {gasPrice: 20000000000}
  )
  await createProxyTx.wait()

  // sokol
  // const Usul = await ethers.getContractFactory("Usul");
  // const usul = await Usul.deploy(
  //   "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
  //   "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
  //   "0x427e51309aB7Cdf0e6Bb54bD90251ee1DF799590",
  //   [],
  //   {gasPrice: 20000000000}
  // );

  // console.log("Usul address:", usul.address);
  console.log("create2 usul: " + expectedAddress)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });