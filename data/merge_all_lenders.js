/**
 * merge_all_lenders.js
 *
 * Merges three distinct lender categories into a single unified view:
 *   1. Direct vault holders     — addresses holding vault shares directly (from lender_data.json)
 *   2. Convex depositors        — addresses staking through Convex BaseRewardPool (from convex_lender_data.json)
 *   3. Direct gauge stakers     — addresses staking vault shares in the Curve gauge without Convex (from convex_lender_data.json)
 *
 * For addresses that appear in multiple categories, positions are summed to produce
 * a single total_crvusd_value and total_shares per address. Each address retains a
 * breakdown of where its exposure originates.
 *
 * Output: all_lenders.json — a flat, deduplicated list sorted by total crvUSD value descending.
 */

const fs = require('fs');
const path = require('path');

// ─── Load source data ──────────────────────────────────────────────────────────
const lenderData = JSON.parse(fs.readFileSync(path.join(__dirname, 'lender_data.json'), 'utf8'));
const convexData = JSON.parse(fs.readFileSync(path.join(__dirname, 'convex_lender_data.json'), 'utf8'));

// ─── Use the most recent price_per_share for consistent recalculation ─────────
// convex_lender_data is newer (includes vault_state block), so prefer its price.
const pricePerShare = parseFloat(convexData.vault_state.price_per_share);
const totalVaultShares = parseFloat(convexData.vault_state.total_supply_shares);
const totalVaultCrvusd = parseFloat(convexData.vault_state.total_assets_crvusd);

// ─── Infrastructure contract addresses to exclude from direct holders ─────────
// The gauge contract holds vault shares on behalf of gauge stakers (both Convex
// and direct). Including it as a "direct holder" would double-count those shares
// since we already track the underlying stakers individually.
const EXCLUDED_CONTRACTS = new Set([
  convexData.contracts.gauge.toLowerCase(),            // Curve gauge — holds shares for all gauge stakers
  convexData.contracts.convex_voter_proxy.toLowerCase(), // Convex VoterProxy — deposits into gauge on behalf of Convex users
  convexData.contracts.convex_booster.toLowerCase(),    // Convex Booster — routes deposits through the system
  convexData.contracts.convex_reward_contract.toLowerCase(), // Convex BaseRewardPool — tracks per-user Convex balances
]);

/**
 * Accumulator map: address (lowercased) → merged record.
 * Each record tracks per-source positions so we can show the breakdown.
 *
 * Structure:
 * {
 *   address:            string  — checksummed address (first seen casing preserved)
 *   positions: {
 *     direct_vault:     { shares: number, crvusd_value: number } | null
 *     convex:           { shares: number, crvusd_value: number } | null
 *     direct_gauge:     { shares: number, crvusd_value: number } | null
 *   }
 *   total_shares:       number  — sum of all position shares
 *   total_crvusd_value: number  — sum of all position crvUSD values
 *   pct_of_vault:       string  — percentage of total vault
 *   sources:            string[] — which categories this address participates in
 * }
 */
const merged = new Map();

/**
 * getOrCreate — returns an existing record for the address or initializes a blank one.
 * @param {string} addr — Ethereum address (any casing)
 * @returns {object} — the mutable record stored in the merged map
 */
function getOrCreate(addr) {
  const key = addr.toLowerCase();
  if (!merged.has(key)) {
    merged.set(key, {
      address: addr,
      positions: {
        direct_vault: null,
        convex: null,
        direct_gauge: null,
      },
      total_shares: 0,
      total_crvusd_value: 0,
      pct_of_vault: '0.00',
      sources: [],
    });
  }
  return merged.get(key);
}

