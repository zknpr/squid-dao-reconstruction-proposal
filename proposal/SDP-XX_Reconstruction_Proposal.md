# SQUID DAO GOVERNANCE PROPOSAL

## DAO Reconstruction & Debt Recovery Framework

| Field | Detail |
|-------|--------|
| **Proposal ID** | SDP-XX (to be assigned) |
| **Author** | SQUID DAO Contributors |
| **Status** | DRAFT — Open for Discussion |
| **Date** | February 25, 2026 |
| **On-Chain Snapshot** | 2026-02-25T10:25:19Z (verified via rpc.frax.com) |
| **Vote Platform** | Snapshot (leviathannews.eth) |
| **Subject** | DAO Reconstruction — Revenue Allocation, Lending Pool Recovery & Debt Accountability |

---

## 1. Abstract

This proposal establishes a comprehensive reconstruction framework for SQUID DAO, addressing the SQUID/crvUSD Llama Lend pool crisis on Fraxtal. The pool carries **$131,060.88 in total bad debt** at **100% utilization**, meaning every crvUSD deposited by lenders is currently locked and inaccessible. The borrow APY has risen to 34.99%, compounding approximately $3,820 per month in additional interest.

Central to this framework is the recovery of **$83,817.33** owed by Samuel McCulloch, a former front-facing contributor who departed the DAO. Samuel's debt is distributed across two wallets and represents **64.0%** of total pool obligations. Both positions are fully underwater with zero SQUID collateral remaining and deeply negative health factors.

This proposal defines a structured process for debtor engagement, revenue allocation toward lender recovery, and ongoing transparency measures — establishing the governance infrastructure the DAO needs to move forward.

---

## 2. On-Chain Verified Data

All data below was extracted directly from the Fraxtal blockchain on **February 25, 2026 at 10:25:19 UTC** via the public RPC endpoint (`rpc.frax.com`). The extraction script and raw JSON output are attached as appendices for independent verification.

### 2.1 Pool Overview

| Metric | Value |
|--------|-------|
| Total Pool Debt | **131,060.88 crvUSD** |
| Samuel McCulloch's Combined Debt | **83,817.33 crvUSD** (64.0% of total) |
| Total Supplied by Lenders | 131,060.88 crvUSD |
| Utilization Rate | **100.00%** (all lender funds locked) |
| Current Borrow APY | 34.99% (compounding — adds ~$3,820/month to total pool debt) |
| Vault Price Per Share | 0.001234 (lender shares worth ~0.12% of face value) |
| Accumulated Admin Fees | 20,686.05 crvUSD |
| Active Loans in Pool | 5 (all with negative health — 100% bad debt) |
| SQUID Oracle Price | $0.001942 per SQUID |

---

## 3. Samuel McCulloch's Positions

Samuel holds two wallets with active loan positions in the SQUID/crvUSD lending pool. Both wallets have zero SQUID collateral remaining — the LLAMMA soft-liquidation mechanism converted all collateral to crvUSD as SQUID's price declined, but the recovered amounts cover only a fraction of the outstanding debt.

| | Wallet Address | Debt (crvUSD) | Health | crvUSD in Bands |
|---|---|---|---|---|
| **Wallet 1** | `0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922` | 81,536.78 | -96.00% | 3,728.82 |
| **Wallet 2** | `0xb53009E4dC25a494F3Bee03Ab121517e74b59F75` | 2,280.55 | -81.71% | 476.60 |
| **TOTAL** | 2 wallets | **83,817.33** | Both negative | **4,205.42** |

| Fact | Detail |
|------|--------|
| SQUID Collateral Remaining | 0.00 SQUID (both wallets fully liquidated) |
| Residual crvUSD in LLAMMA Bands | 4,205.42 crvUSD (5.0% of debt — partially recoverable) |
| Net Irrecoverable Debt | ~79,611.91 crvUSD (debt minus residual) |
| SQUID Collateral Bands Used | 10 bands (Wallet 1) + 10 bands (Wallet 2) |
| Samuel's Share of Total Pool Debt | 64.0% |
| Current Status | Departed DAO — no communication regarding repayment |

### 3.1 How This Debt Was Created

