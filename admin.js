const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const router = express.Router();
const configRouter = express.Router();

/**
 * 密码哈希函数（简单哈希，用于验证）
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 认证中间件：检查用户是否已登录
 */
function requireAuth(req, res, next) {
  // 重新加载配置以获取最新密码
  delete require.cache[require.resolve('./config')];
  const currentConfig = require('./config');
  
  if (req.session && req.session.authenticated) {
    // 验证 session 中的密码是否仍然有效
    if (req.session.passwordHash === hashPassword(currentConfig.admin.password)) {
      return next();
    } else {
      // 密码已更改，清除 session
      req.session.authenticated = false;
      delete req.session.passwordHash;
    }
  }
  
  res.status(401).json({ 
    error: '未授权', 
    message: '请先登录',
    requiresAuth: true
  });
}

/**
 * 登录接口
 * POST /api/admin/login
 */
router.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        error: '参数错误', 
        message: '密码不能为空' 
      });
    }

    // 重新加载配置以获取最新密码
    delete require.cache[require.resolve('./config')];
    const currentConfig = require('./config');
    
    if (password === currentConfig.admin.password) {
      req.session.authenticated = true;
      req.session.passwordHash = hashPassword(currentConfig.admin.password);
      res.json({ 
        success: true, 
        message: '登录成功' 
      });
    } else {
      res.status(401).json({ 
        error: '认证失败', 
        message: '密码错误' 
      });
    }
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ 
      error: '登录失败', 
      message: error.message 
    });
  }
});

/**
 * 登出接口
 * POST /api/admin/logout
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        error: '登出失败', 
        message: err.message 
      });
    }
    res.json({ 
      success: true, 
      message: '已登出' 
    });
  });
});

/**
 * 检查登录状态
 * GET /api/admin/status
 */
router.get('/status', (req, res) => {
  // 重新加载配置以获取最新密码
  delete require.cache[require.resolve('./config')];
  const currentConfig = require('./config');
  
  if (req.session && req.session.authenticated) {
    // 验证 session 中的密码是否仍然有效
    if (req.session.passwordHash === hashPassword(currentConfig.admin.password)) {
      return res.json({ 
        authenticated: true 
      });
    } else {
      // 密码已更改，清除 session
      req.session.authenticated = false;
      delete req.session.passwordHash;
    }
  }
  
  res.json({ 
    authenticated: false 
  });
});

/**
 * 获取当前配置
 * GET /api/config
 */
configRouter.get('/', requireAuth, (req, res) => {
  try {
    // 重新加载配置文件以获取最新内容
    delete require.cache[require.resolve('./config')];
    const currentConfig = require('./config');
    
    res.json({
      baseUrl: currentConfig.baseUrl,
      mchNo: currentConfig.mchNo,
      appId: currentConfig.appId,
      privateKey: currentConfig.privateKey,
      siteDomain: currentConfig.siteDomain || 'http://localhost:9219',
      epay: {
        pid: currentConfig.epay?.pid,
        key: currentConfig.epay?.key
      },
      server: {
        host: currentConfig.server?.host || '0.0.0.0',
        port: currentConfig.server?.port || 9219
      }
    });
  } catch (error) {
    console.error('读取配置失败:', error);
    res.status(500).json({ 
      error: '读取配置失败', 
      message: error.message 
    });
  }
});


/**
 * 更新配置
 * PUT /api/config
 */
