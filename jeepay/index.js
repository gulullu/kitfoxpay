const express = require('express');
const JeepayClient = require('./jeepay');
const config = require('../config');

const router = express.Router();

/**
 * 根据网站域名生成服务器完整地址
 * @param {string} path - 路径
 * @returns {string} 完整的服务器URL
 */
function getServerUrl(path = '') {
  // 使用配置的网站域名，不再使用拼接方式
  const siteDomain = config.server?.siteDomain || 'http://localhost:9219';
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return `${siteDomain}${normalizedPath}`;
}

/**
 * Jeepay API 路由模块
 * 包含所有 Jeepay 支付和退款相关的接口
 */

// 初始化 Jeepay 客户端（通过依赖注入方式，避免重复初始化）
let jeepay = null;

/**
 * 初始化 Jeepay 客户端
 * @param {JeepayClient} client - Jeepay 客户端实例
 */
function initJeepayClient(client) {
  jeepay = client;
}

// ========== 支付业务接口 ==========

/**
 * 统一下单接口
 * POST /payment/unified-order
 */
router.post('/payment/unified-order', async (req, res) => {
  try {
    const {
      mchOrderNo,
      wayCode,
      amount,
      subject,
      body,
      currency,
      clientIp,
      notifyUrl,
      returnUrl,
      expiredTime,
      channelExtra,
      divisionMode,
      extParam
    } = req.body;

    // 参数验证
    if (!mchOrderNo || !wayCode || !amount || !subject || !body) {
      return res.status(400).json({
        code: -1,
        msg: '缺少必填参数: mchOrderNo, wayCode, amount, subject, body'
      });
    }

    // 构建订单参数
    const orderParams = {
      mchOrderNo,
      wayCode,
      amount: parseInt(amount), // 确保是整数
      subject,
      body,
      currency: currency || 'cny',
      clientIp: clientIp || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      notifyUrl: notifyUrl || getServerUrl('/api/payment/notify'),
      returnUrl: returnUrl || getServerUrl('/api/payment/return'),
      expiredTime,
      channelExtra: channelExtra ? (typeof channelExtra === 'string' ? channelExtra : JSON.stringify(channelExtra)) : '',
      divisionMode,
      extParam: extParam || ''
    };

    // 调用统一下单接口
    const orderData = await jeepay.unifiedOrder(orderParams);

    res.json({
      code: 0,
      msg: 'success',
      data: orderData
    });
  } catch (error) {
    console.error('统一下单失败:', error);
    res.status(500).json({
      code: -1,
      msg: error.message || '统一下单失败'
    });
  }
});

/**
 * 查询订单接口
 * GET /payment/query
 * 参数: payOrderId 或 mchOrderNo
 */
router.get('/payment/query', async (req, res) => {
  try {
    const { payOrderId, mchOrderNo } = req.query;

    if (!payOrderId && !mchOrderNo) {
      return res.status(400).json({
        code: -1,
        msg: '请提供 payOrderId 或 mchOrderNo 参数'
      });
    }

    const orderData = await jeepay.queryOrder({
      payOrderId,
      mchOrderNo
    });

    res.json({
      code: 0,
      msg: 'success',
      data: orderData
    });
  } catch (error) {
    console.error('查询订单失败:', error);
    res.status(500).json({
      code: -1,
      msg: error.message || '查询订单失败'
    });
  }
});

/**
 * 关闭订单接口
 * POST /payment/close
 */
router.post('/payment/close', async (req, res) => {
  try {
    const { payOrderId, mchOrderNo } = req.body;

    if (!payOrderId && !mchOrderNo) {
      return res.status(400).json({
        code: -1,
        msg: '请提供 payOrderId 或 mchOrderNo 参数'
      });
    }

    const result = await jeepay.closeOrder({
      payOrderId,
      mchOrderNo
    });

    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
  } catch (error) {
    console.error('关闭订单失败:', error);
    res.status(500).json({
      code: -1,
      msg: error.message || '关闭订单失败'
    });
  }
});

/**
 * 获取渠道用户ID接口
 * GET /payment/channel-user-id
 * 参数: redirectUrl, ifCode (可选，默认 AUTO)
 */
