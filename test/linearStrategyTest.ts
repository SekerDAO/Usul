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

describe("linearVotingStrategies:", () => {
  const [
    wallet_0,
    wallet_1,
    wallet_2,
    wallet_3,
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
    await govToken.transfer(
      wallet_1.address,
      ethers.BigNumber.from("1000000000000000000")
    );
    await govToken.transfer(
      wallet_2.address,
      ethers.BigNumber.from("1000000000000000000")
    );
    await govToken.transfer(
      wallet_3.address,
      ethers.BigNumber.from("1000000000000000000")
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

    const proposalContract = await ethers.getContractFactory("Seele");
    const proposalModule = await proposalContract.deploy(
      safe.address,
      safe.address,
      safe.address,
      60
    );

    const linearContract = await ethers.getContractFactory("OZLinearVoting");
    const linearVoting = await linearContract.deploy(
      ethers.BigNumber.from(60), // number of days proposals are active
      govToken.address,
      proposalModule.address,
      ethers.BigNumber.from("2000000000000000000"), // number of votes wieghted to pass
      safe.address,
      "Test"
    );

    await govToken.transfer(
      safe.address,
      ethers.BigNumber.from("50000000000000000000000")
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
      [linearVoting.address],
      [wallet_0]
    );

    return {
      proposalModule,
      linearVoting,
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
    it("can register linear voting module", async () => {
      const { proposalModule, linearVoting } = await baseSetup();
      expect(
        await proposalModule.isStrategyEnabled(linearVoting.address)
      ).to.equal(true);
    });

    it("only owner can register linear voting module", async () => {
      const { proposalModule, linearVoting } = await baseSetup();
      await expect(
        proposalModule.enableStrategy(linearVoting.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("openzepplin linear voting module", async () => {
    it("can delegate votes to self", async () => {
      const { proposalModule, linearVoting, govToken } = await baseSetup();
      const bal = await govToken.balanceOf(wallet_0.address);
      await govToken.delegate(wallet_0.address);
      const delegatation = await govToken.getVotes(wallet_0.address);
      expect(delegatation).to.equal("49997000000000000000000");
    });

    it("can delegate votes to others", async () => {
      const { proposalModule, linearVoting, govToken } = await baseSetup();
      await govToken.connect(wallet_1).approve(linearVoting.address, 1000);
      await govToken.connect(wallet_1).delegate(wallet_0.address);
      let delegatation = await govToken.getVotes(wallet_0.address);
      expect(delegatation).to.equal("1000000000000000000");
      await govToken.connect(wallet_2).approve(linearVoting.address, 1000);
      await govToken.connect(wallet_2).delegate(wallet_0.address);
      delegatation = await govToken.getVotes(wallet_0.address);
      expect(delegatation).to.equal("2000000000000000000");
    });

    it("can vote past the threshold with delegation", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      const proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(ethers.BigNumber.from(0));
      await linearVoting.vote(0, 1);
      const proposalAfterVoting = await linearVoting.proposals(0);
      expect(proposalAfterVoting.yesVotes).to.equal(
        ethers.BigNumber.from("49997000000000000000000")
      );
      let voted = await linearVoting.hasVoted(0, wallet_0.address);
      await expect(voted).to.equal(true);
    });

    it("can vote only once per proposal", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      const proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(ethers.BigNumber.from(0));
      await linearVoting.vote(0, 1);
      await expect(linearVoting.vote(0, 1)).to.be.revertedWith(
        "voter has already voted"
      );
    });

    it("cannot finalize if not past threshold", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await expect(linearVoting.finalizeVote(0)).to.be.revertedWith(
        "a quorum has not been reached for the proposal"
      );
    });

    it("cannot enter queue if not past deadline", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_0.address);
      await govToken.connect(wallet_1).delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      await expect(linearVoting.finalizeVote(0)).to.be.revertedWith(
        "voting period has not passed yet"
      );
    });

    // // hardhat currently will not revert when manual
    // // https://github.com/nomiclabs/hardhat/issues/1468
    // it.skip("cannot vote if delegatation is in the same block", async () => {
    //   const { proposalModule, linearVoting, safe, govToken } =
    //     await baseSetup();
    //   await govToken.approve(
    //     linearVoting.address,
    //     ethers.BigNumber.from("500000000000000000")
    //   );
    //   await linearVoting.delegateVotes(
    //     wallet_0.address,
    //     ethers.BigNumber.from("500000000000000000")
    //   );
    //   let addCall = buildContractCall(
    //     safe,
    //     "addOwnerWithThreshold",
    //     [wallet_2.address, 1],
    //     await safe.nonce()
    //   );
    //   const txHash = await proposalModule.getTransactionHash(
    //     addCall.to,
    //     addCall.value,
    //     addCall.data,
    //     addCall.operation,
    //     0
    //   );
    //   await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
    //   await govToken
    //     .connect(wallet_1)
    //     .approve(
    //       linearVoting.address,
    //       ethers.BigNumber.from("500000000000000000")
    //     );
    //   let block = await network.provider.send("eth_blockNumber");
    //   //await network.provider.send("evm_setAutomine", [false]);
    //   await linearVoting
    //     .connect(wallet_1)
    //     .delegateVotes(
    //       wallet_2.address,
    //       ethers.BigNumber.from("500000000000000000")
    //     );
    //   await network.provider.send("evm_mine");
    //   await proposalModule.connect(wallet_2).vote(0, 1);
    //   //await expect(proposalModule.connect(wallet_1).vote(0, true)).to.be.revertedWith("TW021")
    //   await network.provider.send("evm_mine");
    //   let votes = await linearVoting.getDelegatorVotes(
    //     wallet_2.address,
    //     wallet_1.address
    //   );
    //   expect(votes).to.equal(ethers.BigNumber.from("500000000000000000"));
    //   //await network.provider.send("evm_setAutomine", [true]);
    // });

    it("can vote past the threshold with independent delegatation", async () => {
      const { proposalModule, safe, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      let block = await network.provider.send("eth_blockNumber");
      const weight = await linearVoting.calculateWeight(wallet_2.address, 14);
      expect(weight).to.equal(ethers.BigNumber.from("1000000000000000000"));
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.connect(wallet_2).vote(0, 1);
      await govToken.connect(wallet_2).delegate(wallet_3.address);
      await linearVoting.connect(wallet_3).vote(0, 1);
      let proposal = await linearVoting.proposals(0);
      await linearVoting.connect(wallet_1).vote(0, 1);
      proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("2000000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
      expect(await proposalModule.state(0)).to.equal(2);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      expect(await proposalModule.state(0)).to.equal(4);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await proposalModule.state(0)).to.equal(3);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_1.address);
      expect(owners[1]).to.equal(wallet_0.address);
    });

    it("can vote on multiple proposals", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        govToken,
        addCall,
        txHash,
        addCall_1,
        txHash_1,
      } = await baseSetup();
      await govToken.delegate(wallet_0.address);
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await proposalModule
        .connect(wallet_1)
        .submitProposal([txHash_1], linearVoting.address, "0x");
      await linearVoting.connect(wallet_1).vote(0, 1);
      await linearVoting.connect(wallet_1).vote(1, 1);
      await linearVoting.connect(wallet_2).vote(0, 1);
      await linearVoting.connect(wallet_2).vote(1, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
      await linearVoting.finalizeVote(1);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        safe.address, // target
        0, // value
        addCall_1.data, // data
        0, // call operation
        0 // txHash index
      );
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_1.address);
      expect(owners[2]).to.equal(wallet_0.address);
    });

    it("can't pass proposal without more yes votes", async () => {
      const { proposalModule, safe, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.connect(wallet_2).vote(0, 1);
      await linearVoting.connect(wallet_1).vote(0, 0);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      expect(proposal.noVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await expect(linearVoting.finalizeVote(0)).to.be.revertedWith(
        "the yesVotes must be strictly over the noVotes"
      );
    });

    it("abstain votes add to quorum", async () => {
      const { proposalModule, safe, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.connect(wallet_2).vote(0, 1);
      await linearVoting.connect(wallet_1).vote(0, 2);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      expect(proposal.abstainVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await expect(linearVoting.finalizeVote(0));
    });

    it("can complete a funding proposals", async () => {
      const { proposalModule, govToken, linearVoting, safe } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
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
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      let proposal = await proposalModule.proposals(0);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
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

    it.skip("can vote with ERC712 offchain signature", async () => {
      const { proposalModule, linearVoting, safe, govToken } =
        await baseSetup();
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
      const weight = await linearVoting.calculateWeight(wallet_1.address);
      expect(weight).to.equal(ethers.BigNumber.from("500000000000000000"));
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
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      // -------
      const voteHash = await linearVoting.getVoteHash(
        wallet_0.address,
        0,
        1,
        deadline
      );
      const domain = {
        chainId: chainId.toNumber(),
        verifyingContract: linearVoting.address,
      };
      const types = {
        Vote: [
          { name: "delegatee", type: "address" },
          { name: "proposalId", type: "uint256" },
          { name: "votes", type: "uint256" },
          { name: "vote", type: "bool" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      };
      const value = {
        delegatee: wallet_0.address,
        proposalId: ethers.BigNumber.from(0),
        votes: await linearVoting.getDelegatorVotes(
          wallet_0.address,
          wallet_0.address
        ),
        vote: 1,
        deadline: deadline,
        nonce: ethers.BigNumber.from(0),
      };
      // const signature = await wallet_0._signTypedData(domain, types, value)
      // const dataEncoder = new ethers.utils._TypedDataEncoder(types)
      // const payload = await dataEncoder.getPayload(domain, types, value)
      // console.log(payload)
      // -------
      // const typedData = {
      //   types: {
      //     EIP712Domain: [
      //       {name: "chainId", type: "uint256"},
      //       {name: "verifyingContract", type: "address"},
      //     ],
      //     Vote: [
      //         { name: 'delegatee', type: 'address' },
      //         { name: 'proposalId', type: 'uint256' },
      //         { name: 'votes', type: 'uint256' },
      //         { name: 'vote', type: 'bool' },
      //         { name: 'deadline', type: 'uint256' },
      //         { name: 'nonce', type: 'uint256' },
      //     ]
      //   },
      //   primaryType: 'Vote' as const,
      //   domain: {
      //     chainId: chainId.toNumber(),
      //     verifyingContract: linearVoting.address
      //   },
      //   message: value
      // }

      // const digest = TypedDataUtils.encodeDigest(typedData)
      // const digestHex = ethers.utils.hexlify(digest)

      // const signature = await wallet_0.signMessage(digest)
      // ------

      // const delegateVotes = await linearVoting.getDelegatorVotes(wallet_0.address, wallet_0.address)
      // const types = {
      //   EIP712Domain: [
      //     { name: 'chainId', type: 'uint256' },
      //     { name: 'verifyingContract', type: 'address' },
      //   ],
      //   Vote: [
      //       { name: 'delegatee', type: 'address' },
      //       { name: 'proposalId', type: 'uint256' },
      //       { name: 'votes', type: 'uint256' },
      //       { name: 'vote', type: 'bool' },
      //       { name: 'deadline', type: 'uint256' },
      //       { name: 'nonce', type: 'uint256' },
      //   ],
      // };

      // const primaryType = "Vote";
      // const message = {
      //   /*
      //    - Anything you want. Just a JSON Blob that encodes the data you want to send
      //    - No required fields
      //    - This is DApp Specific
      //    - Be as explicit as possible when building out the message schema.
      //   */
      //   delegatee: wallet_0.address,
      //   proposalId: 0,
      //   votes: delegateVotes.toString(),
      //   vote: 1,
      //   deadline: deadline,
      //   nonce: 0
      // }
      // const msgParams = {
      //     data: {
      //       types: {
      //         // TODO: Clarify if EIP712Domain refers to the domain the contract is hosted on
      //         EIP712Domain: [
      //           { name: 'chainId', type: 'uint256' },
      //           { name: 'verifyingContract', type: 'address' },
      //         ],
      //         // Not an EIP712Domain definition
      //         Vote: [
      //             { name: 'delegatee', type: 'address' },
      //             { name: 'proposalId', type: 'uint256' },
      //             { name: 'votes', type: 'uint256' },
      //             { name: 'vote', type: 'bool' },
      //             { name: 'deadline', type: 'uint256' },
      //             { name: 'nonce', type: 'uint256' },
      //         ],
      //       },
      //       domain: {
      //         // Defining the chain aka Rinkeby testnet or Ethereum Main Net
      //         chainId: chainId,
      //         // If name isn't enough add verifying contract to make sure you are establishing contracts with the proper entity
      //         verifyingContract: linearVoting.address,
      //       },

      //       // Defining the message signing data content.
      //       message: {
      //         /*
      //          - Anything you want. Just a JSON Blob that encodes the data you want to send
      //          - No required fields
      //          - This is DApp Specific
      //          - Be as explicit as possible when building out the message schema.
      //         */
      //         delegatee: wallet_0.address,
      //         proposalId: 0,
      //         votes: delegateVotes.toString(),
      //         vote: 1,
      //         deadline: deadline,
      //         nonce: 0
      //       },
      //       // Refers to the keys of the *types* object below.
      //       primaryType: 'Vote',
      //     }
      // };
      // const signature = await signTypedData_v4(
      //   Buffer.from(wallet_0.privateKey.slice(2, 66), "hex"),
      //   {
      //     data: {
      //       types,
      //       primaryType,
      //       domain,
      //       message,
      //     }
      //   }
      // )
      // ---------
      console.log(voteHash);
      const typehash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("Vote(uint256 proposalId,uint8 vote)")
      );
      console.log(typehash);
      const abi = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "uint256", "address"],
        [
          "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218",
          chainId,
          linearVoting.address,
        ]
      );
      let abi2 = ethers.utils.defaultAbiCoder.encode(
        [
          "bytes32",
          "address",
          "uint256",
          "uint256",
          "bool",
          "uint256",
          "uint256",
        ],
        [
          "0x17c0c894efb0e2d2868a370783df75623a0365af090e935de3c5f6f761aaa153",
          wallet_0.address,
          0,
          await linearVoting.getDelegatorVotes(
            wallet_0.address,
            wallet_0.address
          ),
          1,
          deadline,
          0,
        ]
      );
      let test = ethers.utils.keccak256(abi);
      let test2 = ethers.utils.keccak256(abi2);
      let abi3 = "0x1901" + test.slice(2, 66) + test2.slice(2, 66);
      let test3 = ethers.utils.keccak256(abi3);
      console.log("---");
      console.log(test3);
      const signature = ecsign(
        Buffer.from(test3.slice(2, 66), "hex"),
        Buffer.from(wallet_0.privateKey.slice(2, 66), "hex")
      );
      // ---------

      console.log(signature);
      // const r = signature.slice(0, 66)
      // const s = '0x' + signature.slice(66, 130)
      // const v = parseInt(signature.slice(130, 132), 16)
      const r = ethers.utils.hexlify(signature.r);
      const s = ethers.utils.hexlify(signature.s);
      const v = signature.v;
      console.log(r);
      console.log(s);
      console.log(v);
      let address = ethers.utils.recoverAddress(voteHash, {
        r: r,
        s: s,
        v: v,
      });
      console.log(address);
      console.log(wallet_0.address);
      await linearVoting
        .connect(wallet_1)
        .voteSignature(wallet_0.address, 0, 1, v, r, s);

      let proposal = await proposalModule.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("500000000000000000")
      );
    });
  });
  // can use the safe and a cancel proposal role
});
