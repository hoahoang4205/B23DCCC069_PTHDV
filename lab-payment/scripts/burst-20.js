import { getJson } from './measure.js';

const feeUrl = process.env.FEE_URL || 'http://localhost:4001';
const timestamp = Date.now();
const paymentsStartedAt = Date.now();

const paymentRequests = Array.from({ length: 20 }, (_, index) =>
  getJson(`${feeUrl}/students/1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `burst-${timestamp}-${index}`,
    },
    body: JSON.stringify({ amount: 1000 }),
  })
);

const feesRequest = getJson(`${feeUrl}/students/1/fees`);
const [payments, fees] = await Promise.all([
  Promise.all(paymentRequests),
  feesRequest,
]);

const paymentElapsedMs = Date.now() - paymentsStartedAt;
const statusCounts = payments.reduce((counts, payment) => {
  counts[payment.status] = (counts[payment.status] || 0) + 1;
  return counts;
}, {});

console.log(`20 payments elapsed: ${paymentElapsedMs}ms`);
console.log('Payment status counts:', statusCounts);
console.log(`GET fees elapsed: ${fees.elapsedMs}ms, status: ${fees.status}`);
console.log('GET fees body:', fees.body);