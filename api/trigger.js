export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  // ✅ 记录访问时间和来源
  console.log("🔥 Trigger accessed at:", new Date().toISOString());
  console.log("🧠 IP Address:", req.headers["x-forwarded-for"] || req.connection?.remoteAddress);
  console.log("📱 User-Agent:", req.headers["user-agent"]);

  // 当前时间（UTC +8）
  const now = new Date();
  const hour = now.getUTCHours() + 8;
  const adjustedHour = hour >= 24 ? hour - 24 : hour;

  // 限制时间段：每天 20:00 至隔天 02:00
  if (!(adjustedHour >= 20 || adjustedHour < 2)) {
    return res.status(403).json({
      success: false,
      message: "⛔ 当前不在触发时段（每天20:00~02:00）"
    });
  }

  try {
    // 获取最新 Facebook 贴文 ID
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/posts?limit=1&access_token=${accessToken}`
    );
    const fbData = await fbResponse.json();
    const latestPostId = fbData?.data?.[0]?.id;

    if (!latestPostId) {
      return res.status(500).json({
        success: false,
        message: "❌ 无法取得最新贴文 ID"
      });
    }

    // 触发 Make Webhook
    const makeResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: latestPostId,
        trigger: "manual_countdown",
        time: new Date().toISOString()
