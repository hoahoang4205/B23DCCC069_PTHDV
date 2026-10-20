import express from 'express';
import { charge } from './bankClient.js';
import { store } from './store.js';

const app = express();
const port = Number(process.env.PORT || 4001);
const bankUrl = process.env.BANK_URL || 'http://localhost:4002';

app.use(express.json());

app.get('/students/:id/fees', (req, res) => {
  const studentId = Number(req.params.id);
  const student = store.students[studentId];
  if (!student) return res.status(404).json({ error: 'STUDENT_NOT_FOUND' });
  return res.json({ studentId, debt: student.debt });
});

app.post('/students/:id/payments', async (req, res) => {
  const studentId = Number(req.params.id);
  const student = store.students[studentId];
  if (!student) {
    return res.status(404).json({ error: 'STUDENT_NOT_FOUND', paymentId: null, status: 'FAILED' });
  }

  const idempotencyKey = req.get('Idempotency-Key');
  if (idempotencyKey && store.idempotency.has(idempotencyKey)) {
    const paymentId = store.idempotency.get(idempotencyKey);
    const payment = store.payments.get(paymentId);
    return res.status(payment.httpStatus).json(payment.body);
  }

  const { amount } = req.body ?? {};
  if (typeof amount !== 'number' || amount <= 0 || amount > student.debt) {
    return res.status(400).json({ error: 'INVALID_AMOUNT', paymentId: null, status: 'FAILED' });
  }

  const paymentId = `P${store.nextPaymentSeq++}`;
  const result = await charge({ paymentId, amount });

  let httpStatus;
  let body;

  if (result.kind === 'PAID') {
    student.debt -= amount;
    httpStatus = 201;
    body = {
      paymentId,
      status: 'PAID',
      amount,
      chargeId: result.body?.chargeId,
      remainingDebt: student.debt,
    };
  } else if (result.kind === 'REJECTED') {
    httpStatus = result.httpStatus;
    body = {
      error: result.body?.error || 'REJECTED_BY_BANK',
      paymentId,
      status: 'FAILED',
    };
  } else if (result.kind === 'UNAVAILABLE') {
    httpStatus = 503;
    body = { error: 'BANK_UNAVAILABLE', paymentId, status: 'FAILED' };
  } else {
    httpStatus = 504;
    body = { error: 'BANK_UNKNOWN', paymentId, status: 'PENDING' };
  }

  const payment = { paymentId, studentId, amount, httpStatus, body, kind: result.kind, attempts: result.attempts };
  store.payments.set(paymentId, payment);
  if (idempotencyKey) store.idempotency.set(idempotencyKey, paymentId);
  return res.status(httpStatus).json(body);
});

app.get('/debug/students', (req, res) => {
  res.json(store.students);
});

app.get('/debug/payments', (req, res) => {
  res.json(Array.from(store.payments.values()));
});

app.listen(port, () => {
  console.log(`[fee] listening on ${port} BANK_URL=${bankUrl}`);
});