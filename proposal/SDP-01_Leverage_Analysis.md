# SDP-01 Addendum: On-Chain Leverage & Price Inflation Analysis

**Date:** February 28, 2026
**Author:** SQUID DAO Contributors (Zero)
**Data Source:** Fraxtal blockchain (chain ID 252, `rpc.frax.com`)
**Verification:** All transaction hashes and block numbers are provided. Any community member can independently verify every claim by querying the public RPC.

---

## Executive Summary

An on-chain investigation of all 55 Borrow events on the SQUID/crvUSD LlamaLend controller (`0xBF55Bb9463bBbB6aD724061910a450939E248eA6`) reveals the following:

1. **Samuel McCulloch used LlamaLend's built-in leverage feature** (`create_loan_extended` / `borrow_more_extended`) in **10 out of 23** borrow transactions across two wallets.
2. **The leverage buying inflated SQUID's oracle price 19x** — from $0.00218 to $0.04110 — between March 2 and May 13, 2025.
3. **During the inflated-price window, Sam extracted $54,629 in "naked borrows"** (0 new SQUID collateral deposited, purely drawing down against inflated existing collateral value).
4. **Sam opened a second wallet while the first was still active**, splitting risk across positions.
5. **Sam self-liquidated Wallet 2 on June 6, 2025, then continued borrowing on the same wallet 16 days later.**
6. **8 out of 15 total borrowers used leverage**, but Sam was by far the largest user.

---

## 1. How LlamaLend Leverage Works

Curve's LlamaLend controller exposes two sets of loan functions:

| Function | Selector | Behavior |
|----------|----------|----------|
| `create_loan` | `0x23cfed03` | Standard: deposit SQUID, receive crvUSD |
| `create_loan_extended` | `0x4ba96d46` | **Leverage:** deposit SQUID + atomically swap borrowed crvUSD for more SQUID collateral via DEX callback |
| `borrow_more` | `0xdd171e7c` | Standard: borrow more crvUSD against existing position |
| `borrow_more_extended` | `0x24977ef3` | **Leverage:** borrow more crvUSD + atomically swap for more SQUID collateral via DEX callback |
| `add_collateral` | `0x24049e57` | Deposit additional collateral without borrowing |

The extended (leverage) functions route through DEX pools in a single atomic transaction, generating 20–113 event logs (vs. 6–7 for standard). This is the distinguishing on-chain fingerprint.

---

## 2. SQUID Price Trajectory During Sam's Leverage Period

The LLAMMA oracle price (`price_oracle()`) was queried at each key block:

| Date | Block | Event | Oracle Price (crvUSD/SQUID) | vs. Base ($0.00355) |
|------|-------|-------|-----------------------------|---------------------|
| Sept 2024 | — | Pool deployed | $0.00355 (base_price) | 1.0x |
| Oct 31, 2024 | ~11,800,000 | Sam W1 initial standard loan (+472 crvUSD) | $0.003665 | 1.03x |
| **Mar 2, 2025** | **17,035,533** | **Sam W1 leverage starts (+3,060 crvUSD)** | **$0.002176** | **0.61x** |
| **Mar 12, 2025** | **17,491,734** | **Sam W1 leverage borrow (+13,736 crvUSD)** | **$0.012891** | **3.63x** |
| Apr 21, 2025 | 19,195,835 | Sam opens Wallet 2 via leverage (+2,388 crvUSD) | $0.015855 | 4.46x |
| **May 13, 2025** | **20,175,041** | **Sam W1 naked borrow +22,000 crvUSD** | **$0.041096** | **11.57x** |
| **May 27, 2025** | **20,777,303** | **Sam W1 naked borrow +21,500 crvUSD** | **$0.036946** | **10.40x** |
| Jun 6, 2025 | 21,181,152 | Sam W2 self-liquidation | $0.026298 | 7.40x |
| Jun 22, 2025 | 21,912,880 | Price crash (post-collapse) | $0.000940 | 0.26x |
| Jul 22, 2025 | 23,194,542 | Sam W2 last borrow (+1,800 crvUSD) | $0.016647 | 4.69x |
| Feb 2026 | current | Current state | $0.001933 | 0.54x |

**Critical observation:** Between March 2 and March 12, Sam executed 4 leverage transactions on Wallet 1 that bought approximately 6.9M SQUID on the open market through DEX routing. The oracle price rose **5.9x in 10 days** (from $0.00218 to $0.01289).

By May, with continued leverage activity across both wallets, the oracle reached $0.041 — **an 18.9x increase from March 2** — at which point Sam extracted his two largest naked borrows ($22,000 and $21,500).

