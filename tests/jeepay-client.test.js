const test = require('node:test');
const assert = require('node:assert/strict');

const JeepayClient = require('../jeepay/jeepay');

test('uses apiKey alias with jeepay/new-api compatible md5 signing', () => {
  const client = new JeepayClient({
    baseUrl: 'https://jeepay.example.com',
    mchNo: 'M123',
    appId: 'A123',
    apiKey: 'secret-key',
  });

  const sign = client.generateSign({
    mchNo: 'M123',
    appId: 'A123',
    mchOrderNo: 'TOPUP-001',
    amount: 1234,
    currency: 'cny',
    notifyUrl: 'https://example.com/api/jeepay/notify',
    reqTime: 1710000000000,
    version: '1.0',
    signType: 'MD5',
    body: '',
  });

  assert.equal(sign, '22E54179A3B0EC004B210E2942C0FA90');
});

test('normalizes unified order response when jeepay returns nested payData object', () => {
  const client = new JeepayClient({
    apiKey: 'secret-key',
  });

  const normalized = client.normalizeUnifiedOrderData({
    payOrderId: 'P1001',
    payData: {
      codeUrl: 'https://cashier.example.com/qrcode/abc',
    },
  });

  assert.equal(normalized.payUrl, 'https://cashier.example.com/qrcode/abc');
  assert.deepEqual(normalized.payData, {
    codeUrl: 'https://cashier.example.com/qrcode/abc',
  });
});

test('prefers top-level payment url fields when available', () => {
  const client = new JeepayClient({
    apiKey: 'secret-key',
  });

  assert.equal(
    client.extractPaymentUrl({ cashierUrl: 'https://cashier.example.com/pay/1' }),
    'https://cashier.example.com/pay/1',
  );
});