// ─── 1. Ingest direct vault holders ────────────────────────────────────────────
// These are addresses with a non-zero vault.balanceOf() — they hold vault shares
// in their own wallet (not staked in gauge or Convex).
for (const h of lenderData.holders) {
  const shares = parseFloat(h.shares);
  // Skip zero-balance dust that rounds to nothing
  if (shares <= 0) continue;

  // Skip infrastructure contracts — their balances represent shares held on
  // behalf of stakers who are already tracked in the convex/gauge categories.
  if (EXCLUDED_CONTRACTS.has(h.address.toLowerCase())) continue;

  const rec = getOrCreate(h.address);
  const crvusdValue = shares * pricePerShare;

  rec.positions.direct_vault = {
    shares,
    crvusd_value: crvusdValue,
  };
  rec.total_shares += shares;
  rec.total_crvusd_value += crvusdValue;
  if (!rec.sources.includes('direct_vault')) rec.sources.push('direct_vault');
}

// ─── 2. Ingest Convex active depositors ────────────────────────────────────────
// These addresses deposited vault shares into Convex's BaseRewardPool via the
// Booster contract. Their shares are held by Convex's VoterProxy in the gauge,
// and the BaseRewardPool tracks per-user balances.
for (const h of convexData.convex_active_holders) {
  const shares = parseFloat(h.shares);
  if (shares <= 0) continue;

  const rec = getOrCreate(h.address);
  const crvusdValue = shares * pricePerShare;

  rec.positions.convex = {
    shares,
    crvusd_value: crvusdValue,
  };
  rec.total_shares += shares;
  rec.total_crvusd_value += crvusdValue;
  if (!rec.sources.includes('convex')) rec.sources.push('convex');
}

// ─── 3. Ingest direct gauge stakers ────────────────────────────────────────────
// These addresses deposited vault shares directly into the Curve gauge (not
// through Convex). They earn CRV rewards but bypass the Convex boost layer.
for (const h of convexData.direct_gauge_stakers) {
  const shares = parseFloat(h.shares);
  if (shares <= 0) continue;

  const rec = getOrCreate(h.address);
  const crvusdValue = shares * pricePerShare;

  rec.positions.direct_gauge = {
    shares,
    crvusd_value: crvusdValue,
  };
  rec.total_shares += shares;
  rec.total_crvusd_value += crvusdValue;
  if (!rec.sources.includes('direct_gauge')) rec.sources.push('direct_gauge');
}

// ─── Compute pct_of_vault for each merged record ──────────────────────────────
for (const rec of merged.values()) {
  rec.pct_of_vault = ((rec.total_shares / totalVaultShares) * 100).toFixed(2);
}

// ─── Sort descending by total crvUSD value ─────────────────────────────────────
const sorted = [...merged.values()].sort((a, b) => b.total_crvusd_value - a.total_crvusd_value);

// ─── Format numeric fields to fixed-precision strings for readability ──────────
/**
 * fmt — formats a number to a fixed-precision string.
 * Uses 18 decimal places for shares (matching on-chain precision) and 6 for crvUSD.
 */
function fmtShares(n) { return n.toFixed(18); }
function fmtCrvusd(n) { return n.toFixed(6); }

const formattedLenders = sorted.map((rec, idx) => {
  // Build position breakdown — only include non-null positions
  const breakdown = {};
  if (rec.positions.direct_vault) {
    breakdown.direct_vault = {
      shares: fmtShares(rec.positions.direct_vault.shares),
      crvusd_value: fmtCrvusd(rec.positions.direct_vault.crvusd_value),
    };
  }
  if (rec.positions.convex) {
    breakdown.convex = {
      shares: fmtShares(rec.positions.convex.shares),
      crvusd_value: fmtCrvusd(rec.positions.convex.crvusd_value),
    };
  }
  if (rec.positions.direct_gauge) {
    breakdown.direct_gauge = {
      shares: fmtShares(rec.positions.direct_gauge.shares),
      crvusd_value: fmtCrvusd(rec.positions.direct_gauge.crvusd_value),
    };
  }

  return {
    rank: idx + 1,
    address: rec.address,
    total_shares: fmtShares(rec.total_shares),
    total_crvusd_value: fmtCrvusd(rec.total_crvusd_value),
    pct_of_vault: rec.pct_of_vault,
    sources: rec.sources,
    positions: breakdown,
  };
});

// ─── Aggregate stats ───────────────────────────────────────────────────────────
const totalMergedShares = sorted.reduce((sum, r) => sum + r.total_shares, 0);
const totalMergedCrvusd = sorted.reduce((sum, r) => sum + r.total_crvusd_value, 0);

