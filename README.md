# SystemON V6.3

## 规则
- 24 小时任何时间都可使用；没有固定时段限制，也没有 2 小时时限。
- 每次点击都会先读取 Facebook 最新 Post ID。
- 新 Post ID 第一次启动：必须进行一次二次确认。
- 同一 Post ID 已确认成功后：第二次、第三次及后续启动直接执行，不再确认。
- 增加「🔒 结束本场直播」：
  - 结束后会锁定当前 Post ID。
  - 当前 Post ID 被锁定后，再误触「启动倒数」不会触发 Make。
  - 一旦 Facebook 最新 Post ID 改变，会自动清除上一场的锁定和确认状态，新 Post 回到第一次确认流程。
- 后端在真正触发 Make 前会再次确认最新 Post ID 没有改变，避免检查后目标贴文发生变化。

## Make
Make Scenario 保持 Active。后续 Facebook 模块继续读取 Webhook 的 `1. post_id`，无需改变现有主链路。

## Vercel 环境变量
- `WEBHOOK_URL`
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

## 注意
「结束本场直播」锁定状态保存在当前浏览器设备。若用另一台设备打开 SystemON，该设备不会自动继承此锁定状态。
