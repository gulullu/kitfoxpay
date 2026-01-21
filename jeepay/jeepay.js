const crypto = require('crypto');
const axios = require('axios');

/**
 * Jeepay 支付客户端
 * 根据 Jeepay API 文档实现：https://docs.jeequan.com/docs/jeepay/payment_api
 * 
 * 包含签名生成、签名验证以及所有支付接口功能
 */
class JeepayClient {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.baseUrl - Jeepay API 基础URL，默认: https://pay.jeepay.vip
   * @param {string} config.mchNo - 商户号
   * @param {string} config.appId - 应用ID
   * @param {string} config.privateKey - 商户私钥
   */
  constructor(config) {
    this.baseUrl = config.baseUrl || 'https://pay.jeepay.vip';
    this.mchNo = config.mchNo;
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.version = '1.0';
    this.signType = 'MD5';
  }

  /**
   * 生成签名
   * 根据 Jeepay API 文档实现：https://docs.jeequan.com/docs/jeepay/api_rule
   * 
   * @param {Object} params - 待签名的参数对象
   * @param {string} privateKey - 商户私钥（可选，不传则使用实例的私钥）
   * @returns {string} 返回大写的 MD5 签名值
   */
  generateSign(params, privateKey) {
    const signKey = privateKey || this.privateKey;
    
    // 第一步：筛选非空参数并按参数名ASCII码从小到大排序（字典序）
    // 根据文档：参数名ASCII码从小到大排序，如果参数的值为空不参与签名
    const filteredParams = {};
    const keys = Object.keys(params)
      .filter(key => {
        // 排除 sign 参数
        if (key === 'sign') {
          return false;
        }
        // 只保留非空值（null、undefined、空字符串都不参与签名）
        const value = params[key];
        if (value === null || value === undefined || value === '') {
          return false;
        }
        return true;
      })
      .sort(); // 按ASCII码排序（字典序）

    // 构建排序后的参数对象，确保所有值都转换为字符串
    keys.forEach(key => {
      const value = params[key];
      // 根据Jeepay文档，所有值都转为字符串
      // 数字直接转字符串，对象转JSON字符串，字符串保持原样
      if (typeof value === 'number') {
        filteredParams[key] = String(value);
      } else if (typeof value === 'boolean') {
        filteredParams[key] = String(value);
      } else if (typeof value === 'object' && value !== null) {
        // 对象或数组转为JSON字符串
        filteredParams[key] = JSON.stringify(value);
      } else {
        // 字符串类型直接使用
        filteredParams[key] = String(value);
      }
    });

    // 使用URL键值对格式拼接成字符串 stringA
    // 格式：key1=value1&key2=value2...
    const stringA = keys
      .map(key => {
        return `${key}=${filteredParams[key]}`;
      })
      .join('&');

    // 第二步：在 stringA 最后拼接上 key
    // 格式：stringA&key=私钥
    const stringSignTemp = `${stringA}&key=${signKey}`;

    // 对 stringSignTemp 进行 MD5 运算，再将得到的字符串所有字符转换为大写
    const signValue = crypto
      .createHash('md5')
      .update(stringSignTemp, 'utf8')
      .digest('hex')
      .toUpperCase();

    return signValue;
  }

  /**
   * 验证签名
   * 
   * @param {Object} params - 包含 sign 字段的参数对象
   * @param {string} privateKey - 商户私钥（可选，不传则使用实例的私钥）
   * @returns {boolean} 返回签名是否有效
   */
  verifySign(params, privateKey) {
    const receivedSign = params.sign;
    if (!receivedSign) {
      return false;
    }

    const calculatedSign = this.generateSign(params, privateKey);
    return receivedSign === calculatedSign;
  }

  /**
   * 获取13位时间戳（毫秒）
   * @returns {string} 13位时间戳字符串
   */
  getReqTime() {
    return Date.now().toString();
  }

