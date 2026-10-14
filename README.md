# SystemON Simple V6

简化版启动倒数：

- 首页只保留「启动倒数 / 再次启动」和简单状态。
- 点击按钮后，后端自动读取 Lover Legend Gardening 最新 Facebook Page Post。
- 把真正的 `post_id` 送到 Make Webhook。
- Make 后面的 Facebook 模块继续使用 Webhook 的 `1. post_id`。
- 不需要在 SystemON 输入 Facebook 链接或 Post ID。

## Vercel 环境变量

必须保留：

- `WEBHOOK_URL`
- `PAGE_ID`
- `FB_ACCESS_TOKEN`

## Make

后续倒数模块的 Post ID 保持 Map：

`1. post_id`

不要删除 Webhook 的 post_id Mapping。
