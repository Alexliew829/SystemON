# SystemON

Lover Legend Gardening Facebook Live 倒数启动系统。

## 正式操作流程
1. Make Scenario 保持 `Active`，办公室电脑无需开机。
2. Facebook 开播后，先保持私人/不公开状态。
3. 手机复制这场 Facebook Live 的链接。
4. 打开 `system-on.vercel.app`，贴上直播链接。
5. 点「检查直播」，确认系统显示的贴文正确。
6. 把 Facebook Live 改为 Public/Open。
7. 点「启动倒数」。同一场直播可以重复启动，不需要进入 Make。

## 架构
- `/index.html`：手机/电脑启动页面
- `/api/trigger.js`：解析 Live 链接或 Post ID、验证 Facebook Post、送出 Make Webhook
- `/icon.png`：启动倒数图标

## Vercel 环境变量
- `WEBHOOK_URL`
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

## Make
所有 Facebook Create a Comment 模块的 Post ID 应继续 Map 到最前面 Webhook 的 `1. post_id`。不要每场直播逐个修改 Make 模块。
