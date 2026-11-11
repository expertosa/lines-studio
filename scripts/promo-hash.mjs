// Print the hash to add a promo code to lib/promo.js. Usage: node scripts/promo-hash.mjs CODE
import { createHash } from 'node:crypto';
import { normalizeCode } from '../lib/promo.js';

const code = normalizeCode(process.argv[2]);
if (code.length < 3) {
  console.error('Usage: node scripts/promo-hash.mjs CODE (at least 3 characters)');
  process.exit(1);
}
console.log(`${code}\n${createHash('sha256').update(code).digest('hex')}`);
