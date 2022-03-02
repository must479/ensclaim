const { ethers } = require("hardhat");

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer, owner} = await getNamedAccounts();

    const registry = await ethers.getContract('ENSRegistry');
    // eth-usd.data.eth
    const oracleAddress = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
    const exponentialPremiumPriceOracle = await deploy('ExponentialPremiumPriceOracle',
    {
        from: deployer,
        args:[
            oracleAddress,
            [0, 0, toBN(20294266869609), toBN(5073566717402), toBN(158548959919)],
            21    
        ],
        log:true
    })
    

};
module.exports.tags = ['exponential'];
module.exports.dependencies = ['registry'];

