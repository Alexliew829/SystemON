export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!makeWebhookUrl || !pageId || !accessToken) {
    return res.status(500).json({
      success: false,
      message: "❌ 缺少必要的环境变量：WEBHOOK_URL、PAGE_ID、FB_ACCESS_TOKEN"
    });
  }

  try {
    // 步骤 1：获取最新一篇贴文
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/posts?limit=1&access_token=${accessToken}`
    );

    const fbData = await fbResponse.json();
    const latestPostId = fbData?.data?.[0]?.id;

    if (!latestPostId) {
      return res.status(500).json({
        success: false,
        message: "❌ 无法获取最新贴文 ID"
      });
    }

    // 步骤 2：发送 Webhook 给 Make，附带 latestPostId
    const makeResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trigger: "manual_countdown",
        post_id: latestPostId,
        time: new Date().toISOString()
      })
    });

    if (makeResponse.ok) {
      res.status(200).json({
        success: true,
        message: `✅ 已触发倒数留言，Post ID: ${latestPostId}`
      });
    } else {
      res.status(500).json({
        success: false,
        message: "❌ Make webhook 执行失败"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ 系统错误",
      error: error.message
    });
  }
}