configRouter.put('/', requireAuth, (req, res) => {
  try {
    const newConfig = req.body;

    // 验证必填字段
    if (!newConfig.jeepay || !newConfig.jeepay.baseUrl || !newConfig.jeepay.mchNo || !newConfig.jeepay.appId || !newConfig.jeepay.privateKey) {
      return res.status(400).json({ 
        error: '参数不完整', 
        message: 'Jeepay 配置项不能为空' 
      });
    }

    if (!newConfig.server || !newConfig.server.siteDomain) {
      return res.status(400).json({ 
        error: '参数不完整', 
        message: '网站域名不能为空' 
      });
    }

    if (!newConfig.epay || !newConfig.epay.pid || !newConfig.epay.key) {
      return res.status(400).json({ 
        error: '参数不完整', 
        message: '易支付 配置项不能为空（商户ID和密钥必填）' 
      });
    }

    if (!newConfig.server || !newConfig.server.host || !newConfig.server.port) {
      return res.status(400).json({ 
        error: '参数不完整', 
        message: '服务器配置项不能为空（需要绑定IP和端口）' 
      });
    }

    // 转义函数：处理单引号字符串
    const escapeSingleQuote = (str) => {
      return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    };

    // 转义函数：处理模板字符串（用于多行 PEM 密钥）
    const escapeTemplateString = (str) => {
      return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
    };

    // 获取当前配置以保留 admin.password（如果新配置中没有提供）
    delete require.cache[require.resolve('./config')];
    const currentConfig = require('./config');
    const adminPassword = newConfig.admin?.password || currentConfig.admin?.password || 'admin123';

    // 构建配置文件内容
    const configContent = `/**
 * 支付平台配置文件
 * 
 * 配置说明：
 * - jeepay: Jeepay 支付平台配置
 * - epay: 易支付接口配置（适配器配置）
 * - server: 服务器运行配置
 * - admin: 管理后台配置
 */

module.exports = {
  // ========== Jeepay 支付平台配置 ==========
  jeepay: {
    // API 基础地址
    baseUrl: '${escapeSingleQuote(newConfig.jeepay.baseUrl)}',
    
    // 商户号
    mchNo: '${escapeSingleQuote(newConfig.jeepay.mchNo)}',
    
    // 应用ID
    appId: '${escapeSingleQuote(newConfig.jeepay.appId)}',
    
    // 商户私钥（用于签名和验签）
    privateKey: \`${escapeTemplateString(newConfig.jeepay.privateKey)}\`
  },

  // ========== 易支付接口配置 ==========
  // 注意：此配置用于适配易支付接口标准，实际支付仍通过 Jeepay 处理
  epay: {
    // 商户ID（易支付格式）
    pid: '${escapeSingleQuote(newConfig.epay.pid)}',
    
    // 商户密钥（用于 MD5 签名）
    key: '${escapeSingleQuote(newConfig.epay.key)}'
  },

  // ========== 服务器配置 ==========
  server: {
    // 绑定的IP地址（0.0.0.0 表示监听所有网络接口）
    host: '${escapeSingleQuote(newConfig.server.host)}',
    
    // 绑定的端口号
    port: ${newConfig.server.port},
    
    // 网站域名（用于生成通知URL和支付跳转URL）
    // 注意：如果使用反向代理（如 nginx），请设置为实际访问域名
    siteDomain: '${escapeSingleQuote(newConfig.server.siteDomain)}'
  },

  // ========== 管理后台配置 ==========
  admin: {
    // 管理后台登录密码
    password: '${escapeSingleQuote(adminPassword)}'
  }
};
`;

    // 写入配置文件
    const configPath = path.join(__dirname, 'config.js');
    fs.writeFileSync(configPath, configContent, 'utf8');

    res.json({ 
      success: true, 
      message: '配置保存成功，请重启服务器使配置生效' 
    });
  } catch (error) {
    console.error('保存配置失败:', error);
    res.status(500).json({ 
      error: '保存配置失败', 
      message: error.message 
    });
  }
});

/**
 * 获取本机IP地址列表
 * GET /api/config/network-interfaces
 */
configRouter.get('/network-interfaces', requireAuth, (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const ipList = ['0.0.0.0', '127.0.0.1']; // 默认包含所有接口和本地回环
    
    // 遍历所有网络接口
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // 只获取 IPv4 地址，排除内部地址
        if (iface.family === 'IPv4' && !iface.internal) {
          if (!ipList.includes(iface.address)) {
            ipList.push(iface.address);
          }
        }
      }
    }
    
    res.json({
      success: true,
      ipList: ipList
    });
  } catch (error) {
    console.error('获取网络接口失败:', error);
    res.status(500).json({
      error: '获取网络接口失败',
      message: error.message,
      ipList: ['0.0.0.0', '127.0.0.1'] // 返回默认值
    });
  }
});

module.exports = {
  adminRouter: router,
  configRouter: configRouter,
  requireAuth: requireAuth
};
