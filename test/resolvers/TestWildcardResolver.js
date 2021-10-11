const ENS = artifacts.require('./registry/ENSRegistry.sol');
const PublicResolver = artifacts.require('PublicResolver.sol');
const WildcardResolver = artifacts.require('WildcardResolver.sol');
const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const ethers = require('ethers')
const { exceptions } = require("../test-utils");
const url = "https://ethereum.org/"
const packet = require('dns-packet')

const iface = new ethers.utils.Interface(PublicResolver.abi);
const INTERFACE_ID = '0x01ffc9a7';

function dnsencode(name){
    return `0x${packet.name.encode(name).toString('hex')}`
}

const parent = async function(currentname){
    const labels = currentname.split('.')
    if(labels.length > 1){
        return labels.slice(1).join('.')
    }else{
        return ''
    }
}

const getResolver = async function(ens, name) {
    for (let currentname = name; currentname !== ''; currentname = await parent(currentname)) {
        const node = namehash.hash(currentname);
        const resolver = await ens.resolver(node);
        if(resolver != '0x0000000000000000000000000000000000000000') {
            return WildcardResolver.at(resolver);
        }
    }
}

const resolve = async function (ens, name, func, ...args) {
    const resolver = await getResolver(ens, name);
    const iface = new ethers.utils.Interface(resolver.abi)

    if(resolver === null) {
        return null;
    }
    const supports2544 = await resolver.supportsInterface(INTERFACE_ID);
    if(supports2544) {
        const calldata = iface.encodeFunctionData(func, args)
        result = await resolver.resolve(dnsencode(name), calldata);
        const decoded = iface.decodeFunctionResult(func, result);
        return decoded
    } else {
        return resolver[func](...args);
    }
}

contract('UniversalResolver', function (accounts) {
    let ens
    beforeEach(async () => {
        ens = await ENS.new();
        wildcard = await WildcardResolver.new(ens.address, ethers.constants.AddressZero);
        await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {from: accounts[0]});
        await ens.setResolver(namehash.hash('eth'), wildcard.address, {from: accounts[0]})
        // No matter what names are passed, return this.
        await wildcard.setText(namehash.hash('eth'), 'url', 'google.com')
    });
    describe.only('resolve', async () => {
        it('resolves', async () => {
            const domain = 'foo.bar.baz.ddd.aaa.eth'
            console.log(await resolve(ens, domain, 'text', namehash.hash(domain), 'url'))
        });
    });
});
