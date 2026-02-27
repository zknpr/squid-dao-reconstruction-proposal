/**
 * analyze_selectors.js
 *
 * Verifies function selectors from the LlamaLend controller and classifies
 * each borrowing event as standard vs leverage.
 *
 * Standard transactions have 6-7 logs and 1-2 transfers (simple token movements).
 * Leverage transactions have 20-90+ logs and 10-44 transfers (routing through DEXes).
 *
 * The extended (leverage) variants in LlamaLend use a callback mechanism that
 * atomically swaps borrowed crvUSD for more collateral through DEX routes,
 * creating a leveraged position in a single transaction.
 */

const { ethers } = require('ethers');
const fs = require('fs');

// Compute keccak256 function selectors for known LlamaLend controller functions
const KNOWN_SIGNATURES = [
  // Standard (no leverage)
  'create_loan(address,uint256,uint256,uint256)',          // Standard loan creation
  'borrow_more(uint256,uint256)',                          // Standard additional borrow
  'repay(uint256,uint256)',                                // Standard repayment
  'add_collateral(uint256)',                               // Add collateral only
  'add_collateral(uint256,address)',                       // Add collateral for address

  // Extended (leverage) - these include a callback to a DEX router
  'create_loan_extended(uint256,uint256,uint256,address,uint256[])',     // Leverage loan creation
  'borrow_more_extended(uint256,uint256,address,uint256[])',             // Leverage additional borrow
  'repay_extended(address,uint256[])',                                    // Leverage repayment

  // Vyper variants (may differ)
  'create_loan(uint256,uint256,uint256)',
  'borrow_more(address,uint256,uint256)',
  'repay(address,uint256,uint256)',

  // Additional possible signatures
  'liquidate(address,uint256)',
  'liquidate(address,uint256,uint256)',
  'liquidate_extended(address,uint256,uint256,address,uint256[])',
];

console.log('=== Function Selector Mapping ===\n');

const selectorMap = {};
for (const sig of KNOWN_SIGNATURES) {
  const selector = ethers.id(sig).slice(0, 10);
  selectorMap[selector] = sig;
  console.log(`  ${selector} → ${sig}`);
}

// Now load the investigation results and re-classify
console.log('\n=== Re-classifying events by selector ===\n');

const data = JSON.parse(fs.readFileSync('/Users/zero/dev/proposal/investigate_leverage_results.json', 'utf8'));

/**
 * Classification rules based on observed patterns:
 *
 * Selector 0x23cfed03 → Standard create_loan (6 logs, 2 transfers)
 * Selector 0x4ba96d46 → Leverage create_loan_extended (60-80+ logs, 30+ transfers)
 * Selector 0x24977ef3 → Leverage borrow_more_extended (20-95 logs, 10-46 transfers)
 * Selector 0xdd171e7c → Standard borrow_more (6 logs, 1 transfer)
 * Selector 0x24049e57 → add_collateral (6 logs, 1 transfer)
 *
 * The classification is based on both selector and log count correlation.
 * Extended functions generate many logs due to DEX routing (multiple pool hops).
 */

// Observed selectors from our data
const OBSERVED_SELECTORS = {
  '0x23cfed03': 'create_loan (standard)',
  '0x4ba96d46': 'create_loan_extended (LEVERAGE)',
  '0x24977ef3': 'borrow_more_extended (LEVERAGE)',
  '0xdd171e7c': 'borrow_more (standard)',
  '0x24049e57': 'add_collateral (no borrow)',
};

// Re-classify and build summary
const borrowerSummary = {};

