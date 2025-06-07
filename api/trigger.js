// ✅ 每次访问 → 自动留言一次 System On（只要主页没留言过且在 60 分钟内）
const hasSystemOn = comments.some(
  c => (c.message || '').toLowerCase().includes('system on') && c.from?.id === PAGE_ID
)

const postTime = new Date(post.created_time)
const now = new Date()
const diffMinutes = (now - postTime) / (1000 * 60)

if (!hasSystemOn) {
  if (diffMinutes > 60) {
    return res.status(200).json({
      message: '⏰ 最新贴文超过 60 分钟，跳过留言 System On',
      post_id: post.id,
      created_time: post.created_time,
    })
  }

  const commentRes = await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      message: 'System On 晚上好，欢迎来到情人传奇🌿',
      access_token: FB_ACCESS_TOKEN,
    }),
  })

  const json = await commentRes.json()

  if (json.error) {
    return res.status(200).json({ message: '❌ 留言失败', error: json.error })
  }

  return res.status(200).json({
    message: '✅ 已留言 System On',
    comment_id: json.id,
    post_id: post.id,
  })
}
