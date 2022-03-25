const ENS = artifacts.require("./registry/ENSRegistry.sol");
const PublicResolver = artifacts.require("PublicResolver.sol");
const NameWrapper = artifacts.require("DummyNameWrapper.sol");
const UniversalResolver = artifacts.require("UniversalResolver.sol");
const DoNotCallOnChainUniversalResolverProxy = artifacts.require(
  "DoNotCallOnChainUniversalResolverProxy.sol"
);
const DummyOffchainResolver = artifacts.require("DummyOffchainResolver.sol");
const DefaultReverseResolver = artifacts.require("DefaultReverseResolver.sol");
const ReverseRegistrar = artifacts.require("ReverseRegistrar.sol");
const BaseRegistrar = artifacts.require("BaseRegistrarImplementation.sol");

const { expect } = require("chai");
const namehash = require("eth-ens-namehash");
const sha3 = require("web3-utils").sha3;
const { ethers } = require("hardhat");
const { dns } = require("../test-utils");

const makeHashIndexes = (data, name) =>
  [...data.matchAll(namehash.hash(name).substring(2))].map(
    (x) => x.index / 2 - 1
  );
const makeEstimateAndResult = async (func, ...args) => ({
  estimate: await func.estimateGas(...args),
  result: await func(...args),
});

