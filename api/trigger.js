const GRAPH_VERSION = 'v23.0';

function malaysiaHour() {
  const now = new Date();
  const hour = now.getUTCHours() + 8;
  return hour >= 24 ? hour - 24 : hour;
}

function inTriggerWindow() {
  const hour = malaysiaHour();
  return hour >= 20 || hour < 4;
}

async function graphGetLatestPost(pageId, accessToken) {
  const fields = 'id,created_time,message,permalink_url';
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/posts?limit=1&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    const message = data?.error?.message || `Facebook API ${response.status}`;
    const error = new Error(message);
    error.facebook = data?.error || null;
    throw error;
  }

  const post = Array.isArray(data?.data) ? data.data[0] : null;
  if (!post?.id) {
    const error = new Error('无法取得最新 Facebook 贴文 ID');
    error.code = 'NO_POST_ID';
    throw error;
  }

  return post;
}

export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!makeWebhookUrl || !pageId || !accessToken) {
    return res.status(500).json({
      success: false,
      message: '❌ 系统环境变量未完整设置（WEBHOOK_URL / PAGE_ID / FB_ACCESS_TOKEN）'
    });
  }

  if (!inTriggerWindow()) {
    return res.status(403).json({
      success: false,
      message: '⛔ 当前不在触发时段（每天20:00~04:00）'
    });
  }

  try {
    const latestPost = await graphGetLatestPost(pageId, accessToken);

    const makeResponse = await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: latestPost.id,
        trigger: 'manual_countdown',
        time: new Date().toISOString()
      })
    });

    const makeText = await makeResponse.text().catch(() => '');
    if (!makeResponse.ok) {
      return res.status(502).json({
        success: false,
        message: '❌ Make Webhook 接收失败',
        detail: makeText.slice(0, 300)
      });
    }

    return res.status(200).json({
      success: true,
      Triggered: 1,
      message: '✅ 已启动倒数',
      post_id: latestPost.id,
      created_time: latestPost.created_time || '',
      permalink_url: latestPost.permalink_url || ''
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `❌ ${error.message || '系统错误'}`,
      code: error.code || '',
      facebook: error.facebook || undefined
    });
  }
}
