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
  const [wallet_0, wallet_1, wallet_2] = waffle.provider.getWallets();
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

    const moduleFactoryContract = await ethers.getContractFactory(
      "ModuleProxyFactory"
    );
    const moduleFactory = await moduleFactoryContract.deploy();
    const proposalContract = await ethers.getContractFactory("Usul");
    const masterProposalModule = await proposalContract.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      []
    );
    const encodedInitParams = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "address", "address[]"],
      [safe.address, safe.address, safe.address, []]
    );
    const initData = masterProposalModule.interface.encodeFunctionData(
      "setUp",
      [encodedInitParams]
    );
    const masterCopyAddress = masterProposalModule.address
      .toLowerCase()
      .replace(/^0x/, "");
    const byteCode =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterCopyAddress +
      "5af43d82803e903d91602b57fd5bf3";
    const salt = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [ethers.utils.solidityKeccak256(["bytes"], [initData]), "0x01"]
    );
    const expectedAddress = ethers.utils.getCreate2Address(
      moduleFactory.address,
      salt,
      ethers.utils.keccak256(byteCode)
    );
    expect(
      await moduleFactory.deployModule(
        masterProposalModule.address,
        initData,
        "0x01"
      )
    )
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedAddress, masterProposalModule.address);
    const proposalModule = proposalContract.attach(expectedAddress);

    const Mock = await hre.ethers.getContractFactory("MockContract");
    const mock = await Mock.deploy();
    const oracle = await hre.ethers.getContractAt(
      "RealitioV3ERC20",
      mock.address
    );

    const RealityContract = await ethers.getContractFactory(
      "RealityERC20Voting"
    );
    const realityVotingMaster = await RealityContract.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      1, // timeout
      0, // cooldown
      0, // expiration
      0, // bond
      0, // template id
      "0x0000000000000000000000000000000000000001",
      0
    );
    const encodedRealityInitParams = ethers.utils.defaultAbiCoder.encode(
      [
        "address",
        "address",
        "address",
        "uint32",
        "uint32",
        "uint32",
        "uint256",
        "uint256",
        "address",
        "uint256",
      ],
      [
        safe.address,
        proposalModule.address,
        oracle.address,
        42,
        0,
        0,
        0,
        1337,
        mock.address,
        60,
      ]
    );
    const initRealityData = realityVotingMaster.interface.encodeFunctionData(
      "setUp",
      [encodedRealityInitParams]
    );
    const masterCopyRealityAddress = realityVotingMaster.address
      .toLowerCase()
      .replace(/^0x/, "");
    const byteCodeReality =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterCopyRealityAddress +
      "5af43d82803e903d91602b57fd5bf3";
    const saltReality = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [ethers.utils.solidityKeccak256(["bytes"], [initRealityData]), "0x01"]
    );
    const expectedAddressReality = ethers.utils.getCreate2Address(
      moduleFactory.address,
      saltReality,
      ethers.utils.keccak256(byteCodeReality)
    );
    expect(
      await moduleFactory.deployModule(
        realityVotingMaster.address,
        initRealityData,
        "0x01"
      )
    )
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedAddressReality, realityVotingMaster.address);
    const realityVoting = realityVotingMaster.attach(expectedAddressReality);

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
      addCall.operation
    );
    const txHash_1 = await proposalModule.getTransactionHash(
      addCall_1.to,
      addCall_1.value,
      addCall_1.data,
      addCall_1.operation
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
      const {
        proposalModule,
        realityVoting,
        mock,
        oracle,
        safe,
        txHash,
        txHash_1,
        addCall,
      } = await baseSetup();
      const id = "some_random_id";
      const question = await realityVoting.buildQuestion(id, [txHash]);
      const questionId = await realityVoting.getQuestionId(question, 0);
      const questionHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(question)
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("askQuestionWithMinBondERC20"),
        questionId
      );
      const abi = ethers.utils.defaultAbiCoder.encode(
        ["string", "uint256"],
        [id, 0]
      );
      await expect(
        proposalModule.submitProposal([txHash], realityVoting.address, abi)
      )
        .to.emit(realityVoting, "ProposalQuestionCreated")
        .withArgs(questionId, id);
      const block = await ethers.provider.getBlock("latest");
      //await mock.reset()
      //await mock.givenMethodReturnUint(oracle.interface.getSighash("getBond"), 7331)
      await mock.givenMethodReturnBool(
        oracle.interface.getSighash("resultFor"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getFinalizeTS"),
        block.timestamp
      );

      //await nextBlockTime(hre, block.timestamp + 24)
      await realityVoting.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0 // call operation
      );
      expect(await proposalModule.state(0)).to.equal(3);
      let proposal = await proposalModule.proposals(0);
      let isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_1.address);
      expect(owners[1]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(1);
    });
  });
  // can use the safe and a cancel proposal role
});
