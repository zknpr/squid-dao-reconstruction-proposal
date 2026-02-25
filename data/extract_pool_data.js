const { ethers } = require('ethers');

// Fraxtal public RPC (chain ID 252)
const provider = new ethers.JsonRpcProvider('https://rpc.frax.com');

// CORRECTED addresses from factory probing:
// Factory controllers(4) = Controller, vaults(4) = Vault, amms(4) = AMM
const CONTROLLER = '0xBF55Bb9463bBbB6aD724061910a450939E248eA6';
const VAULT = '0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e';
const AMM = '0x8fecf70b90ed40512c0608565eb9a53af0ef42ad';
const FACTORY = '0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66';
const SQUID = '0x6e58089d8e8f664823d26454f49a5a0f2ff697fe';

// Helper: raw eth_call for function probing
async function rawCall(to, data) {
  try {
    return await provider.call({ to, data });
  } catch {
    return null;
  }
}

function sel(sig) {
  return ethers.id(sig).slice(0, 10);
}

async function main() {
  console.log('=== SQUID DAO Llama Lend Pool — On-Chain Data Extraction ===');
  console.log('Chain: Fraxtal (252) | RPC: https://rpc.frax.com');
  console.log('Timestamp:', new Date().toISOString());
  console.log('');

  // Verify contract roles
  console.log('--- Verified Contract Addresses ---');
  console.log('Controller: ', CONTROLLER);
  console.log('Vault:      ', VAULT);
  console.log('AMM:        ', AMM);
  console.log('Factory:    ', FACTORY);

  // ---- CONTROLLER QUERIES ----
  const controllerAbi = [
    'function total_debt() view returns (uint256)',
    'function n_loans() view returns (uint256)',
    'function loans(uint256) view returns (address)',
    'function debt(address) view returns (uint256)',
    'function health(address) view returns (int256)',
    'function health(address,bool) view returns (int256)',
    'function user_state(address) view returns (uint256[4])',
    'function monetary_policy() view returns (address)',
    'function admin_fees() view returns (uint256)',
    'function amm() view returns (address)',
    'function borrowed_token() view returns (address)',
    'function collateral_token() view returns (address)',
    'function loan_exists(address) view returns (bool)',
    'function minted() view returns (uint256)',
    'function redeemed() view returns (uint256)',
  ];
  const controller = new ethers.Contract(CONTROLLER, controllerAbi, provider);

  // ---- VAULT QUERIES (ERC-4626) ----
  // First probe which vault functions exist
  console.log('\n--- Probing Vault functions ---');
  const vaultProbes = [
    'totalAssets()', 'totalSupply()', 'asset()', 'name()', 'symbol()',
    'decimals()', 'pricePerShare()', 'convertToAssets(uint256)',
    'total_assets()', 'lend_apr()', 'borrow_apr()',
  ];
  for (const sig of vaultProbes) {
    let data;
    if (sig.includes('uint256')) {
      // For convertToAssets, pass 1e18
      data = sel(sig) + ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [ethers.parseEther('1')]).slice(2);
    } else {
      data = sel(sig);
    }
    const result = await rawCall(VAULT, data);
    if (result && result !== '0x') {
      console.log(`  ${sig.padEnd(35)} => ${result}`);
    } else {
      console.log(`  ${sig.padEnd(35)} => REVERTED`);
    }
  }

  // Build vault contract with found functions
  const vaultAbi = [
    'function totalAssets() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function asset() view returns (address)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function convertToAssets(uint256) view returns (uint256)',
    'function pricePerShare() view returns (uint256)',
  ];
  const vault = new ethers.Contract(VAULT, vaultAbi, provider);

  // ---- Fetch pool-level data ----
  let totalDebt, nLoans, mpAddr, adminFees, borrowedToken, collateralToken;
  let minted, redeemed;

  [totalDebt, nLoans, mpAddr, borrowedToken, collateralToken] = await Promise.all([
    controller.total_debt(),
    controller.n_loans(),
    controller.monetary_policy(),
    controller.borrowed_token(),
    controller.collateral_token(),
  ]);

  // Try optional fields
  try { adminFees = await controller.admin_fees(); } catch { adminFees = null; }
  try { minted = await controller.minted(); } catch { minted = null; }
  try { redeemed = await controller.redeemed(); } catch { redeemed = null; }

  console.log('\nMonetary Policy:', mpAddr);
  console.log('Borrowed Token: ', borrowedToken);
  console.log('Collateral Token:', collateralToken);

  // ---- Vault metrics ----
  let totalAssets, totalSupply, vaultName, vaultSymbol, pricePerShare;
  try { totalAssets = await vault.totalAssets(); } catch { totalAssets = null; }
  try { totalSupply = await vault.totalSupply(); } catch { totalSupply = null; }
  try { vaultName = await vault.name(); } catch { vaultName = null; }
  try { vaultSymbol = await vault.symbol(); } catch { vaultSymbol = null; }
  try { pricePerShare = await vault.pricePerShare(); } catch { pricePerShare = null; }

  // ---- Monetary policy rate ----
  const mpAbi = [
    'function rate() view returns (uint256)',
    'function rate(address) view returns (uint256)',
  ];
  const mp = new ethers.Contract(mpAddr, mpAbi, provider);
  let rate;
  try {
    rate = await mp['rate(address)'](CONTROLLER);
  } catch {
    try { rate = await mp['rate()'](); } catch { rate = null; }
  }

  let apy = null;
  if (rate !== null) {
    const ratePerSec = Number(rate) / 1e18;
    apy = (Math.pow(1 + ratePerSec, 31536000) - 1) * 100;
  }

  // ---- AMM price data ----
  console.log('\n--- Probing AMM functions ---');
  const ammProbes = [
    'get_p()', 'price_oracle()', 'get_base_price()', 'A()',
    'active_band()', 'min_band()', 'max_band()',
    'get_sum_xy(int256)', 'bands_x(int256)', 'bands_y(int256)',
    'fee()', 'admin_fee()',
    'coins(uint256)', 'BORROWED_TOKEN()', 'COLLATERAL_TOKEN()',
  ];
  for (const sig of ammProbes) {
    let data;
    if (sig.includes('int256') || sig.includes('uint256')) {
      data = sel(sig) + ethers.AbiCoder.defaultAbiCoder().encode(['int256'], [0]).slice(2);
    } else {
      data = sel(sig);
    }
    const result = await rawCall(AMM, data);
    if (result && result !== '0x') {
      console.log(`  ${sig.padEnd(35)} => ${result}`);
    } else {
      console.log(`  ${sig.padEnd(35)} => REVERTED`);
    }
  }

  const ammAbi = [
    'function get_p() view returns (uint256)',
    'function price_oracle() view returns (uint256)',
    'function get_base_price() view returns (uint256)',
    'function active_band() view returns (int256)',
    'function min_band() view returns (int256)',
    'function max_band() view returns (int256)',
    'function A() view returns (uint256)',
    'function fee() view returns (uint256)',
  ];
  const amm = new ethers.Contract(AMM, ammAbi, provider);

  let ammPrice, oraclePrice, basePrice, activeBand;
  try { ammPrice = await amm.get_p(); } catch { ammPrice = null; }
  try { oraclePrice = await amm.price_oracle(); } catch { oraclePrice = null; }
  try { basePrice = await amm.get_base_price(); } catch { basePrice = null; }
  try { activeBand = await amm.active_band(); } catch { activeBand = null; }

  // ---- Print pool summary ----
  const totalAssetsNum = totalAssets ? Number(totalAssets) : 0;
  const totalDebtNum = Number(totalDebt);
  const utilization = totalAssetsNum > 0 ? (totalDebtNum / totalAssetsNum * 100) : 0;

  console.log('\n=== POOL STATE ===');
  console.log('Total Debt:       ', ethers.formatUnits(totalDebt, 18), 'crvUSD');
  if (totalAssets) console.log('Total Supplied:   ', ethers.formatUnits(totalAssets, 18), 'crvUSD');
  if (totalSupply) console.log('Vault Shares:     ', ethers.formatUnits(totalSupply, 18));
  if (vaultName) console.log('Vault Name:       ', vaultName);
  if (vaultSymbol) console.log('Vault Symbol:     ', vaultSymbol);
  if (pricePerShare) console.log('Price/Share:      ', ethers.formatUnits(pricePerShare, 18));
  console.log('Utilization:      ', utilization.toFixed(4), '%');
  if (apy !== null) console.log('Borrow APY:       ', apy.toFixed(4), '%');
  if (rate !== null) console.log('Rate (per sec):   ', rate.toString());
  if (adminFees !== null) console.log('Admin Fees:       ', ethers.formatUnits(adminFees, 18), 'crvUSD');
  if (minted !== null) console.log('Minted (total):   ', ethers.formatUnits(minted, 18), 'crvUSD');
  if (redeemed !== null) console.log('Redeemed (total): ', ethers.formatUnits(redeemed, 18), 'crvUSD');
  console.log('Number of Loans:  ', nLoans.toString());
  if (ammPrice) console.log('AMM Price (get_p):', ethers.formatUnits(ammPrice, 18), 'crvUSD/SQUID');
  if (oraclePrice) console.log('Oracle Price:     ', ethers.formatUnits(oraclePrice, 18), 'crvUSD/SQUID');
  if (basePrice) console.log('Base Price:       ', ethers.formatUnits(basePrice, 18), 'crvUSD/SQUID');
  if (activeBand !== null) console.log('Active Band:      ', activeBand.toString());

  // ---- Enumerate all borrowers ----
  console.log('\n=== BORROWER POSITIONS ===');
  const borrowers = [];
  const n = Number(nLoans);

  for (let i = 0; i < n; i++) {
    const addr = await controller.loans(i);

    // Parallel fetch per borrower
    const [debt, state] = await Promise.all([
      controller.debt(addr),
      controller.user_state(addr),
    ]);

    // health() — try (address, bool) then (address)
    let health;
    try {
      health = await controller['health(address,bool)'](addr, false);
    } catch {
      try {
        health = await controller['health(address)'](addr);
      } catch (e) {
        console.log(`  Warning: health() reverted for ${addr}: ${e.message.slice(0, 100)}`);
        health = null;
      }
    }

    const collateral = state[0];    // SQUID collateral
    const stablecoin = state[1];    // crvUSD in LLAMMA bands
    const debtFromState = state[2]; // debt from user_state
    const nBands = state[3];        // band count

    const healthFloat = health !== null ? Number(health) / 1e18 : null;
    const isBadDebt = healthFloat !== null ? healthFloat < 0 : null;

    // Estimate collateral value using AMM price
    let collateralValueCrvusd = 0;
    if (ammPrice && collateral > 0n) {
      collateralValueCrvusd = Number(collateral) * Number(ammPrice) / 1e36;
    }

    const entry = {
      index: i,
      address: addr,
      debt_crvusd: ethers.formatUnits(debt, 18),
      debt_raw: debt.toString(),
      health: healthFloat !== null ? healthFloat.toFixed(6) : 'REVERTED',
      health_pct: healthFloat !== null ? (healthFloat * 100).toFixed(4) + '%' : 'REVERTED',
      health_raw: health !== null ? health.toString() : null,
      collateral_squid: ethers.formatUnits(collateral, 18),
      stablecoin_in_bands: ethers.formatUnits(stablecoin, 18),
      debt_from_state: ethers.formatUnits(debtFromState, 18),
      n_bands: Number(nBands),
      is_bad_debt: isBadDebt,
      collateral_value_crvusd: collateralValueCrvusd.toFixed(4),
    };
    borrowers.push(entry);

    console.log(`\nBorrower #${i}: ${addr}`);
    console.log(`  Debt:            ${entry.debt_crvusd} crvUSD`);
    console.log(`  Health:          ${entry.health} (${entry.health_pct})`);
    console.log(`  Collateral:      ${entry.collateral_squid} SQUID`);
    console.log(`  Stable in bands: ${entry.stablecoin_in_bands} crvUSD`);
    console.log(`  Debt (state):    ${entry.debt_from_state} crvUSD`);
    console.log(`  N bands:         ${entry.n_bands}`);
    console.log(`  Bad Debt:        ${isBadDebt === null ? 'UNKNOWN' : isBadDebt ? 'YES' : 'No'}`);
    console.log(`  Collateral Val:  ~$${entry.collateral_value_crvusd} crvUSD`);
  }

  // ---- Bad debt totals ----
  let totalBadDebt = 0;
  let totalGoodDebt = 0;
  for (const b of borrowers) {
    const d = parseFloat(b.debt_crvusd);
    if (b.is_bad_debt === true) {
      totalBadDebt += d;
    } else {
      totalGoodDebt += d;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('Total Bad Debt:    ', totalBadDebt.toFixed(4), 'crvUSD');
  console.log('Total Good Debt:   ', totalGoodDebt.toFixed(4), 'crvUSD');
  console.log('Bad Debt Positions:', borrowers.filter(b => b.is_bad_debt === true).length, '/', n);

  // ---- Structured JSON output ----
  const output = {
    timestamp: new Date().toISOString(),
    chain: 'Fraxtal (252)',
    rpc: 'https://rpc.frax.com',
    pool_state: {
      total_debt_crvusd: ethers.formatUnits(totalDebt, 18),
      total_supplied_crvusd: totalAssets ? ethers.formatUnits(totalAssets, 18) : null,
      vault_shares: totalSupply ? ethers.formatUnits(totalSupply, 18) : null,
      vault_name: vaultName,
      vault_symbol: vaultSymbol,
      price_per_share: pricePerShare ? ethers.formatUnits(pricePerShare, 18) : null,
      utilization_pct: utilization.toFixed(4),
      borrow_apy_pct: apy !== null ? apy.toFixed(4) : null,
      rate_per_sec_raw: rate !== null ? rate.toString() : null,
      admin_fees_crvusd: adminFees !== null ? ethers.formatUnits(adminFees, 18) : null,
      minted_crvusd: minted !== null ? ethers.formatUnits(minted, 18) : null,
      redeemed_crvusd: redeemed !== null ? ethers.formatUnits(redeemed, 18) : null,
      n_loans: n,
      amm_price_crvusd: ammPrice ? ethers.formatUnits(ammPrice, 18) : null,
      oracle_price_crvusd: oraclePrice ? ethers.formatUnits(oraclePrice, 18) : null,
      base_price_crvusd: basePrice ? ethers.formatUnits(basePrice, 18) : null,
      active_band: activeBand !== null ? activeBand.toString() : null,
    },
    borrowers: borrowers,
    bad_debt_summary: {
      total_bad_debt_crvusd: totalBadDebt.toFixed(4),
      total_good_debt_crvusd: totalGoodDebt.toFixed(4),
      bad_debt_positions: borrowers.filter(b => b.is_bad_debt === true).length,
      total_positions: n,
    },
    contract_addresses: {
      controller: CONTROLLER,
      vault: VAULT,
      amm: AMM,
      monetary_policy: mpAddr,
      factory: FACTORY,
      borrowed_token: borrowedToken,
      collateral_token: collateralToken,
    },
  };

  console.log('\n=== STRUCTURED JSON OUTPUT ===');
  console.log(JSON.stringify(output, null, 2));

  // Write to file
  const fs = require('fs');
  // Write output to data/ directory relative to script location
  const path = require('path');
  const outPath = path.join(__dirname, 'pool_data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nData written to ${outPath}`);
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
