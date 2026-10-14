# SystemON V6.2

## 规则
- 24 小时任何时间都可使用；没有固定时段限制。
- 每次点击都会先读取 Facebook 最新 Post ID。
- 新 Post ID 第一次启动：
  - 必须是最近 2 小时内建立的 Post。
  - 必须进行一次二次确认。
- 同一 Post ID 已确认成功后：
  - 第二次、第三次及后续启动不再二次确认。
  - 即使该 Post 后来超过 2 小时，仍允许再次启动。
- 一旦 Facebook 最新 Post ID 改变：
  - 自动清除上一 Post 的确认状态。
  - 新 Post 下次启动重新执行「2 小时检查 + 二次确认」。
- 后端在真正触发 Make 前会再次确认最新 Post ID 没有改变，避免检查后目标贴文发生变化。

## Make
Make Scenario 保持 Active。后续 Facebook 模块继续读取 Webhook 的 `1. post_id`，无需改变现有主链路。

## Vercel 环境变量
- `WEBHOOK_URL`
- `PAGE_ID`
- `FB_ACCESS_TOKEN`
