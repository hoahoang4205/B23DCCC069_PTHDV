import { postJson } from '../shared/httpClient.js';

const BANK_URL = process.env.BANK_URL || 'http://localhost:4002';
const TIMEOUT_MS = Number(process.env.BANK_TIMEOUT_MS || 4500);
const MAX_RETRY = Number(process.env.BANK_MAX_RETRY || 2);
const BACKOFF_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gọi bank với Idempotency-Key = paymentId.
 * @returns {Promise<{kind, httpStatus, body, attempts}>}
 *  kind: 'PAID' | 'REJECTED' | 'UNAVAILABLE' | 'UNKNOWN'
 */
export async function charge({ paymentId, amount }) {
  const url = `${BANK_URL}/charges`;
  const payload = { reference: paymentId, amount };
  const headers = { 'Idempotency-Key': paymentId };

  let attempts = 0;

  while (attempts <= MAX_RETRY) {
    attempts += 1;
    const r = await postJson(url, payload, { headers, timeoutMs: TIMEOUT_MS });

    // 1) Thành công
    if (r.kind === 'OK' && r.httpStatus === 201) {
      return { kind: 'PAID', httpStatus: 201, body: r.body, attempts };
    }

    // 2) Bị từ chối rõ ràng (400/402) → KHÔNG retry
    if (r.kind === 'HTTP_ERROR' && (r.httpStatus === 400 || r.httpStatus === 402)) {
      return { kind: 'REJECTED', httpStatus: r.httpStatus, body: r.body, attempts };
    }

    // 3) Không kết nối được → retry
    if (r.kind === 'CONN_REFUSED') {
      return { kind: 'UNAVAILABLE', httpStatus: 503, body: null, attempts };
    }

    // 4) Timeout / socket drop → có thể đã trừ tiền
    //    Retry an toàn vì Idempotency-Key (bank sẽ trả lại kết quả cũ)
    if (r.kind === 'TIMEOUT' || r.kind === 'SOCKET_DROP') {
      if (attempts <= MAX_RETRY) {
        await sleep(BACKOFF_MS * attempts);
        continue;
      }
      return { kind: 'UNKNOWN', httpStatus: 504, body: null, attempts };
    }

    // 5) HTTP 5xx → retry
    if (r.kind === 'HTTP_ERROR' && r.httpStatus >= 500) {
      if (attempts <= MAX_RETRY) {
        await sleep(BACKOFF_MS * attempts);
        continue;
      }
      return { kind: 'UNKNOWN', httpStatus: 504, body: null, attempts };
    }

    // 6) Fallback
    return { kind: 'UNKNOWN', httpStatus: 504, body: null, attempts };
  }

  return { kind: 'UNKNOWN', httpStatus: 504, body: null, attempts };
}