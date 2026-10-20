import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 10,
  freeSocketTimeout: 4000,
  scheduling: 'lifo',
});

const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 10,
  freeSocketTimeout: 4000,
  scheduling: 'lifo',
});

function classifyError(err) {
  if (err.code === 'ECONNREFUSED') return 'CONN_REFUSED';
  if (err.code === 'ETIMEDOUT') return 'TIMEOUT';
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return 'SOCKET_DROP';
  return 'SOCKET_DROP';
}

/**
 * Gửi 1 request JSON.
 * @returns {Promise<{kind, httpStatus, body, elapsedMs, errorCode?}>}
 *  kind: 'OK' | 'HTTP_ERROR' | 'CONN_REFUSED' | 'TIMEOUT' | 'SOCKET_DROP'
 */
export function postJson(urlStr, payload, { headers = {}, timeoutMs = 4500 } = {}) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'https:' ? https : http;
    const agent = url.protocol === 'https:' ? httpsKeepAliveAgent : keepAliveAgent;
    const body = JSON.stringify(payload);

    const req = transport.request(
      url,
      {
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let responseBody = null;
          if (text) {
            try {
              responseBody = JSON.parse(text);
            } catch {
              responseBody = text;
            }
          }
          const httpStatus = res.statusCode ?? 0;
          resolve({
            kind: httpStatus >= 200 && httpStatus < 300 ? 'OK' : 'HTTP_ERROR',
            httpStatus,
            body: responseBody,
            elapsedMs: Date.now() - startedAt,
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'ETIMEDOUT';
      req.destroy(timeoutError);
    });

    req.on('error', (err) => {
      resolve({
        kind: classifyError(err),
        httpStatus: 0,
        body: null,
        elapsedMs: Date.now() - startedAt,
        errorCode: err.code,
      });
    });

    req.end(body);
  });
}