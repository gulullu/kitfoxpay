function createHttpNotifyForwarder({ httpClient, timeoutMs = 10_000 }) {
  if (!httpClient || typeof httpClient.get !== 'function') {
    throw new Error('httpClient.get is required');
  }

  return async function forwardNotification({ notifyUrl, forwardPayload }) {
    if (!notifyUrl) {
      throw new Error('notifyUrl is required');
    }

    const response = await httpClient.get(notifyUrl, {
      params: forwardPayload,
      timeout: timeoutMs,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`downstream notify unexpected status: ${response.status}`);
    }

    return {
      status: response.status,
      body: response.data,
    };
  };
}

module.exports = {
  createHttpNotifyForwarder,
};
