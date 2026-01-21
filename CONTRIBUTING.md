# 贡献指南

感谢您对 KitfoxPay 项目的关注！我们欢迎所有形式的贡献。

## 如何贡献

### 报告问题

如果您发现了 Bug 或有功能建议，请通过以下方式提交：

1. **GitHub Issues**: [https://github.com/kitfoxai/kitfoxpay/issues](https://github.com/kitfoxai/kitfoxpay/issues)
2. **Gitee Issues**: [https://gitee.com/kitfoxai/kitfoxpay/issues](https://gitee.com/kitfoxai/kitfoxpay/issues)（国内用户推荐）

提交 Issue 时，请：
- 使用清晰、描述性的标题
- 详细描述问题或建议
- 提供复现步骤（如果是 Bug）
- 包含环境信息（操作系统、Node.js 版本等）

### 提交代码

1. **Fork** 本仓库
2. 创建你的特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交你的更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 开启一个 **Pull Request**

### 代码规范

- 遵循现有代码风格
- 使用有意义的变量和函数名
- 添加必要的注释，特别是复杂逻辑
- 确保代码通过语法检查
- 保持代码简洁和可读性

### 提交信息规范

提交信息应该清晰描述变更内容：

- `feat: 添加新功能`
- `fix: 修复 Bug`
- `docs: 更新文档`
- `style: 代码格式调整`
- `refactor: 代码重构`
- `test: 添加测试`
- `chore: 构建过程或辅助工具的变动`

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/kitfoxai/kitfoxpay.git
cd kitfoxpay

# 安装依赖
npm install

# 复制配置文件
cp config.example.js config.js

# 编辑配置文件，填入你的配置
# 然后启动服务
npm start
```

### 测试

在提交 PR 之前，请确保：
- 代码可以正常运行
- 相关功能已测试
- 没有引入新的错误或警告

### 文档

如果您修改了功能或添加了新功能，请：
- 更新 README.md（如需要）
- 添加或更新代码注释
- 更新相关文档

## 行为准则

- 尊重所有贡献者
- 接受建设性的批评
- 专注于对项目最有利的事情
- 对其他社区成员表示同理心

## 许可证

通过贡献，您同意您的贡献将在与项目相同的 MIT 许可证下授权。

感谢您的贡献！🎉
