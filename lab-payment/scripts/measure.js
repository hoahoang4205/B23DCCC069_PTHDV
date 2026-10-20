export async function getJson(url, opts = {}) {
  const startedAt = Date.now();
  const response = await fetch(url, opts);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    body,
    elapsedMs: Date.now() - startedAt,
  };
}

export function reportTable(rows) {
  console.table(rows);
}