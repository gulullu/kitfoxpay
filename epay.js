const { generateSign, verifySign } = require('./newpay');

/**
 * 易支付 支付接口适配器
 * 接收 易支付 格式的请求，转换为 Jeepay 格式并调用 Jeepay 接口，然后转换为 易支付 格式返回
 * 
 * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
 */
class EpayAdapter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {Object} config.jeepayClient - Jeepay 客户端实例
   * @param {string} config.key - 商户密钥（用于 MD5 签名）
   * @param {string} config.serverHost - 服务器地址（用于生成通知URL）
   */
  constructor(config) {
    this.jeepay = config.jeepayClient;
    this.key = config.key; // MD5 签名密钥
    this.serverHost = config.serverHost;
    this.pid = config.pid || null; // 商户ID（用于通知）
    this.signType = 'MD5'; // 使用 MD5 签名
  }

  /**
   * 支付方式映射：易支付 type -> Jeepay 官方 wayCode
   */
  _mapPayType(epayType) {
    const normalized = String(epayType || '').trim();
    const upper = normalized.toUpperCase();

    const typeMap = {
      alipay: 'ALI_PC',
      alipay_pc: 'ALI_PC',
      alipay_wap: 'ALI_WAP',
      alipay_qr: 'ALI_QR',
      alipay_bar: 'ALI_BAR',
      alipay_jsapi: 'ALI_JSAPI',
      alipay_lite: 'ALI_LITE',
      alipay_app: 'ALI_APP',
      wxpay: 'WX_NATIVE',
      wxpay_native: 'WX_NATIVE',
      wxpay_h5: 'WX_H5',
      wxpay_jsapi: 'WX_JSAPI',
      wxpay_lite: 'WX_LITE',
      wxpay_bar: 'WX_BAR',
      wxpay_app: 'WX_APP'
    };

    if (typeMap[normalized]) {
      return typeMap[normalized];
    }

    // 已经是官方 wayCode 时直接透传
    if (/^[A-Z0-9_]+$/.test(upper)) {
      return upper;
    }

    return normalized;
  }

  /**
   * 支付方式反向映射：Jeepay 官方 wayCode -> 易支付 type
   */
  _mapWayCodeToEpayType(wayCode) {
    const normalized = String(wayCode || '').trim().toUpperCase();

    if (!normalized) {
      return '';
    }

    if (normalized.startsWith('ALI_')) {
      return 'alipay';
    }

    if (normalized.startsWith('WX_')) {
      return 'wxpay';
    }

    return normalized;
  }

  _normalizeDevice(device) {
    return String(device || '').trim().toLowerCase();
  }

  _getPreferredPayDataType(epayParams) {
    const wayCode = this._mapPayType(epayParams.type);
    const device = this._normalizeDevice(epayParams.device);

    if (epayParams.payDataType) {
      return epayParams.payDataType;
    }

    if (wayCode === 'ALI_WAP') {
      return 'form';
    }

    if (wayCode === 'ALI_PC') {
      return 'form';
    }

    if (wayCode === 'ALI_QR' || wayCode === 'WX_NATIVE') {
      return device === 'image' ? 'codeImgUrl' : 'codeUrl';
    }

    return '';
  }

  _buildChannelExtra(epayParams, wayCode) {
    const extras = {};
    const authCode = epayParams.authCode || epayParams.auth_code || '';
    const openid = epayParams.openid || epayParams.openId || '';
    const buyerUserId = epayParams.buyerUserId || epayParams.buyer_user_id || '';
    const subAppId = epayParams.subAppId || epayParams.sub_app_id || '';
    const entryLiteType = epayParams.entryLiteType || epayParams.entry_lite_type || '';
    const entryPageType = epayParams.entryPageType || epayParams.entry_page_type || '';
    const payDataType = epayParams.payDataType || this._getPreferredPayDataType({ ...epayParams, type: wayCode });

    if (authCode && ['AUTO_BAR', 'ALI_BAR', 'WX_BAR', 'YSF_BAR'].includes(wayCode)) {
      extras.authCode = authCode;
    }

    if (buyerUserId && ['ALI_JSAPI', 'ALI_LITE'].includes(wayCode)) {
      extras.buyerUserId = buyerUserId;
    }

    if (openid && ['WX_JSAPI', 'WX_LITE'].includes(wayCode)) {
      extras.openid = openid;
    }

    if (subAppId && ['WX_JSAPI', 'WX_LITE', 'ALI_BAR', 'WX_BAR', 'YSF_BAR'].includes(wayCode)) {
      extras.subAppId = subAppId;
    }

    if (entryLiteType && wayCode === 'QR_CASHIER') {
      extras.entryLiteType = entryLiteType;
    }

    if (entryPageType && wayCode === 'QR_CASHIER') {
      extras.entryPageType = entryPageType;
    }

    if (payDataType && ['ALI_WAP', 'ALI_PC', 'ALI_QR', 'WX_NATIVE', 'QR_CASHIER'].includes(wayCode)) {
      extras.payDataType = payDataType;
    }

    return Object.keys(extras).length > 0 ? JSON.stringify(extras) : '';
  }

  _resolveWayCode(epayParams) {
    const type = String(epayParams.type || '').trim().toLowerCase();
    const device = this._normalizeDevice(epayParams.device);
    const authCode = epayParams.authCode || epayParams.auth_code || '';
    const openid = epayParams.openid || epayParams.openId || '';
    const buyerUserId = epayParams.buyerUserId || epayParams.buyer_user_id || '';

    if (type === 'alipay') {
      if (authCode) return 'ALI_BAR';
      if (buyerUserId) return device === 'lite' ? 'ALI_LITE' : 'ALI_JSAPI';
      return 'ALI_QR';
    }

    if (type === 'wxpay') {
      if (authCode) return 'WX_BAR';
      if (openid) return device === 'lite' ? 'WX_LITE' : 'WX_JSAPI';
      return 'QR_CASHIER';
    }

    return this._mapPayType(epayParams.type);
  }

  /**
   * 转换支付状态：Jeepay state -> 易支付 status
   * @param {string|number} state - Jeepay 状态：'0'-订单生成, '1'-支付中, '2'-支付成功, '3'-支付失败, '4'-已撤销, '5'-已退款, '6'-订单关闭
   * @returns {string} 易支付 状态：0-待支付, 1-支付成功, -1-支付失败
   */
  _convertStatusToEpay(state) {
    // 确保 state 是字符串类型进行比较
    const stateStr = String(state);
    if (stateStr === '2') {
      return '1'; // 支付成功
    } else if (stateStr === '3') {
      return '-1'; // 支付失败
    } else {
      return '0'; // 待支付/支付中
    }
  }

  /**
   * 生成 易支付 格式的响应签名
   * @param {Object} params - 响应参数
   * @returns {string} MD5 签名字符串（小写）
   */
  _generateResponseSign(params) {
    return generateSign(params, this.key, this.signType);
  }

  /**
   * 创建支付订单（mapi.php）
   * 接收 易支付 格式的请求，转换为 Jeepay 格式调用，返回 易支付 格式
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} epayParams - 易支付 格式的请求参数
   * @param {string} epayParams.pid - 商户ID
   * @param {string} epayParams.out_trade_no - 商户订单号
   * @param {string} epayParams.type - 支付方式
   * @param {string} epayParams.money - 支付金额（元）
   * @param {string} epayParams.name - 商品名称
   * @param {string} epayParams.notify_url - 异步通知地址
   * @param {string} epayParams.return_url - 同步跳转地址
   * @param {string} epayParams.clientip - 客户端IP
   * @param {string} epayParams.param - 自定义参数
   * @param {string} epayParams.sign - 签名
   * @param {string} epayParams.sign_type - 签名类型（MD5）
   * @returns {Promise<Object>} 易支付 格式的响应
   */
  async createOrder(epayParams) {
    // 验证签名
    if (!this._verifyRequestSign(epayParams)) {
      return {
        code: -1,
        msg: '签名验证失败',
        data: null
      };
    }

    try {
      const wayCode = this._resolveWayCode(epayParams);
      const channelExtra = this._buildChannelExtra(epayParams, wayCode);

      // 金额转换：元 -> 分
      const amount = Math.round(parseFloat(epayParams.money) * 100);

      // 构建扩展参数，保存商户的 notify_url 以便后续通知转发
      let extParamObj = {};
      if (epayParams.param) {
        try {
          // 尝试解析为 JSON
          extParamObj = JSON.parse(epayParams.param);
        } catch (e) {
          // 如果不是 JSON，作为普通字符串保存
          extParamObj = { original_param: epayParams.param };
        }
      }
      // 保存商户的 notify_url 到扩展参数中
      if (epayParams.notify_url) {
        extParamObj.epay_notify_url = epayParams.notify_url;
      }
      const extParam = Object.keys(extParamObj).length > 0 ? JSON.stringify(extParamObj) : '';

      // 构建 Jeepay 格式的订单参数
      // notifyUrl 设置为我们的通知接口，用于接收 Jeepay 的通知
      const jeepayParams = {
        mchOrderNo: epayParams.out_trade_no,
        wayCode,
        amount,
        currency: epayParams.currency || 'cny',
        subject: epayParams.name,
        body: epayParams.body || epayParams.name, // 易支付 只有 name 时用 name 兜底
        notifyUrl: `${this.serverHost}/api/payment/notify`, // 使用我们的通知接口
        returnUrl: epayParams.return_url || '',
        clientIp: epayParams.clientip || epayParams.clientIp || '',
        channelExtra,
        extParam,
      };

      // 调用 Jeepay 统一下单接口
      const jeepayResult = await this.jeepay.unifiedOrder(jeepayParams);

      // 转换为 易支付 格式的响应
      // Jeepay 可能返回 payUrl 或 payData 字段（根据 payDataType 不同）
      const payUrl = jeepayResult.payUrl || jeepayResult.payData || '';
      const qrCode = jeepayResult.qrCode || jeepayResult.qrCodeUrl || '';
      
      const epayResponse = {
        code: 1, // 易支付 成功返回 1
        msg: 'success',
        data: {
          trade_no: jeepayResult.payOrderId || '',
          out_trade_no: epayParams.out_trade_no,
          payurl: payUrl,
          qrcode: qrCode,
          urlscheme: jeepayResult.urlScheme || ''
        }
      };

      // 生成响应签名
      const responseParams = {
        code: epayResponse.code,
        msg: epayResponse.msg,
        ...epayResponse.data
      };
      epayResponse.sign = this._generateResponseSign(responseParams);
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 创建订单失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '创建订单失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 前台支付提交（submit.php）
   * 接收 易支付 格式的请求，返回支付表单或跳转URL
   * 用于用户前台直接发起支付，使用form表单跳转或拼接成url跳转
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} epayParams - 易支付 格式的请求参数
   * @param {string} epayParams.pid - 商户ID
   * @param {string} epayParams.out_trade_no - 商户订单号
   * @param {string} epayParams.type - 支付方式
   * @param {string} epayParams.money - 支付金额（元）
   * @param {string} epayParams.name - 商品名称
   * @param {string} epayParams.notify_url - 异步通知地址
   * @param {string} epayParams.return_url - 同步跳转地址
   * @param {string} epayParams.clientip - 客户端IP
   * @param {string} epayParams.param - 自定义参数
   * @param {string|number} epayParams.timestamp - 时间戳（秒）
   * @param {string} epayParams.sign - 签名
   * @param {string} epayParams.sign_type - 签名类型（MD5）
   * @returns {Promise<Object>} 易支付 格式的响应，包含支付表单HTML或跳转URL
   */
  async submitOrder(epayParams) {
    // 验证签名
    if (!this._verifyRequestSign(epayParams)) {
      return {
        code: -1,
        msg: '签名验证失败',
        data: null
      };
    }

    try {
      // 先创建订单，获取支付URL
      const createResult = await this.createOrder(epayParams);
      
      if (createResult.code !== 1) {
        return createResult;
      }

      // 获取支付URL
      const payUrl = createResult.data.payurl || '';
      
      if (!payUrl) {
        return {
          code: -1,
          msg: '获取支付URL失败',
          data: null,
          sign: '',
          sign_type: this.signType
        };
      }

      // 生成支付表单HTML
      const formHtml = this._generatePayForm(payUrl, epayParams);

      // 返回 易支付 格式的响应
      const epayResponse = {
        code: 1,
        msg: 'success',
        data: {
          trade_no: createResult.data.trade_no,
          out_trade_no: epayParams.out_trade_no,
          payurl: payUrl,
          qrcode: createResult.data.qrcode || '',
          urlscheme: createResult.data.urlscheme || '',
          form: formHtml // 支付表单HTML
        }
      };

      // 生成响应签名
      const responseParams = {
        code: epayResponse.code,
        msg: epayResponse.msg,
        trade_no: epayResponse.data.trade_no,
        out_trade_no: epayResponse.data.out_trade_no,
        payurl: epayResponse.data.payurl
      };
      epayResponse.sign = this._generateResponseSign(responseParams);
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 提交订单失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '提交订单失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 生成支付表单HTML
   * @param {string} payUrl - 支付URL
   * @param {Object} params - 订单参数
   * @returns {string} 表单HTML
   */
  _generatePayForm(payUrl, params) {
    // 如果支付URL为空，返回空字符串
    if (!payUrl) {
      return '';
    }

    // 生成自动跳转的HTML页面
    // 使用 JavaScript 直接跳转，确保 URL 中的查询参数不会丢失
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${payUrl}">
  <title>正在跳转到支付页面...</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      text-align: center;
      padding: 50px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 500px;
      margin: 0 auto;
    }
    .loading {
      font-size: 18px;
      color: #666;
      margin: 20px 0;
    }
    .link {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: #2196F3;
      color: white;
      text-decoration: none;
      border-radius: 4px;
    }
    .link:hover {
      background: #1976D2;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>正在跳转到支付页面...</h2>
    <div class="loading">⏳ 请稍候</div>
    <p>如果页面没有自动跳转，请<a href="${payUrl}" class="link">点击这里</a></p>
  </div>
  <script>
    // 立即跳转，确保 URL 中的查询参数完整保留
    window.location.href = ${JSON.stringify(payUrl)};
  </script>
</body>
</html>`;
  }

  /**
   * 查询单个订单（api.php?act=order）
   * 接收 易支付 格式的请求，转换为 Jeepay 格式调用，返回 易支付 格式
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} params - 请求参数
   * @param {string} params.pid - 商户ID
   * @param {string} params.key - 商户密钥（用于验证，不是签名）
   * @param {string} params.out_trade_no - 商户订单号（与 trade_no 二选一）
   * @param {string} params.trade_no - 平台订单号（与 out_trade_no 二选一）
   * @returns {Promise<Object>} 易支付 格式的响应
   */
  async queryOrder(params) {
    // 验证商户密钥（key 参数用于验证身份，不是签名）
    if (params.key !== this.key) {
      return {
        code: -1,
        msg: '商户密钥验证失败',
        data: null
      };
    }

    try {
      // 构建 Jeepay 格式的查询参数
      const jeepayParams = {
        payOrderId: params.trade_no || '',
        mchOrderNo: params.out_trade_no || ''
      };

      // 调用 Jeepay 查询订单接口
      const jeepayResult = await this.jeepay.queryOrder(jeepayParams);

      // 转换为 易支付 格式的响应
      const epayResponse = {
        code: 1,
        msg: 'success',
        data: {
          trade_no: jeepayResult.payOrderId || '',
          out_trade_no: jeepayResult.mchOrderNo || '',
          money: (jeepayResult.amount / 100).toFixed(2), // 分 -> 元
          status: this._convertStatusToEpay(jeepayResult.state),
          type: jeepayResult.wayCode || '',
          endtime: jeepayResult.successTime || ''
        }
      };

      // 生成响应签名
      const responseParams = {
        code: epayResponse.code,
        msg: epayResponse.msg,
        ...epayResponse.data
      };
      epayResponse.sign = this._generateResponseSign(responseParams);
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 查询订单失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '查询订单失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 批量查询订单（api.php?act=orders）
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} params - 请求参数
   * @param {string} params.pid - 商户ID
   * @param {string} params.key - 商户密钥
   * @param {number} params.limit - 每页数量（最大50）
   * @param {number} params.page - 页码
   * @returns {Promise<Object>} 易支付 格式的响应
   */
  async queryOrders(params) {
    // 验证商户密钥
    if (params.key !== this.key) {
      return {
        code: -1,
        msg: '商户密钥验证失败',
        data: null
      };
    }

    try {
      // 注意：Jeepay 可能不支持批量查询，这里需要根据实际情况实现
      // 如果 Jeepay 不支持，可以返回空列表或提示不支持
      const limit = Math.min(parseInt(params.limit) || 10, 50);
      const page = parseInt(params.page) || 1;

      // TODO: 实现批量查询逻辑
      // 如果 Jeepay 不支持批量查询，可以返回空列表
      const epayResponse = {
        code: 1,
        msg: 'success',
        data: {
          list: [],
          total: 0,
          page: page,
          limit: limit
        }
      };

      epayResponse.sign = this._generateResponseSign({
        code: epayResponse.code,
        msg: epayResponse.msg,
        ...epayResponse.data
      });
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 批量查询订单失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '批量查询订单失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 退款（api.php?act=refund）
   * 接收 易支付 格式的请求，转换为 Jeepay 格式调用，返回 易支付 格式
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} params - 请求参数
   * @param {string} params.pid - 商户ID
   * @param {string} params.key - 商户密钥
   * @param {string} params.out_trade_no - 商户订单号（与 trade_no 二选一）
   * @param {string} params.trade_no - 平台订单号（与 out_trade_no 二选一）
   * @param {string} params.money - 退款金额（元）
   * @returns {Promise<Object>} 易支付 格式的响应
   */
  async refundOrder(params) {
    // 验证商户密钥
    if (params.key !== this.key) {
      return {
        code: -1,
        msg: '商户密钥验证失败',
        data: null
      };
    }

    try {
      // 金额转换：元 -> 分
      const refundAmount = Math.round(parseFloat(params.money) * 100);

      // 构建扩展参数
      let extParamObj = {};
      if (params.param) {
        try {
          extParamObj = JSON.parse(params.param);
        } catch (e) {
          extParamObj = { original_param: params.param };
        }
      }
      if (params.notify_url) {
        extParamObj.epay_notify_url = params.notify_url;
      }
      const extParam = Object.keys(extParamObj).length > 0 ? JSON.stringify(extParamObj) : '';

      // 构建 Jeepay 格式的退款参数
      const jeepayParams = {
        payOrderId: params.trade_no || '',
        mchOrderNo: params.out_trade_no || '',
        mchRefundNo: `REFUND_${params.out_trade_no || params.trade_no}_${Date.now()}`,
        refundAmount: refundAmount,
        refundReason: '用户申请退款',
        notifyUrl: `${this.serverHost}/api/refund/notify`,
        extParam: extParam
      };

      // 调用 Jeepay 退款接口
      const jeepayResult = await this.jeepay.refundOrder(jeepayParams);

      // 转换为 易支付 格式的响应
      const epayResponse = {
        code: 1,
        msg: 'success',
        data: {
          refund_trade_no: jeepayResult.refundOrderId || '',
          trade_no: jeepayResult.payOrderId || '',
          out_trade_no: params.out_trade_no || '',
          money: params.money,
          status: this._convertRefundStatusToEpay(jeepayResult.state)
        }
      };

      // 生成响应签名
      const responseParams = {
        code: epayResponse.code,
        msg: epayResponse.msg,
        ...epayResponse.data
      };
      epayResponse.sign = this._generateResponseSign(responseParams);
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 退款失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '退款失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 查询商户信息（api.php?act=query）
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} params - 请求参数
   * @param {string} params.pid - 商户ID
   * @param {string} params.key - 商户密钥
   * @returns {Promise<Object>} 易支付 格式的响应
   */
  async queryMerchant(params) {
    // 验证商户密钥
    if (params.key !== this.key) {
      return {
        code: -1,
        msg: '商户密钥验证失败',
        data: null
      };
    }

    try {
      // TODO: 根据实际需求实现商户信息查询
      // 这里返回基本的商户信息
      const epayResponse = {
        code: 1,
        msg: 'success',
        data: {
          pid: params.pid,
          status: 'normal',
          balance: '0.00' // 需要从实际数据源获取
        }
      };

      epayResponse.sign = this._generateResponseSign({
        code: epayResponse.code,
        msg: epayResponse.msg,
        ...epayResponse.data
      });
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 查询商户信息失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '查询商户信息失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 查询结算记录（api.php?act=settle）
   * 接口标准：https://pay.myzfw.com/doc_old.html#pay3
   * 
   * @param {Object} params - 请求参数
   * @param {string} params.pid - 商户ID
   * @param {string} params.key - 商户密钥
   * @returns {Promise<Object>} 易支付 格式的响应
   */
  async querySettle(params) {
    // 验证商户密钥
    if (params.key !== this.key) {
      return {
        code: -1,
        msg: '商户密钥验证失败',
        data: null
      };
    }

    try {
      // TODO: 根据实际需求实现结算记录查询
      const epayResponse = {
        code: 1,
        msg: 'success',
        data: {
          list: [],
          total: 0
        }
      };

      epayResponse.sign = this._generateResponseSign({
        code: epayResponse.code,
        msg: epayResponse.msg,
        ...epayResponse.data
      });
      epayResponse.sign_type = this.signType;

      return epayResponse;
    } catch (error) {
      console.error('易支付 查询结算记录失败:', error);
      const errorResponse = {
        code: -1,
        msg: error.message || '查询结算记录失败',
        data: null
      };
      errorResponse.sign = this._generateResponseSign({ code: errorResponse.code, msg: errorResponse.msg });
      errorResponse.sign_type = this.signType;
      return errorResponse;
    }
  }

  /**
   * 处理支付通知
   * 接收 Jeepay 的通知，转换为 易支付 格式并返回
   * 易支付通知格式：pid, trade_no, out_trade_no, type, name, money, trade_status, param, sign, sign_type
   * 
   * @param {Object} jeepayNotify - Jeepay 格式的通知参数
   * @returns {Object} 易支付 格式的通知数据
   */
  handleNotify(jeepayNotify) {
    // 从 extParam 中提取商品名称（如果之前保存过）
    let productName = '';
    if (jeepayNotify.extParam) {
      try {
        const extParamObj = JSON.parse(jeepayNotify.extParam);
        productName = extParamObj.epay_name || extParamObj.name || '';
      } catch (e) {
        // extParam 不是 JSON 格式，忽略
      }
    }
    
    // 如果没有商品名称，使用默认值
    if (!productName) {
      productName = '商品';
    }

    // 转换支付状态为易支付格式
    // trade_status: TRADE_SUCCESS (支付成功), TRADE_CLOSED (交易关闭), WAIT_BUYER_PAY (等待支付)
    const stateStr = String(jeepayNotify.state);
    let tradeStatus = 'WAIT_BUYER_PAY'; // 默认等待支付
    if (stateStr === '2') {
      tradeStatus = 'TRADE_SUCCESS'; // 支付成功
    } else if (stateStr === '3' || stateStr === '4' || stateStr === '6') {
      tradeStatus = 'TRADE_CLOSED'; // 交易关闭（支付失败、已撤销、订单关闭）
    }

    // 从 extParam 中提取原始 param（商户的自定义参数）
    let param = '';
    if (jeepayNotify.extParam) {
      try {
        const extParamObj = JSON.parse(jeepayNotify.extParam);
        param = extParamObj.original_param || extParamObj.param || '';
      } catch (e) {
        // extParam 不是 JSON 格式，直接使用
        param = jeepayNotify.extParam;
      }
    }

    // 转换为 易支付 格式的通知
    const epayNotify = {
      pid: this.pid || '', // 商户ID
      trade_no: jeepayNotify.payOrderId || '', // 易支付订单号
      out_trade_no: jeepayNotify.mchOrderNo || '', // 商户订单号
      type: this._mapWayCodeToEpayType(jeepayNotify.wayCode) || 'alipay', // 支付方式（转换为易支付格式）
      name: productName, // 商品名称
      money: (jeepayNotify.amount / 100).toFixed(2), // 商品金额（分 -> 元）
      trade_status: tradeStatus, // 支付状态：TRADE_SUCCESS, TRADE_CLOSED, WAIT_BUYER_PAY
      param: param // 业务扩展参数
    };

    // 生成签名（排除 sign 和 sign_type）
    epayNotify.sign = this._generateResponseSign(epayNotify);
    epayNotify.sign_type = this.signType;

    return epayNotify;
  }

  /**
   * 处理退款通知
   * 接收 Jeepay 的退款通知，转换为 易支付 格式并返回
   * 
   * @param {Object} jeepayRefundNotify - Jeepay 格式的退款通知参数
   * @returns {Object} 易支付 格式的退款通知数据
   */
  handleRefundNotify(jeepayRefundNotify) {
    // 转换为 易支付 格式的退款通知
    const epayNotify = {
      refund_trade_no: jeepayRefundNotify.refundOrderId || '',
      trade_no: jeepayRefundNotify.payOrderId || '',
      out_trade_no: jeepayRefundNotify.mchRefundNo || '',
      money: (jeepayRefundNotify.refundAmount / 100).toFixed(2), // 分 -> 元
      status: this._convertRefundStatusToEpay(jeepayRefundNotify.state),
      endtime: jeepayRefundNotify.successTime || '',
      param: jeepayRefundNotify.extParam || ''
    };

    // 生成签名
    epayNotify.sign = this._generateResponseSign(epayNotify);
    epayNotify.sign_type = this.signType;

    return epayNotify;
  }

  /**
   * 验证请求签名
   * 根据 https://pay.myzfw.com/doc_old.html#pay3 文档规范
   * @param {Object} params - 请求参数
   * @returns {boolean} 签名是否有效
   */
  _verifyRequestSign(params) {
    if (!this.key) {
      console.warn('警告: 未配置商户密钥，无法验证请求签名');
      return true; // 开发环境可能不验证
    }
    return verifySign(params, this.key, this.signType);
  }

  /**
   * 转换退款状态：Jeepay state -> 易支付 status
   * @param {string|number} state - Jeepay 退款状态：'0'-订单生成, '1'-退款中, '2'-退款成功, '3'-退款失败, '4'-退款关闭
   * @returns {string} 易支付 状态：0-退款中, 1-退款成功, -1-退款失败
   */
  _convertRefundStatusToEpay(state) {
    // 确保 state 是字符串类型进行比较
    const stateStr = String(state);
    if (stateStr === '2') {
      return '1'; // 退款成功
    } else if (stateStr === '3') {
      return '-1'; // 退款失败
    } else {
      return '0'; // 退款中
    }
  }
}

module.exports = EpayAdapter;
