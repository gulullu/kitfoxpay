/**
 * 测试 Jeepay 签名函数
 * 用于调试签名问题
 */

const JeepayClient = require('./jeepay');
const config = require('./config');

// 创建客户端实例
const jeepay = new JeepayClient({
  baseUrl: config.jeepay.baseUrl,
  mchNo: config.jeepay.mchNo,
  appId: config.jeepay.appId,
  apiKey: config.jeepay.apiKey || config.jeepay.privateKey
});

// 测试参数（根据实际请求参数修改）
const testParams = {
  mchNo: config.jeepay.mchNo,
  appId: config.jeepay.appId,
  mchOrderNo: 'TEST' + Date.now(),
  wayCode: 'ALI_BAR',
  amount: 100,
  currency: 'cny',
  subject: '测试商品',
  body: '商品描述',
  clientIp: '192.168.1.100',
  notifyUrl: 'https://example.com/notify',
  reqTime: Date.now().toString(),
  version: '1.0',
  signType: 'MD5'
};

const signKey = config.jeepay.apiKey || config.jeepay.privateKey || '';

console.log('=== 测试签名生成 ===');
console.log('配置信息:');
console.log('  - Base URL:', config.jeepay.baseUrl);
console.log('  - 商户号:', config.jeepay.mchNo);
console.log('  - 应用ID:', config.jeepay.appId);
console.log('  - API Key 长度:', signKey.length);
console.log('\n测试参数:');
console.log(JSON.stringify(testParams, null, 2));

// 生成签名
const sign = jeepay.generateSign(testParams);
console.log('\n生成的签名:', sign);

// 验证签名
const isValid = jeepay.verifySign({ ...testParams, sign });
console.log('签名验证结果:', isValid ? '✓ 通过' : '✗ 失败');

// 手动计算签名（用于对比）
console.log('\n=== 手动计算签名过程 ===');
const sortedKeys = Object.keys(testParams)
  .filter(k => k !== 'sign' && testParams[k] !== null && testParams[k] !== undefined && testParams[k] !== '')
  .sort();

console.log('排序后的键:', sortedKeys);

const filtered = {};
sortedKeys.forEach(k => {
  const v = testParams[k];
  if (typeof v === 'number' || typeof v === 'boolean') {
    filtered[k] = String(v);
  } else if (typeof v === 'object' && v !== null) {
    filtered[k] = JSON.stringify(v);
  } else {
    filtered[k] = String(v);
  }
});

const stringA = sortedKeys.map(k => `${k}=${filtered[k]}`).join('&');
const stringSignTemp = `${stringA}&key=${signKey}`;

console.log('待签名字符串 (stringA):');
console.log(stringA);
console.log('\n完整签名字符串 (stringSignTemp):');
console.log(stringSignTemp);

const crypto = require('crypto');
const manualSign = crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();
console.log('\n手动计算的签名:', manualSign);
console.log('签名匹配:', sign === manualSign ? '✓ 是' : '✗ 否');
