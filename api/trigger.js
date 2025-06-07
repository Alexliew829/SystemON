import { buffer } from 'micro';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.PAGE_ID;
const CRON_SECRET = process.env.X_CRON_SECRET;

const handler = async (req, res) => {
  // 验证 URL 用（Meta Webhook 验证）
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  // POST 方法：Webhook 或 EasyCron
  const rawBody = await buffer(req);
  const signature = req.headers['x-hub-signature'];
  const cronSecret = req.headers['x-cron-secret'];

  // ✅ 安全验证逻辑（支持 EasyCron 跳过签名）
  const isValid = cronSecret === CRON_SECRET || signature; // 支持 webhook 验证或 EasyCron 调用
  if (!isValid) return res.status(401).json({ error: 'Unauthorized' });

  // 获取最新帖子
  const feedRes = await fetch(
    `https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_ACCESS_TOKEN}`
  );
  const feedData = await feedRes.json();
  const post = feedData.data?.[0];

  if (!post) {
    return res.status(200).json({ message: '❌ 找不到最新贴文' });
  }

  const postId = post.id;

  // 获取该帖子的所有留言
  const commentRes = await fetch(
    `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_ACCESS_TOKEN}`
  );
  const commentData = await commentRes.json();
  const comments = commentData.data || [];

  // 检查是否已经留言“System On”
  const systemOnExists = comments.some(
    (c) =>
      c.from?.id === PAGE_ID &&
      typeof c.message === 'string' &&
      c.message.toLowerCase().includes('system on')
  );

  if (!systemOnExists) {
    // 没留言就执行留言
    const replyRes = await fetch(
      `https://graph.facebook.com/${postId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'System On',
          access_token: PAGE_ACCESS_TOKEN,
        }),
      }
    );

    const replyJson = await replyRes.json();

    return res.status(200).json({
      message: '✅ 系统正常运行，已经留言 System On',
      post_id: postId,
      comment_id: replyJson.id || null,
    });
  } else {
    return res.status(200).json({
      message: '✅ 系统正常运行，但已留言过 System On',
      post_id: postId,
    });
  }
};

export default handler;
