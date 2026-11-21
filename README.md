# SystemON V6.4

## V6.4 重点修复
- 修复 V6.3 在公开 Facebook Live 进行中，使用 `/{PAGE_ID}/posts?limit=1` 可能抓到其他普通贴文，导致 Make 后续 `1.post_id` 全部留言到错误对象的问题。
- V6.4 优先识别 Page 当前 `LIVE_NOW` 的 Live Video，并使用：
  - `PAGE_ID + "_" + LIVE_VIDEO_ID`
  - 例如：`101411206173416_1117400511102139`
- 如果当前 Token / App 无法读取 `live_videos`，保留兼容 fallback：
  - 只接受「最新贴文本身明确是视频贴文」而且发布时间在 12 小时内。
  - 普通文字/图片最新贴文绝不再直接触发 Make。
- 如果无法安全确认直播目标，系统直接停止：
  - `无法确认当前直播 Post ID。为避免倒数留言到错误贴文，本次未启动。`
- Make 主链无需修改；后续 Facebook 模块继续读取 Webhook 的 `1.post_id`。

## 为什么测试直播以前可能正常
V6.3 不是每次都会错。某些测试直播（例如受众较窄的测试/订阅者直播）可能会很快以视频贴文形式出现在 Page `/posts`，或者当时它刚好就是最新贴文，因此 V6.3 会碰巧抓对。

公开正式直播的实测则证明：直播进行中 `/posts?limit=1` 返回的对象可能不是当前 Live Video。V6.4 因此不再无条件相信“最新贴文”。

## 既有规则保留
- 24 小时任何时间可使用；没有固定时段限制。
- 新直播 Post ID 第一次启动：必须进行一次二次确认。
- 同一 Post ID 已确认成功后：第二次、第三次及后续启动直接执行，不再确认。
- 「🔒 结束本场直播」会锁定当前 Post ID；检测到新的直播 Post ID 后自动解除上一场状态。
- 后端在真正触发 Make 前会再次解析当前直播目标，若 Post ID 改变则拒绝触发。

## Vercel 环境变量
- `WEBHOOK_URL`
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

## Make
Scenario 保持 Active。后续 Facebook 模块继续使用 Webhook 的 `1. post_id`，不需要逐个修改。

## 注意
- Meta 对不同 App / Token 的 `live_videos` 读取权限可能不同。V6.4 已设计为：读取不到 Live Video 时，只接受安全的视频贴文 fallback；否则 fail closed，不会误发到普通帖子。
- 「结束本场直播」状态仍保存在当前浏览器的 localStorage，不会自动跨设备同步。
