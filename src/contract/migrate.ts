import chalk from "chalk";
import {MsgMigrateContract} from "@terra-money/terra.js";
import {getLcd, getWallet, sendTransaction, storeCode,} from "../helpers";
import dotenv from "dotenv";
import {delay} from "../utils/utils";

async function migrate() {
    const terra = getLcd(process.env.NETWORK!);
    console.log("created LCD client for", process.env.NETWORK);

    const deployer = getWallet(terra);
    console.log("deployer address:", deployer.key.accAddress);

    const contractCode = await storeCode(
        terra,
        deployer,
        `../../terranauts_royalty_contract/artifacts/terranauts_royalty.wasm`
    );

    // const contractCode = 974;

    await delay(2000);

    console.log(chalk.green(`Done!`), `${chalk.blue("codeId")}=${contractCode}`);

    process.stdout.write(`Migrating contract... `);

    const hubTxResult = await sendTransaction(terra, deployer, [
        new MsgMigrateContract(deployer.key.accAddress, process.env.ROYALTY_CONTRACT_ADDRESS!, contractCode, {}),
    ]);

    console.log("success! txhash:", hubTxResult.txhash);

    console.log(chalk.green("Migrated!"));
}

//----------------------------------------------------------------------------------------
// Main
//----------------------------------------------------------------------------------------

(async () => {
    console.log(`Migrating`);
    await migrate();
    console.log("");
})();
