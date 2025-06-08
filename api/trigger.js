let triggerCount = 0; // 声明在文件顶部，如果你部署为无状态函数，这个值不会持久

export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!makeWebhookUrl || !pageId || !accessToken) {
    return res.status(500).json({
      Trigged: 0,
      message: "❌ 缺少环境变量"
    });
  }

  try {
    // 获取最新贴文 ID
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/posts?limit=1&access_token=${accessToken}`
    );
    const fbData = await fbResponse.json();
    const latestPostId = fbData?.data?.[0]?.id;

    if (!latestPostId) {
      return res.status(500).json({
        Trigged: 0,
        message: "❌ 无法取得最新贴文 ID"
      });
    }

    // 触发 Make Webhook
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
      return res.status(500).json({
        Trigged: 0,
        message: "❌ Make Webhook 执行失败"
      });
    }

    // 本地 +1（注意：Vercel 无法长期保存此值，仅临时有效）
    triggerCount++;

    res.status(200).json({
      Trigged: triggerCount,
      message: `✅ 已触发倒数留言，Post ID: ${latestPostId}`
    });
  } catch (error) {
    res.status(500).json({
      Trigged: 0,
      message: "❌ 系统错误",
      error: error.message
    });
  }
}
