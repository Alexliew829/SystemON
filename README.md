# Lover Legend Facebook 倒数系统 V6.7（无 Make）

## 核心变化
- 不再调用受限的 Facebook Live Video API / LIVE_NOW。
- 首次启动时读取 Page 最近 24 小时的 `/feed` 与 `/posts` 候选，合并去重后让用户手动选择当前直播。
- 用户确认一次后，把 Post ID 锁定在浏览器 localStorage；本场后续倒数全部使用同一个 Post ID。
- 点击「结束本场直播」才解除锁定；下一场重新选择。
- 继续直接通过 Facebook Graph API 发布评论，不使用 Make。
- 每个 Facebook API 请求保留 10 秒 timeout。
- 完整倒数文案、顺序和 2/3/5/10 秒延迟保持原 Make blueprint 逻辑。

## Vercel 环境变量
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

`WEBHOOK_URL` 不再需要。

## 文件结构
- `index.html`
- `icon.png`
- `README.md`
- `vercel.json`
- `api/trigger.js`

## 使用方式
1. 新直播第一次按「启动倒数」。
2. 系统显示最近 Facebook 贴文候选，优先看标记为「视频/直播候选」及最新时间。
3. 可点「打开」核对 Facebook 页面，再点「选择这个」。
4. 二次确认后锁定本场 Post ID，并立即执行第一次完整倒数。
5. 同一场直播之后再按「启动倒数」直接执行，不再询问。
6. 直播结束后点「结束本场直播」，解除锁定。

## 注意
- 锁定资料存于当前浏览器的 localStorage；换手机/浏览器需要重新选择一次。
- 为避免误投，V6.7 不会自动判断哪一个候选一定是直播，必须由用户第一次人工确认。
