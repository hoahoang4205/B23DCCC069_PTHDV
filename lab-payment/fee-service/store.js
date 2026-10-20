export const store = {
  students: {
    1: { debt: 50_000_000 },
    2: { debt: 0 },
    3: { debt: 3_200_000 },
  },
  payments: new Map(),
  idempotency: new Map(),
  nextPaymentSeq: 1,
};