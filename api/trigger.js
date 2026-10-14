const GRAPH_VERSION = 'v23.0';

function malaysiaHour() {
  const now = new Date();
  const hour = now.getUTCHours() + 8;
  return hour >= 24 ? hour - 24 : hour;
}

function inTriggerWindow() {
  const h = malaysiaHour();
  return h >= 20 || h < 4;
}

function extractNumericIds(input) {
  return String(input || '').match(/\d{8,}/g) || [];
}

function looksLikeFullPostId(input) {
  return /^\d+_\d+$/.test(String(input || '').trim());
}

function objectContainsNeedle(obj, needle) {
  if (!obj || !needle) return false;
  try {
    return JSON.stringify(obj).includes(needle);
  } catch {
    return false;
  }
}

async function graphGet(path, accessToken) {
  const joiner = path.includes('?') ? '&' : '?';
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}${joiner}access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const err = new Error(data?.error?.message || `Facebook API ${response.status}`);
    err.facebook = data?.error || null;
    err.status = response.status;
    throw err;
  }
  return data;
}

async function validatePostId(postId, accessToken, pageId) {
  const data = await graphGet(
    `${encodeURIComponent(postId)}?fields=id,permalink_url,message,created_time,from`,
    accessToken
  );

  if (!data?.id) throw new Error('无法读取这个 Facebook Post');

  // Page posts normally use PAGEID_POSTID. If Facebook returns another readable object,
  // keep it readable but mark it as a mismatch so it cannot be triggered accidentally.
  if (pageId && data.id.includes('_') && !data.id.startsWith(`${pageId}_`)) {
    const err = new Error('这个 Post 不属于 Lover Legend Gardening');
    err.code = 'PAGE_MISMATCH';
    throw err;
  }

  return {
    post_id: data.id,
    permalink_url: data.permalink_url || '',
    message: data.message || '',
    created_time: data.created_time || '',
    from: data.from || null
  };
}

async function resolveFromFeed(input, pageId, accessToken) {
  const ids = extractNumericIds(input);
  const needleIds = [...new Set(ids)];

  // Pull recent Page feed objects and their attachments. This lets a copied Live URL
  // such as /videos/<videoId> resolve to the actual Page post ID instead of guessing.
  const feed = await graphGet(
    `${encodeURIComponent(pageId)}/feed?limit=50&fields=id,permalink_url,message,created_time,attachments{target,url,media_type,subattachments{target,url}}`,
    accessToken
  );

  const items = Array.isArray(feed?.data) ? feed.data : [];
  const exactUrl = String(input || '').trim();

  for (const item of items) {
    if (!item?.id) continue;

    if (exactUrl && item.permalink_url && exactUrl === item.permalink_url) {
      return item.id;
    }

    for (const needle of needleIds) {
      if (
        String(item.id).includes(needle) ||
        String(item.permalink_url || '').includes(needle) ||
        objectContainsNeedle(item.attachments, needle)
      ) {
        return item.id;
      }
    }
  }

  return '';
}

async function resolveInputToPost(input, pageId, accessToken) {
  const raw = String(input || '').trim();
  if (!raw) {
    const err = new Error('请先贴上 Facebook Live 链接或 Post ID');
    err.code = 'EMPTY_INPUT';
    throw err;
  }

  // Best case: user already pasted the full Graph Post ID.
  if (looksLikeFullPostId(raw)) {
    return validatePostId(raw, accessToken, pageId);
  }

  // If a Page post URL contains story_fbid or posts/<id>, try the full PageID_PostID first.
  const storyMatch = raw.match(/[?&]story_fbid=(\d+)/i);
  const postsMatch = raw.match(/\/posts\/(\d+)/i);
  const candidate = storyMatch?.[1] || postsMatch?.[1] || '';
  if (candidate) {
    try {
      return await validatePostId(`${pageId}_${candidate}`, accessToken, pageId);
    } catch {
      // Fall through to feed matching.
    }
  }

  // For Live/video/photo links or a bare numeric ID, resolve against recent Page feed.
  const resolved = await resolveFromFeed(raw, pageId, accessToken);
  if (!resolved) {
    const err = new Error('找不到对应的 Facebook 直播贴文。请确认直播已经建立，并复制这场直播的链接。');
    err.code = 'POST_NOT_FOUND';
    throw err;
  }

  return validatePostId(resolved, accessToken, pageId);
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  const makeWebhookUrl = process.env.WEBHOOK_URL;
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    return res.status(500).json({
      success: false,
      message: '❌ 系统环境变量未完整设置（PAGE_ID / FB_ACCESS_TOKEN）'
    });
  }

  // Prevent old direct browser GET calls from accidentally targeting the wrong latest post.
  if (req.method === 'GET' && !req.query?.input) {
    return res.status(400).json({
      success: false,
      message: '请回到启动倒数首页，先贴上 Facebook Live 链接或 Post ID。'
    });
  }

  const body = readJsonBody(req);
  const action = String(body.action || req.query?.action || 'check').toLowerCase();
  const input = body.input || req.query?.input || '';

  try {
    const post = await resolveInputToPost(input, pageId, accessToken);

    if (action === 'check') {
      return res.status(200).json({
        success: true,
        valid: true,
        message: '✅ 已找到可读取的 Facebook 贴文',
        ...post
      });
    }

    if (action !== 'trigger') {
      return res.status(400).json({ success: false, message: '❌ 不支持的操作' });
    }

    if (!inTriggerWindow()) {
      return res.status(403).json({
        success: false,
        message: '⛔ 当前不在触发时段（每天20:00~04:00）'
      });
    }

    if (!makeWebhookUrl) {
      return res.status(500).json({
        success: false,
        message: '❌ 系统环境变量 WEBHOOK_URL 未设置'
      });
    }

    const makeResponse = await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: post.post_id,
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
      message: '✅ 已送出倒数请求到 Make',
      ...post
    });
  } catch (error) {
    return res.status(error?.status && error.status >= 400 ? error.status : 400).json({
      success: false,
      message: `❌ ${error.message || '系统错误'}`,
      code: error.code || '',
      facebook: error.facebook || undefined
    });
  }
}