Under Curve Lending's smart contract mechanics, Samuel deposited SQUID tokens as collateral and borrowed crvUSD against them. He received and retained the borrowed crvUSD. As SQUID's price declined from approximately $0.02 to under $0.002 (a 90%+ drop), the LLAMMA soft-liquidation mechanism progressively converted his SQUID collateral into crvUSD. However, due to SQUID's thin liquidity, the conversion recovered only a small fraction of the outstanding debt.

**The result:** Samuel kept the ~$83,817 in borrowed crvUSD, his collateral was consumed by soft-liquidation, and vault lenders are left holding the loss. He has since departed the DAO with no public statement regarding repayment.

**This is not a protocol failure, DAO operational loss, or shared community obligation.** This is an individual borrower who took leveraged positions across two wallets, retained the proceeds, watched the collateral collapse, and left.

---

## 4. The Cost of Delay

At 100% utilization, the pool's semi-logarithmic interest rate model charges 34.99% APY on the entire $131,060.88 in outstanding debt. Samuel's positions accrue their proportional share:

| Period | Interest on Samuel's Debt | Interest on Total Pool | Samuel's New Total |
|--------|--------------------------|----------------------|-------------------|
| Per Month | +$2,444 | +$3,820 | $86,261 |
| Per Quarter | +$7,643 | +$11,940 | $91,460 |
| Per Year | +$29,323 | +$45,860 | $113,140 |

Samuel's debt grows by approximately **$2,444 every month** that passes without resolution. In one year of inaction, his $83,817 obligation becomes $113,140. Swift action is not merely preferable — it is **financially imperative** for all parties.

---

## 5. Revenue vs. Debt

The DAO's current revenue cannot resolve this debt alone:

| Revenue Source | Amount |
|----------------|--------|
| Ethereum mainnet auctions (9 completed) | ~0.075 ETH (~$210 total) |
| Fraxtal auctions (all of 2025, estimated) | ~$1,000–$3,000 in SQUID value |
| Monthly interest accrual on Samuel's debt alone | **+$2,444/month** (growing) |

Current auction revenue does not cover a single day of interest accrual on Samuel's positions. No revenue allocation split — 50/50, 80/20, or 100/0 — can meaningfully address $83,817 in debt when monthly revenue is measured in hundreds of dollars and monthly interest in thousands. **Samuel's direct participation in repayment is mathematically necessary.**

---

## 6. Proposed Reconstruction Framework

### 6.1 Step 1 — Formal Notification (Week 1 After Passage)

Upon passage of this proposal, the DAO multisig will issue a formal public communication addressed to Samuel McCulloch, delivered via all available channels (Telegram "Squid Cave," X/Twitter, Leviathan News Substack, and direct message). The notification will document:

- His two wallet addresses and exact debt per wallet ($81,536.78 and $2,280.55)
- Combined total obligation: $83,817.33 (as of Feb 25, 2026, accruing at 34.99% APY)
- The impact on vault lenders whose funds are locked at 100% utilization
- A 30-day window to respond with a repayment proposal

### 6.2 Step 2 — Settlement Window (30 Days)

Samuel will have 30 calendar days from the date of formal notification to respond with one of the following:

- **Option A — Full Repayment Commitment:** A plan to repay the full outstanding balance in crvUSD, USDC, or ETH equivalent, over a period of up to 12 months.
- **Option B — Partial Settlement:** The DAO will consider settlement offers of 60–80% of the current principal (approximately $50,290–$67,054), waiving all accrued interest, payable over up to 6 months. This represents a significant concession by the DAO and its lenders.
- **Option C — Counter-Proposal:** Any alternative repayment structure Samuel wishes to propose, which will be evaluated by the community through a follow-up Snapshot vote.
- **Option D — Documented Inability:** A documented explanation of genuine inability to repay, which the DAO will assess in good faith.

**Good faith protections:** If Samuel engages constructively, the DAO commits to working collaboratively toward a mutually acceptable resolution. The goal is recovery, not punishment.

### 6.3 Step 3 — Scenario Determination (Day 31)

#### Scenario A: Samuel Engages

If Samuel commits to any form of repayment, the DAO will formalize the agreement through a follow-up Snapshot vote and begin applying his payments directly to the lending pool. The DAO may supplement with modest auction revenue allocation to accelerate lender recovery, with the specific split determined by a subsequent proposal based on the agreed repayment terms.

#### Scenario B: Samuel Does Not Engage

If Samuel fails to respond within 30 days or declines all repayment options, the DAO will:

