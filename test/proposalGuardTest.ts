import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, network, waffle, deployments } from "hardhat";
import { _TypedDataEncoder } from "@ethersproject/hash";
import {
  executeContractCallWithSigners,
  buildContractCall,
} from "./shared/utils";
import { AddressZero } from "@ethersproject/constants";
import { signTypedMessage, TypedDataUtils } from "eth-sig-util";
import { ecsign } from "ethereumjs-util";
import Wallet from "ethereumjs-wallet";

const deadline =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("ProposalGuardStrategy:", () => {
  const [wallet_0, wallet_1, wallet_2, wallet_3] = waffle.provider.getWallets();
  const chainId = ethers.BigNumber.from(network.config.chainId).toNumber();
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
    const defaultBalance = ethers.BigNumber.from("10000000000000000000000");
    const thresholdBalance = ethers.BigNumber.from("20000000000000000000000");
    const thresholdPercent = ethers.BigNumber.from(20);
    const totalSupply = ethers.BigNumber.from("100000000000000000000000");
    const safeSupply = ethers.BigNumber.from("50000000000000000000000");
    const govTokenContract = await ethers.getContractFactory("GovernanceToken");
    const govToken = await govTokenContract.deploy(
      "GovToken",
      "GT",
      totalSupply
    );
    await govToken.transfer(wallet_1.address, defaultBalance);
    await govToken.transfer(wallet_2.address, defaultBalance);
    await govToken.transfer(wallet_3.address, defaultBalance);

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

    const linearContract = await ethers.getContractFactory("OZLinearVoting");
    const linearVoting = await linearContract.deploy(
      safe.address,
      govToken.address,
      proposalModule.address,
      60,
      thresholdPercent, // number of votes wieghted to pass
      60, // number of days proposals are active
      "Test"
    );

    const proposalGuardContract = await ethers.getContractFactory(
      "ProposalGuard"
    );
    const masterProposalGuard = await proposalGuardContract.deploy(
      [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ],
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001"
    );
    const encodedGuardInitParams = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "address", "address"],
      [
        [wallet_0.address, wallet_1.address],
        safe.address,
        proposalModule.address,
      ]
    );
    const initGuardData = masterProposalGuard.interface.encodeFunctionData(
      "setUp",
      [encodedGuardInitParams]
    );
    const masterCopyGuardAddress = masterProposalGuard.address
      .toLowerCase()
      .replace(/^0x/, "");
    const byteCodeGuard =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterCopyGuardAddress +
      "5af43d82803e903d91602b57fd5bf3";
    const saltGuard = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [ethers.utils.solidityKeccak256(["bytes"], [initGuardData]), "0x01"]
    );
    const expectedGuardAddress = ethers.utils.getCreate2Address(
      moduleFactory.address,
      saltGuard,
      ethers.utils.keccak256(byteCodeGuard)
    );
    expect(
      await moduleFactory.deployModule(
        masterProposalGuard.address,
        initGuardData,
        "0x01"
      )
    )
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedGuardAddress, masterProposalGuard.address);
    const proposalGuard = masterProposalGuard.attach(expectedGuardAddress);

    await govToken.transfer(safe.address, safeSupply);
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
      [linearVoting.address],
      [wallet_0]
    );
    await executeContractCallWithSigners(
      safe,
      proposalModule,
      "enableStrategy",
      [proposalGuard.address],
      [wallet_0]
    );

    return {
      proposalModule,
      linearVoting,
      proposalGuard,
      govToken,
      factory,
      txHash,
      txHash_1,
      addCall,
      addCall_1,
      safe,
      defaultBalance,
      thresholdBalance,
    };
  });

  describe("setUp", async () => {
    it("can register proposal guard strat", async () => {
      const { proposalModule, proposalGuard } = await baseSetup();
      expect(
        await proposalModule.isStrategyEnabled(proposalGuard.address)
      ).to.equal(true);
    });

    it("state is initialized correctly", async () => {
      const { proposalGuard, safe, govToken } = await baseSetup();
      expect(await proposalGuard.allowedGuards(wallet_0.address)).to.equal(
        true
      );
      expect(await proposalGuard.allowedGuards(wallet_1.address)).to.equal(
        true
      );
      expect(await proposalGuard.allowedGuards(wallet_2.address)).to.equal(
        false
      );
    });
  });

  describe("proposal guard", async () => {
    it("should revert enabling guard if not from avatar/owner", async () => {
      const { proposalGuard, safe } = await baseSetup();
      await expect(
        proposalGuard.enableGuard(wallet_2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert disabling guard if not from avatar/owner", async () => {
      const { proposalGuard, safe } = await baseSetup();
      await expect(
        proposalGuard.disableGuard(wallet_1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if invalid guard", async () => {
      const { proposalGuard, safe } = await baseSetup();
      await expect(
        executeContractCallWithSigners(
          safe,
          proposalGuard,
          "enableGuard",
          [AddressZero],
          [wallet_0]
        )
      ).to.be.revertedWith("GS013");
      await expect(
        executeContractCallWithSigners(
          safe,
          proposalGuard,
          "disableGuard",
          [AddressZero],
          [wallet_0]
        )
      ).to.be.revertedWith("GS013");
    });

    it("should revert if guard is enabled already", async () => {
      const { proposalGuard, safe } = await baseSetup();
      await expect(
        executeContractCallWithSigners(
          safe,
          proposalGuard,
          "enableGuard",
          [wallet_1.address],
          [wallet_0]
        )
      ).to.be.revertedWith("GS013");
    });

    it("can add a new guard with admins", async () => {
      const { proposalGuard, safe } = await baseSetup();
      expect(
        await executeContractCallWithSigners(
          safe,
          proposalGuard,
          "enableGuard",
          [wallet_2.address],
          [wallet_0]
        )
      )
        .to.emit(proposalGuard, "EnabledGuard")
        .withArgs(wallet_2.address);
      expect(await proposalGuard.allowedGuards(wallet_2.address)).to.equal(
        true
      );
    });

    it("can add a new guard from proposal", async () => {
      const { proposalModule, safe, linearVoting, proposalGuard, govToken } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      const Call = buildContractCall(
        proposalGuard,
        "enableGuard",
        [wallet_2.address],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        proposalGuard.address, // target
        0, // value
        Call.data, // data
        0 // call operation
      );
      expect(await proposalGuard.allowedGuards(wallet_2.address)).to.equal(
        true
      );
    });

    it("should revert if txhash and data don't match", async () => {
      const { proposalModule, safe, linearVoting, proposalGuard, govToken } =
        await baseSetup();
      const Call = buildContractCall(
        proposalGuard,
        "enableGuard",
        [wallet_2.address],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );
      const Call2 = buildContractCall(
        proposalModule,
        "cancelProposals",
        [[0]],
        0
      );
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call2.to, Call2.value, Call2.data, Call2.operation]
      );
      await expect(
        proposalModule.submitProposal(
          [txHash],
          proposalGuard.address,
          extraData
        )
      ).to.be.revertedWith("supplied calldata does not match proposal hash");
    });

    it("should revert if tx is not a cancel proposal signature", async () => {
      const { proposalModule, safe, linearVoting, proposalGuard, govToken } =
        await baseSetup();
      const Call = buildContractCall(
        proposalModule,
        "enableStrategy",
        [wallet_2.address],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );

      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call.to, Call.value, Call.data, Call.operation]
      );
      await expect(
        proposalModule.submitProposal(
          [txHash],
          proposalGuard.address,
          extraData
        )
      ).to.be.revertedWith("proposal is not a cancel signature");
    });

    it("should revert if tx is not targeting Usul", async () => {
      const { proposalModule, safe, linearVoting, proposalGuard, govToken } =
        await baseSetup();
      const Call = buildContractCall(
        proposalGuard,
        "enableGuard",
        [wallet_2.address],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );

      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call.to, Call.value, Call.data, Call.operation]
      );
      await expect(
        proposalModule.submitProposal(
          [txHash],
          proposalGuard.address,
          extraData
        )
      ).to.be.revertedWith("only calls to allowedTarget");
    });

    it("can cancel a proposal before success", async () => {
      const { proposalModule, safe, linearVoting, proposalGuard, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      const Call = buildContractCall(
        proposalModule,
        "cancelProposals",
        [[0]],
        0
      );
      const cancelTxHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call.to, Call.value, Call.data, Call.operation]
      );
      await proposalModule.submitProposal(
        [cancelTxHash],
        proposalGuard.address,
        extraData
      );
      expect(await proposalGuard.checkedProposals(1, 0)).to.equal(true);
      await proposalGuard.finalizeStrategy(1);
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        proposalModule.address, // target
        0, // value
        Call.data, // data
        0 // call operation
      );
      expect(await proposalModule.state(0)).to.equal(1);
    });

    it("can cancel multiple proposals before success", async () => {
      const { proposalModule, safe, linearVoting, proposalGuard, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      const Call = buildContractCall(
        proposalModule,
        "cancelProposals",
        [[0, 1]],
        0
      );
      const cancelTxHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call.to, Call.value, Call.data, Call.operation]
      );
      await proposalModule.submitProposal(
        [cancelTxHash],
        proposalGuard.address,
        extraData
      );
      expect(await proposalGuard.checkedProposals(2, 0)).to.equal(true);
      await proposalGuard.finalizeStrategy(2);
      await proposalModule.executeProposalByIndex(
        2, // proposalId
        proposalModule.address, // target
        0, // value
        Call.data, // data
        0 // call operation
      );
      expect(await proposalModule.state(0)).to.equal(1);
      expect(await proposalModule.state(1)).to.equal(1);
    });

    it("can cancel a proposal while timelocked", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        proposalGuard,
        govToken,
        txHash,
      } = await baseSetup();
      await govToken.delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeStrategy(0);
      expect(await proposalModule.state(0)).to.equal(2);
      const Call = buildContractCall(
        proposalModule,
        "cancelProposals",
        [[0]],
        0
      );
      const cancelTxHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call.to, Call.value, Call.data, Call.operation]
      );
      await proposalModule.submitProposal(
        [cancelTxHash],
        proposalGuard.address,
        extraData
      );
      expect(await proposalGuard.checkedProposals(1, 0)).to.equal(true);
      await proposalGuard.finalizeStrategy(1);
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        proposalModule.address, // target
        0, // value
        Call.data, // data
        0 // call operation
      );
      expect(await proposalModule.state(0)).to.equal(1);
    });

    it("should revert if proposal already executed", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        proposalGuard,
        govToken,
        txHash,
        addCall,
      } = await baseSetup();
      await govToken.delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      expect(await proposalModule.state(0)).to.equal(2);
      const Call = buildContractCall(
        proposalModule,
        "cancelProposals",
        [[0]],
        0
      );
      const cancelTxHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation
      );
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "uint8"],
        [Call.to, Call.value, Call.data, Call.operation]
      );
      await proposalModule.submitProposal(
        [cancelTxHash],
        proposalGuard.address,
        extraData
      );
      expect(await proposalGuard.checkedProposals(1, 0)).to.equal(true);
      await proposalGuard.finalizeStrategy(1);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0 // call operation
      );
      await expect(
        proposalModule.executeProposalByIndex(
          1, // proposalId
          proposalModule.address, // target
          0, // value
          Call.data, // data
          0 // call operation
        )
      ).to.be.revertedWith("Module transaction failed");
    });
  });
});
