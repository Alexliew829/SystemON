# SystemON Simple V5

正式操作方式：
1. 在 Facebook Live 建立直播，先设为私人。
2. 在 Make 内把本场直播的正确 Post ID 设好，并保持 Scenario Active。
3. Facebook Live 改为 Public / Open。
4. 打开 `system-on.vercel.app`，点击「启动倒数」。
5. 完成后可直接点击「再次启动」。

SystemON 不再处理 Facebook Live 链接或 Post ID，只负责触发 Make Webhook。

Vercel 仅需要环境变量：
- `WEBHOOK_URL`
