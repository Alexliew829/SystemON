export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;

  if (!makeWebhookUrl) {
    return res.status(500).json({
      success: false,
      message: "❌ Environment variable WEBHOOK_URL not found."
    });
  }

  try {
    const response = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trigger: "manual_countdown",
        time: new Date().toISOString()
      })
    });

    if (response.ok) {
      res.status(200).json({
        success: true,
        message: "✅ Countdown triggered successfully."
      });
    } else {
      res.status(500).json({
        success: false,
        message: "❌ Make webhook responded with error."
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to call Make webhook.",
      error: error.message
    });
  }
}
