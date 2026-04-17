function extractNotifyUrl(extParam, logger) {
  if (!extParam) {
    return null;
  }

  try {
    const extParamObj = JSON.parse(extParam);
    return extParamObj.epay_notify_url || null;
  } catch (error) {
    logger.warn('extParam parse failed', { error: error.message });
    return null;
  }
}

function createWebhookHandler({ kind, jeepay, epayAdapter, notificationService, logger }) {
  const transform = kind === 'payment'
    ? (payload) => epayAdapter.handleNotify(payload)
    : (payload) => epayAdapter.handleRefundNotify(payload);

  const providerEventField = kind === 'payment' ? 'payOrderId' : 'refundOrderId';

  return async function webhookHandler(req, res) {
    try {
      const notifyPayload = req.body;
      if (!jeepay.verifyNotify(notifyPayload)) {
        logger.error(`${kind} notify signature verification failed`, notifyPayload);
        return res.send('fail');
      }

      const notifyUrl = extractNotifyUrl(notifyPayload.extParam, logger);
      const forwardPayload = transform(notifyPayload);

      const result = await notificationService.handleIncomingNotification({
        kind,
        providerEventId: notifyPayload[providerEventField],
        merchantOrderNo: notifyPayload.mchOrderNo || notifyPayload.mchRefundNo || null,
        notifyUrl,
        payload: notifyPayload,
        forwardPayload,
      });

      logger.info(`${kind} notify accepted`, {
        providerEventId: notifyPayload[providerEventField],
        merchantOrderNo: notifyPayload.mchOrderNo || notifyPayload.mchRefundNo || null,
        notifyUrl,
        status: result.notification.status,
        duplicate: result.duplicate,
      });

      return res.send('success');
    } catch (error) {
      logger.error(`${kind} notify handling failed`, {
        error: error.message,
        stack: error.stack,
      });
      return res.send('fail');
    }
  };
}

function createPaymentNotifyHandler(deps) {
  return createWebhookHandler({ ...deps, kind: 'payment' });
}

function createRefundNotifyHandler(deps) {
  return createWebhookHandler({ ...deps, kind: 'refund' });
}

module.exports = {
  createPaymentNotifyHandler,
  createRefundNotifyHandler,
  extractNotifyUrl,
};
