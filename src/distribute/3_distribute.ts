import {getLcd, getWallet, sendTransaction,} from "../helpers";
import fs from "fs";
import path from "path";
import {assert} from "chai";
import {chunk, getRewardContractBalance} from "../utils/utils";
import chalk from "chalk";
import {Coin, MsgExecuteContract} from "@terra-money/terra.js";

const _ = require('lodash');

const owners = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '/terranaut_owners.json'), 'utf8'));

const unmintedWallet = "terra1qxa5rfln6qk4nmucwa52z0dfju0hde64d5r72t";
const randomEarthCustody = "terra1eek0ymmhyzja60830xhzm7k7jkrk99a60q2z2t";
const knowhereCustody = "terra12v8vrgntasf37xpj282szqpdyad7dgmkgnq60j";
const terranautsWallet = "terra19jp3up9mke3lt8eg0c8fsaysqtzs6vn23lauls";

const marketCustodyWallets = [
    unmintedWallet,
    randomEarthCustody,
    knowhereCustody,
    terranautsWallet,
];

type Recipient = {
    addr: string;
    amount: string;
};

(async function main() {
    const terra = getLcd(process.env.NETWORK!);
    console.log("created LCD client for", process.env.NETWORK);

    const deployer = getWallet(terra);
    console.log("deployer address:", deployer.key.accAddress);

    // const randomEarthContractBalance = await getRandomEarthBalance(terra);
    const rewardsContractBalance = new Coin('uluna', await getRewardContractBalance(terra));

    // console.log(owners);

    const ownersMap: [string, string][] = Object.entries(owners);

    const unminted = ownersMap.filter((entry) => entry[1] == unmintedWallet);
    const randomEarth = ownersMap.filter((entry) => entry[1] == randomEarthCustody);
    const knowhere = ownersMap.filter((entry) => entry[1] == knowhereCustody);
    const terranauts = ownersMap.filter((entry) => entry[1] == terranautsWallet);

    const filtered: [string, string][] = ownersMap.filter((entry) => !marketCustodyWallets.includes(entry[1]));

    console.log(`Un minted: ${unminted.length}`);
    console.log(`Terranauts: ${terranauts.length}`);
    console.log(`Listed on RandomEarth: ${randomEarth.length}`);
    console.log(`Listed on Knowhere: ${knowhere.length}`);
    console.log(`Eligible: ${filtered.length}`);

    assert((unminted.length + randomEarth.length + knowhere.length + filtered.length + terranauts.length) == 8620);

    const lunaPerNft = rewardsContractBalance.div(filtered.length);
    console.log(`Luna per NFT: ${(+lunaPerNft.amount.toString() / 1000000) .toString()}`);

    const byCount: [string, number][] = Object.entries(_.countBy(filtered, (it) => it[1] as string));

    let total = new Coin('uluna', 0);
    byCount.forEach(it => {
        total = total.add(lunaPerNft.mul(it[1]))
    });

    console.log(`addresses: ${byCount.length}`);

    console.log(`total: ${rewardsContractBalance}, summed: ${total}`);

    const recipients: Recipient[] = [];
    byCount.forEach(element => {
        recipients.push({
            "addr": element[0],
            // @ts-ignore
            "amount": `${lunaPerNft.mul(element[1]).amount}`,
        })
    });

    // return;


    const messages = chunk(recipients, 30).map((m) => {
        return new MsgExecuteContract(deployer.key.accAddress, process.env.ROYALTY_CONTRACT_ADDRESS!, {
            distribute: {
                recipients: m,
            },
        });
    });

    console.log(chalk.green(`Distribution rewards to ${recipients.length} addresses with  ${deployer.key.accAddress}`))
    await sendTransaction(terra, deployer, messages);

    console.log(chalk.green("Done!"), `${chalk.blue("Rewards Distributed")}`);
})();
