/**
 * 生产环境配置模板
 *
 * 用法：
 * 1. 复制为 config.js
 * 2. 填入真实 Jeepay / 易支付 / 域名 / 后台密码
 * 3. 不要提交 config.js
 */

module.exports = {
  jeepay: {
    // 你的 Jeepay API 地址
    baseUrl: 'https://pay.jeepay.vip',

    // Jeepay 商户号
    mchNo: 'REPLACE_WITH_JEEPAY_MCH_NO',

    // Jeepay 应用 ID
    appId: 'REPLACE_WITH_JEEPAY_APP_ID',

    // Jeepay 商户应用 API Key（按 jeequan/new-api 的商户应用签名方式）
    apiKey: 'REPLACE_WITH_JEEPAY_API_KEY'
  },

  epay: {
    // New API 里要填的易支付商户 ID
    pid: 'REPLACE_WITH_EPAY_PID',

    // New API 里要填的易支付密钥
    key: 'REPLACE_WITH_EPAY_KEY'
  },

  server: {
    // 单机部署一般直接监听全部网卡
    host: '0.0.0.0',

    // 对外服务端口
    port: 9219,

    // 这里必须填你的正式外网域名
    // 例如: https://pay.example.com
    siteDomain: 'https://pay.example.com'
  },

  admin: {
    // 后台登录密码，务必改强密码
    password: 'REPLACE_WITH_STRONG_ADMIN_PASSWORD'
  }
};
