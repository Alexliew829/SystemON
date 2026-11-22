const GRAPH_VERSION = 'v23.0';
const FALLBACK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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

async function graphGet(path, params, accessToken) {
  const query = new URLSearchParams({ ...params, access_token: accessToken });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}?${query.toString()}`;
  const response = await fetch(url, { cache: 'no-store' });
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
  const response = await fetch(url, {
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

function normalizePostId(pageId, objectId) {
  const id = String(objectId || '').trim();
  if (!id) return '';
  if (id.includes('_')) return id;
  return `${pageId}_${id}`;
}

function isLiveNow(item) {
  return String(item?.status || '').toUpperCase() === 'LIVE_NOW';
}

async function graphGetActiveLiveVideo(pageId, accessToken) {
  const fields = 'live_videos.limit(10){id,status,permalink_url,title,creation_time}';
  const data = await graphGet(encodeURIComponent(pageId), { fields }, accessToken);
  const items = Array.isArray(data?.live_videos?.data) ? data.live_videos.data : [];
  const live = items.find(isLiveNow);
  if (!live?.id) return null;

  return {
    id: normalizePostId(pageId, live.id),
    live_video_id: String(live.id),
    created_time: live.creation_time || '',
    permalink_url: live.permalink_url || '',
    message: live.title || '',
    source: 'live_video'
  };
}

function attachmentLooksLikeVideo(attachment) {
  const mediaType = String(attachment?.media_type || '').toLowerCase();
  const type = String(attachment?.type || '').toLowerCase();
  const url = String(attachment?.url || '').toLowerCase();
  const targetUrl = String(attachment?.target?.url || '').toLowerCase();
  return mediaType.includes('video') || type.includes('video') || url.includes('/videos/') || targetUrl.includes('/videos/');
}

function postLooksLikeVideo(post) {
  const permalink = String(post?.permalink_url || '').toLowerCase();
  if (permalink.includes('/videos/')) return true;
  const attachments = Array.isArray(post?.attachments?.data) ? post.attachments.data : [];
  return attachments.some(attachmentLooksLikeVideo);
}

function isRecent(createdTime) {
  const created = Date.parse(createdTime || '');
  if (!Number.isFinite(created)) return false;
  const age = Date.now() - created;
  return age >= -5 * 60 * 1000 && age <= FALLBACK_MAX_AGE_MS;
}

async function graphGetLatestVideoPostFallback(pageId, accessToken) {
  const fields = 'id,created_time,message,permalink_url,attachments{media_type,type,target,url}';
  const data = await graphGet(`${encodeURIComponent(pageId)}/posts`, { limit: '1', fields }, accessToken);
  const post = Array.isArray(data?.data) ? data.data[0] : null;
  if (!post?.id || !postLooksLikeVideo(post) || !isRecent(post.created_time)) return null;

  return {
    id: String(post.id),
    live_video_id: '',
    created_time: post.created_time || '',
    permalink_url: post.permalink_url || '',
    message: post.message || '',
    source: 'latest_video_post_fallback'
  };
}

async function graphResolveCountdownTarget(pageId, accessToken) {
  let liveLookupError = null;
  try {
    const live = await graphGetActiveLiveVideo(pageId, accessToken);
    if (live) return live;
  } catch (error) {
    liveLookupError = error;
  }

  const fallback = await graphGetLatestVideoPostFallback(pageId, accessToken);
  if (fallback) return { ...fallback, warning: liveLookupError ? 'LIVE_LOOKUP_UNAVAILABLE' : '' };

  const error = new Error('无法确认当前直播 Post ID。为避免倒数留言到错误贴文，本次未启动。请确认直播已经开始后再试。');
  error.code = 'NO_LIVE_TARGET';
  if (liveLookupError?.facebook) error.facebook = liveLookupError.facebook;
  throw error;
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

  try {
    const target = await graphResolveCountdownTarget(pageId, accessToken);

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        mode: 'preview',
        post_id: target.id,
        live_video_id: target.live_video_id || '',
        source: target.source,
        warning: target.warning || '',
        created_time: target.created_time || '',
        permalink_url: target.permalink_url || '',
        message: target.message || ''
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

    if (expectedPostId !== target.id) {
      return jsonError(res, 409, '❌ 当前直播 Post ID 已改变，请重新确认', {
        post_changed: true,
        post_id: target.id,
        source: target.source,
        created_time: target.created_time || ''
      });
    }

    const commentIds = [];
    for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
      const step = COUNTDOWN_STEPS[i];
      try {
        const commentId = await graphPostComment(target.id, step.message, accessToken);
        commentIds.push(commentId);
      } catch (error) {
        return jsonError(res, 502, `❌ 倒数执行到第 ${i + 1} 步失败：${error.message}`, {
          post_id: target.id,
          failed_step: i + 1,
          sent_count: commentIds.length,
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
      post_id: target.id,
      live_video_id: target.live_video_id || '',
      source: target.source,
      warning: target.warning || '',
      sent_count: commentIds.length,
      last_comment_id: commentIds.at(-1) || '',
      created_time: target.created_time || '',
      permalink_url: target.permalink_url || ''
    });
  } catch (error) {
    const status = error.code === 'NO_LIVE_TARGET' ? 409 : 500;
    return jsonError(res, status, `❌ ${error.message || '系统错误'}`, {
      code: error.code || '',
      facebook: error.facebook || undefined
    });
  }
}
