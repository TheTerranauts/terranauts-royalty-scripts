import chalk from "chalk";
import {getLcd, getWallet, queryNativeTokenBalance, sendTransaction} from "../helpers";
import dotenv from "dotenv";
import {MsgExecuteContract} from "@terra-money/terra.js";
import {getRandomEarthBalance} from "../utils/utils";

////
//// Claims the rewards from RandomEarth.
//// Queries final token balance
//// Generates msg json file
(async function main() {
    dotenv.config();

    const terra = getLcd(process.env.NETWORK!);
    console.log("created LCD client for", process.env.NETWORK);

    const deployer = getWallet(terra);
    console.log("deployer address:", deployer.key.accAddress);

    const randomEarthContractBalance = await getRandomEarthBalance(terra);

    const subMsg = {
        withdraw_random_earth: {
            address: process.env.RANDOM_EARTH_REWARDS_CONTRACT_ADDRESS,
            amount: `${randomEarthContractBalance}`,
        },
    };

    const withdrawResponse = await sendTransaction(terra, deployer, [
        new MsgExecuteContract(deployer.key.accAddress, process.env.ROYALTY_CONTRACT_ADDRESS!, subMsg),
    ]);

    console.log(withdrawResponse);
    //
    //
    // // todo: read distribution.json file
    const rewardsLuna = +(await queryNativeTokenBalance(terra, process.env.ROYALTY_CONTRACT_ADDRESS!, "uluna"));
    console.log(chalk.green(`Royalty Contract Rewards${rewardsLuna / 1000000} Luna`));
})();
