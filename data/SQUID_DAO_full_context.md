# SQUID DAO — Complete Research Context for On-Chain Data Extraction

## PURPOSE
This document contains the full context from a research session analyzing SQUID DAO's Llama Lend bad debt situation on Fraxtal. The goal is to use Claude Code CLI to execute on-chain queries (via `cast` / Foundry or ethers.js) against the Fraxtal RPC to extract exact borrower positions, debt amounts, health factors, and pool state — then use that data to update a governance proposal document.

---

## CRITICAL TASK: What We Need From On-Chain

### Primary Data to Extract
1. **Total outstanding debt** in crvUSD (call `total_debt()` on Controller)
2. **Every individual borrower wallet address** (iterate `loans(i)` for i in 0..`n_loans()`)
3. **Exact debt per borrower** (call `debt(address)` for each)
4. **Health factor per borrower** (call `health(address)` for each — negative = bad debt)
5. **Collateral state per borrower** (call `user_state(address)` → returns [collateral, stablecoin, debt, N])
6. **Total crvUSD supplied by lenders** (call `totalAssets()` on Vault)
7. **Current utilization rate** (total_debt / totalAssets)
8. **Current borrow rate / APY** (call `rate()` on MonetaryPolicy contract)
9. **Bad debt amount** (positions where health < 0, debt exceeds collateral value)
10. **Historical borrow events** if possible (filter `Borrow` event logs on Controller)

### Secondary Data
- Current SQUID price from the AMM or DEX pool
- Auction contract revenue (check transaction history on auction contracts)
- Lender positions if accessible

---

## VERIFIED CONTRACT ADDRESSES (Fraxtal Chain ID: 252)

| Role | Address | Status |
|------|---------|--------|
| **Vault (ERC-4626)** | `0xBF55Bb9463bBbB6aD724061910a450939E248eA6` | Confirmed |
| **AMM / LLAMMA** | `0xae87e2bb252f7a5b855d64bfcdfed07d7bf07bcc` | Confirmed (GeckoTerminal) |
| **Controller** | Unknown — get via `vault.controller()` | MUST QUERY |
| **MonetaryPolicy** | Unknown — get via `controller.monetary_policy()` | MUST QUERY |
| **OneWayLendingFactory** | `0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66` | Confirmed (DeFi Llama) |
| **SQUID Token** | `0x6e58089d8e8f664823d26454f49a5a0f2ff697fe` | Confirmed |
| **SQUID/wfrxETH Pool** | `0x277fa53c8a53c880e0625c92c92a62a9f60f3f04` | Confirmed |
| **Auction v1 (Fraxtal)** | `0x141C1C16237439c645033586f0CB85A271f0016F` | Confirmed |
| **Auction v2 (Fraxtal)** | `0xd184CF2f60Da3C54eD1fc371a3e04179C41570c6` | Confirmed |
| **Auction (Ethereum)** | `0xfF737F349e40418Abd9D7b3c865683f93cA3c890` | Confirmed |

### RPC Endpoint
- **Fraxtal RPC**: `https://rpc.frax.com` (public, free, chain ID 252)
- **Alternative**: `https://rpc.frax.com` or check https://docs.frax.com/fraxtal for others

---

## EXACT COMMANDS TO RUN (Foundry/Cast)

```bash
# Step 1: Get Controller address from Vault
cast call 0xBF55Bb9463bBbB6aD724061910a450939E248eA6 "controller()(address)" --rpc-url https://rpc.frax.com

# Step 2: Get AMM address (should match 0xae87e2...)
cast call 0xBF55Bb9463bBbB6aD724061910a450939E248eA6 "amm()(address)" --rpc-url https://rpc.frax.com

# Step 3: Total debt
cast call $CONTROLLER "total_debt()(uint256)" --rpc-url https://rpc.frax.com
# Divide result by 1e18 to get crvUSD amount

# Step 4: Number of active loans
cast call $CONTROLLER "n_loans()(uint256)" --rpc-url https://rpc.frax.com

# Step 5: Get each borrower address
cast call $CONTROLLER "loans(uint256)(address)" 0 --rpc-url https://rpc.frax.com
cast call $CONTROLLER "loans(uint256)(address)" 1 --rpc-url https://rpc.frax.com
# ... iterate up to n_loans - 1

# Step 6: For EACH borrower, get their position data
cast call $CONTROLLER "debt(address)(uint256)" $BORROWER_ADDRESS --rpc-url https://rpc.frax.com
cast call $CONTROLLER "health(address)(int256)" $BORROWER_ADDRESS --rpc-url https://rpc.frax.com
cast call $CONTROLLER "user_state(address)(uint256[4])" $BORROWER_ADDRESS --rpc-url https://rpc.frax.com
# user_state returns: [collateral_amount, stablecoin_amount, debt, N_bands]

# Step 7: Total supplied by lenders
cast call 0xBF55Bb9463bBbB6aD724061910a450939E248eA6 "totalAssets()(uint256)" --rpc-url https://rpc.frax.com

# Step 8: Current interest rate
cast call $CONTROLLER "monetary_policy()(address)" --rpc-url https://rpc.frax.com
cast call $MONETARY_POLICY "rate()(uint256)" --rpc-url https://rpc.frax.com
# rate() returns per-second rate. APY = (1 + rate/1e18)^31536000 - 1

# Step 9: Check admin fees (indicator of collected fees / bad debt handling)
cast call $CONTROLLER "admin_fees()(uint256)" --rpc-url https://rpc.frax.com
```

