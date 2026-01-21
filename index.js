const express = require('express');
const cors = require('cors');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
const session = require('express-session');
const JeepayClient = require('./jeepay/jeepay');
const EpayAdapter = require('./epay');
const config = require('./config');
const { router: jeepayRouter, initJeepayClient } = require('./jeepay');
const { adminRouter, configRouter } = require('./admin');
const testRouter = require('./test');

const app = express();
const PORT = config.server.port;

// 信任反向代理（nginx等）
// 这样 Express 才能正确识别 X-Forwarded-* 头部
app.set('trust proxy', true);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session 配置
app.use(session({
  secret: 'kitfoxpay-admin-secret-key-' + Date.now(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 生产环境建议设置为 true（需要 HTTPS）
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 静态文件服务（用于前端界面）
app.use(express.static(path.join(__dirname, 'public')));

// 初始化 Jeepay 客户端
const jeepay = new JeepayClient({
  baseUrl: config.jeepay.baseUrl,
  mchNo: config.jeepay.mchNo,
  appId: config.jeepay.appId,
  privateKey: config.jeepay.privateKey
});

// 初始化 Jeepay API 路由（注入客户端实例）
initJeepayClient(jeepay);

// 使用配置的网站域名作为服务器地址（用于通知URL）
const serverHost = config.server.siteDomain;

// 初始化 易支付 适配器
const epayAdapter = new EpayAdapter({
  jeepayClient: jeepay,
  key: config.epay.key, // MD5 签名密钥
  serverHost: serverHost,
  pid: config.epay.pid // 商户ID（用于通知）
});

// ========== 基础路由 ==========

// 首页 - 重定向到配置管理界面
app.get('/', (req, res) => {
  // 如果请求的是 API（Accept: application/json），返回 JSON
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    res.json({ 
      message: 'Jeepay 支付平台 API 服务运行中',
      status: 'success',
      version: '1.0.0',
      configUrl: '/index.html'
    });
  } else {
    // 否则返回配置管理界面
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: config.jeepay.baseUrl,
      mchNo: config.jeepay.mchNo,
      appId: config.jeepay.appId
    }
  });
});

// ========== 注册配置管理 API 路由 ==========
app.use('/api/admin', adminRouter);
app.use('/api/config', configRouter);

// ========== 注册测试 API 路由 ==========
app.use('/api/test', testRouter);

// ========== 注册 Jeepay API 路由 ==========
app.use("/api/jeepay", jeepayRouter);

// ========== 易支付 支付接口适配 ==========
// 按照 易支付 新接口标准实现：https://pay.myzfw.com/doc_old.html#pay3
// 接收 易支付 格式的请求，转发到 Jeepay 接口

/**
 * 获取请求参数（支持 POST body 和 query 参数）
 */
function getRequestParams(req) {
  return {
    ...req.query,
    ...req.body
  };
}

/**
 * 处理错误响应
 */
function handleErrorResponse(error, epayAdapter, res) {
  console.error('易支付 接口处理失败:', error);
  const errorResponse = {
    code: -1,
    msg: error.message || '接口处理失败',
    data: null
  };
  if (epayAdapter && epayAdapter._generateResponseSign) {
    errorResponse.sign = epayAdapter._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
    errorResponse.sign_type = 'MD5';
  }
  res.json(errorResponse);
}

/**
 * 易支付 后端API支付接口（mapi.php）
 * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
 * 支持 GET 和 POST 请求
 */
app.all('/mapi.php', async (req, res) => {
  try {
    const params = getRequestParams(req);
    const result = await epayAdapter.createOrder(params);
    res.json(result);
  } catch (error) {
    handleErrorResponse(error, epayAdapter, res);
  }
});

/**
 * 易支付 前台支付提交接口（submit.php）
 * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
 * 支持 GET 和 POST 请求
 * 返回支付表单HTML或跳转URL
 */
app.all('/submit.php', async (req, res) => {
  try {
    const params = getRequestParams(req);
    const result = await epayAdapter.submitOrder(params);
    
    // 如果返回的是表单HTML，直接返回HTML
    if (result.code === 1 && result.data && result.data.form) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(result.data.form);
    } else {
      res.json(result);
    }
  } catch (error) {
    handleErrorResponse(error, epayAdapter, res);
  }
});

