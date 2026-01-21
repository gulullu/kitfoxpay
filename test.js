const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const router = express.Router();

// 从 admin.js 获取认证中间件
const { requireAuth } = require('./admin');


/**
 * 发送 HTTP 请求到本地服务器
 * @param {Object} req - Express 请求对象
 * @param {string} path - 请求路径
 * @param {Object} options - 请求选项
 * @returns {Promise<Object>} 响应数据
 */
function httpRequest(req, path, options = {}) {
  return new Promise((resolve, reject) => {
    const serverUrl = getServerBaseUrl(req);
    const urlObj = new URL(path, serverUrl);
    
    // 添加查询参数
    if (options.query) {
      Object.keys(options.query).forEach(key => {
        if (options.query[key]) {
          urlObj.searchParams.append(key, options.query[key]);
        }
      });
    }
    
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    const protocol = urlObj.protocol.replace(':', ''); // 从 URL 对象获取协议（去掉冒号）
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': options.headers?.['Content-Type'] || 'application/json',
        'Host': urlObj.host,
        // 传递原始请求的头部信息，用于反向代理环境
        'X-Forwarded-For': req.ip || req.connection.remoteAddress,
        'X-Forwarded-Proto': req.get('x-forwarded-proto') || protocol,
        'X-Forwarded-Host': req.get('x-forwarded-host') || urlObj.host,
        ...options.headers
      }
    };

    const httpReq = httpModule.request(requestOptions, (res) => {
      // 处理重定向（302, 301等）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 如果是重定向，尝试跟随重定向
        const redirectUrl = res.headers.location;
        const redirectUrlObj = new URL(redirectUrl, serverUrl);
        
        // 重新构建请求选项
        const redirectOptions = {
          hostname: redirectUrlObj.hostname,
          port: redirectUrlObj.port || (redirectUrlObj.protocol === 'https:' ? 443 : 80),
          path: redirectUrlObj.pathname + redirectUrlObj.search,
          method: options.method || 'GET',
          headers: requestOptions.headers
        };
        
        const redirectModule = redirectUrlObj.protocol === 'https:' ? https : http;
        const redirectReq = redirectModule.request(redirectOptions, (redirectRes) => {
          let redirectData = '';
          redirectRes.on('data', (chunk) => {
            redirectData += chunk;
          });
          redirectRes.on('end', () => {
            try {
              const contentType = redirectRes.headers['content-type'] || '';
              if (contentType.includes('application/json')) {
                resolve(JSON.parse(redirectData));
              } else {
                try {
                  resolve(JSON.parse(redirectData));
                } catch (e) {
                  resolve({ raw: redirectData, contentType });
                }
              }
            } catch (e) {
              reject(new Error(`解析重定向响应失败: ${e.message}`));
            }
          });
        });
        
        redirectReq.on('error', (error) => {
          reject(new Error(`重定向请求失败: ${error.message}`));
        });
        
        if (options.body) {
          const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
          redirectReq.write(bodyStr);
        }
        
        redirectReq.end();
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve(JSON.parse(data));
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({ raw: data, contentType });
            }
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    httpReq.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      httpReq.write(bodyStr);
    }

    httpReq.end();
  });
}

/**
 * 获取服务器基础 URL
 * 支持反向代理环境（nginx等）
 */
function getServerBaseUrl(req) {
  // 优先检查 X-Forwarded-Proto（反向代理设置的协议）
  let protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  
  // 如果协议是 https，确保使用 https
  if (protocol === 'https' || req.secure) {
    protocol = 'https';
  } else {
    protocol = 'http';
  }
  
  // 优先使用 X-Forwarded-Host（反向代理设置的主机）
  // 其次使用 Host 头
  // 最后使用配置中的服务器地址
  let host = req.get('x-forwarded-host') || req.get('host');
  
  if (!host) {
    // 从配置中获取服务器地址
    delete require.cache[require.resolve('./config')];
    const config = require('./config');
    if (config.server && config.server.host && config.server.port) {
      // 如果配置的是 0.0.0.0，使用 localhost
      if (config.server.host === '0.0.0.0') {
        host = `localhost:${config.server.port}`;
      } else {
        host = `${config.server.host}:${config.server.port}`;
      }
    } else {
      host = 'localhost:9219';
    }
  }
  
  return `${protocol}://${host}`;
}

/**
 * 测试 Jeepay 统一下单接口
 * POST /api/test/jeepay/unified-order
 */
