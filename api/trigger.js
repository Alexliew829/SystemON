export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;

  if (!makeWebhookUrl) {
    return res.status(500).json({
      success: false,
      message: "WEBHOOK_URL 未设置"
    });
  }

  // 只允许晚上 20:00 至隔天 04:00（马来西亚时间）
  const now = new Date();
  const malaysiaHour = (now.getUTCHours() + 8) % 24;
  if (!(malaysiaHour >= 20 || malaysiaHour < 4)) {
    return res.status(403).json({
      success: false,
      message: "当前不在触发时段（20:00-04:00）"
    });
  }

  try {
    const makeResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger: "manual_countdown",
        time: now.toISOString()
      })
    });

    if (!makeResponse.ok) {
      return res.status(502).json({
        success: false,
        message: "Make Webhook 未接受请求"
      });
    }

    return res.status(200).json({
      success: true,
      message: "已送出倒数启动请求"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "无法连接 Make",
      error: error.message
    });
  }
}
