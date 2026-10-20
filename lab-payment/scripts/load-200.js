import { getJson } from './measure.js';

const feeUrl = process.env.FEE_URL || 'http://localhost:4001';
const bankUrl = process.env.BANK_URL || 'http://localhost:4002';
const timestamp = Date.now();

const before = await getJson(`${bankUrl}/stats`);
const startedAt = Date.now();
let nextIndex = 0;
let ok = 0;
let fail = 0;

async function worker() {
  while (nextIndex < 200) {
    const index = nextIndex++;
    const result = await getJson(`${feeUrl}/students/1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `load-${timestamp}-${index}`,
      },
      body: JSON.stringify({ amount: 1000 }),
    });
    if (result.status === 201) ok += 1;
    else fail += 1;
  }
}

await Promise.all(Array.from({ length: 10 }, () => worker()));
const elapsedMs = Date.now() - startedAt;
const after = await getJson(`${bankUrl}/stats`);
const beforeStats = before.body;
const afterStats = after.body;

console.log({
  elapsedMs,
  ok,
  fail,
  connectionsDelta: afterStats.connections - beforeStats.connections,
  chargesDelta: afterStats.charges - beforeStats.charges,
  duplicatesDelta: afterStats.duplicates - beforeStats.duplicates,
});