router.post('/jeepay/unified-order', requireAuth, async (req, res) => {
  try {
    const {
      mchOrderNo,
      wayCode,
      amount,
      subject,
      body,
      channelExtra
    } = req.body;

    // 参数验证
    if (!mchOrderNo || !wayCode || !amount || !subject || !body) {
      return res.status(400).json({
        error: '参数不完整',
        message: '缺少必填参数: mchOrderNo, wayCode, amount, subject, body'
      });
    }

    const requestBody = {
      mchOrderNo,
      wayCode,
      amount: parseInt(amount),
      subject,
      body,
      currency: 'cny',
      clientIp: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    };

    // 处理 channelExtra 参数（可能是 JSON 字符串或对象）
    if (channelExtra) {
      if (typeof channelExtra === 'string') {
        try {
          requestBody.channelExtra = JSON.parse(channelExtra);
        } catch (e) {
          // 如果解析失败，尝试作为普通字符串传递
          requestBody.channelExtra = channelExtra;
        }
      } else {
        requestBody.channelExtra = channelExtra;
      }
    }

    const result = await httpRequest(req, '/api/jeepay/payment/unified-order', {
      method: 'POST',
      body: requestBody,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: result.code === 0,
      data: result.data || result,
      message: result.code === 0 ? '测试成功' : (result.msg || '测试失败')
    });
  } catch (error) {
    console.error('Jeepay 统一下单测试失败:', error);
    res.status(500).json({
      error: '测试失败',
      message: error.message,
      data: null
    });
  }
});

/**
 * 测试 Jeepay 查询订单接口
 * POST /api/test/jeepay/query-order
 */
router.post('/jeepay/query-order', requireAuth, async (req, res) => {
  try {
    const { payOrderId, mchOrderNo } = req.body;

    if (!payOrderId && !mchOrderNo) {
      return res.status(400).json({
        error: '参数不完整',
        message: '请提供 payOrderId 或 mchOrderNo 参数'
      });
    }

    const query = {};
    if (payOrderId) query.payOrderId = payOrderId;
    if (mchOrderNo) query.mchOrderNo = mchOrderNo;

    const result = await httpRequest(req, '/api/jeepay/payment/query', {
      method: 'GET',
      query: query,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: result.code === 0,
      data: result.data || result,
      message: result.code === 0 ? '测试成功' : (result.msg || '测试失败')
    });
  } catch (error) {
    console.error('Jeepay 查询订单测试失败:', error);
    res.status(500).json({
      error: '测试失败',
      message: error.message,
      data: null
    });
  }
});

/**
 * 测试易支付创建订单接口（mapi.php）
 * POST /api/test/epay/create-order
 */
