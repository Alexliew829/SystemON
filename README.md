# SystemON

合并版内容：
- `/api/trigger.js`：触发 Make Webhook，并自动抓取 Facebook 最新贴文 ID
- `/index.html`：启动倒数页面（不会跳去 JSON 页面，可重复点击）
- `/icon.png`：启动倒数 App 图标

## Vercel 环境变量
请确认已设置：
- `WEBHOOK_URL`
- `PAGE_ID`
- `FB_ACCESS_TOKEN`
