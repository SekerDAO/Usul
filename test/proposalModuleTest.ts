import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, network, waffle, deployments } from "hardhat";
import { _TypedDataEncoder } from "@ethersproject/hash";
import {
  executeContractCallWithSigners,
  buildContractCall,
  EIP712_TYPES,
} from "./shared/utils";
import { AddressZero } from "@ethersproject/constants";

describe("proposalModule:", () => {
  const [
    wallet_0,
    wallet_1,
    wallet_2,
    wallet_3,
    wallet_4,
    wallet_5,
    wallet_6,
    wallet_7,
    wallet_8,
    wallet_9,
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

    const GnosisSafeL2 = await hre.ethers.getContractFactory(
      "@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol:GnosisSafeL2"
    );
    const FactoryContract = await hre.ethers.getContractFactory(
      "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol:GnosisSafeProxyFactory"
    );
    const singleton = await GnosisSafeL2.deploy();
    //console.log('Gnosis Safe Deploy Cost ' + singleton.deployTransaction.gasLimit.toString())
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

    const proposalContract = await ethers.getContractFactory("ProposalModule");
    const proposalModule = await proposalContract.deploy();

    // TODO: Use common setup pattern
    await proposalModule.setAvatar(safe.address);
    await proposalModule.setTarget(safe.address);
    await proposalModule.transferOwnership(safe.address);

    const VotingContract = await ethers.getContractFactory("TestVotingStrategy");
    const votingStrategy = await VotingContract.deploy(proposalModule.address);
    const votingStrategy_2 = await VotingContract.deploy(proposalModule.address);

    const addCall = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_2.address, 1],
      await safe.nonce()
    );
    const addCall_1 = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_3.address, 1],
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
      [votingStrategy.address],
      [wallet_0]
    );

    return {
      proposalModule,
      votingStrategy,
      safe,
      factory,
      votingStrategy_2,
      addCall,
      addCall_1,
      txHash,
      txHash_1,
    };
  });

  // can use the safe and a cancel proposal role
  describe("setUp", async () => {
    it("proposal module is initialized", async () => {
      const { proposalModule, votingStrategy, safe } =
        await baseSetup();
      expect(await proposalModule.avatar()).to.equal(safe.address);
      expect(await proposalModule.totalProposalCount()).to.equal(0);
      expect(await proposalModule.owner()).to.equal(safe.address);
      expect(await proposalModule.timeLockPeriod()).to.equal(60);
    });

    it("can register Safe proposal engine module", async () => {
      const { proposalModule, safe } = await baseSetup();
      expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(true);
    });
  });

  describe("proposals", async () => {
    it("can execute add safe admin DAO proposal", async () => {
      const { proposalModule, votingStrategy, safe, addCall, txHash } =
        await baseSetup();
      const domain = {
        chainId: chainId,
        verifyingContract: proposalModule.address,
      };
      expect(
        await proposalModule.getTransactionHash(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.nonce
        )
      ).to.be.equals(_TypedDataEncoder.hash(domain, EIP712_TYPES, tx));
      await proposalModule.submitProposal([txHash], votingStrategy.address);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(1);
      expect(proposal.proposer).to.equal(wallet_0.address);
      expect(proposal.canceled).to.equal(false);
      expect(proposal.timeLockPeriod).to.equal(0);
      let isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(false);
      expect(await proposalModule.getTxHash(0, 0)).to.equal(txHash);
      expect(proposal.votingStrategy).to.equal(votingStrategy.address);
      expect(await proposalModule.state(0)).to.equal(0);

      await votingStrategy.finalizeVote(0);
      expect(await proposalModule.state(0)).to.equal(4);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send('evm_mine');
      expect(await proposalModule.state(0)).to.equal(6);
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(1);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await proposalModule.state(0)).to.equal(5);
      proposal = await proposalModule.proposals(0);
      isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
      expect(await proposalModule.state(0)).to.equal(5);
      expect(proposal.executionCounter).to.equal(0);
    });

    it("should revert if voting from the wrong strategy", async () => {
      const { proposalModule, votingStrategy, votingStrategy_2, safe, txHash } =
        await baseSetup();
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "enableStrategy",
        [votingStrategy_2.address],
        [wallet_0]
      );
      await proposalModule.submitProposal([txHash], votingStrategy_2.address);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.votingStrategy).to.equal(votingStrategy_2.address);
      await expect(votingStrategy.finalizeVote(0)).to.be.revertedWith("cannot start timelock, incorrect strategy");
    });

    it("should revert if starting time lock with no proposal", async () => {
      const { proposalModule, votingStrategy, safe } =
        await baseSetup();
      await expect(votingStrategy.finalizeVote(0)).to.be.revertedWith("cannot start timelock, proposal is not active");
    });

    it("can execute multiple add safe admin DAO proposal", async () => {
      const { proposalModule, votingStrategy, safe, addCall, addCall_1, txHash, txHash_1 } =
        await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1],
        votingStrategy.address
      );
      await votingStrategy.finalizeVote(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send('evm_mine');
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(2);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      proposal = await proposalModule.proposals(0);
      let isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(1);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall_1.data, // data
        0, // call operation
        1 // txHash index
      );
      proposal = await proposalModule.proposals(0);
      isExecuted = await proposalModule.isTxExecuted(0, 1);
      expect(isExecuted).to.equal(true);
      owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_3.address);
      expect(owners[1]).to.equal(wallet_2.address);
      expect(owners[2]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(0);
    });

    // it("can have only one DAO proposal at a time", async () => {
    //   const { proposalModule, votingStrategy, safe, addCall, txHash } =
    //     await baseSetup();
    //   await proposalModule.submitProposal([txHash], votingStrategy.address);
    //   await expect(
    //     proposalModule.submitProposal([txHash], votingStrategy.address)
    //   ).to.be.revertedWith("TW011");
    // });

    it("can failsafe remove module before proposal executes", async () => {
      const { proposalModule, votingStrategy, safe, addCall, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], votingStrategy.address);
      await votingStrategy.finalizeVote(0);
      await executeContractCallWithSigners(
        safe,
        safe,
        "disableModule",
        ["0x0000000000000000000000000000000000000001", proposalModule.address],
        [wallet_0]
      );
      expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(
        false
      );
      let modules = await safe.getModulesPaginated(
        "0x0000000000000000000000000000000000000001",
        1
      );
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send('evm_mine');
      await expect(
        proposalModule.executeProposalByIndex(
          0, // proposalId
          safe.address, // target
          0, // value
          addCall.data, // data
          0, // call operation
          0 // txHash index
        )
      ).to.be.revertedWith("GS104");
    });

    it("can cancel a proposal by creator after success", async () => {
      const { proposalModule, votingStrategy, safe, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], votingStrategy.address);
      await votingStrategy.finalizeVote(0);
      await proposalModule.cancelProposal(0);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
      expect(await proposalModule.state(0)).to.equal(1);
    });

    it("can cancel a proposal by creator before success", async () => {
      const { proposalModule, votingStrategy, safe, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], votingStrategy.address);
      await proposalModule.cancelProposal(0);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
      expect(await proposalModule.state(0)).to.equal(1);
    });


    it("can cancel a proposal by Safe", async () => {
      const { proposalModule, votingStrategy, safe, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], votingStrategy.address);
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposal",
        [0],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
      expect(await proposalModule.state(0)).to.equal(1);
    });

    it("cannot start timelock after cancel proposal", async () => {
      const { proposalModule, votingStrategy, safe, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], votingStrategy.address);
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposal",
        [0],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      await expect(votingStrategy.finalizeVote(0)).to.be.revertedWith("cannot start timelock, proposal is not active");
    });

    it("can execute batch remove owners", async () => {
      const { proposalModule, votingStrategy, safe } =
        await baseSetup();
      const wallets = [wallet_0, wallet_1, wallet_2];
      for (let i = 1; i < 3; i++) {
        await executeContractCallWithSigners(
          safe,
          safe,
          "addOwnerWithThreshold",
          [wallets[i].address, 1],
          [wallet_0]
        );
      }
      const removeCall_0 = buildContractCall(
        safe,
        "removeOwner",
        [wallet_2.address, wallet_1.address, 1],
        await safe.nonce()
      );
      const removeCall_1 = buildContractCall(
        safe,
        "removeOwner",
        [wallet_2.address, wallet_0.address, 1],
        await safe.nonce()
      );
      const burnCall = buildContractCall(
        safe,
        "swapOwner",
        [
          "0x0000000000000000000000000000000000000001",
          wallet_2.address,
          "0x0000000000000000000000000000000000000002",
        ],
        await safe.nonce()
      );
      const txHash_0 = await proposalModule.getTransactionHash(
        removeCall_0.to,
        removeCall_0.value,
        removeCall_0.data,
        removeCall_0.operation,
        0
      );
      const txHash_1 = await proposalModule.getTransactionHash(
        removeCall_1.to,
        removeCall_1.value,
        removeCall_1.data,
        removeCall_1.operation,
        0
      );
      const txHash_2 = await proposalModule.getTransactionHash(
        burnCall.to,
        burnCall.value,
        burnCall.data,
        burnCall.operation,
        0
      );
      await proposalModule.submitProposal(
        [txHash_0, txHash_1, txHash_2],
        votingStrategy.address
      );
      await votingStrategy.finalizeVote(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send('evm_mine');
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address, safe.address, safe.address],
        [0, 0, 0],
        [removeCall_0.data, removeCall_1.data, burnCall.data],
        [0, 0, 0], // call options
        0, // txHash start index
        3 // tx length
      );
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal("0x0000000000000000000000000000000000000002");
      expect(owners.length).to.equal(1);
    });
  });
});
