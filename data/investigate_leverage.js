/**
 * investigate_leverage.js
 *
 * Traces all borrowing events on the SQUID/crvUSD LlamaLend controller on Fraxtal.
 * Specifically investigates:
 * 1. Whether borrowers used leverage (create_loan_extended / borrow_more_extended)
 * 2. Timeline of Sam's borrowing across two wallets
 * 3. SQUID price at the time of each borrow event
 * 4. Pool deployment parameters vs actual market conditions
 *
 * The controller address is 0xBF55Bb9463bBbB6aD724061910a450939E248eA6 on Fraxtal (chain 252).
 * Sam's wallets:
 *   Wallet 1: 0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922
 *   Wallet 2: 0xb53009E4dC25a494F3Bee03Ab121517e74b59F75
 */

const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://rpc.frax.com');

// Contract addresses on Fraxtal
const CONTROLLER = '0xBF55Bb9463bBbB6aD724061910a450939E248eA6';
const VAULT = '0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e';
const AMM = '0x8fecf70b90ed40512c0608565eb9a53af0ef42ad';
const FACTORY = '0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66';
const SQUID = '0x6e58089d8E8f664823d26454f49A5A0f2fF697Fe';

// Sam's wallet addresses
const SAM_WALLET_1 = '0x81f9B40Dee106a4C5822aED7641D5C1e2B40F922';
const SAM_WALLET_2 = '0xb53009E4dC25a494F3Bee03Ab121517e74b59F75';

// All borrower addresses from the pool
const ALL_BORROWERS = [
  '0xb51074Da03c55E79e3526cF6bBf31873443EfC63',
  SAM_WALLET_1,
  '0xccBF601eB2f5AA2D5d68b069610da6F1627D485d',
  '0xac844ADA82F3d0241533d827ebF84deb89617792',
  SAM_WALLET_2,
];

/**
 * Controller ABI - includes standard and extended (leverage) loan functions.
 *
 * Standard functions: create_loan, borrow_more, repay
 * Extended (leverage) functions: create_loan_extended, borrow_more_extended
 *
 * The "extended" variants include a callback mechanism that routes through a
 * DEX to swap borrowed crvUSD back into SQUID collateral, enabling leverage loops
 * in a single transaction.
 */
const controllerAbi = [
  // Events - these are emitted when loans are created or modified
  'event Borrow(address indexed user, uint256 collateral_increase, uint256 loan_increase)',
  'event Repay(address indexed user, uint256 collateral_decrease, uint256 loan_decrease)',
  'event Liquidate(address indexed liquidator, address indexed user, uint256 collateral_received, uint256 stablecoin_received, uint256 debt)',
  'event UserState(address indexed user, uint256 collateral, uint256 debt, int256 n1, int256 n2, uint256 liquidation_discount)',

  // Read functions for current state
  'function total_debt() view returns (uint256)',
  'function n_loans() view returns (uint256)',
  'function loans(uint256) view returns (address)',
  'function debt(address) view returns (uint256)',
  'function health(address) view returns (int256)',
  'function user_state(address) view returns (uint256[4])',
];

/**
 * AMM ABI - used to get oracle price and pool price at any point in time.
 * The AMM (LLAMMA) maintains both an oracle price and an internal price that
 * diverge when soft-liquidation occurs.
 */
const ammAbi = [
  'function price_oracle() view returns (uint256)',
  'function get_p() view returns (uint256)',
  'function get_base_price() view returns (uint256)',
];

/**
 * Factory ABI - used to find when the market was deployed.
 */
const factoryAbi = [
  'function market_count() view returns (uint256)',
];