---

## 3. Sam's Complete Borrowing Timeline

### Wallet 1: `0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922`

| Date | Type | SQUID Added | crvUSD Borrowed | Tx Hash |
|------|------|-------------|-----------------|---------|
| Oct 31, 2024 | STANDARD | 1,700,844 | 472.80 | `0x9a0df569...` |
| Jan 5, 2025 | REPAID | -1,700,844 | -498.67 | *(closed initial position)* |
| **Mar 2, 2025** | **LEVERAGE** | **5,271,769** | **3,060.40** | `0x149d209d...` |
| **Mar 2, 2025** | **LEVERAGE** | **622,183** | **1,990.57** | `0x343530694...` |
| Mar 2, 2025 | ADD_COLL | 25,045 | 0 | `0x4dd4303f...` |
| **Mar 10, 2025** | **LEVERAGE** | **464,282** | **3,911.46** | `0xb950c476...` |
| **Mar 12, 2025** | **LEVERAGE** | **575,441** | **13,736.15** | `0xde52429b...` |
| Mar 19, 2025 | STANDARD | 0 | 2,200.00 | `0xf034329b...` |
| Apr 7, 2025 | REPAID | 0 | -4,562.76 | *(partial repay)* |
| **Apr 7, 2025** | **LEVERAGE** | **351,450** | **5,000.00** | `0xf8eaab88...` |
| Apr 17, 2025 | **NAKED** | **0** | **4,080.00** | `0xfaa7d3f7...` |
| **May 13, 2025** | **NAKED** | **0** | **22,000.00** | `0x54124ca7...` |
| May 27, 2025 | ADD_COLL | 148,075 | 0 | `0x46c367f7...` |
| **May 27, 2025** | **NAKED** | **0** | **21,500.00** | `0x5eac2f3f...` |
| May 27, 2025 | REPAID | 0 | -4,002.80 | *(partial repay)* |
| Jun 1, 2025 | ADD_COLL | 300,152 | 0 | `0x8c630492...` |

**Wallet 1 totals:** 77,951 crvUSD gross borrowed, 9,459,243 SQUID collateral deposited.

### Wallet 2: `0xb53009E4dC25a494F3Bee03Ab121517e74b59F75`

| Date | Type | SQUID Added | crvUSD Borrowed | Tx Hash |
|------|------|-------------|-----------------|---------|
| **Apr 21, 2025** | **LEVERAGE** | **232,140** | **2,388.37** | `0xb1dd4d64...` |
| Apr 25, 2025 | REPAID | 0 | -41.72 | *(minimal repay)* |
| Apr 25, 2025 | **NAKED** | **0** | **1,122.00** | `0x26c50e46...` |
| **Apr 27, 2025** | **LEVERAGE** | **70,247** | **1,961.98** | `0xd43719a5...` |
| Apr 28, 2025 | REPAID | 0 | -1,122.05 | *(repay)* |
| May 8, 2025 | **NAKED** | **0** | **2,242.13** | `0x5b86e9ef...` |
| May 9, 2025 | **NAKED** | **0** | **984.72** | `0x61b263aa...` |
| May 22, 2025 | **NAKED** | **0** | **500.00** | `0xa8a4b224...` |
| Jun 1, 2025 | REPAID | 0 | -409.45 | *(partial repay)* |
| **Jun 6, 2025** | **SELF-LIQUIDATED** | — | **-7,700.02** | *(liquidator = same address)* |
| **Jun 22, 2025** | **LEVERAGE** | **48,913** | **10.00** | `0xd9f9ca27...` |
| **Jun 23, 2025** | **LEVERAGE** | **47,704** | **68.46** | `0xe1622239...` |
| **Jun 25, 2025** | **LEVERAGE** | **11,229** | **100.00** | `0xf52a8015...` |
| Jul 22, 2025 | STANDARD | 266,270 | 1,800.00 | `0xb318fe6b...` |

**Wallet 2 totals:** 11,178 crvUSD gross borrowed, 676,503 SQUID collateral deposited.

**Combined Sam totals:**
- **Gross borrowed: 89,129 crvUSD** across 23 transactions
- **Via leverage: 32,227 crvUSD** (10 transactions, 36.2%)
- **Naked borrows (0 collateral): 54,629 crvUSD** (8 transactions, 61.3%)
- **Outstanding debt: 83,817 crvUSD** (64% of total pool)

---

## 4. The Self-Liquidation

