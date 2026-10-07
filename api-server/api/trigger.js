export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!makeWebhookUrl || !pageId || !accessToken) {
    return res.status(500).json({
      success: false,
      message: "❌ Vercel 环境变量缺失",
      missing: {
        WEBHOOK_URL: !makeWebhookUrl,
        PAGE_ID: !pageId,
        FB_ACCESS_TOKEN: !accessToken
      }
    });
  }

  // 每天 20:00 至隔天 04:00（马来西亚时间）
  const now = new Date();
  const hour = now.getUTCHours() + 8;
  const adjustedHour = hour >= 24 ? hour - 24 : hour;

  if (!(adjustedHour >= 20 || adjustedHour < 4)) {
    return res.status(403).json({
      success: false,
      message: "⛔ 当前不在触发时段（每天20:00~04:00）"
    });
  }

  try {
    const fbUrl =
      `https://graph.facebook.com/v19.0/${pageId}/posts` +
      `?limit=1&access_token=${encodeURIComponent(accessToken)}`;

    const fbResponse = await fetch(fbUrl);
    const fbData = await fbResponse.json();

    if (!fbResponse.ok || fbData?.error) {
      return res.status(500).json({
        success: false,
        message: "❌ Facebook API 执行失败",
        facebook_status: fbResponse.status,
        facebook_error: fbData?.error || fbData
      });
    }

    const latestPostId = fbData?.data?.[0]?.id;

    if (!latestPostId) {
      return res.status(500).json({
        success: false,
        message: "❌ Facebook API 成功，但没有取得任何贴文",
        facebook_response: fbData
      });
    }

    const makeResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        post_id: latestPostId,
        trigger: "manual_countdown",
        time: new Date().toISOString()
      })
    });

    if (!makeResponse.ok) {
      const makeText = await makeResponse.text();

      return res.status(500).json({
        success: false,
        message: "❌ Make Webhook 执行失败",
        make_status: makeResponse.status,
        make_response: makeText
      });
    }

    return res.status(200).json({
      success: true,
      Trigged: 1,
      message: `✅ 已触发倒数留言，Post ID: ${latestPostId}`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "❌ 系统错误",
      error: error.message
    });
  }
}