router.get('/payment/channel-user-id', (req, res) => {
  try {
    const { redirectUrl, ifCode } = req.query;

    if (!redirectUrl) {
      return res.status(400).json({
        code: -1,
        msg: '缺少必填参数: redirectUrl'
      });
    }

    const url = jeepay.getChannelUserIdUrl({
      redirectUrl,
      ifCode: ifCode || 'AUTO'
    });

    res.json({
      code: 0,
      msg: 'success',
      data: {
        url: url
      }
    });
  } catch (error) {
    console.error('获取渠道用户ID失败:', error);
    res.status(500).json({
      code: -1,
      msg: error.message || '获取渠道用户ID失败'
    });
  }
});

/**
 * 支付结果异步通知接口
 * POST /payment/notify
 * Jeepay 会调用此接口通知支付结果
 */
router.post('/payment/notify', (req, res) => {
  try {
    const notifyParams = req.body;

    // 验证签名
    if (!jeepay.verifyNotify(notifyParams)) {
      console.error('支付通知签名验证失败:', notifyParams);
      return res.status(400).send('fail');
    }

    // 提取通知参数
    const {
      payOrderId,      // 支付订单号
      mchOrderNo,      // 商户订单号
      amount,          // 支付金额（分）
      state,           // 订单状态：0-订单生成, 1-支付中, 2-支付成功, 3-支付失败, 4-已撤销, 5-已退款, 6-订单关闭
      wayCode,         // 支付方式
      channelOrderNo,  // 渠道订单号
      successTime,     // 支付成功时间（13位时间戳）
      extParam,        // 扩展参数
      errCode,         // 渠道错误码
      errMsg           // 渠道错误描述
    } = notifyParams;

    console.log('收到支付通知:', {
      payOrderId,
      mchOrderNo,
      amount,
      state,
      wayCode,
      channelOrderNo,
      successTime
    });

    // TODO: 在这里处理业务逻辑
    // 例如：更新数据库订单状态、发送通知、发货等
    // Jeepay 的 state 是字符串类型
    const stateStr = String(state);
    if (stateStr === '2') {
      // 支付成功
      console.log('订单支付成功，开始处理业务逻辑...');
      // TODO: 更新订单状态为已支付
      // TODO: 发送发货通知
      // TODO: 其他业务逻辑
    } else if (stateStr === '3') {
      // 支付失败
      console.log('订单支付失败:', errMsg);
      // TODO: 处理支付失败逻辑
    }

    // 必须返回 'success'（不区分大小写，且不能有额外空格或换行）
    // Jeepay 会根据返回结果决定是否重试通知
    res.send('success');
  } catch (error) {
    console.error('处理支付通知失败:', error);
    res.status(500).send('fail');
  }
});

/**
 * 支付结果同步跳转接口
 * GET /payment/return
 * 用户支付完成后会跳转到此接口
 */
router.get('/payment/return', (req, res) => {
  try {
    const returnParams = req.query;

    // 验证签名（可选，因为同步跳转通常只用于展示结果）
    if (jeepay.verifyNotify(returnParams)) {
      console.log('同步跳转参数:', returnParams);
      
      const { mchOrderNo, state, payOrderId } = returnParams;
      
      // 根据订单状态跳转到不同页面
      // Jeepay 的 state 是字符串类型
      const stateStr = String(state);
      
      if (stateStr === '2') {
        // 支付成功，跳转到成功页面
        res.redirect(`/payment/success?orderNo=${mchOrderNo}&payOrderId=${payOrderId}`);
      } else if (stateStr === '3') {
        // 支付失败，跳转到失败页面
        res.redirect(`/payment/fail?orderNo=${mchOrderNo}&payOrderId=${payOrderId}`);
      } else {
        // 其他状态，跳转到处理中页面
        res.redirect(`/payment/processing?orderNo=${mchOrderNo}&payOrderId=${payOrderId}`);
      }
    } else {
      res.status(400).send('签名验证失败');
    }
  } catch (error) {
    console.error('处理同步跳转失败:', error);
    res.status(500).send('处理失败');
  }
});

// ========== 退款业务接口 ==========

/**
 * 统一退款接口
 * POST /refund/refund-order
 */
