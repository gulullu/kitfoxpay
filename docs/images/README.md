# 图片资源说明

本目录用于存放项目文档所需的界面截图。

## 图片清单

### KitfoxPay 相关图片

1. **`kitfoxpay-admin.png`** - KitfoxPay 管理界面截图
   - 显示配置管理界面，包括 Jeepay 配置、易支付接口配置、服务器配置等
   - 建议尺寸：1920x1080 或更高

2. **`kitfoxpay-debug.png`** - KitfoxPay 调试界面截图
   - 显示测试接口、日志查看等调试功能
   - 建议尺寸：1920x1080 或更高

### NewAPI 相关图片

3. **`newapi-config.png`** - NewAPI 支付接入配置界面
   - 显示在 NewAPI 系统中配置支付接口的界面
   - 包括 epay_url、pid、key 等配置项
   - 建议尺寸：1920x1080 或更高

4. **`newapi-payment.png`** - NewAPI 支付界面
   - 显示用户在 NewAPI 系统中发起支付的界面
   - 包括支付方式选择、金额显示等
   - 建议尺寸：1920x1080 或更高

5. **`newapi-payment-success.png`** - NewAPI 支付成功界面
   - 显示支付成功后的提示界面
   - 建议尺寸：1920x1080 或更高

### Jeepay 相关图片

6. **`jeepay-merchant-info.png`** - Jeepay 商户信息界面
   - 显示在 Jeepay 后台获取商户号、应用ID等信息的界面
   - 建议尺寸：1920x1080 或更高

7. **`jeepay-api-key.png`** - Jeepay API 密钥获取界面
   - 显示在 Jeepay 后台获取商户私钥的界面
   - 建议尺寸：1920x1080 或更高

## 占位图说明

如果暂时没有实际截图，可以使用以下占位图服务：

- 使用 [placeholder.com](https://via.placeholder.com/1920x1080) 生成占位图
- 或使用 [placehold.co](https://placehold.co/1920x1080) 生成占位图

示例占位图链接格式：
```
https://via.placeholder.com/1920x1080/667eea/ffffff?text=KitfoxPay+管理界面
```

## 图片命名规范

- 使用小写字母和连字符
- 格式：`功能-描述.png` 或 `系统-功能.png`
- 例如：`kitfoxpay-admin.png`、`newapi-config.png`

## 使用方式

在 Markdown 文档中使用相对路径引用：

```markdown
![KitfoxPay 管理界面](./images/kitfoxpay-admin.png)
```