On **June 6, 2025** (block 21,181,152), Wallet 2 was liquidated. The on-chain `Liquidate` event shows:

- **Liquidator:** `0xb53009E4dC25a494F3Bee03Ab121517e74b59F75`
- **Borrower:** `0xb53009E4dC25a494F3Bee03Ab121517e74b59F75`
- **Same address.** Sam liquidated himself.
- Debt cleared: 7,700 crvUSD
- Collateral received: 21,385 SQUID + 8,916 crvUSD in stablecoins

**16 days later** (June 22), Sam opened **new positions on the same Wallet 2** using leverage, and continued borrowing through July 22. This demonstrates he was aware his position was underwater and chose to re-enter the market rather than repay.

---

## 5. Leverage Usage Across All Borrowers

| Borrower | Leverage Events | Leverage crvUSD | Total crvUSD | Leverage % |
|----------|----------------|-----------------|--------------|------------|
| Sam W1 (`0x81f9...`) | 5 | 27,699 | 77,951 | 35.5% |
| `0xccBF601e...` | 5 | 26,200 | 26,200 | 100.0% |
| Sam W2 (`0xb530...`) | 5 | 4,529 | 11,178 | 40.5% |
| `0xEE952f4e...` | 3 | 7,170 | 10,103 | 71.0% |
| `0x058d5EA1...` | 2 | 4,202 | 4,202 | 100.0% |
| `0xb51074Da...` | 1 | 500 | 500 | 100.0% |
| `0x2CF70d98...` | 1 | 400 | 400 | 100.0% |
| `0x1B3bBAb4...` | 1 | 400 | 400 | 100.0% |

**8 out of 15 borrowers used leverage.** However, Sam was the largest user by volume ($32,227 combined) and the only one who coupled leverage with massive naked borrows.

---

## 6. Why This Matters for the Curve Community

The discussion in Curve's Telegram raised several points this analysis addresses:

### "Samuel has no fault in participating to a permissionless market"

Participating is permissible. But the on-chain evidence shows Sam didn't merely "participate" — he:
- Used leverage to buy millions of SQUID tokens on the open market, inflating the oracle price 19x
- Extracted $54,629 in naked borrows against inflated collateral value
- Operated two wallets simultaneously to split risk exposure
- Self-liquidated and continued borrowing after liquidation

### "The market would have been set up to allow SQUID whales to cash out"

The pool's base price was calibrated at $0.00355/SQUID. Sam's leverage activity pushed the oracle to $0.041 — **11.6x above the calibration point**. Risk parameters (LTV, liquidation thresholds, band ranges) that were designed for a $0.00355 SQUID became dangerously inadequate at $0.041.

### "We can't blame Samuel for interacting with smart contracts"

This is true in the narrow legal sense. But the on-chain record shows a pattern of behavior that was irresponsible to the point of being reckless:
- Using leverage to inflate collateral value, then borrowing against that inflated value
- Extracting 61% of total borrows with zero new collateral
- Continuing to borrow on a wallet that had already been liquidated
- Departing the DAO without communication about $83,817 in outstanding debt

### "The Curve DAO should not be expected to make up for the negligence"

We agree. **The SQUID DAO proposal does not ask Curve to cover this debt.** The proposal (SDP-01) establishes a framework for recovering debt from Sam directly, and for the SQUID DAO to manage its own path forward. This addendum provides the on-chain evidence supporting why Sam's participation in repayment is both justified and necessary.

---

## 7. Methodology

1. All Borrow, Repay, and Liquidate events were fetched from the LlamaLend controller (`0xBF55Bb9463bBbB6aD724061910a450939E248eA6`) on Fraxtal from block 0 to block 32,712,465.
2. Each Borrow event's transaction was analyzed for its function selector and log count.
3. Selectors `0x4ba96d46` (create_loan_extended) and `0x24977ef3` (borrow_more_extended) were classified as leverage based on: (a) matching known extended function signatures, (b) generating 20–113 event logs with 10–56 Transfer events (consistent with DEX routing), compared to 6–7 logs for standard operations.
4. SQUID oracle prices were queried via `price_oracle()` on the LLAMMA AMM (`0x8fecf70b90ed40512c0608565eb9a53af0ef42ad`) at each event's block number.
5. All scripts are available in the proposal repository for independent verification.

---

*All data extracted February 28, 2026 from Fraxtal (chain ID 252). Transaction hashes and block numbers provided for every claim. Verification scripts: `investigate_leverage.js`, `analyze_selectors.js`, `verify_key_facts.js`.*
