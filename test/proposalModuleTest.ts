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

  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const [wallet_0, wallet_1, wallet_2, wallet_3] = waffle.provider.getWallets();
    const govTokenContract = await ethers.getContractFactory("GovernanceToken")
    const govToken = await govTokenContract.deploy("GovToken", "GT", ethers.BigNumber.from('100000000000000000000000'))
    await govToken.transfer(wallet_1.address, ethers.BigNumber.from('1000000000000000000'))
    await govToken.transfer(wallet_2.address, ethers.BigNumber.from('1000000000000000000'))
    await govToken.transfer(wallet_3.address, ethers.BigNumber.from('1000000000000000000'))
    //console.log('Gov Token Deploy Cost ' + govToken.deployTransaction.gasLimit.toString())

    const GnosisSafeL2 = await hre.ethers.getContractFactory("@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol:GnosisSafeL2")
    const FactoryContract = await hre.ethers.getContractFactory("@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol:GnosisSafeProxyFactory")
    const singleton = await GnosisSafeL2.deploy()
    //console.log('Gnosis Safe Deploy Cost ' + singleton.deployTransaction.gasLimit.toString())
    const factory = await FactoryContract.deploy()
    const template = await factory.callStatic.createProxy(singleton.address, "0x")
    await factory.createProxy(singleton.address, "0x").then((tx: any) => tx.wait())
    const safe = GnosisSafeL2.attach(template);
    safe.setup([wallet_0.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero)

    const proposalContract = await ethers.getContractFactory("ProposalModule")
    const proposalModule = await proposalContract.deploy(
      ethers.BigNumber.from(1), // number of days proposals are active
      ethers.BigNumber.from('1000000000000000000'), // number of votes wieghted to pass
    )

    // TODO: Use common setup pattern
    await proposalModule.setAvatar(safe.address);
    await proposalModule.setTarget(safe.address);
    await proposalModule.transferOwnership(safe.address);

    const linearContract = await ethers.getContractFactory("LinearVoting")
    const linearVoting = await linearContract.deploy(
      govToken.address,
      proposalModule.address,
      180,
      safe.address
    )

    await govToken.transfer(safe.address, ethers.BigNumber.from('50000000000000000000000'))

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
      "enableModule",
      [linearVoting.address],
      [wallet_0]
    );

    return {
    proposalModule,
    linearVoting,
    govToken,
    safe,
    factory,
    };
  });

  // can use the safe and a cancel proposal role
  describe("setUp", async () => {
    it("proposal module is initialized", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      expect(await proposalModule.avatar()).to.equal(safe.address);
      expect(await govToken.balanceOf(safe.address)).to.equal(
        "50000000000000000000000"
      );
      expect(await proposalModule.totalProposalCount()).to.equal(0);
      expect(await proposalModule.owner()).to.equal(safe.address)
      expect(await proposalModule.proposalTime()).to.equal(60);
      expect(await proposalModule.gracePeriod()).to.equal(60);
      expect(await proposalModule.threshold()).to.equal("1000000000000000000");
      expect(await linearVoting.governanceToken()).to.equal(govToken.address);
    });

    it("can register Safe proposal engine module", async () => {
      const { proposalModule, safe } = await baseSetup();
      expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(true);
    });
  });

  describe("proposals", async () => {
    it("can execute add safe admin DAO proposal", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      let addCall = buildContractCall(
        safe,
        "addOwnerWithThreshold",
        [wallet_2.address, 1],
        await safe.nonce()
      );
      const domain = {
        chainId: chainId,
        verifyingContract: proposalModule.address,
      };
      const tx = {
        to: wallet_1.address,
        value: 0,
        data: "0x",
        operation: 0,
        nonce: 0,
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
      const txHash = await proposalModule.getTransactionHash(
        addCall.to,
        addCall.value,
        addCall.data,
        addCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, 1);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(1);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      expect(proposal.noVotes).to.equal(0);
      expect(proposal.proposer).to.equal(wallet_0.address);
      expect(proposal.canceled).to.equal(false);
      //expect(proposal.txHashes[0]).to.equal(txHash);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      proposal = await proposalModule.proposals(0);
      expect(proposal.queued).to.equal(true);
      expect(proposal.executionCounter).to.equal(1);
      await network.provider.send("evm_increaseTime", [60]);

      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      proposal = await proposalModule.proposals(0);
      const isExecuted = await proposalModule.isExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
      expect(proposal.queued).to.equal(true);
      expect(proposal.executionCounter).to.equal(0);
    });

    it("should revert if voting from the wrong strategy", async () => {

    })

    it("can execute multiple add safe admin DAO proposal", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      let addCall = buildContractCall(
        safe,
        "addOwnerWithThreshold",
        [wallet_2.address, 1],
        await safe.nonce()
      );
      let addCall_1 = buildContractCall(
        safe,
        "addOwnerWithThreshold",
        [wallet_3.address, 1],
        await safe.nonce()
      );
      // ------------------------
      const domain = {
        chainId: chainId,
        verifyingContract: proposalModule.address,
      };
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
      await proposalModule.submitProposal([txHash, txHash_1], linearVoting.address);
      await linearVoting.vote(0, 1);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(2);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      proposal = await proposalModule.proposals(0);
      expect(proposal.queued).to.equal(true);
      expect(proposal.executionCounter).to.equal(2);
      await network.provider.send("evm_increaseTime", [60]);

      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      proposal = await proposalModule.proposals(0);
      //expect(proposal.executed[0]).to.equal(true);
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
      expect(proposal.queued).to.equal(true);
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
      let isExecuted = await proposalModule.isExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      isExecuted = await proposalModule.isExecuted(0, 1);
      expect(isExecuted).to.equal(true);
      owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_3.address);
      expect(owners[1]).to.equal(wallet_2.address);
      expect(owners[2]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(0);
    });

    it("cannot enter queue if not past threshold", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      let addCall = buildContractCall(
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

      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("500000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await expect(proposalModule.startQueue(0)).to.be.revertedWith("TW004");
    });

    it("cannot enter queue if not past deadline", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      let addCall = buildContractCall(
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
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      await expect(proposalModule.startQueue(0)).to.be.revertedWith("TW014");
    });

    it("can have only one DAO proposal at a time", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("1000000000000000000")
      );
      let addCall = buildContractCall(
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
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await expect(proposalModule.submitProposal([txHash], linearVoting.address)).to.be.revertedWith("TW011");
    });

    it("can complete a funding proposals", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_0.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_2.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      expect(proposal.noVotes).to.equal(0);
      expect(proposal.proposer).to.equal(wallet_0.address);
      expect(proposal.canceled).to.equal(false);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      proposal = await proposalModule.proposals(0);
      expect(proposal.queued).to.equal(true);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await govToken.balanceOf(wallet_2.address)).to.equal(
        ethers.BigNumber.from("1000000000000001000")
      );
    });

    it("can failsafe remove module before funding proposals", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_0.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_2.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      await executeContractCallWithSigners(
        safe,
        safe,
        "disableModule",
        ["0x0000000000000000000000000000000000000001", proposalModule.address],
        [wallet_0]
      );
      expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(false);
      let modules = await safe.getModulesPaginated(
        "0x0000000000000000000000000000000000000001",
        1
      );
      await network.provider.send("evm_increaseTime", [60]);
      await expect(proposalModule.executeProposalByIndex(
        0, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      )).to.be.revertedWith("GS104");
    });

    it("can cancel a proposal by creator", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_0.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_2.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      await proposalModule.cancelProposal(0);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
    });

    it("can cancel a proposal by Safe admin", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_0.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_2.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposal",
        [0],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
    });

    it("cannot queue dao after cancel a proposal", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_0.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_2.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposal",
        [0],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      await network.provider.send("evm_increaseTime", [60]);
      await expect(proposalModule.startQueue(0)).to.be.revertedWith("TW002");
    });

    it("can execute batch", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
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
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_1.address,
          ethers.BigNumber.from("500000000000000000")
        );

      let owners = await safe.getOwners();
      //console.log(owners);
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
      await proposalModule.submitProposal([txHash_0, txHash_1, txHash_2], linearVoting.address);
      await linearVoting.vote(0, true);
      await linearVoting.connect(wallet_1).vote(0, true);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address, safe.address, safe.address],
        [0, 0, 0],
        [removeCall_0.data, removeCall_1.data, burnCall.data],
        [0,0,0], // call options
        0, // txHash start index
        3 // tx length
      );
      owners = await safe.getOwners();
      //console.log(owners);
    });

    it("can burn the safe admins", async () => {
      const { proposalModule, linearVoting, safe, govToken } = await baseSetup();
      await executeContractCallWithSigners(
        safe,
        safe,
        "addOwnerWithThreshold",
        [wallet_1.address, 1],
        [wallet_0]
      );
      await executeContractCallWithSigners(
        safe,
        safe,
        "addOwnerWithThreshold",
        [wallet_2.address, 1],
        [wallet_0]
      );
      await govToken.approve(
        linearVoting.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.delegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_1.address,
          ethers.BigNumber.from("500000000000000000")
        );
      // console.log("address 0 " + wallet_0.address);
      // console.log("address 1 " + wallet_1.address);
      // console.log("address 2 " + wallet_2.address);
      let owners = await safe.getOwners();
      //console.log(owners);
      await executeContractCallWithSigners(
        safe,
        safe,
        "removeOwner",
        [wallet_2.address, wallet_1.address, 1],
        [wallet_0]
      );
      owners = await safe.getOwners();
      //console.log(owners);
      await executeContractCallWithSigners(
        safe,
        safe,
        "removeOwner",
        [wallet_2.address, wallet_0.address, 1],
        [wallet_0]
      );
      owners = await safe.getOwners();
      //console.log(owners);
      let burnCall = buildContractCall(
        safe,
        "swapOwner",
        [
          "0x0000000000000000000000000000000000000001",
          wallet_2.address,
          "0x0000000000000000000000000000000000000002",
        ],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        burnCall.to,
        burnCall.value,
        burnCall.data,
        burnCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address);
      await linearVoting.vote(0, true);
      await linearVoting.connect(wallet_1).vote(0, true);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        burnCall.data, // data
        0, // call operation
        0 // txHash index
      );
      owners = await safe.getOwners();
      //console.log(owners);
    });
  });
});