contract("UniversalResolver", function(accounts) {
  const ownerAccount = accounts[0];
  const controllerAccount = accounts[1];

  let ens,
    publicResolver,
    universalResolver,
    doNotCallOnChainUniversalResolverProxy,
    dummyOffchainResolver,
    nameWrapper,
    reverseResolver,
    reverseNode,
    addrData,
    multicallData,
    registrarData;

  beforeEach(async () => {
    node = namehash.hash("eth");
    ens = await ENS.new();
    nameWrapper = await NameWrapper.new();
    publicResolver = await PublicResolver.new(ens.address, nameWrapper.address);
    universalResolver = await UniversalResolver.new(ens.address);
    doNotCallOnChainUniversalResolverProxy = await DoNotCallOnChainUniversalResolverProxy.new(
      universalResolver.address
    );
    dummyOffchainResolver = await DummyOffchainResolver.new();
    reverseResolver = await DefaultReverseResolver.new(ens.address);
    reverseRegistrar = await ReverseRegistrar.new(
      ens.address,
      reverseResolver.address
    );
    reverseNode = accounts[0].toLowerCase().substring(2) + ".addr.reverse";
    registrar = await BaseRegistrar.new(ens.address, namehash.hash("eth"), {
      from: ownerAccount,
    });

    await registrar.addController(ownerAccount, { from: ownerAccount });
    await ens.setSubnodeOwner("0x0", sha3("eth"), registrar.address);

    await registrar.register(sha3("test"), ownerAccount, 86400, {
      from: ownerAccount,
    });
    await ens.setSubnodeOwner("0x0", sha3("reverse"), accounts[0], {
      from: accounts[0],
    });
    await ens.setSubnodeOwner(
      namehash.hash("reverse"),
      sha3("addr"),
      reverseRegistrar.address,
      { from: accounts[0] }
    );
    console.log("UP TO SET");
    await ens.setResolver(namehash.hash("test.eth"), publicResolver.address, {
      from: accounts[0],
    });
    console.log("PAST SET");
    await publicResolver.methods["setAddr(bytes32,address)"](
      namehash.hash("test.eth"),
      accounts[1],
      { from: accounts[0] }
    );
    await publicResolver.methods[
      "setText(bytes32,string,string)"
    ](namehash.hash("test.eth"), "foo", "bar", { from: accounts[0] });

    await reverseRegistrar.claim(accounts[0], {
      from: accounts[0],
    });
    await ens.setResolver(namehash.hash(reverseNode), reverseResolver.address, {
      from: accounts[0],
    });
    await reverseResolver.setName(namehash.hash(reverseNode), "test.eth");
    addrData = (
      await publicResolver.methods["addr(bytes32)"].request(
        namehash.hash(reverseNode)
      )
    ).data;
  });

  describe("reverse()", () => {
    it("should resolve a reverse record with no calls", async () => {
      const { estimate, result } = await makeEstimateAndResult(
        doNotCallOnChainUniversalResolverProxy.reverse,
        dns.hexEncodeName(reverseNode),
        []
      );
      console.log("GAS ESTIMATE:", estimate);
      console.log(result);
      expect(result["0"]).to.equal("test.eth");
      expect(result["1"]).to.be.empty;
    });

    it("should resolve a reverse record with a universal addr call", async () => {
      const { estimate, result } = await makeEstimateAndResult(
        doNotCallOnChainUniversalResolverProxy.reverse,
        dns.hexEncodeName(reverseNode),
        [
          {
            target: universalResolver.address,
            data: addrData,
            dataType: 0,
            locations: makeHashIndexes(addrData, reverseNode),
          },
        ]
      );

      console.log("GAS ESTIMATE:", estimate);
      const [
        addrEncoded,
        resolverAddress,
      ] = ethers.utils.defaultAbiCoder.decode(
        ["bytes", "address"],
        result.returnData[0]
      );
      const [addr] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        addrEncoded
      );
      expect(result.name).to.equal("test.eth");
      expect(addr).to.equal(accounts[1]);
      expect(resolverAddress).to.equal(publicResolver.address);
    });

    it("should resolve a reverse record with a universal multicall", async () => {
      const textData = (
        await publicResolver.methods["text(bytes32,string)"].request(
          namehash.hash(reverseNode),
          "foo"
        )
      ).data;
      multicallData = (
        await publicResolver.methods["multicall(bytes[])"].request([
          addrData,
          textData,
        ])
      ).data;
      const { estimate, result } = await makeEstimateAndResult(
        doNotCallOnChainUniversalResolverProxy.reverse,
        dns.hexEncodeName(reverseNode),
        [
          {
            target: universalResolver.address,
            data: multicallData,
            dataType: 0,
            locations: makeHashIndexes(multicallData, reverseNode),
          },
        ]
      );
      console.log("GAS ESTIMATE:", estimate);
      const [
        encodedMulticall,
        resolverAddress,
      ] = ethers.utils.defaultAbiCoder.decode(
        ["bytes", "address"],
        result.returnData[0]
      );
      const [multicallRet] = ethers.utils.defaultAbiCoder.decode(
        ["bytes[]"],
        encodedMulticall
      );
      const [addr] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        multicallRet[0]
      );
      const [text] = ethers.utils.defaultAbiCoder.decode(
        ["string"],
        multicallRet[1]
      );
      expect(result.name).to.equal("test.eth");
      expect(addr).to.equal(accounts[1]);
      expect(text).to.equal("bar");
      expect(resolverAddress).to.equal(publicResolver.address);
    });

    it("should resolve a registry call", async () => {
      registrarData = (
        await registrar.methods["ownerOf(uint256)"].request(sha3("test"))
      ).data;
      const { estimate, result } = await makeEstimateAndResult(
        doNotCallOnChainUniversalResolverProxy.reverse,
        dns.hexEncodeName(reverseNode),
        [
          {
            target: registrar.address,
            data: registrarData,
            dataType: 1,
            locations: makeHashIndexes(registrarData, sha3("test")),
          },
        ]
      );
      console.log("GAS ESTIMATE:", estimate);
      const [owner] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        result.returnData[0]
      );
      expect(result.name).to.equal("test.eth");
      expect(owner).to.equal(accounts[0]);
    });

    it("should resolve a universal call and a registry call", async () => {
      const { estimate, result } = await makeEstimateAndResult(
        doNotCallOnChainUniversalResolverProxy.reverse,
        dns.hexEncodeName(reverseNode),
        [
          {
            target: universalResolver.address,
            data: multicallData,
            dataType: 0,
            locations: makeHashIndexes(multicallData, reverseNode),
          },
          {
            target: registrar.address,
            data: registrarData,
            dataType: 1,
            locations: makeHashIndexes(registrarData, sha3("test")),
          },
        ]
      );
      console.log("GAS ESTIMATE:", estimate);
      const [
        encodedMulticall,
        resolverAddress,
      ] = ethers.utils.defaultAbiCoder.decode(
        ["bytes", "address"],
        result.returnData[0]
      );
      const [multicallRet] = ethers.utils.defaultAbiCoder.decode(
        ["bytes[]"],
        encodedMulticall
      );
      const [addr] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        multicallRet[0]
      );
      const [text] = ethers.utils.defaultAbiCoder.decode(
        ["string"],
        multicallRet[1]
      );
      const [owner] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        result.returnData[1]
      );
      expect(result.name).to.equal("test.eth");
      expect(addr).to.equal(accounts[1]);
      expect(text).to.equal("bar");
      expect(resolverAddress).to.equal(publicResolver.address);
      expect(owner).to.equal(accounts[0]);
    });
  });
});