router.post('/epay/create-order', requireAuth, async (req, res) => {
  try {
    // 获取配置以生成签名
    delete require.cache[require.resolve('./config')];
    const config = require('./config');
    
    if (!config.epay || !config.epay.key) {
      return res.status(400).json({
        error: '配置不完整',
        message: '请先配置易支付密钥'
      });
    }

    const params = req.body;
    
    // 生成签名（测试时自动生成）
    const { generateMD5Sign } = require('./newpay');
    const signParams = {
      pid: params.pid || config.epay.pid,
      type: params.type,
      out_trade_no: params.out_trade_no,
      notify_url: params.notify_url || '',
      return_url: params.return_url || '',
      name: params.name,
      money: params.money,
      param: params.param || ''
    };
    
    // 移除空值
    Object.keys(signParams).forEach(key => {
      if (signParams[key] === '' || signParams[key] === null || signParams[key] === undefined) {
        delete signParams[key];
      }
    });
    
    const sign = generateMD5Sign(signParams, config.epay.key);
    signParams.sign = sign;
    signParams.sign_type = 'MD5';

    // 构建查询字符串或 POST body
    const queryParams = new URLSearchParams();
    Object.keys(signParams).forEach(key => {
      queryParams.append(key, signParams[key]);
    });

    // 使用 POST 方式发送
    const result = await httpRequest(req, '/mapi.php', {
      method: 'POST',
      body: queryParams.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    res.json({
      success: result.code === 1,
      data: result,
      message: result.code === 1 ? '测试成功' : (result.msg || '测试失败')
    });
  } catch (error) {
    console.error('易支付创建订单测试失败:', error);
    res.status(500).json({
      error: '测试失败',
      message: error.message,
      data: null
    });
  }
});

/**
 * 测试易支付提交订单接口（submit.php）
 * POST /api/test/epay/submit-order
 */
router.post('/epay/submit-order', requireAuth, async (req, res) => {
  try {
    // 获取配置以生成签名
    delete require.cache[require.resolve('./config')];
    const config = require('./config');
    
    if (!config.epay || !config.epay.key) {
      return res.status(400).json({
        error: '配置不完整',
        message: '请先配置易支付密钥'
      });
    }

    const params = req.body;
    
    // 生成签名（测试时自动生成）
    const { generateMD5Sign } = require('./newpay');
    const signParams = {
      pid: params.pid || config.epay.pid,
      type: params.type,
      out_trade_no: params.out_trade_no,
      notify_url: params.notify_url || '',
      return_url: params.return_url || '',
      name: params.name,
      money: params.money,
      param: params.param || '',
      timestamp: params.timestamp || Math.floor(Date.now() / 1000)
    };
    
    // 移除空值
    Object.keys(signParams).forEach(key => {
      if (signParams[key] === '' || signParams[key] === null || signParams[key] === undefined) {
        delete signParams[key];
      }
    });
    
    const sign = generateMD5Sign(signParams, config.epay.key);
    signParams.sign = sign;
    signParams.sign_type = 'MD5';

    const serverUrl = getServerBaseUrl(req);
    const queryParams = new URLSearchParams();
    Object.keys(signParams).forEach(key => {
      queryParams.append(key, signParams[key]);
    });

    // 使用 POST 方式发送
    const result = await httpRequest(req, '/submit.php', {
      method: 'POST',
      body: queryParams.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // 如果返回的是 HTML，需要特殊处理
    if (result.raw && typeof result.raw === 'string' && result.raw.trim().startsWith('<')) {
      // 返回的是 HTML 表单
      res.json({
        success: true,
        data: {
          form: result.raw,
          type: 'html'
        },
        message: '测试成功（返回支付表单HTML）'
      });
    } else if (result.contentType && result.contentType.includes('text/html')) {
      // 如果响应头显示是 HTML
      res.json({
        success: true,
        data: {
          form: result.raw || '',
          type: 'html'
        },
        message: '测试成功（返回支付表单HTML）'
      });
    } else {
      // 尝试解析为 JSON
      try {
        const jsonResult = typeof result === 'string' ? JSON.parse(result) : result;
        res.json({
          success: jsonResult.code === 1,
          data: jsonResult,
          message: jsonResult.code === 1 ? '测试成功' : (jsonResult.msg || '测试失败')
        });
      } catch (e) {
        // 如果解析失败，可能是 HTML
        res.json({
          success: true,
          data: {
            form: typeof result === 'string' ? result : JSON.stringify(result),
            type: 'html'
          },
          message: '测试成功（返回支付表单HTML）'
        });
      }
    }
  } catch (error) {
    console.error('易支付提交订单测试失败:', error);
    res.status(500).json({
      error: '测试失败',
      message: error.message,
      data: null
    });
  }
});

/**
 * 测试易支付查询订单接口（api.php?act=order）
 * POST /api/test/epay/query-order
 */
router.post('/epay/query-order', requireAuth, async (req, res) => {
  try {
    // 获取配置以生成签名
    delete require.cache[require.resolve('./config')];
    const config = require('./config');
    
    if (!config.epay || !config.epay.key) {
      return res.status(400).json({
        error: '配置不完整',
        message: '请先配置易支付密钥'
      });
    }

    const params = req.body;
    
    // 生成签名（测试时自动生成）
    const { generateMD5Sign } = require('./newpay');
    const signParams = {
      pid: params.pid || config.epay.pid,
      key: config.epay.key,
      out_trade_no: params.out_trade_no || '',
      trade_no: params.trade_no || ''
    };
    
    // 移除空值
    Object.keys(signParams).forEach(key => {
      if (signParams[key] === '' || signParams[key] === null || signParams[key] === undefined) {
        delete signParams[key];
      }
    });
    
    const sign = generateMD5Sign(signParams, config.epay.key);
    signParams.sign = sign;
    signParams.sign_type = 'MD5';
    signParams.act = 'order';

    const query = {};
    Object.keys(signParams).forEach(key => {
      query[key] = signParams[key];
    });

    const result = await httpRequest(req, '/api.php', {
      method: 'GET',
      query: query,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: result.code === 1,
      data: result,
      message: result.code === 1 ? '测试成功' : (result.msg || '测试失败')
    });
  } catch (error) {
    console.error('易支付查询订单测试失败:', error);
    res.status(500).json({
      error: '测试失败',
      message: error.message,
      data: null
    });
  }
});

/**
 * 测试易支付退款接口（api.php?act=refund）
 * POST /api/test/epay/refund
 */
router.post('/epay/refund', requireAuth, async (req, res) => {
  try {
    // 获取配置以生成签名
    delete require.cache[require.resolve('./config')];
    const config = require('./config');
    
    if (!config.epay || !config.epay.key) {
      return res.status(400).json({
        error: '配置不完整',
        message: '请先配置易支付密钥'
      });
    }

    const params = req.body;
    
    // 生成签名（测试时自动生成）
    const { generateMD5Sign } = require('./newpay');
    const signParams = {
      pid: params.pid || config.epay.pid,
      key: config.epay.key,
      out_trade_no: params.out_trade_no || '',
      trade_no: params.trade_no || '',
      money: params.money || ''
    };
    
    // 移除空值
    Object.keys(signParams).forEach(key => {
      if (signParams[key] === '' || signParams[key] === null || signParams[key] === undefined) {
        delete signParams[key];
      }
    });
    
    const sign = generateMD5Sign(signParams, config.epay.key);
    signParams.sign = sign;
    signParams.sign_type = 'MD5';
    signParams.act = 'refund';

    const query = {};
    Object.keys(signParams).forEach(key => {
      query[key] = signParams[key];
    });

    const result = await httpRequest(req, '/api.php', {
      method: 'GET',
      query: query,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: result.code === 1,
      data: result,
      message: result.code === 1 ? '测试成功' : (result.msg || '测试失败')
    });
  } catch (error) {
    console.error('易支付退款测试失败:', error);
    res.status(500).json({
      error: '测试失败',
      message: error.message,
      data: null
    });
  }
});

module.exports = router;
