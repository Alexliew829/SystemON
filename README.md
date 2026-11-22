# SystemON Facebook 倒数系统 V6.6

## 版本定位
V6.6 以 V6.5 无 Make 版为基准，修复“开新直播时 LIVE_NOW 未命中却自动倒数到旧视频”的高风险问题。

## V6.6 修复
- 正式「启动倒数」只接受 Facebook `LIVE_NOW` 当前直播。
- 正式模式完全取消旧视频 fallback；无法确认当前直播就立即停止，不发送任何评论。
- 新增独立「🧪 测试旧直播」模式：只用于最近 12 小时内的最新视频贴文，并且每次必须二次确认。
- Facebook Graph API GET / POST 单次请求加入 10 秒 timeout；某一步超时会明确报错并显示失败步骤，不再无限卡住。
- 页面底部版本号修正为 `Lover Legend Gardening · V6.6`。
- localStorage key 升级为 V6.6，避免旧版本确认/结束状态干扰。
- 保留 V6.5 原 Make blueprint 的所有评论文案、顺序和实际延迟秒数不变。

## 正式模式规则
1. 找到 `LIVE_NOW` → 允许第一次确认 → 执行完整倒数。
2. 找不到 `LIVE_NOW` → 直接停止并提示，不会自动选择旧视频。
3. POST 执行前再次确认当前直播 Post ID；ID 改变则停止。

## 测试模式规则
- 「🧪 测试旧直播」不会影响正式直播的确认/结束锁定状态。
- 只取最近 12 小时内的最新视频贴文。
- 每一次测试都必须手动确认。

## 原倒数流程（与 Make 实际 duration 一致）
- System On → 2 秒
- 10 → 2 秒
- 9 → 2 秒
- 8 → 2 秒
- 7 → 2 秒
- 6 → 2 秒
- 5 → 2 秒
- 4 → 2 秒
- 3 → 2 秒
- 中文催价 → 3 秒
- 英文催价 → 3 秒
- 2 → 5 秒
- 1 → 5 秒
- 还有谁要出价 → 10 秒
- 0 → 完成

## Vercel Environment Variables
必须保留：
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

`WEBHOOK_URL` 不再使用。

## 文件结构
- `index.html`
- `icon.png`
- `vercel.json`
- `api/trigger.js`

## 回退
V6.5 与 V6.4 继续作为旧备份保留，不覆盖。
