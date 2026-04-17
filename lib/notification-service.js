function defaultNow() {
  return Date.now();
}

class NotificationService {
  constructor({
    store,
    forwarder,
    now = defaultNow,
    retryDelaysMs = [10_000, 30_000, 120_000, 600_000, 1_800_000],
  }) {
    this.store = store;
    this.forwarder = forwarder;
    this.now = now;
    this.retryDelaysMs = retryDelaysMs;
    this.retryTimer = null;
    this.retryInProgress = false;
  }

  async handleIncomingNotification({
    kind,
    providerEventId,
    merchantOrderNo,
    notifyUrl,
    payload,
    forwardPayload,
  }) {
    const dedupeKey = this.buildDedupeKey({ kind, providerEventId, notifyUrl });
    const existing = await this.store.getByKey(dedupeKey);
    if (existing) {
      if (existing.status === 'delivered' || existing.status === 'skipped') {
        return { notification: existing, duplicate: true };
      }
      const retried = await this.#attemptDelivery(existing);
      return { notification: retried, duplicate: true };
    }

    const createdAt = this.now();
    const notification = {
      id: dedupeKey,
      dedupeKey,
      kind,
      providerEventId,
      merchantOrderNo,
      notifyUrl,
      payload,
      forwardPayload,
      status: notifyUrl ? 'received' : 'skipped',
      attemptCount: 0,
      createdAt,
      updatedAt: createdAt,
      nextAttemptAt: null,
      lastError: '',
      deliveredAt: null,
    };

    await this.store.upsert(notification);
    if (!notifyUrl) {
      return { notification, duplicate: false };
    }

    const updated = await this.#attemptDelivery(notification);
    return { notification: updated, duplicate: false };
  }

  async retryDueNotifications() {
    if (this.retryInProgress) {
      return { retried: 0, skipped: true };
    }
    this.retryInProgress = true;
    try {
      const due = await this.store.findDueRetries(this.now());
      for (const item of due) {
        await this.#attemptDelivery(item);
      }
      return { retried: due.length, skipped: false };
    } finally {
      this.retryInProgress = false;
    }
  }

  async getStats() {
    return this.store.stats();
  }

  start({ intervalMs = 15_000 } = {}) {
    if (this.retryTimer) {
      return;
    }
    this.retryTimer = setInterval(() => {
      this.retryDueNotifications().catch((error) => {
        console.error('[notification-service] retry loop failed:', error);
      });
    }, intervalMs);
    if (typeof this.retryTimer.unref === 'function') {
      this.retryTimer.unref();
    }
  }

  stop() {
    if (!this.retryTimer) {
      return;
    }
    clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  buildDedupeKey({ kind, providerEventId, notifyUrl }) {
    return [kind, providerEventId || 'unknown', notifyUrl || 'no-notify-url'].join(':');
  }

  async #attemptDelivery(notification) {
    const attemptTime = this.now();
    const attemptCount = notification.attemptCount + 1;

    const base = await this.store.updateByKey(notification.dedupeKey, (current) => ({
      ...current,
      status: 'forwarding',
      attemptCount,
      updatedAt: attemptTime,
    }));

    try {
      const result = await this.forwarder({
        kind: base.kind,
        notifyUrl: base.notifyUrl,
        payload: base.payload,
        forwardPayload: base.forwardPayload,
      });

      return await this.store.updateByKey(notification.dedupeKey, (current) => ({
        ...current,
        status: 'delivered',
        updatedAt: this.now(),
        deliveredAt: this.now(),
        nextAttemptAt: null,
        lastError: '',
        lastResponse: result,
      }));
    } catch (error) {
      const nextAttemptAt = this.#getNextAttemptAt(attemptCount, attemptTime);
      const nextStatus = nextAttemptAt ? 'pending_retry' : 'failed';
      return await this.store.updateByKey(notification.dedupeKey, (current) => ({
        ...current,
        status: nextStatus,
        updatedAt: this.now(),
        nextAttemptAt,
        lastError: error.message || String(error),
      }));
    }
  }

  #getNextAttemptAt(attemptCount, nowMs) {
    const delay = this.retryDelaysMs[attemptCount - 1];
    if (!delay) {
      return null;
    }
    return nowMs + delay;
  }
}

module.exports = {
  NotificationService,
};
