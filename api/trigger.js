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

  return res.status(200).json({
    message: '✅ 系统正常运行，已经留言 System On',
    post_id: postId,
  });
} else {
  return res.status(200).json({
    message: '✅ 系统正常运行，已留言过 System On（不重复）',
    post_id: postId,
  });
}
