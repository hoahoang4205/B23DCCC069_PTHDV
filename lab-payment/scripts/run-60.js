import { getJson } from './measure.js';

const feeUrl = process.env.FEE_URL || 'http://localhost:4001';
const bankUrl = process.env.BANK_URL || 'http://localhost:4002';
const timestamp = Date.now();

const [statsBefore, feesBefore] = await Promise.all([
  getJson(`${bankUrl}/stats`),
  getJson(`${feeUrl}/students/1/fees`),
]);

const counts = { 201: 0, 504: 0, other: 0 };
for (let index = 0; index < 60; index += 1) {
  const result = await getJson(`${feeUrl}/students/1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `run60-${timestamp}-${index}`,
    },
    body: JSON.stringify({ amount: 1000 }),
  });
  if (result.status === 201) counts[201] += 1;
  else if (result.status === 504) counts[504] += 1;
  else counts.other += 1;
}

const [statsAfter, feesAfter] = await Promise.all([
  getJson(`${bankUrl}/stats`),
  getJson(`${feeUrl}/students/1/fees`),
]);

const chargesDelta = statsAfter.body.charges - statsBefore.body.charges;
const duplicatesDelta = statsAfter.body.duplicates - statsBefore.body.duplicates;
const debtDelta = feesBefore.body.debt - feesAfter.body.debt;
const expectedDebtDelta = counts[201] * 1000;

console.log({
  status201: counts[201],
  status504: counts[504],
  statusOther: counts.other,
  chargesDelta,
  duplicatesDelta,
  debtDelta,
  expectedDebtDelta,
  matchDebt: debtDelta === expectedDebtDelta,
});