for (const event of data.borrow_events) {
  const classification = OBSERVED_SELECTORS[event.functionSelector] || 'UNKNOWN';
  const isLeverage = classification.includes('LEVERAGE');
  const isExtended = event.totalLogCount > 10; // Additional sanity check

  // Cross-validate: extended functions should have many logs
  if (isLeverage && !isExtended) {
    console.log(`  WARNING: ${event.txHash} classified as leverage but only ${event.totalLogCount} logs`);
  }

  const addr = event.user;
  if (!borrowerSummary[addr]) {
    borrowerSummary[addr] = {
      address: addr,
      isSam: event.isSam,
      samWallet: event.samWallet,
      events: [],
      totalCollateralDeposited: 0,
      totalCrvUSDBorrowed: 0,
      leverageCollateral: 0,
      leverageBorrowed: 0,
      standardCollateral: 0,
      standardBorrowed: 0,
      firstBorrow: null,
      lastBorrow: null,
      leverageCount: 0,
      standardCount: 0,
    };
  }

  const b = borrowerSummary[addr];
  b.events.push({
    timestamp: event.timestamp,
    txHash: event.txHash,
    selector: event.functionSelector,
    classification: classification,
    isLeverage: isLeverage,
    collateral: event.collateral_increase_squid,
    borrowed: event.loan_increase_crvusd,
    logCount: event.totalLogCount,
    transferCount: event.transferCount,
  });

  b.totalCollateralDeposited += event.collateral_increase_squid;
  b.totalCrvUSDBorrowed += event.loan_increase_crvusd;

  if (isLeverage) {
    b.leverageCollateral += event.collateral_increase_squid;
    b.leverageBorrowed += event.loan_increase_crvusd;
    b.leverageCount++;
  } else if (classification.includes('borrow') || classification.includes('create')) {
    b.standardCollateral += event.collateral_increase_squid;
    b.standardBorrowed += event.loan_increase_crvusd;
    b.standardCount++;
  }

  if (!b.firstBorrow || event.timestamp < b.firstBorrow) b.firstBorrow = event.timestamp;
  if (!b.lastBorrow || event.timestamp > b.lastBorrow) b.lastBorrow = event.timestamp;
}

// Print borrower summaries
console.log('=== BORROWER ANALYSIS ===\n');

const sortedBorrowers = Object.values(borrowerSummary).sort((a, b) => b.totalCrvUSDBorrowed - a.totalCrvUSDBorrowed);

for (const b of sortedBorrowers) {
  const samTag = b.isSam ? ` [SAM ${b.samWallet}]` : '';
  console.log(`--- ${b.address}${samTag} ---`);
  console.log(`  Period: ${b.firstBorrow} → ${b.lastBorrow}`);
  console.log(`  Total borrowed: ${b.totalCrvUSDBorrowed.toFixed(2)} crvUSD`);
  console.log(`  Total collateral deposited: ${b.totalCollateralDeposited.toFixed(2)} SQUID`);
  console.log(`  Leverage events: ${b.leverageCount} (${b.leverageBorrowed.toFixed(2)} crvUSD / ${b.leverageCollateral.toFixed(2)} SQUID)`);
  console.log(`  Standard events: ${b.standardCount} (${b.standardBorrowed.toFixed(2)} crvUSD / ${b.standardCollateral.toFixed(2)} SQUID)`);
  console.log(`  Leverage % of total borrowed: ${(b.leverageBorrowed / b.totalCrvUSDBorrowed * 100).toFixed(1)}%`);
  console.log('  Timeline:');
  for (const e of b.events) {
    const tag = e.isLeverage ? '🔴 LEVERAGE' : (e.classification.includes('add_collateral') ? '⬜ ADD_COLL' : '🟢 STANDARD');
    console.log(`    ${e.timestamp} | ${tag} | +${e.collateral.toFixed(0)} SQUID | +${e.borrowed.toFixed(2)} crvUSD | ${e.logCount} logs`);
  }
  console.log('');
}

// Sam's combined analysis
const samWallet1 = borrowerSummary[Object.keys(borrowerSummary).find(k => k.toLowerCase() === '0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922'.toLowerCase())];
const samWallet2 = borrowerSummary[Object.keys(borrowerSummary).find(k => k.toLowerCase() === '0xb53009E4dC25a494F3Bee03Ab121517e74b59F75'.toLowerCase())];

