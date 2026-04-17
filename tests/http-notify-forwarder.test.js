const test = require('node:test');
const assert = require('node:assert/strict');

const { createHttpNotifyForwarder } = require('../lib/http-notify-forwarder');

test('http notify forwarder performs GET with params and timeout', async () => {
  const calls = [];
  const forward = createHttpNotifyForwarder({
    httpClient: {
      get: async (url, options) => {
        calls.push({ url, options });
        return { status: 200, data: 'success' };
      },
    },
    timeoutMs: 4321,
  });

  const result = await forward({
    notifyUrl: 'https://merchant.example/notify',
    forwardPayload: { out_trade_no: 'm_1', trade_status: 'TRADE_SUCCESS' },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://merchant.example/notify');
  assert.equal(calls[0].options.timeout, 4321);
  assert.deepEqual(calls[0].options.params, { out_trade_no: 'm_1', trade_status: 'TRADE_SUCCESS' });
  assert.equal(result.status, 200);
});

test('http notify forwarder throws when notify url is missing', async () => {
  const forward = createHttpNotifyForwarder({
    httpClient: { get: async () => ({ status: 200, data: 'success' }) },
  });

  await assert.rejects(
    () => forward({ notifyUrl: '', forwardPayload: { a: 1 } }),
    /notifyUrl is required/
  );
});

test('http notify forwarder throws when downstream returns non-2xx', async () => {
  const forward = createHttpNotifyForwarder({
    httpClient: {
      get: async () => ({ status: 500, data: 'bad' }),
    },
  });

  await assert.rejects(
    () => forward({ notifyUrl: 'https://merchant.example/notify', forwardPayload: { a: 1 } }),
    /unexpected status: 500/
  );
});

test('http notify forwarder throws when downstream body is not success', async () => {
  const forward = createHttpNotifyForwarder({
    httpClient: {
      get: async () => ({ status: 200, data: 'fail' }),
    },
  });

  await assert.rejects(
    () => forward({ notifyUrl: 'https://merchant.example/notify', forwardPayload: { a: 1 } }),
    /unexpected body: fail/
  );
});

test('http notify forwarder accepts downstream success body with surrounding whitespace', async () => {
  const forward = createHttpNotifyForwarder({
    httpClient: {
      get: async () => ({ status: 200, data: '  success\n' }),
    },
  });

  const result = await forward({
    notifyUrl: 'https://merchant.example/notify',
    forwardPayload: { a: 1 },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body, '  success\n');
});
