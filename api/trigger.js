const GRAPH_VERSION = 'v23.0';
const FACEBOOK_TIMEOUT_MS = 10 * 1000;
const CANDIDATE_LIMIT = 8;
const CANDIDATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const COUNTDOWN_STEPS = [
  { message: '🪴🪴🪴Syetem On 晚上好🪴🪴🪴\n 🌿🌿🌿欢迎来到情人传奇🌿🌿🌿\n🌟🌟🌟感谢参与竞标活动 🌟🌟🌟', waitAfterMs: 2000 },
  { message: '倒数-10\nCount Down-10', waitAfterMs: 2000 },
  { message: '倒数-9\nCount Down-9', waitAfterMs: 2000 },
  { message: '倒数-8\nCount Down-8', waitAfterMs: 2000 },
  { message: '倒数-7\nCount Down-7', waitAfterMs: 2000 },
  { message: '倒数-6\nCount Down-6', waitAfterMs: 2000 },
  { message: '倒数-5\nCount Down-5', waitAfterMs: 2000 },
  { message: '倒数-4\nCount Down-4', waitAfterMs: 2000 },
  { message: '倒数-3\nCount Down-3', waitAfterMs: 2000 },
  { message: '喜欢的大步一点 , 不然美树给人抢去', waitAfterMs: 3000 },
  { message: 'Take a big step，someone else might grab it!', waitAfterMs: 3000 },
  { message: '倒数-2\nCount Down-2', waitAfterMs: 5000 },
  { message: '倒数-1\nCount Down-1', waitAfterMs: 5000 },
  { message: '还有谁要出价？喜欢就别错过！  \nAny more bids? If you like this plant, don’t miss out!', waitAfterMs: 10000 },
  { message: '0000000000, 关 >>>>>Close\n0000000000 上得标，0下无效\n0 above wins , 0 below invalid', waitAfterMs: 0 }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FACEBOOK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Facebook API 超时（>${Math.round(timeoutMs / 1000)}秒）`);
      timeoutError.code = 'FACEBOOK_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function graphGet(path, params, accessToken) {
  const query = new URLSearchParams({ ...params, access_token: accessToken });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}?${query.toString()}`;
  const response = await fetchWithTimeout(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    const message = data?.error?.message || `Facebook API ${response.status}`;
    const error = new Error(message);
    error.facebook = data?.error || null;
    throw error;
  }
  return data;
}