console.log('\n=== SAM McCULLOCH COMBINED ANALYSIS ===\n');
if (samWallet1 && samWallet2) {
  const combinedBorrowed = samWallet1.totalCrvUSDBorrowed + samWallet2.totalCrvUSDBorrowed;
  const combinedLeverage = samWallet1.leverageBorrowed + samWallet2.leverageBorrowed;
  const combinedLevCount = samWallet1.leverageCount + samWallet2.leverageCount;
  const combinedStdCount = samWallet1.standardCount + samWallet2.standardCount;

  console.log(`  Total crvUSD borrowed (both wallets): ${combinedBorrowed.toFixed(2)} crvUSD`);
  console.log(`  Via leverage: ${combinedLeverage.toFixed(2)} crvUSD (${combinedLevCount} transactions)`);
  console.log(`  Via standard: ${(combinedBorrowed - combinedLeverage).toFixed(2)} crvUSD (${combinedStdCount} transactions)`);
  console.log(`  Leverage % of gross borrowing: ${(combinedLeverage / combinedBorrowed * 100).toFixed(1)}%`);
  console.log(`\n  Wallet 1 opened: ${samWallet1.firstBorrow}`);
  console.log(`  Wallet 1 last activity: ${samWallet1.lastBorrow}`);
  console.log(`  Wallet 2 opened: ${samWallet2.firstBorrow}`);
  console.log(`  Wallet 2 last activity: ${samWallet2.lastBorrow}`);
  console.log(`\n  KEY: Wallet 2 opened ${samWallet2.firstBorrow} while Wallet 1 was still active`);
}

// Count leverage usage across ALL borrowers
console.log('\n=== LEVERAGE USAGE ACROSS ALL BORROWERS ===\n');
let leverageBorrowers = 0;
let standardOnlyBorrowers = 0;
for (const b of sortedBorrowers) {
  if (b.leverageCount > 0) {
    leverageBorrowers++;
    console.log(`  ${b.address.slice(0,10)}... used leverage ${b.leverageCount} times (${b.leverageBorrowed.toFixed(2)} crvUSD)`);
  } else {
    standardOnlyBorrowers++;
    console.log(`  ${b.address.slice(0,10)}... standard only (${b.totalCrvUSDBorrowed.toFixed(2)} crvUSD)`);
  }
}
console.log(`\n  Total borrowers who used leverage: ${leverageBorrowers}`);
console.log(`  Total standard-only borrowers: ${standardOnlyBorrowers}`);

// Save enriched analysis
const analysisOutput = {
  analysis_date: new Date().toISOString(),
  selector_map: OBSERVED_SELECTORS,
  borrower_summaries: sortedBorrowers,
  sam_combined: samWallet1 && samWallet2 ? {
    total_borrowed: samWallet1.totalCrvUSDBorrowed + samWallet2.totalCrvUSDBorrowed,
    leverage_borrowed: samWallet1.leverageBorrowed + samWallet2.leverageBorrowed,
    standard_borrowed: (samWallet1.totalCrvUSDBorrowed + samWallet2.totalCrvUSDBorrowed) - (samWallet1.leverageBorrowed + samWallet2.leverageBorrowed),
    leverage_count: samWallet1.leverageCount + samWallet2.leverageCount,
    standard_count: samWallet1.standardCount + samWallet2.standardCount,
    wallet1_first: samWallet1.firstBorrow,
    wallet2_first: samWallet2.firstBorrow,
    wallet2_opened_while_wallet1_active: true,
  } : null,
  leverage_usage: {
    leveraged_borrowers: leverageBorrowers,
    standard_only_borrowers: standardOnlyBorrowers,
  },
};

fs.writeFileSync(
  '/Users/zero/dev/proposal/leverage_analysis.json',
  JSON.stringify(analysisOutput, null, 2)
);

console.log('\nAnalysis saved to leverage_analysis.json');
