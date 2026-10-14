const GRAPH_VERSION = 'v23.0';

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

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!makeWebhookUrl || !pageId || !accessToken) {
    return jsonError(
      res,
      500,
      '❌ 系统环境变量未完整设置（WEBHOOK_URL / PAGE_ID / FB_ACCESS_TOKEN）'
    );
  }

  try {
    const latestPost = await graphGetLatestPost(pageId, accessToken);

    // Preview only: used on every button press to detect the current latest Post ID.
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        mode: 'preview',
        post_id: latestPost.id,
        created_time: latestPost.created_time || '',
        permalink_url: latestPost.permalink_url || '',
        message: latestPost.message || ''
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return jsonError(res, 405, '❌ 不支持这个请求方式');
    }

    const expectedPostId = req.body?.post_id;
    if (!expectedPostId || typeof expectedPostId !== 'string') {
      return jsonError(res, 400, '❌ 缺少 Post ID');
    }

    // Race protection: never trigger if the latest Facebook Post changed after checking.
    if (expectedPostId !== latestPost.id) {
      return jsonError(res, 409, '❌ 最新 Post ID 已改变，请重新确认', {
        post_changed: true,
        post_id: latestPost.id,
        created_time: latestPost.created_time || ''
      });
    }

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
      return jsonError(res, 502, '❌ Make Webhook 接收失败', {
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
    return jsonError(res, 500, `❌ ${error.message || '系统错误'}`, {
      code: error.code || '',
      facebook: error.facebook || undefined
    });
  }
}
