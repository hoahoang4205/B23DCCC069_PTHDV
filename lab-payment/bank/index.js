import express from 'express';
import { store } from './store.js';

const app = express();
const port = Number(process.env.PORT || 4002);
const delayMs = Number(process.env.DELAY_MS || 0);
const failRate = Number(process.env.FAIL_RATE || 0);
const dropRate = Number(process.env.DROP_RATE || 0);
const LIMIT = 20_000_000;

app.use(express.json());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.post('/charges', async (req, res) => {
  store.stats.requests += 1;
  const idempotencyKey = req.get('Idempotency-Key');

  // Replay hợp lệ: trả lại chargeId cũ, KHÔNG trừ tiền thêm, KHÔNG tăng duplicates
  if (idempotencyKey && store.idempotency.has(idempotencyKey)) {
    return res.status(201).json({
      chargeId: store.idempotency.get(idempotencyKey),
      replayed: true,
    });
  }

  const { reference, amount } = req.body ?? {};
  if (typeof reference !== 'string' || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_CHARGE' });
  }
  if (amount > LIMIT) {
    return res.status(402).json({ error: 'LIMIT_EXCEEDED', limit: LIMIT });
  }

  // Chaos: DELAY
  if (delayMs > 0) await sleep(delayMs);

  // Chaos: FAIL trước khi trừ tiền
  if (failRate > 0 && Math.random() < failRate) {
    return res.status(500).json({ error: 'TEMPORARY_BANK_ERROR' });
  }

  // Trừ tiền
  const chargeId = `CH-${store.nextChargeSeq++}`;
  store.charges.set(chargeId, { chargeId, reference, amount, createdAt: Date.now() });
  store.stats.charges += 1;
  if (idempotencyKey) store.idempotency.set(idempotencyKey, chargeId);

  // Chaos: DROP sau khi trừ tiền (cắt socket, không trả lời)
  if (dropRate > 0 && Math.random() < dropRate) {
    req.socket.destroy();
    return;
  }

  return res.status(201).json({ chargeId });
});

app.get('/stats', (req, res) => {
  res.json({
    ...store.stats,
    chargesTotal: store.stats.charges,
    chargesStored: store.charges.size,
    idempotencyKeys: store.idempotency.size,
  });
});

const server = app.listen(port, () => {
  console.log(
    `[bank] listening on ${port}  DELAY_MS=${delayMs} FAIL_RATE=${failRate} DROP_RATE=${dropRate}`
  );
});

server.on('connection', (socket) => {
  store.stats.connections += 1;
  console.log(`[bank] new TCP connection #${store.stats.connections}`);
  socket.setTimeout(5000, () => socket.destroy());
});