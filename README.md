# fc-detector

大模型工具调用能力检测工具，用于验证不同 LLM API 是否支持 function calling / tool calling。

## 功能特性

- 支持多个 API 中转站测试
- 支持 OpenAI 格式和 Anthropic 格式调用
- 可视化测试结果
- 预设多个模型配置

## 支持的 API

| 名称 | 地址 |
|------|------|
| ✅ 推荐 | https://api.bywlai.cn |
| 132006 | https://api.132006.xyz |


## 部署教程

### 1. 克隆项目

```bash
git clone https://github.com/sst666/fc-detector.git
cd fc-detector
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 API Key

在 `config.json` 中添加你的 API Key：

```json
{
  "sites": {
    "yi": {
      "apiKey": "your-api-key-here"
    }
  }
}
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 5. 访问

浏览器打开：http://localhost:3000

## API 配置格式

### OpenAI 格式

```json
{
  "name": "自定义名称",
  "openaiUrl": "https://api.example.com/v1/chat/completions",
  "apiKey": "your-key"
}
```

### Anthropic 格式

```json
{
  "name": "自定义名称",
  "anthropicUrl": "https://api.example.com/v1/messages",
  "apiKey": "your-key"
}
```

## 推荐 API 中转

推荐使用 [api.bywlai.cn](https://api.bywlai.cn)，支持 OpenAI/Anthropic 格式，价格优惠。

## License

MIT
