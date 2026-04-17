const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createRequestLogger } = require('../lib/request-logger');

function createReq(overrides = {}) {
  return {
    method: 'POST',
    originalUrl: '/mapi.php?foo=1',
    ip: '127.0.0.1',
    query: { foo: '1', sign: 'abc', pid: '10001' },
    body: { type: 'alipay', key: 'secret-key', money: '10.00' },
    ...overrides,
  };
}

function createRes(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  return res;
}

test('request logger logs method path status duration and redacted params on response finish', async () => {
  const calls = [];
  const middleware = createRequestLogger({
    logger: {
      info(message, meta) {
        calls.push({ message, meta });
      },
    },
    now: (() => {
      let current = 1000;
      return () => {
        current += 25;
        return current;
      };
    })(),
  });

  const req = createReq();
  const res = createRes(201);

  await new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) return reject(error);
      res.emit('finish');
      resolve();
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, 'http request');
  assert.equal(calls[0].meta.method, 'POST');
  assert.equal(calls[0].meta.path, '/mapi.php?foo=1');
  assert.equal(calls[0].meta.statusCode, 201);
  assert.equal(calls[0].meta.durationMs, 25);
  assert.equal(calls[0].meta.ip, '127.0.0.1');
  assert.deepEqual(calls[0].meta.query, { foo: '1', sign: '[REDACTED]', pid: '10001' });
  assert.deepEqual(calls[0].meta.body, { type: 'alipay', key: '[REDACTED]', money: '10.00' });
});

test('request logger skips empty body and query objects', async () => {
  const calls = [];
  const middleware = createRequestLogger({
    logger: {
      info(message, meta) {
        calls.push({ message, meta });
      },
    },
    now: () => 1000,
  });

  const req = createReq({
    method: 'GET',
    originalUrl: '/api/health',
    query: {},
    body: {},
  });
  const res = createRes(200);

  await new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) return reject(error);
      res.emit('finish');
      resolve();
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].meta.method, 'GET');
  assert.equal(calls[0].meta.path, '/api/health');
  assert.equal('query' in calls[0].meta, false);
  assert.equal('body' in calls[0].meta, false);
});