async function main() {
  const controller = new ethers.Contract(CONTROLLER, controllerAbi, provider);
  const amm = new ethers.Contract(AMM, ammAbi, provider);

  console.log('=== SQUID/crvUSD LlamaLend Leverage Investigation ===\n');

  // Step 1: Get all Borrow events from the controller (all time)
  // This captures every loan creation and borrow_more event
  console.log('[1] Fetching all Borrow events from controller...');

  // Get the deployment block - search from a reasonable start (Fraxtal launched ~early 2024)
  // We'll search from block 0 or a reasonable starting point
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  // Fetch Borrow events in chunks (Fraxtal might have block range limits)
  const CHUNK = 100000;
  let allBorrowEvents = [];

  // Start from block 1 (or the factory deployment block)
  // Fraxtal's first blocks are around late 2023/early 2024
  let startBlock = 0;

  for (let from = startBlock; from < currentBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, currentBlock);
    try {
      const events = await controller.queryFilter('Borrow', from, to);
      if (events.length > 0) {
        allBorrowEvents.push(...events);
        console.log(`  Found ${events.length} Borrow events in blocks ${from}-${to}`);
      }
    } catch (e) {
      // If block range too large, try smaller chunks
      if (e.message && e.message.includes('range')) {
        const SMALL_CHUNK = 10000;
        for (let sf = from; sf < to; sf += SMALL_CHUNK) {
          const st = Math.min(sf + SMALL_CHUNK - 1, to);
          try {
            const events = await controller.queryFilter('Borrow', sf, st);
            if (events.length > 0) {
              allBorrowEvents.push(...events);
              console.log(`  Found ${events.length} Borrow events in blocks ${sf}-${st}`);
            }
          } catch (e2) {
            console.log(`  Error in blocks ${sf}-${st}: ${e2.message.slice(0, 80)}`);
          }
        }
      } else {
        console.log(`  Error in blocks ${from}-${to}: ${e.message.slice(0, 80)}`);
      }
    }
  }

  console.log(`\nTotal Borrow events found: ${allBorrowEvents.length}\n`);

  // Step 2: For each Borrow event, get the full transaction to check if it was
  // a standard create_loan or an extended (leverage) create_loan_extended
  console.log('[2] Analyzing each Borrow event for leverage usage...\n');

  // Function selectors for standard vs leverage loan creation/modification:
  // create_loan(address,uint256,uint256,uint256) -> first 4 bytes of keccak
  // create_loan_extended(address,uint256,uint256,uint256,address,uint256[]) -> leverage variant
  // borrow_more(address,uint256,uint256) -> standard
  // borrow_more_extended(address,uint256,uint256,address,uint256[]) -> leverage variant

  // We'll decode the function selector from each transaction's input data
  // Common selectors for Curve LlamaLend controller:
  const SELECTORS = {
    // Standard operations (no leverage)
    'create_loan': null,       // Will compute
    'borrow_more': null,
    'repay': null,
    'repay_extended': null,
    // Leverage operations (uses callback to swap crvUSD → SQUID for more collateral)
    'create_loan_extended': null,
    'borrow_more_extended': null,
  };

  // We need to check the tx data for each event
  const results = [];

  for (const event of allBorrowEvents) {
    const tx = await provider.getTransaction(event.transactionHash);
    const block = await provider.getBlock(event.blockNumber);
    const receipt = await provider.getTransactionReceipt(event.transactionHash);

    // Get the function selector (first 4 bytes of calldata)
    const selector = tx.data.slice(0, 10); // '0x' + 8 hex chars

    // Determine if this is a leverage operation by checking:
    // 1. The function selector
    // 2. Whether the tx interacted with a DEX/router (callback pattern)
    // 3. Whether there are swap events in the receipt

    // Check for swap events in the receipt logs (indicates a DEX swap happened,
    // meaning the borrowed crvUSD was swapped back to SQUID = leverage)
    const swapTopics = receipt.logs.filter(log => {
      // Common swap event signatures
      // TokenExchange: keccak256("TokenExchange(address,uint256,uint256,uint256,uint256)")
      // Swap: various DEX swap events
      return log.topics.length > 0;
    });

    // Count Transfer events to detect leverage pattern:
    // Standard loan: SQUID transfer IN (collateral deposit) + crvUSD transfer OUT (borrow)
    // Leverage loan: SQUID transfer IN + crvUSD transfer OUT + crvUSD→SQUID swap + SQUID transfer IN again
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const transferLogs = receipt.logs.filter(l => l.topics[0] === transferTopic);

    // Check specifically for TokenExchange events from Curve pools (leverage indicator)
    const tokenExchangeTopic = ethers.id('TokenExchange(address,uint256,uint256,uint256,uint256)');
    const tokenExchangeLogs = receipt.logs.filter(l => l.topics[0] === tokenExchangeTopic);

    const user = event.args[0]; // borrower address
    const collateralIncrease = ethers.formatUnits(event.args[1], 18);
    const loanIncrease = ethers.formatUnits(event.args[2], 18);

    const isSam = user.toLowerCase() === SAM_WALLET_1.toLowerCase() ||
                  user.toLowerCase() === SAM_WALLET_2.toLowerCase();

    // Leverage detection: if there's a TokenExchange in the same tx as a Borrow,
    // it means the borrowed crvUSD was swapped for more collateral in one atomic tx
    const hasSwap = tokenExchangeLogs.length > 0;

    // Also check if the collateral amount deposited is suspiciously high relative
    // to the sender's SQUID balance (would indicate leveraged deposit)

    const eventData = {
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      timestamp: block ? new Date(block.timestamp * 1000).toISOString() : 'unknown',
      user: user,
      isSam: isSam,
      samWallet: isSam ? (user.toLowerCase() === SAM_WALLET_1.toLowerCase() ? 'Wallet1' : 'Wallet2') : null,
      collateral_increase_squid: parseFloat(collateralIncrease),
      loan_increase_crvusd: parseFloat(loanIncrease),
      functionSelector: selector,
      totalLogCount: receipt.logs.length,
      transferCount: transferLogs.length,
      hasTokenExchange: hasSwap,
      tokenExchangeCount: tokenExchangeLogs.length,
      isLikelyLeverage: hasSwap, // TokenExchange in a Borrow tx = leverage
      gasUsed: receipt.gasUsed.toString(),
      txFrom: tx.from,
    };

    results.push(eventData);

    // Print summary for each event
    const leverageTag = hasSwap ? ' ** LEVERAGE **' : '';
    const samTag = isSam ? ` [SAM ${eventData.samWallet}]` : '';
    console.log(`  ${eventData.timestamp} | ${user.slice(0,10)}...${samTag}`);
    console.log(`    Collateral +${collateralIncrease} SQUID | Borrowed +${loanIncrease} crvUSD${leverageTag}`);
    console.log(`    Tx: ${event.transactionHash}`);
    console.log(`    Logs: ${receipt.logs.length} total, ${transferLogs.length} transfers, ${tokenExchangeLogs.length} swaps`);
    console.log(`    Selector: ${selector} | Gas: ${receipt.gasUsed.toString()}`);
    console.log('');
  }

  // Step 3: Also fetch Repay and Liquidate events
  console.log('\n[3] Fetching Repay events...');
  let allRepayEvents = [];
  for (let from = startBlock; from < currentBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, currentBlock);
    try {
      const events = await controller.queryFilter('Repay', from, to);
      if (events.length > 0) {
        allRepayEvents.push(...events);
      }
    } catch (e) {
      // skip errors
    }
  }
  console.log(`Total Repay events: ${allRepayEvents.length}`);

  for (const event of allRepayEvents) {
    const block = await provider.getBlock(event.blockNumber);
    const user = event.args[0];
    const collDecrease = ethers.formatUnits(event.args[1], 18);
    const loanDecrease = ethers.formatUnits(event.args[2], 18);
    const isSam = user.toLowerCase() === SAM_WALLET_1.toLowerCase() ||
                  user.toLowerCase() === SAM_WALLET_2.toLowerCase();
    const samTag = isSam ? ` [SAM]` : '';
    console.log(`  ${new Date(block.timestamp * 1000).toISOString()} | ${user.slice(0,10)}...${samTag} | Repaid ${loanDecrease} crvUSD | Released ${collDecrease} SQUID`);
  }

  console.log('\n[4] Fetching Liquidate events...');
  let allLiqEvents = [];
  for (let from = startBlock; from < currentBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, currentBlock);
    try {
      const events = await controller.queryFilter('Liquidate', from, to);
      if (events.length > 0) {
        allLiqEvents.push(...events);
      }
    } catch (e) {
      // skip errors
    }
  }
  console.log(`Total Liquidate events: ${allLiqEvents.length}`);

  for (const event of allLiqEvents) {
    const block = await provider.getBlock(event.blockNumber);
    const liquidator = event.args[0];
    const user = event.args[1];
    const collReceived = ethers.formatUnits(event.args[2], 18);
    const stableReceived = ethers.formatUnits(event.args[3], 18);
    const debt = ethers.formatUnits(event.args[4], 18);
    const isSam = user.toLowerCase() === SAM_WALLET_1.toLowerCase() ||
                  user.toLowerCase() === SAM_WALLET_2.toLowerCase();
    const samTag = isSam ? ` [SAM]` : '';
    console.log(`  ${new Date(block.timestamp * 1000).toISOString()} | Liquidated: ${user.slice(0,10)}...${samTag}`);
    console.log(`    Debt: ${debt} crvUSD | Coll received: ${collReceived} SQUID | Stable received: ${stableReceived} crvUSD`);
    console.log(`    Liquidator: ${liquidator}`);
  }

  // Step 5: Get AMM base_price (set at pool creation, reflects the SQUID price
  // the pool parameters were calibrated against)
  console.log('\n[5] Pool base price and current oracle price...');
  const basePrice = await amm.get_base_price();
  const oraclePrice = await amm.price_oracle();
  const currentP = await amm.get_p();
  console.log(`  Base price (set at deployment): ${ethers.formatUnits(basePrice, 18)} crvUSD per SQUID`);
  console.log(`  Current oracle price: ${ethers.formatUnits(oraclePrice, 18)} crvUSD per SQUID`);
  console.log(`  Current AMM price: ${ethers.formatUnits(currentP, 18)} crvUSD per SQUID`);

  // Step 6: Output full JSON for analysis
  console.log('\n[6] Writing full results to investigate_leverage_results.json...');

  const output = {
    investigation_date: new Date().toISOString(),
    chain: 'Fraxtal (252)',
    controller: CONTROLLER,
    sam_wallets: { wallet_1: SAM_WALLET_1, wallet_2: SAM_WALLET_2 },
    pool_prices: {
      base_price_at_deployment: ethers.formatUnits(basePrice, 18),
      current_oracle_price: ethers.formatUnits(oraclePrice, 18),
      current_amm_price: ethers.formatUnits(currentP, 18),
    },
    borrow_events: results,
    total_borrow_events: results.length,
    sam_borrow_events: results.filter(r => r.isSam).length,
    leverage_events: results.filter(r => r.isLikelyLeverage).length,
    sam_leverage_events: results.filter(r => r.isSam && r.isLikelyLeverage).length,
  };

  require('fs').writeFileSync(
    '/Users/zero/dev/proposal/investigate_leverage_results.json',
    JSON.stringify(output, null, 2)
  );

  console.log('\nDone. Results saved.');

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total Borrow events: ${results.length}`);
  console.log(`Sam's Borrow events: ${results.filter(r => r.isSam).length}`);
  console.log(`Events with leverage (TokenExchange): ${results.filter(r => r.isLikelyLeverage).length}`);
  console.log(`Sam's leverage events: ${results.filter(r => r.isSam && r.isLikelyLeverage).length}`);
  console.log(`\nSam's chronological borrowing:`);
  results.filter(r => r.isSam).sort((a,b) => a.blockNumber - b.blockNumber).forEach(r => {
    console.log(`  ${r.timestamp} | ${r.samWallet} | +${r.collateral_increase_squid.toFixed(2)} SQUID collateral | +${r.loan_increase_crvusd.toFixed(2)} crvUSD borrowed | Leverage: ${r.isLikelyLeverage}`);
  });
}

main().catch(console.error);
