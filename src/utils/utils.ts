import {LCDClient} from "@terra-money/terra.js";
import {queryNativeTokenBalance} from "../helpers";
import chalk from "chalk";

export async function getRewardContractBalance(terra: LCDClient): Promise<number> {
    const rewardsLuna = +(await queryNativeTokenBalance(terra, process.env.ROYALTY_CONTRACT_ADDRESS!, "uluna"));
    console.log(chalk.green(`Royalty Contract Rewards: ${rewardsLuna / 1000000} Luna`));
    return rewardsLuna;
}

export async function getRandomEarthBalance(terra: LCDClient): Promise<number> {
    const queryResponse: string = await terra.wasm.contractQuery(process.env.RANDOM_EARTH_REWARDS_CONTRACT_ADDRESS!, {
        balance: {
            address: process.env.ROYALTY_CONTRACT_ADDRESS,
            asset_info: {
                native_token: {
                    denom: "uluna"
                }
            }
        },
    });
    const randomEarthContractBalance = +queryResponse;
    console.log(chalk.green(`RandomEarth Balance: ${randomEarthContractBalance / 1000000} Luna`))

    return randomEarthContractBalance;
}

export async function delay(ms: number): Promise<any> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const chunk = (arr: any[], size: number) =>
    Array.from({length: Math.ceil(arr.length / size)}, (_: any, i: number) =>
        arr.slice(i * size, i * size + size)
    );
