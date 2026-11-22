# SystemON Facebook 倒数系统 V6.5

## 版本定位
V6.5 以 V6.4 为基准，移除 Make 依赖，直接由 Vercel API 使用 Facebook Graph API 发布整套倒数评论。

## 主要变化
- 保留 V6.4 当前直播 `LIVE_NOW` 优先识别。
- 保留近期视频贴文安全 fallback。
- 保留新 Post 第一次确认、同 Post 后续直接启动、结束本场直播锁定等前端逻辑。
- 删除 `WEBHOOK_URL` 依赖。
- `/api/trigger` POST 后直接按原 Make blueprint 顺序发布全部评论和延迟。
- 单次完整倒数约 42 秒等待时间，Vercel Function `maxDuration` 设为 120 秒。

## 必须保留的 Vercel Environment Variables
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

`WEBHOOK_URL` 已不再需要，可保留但 V6.5 不会读取它。

## Facebook 权限
Page Access Token 必须具备发布 Page 评论所需权限；Meta 当前 `/comments` 发布要求包括 `pages_manage_engagement`，且 token 对应的人员需要能执行 Page MODERATE 任务。

## 文件结构
- `index.html`
- `icon.png`
- `vercel.json`
- `api/trigger.js`

## 测试顺序
1. 先用刚结束的近期直播视频测试一次。
2. 再开订阅者直播测试一次。
3. 最后做公开 OBS 推流直播测试。
4. 每次确认 System On、10、9…0 全部出现在同一场直播。

## 回退
V6.4 Make 版继续保留为备用版，不覆盖旧备份。
