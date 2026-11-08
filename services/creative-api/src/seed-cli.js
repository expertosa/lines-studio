import { openStore } from './store.js';

const dataDir = process.argv[2];
const attempt = Number(process.argv[3] || '1');
if (!dataDir || !Number.isInteger(attempt)) {
  console.error('usage: node src/seed-cli.js <dataDir> <attempt>');
  process.exit(1);
}

const store = openStore(dataDir);
const job = store.seedJob({
  status: 'running',
  attempt,
  maxAttempts: 2,
  tenantId: 'tenant-a',
  customerId: 'cust-a',
});
store.close();
process.stdout.write(`${job.id}\n`);