async function graphPostComment(postId, message, accessToken) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(postId)}/comments`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: accessToken })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error || !data?.id) {
    const error = new Error(data?.error?.message || `Facebook comment API ${response.status}`);
    error.facebook = data?.error || null;
    throw error;
  }
  return data.id;
}

function looksLikeVideo(post) {
  const permalink = String(post?.permalink_url || '').toLowerCase();
  if (permalink.includes('/videos/')) return true;
  const attachments = Array.isArray(post?.attachments?.data) ? post.attachments.data : [];
  return attachments.some(item => {
    const mediaType = String(item?.media_type || '').toLowerCase();
    const type = String(item?.type || '').toLowerCase();
    const url = String(item?.url || '').toLowerCase();
    const targetUrl = String(item?.target?.url || '').toLowerCase();
    return mediaType.includes('video') || type.includes('video') || url.includes('/videos/') || targetUrl.includes('/videos/');
  });
}

function isRecent(createdTime) {
  const ts = Date.parse(createdTime || '');
  if (!Number.isFinite(ts)) return true;
  const age = Date.now() - ts;
  return age >= -5 * 60 * 1000 && age <= CANDIDATE_MAX_AGE_MS;
}

function normalizeCandidate(post, source) {
  if (!post?.id) return null;
  return {
    id: String(post.id),
    created_time: post.created_time || '',
    permalink_url: post.permalink_url || '',
    message: post.message || '',
    is_published: post.is_published !== false,
    is_video: looksLikeVideo(post),
    source
  };
}

async function readEdge(pageId, edge, accessToken) {
  const fields = 'id,created_time,message,permalink_url,is_published,attachments{media_type,type,target,url}';
  const data = await graphGet(`${encodeURIComponent(pageId)}/${edge}`, {
    limit: String(CANDIDATE_LIMIT),
    fields
  }, accessToken);
  return Array.isArray(data?.data) ? data.data : [];
}

async function getCandidates(pageId, accessToken) {
  const results = await Promise.allSettled([
    readEdge(pageId, 'feed', accessToken),
    readEdge(pageId, 'posts', accessToken)
  ]);

  const merged = new Map();
  const errors = [];

  for (let i = 0; i < results.length; i++) {
    const source = i === 0 ? 'feed' : 'posts';
    const result = results[i];
    if (result.status === 'rejected') {
      errors.push(`${source}: ${result.reason?.message || '读取失败'}`);
      continue;
    }
    for (const post of result.value) {
      const item = normalizeCandidate(post, source);
      if (!item || !isRecent(item.created_time)) continue;
      const existing = merged.get(item.id);
      if (!existing) {
        merged.set(item.id, item);
      } else {
        merged.set(item.id, {
          ...existing,
          ...item,
          source: existing.source === item.source ? existing.source : 'feed+posts',
          is_video: existing.is_video || item.is_video
        });
      }
    }
  }

  const candidates = [...merged.values()]
    .sort((a, b) => (Date.parse(b.created_time || '') || 0) - (Date.parse(a.created_time || '') || 0))
    .slice(0, CANDIDATE_LIMIT);

  if (!candidates.length) {
    const error = new Error(errors.length
      ? `无法读取最近贴文：${errors.join('；')}`
      : '找不到最近 24 小时内可选择的 Facebook 贴文');
    error.code = 'NO_CANDIDATES';
    throw error;
  }

  return { candidates, warnings: errors };
}

function validatePostId(pageId, postId) {
  const id = String(postId || '').trim();
  if (!id || !id.startsWith(`${pageId}_`)) {
    const error = new Error('Post ID 不属于当前 Facebook Page');
    error.code = 'INVALID_POST_ID';
    throw error;
  }
  return id;
}

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

export default async function handler(req, res) {
  const pageId = process.env.PAGE_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    return jsonError(res, 500, '❌ 系统环境变量未完整设置（PAGE_ID / FB_ACCESS_TOKEN）');
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return jsonError(res, 405, '❌ 不支持这个请求方式');
  }

  try {
    if (req.method === 'GET') {
      const result = await getCandidates(pageId, accessToken);
      return res.status(200).json({
        success: true,
        candidates: result.candidates,
        warnings: result.warnings
      });
    }

    const postId = validatePostId(pageId, req.body?.post_id);
    const commentIds = [];
    for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
      const step = COUNTDOWN_STEPS[i];
      try {
        const commentId = await graphPostComment(postId, step.message, accessToken);
        commentIds.push(commentId);
      } catch (error) {
        return jsonError(res, 502, `❌ 倒数执行到第 ${i + 1} 步失败：${error.message}`, {
          post_id: postId,
          failed_step: i + 1,
          sent_count: commentIds.length,
          code: error.code || '',
          facebook: error.facebook || undefined
        });
      }
      if (step.waitAfterMs > 0) await sleep(step.waitAfterMs);
    }

    return res.status(200).json({
      success: true,
      triggered: 1,
      completed: true,
      message: '✅ 倒数已完成',
      post_id: postId,
      sent_count: commentIds.length,
      last_comment_id: commentIds.at(-1) || '',
    });
  } catch (error) {
    const status = error.code === 'FACEBOOK_TIMEOUT' ? 504
      : ['NO_CANDIDATES', 'INVALID_POST_ID'].includes(error.code) ? 409
      : 500;
    return jsonError(res, status, `❌ ${error.message || '系统错误'}`, {
      code: error.code || '',
      facebook: error.facebook || undefined
    });
  }
}
