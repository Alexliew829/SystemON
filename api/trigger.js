export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  // 当前时间（UTC +8）
  const now = new Date();
  const hour = now.getUTCHours() + 8;
  const adjustedHour = hour >= 24 ? hour - 24 : hour;

  // 限制时间段：每天 20:00 至隔天 02:00
  if (!(adjustedHour >= 20 || adjustedHour < 2)) {
    return res.status(403).json({
      success: false,
      message: "⛔ 目前不在触发时段（每天20:00至隔天02:00）"
    });
  }

  try {
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

    const makeResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: latestPostId,
        trigger: "manual_countdown",
        time: new Date().toISOString()
      })
    });

    if (!makeResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "❌ Make Webhook 执行失败"
      });
    }

    res.status(200).json({
      Trigged: 1,
      message: `✅ 已触发倒数留言，Post ID: ${latestPostId}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ 系统错误",
      error: error.message
    });
  }
}