// Count addresses that appear in multiple sources (multi-position holders)
const multiSourceCount = sorted.filter(r => r.sources.length > 1).length;

const output = {
  // Metadata — snapshot context for reproducibility
  generated_at: new Date().toISOString(),
  description: 'Unified lender view merging direct vault holders, Convex depositors, and direct gauge stakers. Addresses appearing in multiple categories have their positions summed.',

  // Source timestamps so consumers know data freshness
  source_timestamps: {
    lender_data: lenderData.timestamp,
    convex_lender_data: convexData.timestamp,
  },

  // Vault reference state (from convex_lender_data, the more recent snapshot)
  vault: {
    address: convexData.contracts.vault,
    total_supply_shares: convexData.vault_state.total_supply_shares,
    total_assets_crvusd: convexData.vault_state.total_assets_crvusd,
    price_per_share: convexData.vault_state.price_per_share,
    block: convexData.block,
    chain: convexData.chain,
  },

  // Summary statistics
  summary: {
    unique_lenders: sorted.length,
    multi_source_lenders: multiSourceCount,
    total_tracked_shares: fmtShares(totalMergedShares),
    total_tracked_crvusd: fmtCrvusd(totalMergedCrvusd),
    // Coverage: what percentage of vault shares are accounted for by known lenders.
    // Should approach ~100% unless there are unknown holders (e.g., other protocols).
    coverage_pct: ((totalMergedShares / totalVaultShares) * 100).toFixed(2),

    // Per-source breakdown
    by_source: {
      direct_vault: {
        count: sorted.filter(r => r.sources.includes('direct_vault')).length,
        total_crvusd: fmtCrvusd(
          sorted
            .filter(r => r.positions.direct_vault)
            .reduce((s, r) => s + r.positions.direct_vault.crvusd_value, 0)
        ),
      },
      convex: {
        count: sorted.filter(r => r.sources.includes('convex')).length,
        total_crvusd: fmtCrvusd(
          sorted
            .filter(r => r.positions.convex)
            .reduce((s, r) => s + r.positions.convex.crvusd_value, 0)
        ),
      },
      direct_gauge: {
        count: sorted.filter(r => r.sources.includes('direct_gauge')).length,
        total_crvusd: fmtCrvusd(
          sorted
            .filter(r => r.positions.direct_gauge)
            .reduce((s, r) => s + r.positions.direct_gauge.crvusd_value, 0)
        ),
      },
    },
  },

  // The unified, deduplicated lender list sorted by total crvUSD value descending
  lenders: formattedLenders,
};

// ─── Write output ──────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, 'all_lenders.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// ─── Console summary ───────────────────────────────────────────────────────────
console.log('=== ALL LENDERS MERGED ===');
console.log(`Unique addresses:       ${sorted.length}`);
console.log(`Multi-source holders:   ${multiSourceCount}`);
console.log(`Total tracked crvUSD:   ${fmtCrvusd(totalMergedCrvusd)}`);
console.log(`Vault total crvUSD:     ${convexData.vault_state.total_assets_crvusd}`);
console.log(`Coverage:               ${((totalMergedShares / totalVaultShares) * 100).toFixed(2)}%`);
console.log('');
console.log('Per-source breakdown:');
console.log(`  direct_vault:  ${sorted.filter(r => r.sources.includes('direct_vault')).length} addresses`);
console.log(`  convex:        ${sorted.filter(r => r.sources.includes('convex')).length} addresses`);
console.log(`  direct_gauge:  ${sorted.filter(r => r.sources.includes('direct_gauge')).length} addresses`);
console.log('');
console.log('Top 10 lenders by total crvUSD value:');
formattedLenders.slice(0, 10).forEach(l => {
  const srcTag = l.sources.length > 1 ? ` [${l.sources.join('+')}]` : ` [${l.sources[0]}]`;
  console.log(`  #${l.rank}  ${l.address}  ${l.total_crvusd_value} crvUSD  (${l.pct_of_vault}%)${srcTag}`);
});
console.log('');
console.log(`Written to: ${outPath}`);
