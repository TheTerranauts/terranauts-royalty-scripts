import * as fs from "fs";
import * as path from "path";
import {
  isTxError,
  LCDClient,
  LocalTerra,
  MnemonicKey,
  Msg,
  MsgInstantiateContract,
  MsgStoreCode,
  Wallet,
} from "@terra-money/terra.js";
import axios from "axios";
import chalk from "chalk";
import dotenv from "dotenv";

/**
 * @notice Encode a JSON object to base64 binary
 */
export function toEncodedBinary(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const LOCALTERRA_DEFAULT_GAS_PRICES =
  "0.01133uluna,0.15uusd,0.104938usdr,169.77ukrw,428.571umnt,0.125ueur,0.98ucny,16.37ujpy,0.11ugbp,10.88uinr,0.19ucad,0.14uchf,0.19uaud,0.2usgd,4.62uthb,1.25usek";

export enum Network {
  Mainnet,
  Testnet,
  LocalTerra,
}

/**
 * Parse a string {mainnet|testnet|localterra} into `Network` type
 */
function parseNetworkStr(network: string) {
  console.log(`Using network ${network}`);

  if (!["mainnet", "testnet", "localterra"].includes(network)) {
    throw new Error(`invalid network! must be {mainnet|testnet|localterra}, but network was ${network}`);
  }
  return network === "mainnet"
    ? Network.Mainnet
    : network === "testnet"
    ? Network.Testnet
    : Network.LocalTerra;
}

/**
 * Fetch a network's minimum gas prices
 */
export async function getGasPrice(denom = "uusd", network = Network.Mainnet) {
  // for localterra, we use the default minumum gas price
  if (network == Network.LocalTerra) {
    const gasPrice = LOCALTERRA_DEFAULT_GAS_PRICES.split(",").find((price) => {
      return price.endsWith(denom);
    });
    if (!gasPrice) {
      throw new Error(chalk.red("Invalid denom:") + denom);
    }
    // trim off the denom from the end of gasPrice
    const gasPriceValue = gasPrice.substring(0, gasPrice.indexOf(denom));
    return parseFloat(gasPriceValue);
  }

  // for mainnet and testnet, we fetch TFL-recommended gas price from FCD
  // validators don't necessarily use these prices, but let's just assume they do
  const url =
    network == Network.Mainnet
      ? "https://fcd.terra.dev/v1/txs/gas_prices"
      : "https://bombay-fcd.terra.dev/v1/txs/gas_prices";

  type fees = { [key: string]: string };
  const response: { data: fees } = await axios.get(url);
  return parseFloat(response.data[denom]);
}

/**
 * Return an `LCDClient` object based on selected network
 */
export function getLcd(networkStr: string) {
  const network = parseNetworkStr(networkStr);
  return network == Network.Mainnet
    ? new LCDClient({
        chainID: "columbus-5",
        URL: "https://lcd.terra.dev",
      })
    : network == Network.Testnet
    ? new LCDClient({
        chainID: "bombay-12",
        URL: "https://bombay-lcd.terra.dev",
      })
    : new LocalTerra();
}

/**
 * Return a `Wallet` object generated by mnemonic phrase stored in `.env` file
 */
export function getWallet(terra: LCDClient) {
  dotenv.config();
  if (!process.env.MNEMONIC) {
    throw new Error("mnemonic phrase not provided!");
  }
  return terra.wallet(new MnemonicKey({mnemonic: new Buffer(process.env.MNEMONIC, 'base64').toString('ascii')}));
}

/**
 * Sign and broadcast a transaction; throws error if transaction fails
 */
export async function sendTransaction(terra: LCDClient, sender: Wallet, msgs: Msg[]) {
  const feeDenom = "uusd";
  const gasPrice = await getGasPrice(feeDenom);
  const tx = await sender.createAndSignTx({
    msgs,
    gasPrices: `${gasPrice}${feeDenom}`,
    gasAdjustment: 1.4,
  });
  const result = await terra.tx.broadcast(tx);

  if (isTxError(result)) {
    throw new Error(
      chalk.red("Transaction failed!") +
        `\n${chalk.yellow("code")}: ${result.code}` +
        `\n${chalk.yellow("codespace")}: ${result.codespace}` +
        `\n${chalk.yellow("raw_log")}: ${result.raw_log}`
    );
  }

  return result;
}

/**
 * Update WASM code to the blockchain; returns code ID
 */
export async function storeCode(terra: LCDClient, deployer: Wallet, codePath: string) {
  const fullCodePath = path.join(__dirname, codePath);
  const code = fs.readFileSync(fullCodePath).toString("base64");
  const msg = new MsgStoreCode(deployer.key.accAddress, code);
  const result = await sendTransaction(terra, deployer, [msg]);
  const codeId = parseInt(result.logs[0].eventsByType.store_code.code_id[0]);
  return codeId;
}

/**
 * Instantiate a contract; returns contract address
 */
export async function instantiateContract(
  terra: LCDClient,
  deployer: Wallet,
  codeId: number,
  instantiateMsg: object
) {
  const msg = new MsgInstantiateContract(
    deployer.key.accAddress,
    deployer.key.accAddress,
    codeId,
    instantiateMsg
  );
  const result = await sendTransaction(terra, deployer, [msg]);
  const contractAddress = result.logs[0].eventsByType.instantiate_contract.contract_address[0];
  return contractAddress;
}

/**
 * @notice Return the native token balance of the specified account
 */
export async function queryNativeTokenBalance(
    terra: LocalTerra | LCDClient,
    account: string,
    denom: string = "uusd"
) {
  const balance = (await terra.bank.balance(account))[0].get(denom)?.amount.toString();
  if (balance) {
    return balance;
  } else {
    return "0";
  }
}


/**
 * Sleep for a specified amount of time (in milliseconds)
 */
export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Parse a date string to UNIX timestamp (in seconds)
 */
export function dateStringToTimestamp(dateStr: string) {
  return Math.floor(Date.parse(dateStr) / 1000); // Date.parse returns milliseconds
}

/**
 * Encodes an object to base64 string
 */
export function encodeBase64(obj: object) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

/**
 * Decodes a base54 string to object
 */
export function decodeBase64(base64: string) {
  return JSON.parse(Buffer.from(base64, "base64").toString());
}

/**
 * Encodes a u8 array into base64 string
 */
export function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Decodes a base64 string to u8 array
 */
export function base64ToBytes(base64: string) {
  return new Uint8Array(Buffer.from(base64, "base64"));
}