### Alternative: JavaScript with ethers.js
```javascript
const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://rpc.frax.com');

const VAULT = '0xBF55Bb9463bBbB6aD724061910a450939E248eA6';

// Minimal ABIs
const vaultAbi = [
  'function controller() view returns (address)',
  'function amm() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

const controllerAbi = [
  'function total_debt() view returns (uint256)',
  'function n_loans() view returns (uint256)',
  'function loans(uint256) view returns (address)',
  'function debt(address) view returns (uint256)',
  'function health(address) view returns (int256)',
  'function user_state(address) view returns (uint256[4])',
  'function monetary_policy() view returns (address)',
  'function admin_fees() view returns (uint256)',
];

const mpAbi = [
  'function rate() view returns (uint256)',
];

async function main() {
  const vault = new ethers.Contract(VAULT, vaultAbi, provider);
  
  const controllerAddr = await vault.controller();
  const ammAddr = await vault.amm();
  const totalAssets = await vault.totalAssets();
  
  console.log('Controller:', controllerAddr);
  console.log('AMM:', ammAddr);
  console.log('Total Assets (supplied):', ethers.formatUnits(totalAssets, 18), 'crvUSD');
  
  const controller = new ethers.Contract(controllerAddr, controllerAbi, provider);
  
  const totalDebt = await controller.total_debt();
  const nLoans = await controller.n_loans();
  
  console.log('\nTotal Debt:', ethers.formatUnits(totalDebt, 18), 'crvUSD');
  console.log('Number of Loans:', nLoans.toString());
  console.log('Utilization:', (Number(totalDebt) / Number(totalAssets) * 100).toFixed(2), '%');
  
  // Get monetary policy rate
  const mpAddr = await controller.monetary_policy();
  const mp = new ethers.Contract(mpAddr, mpAbi, provider);
  const rate = await mp.rate();
  const ratePerSec = Number(rate) / 1e18;
  const apy = (Math.pow(1 + ratePerSec, 31536000) - 1) * 100;
  console.log('\nBorrow APY:', apy.toFixed(2), '%');
  
  // Enumerate all borrowers
  console.log('\n=== BORROWER POSITIONS ===');
  for (let i = 0; i < Number(nLoans); i++) {
    const borrower = await controller.loans(i);
    const debt = await controller.debt(borrower);
    const health = await controller.health(borrower);
    const state = await controller.user_state(borrower);
    
    console.log(`\nBorrower #${i}: ${borrower}`);
    console.log(`  Debt: ${ethers.formatUnits(debt, 18)} crvUSD`);
    console.log(`  Health: ${ethers.formatUnits(health, 18)}`);
    console.log(`  Collateral (SQUID): ${ethers.formatUnits(state[0], 18)}`);
    console.log(`  Stablecoin in bands: ${ethers.formatUnits(state[1], 18)}`);
    console.log(`  Debt (from state): ${ethers.formatUnits(state[2], 18)}`);
    console.log(`  N bands: ${state[3].toString()}`);
    console.log(`  Bad debt: ${Number(health) < 0 ? 'YES' : 'No'}`);
  }
  
  // Admin fees
  try {
    const adminFees = await controller.admin_fees();
    console.log('\nAdmin Fees:', ethers.formatUnits(adminFees, 18), 'crvUSD');
  } catch(e) {
    console.log('\nAdmin fees call failed:', e.message);
  }
}

