export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  // 打印来源信息
  console.log("🔥 Trigger accessed at:", new Date().toISOString());
  console.log("🧠 IP Address:", req.headers["x-forwarded-for"] || req.connection?.remoteAddress);
  console.log("📱 User-Agent:", req.headers["user-agent"]);
  console.log("🔁 Method:", req.method);

  // ❌ 如果是 HEAD 请求，就只返回 200，不执行
  if (req.method === "HEAD") {
    return res.status(200).end(); // 不触发任何倒数逻辑
  }

  // 时间段判断（UTC+8 20:00~02:00）
  const now = new Date();
  const hour = now.getUTCHours() + 8;
  const adjustedHour = hour >= 24 ? hour - 24 : hour;

  if (!(adjustedHour >= 20 || adjustedHour < 2)) {
    return res.status(403).json({
      success: false,
      message: "⛔ 当前不在触发时段（每天20:00~02:00）"
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
    console.error("❌ Error in trigger:", error);
    res.status(500).json({
      success: false,
      message: "❌ 系统错误",
      error: error.message
    });
  }
}
