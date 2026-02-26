const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://rpc.frax.com');

// Vault contract (ERC-4626) — lenders deposit crvUSD, receive cvcrvUSD shares
const VAULT = '0x5071ae9579db394f0a62e2fd3cefa6a1c434f61e';

// ERC-20 Transfer event: mints are Transfer(address(0), to, amount)
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ZERO_ADDR_PADDED = '0x' + '0'.repeat(64);

const vaultAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
  'function pricePerShare() view returns (uint256)',
  'function decimals() view returns (uint8)',
];

async function main() {
  const vault = new ethers.Contract(VAULT, vaultAbi, provider);

  // Get current vault state
  const [totalSupply, pricePerShare, decimals] = await Promise.all([
    vault.totalSupply(),
    vault.pricePerShare(),
    vault.decimals(),
  ]);

  console.log('=== SQUID/crvUSD Vault Lender Analysis ===');
  console.log('Vault:', VAULT);
  console.log('Total Shares:', ethers.formatUnits(totalSupply, decimals));
  console.log('Price/Share:', ethers.formatUnits(pricePerShare, decimals));
  console.log('');

  // Fetch all Transfer events FROM zero address (mints = deposits)
  // Vault was created Sept 2024, scan from a reasonable start block
  // Fraxtal launched mid-2024, blocks are ~2s
  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);

  // Scan in chunks to avoid RPC limits
  // Start from block 0 or a reasonable genesis — Fraxtal is relatively young
  const CHUNK = 50000;
  const START_BLOCK = 1; // scan from beginning to catch all deposits

  const depositors = new Set();
  const depositEvents = [];

  console.log('Scanning Transfer events (mints) on vault...');

  for (let from = START_BLOCK; from <= currentBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, currentBlock);

    try {
      const logs = await provider.getLogs({
        address: VAULT,
        topics: [TRANSFER_TOPIC, ZERO_ADDR_PADDED], // from = zero address = mint
        fromBlock: from,
        toBlock: to,
      });

      for (const log of logs) {
        // topic[2] is the 'to' address (the depositor)
        const depositor = '0x' + log.topics[2].slice(26);
        depositors.add(depositor.toLowerCase());

        const amount = BigInt(log.data);
        depositEvents.push({
          depositor: ethers.getAddress(depositor),
          shares: amount,
          block: log.blockNumber,
          tx: log.transactionHash,
        });
      }
    } catch (e) {
      // If chunk too large, try smaller
      console.log(`  Warning at blocks ${from}-${to}: ${e.message.slice(0, 80)}`);
    }

    // Progress indicator every 500k blocks
    if ((from - START_BLOCK) % 500000 < CHUNK) {
      process.stdout.write(`  Scanned to block ${to}/${currentBlock}\r`);
    }
  }

  console.log(`\nFound ${depositEvents.length} deposit events from ${depositors.size} unique addresses\n`);

  // Now check current balances for all depositors
  console.log('=== CURRENT VAULT SHARE HOLDERS ===');
  const holders = [];

  for (const addr of depositors) {
    const checksumAddr = ethers.getAddress(addr);
    const balance = await vault.balanceOf(checksumAddr);

    if (balance > 0n) {
      // Convert shares to crvUSD value
      const assetsValue = balance * pricePerShare / (10n ** BigInt(decimals));

      holders.push({
        address: checksumAddr,
        shares: balance,
        shares_formatted: ethers.formatUnits(balance, decimals),
        crvusd_value: ethers.formatUnits(assetsValue, decimals),
      });
    }
  }

  // Sort by shares descending
  holders.sort((a, b) => (b.shares > a.shares ? 1 : -1));

  // Also check for transfers TO non-zero (secondary market holders who never minted)
  // by scanning Transfer events where 'from' is NOT zero
  // But first, let's display what we have

  console.log(`Active holders (non-zero balance): ${holders.length}\n`);

  let totalSharesHeld = 0n;
  for (const h of holders) {
    const pct = (Number(h.shares) / Number(totalSupply) * 100).toFixed(2);
    console.log(`${h.address}`);
    console.log(`  Shares:     ${h.shares_formatted}`);
    console.log(`  crvUSD val: ${h.crvusd_value}`);
    console.log(`  % of vault: ${pct}%`);
    console.log('');
    totalSharesHeld += h.shares;
  }

  // Check if there are holders we missed (received shares via transfer, not mint)
  const missedShares = totalSupply - totalSharesHeld;
  if (missedShares > 0n) {
    console.log(`--- WARNING: ${ethers.formatUnits(missedShares, decimals)} shares unaccounted for`);
    console.log('   (held by addresses that received shares via transfer, not direct deposit)');
    console.log('   Scanning transfer recipients...\n');

    // Get all unique 'to' addresses from all transfers (not just mints)
    const allRecipients = new Set();
    for (let from = START_BLOCK; from <= currentBlock; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, currentBlock);
      try {
        const logs = await provider.getLogs({
          address: VAULT,
          topics: [TRANSFER_TOPIC],
          fromBlock: from,
          toBlock: to,
        });
        for (const log of logs) {
          const recipient = '0x' + log.topics[2].slice(26);
          allRecipients.add(recipient.toLowerCase());
        }
      } catch (e) {
        // skip
      }
    }

    // Check balances for recipients not already in depositors
    for (const addr of allRecipients) {
      if (depositors.has(addr)) continue;
      const checksumAddr = ethers.getAddress(addr);
      const balance = await vault.balanceOf(checksumAddr);
      if (balance > 0n) {
        const assetsValue = balance * pricePerShare / (10n ** BigInt(decimals));
        const pct = (Number(balance) / Number(totalSupply) * 100).toFixed(2);
        console.log(`${checksumAddr} (received via transfer)`);
        console.log(`  Shares:     ${ethers.formatUnits(balance, decimals)}`);
        console.log(`  crvUSD val: ${ethers.formatUnits(assetsValue, decimals)}`);
        console.log(`  % of vault: ${pct}%`);
        console.log('');
        holders.push({
          address: checksumAddr,
          shares: balance,
          shares_formatted: ethers.formatUnits(balance, decimals),
          crvusd_value: ethers.formatUnits(assetsValue, decimals),
          via_transfer: true,
        });
      }
    }
  }

  // Print deposit history
  console.log('\n=== DEPOSIT HISTORY (chronological) ===');
  for (const d of depositEvents) {
    const block = await provider.getBlock(d.block);
    const date = block ? new Date(block.timestamp * 1000).toISOString().split('T')[0] : 'unknown';
    console.log(`${date} | ${d.depositor} | ${ethers.formatUnits(d.shares, decimals)} shares | block ${d.block} | tx ${d.tx}`);
  }

  // JSON output
  const output = {
    timestamp: new Date().toISOString(),
    vault: VAULT,
    total_supply: ethers.formatUnits(totalSupply, decimals),
    price_per_share: ethers.formatUnits(pricePerShare, decimals),
    holders: holders.map(h => ({
      address: h.address,
      shares: h.shares_formatted,
      crvusd_value: h.crvusd_value,
      pct_of_vault: (Number(h.shares) / Number(totalSupply) * 100).toFixed(2),
      via_transfer: h.via_transfer || false,
    })),
    deposit_events: depositEvents.map(d => ({
      depositor: d.depositor,
      shares: ethers.formatUnits(d.shares, decimals),
      block: d.block,
      tx: d.tx,
    })),
  };

  const fs = require('fs');
  fs.writeFileSync('/Users/zero/dev/proposal/lender_data.json', JSON.stringify(output, null, 2));
  console.log('\nData written to lender_data.json');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
