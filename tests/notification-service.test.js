const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { FileNotificationStore } = require('../lib/notification-store');
const { NotificationService } = require('../lib/notification-service');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kitfoxpay-test-'));
}

test('delivered notification is persisted and counted once', async () => {
  const tempDir = makeTempDir();
  const store = new FileNotificationStore({
    filePath: path.join(tempDir, 'notifications.json'),
  });
  await store.init();

  const forwards = [];
  const service = new NotificationService({
    store,
    now: () => 1700000000000,
    forwarder: async ({ notifyUrl, forwardPayload }) => {
      forwards.push({ notifyUrl, forwardPayload });
      return { ok: true, status: 200, body: 'success' };
    },
  });

  const result = await service.handleIncomingNotification({
    kind: 'payment',
    providerEventId: 'pay_1',
    merchantOrderNo: 'mch_1',
    notifyUrl: 'https://merchant.example/notify',
    payload: { payOrderId: 'pay_1' },
    forwardPayload: { out_trade_no: 'mch_1', trade_status: 'TRADE_SUCCESS' },
  });

  assert.equal(result.notification.status, 'delivered');
  assert.equal(forwards.length, 1);

  const saved = await store.getByKey(result.notification.dedupeKey);
  assert.equal(saved.status, 'delivered');

  const stats = await service.getStats();
  assert.equal(stats.delivered, 1);
  assert.equal(stats.pending, 0);
  assert.equal(stats.failed, 0);
});

test('duplicate delivered notification is idempotent and does not re-forward', async () => {
  const tempDir = makeTempDir();
  const store = new FileNotificationStore({
    filePath: path.join(tempDir, 'notifications.json'),
  });
  await store.init();

  let forwardCount = 0;
  const service = new NotificationService({
    store,
    now: () => 1700000000000,
    forwarder: async () => {
      forwardCount += 1;
      return { ok: true, status: 200, body: 'success' };
    },
  });

  const payload = {
    kind: 'payment',
    providerEventId: 'pay_dup',
    merchantOrderNo: 'mch_dup',
    notifyUrl: 'https://merchant.example/notify',
    payload: { payOrderId: 'pay_dup' },
    forwardPayload: { out_trade_no: 'mch_dup', trade_status: 'TRADE_SUCCESS' },
  };

  const first = await service.handleIncomingNotification(payload);
  const second = await service.handleIncomingNotification(payload);

  assert.equal(first.notification.id, second.notification.id);
  assert.equal(forwardCount, 1);

  const list = await store.list();
  assert.equal(list.length, 1);
});

test('failed forward is persisted and can be retried later', async () => {
  const tempDir = makeTempDir();
  const store = new FileNotificationStore({
    filePath: path.join(tempDir, 'notifications.json'),
  });
  await store.init();

  let currentTime = 1700000000000;
  let attempt = 0;
  const service = new NotificationService({
    store,
    now: () => currentTime,
    retryDelaysMs: [1000, 5000],
    forwarder: async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('merchant timeout');
      }
      return { ok: true, status: 200, body: 'success' };
    },
  });

  const initial = await service.handleIncomingNotification({
    kind: 'payment',
    providerEventId: 'pay_retry',
    merchantOrderNo: 'mch_retry',
    notifyUrl: 'https://merchant.example/notify',
    payload: { payOrderId: 'pay_retry' },
    forwardPayload: { out_trade_no: 'mch_retry', trade_status: 'TRADE_SUCCESS' },
  });

  assert.equal(initial.notification.status, 'pending_retry');
  assert.equal(initial.notification.attemptCount, 1);
  assert.match(initial.notification.lastError, /merchant timeout/);

  currentTime += 999;
  const none = await service.retryDueNotifications();
  assert.equal(none.retried, 0);

  currentTime += 2;
  const retried = await service.retryDueNotifications();
  assert.equal(retried.retried, 1);

  const saved = await store.getByKey(initial.notification.dedupeKey);
  assert.equal(saved.status, 'delivered');
  assert.equal(saved.attemptCount, 2);
});

test('downstream body fail is treated as failed delivery and scheduled for retry', async () => {
  const tempDir = makeTempDir();
  const store = new FileNotificationStore({
    filePath: path.join(tempDir, 'notifications.json'),
  });
  await store.init();

  const service = new NotificationService({
    store,
    now: () => 1700000000000,
    retryDelaysMs: [1000],
    forwarder: async () => {
      throw new Error('downstream notify unexpected body: fail');
    },
  });

  const result = await service.handleIncomingNotification({
    kind: 'payment',
    providerEventId: 'pay_fail_body',
    merchantOrderNo: 'mch_fail_body',
    notifyUrl: 'https://merchant.example/notify',
    payload: { payOrderId: 'pay_fail_body' },
    forwardPayload: { out_trade_no: 'mch_fail_body', trade_status: 'TRADE_SUCCESS' },
  });

  assert.equal(result.notification.status, 'pending_retry');
  assert.equal(result.notification.attemptCount, 1);
  assert.match(result.notification.lastError, /unexpected body: fail/);
});
