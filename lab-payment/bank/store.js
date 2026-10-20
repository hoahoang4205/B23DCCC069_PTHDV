export const store = {
  charges: new Map(),
  idempotency: new Map(),
  stats: {
    connections: 0,
    requests: 0,
    charges: 0,
    duplicates: 0,
  },
  nextChargeSeq: 1,
};