router.post('/refund/refund-order', async (req, res) => {
  try {
    const {
      payOrderId,
      mchOrderNo,
      mchRefundNo,
      refundAmount,
      refundReason,
      currency,
      clientIp,
      notifyUrl,
      channelExtra,
      extParam
    } = req.body;

    // 参数验证
    if (!mchRefundNo || !refundAmount || !refundReason) {
      return res.status(400).json({
        code: -1,
        msg: '缺少必填参数: mchRefundNo, refundAmount, refundReason'
      });
    }

    if (!payOrderId && !mchOrderNo) {
      return res.status(400).json({
        code: -1,
        msg: '请提供 payOrderId 或 mchOrderNo 参数'
      });
    }

    // 构建退款参数
    const refundParams = {
      payOrderId: payOrderId || '',
      mchOrderNo: mchOrderNo || '',
      mchRefundNo,
      refundAmount: parseInt(refundAmount), // 确保是整数
      refundReason,
      currency: currency || 'cny',
      clientIp: clientIp || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      notifyUrl: notifyUrl || getServerUrl('/api/refund/notify'),
      channelExtra: channelExtra ? (typeof channelExtra === 'string' ? channelExtra : JSON.stringify(channelExtra)) : '',
      extParam: extParam || ''
    };

    // 调用统一退款接口
    const refundData = await jeepay.refundOrder(refundParams);

    res.json({
      code: 0,
      msg: 'success',
      data: refundData
    });
  } catch (error) {
    console.error('统一退款失败:', error);
    res.status(500).json({
      code: -1,
      msg: error.message || '统一退款失败'
    });
  }
});

/**
 * 查询退款订单接口
 * GET /refund/query
 * 参数: refundOrderId 或 mchRefundNo
 */
router.get('/refund/query', async (req, res) => {
  try {
    const { refundOrderId, mchRefundNo } = req.query;

    if (!refundOrderId && !mchRefundNo) {
      return res.status(400).json({
        code: -1,
        msg: '请提供 refundOrderId 或 mchRefundNo 参数'
      });
    }

    const refundData = await jeepay.queryRefundOrder({
      refundOrderId,
      mchRefundNo
    });

    res.json({
      code: 0,
      msg: 'success',
      data: refundData
    });
  } catch (error) {
    console.error('查询退款订单失败:', error);
    res.status(500).json({
      code: -1,
      msg: error.message || '查询退款订单失败'
    });
  }
});

/**
 * 退款结果异步通知接口
 * POST /refund/notify
 * Jeepay 会调用此接口通知退款结果
 */
router.post('/refund/notify', (req, res) => {
  try {
    const notifyParams = req.body;

    // 验证签名
    if (!jeepay.verifyNotify(notifyParams)) {
      console.error('退款通知签名验证失败:', notifyParams);
      return res.status(400).send('fail');
    }

    // 提取通知参数
    const {
      refundOrderId,    // 退款订单号
      payOrderId,      // 支付订单号
      mchRefundNo,     // 商户退款单号
      payAmount,        // 支付金额（分）
      refundAmount,    // 退款金额（分）
      currency,         // 货币代码
      state,           // 退款状态：0-订单生成, 1-退款中, 2-退款成功, 3-退款失败, 4-退款关闭
      channelOrderNo,   // 渠道订单号
      errCode,         // 渠道错误码
      errMsg,          // 渠道错误描述
      extParam,        // 扩展参数
      successTime       // 退款成功时间（13位时间戳）
    } = notifyParams;

    console.log('收到退款通知:', {
      refundOrderId,
      payOrderId,
      mchRefundNo,
      payAmount,
      refundAmount,
      state,
      channelOrderNo,
      successTime
    });

    // TODO: 在这里处理业务逻辑
    // 例如：更新数据库退款状态、发送通知等
    // Jeepay 的 state 是字符串类型
    const stateStr = String(state);
    if (stateStr === '2') {
      // 退款成功
      console.log('退款成功，开始处理业务逻辑...');
      // TODO: 更新退款状态为已退款
      // TODO: 发送退款成功通知
      // TODO: 其他业务逻辑
    } else if (stateStr === '3') {
      // 退款失败
      console.log('退款失败:', errMsg);
      // TODO: 处理退款失败逻辑
    }

    // 必须返回 'success'（必须是小写，且前后不能有空格和换行符）
    // Jeepay 会根据返回结果决定是否重试通知
    res.send('success');
  } catch (error) {
    console.error('处理退款通知失败:', error);
    res.status(500).send('fail');
  }
});

module.exports = {
  router,
  initJeepayClient
};