/**
 * 易支付 统一API接口（api.php）
 * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
 * 通过 act 参数区分不同的操作：
 * - act=order: 查询单个订单
 * - act=orders: 批量查询订单
 * - act=refund: 退款
 * - act=query: 查询商户信息
 * - act=settle: 查询结算记录
 * 支持 GET 和 POST 请求
 */
app.all('/api.php', async (req, res) => {
  try {
    const params = getRequestParams(req);
    const act = params.act;

    if (!act) {
      return res.json({
        code: -1,
        msg: '缺少参数: act',
        data: null
      });
    }

    switch (act) {
      case 'order':
        // 查询单个订单
        // api.php?act=order&pid={商户ID}&key={商户密钥}&out_trade_no={商户订单号}
        // 或 api.php?act=order&pid={商户ID}&key={商户密钥}&trade_no={平台订单号}
        const orderResult = await epayAdapter.queryOrder(params);
        return res.json(orderResult);

      case 'orders':
        // 批量查询订单
        // api.php?act=orders&pid={商户ID}&key={商户密钥}&limit={数量}&page={页码}
        const ordersResult = await epayAdapter.queryOrders(params);
        return res.json(ordersResult);

      case 'refund':
        // 退款
        // api.php?act=refund&pid={商户ID}&key={商户密钥}&out_trade_no={商户订单号}&money={退款金额}
        const refundResult = await epayAdapter.refundOrder(params);
        return res.json(refundResult);

      case 'query':
        // 查询商户信息
        // api.php?act=query&pid={商户ID}&key={商户密钥}
        const queryResult = await epayAdapter.queryMerchant(params);
        return res.json(queryResult);

      case 'settle':
        // 查询结算记录
        // api.php?act=settle&pid={商户ID}&key={商户密钥}
        const settleResult = await epayAdapter.querySettle(params);
        return res.json(settleResult);

      default:
        return res.json({
          code: -1,
          msg: `不支持的 act 参数: ${act}`,
          data: null
        });
    }
  } catch (error) {
    handleErrorResponse(error, epayAdapter, res);
  }
});

/**
 * Jeepay 支付结果异步通知接口
 * POST /api/payment/notify
 * 接收 Jeepay 的支付通知，转换为 易支付 格式并转发到商户的 notify_url
 */
app.post('/api/payment/notify', async (req, res) => {
  try {
    // 接收 Jeepay 格式的通知
    const jeepayNotify = req.body;

    // 验证 Jeepay 通知签名
    if (!jeepay.verifyNotify(jeepayNotify)) {
      console.error('Jeepay 支付通知签名验证失败:', jeepayNotify);
      return res.send('fail');
    }

    console.log('收到 Jeepay 支付通知:', {
      payOrderId: jeepayNotify.payOrderId,
      mchOrderNo: jeepayNotify.mchOrderNo,
      amount: jeepayNotify.amount,
      state: jeepayNotify.state
    });

    // 转换为 易支付 格式的通知
    const epayNotify = epayAdapter.handleNotify(jeepayNotify);

    // 从扩展参数中获取商户的 notify_url
    let notifyUrl = null;
    if (jeepayNotify.extParam) {
      try {
        const extParamObj = JSON.parse(jeepayNotify.extParam);
        notifyUrl = extParamObj.epay_notify_url || null;
      } catch (e) {
        // extParam 不是 JSON 格式，忽略
        console.warn('extParam 解析失败:', e.message);
      }
    }

    if (notifyUrl) {
      // 转发通知到商户的 notify_url（使用 GET 方式）
      try {
        const forwardResponse = await axios.get(notifyUrl, {
          params: epayNotify,
          timeout: 10000 // 10秒超时
        });

        console.log('支付通知转发成功:', {
          notifyUrl,
          status: forwardResponse.status,
          response: forwardResponse.data
        });
      } catch (forwardError) {
        console.error('支付通知转发失败:', {
          notifyUrl,
          error: forwardError.message
        });
        // 转发失败不影响 Jeepay 通知的响应，但应该记录日志以便重试
      }
    } else {
      console.log('未找到商户 notify_url，跳过通知转发');
    }

    // 必须返回 'success' 给 Jeepay
    res.send('success');
  } catch (error) {
    console.error('处理支付通知失败:', error);
    res.send('fail');
  }
});

