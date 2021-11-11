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
  const [wallet_0, wallet_1, wallet_2, wallet_3, wallet_4] =
    waffle.provider.getWallets();
  const tx = {
    to: wallet_1.address,
    value: 0,
    data: "0x",
    operation: 0,
    nonce: 0,
  };
  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();

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
    const template2 = await factory.callStatic.createProxy(
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
    const safe2 = GnosisSafeL2.attach(template2);
    safe2.setup(
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

    const StrategyContract = await ethers.getContractFactory("TestStrategy");
    const strategy = await StrategyContract.deploy(proposalModule.address, 60);
    const strategy_2 = await StrategyContract.deploy(
      proposalModule.address,
      60
    );

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
    const addCall_2 = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_4.address, 1],
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
    const txHash_2 = await proposalModule.getTransactionHash(
      addCall_2.to,
      addCall_2.value,
      addCall_2.data,
      addCall_2.operation
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
      [strategy.address],
      [wallet_0]
    );

    return {
      proposalModule,
      strategy,
      strategy_2,
      safe,
      safe2,
      factory,
      addCall,
      addCall_1,
      addCall_2,
      txHash,
      txHash_1,
      txHash_2,
    };
  });

  // can use the safe and a cancel proposal role
  describe("setUp", async () => {
    it("proposal module is initialized", async () => {
      const { proposalModule, strategy, safe } = await baseSetup();
      expect(await proposalModule.avatar()).to.equal(safe.address);
      expect(await proposalModule.totalProposalCount()).to.equal(0);
      expect(await proposalModule.owner()).to.equal(safe.address);
    });

    it("can register Usul proposal engine module", async () => {
      const { proposalModule, safe } = await baseSetup();
      expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(true);
    });
  });

  describe("getters", async () => {
    it("isTxExecuted should revert", async () => {
      const { proposalModule } = await baseSetup();
      await expect(proposalModule.isTxExecuted(0, 0)).to.be.revertedWith(
        "no executions in this proposal"
      );
    });

    it("should hash transactions correctly", async () => {
      const { proposalModule, safe } = await baseSetup();
      const domain = {
        chainId: ethers.BigNumber.from(network.config.chainId),
        verifyingContract: proposalModule.address,
      };
      expect(
        await proposalModule.getTransactionHash(
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.equals(_TypedDataEncoder.hash(domain, EIP712_TYPES, tx));
    });
  });

  describe("strategies", async () => {
    it("safe can enable a voting strategy", async () => {
      const { proposalModule, safe } = await baseSetup();
      expect(
        await executeContractCallWithSigners(
          safe,
          proposalModule,
          "enableStrategy",
          [wallet_0.address],
          [wallet_0]
        )
      )
        .to.emit(proposalModule, "EnabledStrategy")
        .withArgs(wallet_0.address);
    });

    it("safe can disable a voting strategy", async () => {
      const { proposalModule, safe, strategy } = await baseSetup();
      expect(
        await executeContractCallWithSigners(
          safe,
          proposalModule,
          "disableStrategy",
          ["0x0000000000000000000000000000000000000001", strategy.address],
          [wallet_0]
        )
      )
        .to.emit(proposalModule, "DisabledStrategy")
        .withArgs(strategy.address);
    });

    it("can list voting strategies", async () => {
      const { proposalModule, safe, strategy } = await baseSetup();
      expect(await proposalModule.isStrategyEnabled(strategy.address)).to.equal(
        true
      );
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "enableStrategy",
        [wallet_0.address],
        [wallet_0]
      );
      let strats = await proposalModule.getStrategiesPaginated(
        "0x0000000000000000000000000000000000000001",
        1
      );
      expect(strats[0][0]).to.equal(wallet_0.address);
      expect(strats[1]).to.equal(strategy.address);
    });

    it("should revert if strategy is not enabled", async () => {
      const { proposalModule, safe, txHash } = await baseSetup();
      await expect(
        proposalModule.submitProposal([txHash], wallet_0.address, "0x")
      ).to.be.revertedWith("voting strategy is not enabled for proposal");
    });

    it("should revert if receiveStrategy is called from non-registered strat", async () => {
      const { proposalModule, safe, txHash, strategy } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await expect(proposalModule.receiveStrategy(0, 60)).to.be.revertedWith(
        "Strategy not authorized"
      );
    });

    it("should revert if voting from the wrong strategy", async () => {
      const { proposalModule, strategy, strategy_2, safe, txHash } =
        await baseSetup();
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "enableStrategy",
        [strategy_2.address],
        [wallet_0]
      );
      await proposalModule.submitProposal([txHash], strategy_2.address, "0x");
      let proposal = await proposalModule.proposals(0);
      expect(proposal.strategy).to.equal(strategy_2.address);
      await expect(strategy.finalizeStrategy(0)).to.be.revertedWith(
        "cannot receive strategy, incorrect strategy for proposal"
      );
    });
  });

  describe("timelock", async () => {
    it("should revert if starting timelock with no proposal", async () => {
      const { proposalModule, strategy, safe } = await baseSetup();
      await expect(strategy.finalizeStrategy(0)).to.be.revertedWith(
        "cannot receive strategy, proposal is not active"
      );
    });

    it("should revert if timeLockPeriod has not passed", async () => {
      const { safe, proposalModule, strategy, addCall, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
      await expect(
        proposalModule.executeProposalByIndex(
          0, // proposalId
          safe.address, // target
          0, // value
          addCall.data, // data
          0 // call operation
        )
      ).to.be.revertedWith("proposal is not in execution state");
    });
  });

  describe("proposal state", async () => {
    it("proposal state should be Unitialized", async () => {
      const { proposalModule, safe, txHash, strategy } = await baseSetup();
      expect(await proposalModule.state(0)).to.equal(5);
    });

    it("proposal state should be Active", async () => {
      const { proposalModule, safe, txHash, strategy } = await baseSetup();
      expect(
        await proposalModule.submitProposal([txHash], strategy.address, "0x")
      )
        .to.emit(proposalModule, "ProposalCreated")
        .withArgs(strategy.address, 0, wallet_0.address);
      expect(await proposalModule.state(0)).to.equal(0);
    });

    it("proposal cancel should revert with only owner", async () => {
      const { proposalModule, safe, txHash, strategy } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await expect(proposalModule.cancelProposals([0])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("proposal state should be TimeLocked", async () => {
      const { proposalModule, safe, txHash, strategy } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
      expect(await proposalModule.state(0)).to.equal(2);
    });

    it("proposal state should be Executing", async () => {
      const { proposalModule, safe, txHash, strategy } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      expect(await proposalModule.state(0)).to.equal(4);
    });

    it("proposal state should be Executed", async () => {
      const { proposalModule, safe, addCall, txHash, strategy } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
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
    });

    it("isTxExecuted should be false", async () => {
      const { proposalModule, safe, addCall, txHash, strategy } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      expect(await proposalModule.isTxExecuted(0, 0)).to.equal(false);
    });

    it("can cancel a proposal after success", async () => {
      const { proposalModule, strategy, safe, txHash } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
      expect(
        await executeContractCallWithSigners(
          safe,
          proposalModule,
          "cancelProposals",
          [[0]],
          [wallet_0]
        )
      )
        .to.emit(proposalModule, "ProposalCanceled")
        .withArgs(0);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
      expect(await proposalModule.state(0)).to.equal(1);
    });

    it("can cancel a proposal before success", async () => {
      const { proposalModule, strategy, safe, txHash } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposals",
        [[0]],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
      expect(await proposalModule.state(0)).to.equal(1);
    });

    it("can cancel multiple proposals after success", async () => {
      const { proposalModule, strategy, safe, txHash } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposals",
        [[0, 1]],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      expect(proposal.canceled).to.equal(true);
      expect(await proposalModule.state(0)).to.equal(1);
    });
  });

  describe("execution", async () => {
    it("can execute add safe admin DAO proposal", async () => {
      const { proposalModule, strategy, safe, addCall, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(0);
      expect(proposal.canceled).to.equal(false);
      expect(proposal.timeLockPeriod).to.equal(0);
      let isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(false);
      expect(await proposalModule.getTxHash(0, 0)).to.equal(txHash);
      expect(proposal.strategy).to.equal(strategy.address);
      expect(await proposalModule.state(0)).to.equal(0);

      await strategy.finalizeStrategy(0);
      expect(await proposalModule.state(0)).to.equal(2);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      expect(await proposalModule.state(0)).to.equal(4);
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(0);
      expect(
        await proposalModule.executeProposalByIndex(
          0, // proposalId
          safe.address, // target
          0, // value
          addCall.data, // data
          0 // call operation
        )
      )
        .to.emit(proposalModule, "TransactionExecuted")
        .withArgs(0, txHash);
      expect(await proposalModule.state(0)).to.equal(3);
      proposal = await proposalModule.proposals(0);
      isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(1);
    });

    it("can execute multiple add safe admin DAO proposal", async () => {
      const {
        proposalModule,
        strategy,
        safe,
        addCall,
        addCall_1,
        txHash,
        txHash_1,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(0);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0 // call operation
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
        0 // call operation
      );
      proposal = await proposalModule.proposals(0);
      isExecuted = await proposalModule.isTxExecuted(0, 1);
      expect(isExecuted).to.equal(true);
      owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_3.address);
      expect(owners[1]).to.equal(wallet_2.address);
      expect(owners[2]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(2);
    });

    it("it should revert with parameter length missmatch", async () => {
      const {
        safe,
        proposalModule,
        strategy,
        addCall,
        addCall_1,
        txHash,
        txHash_1,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await expect(
        proposalModule.executeProposalBatch(
          0, // proposalId
          [safe.address, safe.address],
          [0, 0],
          [addCall.data],
          [0, 0] // call options
        )
      ).to.be.revertedWith("execution parameters missmatch");
    });

    it("it should revert with transaction already executed", async () => {
      const {
        safe,
        proposalModule,
        strategy,
        addCall,
        addCall_1,
        txHash,
        txHash_1,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address],
        [0],
        [addCall.data],
        [0] // call options
      );
      await expect(
        proposalModule.executeProposalBatch(
          0, // proposalId
          [safe.address],
          [0],
          [addCall.data],
          [0] // call options
        )
      ).to.be.revertedWith("transaction hash does not match indexed hash");
    });

    it("it should revert no transactions are supplied to batch", async () => {
      const {
        safe,
        proposalModule,
        strategy,
        addCall,
        addCall_1,
        txHash,
        txHash_1,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await expect(
        proposalModule.executeProposalBatch(
          0, // proposalId
          [],
          [],
          [],
          [] // call options
        )
      ).to.be.revertedWith("no transactions to execute supplied to batch");
    });

    it("it should revert starting from an index out of ascending order", async () => {
      const {
        safe,
        proposalModule,
        strategy,
        addCall,
        addCall_1,
        txHash,
        txHash_1,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await expect(
        proposalModule.executeProposalBatch(
          0, // proposalId
          [safe.address],
          [0],
          [addCall_1.data],
          [0] // call options
        )
      ).to.be.revertedWith("transaction hash does not match indexed hash");
    });

    it("it should revert transaction hash does not match indexed hash", async () => {
      const { safe, proposalModule, strategy, addCall, txHash_1 } =
        await baseSetup();
      await proposalModule.submitProposal([txHash_1], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await expect(
        proposalModule.executeProposalByIndex(
          0, // proposalId
          safe.address, // target
          0, // value
          addCall.data, // data
          0 // call operation
        )
      ).to.be.revertedWith("transaction hash does not match indexed hash");
    });

    it("it can execute batch one at a time", async () => {
      const {
        proposalModule,
        strategy,
        safe,
        addCall,
        addCall_1,
        addCall_2,
        txHash,
        txHash_1,
        txHash_2,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1, txHash_2],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(0);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address],
        [0],
        [addCall.data],
        [0] // call options
      );
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(1);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address],
        [0],
        [addCall_1.data],
        [0] // call options
      );
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(2);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address],
        [0],
        [addCall_2.data],
        [0] // call options
      );
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(3);
    });

    it("it can execute batch staggared", async () => {
      const {
        proposalModule,
        strategy,
        safe,
        addCall,
        addCall_1,
        addCall_2,
        txHash,
        txHash_1,
        txHash_2,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1, txHash_2],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(0);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address],
        [0],
        [addCall.data],
        [0] // call options
      );
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(1);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address, safe.address],
        [0, 0],
        [addCall_1.data, addCall_2.data],
        [0, 0] // call options
      );
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_4.address);
      expect(owners[1]).to.equal(wallet_3.address);
      expect(owners[2]).to.equal(wallet_2.address);
      expect(owners[3]).to.equal(wallet_0.address);
      proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(3);
    });

    it("can execute multiple add safe admin DAO proposal batch", async () => {
      const {
        proposalModule,
        strategy,
        safe,
        addCall,
        addCall_1,
        addCall_2,
        txHash,
        txHash_1,
        txHash_2,
      } = await baseSetup();
      await proposalModule.submitProposal(
        [txHash, txHash_1, txHash_2],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      let proposal = await proposalModule.proposals(0);
      expect(proposal.executionCounter).to.equal(0);
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address, safe.address, safe.address],
        [0, 0, 0],
        [addCall.data, addCall_1.data, addCall_2.data],
        [0, 0, 0] // call options
      );
      proposal = await proposalModule.proposals(0);
      let isExecuted = await proposalModule.isTxExecuted(0, 0);
      expect(isExecuted).to.equal(true);
      isExecuted = await proposalModule.isTxExecuted(0, 1);
      expect(isExecuted).to.equal(true);
      isExecuted = await proposalModule.isTxExecuted(0, 2);
      expect(isExecuted).to.equal(true);
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_4.address);
      expect(owners[1]).to.equal(wallet_3.address);
      expect(owners[2]).to.equal(wallet_2.address);
      expect(owners[3]).to.equal(wallet_0.address);
      expect(proposal.executionCounter).to.equal(3);
    });

    it("cannot start finalizeStrategy after cancel proposal", async () => {
      const { proposalModule, strategy, safe, txHash } = await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "cancelProposals",
        [[0]],
        [wallet_0]
      );
      let proposal = await proposalModule.proposals(0);
      await expect(strategy.finalizeStrategy(0)).to.be.revertedWith(
        "cannot receive strategy, proposal is not active"
      );
    });

    it("can failsafe remove module before proposal executes", async () => {
      const { proposalModule, strategy, safe, addCall, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], strategy.address, "0x");
      await strategy.finalizeStrategy(0);
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
      await network.provider.send("evm_mine");
      await expect(
        proposalModule.executeProposalByIndex(
          0, // proposalId
          safe.address, // target
          0, // value
          addCall.data, // data
          0 // call operation
        )
      ).to.be.revertedWith("GS104");
    });

    it("can execute batch remove owners", async () => {
      const { proposalModule, strategy, safe } = await baseSetup();
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
        removeCall_0.operation
      );
      const txHash_1 = await proposalModule.getTransactionHash(
        removeCall_1.to,
        removeCall_1.value,
        removeCall_1.data,
        removeCall_1.operation
      );
      const txHash_2 = await proposalModule.getTransactionHash(
        burnCall.to,
        burnCall.value,
        burnCall.data,
        burnCall.operation
      );
      await proposalModule.submitProposal(
        [txHash_0, txHash_1, txHash_2],
        strategy.address,
        "0x"
      );
      await strategy.finalizeStrategy(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalBatch(
        0, // proposalId
        [safe.address, safe.address, safe.address],
        [0, 0, 0],
        [removeCall_0.data, removeCall_1.data, burnCall.data],
        [0, 0, 0] // call options
      );
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal("0x0000000000000000000000000000000000000002");
      expect(owners.length).to.equal(1);
    });

    it("can use another safe as voting strat", async () => {
      const { proposalModule, strategy, safe, safe2, txHash, addCall } =
        await baseSetup();
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "enableStrategy",
        [safe2.address],
        [wallet_0]
      );
      await proposalModule.submitProposal([txHash], safe2.address, "0x");
      await executeContractCallWithSigners(
        safe2,
        proposalModule,
        "receiveStrategy",
        [0, 60],
        [wallet_0]
      );
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0 // call operation
      );
      let owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
    });
  });
});
