const { ethers } = require("hardhat");

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments, network}) => {
    if(!network.config.settings || !network.config.settings.oracle_address) {
        return;
    }

    const {deploy} = deployments;
    const {deployer, owner} = await getNamedAccounts();
    const {oracle_address, rent_prices, start_premium, total_days} = network.config.settings;

    await deploy('ExponentialPremiumPriceOracle', {
        from: deployer,
        args: [
            oracle_address,
            rent_prices,
            start_premium,
            total_days
        ],
        log: true,
    });
};
module.exports.id = "ExponentialPremiumPriceOracle";
module.exports.tags = ['oracle'];
