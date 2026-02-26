const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://rpc.frax.com');

// Convex Reward Contract for SQUID/crvUSD vault (Pool #30 on Fraxtal Booster)
// Users who stake through Convex get receipt tokens from this contract
const REWARD_CONTRACT = '0x5a00dc97381c2d42901d3ea5fbb64bb0ce5aaf3a';

// Convex Booster — routes deposits to gauge via VoterProxy
const BOOSTER = '0xd3327cb05a8e0095a543d582b5b3ce3e19270389';

// Curve gauge that holds vault shares — includes both Convex and direct gauge stakers
const GAUGE = '0x0Bd2980CDc585B489dFBfce6254a2EE6eD51Bccb';

// The vault itself (for price/share conversion)
const VAULT = '0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e';

// Convex VoterProxy — the address that actually holds gauge tokens for Convex
const VOTER_PROXY = '0x989aeb4d175e16225e39e87d0d97a3360524ad80';

// Event signatures for Convex BaseRewardPool
// Staked(address indexed user, uint256 amount)
const STAKED_TOPIC = ethers.id('Staked(address,uint256)');
// Withdrawn(address indexed user, uint256 amount)
const WITHDRAWN_TOPIC = ethers.id('Withdrawn(address,uint256)');

// ERC-20 Transfer for gauge direct deposits
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ZERO_ADDR_PADDED = '0x' + '0'.repeat(64);

// ABIs — minimal interfaces for the contracts we need to query
const rewardAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

const gaugeAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

const vaultAbi = [
  'function pricePerShare() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
];

const CHUNK = 50000;

// fetchLogs: paginated log retrieval with retry on chunk size errors
async function fetchLogs(address, topics, startBlock, endBlock) {
  const allLogs = [];
  for (let from = startBlock; from <= endBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, endBlock);
    try {
      const logs = await provider.getLogs({ address, topics, fromBlock: from, toBlock: to });
      allLogs.push(...logs);
    } catch (e) {
      console.log(`  Warning at blocks ${from}-${to}: ${e.message.slice(0, 100)}`);
    }
    if ((from - startBlock) % 500000 < CHUNK) {
      process.stdout.write(`  Scanned to block ${to}/${endBlock}\r`);
    }
  }
  return allLogs;
}

