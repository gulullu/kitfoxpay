/**
 * 配置示例模板
 * 复制本文件为 config.js 并填入真实配置
 */

module.exports = {
  // ========== Jeepay 支付平台配置 ==========
  jeepay: {
    baseUrl: 'https://pay.jeepay.vip',   // Jeepay API 基础地址
    mchNo: '你的商户号',                   // 商户号
    appId: '你的应用ID',                  // 应用ID
    apiKey: '你的 API Key（商户应用密钥）' // 用 jeepay/new-api 同款 MD5 key 规则签名
  },

  // ========== 易支付接口配置（适配器） ==========
  epay: {
    pid: '你的易支付商户ID',
    key: '你的易支付密钥'                 // MD5 签名密钥
  },

  // ========== 服务器配置 ==========
  server: {
    host: '0.0.0.0',                      // 绑定 IP（0.0.0.0 监听全部网卡）
    port: 9219,                           // 监听端口
    siteDomain: 'http://localhost:9219'   // 对外访问域名（用于回调/跳转）
  },

  // ========== 管理后台配置 ==========
  admin: {
    password: '请修改为安全密码'
  }
};
