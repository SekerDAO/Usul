import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, network, waffle } from "hardhat";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { DAOFixture, getFixtureWithParams } from "./shared/fixtures";
import {
  executeContractCallWithSigners,
  buildContractCall,
  safeSignMessage,
  executeTx,
  EIP712_TYPES,
} from "./shared/utils";
import { keccak256 } from "ethereumjs-util";
import {
  defaultSender,
  provider,
  web3,
  contract,
} from "@openzeppelin/test-environment";
import { AddressZero } from "@ethersproject/constants";
import { signTypedData_v4, MsgParams } from "eth-sig-util";
import { TypedDataUtils } from 'ethers-eip712'
import { ecsign } from "ethereumjs-util";
//import { sign } from "./shared/EIP712";

const zero = ethers.BigNumber.from(0);
const deadline = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
const MaxUint256 = ethers.constants.MaxUint256;

let daoFixture: DAOFixture;
let wallet: SignerWithAddress;

describe("votingModules:", () => {
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
  beforeEach(async function () {
    wallet = (await ethers.getSigners())[0];
    daoFixture = await getFixtureWithParams(wallet, true);
  });

  describe("setUp", async () => {
    it("can register linear voting module", async () => {
      const { proposalModule, linearVoting, safe } = daoFixture;
      await executeContractCallWithSigners(
        safe,
        proposalModule,
        "enableModule",
        [linearVoting.address],
        [wallet_0]
      );
      expect(await proposalModule.isModuleEnabled(linearVoting.address)).to.equal(true);
    });

    it("only Safe can register linear voting module", async () => {
      const { proposalModule, linearVoting } = daoFixture;
      await expect(proposalModule.enableModule(linearVoting.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("linear voting module", async () => {
    it("can delegate votes to self", async () => {
      const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture;
      const bal = await govToken.balanceOf(wallet_0.address);
      await govToken.approve(linearVoting.address, 1000);
      await linearVoting.delegateVotes(wallet_0.address, 1000);
      const delegatation = await linearVoting.delegations(wallet_0.address);
      expect(delegatation.total).to.equal(1000);
      expect(await govToken.balanceOf(linearVoting.address)).to.equal(1000);
    });

    it("can undelegate votes to self", async () => {
      const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture;
      const bal = await govToken.balanceOf(wallet_0.address);
      await govToken.approve(linearVoting.address, 1000);
      await linearVoting.delegateVotes(wallet_0.address, 1000);
      const delegatation = await linearVoting.delegations(wallet_0.address);
      await linearVoting.undelegateVotes(wallet_0.address, 1000);
      const undelegatation = await linearVoting.delegations(wallet_0.address);
      expect(undelegatation.total).to.equal(0);
      expect(await govToken.balanceOf(linearVoting.address)).to.equal(0);
    });

    it("can delegate votes to others", async () => {
      const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture;
      const bal = await govToken.balanceOf(wallet_0.address);
      await govToken.approve(linearVoting.address, 1000);
      await linearVoting.delegateVotes(wallet_0.address, 1000);
      await govToken.connect(wallet_1).approve(linearVoting.address, 1000);
      await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, 1000);
      await govToken.connect(wallet_2).approve(linearVoting.address, 1000);
      await linearVoting.connect(wallet_2).delegateVotes(wallet_0.address, 1000);
      const delegatation = await linearVoting.delegations(wallet_0.address);
      expect(delegatation.total).to.equal(3000);
      expect(await govToken.balanceOf(linearVoting.address)).to.equal(3000);
    });

    it("can undelegate votes to others", async () => {
      const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture;
      const bal = await govToken.balanceOf(wallet_0.address);
      await govToken.approve(linearVoting.address, 1000);
      await linearVoting.delegateVotes(wallet_0.address, 1000);
      await govToken.connect(wallet_1).approve(linearVoting.address, 1000);
      await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, 1000);
      await govToken.connect(wallet_2).approve(linearVoting.address, 1000);
      await linearVoting.connect(wallet_2).delegateVotes(wallet_0.address, 1000);
      await linearVoting
        .connect(wallet_2)
        .undelegateVotes(wallet_0.address, 1000);
      const undelegatation = await linearVoting.delegations(wallet_0.address);
      expect(undelegatation.total).to.equal(2000);
      expect(await govToken.balanceOf(linearVoting.address)).to.equal(2000);
    });

    it("can vote past the threshold with delegation", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await proposalModule.submitProposal([txHash]);
      const proposal = await proposalModule.proposals(0);
      const isExecuted = await proposalModule.isExecuted(0, 0);
      const _txHash = await proposalModule.getTxHash(0, 0);
      expect(isExecuted).to.equal(false);
      expect(_txHash).to.equal(txHash);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from(0)
      );
      await linearVoting.vote(0, 1);
      const proposalAfterVoting = await proposalModule.proposals(0);
      const delegation = await linearVoting.delegations(wallet_0.address)
      //expect(delegation.undelegateDelay.toString()).to.equal(1629243513)
      expect(proposalAfterVoting.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
    });

    // hardhat currently will not revert when manual
    // https://github.com/nomiclabs/hardhat/issues/1468
    it.skip("cannot vote if delegatation is in the same block", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await proposalModule.submitProposal([txHash]);
      await govToken
        .connect(wallet_1)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let block = await network.provider.send("eth_blockNumber");
      //await network.provider.send("evm_setAutomine", [false]);
      await linearVoting
        .connect(wallet_1)
        .delegateVotes(
          wallet_2.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await network.provider.send("evm_mine");
      await proposalModule.connect(wallet_2).vote(0, true)
      //await expect(proposalModule.connect(wallet_1).vote(0, true)).to.be.revertedWith("TW021")  
      await network.provider.send("evm_mine");
      let votes = await linearVoting.getDelegatorVotes(wallet_2.address, wallet_1.address)
      expect(votes).to.equal(ethers.BigNumber.from("500000000000000000"))
      //await network.provider.send("evm_setAutomine", [true]);
    });

    it("can vote past the threshold with independent delegatation", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await proposalModule.submitProposal([txHash]);
      await linearVoting.vote(0, 1);
      let proposal = await proposalModule.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("500000000000000000")
      );
      await linearVoting.connect(wallet_1).vote(0, 1);
      proposal = await proposalModule.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("1000000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      proposal = await proposalModule.proposals(0);
      expect(proposal.queued).to.equal(true);
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
      //expect(proposal.executed).to.equal(true);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_0.address);
    });

    it("can only vote once per proposal", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await proposalModule.submitProposal([txHash]);
      await linearVoting.connect(wallet_1).vote(0, true);
      await expect(linearVoting.connect(wallet_1).vote(0, true)).to.be.revertedWith("TW007");
    });

    it("can vote on multiple proposals", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await govToken
        .connect(wallet_2)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_2)
        .delegateVotes(
          wallet_2.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_3.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash]);
      await linearVoting.vote(0, true);
      await proposalModule.connect(wallet_1).submitProposal([txHash]);
      await linearVoting.connect(wallet_1).vote(1, true);
      await proposalModule.connect(wallet_2).submitProposal([txHash]);
      await linearVoting.connect(wallet_2).vote(2, true);
      await linearVoting.vote(1, true);
      await linearVoting.vote(2, true);
      await linearVoting.connect(wallet_1).vote(0, true);
      await linearVoting.connect(wallet_1).vote(2, true);
      await linearVoting.connect(wallet_2).vote(0, true);
      await linearVoting.connect(wallet_2).vote(1, true);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      await proposalModule.startQueue(1);
      await proposalModule.startQueue(2);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      await proposalModule.executeProposalByIndex(
        2, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await govToken.balanceOf(wallet_3.address)).to.equal(
        ethers.BigNumber.from("1000000000000003000")
      );
    });

    it("cannot undelegate if not past timeout", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await govToken
        .connect(wallet_2)
        .approve(
          linearVoting.address,
          ethers.BigNumber.from("500000000000000000")
        );
      await linearVoting
        .connect(wallet_2)
        .delegateVotes(
          wallet_2.address,
          ethers.BigNumber.from("500000000000000000")
        );
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_3.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash]);
      await linearVoting.vote(0, true);
      await proposalModule.connect(wallet_1).submitProposal([txHash]);
      await linearVoting.connect(wallet_1).vote(1, true);
      await proposalModule.connect(wallet_2).submitProposal([txHash]);
      await linearVoting.connect(wallet_2).vote(2, true);
      await linearVoting.vote(1, true);
      await linearVoting.vote(2, true);
      await linearVoting.connect(wallet_1).vote(0, true);
      await linearVoting.connect(wallet_1).vote(2, true);
      await linearVoting.connect(wallet_2).vote(0, true);
      await linearVoting.connect(wallet_2).vote(1, true);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.startQueue(0);
      await proposalModule.startQueue(1);
      await proposalModule.startQueue(2);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      await proposalModule.executeProposalByIndex(
        2, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await govToken.balanceOf(wallet_3.address)).to.equal(
        ethers.BigNumber.from("1000000000000003000")
      );
      let delegation = await linearVoting.delegations(wallet_0.address);
      expect(delegation.total).to.equal(
        ethers.BigNumber.from("500000000000000000")
      );
      expect(await govToken.balanceOf(wallet_0.address)).to.equal(
        ethers.BigNumber.from("49996500000000000000000")
      );
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.undelegateVotes(
        wallet_0.address,
        ethers.BigNumber.from("500000000000000000")
      );
      delegation = await linearVoting.delegations(wallet_0.address);
      expect(delegation.total).to.equal(0);
      expect(await govToken.balanceOf(wallet_0.address)).to.equal(
        ethers.BigNumber.from("49997000000000000000000")
      );
    });

    it("can vote with ERC712 offchain signature", async () => {
      const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture;
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
      await proposalModule.submitProposal([txHash]);
      // -------
      const voteHash = await linearVoting.getVoteHash(
        wallet_0.address,
        0,
        1,
        deadline
      )
      const domain = {
          chainId: chainId.toNumber(),
          verifyingContract: linearVoting.address
      };
      const types = {
          Vote: [
              { name: 'delegatee', type: 'address' },
              { name: 'proposalId', type: 'uint256' },
              { name: 'votes', type: 'uint256' },
              { name: 'vote', type: 'bool' },
              { name: 'deadline', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
          ]
      };
      const value = {
          delegatee: wallet_0.address,
          proposalId: ethers.BigNumber.from(0),
          votes: await linearVoting.getDelegatorVotes(wallet_0.address, wallet_0.address),
          vote: 1,
          deadline: deadline,
          nonce: ethers.BigNumber.from(0)
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
      console.log(voteHash)
      const typehash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Vote(address delegatee, uint256 proposalId, uint256 votes, bool vote, uint256 deadline, uint256 nonce)"))
      console.log(typehash)
      const abi = ethers.utils.defaultAbiCoder.encode(
        [
          "bytes32",
          "uint256",
          "address"
        ],
        [
          '0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218',
          chainId,
          linearVoting.address
        ]
      )
      let abi2 = ethers.utils.defaultAbiCoder.encode(
        [
          "bytes32",
          "address",
          "uint256",
          "uint256",
          "bool",
          "uint256",
          "uint256"
        ],
        [
          '0x17c0c894efb0e2d2868a370783df75623a0365af090e935de3c5f6f761aaa153',
          wallet_0.address,
          0,
          await linearVoting.getDelegatorVotes(wallet_0.address, wallet_0.address),
          1,
          deadline,
          0
        ]
      )
      let test = ethers.utils.keccak256(abi)
      let test2 = ethers.utils.keccak256(abi2)
      let abi3 = "0x1901"+test.slice(2, 66)+test2.slice(2, 66)
      let test3 = ethers.utils.keccak256(abi3)
      console.log('---')
      console.log(test3)
      const signature = ecsign(Buffer.from(test3.slice(2, 66), "hex"), Buffer.from(wallet_0.privateKey.slice(2, 66), "hex"))
      // ---------

      console.log(signature)
      // const r = signature.slice(0, 66)
      // const s = '0x' + signature.slice(66, 130)
      // const v = parseInt(signature.slice(130, 132), 16)
      const r = ethers.utils.hexlify(signature.r)
      const s = ethers.utils.hexlify(signature.s)
      const v = signature.v
      console.log(r)
      console.log(s)
      console.log(v)
      let address = ethers.utils.recoverAddress(
        voteHash, {
          r: r,
          s: s,
          v: v
        }
      )
      console.log(address)
      console.log(wallet_0.address)
      await linearVoting.connect(wallet_1).voteSignature(wallet_0.address, 0, 1, deadline, v, r, s);

      let proposal = await proposalModule.proposals(0);
      expect(proposal.yesVotes).to.equal(
        ethers.BigNumber.from("500000000000000000")
      );
      // await linearVoting.connect(wallet_1).vote(0, 1);
      // proposal = await proposalModule.proposals(0);
      // expect(proposal.yesVotes).to.equal(
      //   ethers.BigNumber.from("1000000000000000000")
      // );
      // await network.provider.send("evm_increaseTime", [60]);
      // await proposalModule.startQueue(0);
      // proposal = await proposalModule.proposals(0);
      // expect(proposal.queued).to.equal(true);
      // await network.provider.send("evm_increaseTime", [60]);
      // await proposalModule.executeProposalByIndex(
      //   0, // proposalId
      //   safe.address, // target
      //   0, // value
      //   addCall.data, // data
      //   0, // call operation
      //   0 // txHash index
      // );
      // proposal = await proposalModule.proposals(0);
      // //expect(proposal.executed).to.equal(true);
      // const owners = await safe.getOwners();
      // expect(owners[0]).to.equal(wallet_2.address);
      // expect(owners[1]).to.equal(wallet_0.address);
    });

  });
  // can use the safe and a cancel proposal role
});
