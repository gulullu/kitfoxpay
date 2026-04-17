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

test('maps generic alipay type to WEB_CASHIER for aggregate cashier unified order', async () => {
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
  assert.equal(calls[0].wayCode, 'WEB_CASHIER');
});

test('maps generic wxpay type to WEB_CASHIER for aggregate cashier unified order', async () => {
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
  assert.equal(calls[0].wayCode, 'WEB_CASHIER');
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

test('maps alipay mobile device to WEB_CASHIER for submit flow', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_3', payData: 'https://pay.example.com/wap' };
      },
    },
  });

  const result = await adapter.submitOrder({
    pid: '10001',
    out_trade_no: 'ORDER_3',
    type: 'alipay',
    device: 'mobile',
    money: '6.66',
    name: 'wap-test',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'WEB_CASHIER');
  assert.equal(calls[0].channelExtra, '');
});

test('maps generic pc browser flow to WEB_CASHIER for submit flow', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_4', payData: 'https://pay.example.com/pc' };
      },
    },
  });

  const result = await adapter.submitOrder({
    pid: '10001',
    out_trade_no: 'ORDER_4',
    type: 'alipay',
    device: 'pc',
    money: '9.99',
    name: 'pc-test',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'WEB_CASHIER');
  assert.equal(calls[0].channelExtra, '');
});

test('maps auth code payments to bar code wayCode and channelExtra authCode', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_5', payData: 'https://pay.example.com/bar' };
      },
    },
  });

  const result = await adapter.createOrder({
    pid: '10001',
    out_trade_no: 'ORDER_5',
    type: 'alipay',
    money: '8.00',
    name: 'bar-test',
    auth_code: '280812820366966512',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'ALI_BAR');
  assert.deepEqual(JSON.parse(calls[0].channelExtra), { authCode: '280812820366966512' });
});

test('maps wxpay jsapi with openid to WX_JSAPI channelExtra', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_6', payData: 'https://pay.example.com/jsapi' };
      },
    },
  });

  const result = await adapter.createOrder({
    pid: '10001',
    out_trade_no: 'ORDER_6',
    type: 'wxpay',
    openid: 'o6BcIwvSiRpfS8e_UyfQNrYuk2LI',
    money: '5.20',
    name: 'wx-jsapi',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'WX_JSAPI');
  assert.deepEqual(JSON.parse(calls[0].channelExtra), { openid: 'o6BcIwvSiRpfS8e_UyfQNrYuk2LI' });
});

test('maps alipay lite/jsapi with buyerUserId to ALI_JSAPI channelExtra', async () => {
  const calls = [];
  const adapter = createAdapter({
    jeepayClient: {
      unifiedOrder: async (params) => {
        calls.push(params);
        return { payOrderId: 'P_7', payData: 'https://pay.example.com/ali-jsapi' };
      },
    },
  });

  const result = await adapter.createOrder({
    pid: '10001',
    out_trade_no: 'ORDER_7',
    type: 'alipay',
    buyerUserId: '2088702585070844',
    money: '7.77',
    name: 'ali-jsapi',
    notify_url: 'https://merchant.example/notify',
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wayCode, 'ALI_JSAPI');
  assert.deepEqual(JSON.parse(calls[0].channelExtra), { buyerUserId: '2088702585070844' });
});