  /**
   * 构建基础参数
   * @param {Object} extraParams - 额外参数
   * @returns {Object} 基础参数对象
   */
  buildBaseParams(extraParams = {}) {
    return {
      mchNo: this.mchNo,
      appId: this.appId,
      version: this.version,
      signType: this.signType,
      reqTime: this.getReqTime(),
      ...extraParams
    };
  }

  /**
   * 发送请求
   * @param {string} url - 请求URL
   * @param {Object} params - 请求参数
   * @param {string} method - 请求方法，默认 POST
   * @returns {Promise<Object>} 响应数据
   */
  async request(url, params, method = 'POST') {
    const sign = this.generateSign(params);
    params.sign = sign;

    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (method === 'GET') {
      config.params = params;
    } else {
      config.data = params;
    }

    try {
      const response = await axios(config);
      
      // 检查返回码
      if (response.data.code !== 0) {
        throw new Error(`Jeepay API 错误: ${response.data.msg || '未知错误'}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Jeepay API 请求失败: ${error.response.data?.msg || error.message}`);
      }
      throw error;
    }
  }

  /**
   * 统一下单接口
   * @param {Object} orderParams - 订单参数
   * @param {string} orderParams.mchOrderNo - 商户订单号（必填）
   * @param {string} orderParams.wayCode - 支付方式（必填），如: WX_LITE, ALI_BAR
   * @param {number} orderParams.amount - 支付金额，单位分（必填）
   * @param {string} orderParams.subject - 商品标题（必填）
   * @param {string} orderParams.body - 商品描述（必填）
   * @param {string} orderParams.currency - 货币代码，默认: cny
   * @param {string} orderParams.clientIp - 客户端IPV4地址
   * @param {string} orderParams.notifyUrl - 异步通知地址
   * @param {string} orderParams.returnUrl - 跳转通知地址
   * @param {number} orderParams.expiredTime - 订单失效时间，单位秒
   * @param {string} orderParams.channelExtra - 渠道参数，JSON格式字符串
   * @param {number} orderParams.divisionMode - 分账模式：0-不允许分账, 1-自动分账, 2-手动分账
   * @param {string} orderParams.extParam - 扩展参数
   * @returns {Promise<Object>} 返回订单数据
   */
  async unifiedOrder(orderParams) {
    const params = this.buildBaseParams({
      mchOrderNo: orderParams.mchOrderNo,
      wayCode: orderParams.wayCode,
      amount: orderParams.amount,
      currency: orderParams.currency || 'cny',
      subject: orderParams.subject,
      body: orderParams.body,
      clientIp: orderParams.clientIp || '',
      notifyUrl: orderParams.notifyUrl || '',
      returnUrl: orderParams.returnUrl || '',
      expiredTime: orderParams.expiredTime,
      channelExtra: orderParams.channelExtra || '',
      divisionMode: orderParams.divisionMode,
      extParam: orderParams.extParam || ''
    });

    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const url = `${this.baseUrl}/api/pay/unifiedOrder`;
    const response = await this.request(url, params);
    return response.data;
  }

  /**
   * 查询订单接口
   * @param {Object} queryParams - 查询参数
   * @param {string} queryParams.payOrderId - 支付订单号（与 mchOrderNo 二选一）
   * @param {string} queryParams.mchOrderNo - 商户订单号（与 payOrderId 二选一）
   * @returns {Promise<Object>} 返回订单数据
   */
  async queryOrder(queryParams) {
    const params = this.buildBaseParams({
      payOrderId: queryParams.payOrderId || '',
      mchOrderNo: queryParams.mchOrderNo || ''
    });

    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const url = `${this.baseUrl}/api/pay/query`;
    const response = await this.request(url, params);
    return response.data;
  }

