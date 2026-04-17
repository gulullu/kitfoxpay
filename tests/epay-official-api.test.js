const test = require('node:test');
const assert = require('node:assert/strict');

const EpayAdapter = require('../epay');

function createAdapter(overrides = {}) {
  return new EpayAdapter({
    jeepayClient: overrides.jeepayClient || { unifiedOrder: async () => ({ payOrderId: 'P_1', payData: 'https://pay.example.com' }) },
    key: '',
    serverHost: 'https://gateway.example.com',
    pid: '10001',
  });
}

test('maps generic alipay type to Jeepay official ALI_PC wayCode for unified order', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_1', payData: 'https://pay.example.com' };
      },
    },
  });

  const result = await adapter.createOrder({
    pid: '10001',
    out_trade_no: 'ORDER_1',
    type: 'alipay',
    money: '12.34',
    name: 'test',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'ALI_PC');
});

test('maps generic wxpay type to Jeepay official WX_NATIVE wayCode for unified order', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_2', payData: 'https://pay.example.com/qrcode' };
      },
    },
  });

  const result = await adapter.createOrder({
    pid: '10001',
    out_trade_no: 'ORDER_2',
    type: 'wxpay',
    money: '8.88',
    name: 'test',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'WX_NATIVE');
});

test('maps explicit frontend aliases to official Jeepay way codes', () => {
  const adapter = createAdapter();

  assert.equal(adapter._mapPayType('alipay_pc'), 'ALI_PC');
  assert.equal(adapter._mapPayType('alipay_wap'), 'ALI_WAP');
  assert.equal(adapter._mapPayType('alipay_qr'), 'ALI_QR');
  assert.equal(adapter._mapPayType('wxpay_native'), 'WX_NATIVE');
  assert.equal(adapter._mapPayType('wxpay_h5'), 'WX_H5');
  assert.equal(adapter._mapPayType('wxpay_jsapi'), 'WX_JSAPI');
  assert.equal(adapter._mapPayType('wxpay_lite'), 'WX_LITE');
});

test('maps official Jeepay way codes back to generic epay types', () => {
  const adapter = createAdapter();

  assert.equal(adapter._mapWayCodeToEpayType('ALI_PC'), 'alipay');
  assert.equal(adapter._mapWayCodeToEpayType('ALI_WAP'), 'alipay');
  assert.equal(adapter._mapWayCodeToEpayType('ALI_QR'), 'alipay');
  assert.equal(adapter._mapWayCodeToEpayType('WX_NATIVE'), 'wxpay');
  assert.equal(adapter._mapWayCodeToEpayType('WX_H5'), 'wxpay');
  assert.equal(adapter._mapWayCodeToEpayType('WX_JSAPI'), 'wxpay');
  assert.equal(adapter._mapWayCodeToEpayType('WX_LITE'), 'wxpay');
});