main().catch(console.error);
```

---

## BACKGROUND CONTEXT: What We Already Know

### The Situation
- SQUID DAO has a Llama Lend (Curve Lending) pool on Fraxtal — **one-way-market-4**
- SQUID is collateral, crvUSD is the borrowable asset
- Approximately **~$80,000 in bad debt** is reported (needs on-chain verification)
- **A single borrower (Samuel McCulloch)** reportedly holds **$70,000+** of the total debt
- Samuel was a former front-facing contributor to Leviathan News
- The actual builder/owner of the infrastructure is **Gerrit Hall** (CurveCap on Twitter, zcor on GitHub)
- The DAO wants to create a governance proposal that includes exact numbers

### How The Bad Debt Happened
- Samuel deposited SQUID as collateral and borrowed crvUSD
- SQUID price dropped ~96% from ATH ($0.043) to current (~$0.0015-$0.0027)
- The LLAMMA soft-liquidation couldn't fully cover the debt due to thin liquidity
- Samuel kept the borrowed crvUSD; his collateral lost most of its value
- Under Curve Lending mechanics: the borrower owes the debt, losses fall on lenders

### Historical Pool Data (from Curve News weekly reports)
- **March 2025 (W11)**: 137-139% APY, $43K supplied — ranked #1
- **May 2025 (W19)**: 38.6% APY — ranked #1
- **June 2025 (W25)**: 24.9% APY — ranked #3
- After June 2025: pool disappeared from reports (likely due to the "lending market events")

### Auction Revenue (known)
- Fraxtal Dec 2025: 124,420 SQUID proceeds (~$200-$320)
- Ethereum mainnet: ~0.075 ETH total across 9 auctions (~$210)
- Revenue is extremely small relative to the ~$80K debt

### Token Data
- SQUID price: ~$0.0015 (CoinGecko) to ~$0.0027 (LBank)
- Market cap: ~$37,800-$89,700
- Total supply: 35,000,000 SQUID
- Holders: 616
- Monthly emissions: 1,000,000 SQUID

---

## WHAT TO DO WITH THE DATA

Once you have the on-chain numbers, the data needs to go into a governance proposal document. The proposal structure is:

1. **Exact debt composition table** — every borrower wallet, their exact debt in crvUSD, health factor, collateral remaining, and whether the position constitutes bad debt
2. **Pool state summary** — total debt, total supplied, utilization, current APY
3. **Samuel McCulloch's specific position** — his wallet address, exact debt, health, collateral
4. **Revenue vs. debt comparison** — showing how long it would take to repay at current revenue rates
5. **The proposal itself** — a three-phase approach:
   - Phase 1: Formal engagement with Samuel requesting repayment (30-day window)
   - Phase 2: Conditional DAO revenue allocation (depends on Samuel's response)
   - Phase 3: Ongoing transparency dashboard

### Key Principle
The DAO should not subsidize an individual borrower's failed leveraged position with community revenue until all reasonable avenues for direct recovery have been exhausted.

---

## ADDITIONAL USEFUL QUERIES

### Check CurveMonitor API (if accessible)
```bash
curl https://prices.curve.fi/v1/lending/markets/fraxtal/0xBF55Bb9463bBbB6aD724061910a450939E248eA6
curl https://prices.curve.fi/v1/lending/markets/fraxtal/0xBF55Bb9463bBbB6aD724061910a450939E248eA6/loans
```

### Check Auction Contract Revenue
```bash
# Get total auction count on Fraxtal v2
cast call 0xd184CF2f60Da3C54eD1fc371a3e04179C41570c6 "auctionCount()(uint256)" --rpc-url https://rpc.frax.com

# Get ETH/token balance of auction contracts to verify revenue
cast balance 0xd184CF2f60Da3C54eD1fc371a3e04179C41570c6 --rpc-url https://rpc.frax.com
```

### Fraxscan Block Explorer
- Vault: https://fraxscan.com/address/0xBF55Bb9463bBbB6aD724061910a450939E248eA6
- Use the "Read Contract" tab to call functions interactively

### CurveMonitor (browser)
- https://curvemonitor.com/platform/lending/fraxtal/0xBF55Bb9463bBbB6aD724061910a450939E248eA6/users
- This shows the full borrower table — screenshot it for the proposal appendix

---

## OUTPUT FORMAT

Please output the results as a structured JSON or markdown table that can be directly inserted into the governance proposal. Include:

```json
{
  "pool_state": {
    "total_debt_crvusd": "exact number",
    "total_supplied_crvusd": "exact number",
    "utilization_pct": "exact number",
    "borrow_apy_pct": "exact number",
    "n_loans": "exact number"
  },
  "borrowers": [
    {
      "address": "0x...",
      "debt_crvusd": "exact number",
      "health": "exact number",
      "collateral_squid": "exact number",
      "stablecoin_in_bands": "exact number",
      "n_bands": "number",
      "is_bad_debt": true/false,
      "is_samuel": true/false
    }
  ],
  "contract_addresses": {
    "vault": "0x...",
    "controller": "0x...",
    "amm": "0x...",
    "monetary_policy": "0x..."
  }
}
```
