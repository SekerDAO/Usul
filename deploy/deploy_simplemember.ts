import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import hre, { deployments, waffle, ethers } from "hardhat";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;

  await deploy("SimpleMemberVoting", {
    from: deployer,
    args: [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000001',
      2,
      1,
      1,
      'SimpleMemberVoting',
      ['0x0000000000000000000000000000000000000001']
    ],
    log: true,
    deterministicDeployment: true,
    gasPrice: ethers.BigNumber.from("2352250007")
  });
};

deploy.tags = ["simple-member-voting"];
export default deploy;
