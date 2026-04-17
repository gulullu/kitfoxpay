const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPaymentNotifyHandler,
  createRefundNotifyHandler,
} = require('../lib/webhook-handlers');

function createResponseRecorder() {
  return {
    body: undefined,
    statusCode: 200,
    send(value) {
      this.body = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('payment notify returns fail when signature verification fails', async () => {
  const handler = createPaymentNotifyHandler({
    jeepay: { verifyNotify: () => false },
    notificationService: { handleIncomingNotification: async () => { throw new Error('should not run'); } },
    epayAdapter: { handleNotify: () => ({}) },
    logger: { info() {}, warn() {}, error() {} },
  });

  const res = createResponseRecorder();
  await handler({ body: { payOrderId: 'pay_1' } }, res);

  assert.equal(res.body, 'fail');
});

test('payment notify persists notification and returns success after accepted', async () => {
  const calls = [];
  const handler = createPaymentNotifyHandler({
    jeepay: { verifyNotify: () => true },
    epayAdapter: {
      handleNotify: (payload) => ({ out_trade_no: payload.mchOrderNo, trade_status: 'TRADE_SUCCESS' }),
    },
    notificationService: {
      handleIncomingNotification: async (payload) => {
        calls.push(payload);
        return {
          notification: { status: 'pending_retry', dedupeKey: 'payment:pay_2:https://merchant.example/notify' },
          duplicate: false,
        };
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const req = {
    body: {
      payOrderId: 'pay_2',
      mchOrderNo: 'mch_2',
      state: 2,
      extParam: JSON.stringify({ epay_notify_url: 'https://merchant.example/notify' }),
    },
  };
  const res = createResponseRecorder();

  await handler(req, res);

  assert.equal(res.body, 'success');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'payment');
  assert.equal(calls[0].providerEventId, 'pay_2');
  assert.equal(calls[0].merchantOrderNo, 'mch_2');
  assert.equal(calls[0].notifyUrl, 'https://merchant.example/notify');
  assert.deepEqual(calls[0].forwardPayload, {
    out_trade_no: 'mch_2',
    trade_status: 'TRADE_SUCCESS',
  });
});

test('refund notify persists notification and returns success after accepted', async () => {
  const calls = [];
  const handler = createRefundNotifyHandler({
    jeepay: { verifyNotify: () => true },
    epayAdapter: {
      handleRefundNotify: (payload) => ({ out_trade_no: payload.mchOrderNo, status: 'SUCCESS' }),
    },
    notificationService: {
      handleIncomingNotification: async (payload) => {
        calls.push(payload);
        return {
          notification: { status: 'delivered', dedupeKey: 'refund:r_1:https://merchant.example/refund' },
          duplicate: false,
        };
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const req = {
    body: {
      refundOrderId: 'r_1',
      mchOrderNo: 'mch_r1',
      extParam: JSON.stringify({ epay_notify_url: 'https://merchant.example/refund' }),
    },
  };
  const res = createResponseRecorder();

  await handler(req, res);

  assert.equal(res.body, 'success');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'refund');
  assert.equal(calls[0].providerEventId, 'r_1');
  assert.equal(calls[0].notifyUrl, 'https://merchant.example/refund');
});

test('payment notify without notify_url is still recorded and returns success', async () => {
  const calls = [];
  const handler = createPaymentNotifyHandler({
    jeepay: { verifyNotify: () => true },
    epayAdapter: {
      handleNotify: () => ({ out_trade_no: 'mch_3', trade_status: 'TRADE_SUCCESS' }),
    },
    notificationService: {
      handleIncomingNotification: async (payload) => {
        calls.push(payload);
        return {
          notification: { status: 'skipped', dedupeKey: 'payment:pay_3:no-notify-url' },
          duplicate: false,
        };
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const req = {
    body: {
      payOrderId: 'pay_3',
      mchOrderNo: 'mch_3',
      extParam: '{bad json',
    },
  };
  const res = createResponseRecorder();

  await handler(req, res);

  assert.equal(res.body, 'success');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].notifyUrl, null);
});
