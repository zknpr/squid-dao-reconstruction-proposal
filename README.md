# SQUID DAO — Reconstruction & Debt Recovery Framework

## Overview

This repository contains the governance proposal and supporting on-chain evidence for **SDP-XX**, a SQUID DAO proposal addressing $131,060.88 in bad debt in the SQUID/crvUSD Llama Lend pool on Fraxtal (chain ID 252).

The proposal focuses on recovering **$83,817.33** owed by Samuel McCulloch, a former contributor who departed the DAO. His debt is spread across two wallets and represents 64.0% of total pool obligations.

**[Read the full proposal](proposal/SDP-XX_Reconstruction_Proposal.md)**

## Key Facts

| Metric | Value |
|--------|-------|
| Total Pool Debt | $131,060.88 crvUSD |
| Samuel McCulloch's Debt | $83,817.33 crvUSD (2 wallets) |
| Pool Utilization | 100% (all lender funds locked) |
| Borrow APY | 34.99% (~$3,820/month interest accrual) |
| Vault Price Per Share | 0.001234 (lenders lost ~99.88%) |
| Active Loans | 5 (all underwater, 100% bad debt) |
| On-Chain Snapshot | 2026-02-25T10:25:19Z |

## Samuel McCulloch's Wallets

| Wallet | Debt | Health | Residual crvUSD |
|--------|------|--------|-----------------|
| `0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922` | $81,536.78 | -96.00% | $3,728.82 |
| `0xb53009E4dC25a494F3Bee03Ab121517e74b59F75` | $2,280.55 | -81.71% | $476.60 |
| **Combined** | **$83,817.33** | — | **$4,205.42** |

## Verified Contracts (Fraxtal)

| Contract | Address |
|----------|---------|
| Controller | `0xBF55Bb9463bBbB6aD724061910a450939E248eA6` |
| Vault (ERC-4626) | `0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e` |
| AMM / LLAMMA | `0x8fecf70b90ed40512c0608565eb9a53af0ef42ad` |
| Monetary Policy | `0x5607772d573E09F69FDfC292b23B8E99918be0A3` |
| Factory | `0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66` |
| crvUSD | `0xB102f7Efa0d5dE071A8D37B3548e1C7CB148Caf3` |
| SQUID | `0x6e58089d8E8f664823d26454f49A5A0f2fF697Fe` |

## Proposal Summary

### Phase 1: Formal Notification (Week 1)
Public notification to Samuel McCulloch via all channels documenting both wallet addresses, exact debt, and impact on lenders.

### Phase 2: Settlement Window (30 Days)
Samuel has 30 days to respond with:
- **Option A:** Full repayment commitment (up to 12 months)
- **Option B:** Partial settlement (60–80% of principal, interest waived, 6 months)
- **Option C:** Counter-proposal (evaluated via follow-up Snapshot vote)
- **Option D:** Documented inability to repay

### Phase 3: Scenario Determination
- **Scenario A (engages):** Formalized agreement + modest DAO revenue supplement
- **Scenario B (no response):** Public disclosure of non-cooperation + DAO-funded repayment from auction revenue

## Repository Contents

```
├── README.md                    # This file
├── proposal/
│   ├── SDP-XX_Reconstruction_Proposal.md    # Governance proposal (readable on GitHub)
│   └── SDP-XX_Reconstruction_Proposal.docx  # Governance proposal (downloadable)
├── data/
│   ├── pool_data.json           # Raw on-chain data (Feb 25, 2026)
│   └── extract_pool_data.js     # ethers.js extraction script
└── verification/
    └── VERIFY.md                # How to independently verify all data
```

## Verify the Data Yourself

```bash
npm install ethers@6
node data/extract_pool_data.js
```

This runs against the public Fraxtal RPC (`https://rpc.frax.com`) and will output the same pool state data. Compare with `data/pool_data.json`.

## Links

- **CurveMonitor:** [Pool Users](https://curvemonitor.com/platform/lending/fraxtal/0xBF55Bb9463bBbB6aD724061910a450939E248eA6/users)
- **Fraxscan Vault:** [0x5071...f61e](https://fraxscan.com/address/0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e)
- **Snapshot:** [leviathannews.eth](https://snapshot.org/#/leviathannews.eth)

## License

This proposal and all supporting data are released into the public domain for the benefit of the SQUID DAO community.
