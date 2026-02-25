# How to Verify the On-Chain Data

All figures in the governance proposal were extracted directly from the Fraxtal blockchain. You can independently verify every number.

## Prerequisites

```bash
npm install ethers@6
```

## Run the Extraction

```bash
node data/extract_pool_data.js
```

This connects to the public Fraxtal RPC (`https://rpc.frax.com`, chain ID 252) and queries the lending pool contracts directly. No API keys or authentication required.

## What It Checks

The script queries:

1. **Controller** (`0xBF55Bb9463bBbB6aD724061910a450939E248eA6`): Total debt, number of loans, individual borrower positions
2. **Vault** (`0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e`): Total supplied, price per share, admin fees
3. **AMM/LLAMMA** (`0x8fecf70b90ed40512c0608565eb9a53af0ef42ad`): Residual crvUSD in bands, oracle price
4. **MonetaryPolicy** (`0x5607772d573E09F69FDfC292b23B8E99918be0A3`): Current borrow rate

## Expected Output

Compare your results with `data/pool_data.json`. Note that debt amounts will be slightly higher than the snapshot values due to continuous interest accrual at 34.99% APY (~$0.13/hour on the full pool).

## Samuel McCulloch's Wallets

- Wallet 1: `0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922`
- Wallet 2: `0xb53009E4dC25a494F3Bee03Ab121517e74b59F75`

You can verify these on Fraxscan:
- https://fraxscan.com/address/0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922
- https://fraxscan.com/address/0xb53009E4dC25a494F3Bee03Ab121517e74b59F75
