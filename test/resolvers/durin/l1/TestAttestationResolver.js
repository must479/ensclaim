const { expect } = require("chai");
const { ethers } = require('hardhat');
const { Signer, ContractFactory, Contract, BigNumber } = require('ethers');
const namehash = require('eth-ens-namehash');

const provider = ethers.provider
const GATEWAY = "http://localhost:8080/query/";
const sha3 = require('web3-utils').sha3
const REVERT_MESSAGE = "VM Exception while processing transaction: revert Signer is not the domain owner"

async function deploy(contractName, ...args) {
  const artifact = await ethers.getContractFactory(contractName)
  return artifact.deploy(...args)
}
describe("AttestationResolver", function() {
  let signer;
  let account2;
  before(async () => {
    console.log('AttestationResolver1')
    const signers = await ethers.getSigners()
    signer = await signers[0]
    account2 = await signers[1]
  });

  let Factory__AttestationResolver;
  let Factory_ENSRegistry;
  before(async () => {
    Factory__AttestationResolver = await ethers.getContractFactory(
      'AttestationResolver'
    );
    Factory_ENSRegistry = await ethers.getContractFactory(
      'ENSRegistry'
    );
  });

  let stub, ownerAddress;
  beforeEach(async () => {
    ownerAddress = await signer.getAddress(ownerAddress)
    registry = await Factory_ENSRegistry.deploy()
    stub = await Factory__AttestationResolver.deploy(registry.address, GATEWAY);
    await stub.deployed();
    await registry.setOwner(namehash.hash(''), ownerAddress);
    await registry.setSubnodeOwner(namehash.hash(''), sha3('eth'), ownerAddress);
    await registry.setSubnodeOwner(namehash.hash('eth'), sha3('test'), ownerAddress);
  });

  it("Should return the gateway and contract address from the constructor", async function() {
    let testNode = namehash.hash('test.eth');
    expect(await registry.owner(testNode)).to.equal(ownerAddress);
    expect(await stub.gateway()).to.equal(GATEWAY);
  });

  describe("addrWithProof", () => {
    let testAddress;
    let testNode;
    let proof;
    let messageHash;
    before(async () => {
      testNode = namehash.hash('test.eth');
    })

    it("should verify proofs of resolution results", async function() {
      messageHash = ethers.utils.solidityKeccak256(
        ['bytes32', 'address'],[testNode, account2.address]
      );
      let messageHashBinary = ethers.utils.arrayify(messageHash);
      let signature = await signer.signMessage(messageHashBinary);
      proof = {
        signature,
        addr:account2.address
      };
      let newAddress = await stub.addrWithProof(testNode, proof)
      expect(newAddress).to.equal(account2.address);
    });

    it("should not verify proofs if signature is not signed with address", async function() {
      messageHash = ethers.utils.solidityKeccak256(
        // Missing address
        ['bytes32'],[testNode]
      );
      let messageHashBinary = ethers.utils.arrayify(messageHash);
      let signature = await signer.signMessage(messageHashBinary);
      proof = {
        signature,
        addr:account2.address
      };

      try {
        await stub.addrWithProof(testNode, proof);
      } catch (error) {
        console.log(error.message);
        expect(error.message).to.equal(REVERT_MESSAGE)
      }
    });

    it("should not verify proofs if address is missing", async function() {
      messageHash = ethers.utils.solidityKeccak256(
        ['bytes32', 'address'],[testNode, account2.address]
      );
      let messageHashBinary = ethers.utils.arrayify(messageHash);
      let signature = await signer.signMessage(messageHashBinary);
      proof = {
        signature,
        addr:signer.address // use the address not used for message hash
      };

      try {
        await stub.addrWithProof(testNode, proof);
      } catch (error) {
        console.log(error.message);
        expect(error.message).to.equal(REVERT_MESSAGE)
      }
    });

    it("should not verify proofs if signed by non domain owner", async function() {
      messageHash = ethers.utils.solidityKeccak256(
        ['bytes32', 'address'],[testNode, account2.address]
      );
      let messageHashBinary = ethers.utils.arrayify(messageHash);
      // account2 is not the owner of `test.test`
      let signature = await account2.signMessage(messageHashBinary);
      proof = {
        signature,
        addr:account2.address
      };

      try {
        await stub.addrWithProof(testNode, proof);
      } catch (error) {
        console.log(error.message);
        expect(error.message).to.equal(REVERT_MESSAGE)
      }
    });
  });
});