/**
 * Jeepay 退款结果异步通知接口
 * POST /api/refund/notify
 * 接收 Jeepay 的退款通知，转换为 易支付 格式并转发到商户的 notify_url
 */
app.post('/api/refund/notify', async (req, res) => {
  try {
    // 接收 Jeepay 格式的退款通知
    const jeepayRefundNotify = req.body;

    // 验证 Jeepay 通知签名
    if (!jeepay.verifyNotify(jeepayRefundNotify)) {
      console.error('Jeepay 退款通知签名验证失败:', jeepayRefundNotify);
      return res.send('fail');
    }

    console.log('收到 Jeepay 退款通知:', {
      refundOrderId: jeepayRefundNotify.refundOrderId,
      payOrderId: jeepayRefundNotify.payOrderId,
      mchRefundNo: jeepayRefundNotify.mchRefundNo,
      refundAmount: jeepayRefundNotify.refundAmount,
      state: jeepayRefundNotify.state
    });

    // 转换为 易支付 格式的退款通知
    const epayNotify = epayAdapter.handleRefundNotify(jeepayRefundNotify);

    // 从扩展参数中获取商户的 notify_url
    let notifyUrl = null;
    if (jeepayRefundNotify.extParam) {
      try {
        const extParamObj = JSON.parse(jeepayRefundNotify.extParam);
        notifyUrl = extParamObj.epay_notify_url || null;
      } catch (e) {
        // extParam 不是 JSON 格式，忽略
        console.warn('extParam 解析失败:', e.message);
      }
    }

    if (notifyUrl) {
      // 转发通知到商户的 notify_url（使用 GET 方式）
      try {
        const forwardResponse = await axios.get(notifyUrl, {
          params: epayNotify,
          timeout: 10000 // 10秒超时
        });

        console.log('退款通知转发成功:', {
          notifyUrl,
          status: forwardResponse.status,
          response: forwardResponse.data
        });
      } catch (forwardError) {
        console.error('退款通知转发失败:', {
          notifyUrl,
          error: forwardError.message
        });
        // 转发失败不影响 Jeepay 通知的响应，但应该记录日志以便重试
      }
    } else {
      console.log('未找到商户 notify_url，跳过通知转发');
    }

    // 必须返回 'success' 给 Jeepay
    res.send('success');
  } catch (error) {
    console.error('处理退款通知失败:', error);
    res.send('fail');
  }
});

// ========== 启动服务器 ==========
app.listen(PORT, config.server.host, () => {
  console.log(`=================================`);
  console.log(`支付平台 API 服务已启动`);
  console.log(`绑定地址: ${config.server.host}:${PORT}`);
  console.log(`服务地址: ${serverHost}`);
  console.log(`配置信息:`);
  console.log(`Jeepay:`);
  console.log(`  - Base URL: ${config.jeepay.baseUrl}`);
  console.log(`  - 商户号: ${config.jeepay.mchNo}`);
  console.log(`  - 应用ID: ${config.jeepay.appId}`);
  console.log(`易支付:`);
  console.log(`  - 商户ID: ${config.epay.pid}`);
  console.log(`网站域名: ${config.server.siteDomain}`);
  console.log(`=================================`);
});