- Publish a transparent public statement documenting his non-cooperation, both wallet addresses, and exact debt amounts.
- Begin allocating available auction revenue toward lender recovery (specific allocation ratio to be determined by a follow-up proposal based on revenue growth trajectory).
- Explore additional measures including expanded revenue generation, formal demand letters, and any other avenues the community deems appropriate through governance.

### 6.4 Residual crvUSD Recovery

Approximately **$4,205.42** in crvUSD remains trapped in LLAMMA bands across Samuel's two positions ($3,728.82 in Wallet 1, $476.60 in Wallet 2). The DAO should investigate whether this residual can be recovered through hard liquidation calls or other on-chain mechanisms, and apply any recovered funds directly to lender repayment.

---

## 7. Verified Contract Addresses

| Contract | Address (Fraxtal) |
|----------|-------------------|
| Controller | [`0xBF55Bb9463bBbB6aD724061910a450939E248eA6`](https://fraxscan.com/address/0xBF55Bb9463bBbB6aD724061910a450939E248eA6) |
| Vault (ERC-4626) | [`0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e`](https://fraxscan.com/address/0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e) |
| AMM / LLAMMA | [`0x8fecf70b90ed40512c0608565eb9a53af0ef42ad`](https://fraxscan.com/address/0x8fecf70b90ed40512c0608565eb9a53af0ef42ad) |
| Monetary Policy | [`0x5607772d573E09F69FDfC292b23B8E99918be0A3`](https://fraxscan.com/address/0x5607772d573E09F69FDfC292b23B8E99918be0A3) |
| Factory | [`0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66`](https://fraxscan.com/address/0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66) |
| crvUSD (Borrowed Token) | [`0xB102f7Efa0d5dE071A8D37B3548e1C7CB148Caf3`](https://fraxscan.com/address/0xB102f7Efa0d5dE071A8D37B3548e1C7CB148Caf3) |
| SQUID (Collateral Token) | [`0x6e58089d8E8f664823d26454f49A5A0f2fF697Fe`](https://fraxscan.com/address/0x6e58089d8E8f664823d26454f49A5A0f2fF697Fe) |

---

## 8. Transparency & Verification

- **On-Chain Reproducibility:** The ethers.js extraction script ([`extract_pool_data.js`](../data/extract_pool_data.js)) and raw JSON output ([`pool_data.json`](../data/pool_data.json)) are attached as appendices. Any community member can re-run the script against the public Fraxtal RPC (`rpc.frax.com`) to independently verify all figures in this proposal.
- **Monthly Debt Dashboard:** Following passage, each Leviathan News newsletter will include an updated debt dashboard showing: total remaining debt, any payments received, interest accrued since last report, and projected payoff timeline.
- **On-Chain Execution:** All repayment transactions will be executed on-chain via the DAO multisig, with transaction hashes published alongside each report.

---

## 9. Implementation Timeline

| Date | Action |
|------|--------|
| Late Feb 2026 | Discussion period opens; community feedback collected |
| Early Mar 2026 | Snapshot vote (SDP-XX) — 3-day voting period per CUTTLE rules |
| Upon Passage | Formal notification sent to Samuel McCulloch via all channels |
| +30 Days | Response deadline; scenario determination (A or B) |
| +31 Days | Follow-up proposal for revenue allocation if Scenario B |
| Monthly | Debt dashboard published in newsletter with on-chain verification |

---

## 10. Vote

**FOR:** Adopt the DAO Reconstruction & Debt Recovery Framework. Authorize the DAO multisig to send formal notification to Samuel McCulloch regarding his $83,817.33 in bad debt across two wallets and initiate the 30-day settlement window. Authorize publication of non-cooperation if he fails to respond (Scenario B).

**AGAINST:** Reject this framework. No formal reconstruction plan or debtor engagement. The DAO continues under the status quo with $83,817.33 (and growing) in unaddressed bad debt from a departed contributor.

**ABSTAIN:** Acknowledge the proposal without taking a position. Counted toward quorum but not toward the outcome.

---

*This document was prepared using verified on-chain data extracted from Fraxtal (chain ID 252) at 2026-02-25T10:25:19Z. All figures are reproducible by running the attached [`extract_pool_data.js`](../data/extract_pool_data.js) script against `rpc.frax.com`. The raw JSON output ([`pool_data.json`](../data/pool_data.json)) contains every data point referenced in this proposal.*
