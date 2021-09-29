import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, network, waffle, deployments } from "hardhat";
import { _TypedDataEncoder } from "@ethersproject/hash";
import {
  executeContractCallWithSigners,
  buildContractCall,
} from "./shared/utils";
import { AddressZero } from "@ethersproject/constants";
import { signTypedData_v4, MsgParams } from "eth-sig-util";
import { TypedDataUtils } from "ethers-eip712";
import { ecsign } from "ethereumjs-util";
//import { sign } from "./shared/EIP712";

const deadline =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("realityVotingStrategies:", () => {
  const [
    wallet_0,
    wallet_1,
    wallet_2,
  ] = waffle.provider.getWallets();
  const chainId = ethers.BigNumber.from(network.config.chainId);
  const tx = {
    to: wallet_1.address,
    value: 0,
    data: "0x",
    operation: 0,
    nonce: 0,
  };
  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const [wallet_0, wallet_1, wallet_2, wallet_3] =
      waffle.provider.getWallets();
    const govTokenContract = await ethers.getContractFactory("GovernanceToken");
    const govToken = await govTokenContract.deploy(
      "GovToken",
      "GT",
      ethers.BigNumber.from("100000000000000000000000")
    );
    const GnosisSafeL2 = await hre.ethers.getContractFactory(
      "@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol:GnosisSafeL2"
    );
    const FactoryContract = await hre.ethers.getContractFactory(
      "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol:GnosisSafeProxyFactory"
    );
    const singleton = await GnosisSafeL2.deploy();
    const factory = await FactoryContract.deploy();
    const template = await factory.callStatic.createProxy(
      singleton.address,
      "0x"
    );
    await factory
      .createProxy(singleton.address, "0x")
      .then((tx: any) => tx.wait());
    const safe = GnosisSafeL2.attach(template);
    safe.setup(
      [wallet_0.address],
      1,
      AddressZero,
      "0x",
      AddressZero,
      AddressZero,
      0,
      AddressZero
    );

    const proposalContract = await ethers.getContractFactory("SeeleModule");
    const proposalModule = await proposalContract.deploy(
      safe.address,
      safe.address,
      safe.address
    );

    const Mock = await hre.ethers.getContractFactory("MockContract");
    const mock = await Mock.deploy();
    const oracle = await hre.ethers.getContractAt("RealitioV3ERC20", mock.address);
    const RealityContract = await ethers.getContractFactory("RealityERC20Voting");
    const realityVoting = await RealityContract.deploy(
        safe.address,
        proposalModule.address,
        oracle.address,
        42,
        23,
        0,
        0,
        1337,
        mock.address
    );

    const addCall = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_1.address, 1],
      await safe.nonce()
    );
    const addCall_1 = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_2.address, 1],
      await safe.nonce()
    );
    const txHash = await proposalModule.getTransactionHash(
      addCall.to,
      addCall.value,
      addCall.data,
      addCall.operation,
      0
    );
    const txHash_1 = await proposalModule.getTransactionHash(
      addCall_1.to,
      addCall_1.value,
      addCall_1.data,
      addCall_1.operation,
      0
    );
    await executeContractCallWithSigners(
      safe,
      safe,
      "enableModule",
      [proposalModule.address],
      [wallet_0]
    );
    await executeContractCallWithSigners(
      safe,
      proposalModule,
      "enableStrategy",
      [realityVoting.address],
      [wallet_0]
    );

    return {
      proposalModule,
      oracle,
      mock,
      realityVoting,
      govToken,
      factory,
      txHash,
      txHash_1,
      addCall,
      addCall_1,
      safe,
    };
  });

  describe("setUp", async () => {
    it("test", async () => {
      const { proposalModule, realityVoting, mock, oracle, safe, txHash, txHash_1 } = await baseSetup();
      const id = "some_random_id";
      const question = await realityVoting.buildQuestion(id, [txHash]);
      const questionId = await realityVoting.getQuestionId(question, 0);
      const questionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(question));
      await mock.givenMethodReturnUint(oracle.interface.getSighash("askQuestionWithMinBondERC20"), questionId)
      const abi = ethers.utils.defaultAbiCoder.encode(
        ["bytes32[]", "string", "uint256"],
        [[txHash], id, 0]
      );
      await expect(
          proposalModule.submitProposal([txHash], realityVoting.address, abi)
      ).to.emit(realityVoting, "ProposalQuestionCreated").withArgs(questionId, id)
    });
  });
  // can use the safe and a cancel proposal role
});
