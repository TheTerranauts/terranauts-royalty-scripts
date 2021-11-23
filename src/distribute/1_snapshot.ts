import axios from "axios";
import * as fs from "fs";
import {Retryable} from "typescript-retry-decorator";
import {chunk} from "../utils/utils";
import _ from "lodash";

const START_ID = 1;
const END_ID = parseInt(process.env.NFT_COUNT || '');
const IDS_PER_QUERY = 500;

const randomEarthCustody = "terra1eek0ymmhyzja60830xhzm7k7jkrk99a60q2z2t";

type MantleResponse = {
    data: {
        [key: string]: {
            Result: string;
        };
    };
};

type OwnerOfResponse = {
    owner: string;
    approvals: object[];
};

function generateQuery(id: number) {
    return `  
    id_${id}: WasmContractsContractAddressStore(
      ContractAddress: "${process.env.NFT_CONTRACT_ADDRESS}",
      QueryMsg: "{\\"owner_of\\":{\\"token_id\\":\\"${id}\\"}}"
    ) { 
      Result 
    }
  `;
}

function generateRandomEarthQuery(id: string): string {
    return `  
    id_${id}: WasmContractsContractAddressStore(
      ContractAddress: "${randomEarthCustody}",
      QueryMsg: "{\\"nft_owner\\": {\\"asset_info\\": {\\"nft\\": {\\"contract_addr\\": \\"${process.env.NFT_CONTRACT_ADDRESS}\\",\\"token_id\\": \\"${id}\\"}}}}"
    ) { 
      Result 
    }
  `;
}


function generateQueries(start: number, end: number) {
    let queries: string[] = [];
    for (let id = start; id <= end; id++) {
        queries.push(generateQuery(id));
    }
    return `
    query {
      ${queries.join("\n")}
    }
  `;
}

async function fetchOwners() {
    let owners: Map<number, string> = new Map();
    let start = START_ID;
    let end = start + IDS_PER_QUERY;

    while (start < end) {
        const tokenOwners = await Fetcher.queryOwners(start, end);
        owners = {...owners, ...tokenOwners};

        start = end;
        end += IDS_PER_QUERY;
        if (end > END_ID) end = END_ID;
    }

    let randomEarthOwners: Map<number, string> = await fetchRandomEarthOwners(owners);
    let knowhereOwners: Map<number, string> = await fetchKnowhereOwners();

    return _.merge(owners, randomEarthOwners, knowhereOwners);
}

async function fetchRandomEarthOwners(owners: Map<number, string>): Promise<Map<number, string>> {
    let randomEarthOwners: Map<number, string> = new Map();
    let reQueries: Array<string> = [];
    for (const [key, value] of Object.entries(owners)) {
        if (value == randomEarthCustody) {
            reQueries.push(generateRandomEarthQuery(key))
        }
    }

    const chunkedQueries: string[] = chunk(reQueries, IDS_PER_QUERY).map((queries) => {
        return `
    query {
      ${queries.join("\n")}
    }
  `;
    });

    for (const querySet of chunkedQueries) {
        const reOwners = await Fetcher.queryRandomEarthOwners(querySet);
        randomEarthOwners = {...randomEarthOwners, ...reOwners};
    }
    return randomEarthOwners;
}

async function fetchKnowhereOwners(): Promise<Map<number, string>> {
    let knowhereListings: Array<any> = [];

    let fetchedAllKnowhere = false;

    while (!fetchedAllKnowhere) {
        console.log(`Fetching knowhere with offset: ${knowhereListings.length}`);

        let body = {
            "limit": 500,
            "offset": knowhereListings.length,
            "nftContracts": [
                `${process.env.NFT_CONTRACT_ADDRESS}`
            ],
            "status": [
                "NotStarted",
                "InProgress",
                "BuyNow"
            ],
            "saleTypes": [
                "buy-now",
                "auction"
            ]
        };
        let response = await axios.post('https://prod-backend-mainnet.knowhere.art/sales/explore', body);
        knowhereListings.push(...response.data);
        if (response.data.length == 0) {
            fetchedAllKnowhere = true;
        }
    }

    let knowhereOwners: Map<number, string> = new Map();
    (knowhereListings as Array<any>).forEach((data) => {
        knowhereOwners[data.tokenId] = data.seller;
    });

    return knowhereOwners;
}


class Fetcher {
    @Retryable({maxAttempts: 3})
    static async queryOwners(start: number, end: number): Promise<{ [key: number]: string }> {
        let owners: { [key: number]: string } = {};

        process.stdout.write(`querying owners of id ${start} to ${end}... `);
        const response: { data: MantleResponse } = await axios.post("https://mantle.terra.dev/", {
            query: generateQueries(start, end),
        });
        console.log("success!");
        console.log(response.data);

        for (const [key, value] of Object.entries(response.data.data)) {
            const id = parseInt(key.slice(3));
            const ownerOfResponse: OwnerOfResponse = JSON.parse(value.Result);
            owners[id] = ownerOfResponse.owner;
        }

        return owners;
    }

    @Retryable({maxAttempts: 3})
    static async queryRandomEarthOwners(queries: string): Promise<{ [key: number]: string }> {
        let owners: { [key: number]: string } = {};

        const response: { data: MantleResponse } = await axios.post("https://mantle.terra.dev/", {
            query: queries,
        });
        console.log("success!");
        console.log(response.data);

        for (const [key, value] of Object.entries(response.data.data)) {
            const id = parseInt(key.slice(3));
            const ownerOfResponse: string = JSON.parse(value.Result);
            owners[id] = ownerOfResponse;
        }

        return owners;
    }
}

(async function () {
    // await fetchMintedTokens();
    const owners = await fetchOwners();
    fs.writeFileSync("./owners.json", JSON.stringify(owners, null, 2));
})();