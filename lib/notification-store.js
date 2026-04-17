const fs = require('node:fs/promises');
const path = require('node:path');

class FileNotificationStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.state = { notifications: [] };
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = {
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      await this.#persist();
    }
    this.initialized = true;
  }

  async list() {
    await this.init();
    return this.state.notifications.slice();
  }

  async getByKey(dedupeKey) {
    await this.init();
    return this.state.notifications.find((item) => item.dedupeKey === dedupeKey) || null;
  }

  async upsert(notification) {
    await this.init();
    const index = this.state.notifications.findIndex((item) => item.dedupeKey === notification.dedupeKey);
    if (index === -1) {
      this.state.notifications.push(notification);
    } else {
      this.state.notifications[index] = notification;
    }
    await this.#persist();
    return notification;
  }

  async updateByKey(dedupeKey, updater) {
    await this.init();
    const index = this.state.notifications.findIndex((item) => item.dedupeKey === dedupeKey);
    if (index === -1) {
      return null;
    }
    const current = this.state.notifications[index];
    const next = updater({ ...current });
    this.state.notifications[index] = next;
    await this.#persist();
    return next;
  }

  async findDueRetries(nowMs) {
    await this.init();
    return this.state.notifications.filter((item) => item.status === 'pending_retry' && item.nextAttemptAt <= nowMs);
  }

  async stats() {
    await this.init();
    const summary = {
      total: this.state.notifications.length,
      delivered: 0,
      pending: 0,
      failed: 0,
      skipped: 0,
    };

    for (const item of this.state.notifications) {
      if (item.status === 'delivered') {
        summary.delivered += 1;
      } else if (item.status === 'pending_retry') {
        summary.pending += 1;
      } else if (item.status === 'failed') {
        summary.failed += 1;
      } else if (item.status === 'skipped') {
        summary.skipped += 1;
      }
    }

    return summary;
  }

  async #persist() {
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(this.state, null, 2));
    await fs.rename(tmpPath, this.filePath);
  }
}

module.exports = {
  FileNotificationStore,
};