  /**
   * 关闭订单接口
   * @param {Object} closeParams - 关闭参数
   * @param {string} closeParams.payOrderId - 支付订单号（与 mchOrderNo 二选一）
   * @param {string} closeParams.mchOrderNo - 商户订单号（与 payOrderId 二选一）
   * @returns {Promise<Object>} 返回关闭结果
   */
  async closeOrder(closeParams) {
    const params = this.buildBaseParams({
      payOrderId: closeParams.payOrderId || '',
      mchOrderNo: closeParams.mchOrderNo || ''
    });

    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const url = `${this.baseUrl}/api/pay/close`;
    const response = await this.request(url, params);
    return response.data;
  }

  /**
   * 获取渠道用户ID接口
   * @param {Object} userParams - 用户参数
   * @param {string} userParams.redirectUrl - 跳转地址（必填）
   * @param {string} userParams.ifCode - 支付接口，默认: AUTO
   * @returns {string} 返回跳转URL（需要用户访问此URL进行授权）
   */
  getChannelUserIdUrl(userParams) {
    const params = this.buildBaseParams({
      ifCode: userParams.ifCode || 'AUTO',
      redirectUrl: userParams.redirectUrl
    });

    // 生成签名
    params.sign = this.generateSign(params);

    // 构建查询字符串
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');

    return `${this.baseUrl}/api/channelUserId/jump?${queryString}`;
  }

  /**
   * 统一退款接口
   * @param {Object} refundParams - 退款参数
   * @param {string} refundParams.payOrderId - 支付订单号（与 mchOrderNo 二选一）
   * @param {string} refundParams.mchOrderNo - 商户订单号（与 payOrderId 二选一）
   * @param {string} refundParams.mchRefundNo - 商户退款单号（必填）
   * @param {number} refundParams.refundAmount - 退款金额，单位分（必填）
   * @param {string} refundParams.refundReason - 退款原因（必填）
   * @param {string} refundParams.currency - 货币代码，默认: cny
   * @param {string} refundParams.clientIp - 客户端IPV4地址
   * @param {string} refundParams.notifyUrl - 异步通知地址
   * @param {string} refundParams.channelExtra - 渠道参数，JSON格式字符串
   * @param {string} refundParams.extParam - 扩展参数
   * @returns {Promise<Object>} 返回退款订单数据
   */
  async refundOrder(refundParams) {
    const params = this.buildBaseParams({
      payOrderId: refundParams.payOrderId || '',
      mchOrderNo: refundParams.mchOrderNo || '',
      mchRefundNo: refundParams.mchRefundNo,
      refundAmount: refundParams.refundAmount,
      currency: refundParams.currency || 'cny',
      refundReason: refundParams.refundReason,
      clientIp: refundParams.clientIp || '',
      notifyUrl: refundParams.notifyUrl || '',
      channelExtra: refundParams.channelExtra || '',
      extParam: refundParams.extParam || ''
    });

    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const url = `${this.baseUrl}/api/refund/refundOrder`;
    const response = await this.request(url, params);
    return response.data;
  }

  /**
   * 查询退款订单接口
   * @param {Object} queryParams - 查询参数
   * @param {string} queryParams.refundOrderId - 退款订单号（与 mchRefundNo 二选一）
   * @param {string} queryParams.mchRefundNo - 商户退款单号（与 refundOrderId 二选一）
   * @returns {Promise<Object>} 返回退款订单数据
   */
  async queryRefundOrder(queryParams) {
    const params = this.buildBaseParams({
      refundOrderId: queryParams.refundOrderId || '',
      mchRefundNo: queryParams.mchRefundNo || ''
    });

    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    const url = `${this.baseUrl}/api/refund/query`;
    const response = await this.request(url, params);
    return response.data;
  }

  /**
   * 验证支付通知签名
   * @param {Object} notifyParams - 通知参数
   * @returns {boolean} 签名是否有效
   */
  verifyNotify(notifyParams) {
    return this.verifySign(notifyParams);
  }
}

module.exports = JeepayClient;