async function main() {
  const currentBlock = await provider.getBlockNumber();
  console.log('=== Convex Depositor Analysis for SQUID/crvUSD Vault ===');
  console.log('Block:', currentBlock);
  console.log('');

  const vault = new ethers.Contract(VAULT, vaultAbi, provider);
  const rewardContract = new ethers.Contract(REWARD_CONTRACT, rewardAbi, provider);
  const gauge = new ethers.Contract(GAUGE, gaugeAbi, provider);

  // Get vault state for value calculations
  const [pricePerShare, decimals, vaultTotalSupply, vaultTotalAssets] = await Promise.all([
    vault.pricePerShare(),
    vault.decimals(),
    vault.totalSupply(),
    vault.totalAssets(),
  ]);

  console.log('Vault price/share:', ethers.formatUnits(pricePerShare, decimals));
  console.log('Vault total assets:', ethers.formatUnits(vaultTotalAssets, decimals), 'crvUSD');
  console.log('');

  // Get gauge and Convex totals
  const [gaugeTotalSupply, convexTotalStaked, gaugeBalOfVoterProxy] = await Promise.all([
    gauge.totalSupply(),
    rewardContract.totalSupply(),
    gauge.balanceOf(VOTER_PROXY),
  ]);

  console.log('Gauge total supply:', ethers.formatUnits(gaugeTotalSupply, decimals), 'shares');
  console.log('Convex total staked:', ethers.formatUnits(convexTotalStaked, decimals), 'shares');
  console.log('VoterProxy balance in gauge:', ethers.formatUnits(gaugeBalOfVoterProxy, decimals), 'shares');
  console.log('');

  // === PART 1: Convex depositors via Staked/Withdrawn events ===
  console.log('--- Scanning Convex Staked events ---');
  const stakedLogs = await fetchLogs(REWARD_CONTRACT, [STAKED_TOPIC], 1, currentBlock);
  console.log(`\nFound ${stakedLogs.length} Staked events`);

  console.log('\n--- Scanning Convex Withdrawn events ---');
  const withdrawnLogs = await fetchLogs(REWARD_CONTRACT, [WITHDRAWN_TOPIC], 1, currentBlock);
  console.log(`\nFound ${withdrawnLogs.length} Withdrawn events`);

  // Parse Staked events — collect unique users and their deposit history
  const convexUsers = new Set();
  const stakeEvents = [];
  const withdrawEvents = [];

  for (const log of stakedLogs) {
    // Staked(address indexed user, uint256 amount) — user is topic[1]
    const user = '0x' + log.topics[1].slice(26);
    const amount = BigInt(log.data);
    convexUsers.add(user.toLowerCase());
    stakeEvents.push({
      user: ethers.getAddress(user),
      amount,
      block: log.blockNumber,
      tx: log.transactionHash,
    });
  }

  for (const log of withdrawnLogs) {
    const user = '0x' + log.topics[1].slice(26);
    const amount = BigInt(log.data);
    convexUsers.add(user.toLowerCase());
    withdrawEvents.push({
      user: ethers.getAddress(user),
      amount,
      block: log.blockNumber,
      tx: log.transactionHash,
    });
  }

  console.log(`\nUnique Convex users (ever): ${convexUsers.size}`);
  console.log(`Total stake events: ${stakeEvents.length}`);
  console.log(`Total withdraw events: ${withdrawEvents.length}`);
  console.log('');

  // Query current balances for all Convex users
  console.log('Querying current balances...');
  const convexHolders = [];
  let activeCount = 0;

  for (const addr of convexUsers) {
    const checksumAddr = ethers.getAddress(addr);
    const balance = await rewardContract.balanceOf(checksumAddr);
    if (balance > 0n) {
      activeCount++;
      // Convert shares to crvUSD value: shares * pricePerShare / 10^decimals
      const crvusdValue = balance * pricePerShare / (10n ** BigInt(decimals));
      convexHolders.push({
        address: checksumAddr,
        shares: balance,
        shares_formatted: ethers.formatUnits(balance, decimals),
        crvusd_value: ethers.formatUnits(crvusdValue, decimals),
      });
    }
  }

  // Sort by shares descending
  convexHolders.sort((a, b) => (b.shares > a.shares ? 1 : -1));

  console.log(`\nActive Convex depositors (non-zero balance): ${activeCount}`);
  console.log(`Fully withdrawn: ${convexUsers.size - activeCount}`);
  console.log('');

  // Display active Convex holders
  console.log('=== ACTIVE CONVEX DEPOSITORS ===');
  let totalConvexShares = 0n;
  for (const h of convexHolders) {
    const pctOfConvex = (Number(h.shares) / Number(convexTotalStaked) * 100).toFixed(2);
    const pctOfVault = (Number(h.shares) / Number(vaultTotalSupply) * 100).toFixed(2);
    console.log(`${h.address}`);
    console.log(`  Shares:      ${h.shares_formatted}`);
    console.log(`  crvUSD val:  ${h.crvusd_value}`);
    console.log(`  % of Convex: ${pctOfConvex}%`);
    console.log(`  % of Vault:  ${pctOfVault}%`);
    console.log('');
    totalConvexShares += h.shares;
  }

  // === PART 2: Direct gauge depositors (non-Convex) ===
  // These are addresses that deposited vault shares directly into the gauge
  // We find them via Transfer events on the gauge token
  console.log('--- Scanning Gauge Transfer events ---');
  const gaugeTransferLogs = await fetchLogs(GAUGE, [TRANSFER_TOPIC], 1, currentBlock);
  console.log(`\nFound ${gaugeTransferLogs.length} gauge Transfer events`);

  // Collect all unique recipients of gauge tokens (excluding zero address burns)
  const gaugeRecipients = new Set();
  for (const log of gaugeTransferLogs) {
    const to = '0x' + log.topics[2].slice(26);
    if (to.toLowerCase() !== '0x' + '0'.repeat(40)) {
      gaugeRecipients.add(to.toLowerCase());
    }
  }

  // Check balances, exclude VoterProxy (that's Convex's position)
  const directGaugeStakers = [];
  for (const addr of gaugeRecipients) {
    if (addr === VOTER_PROXY.toLowerCase()) continue;
    const checksumAddr = ethers.getAddress(addr);
    const balance = await gauge.balanceOf(checksumAddr);
    if (balance > 0n) {
      const crvusdValue = balance * pricePerShare / (10n ** BigInt(decimals));
      directGaugeStakers.push({
        address: checksumAddr,
        shares: balance,
        shares_formatted: ethers.formatUnits(balance, decimals),
        crvusd_value: ethers.formatUnits(crvusdValue, decimals),
      });
    }
  }

  directGaugeStakers.sort((a, b) => (b.shares > a.shares ? 1 : -1));

  if (directGaugeStakers.length > 0) {
    console.log(`\n=== DIRECT GAUGE STAKERS (non-Convex) ===`);
    console.log(`Count: ${directGaugeStakers.length}`);
    for (const h of directGaugeStakers) {
      const pctOfVault = (Number(h.shares) / Number(vaultTotalSupply) * 100).toFixed(2);
      console.log(`${h.address}`);
      console.log(`  Shares:     ${h.shares_formatted}`);
      console.log(`  crvUSD val: ${h.crvusd_value}`);
      console.log(`  % of Vault: ${pctOfVault}%`);
      console.log('');
    }
  }

  // === BUILD JSON OUTPUT ===
  const output = {
    timestamp: new Date().toISOString(),
    block: currentBlock,
    chain: 'Fraxtal (252)',
    rpc: 'https://rpc.frax.com',
    contracts: {
      vault: VAULT,
      gauge: GAUGE,
      convex_reward_contract: REWARD_CONTRACT,
      convex_booster: BOOSTER,
      convex_voter_proxy: VOTER_PROXY,
    },
    vault_state: {
      total_supply_shares: ethers.formatUnits(vaultTotalSupply, decimals),
      total_assets_crvusd: ethers.formatUnits(vaultTotalAssets, decimals),
      price_per_share: ethers.formatUnits(pricePerShare, decimals),
    },
    gauge_summary: {
      gauge_total_supply: ethers.formatUnits(gaugeTotalSupply, decimals),
      voter_proxy_balance: ethers.formatUnits(gaugeBalOfVoterProxy, decimals),
      direct_gauge_stakers_count: directGaugeStakers.length,
    },
    convex_summary: {
      total_staked_shares: ethers.formatUnits(convexTotalStaked, decimals),
      total_staked_crvusd_value: ethers.formatUnits(
        convexTotalStaked * pricePerShare / (10n ** BigInt(decimals)),
        decimals
      ),
      pct_of_vault: (Number(convexTotalStaked) / Number(vaultTotalSupply) * 100).toFixed(2),
      unique_users_ever: convexUsers.size,
      total_stake_events: stakeEvents.length,
      total_withdraw_events: withdrawEvents.length,
      active_depositors: activeCount,
      fully_withdrawn: convexUsers.size - activeCount,
    },
    convex_active_holders: convexHolders.map(h => ({
      address: h.address,
      shares: h.shares_formatted,
      crvusd_value: h.crvusd_value,
      pct_of_convex: (Number(h.shares) / Number(convexTotalStaked) * 100).toFixed(2),
      pct_of_vault: (Number(h.shares) / Number(vaultTotalSupply) * 100).toFixed(2),
    })),
    direct_gauge_stakers: directGaugeStakers.map(h => ({
      address: h.address,
      shares: h.shares_formatted,
      crvusd_value: h.crvusd_value,
      pct_of_vault: (Number(h.shares) / Number(vaultTotalSupply) * 100).toFixed(2),
    })),
    convex_stake_events: stakeEvents.map(e => ({
      user: e.user,
      shares: ethers.formatUnits(e.amount, decimals),
      block: e.block,
      tx: e.tx,
    })),
    convex_withdraw_events: withdrawEvents.map(e => ({
      user: e.user,
      shares: ethers.formatUnits(e.amount, decimals),
      block: e.block,
      tx: e.tx,
    })),
  };

  const fs = require('fs');
  const outPath = '/Users/zero/dev/proposal/convex_lender_data.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nData written to ${outPath}`);

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log(`Convex users (ever deposited):   ${convexUsers.size}`);
  console.log(`Convex users (currently active):  ${activeCount}`);
  console.log(`Convex stake events:              ${stakeEvents.length}`);
  console.log(`Convex withdraw events:           ${withdrawEvents.length}`);
  console.log(`Direct gauge stakers:             ${directGaugeStakers.length}`);
  console.log(`Convex % of vault:                ${output.convex_summary.pct_of_vault}%`);
  console.log(`Convex crvUSD value:              ${output.convex_summary.total_staked_crvusd_value}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
