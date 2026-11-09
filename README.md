# DeepSeek 时段观察 v2

无需安装或构建的静态网站。直接用浏览器打开 `index.html`，或上传到 GitHub Pages。

## 文件

- `index.html` 页面结构
- `style.css` 样式（深色 / 浅色主题）
- `app.js` 计算逻辑；**价格在文件顶部的 `CONFIG` 里**，调价时只改这一处
- `favicon.svg` 图标

## GitHub Pages 部署

1. 新建仓库，把以上 5 个文件上传到根目录并提交。
2. 打开 **Settings → Pages**，Build and deployment 选 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)`，点 **Save**。
3. 稍等片刻，在 Pages 设置页打开显示的网址（通常是 `https://用户名.github.io/仓库名/`）。

## 规则

- 固定北京时间 UTC+8，以设备系统时间为准。
- 周一至周五 09:00–12:00、14:00–18:00 为高峰；其余时间及周末为空闲。边界时刻归入新时段。
- 不识别中国法定节假日或调休，也不依赖任何外部数据。官方规定法定节假日全天为空闲，所以节假日落在周一至周五时，页面显示的时段可能与实际计费不同。
- 价格为静态参考（核对日期见 `CONFIG.priceCheckedOn`），请以 [DeepSeek 官方价格说明](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 为准。
- 页面不连接账户、不读取余额或用量、不需要 API 密钥。

## 提醒与模拟

- “查看指定时间”分别选择年月日、时和分，按北京时间解析，模拟时顶部会显示提示，可随时返回实时；模拟模式不发提醒。
- 高峰前提醒需要：浏览器支持通知、已允许通知、HTTPS（或 localhost）、页面保持打开。每次重新打开页面需重新开启。
- 浏览器标签标题会显示当前时段和倒计时，切到其他标签时也能看到。
