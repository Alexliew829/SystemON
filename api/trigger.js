export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized（签名或密钥无效）' })
  }

  const post = await getLatestPost()
  if (!post) return res.status(200).json({ message: '❌ 找不到最新贴文' })

  // ✅ 判断贴文是否在 60 分钟内
  const postTime = new Date(post.created_time)
  const now = new Date()
  const diffMinutes = (now - postTime) / (1000 * 60)

  if (diffMinutes > 60) {
    return res.status(200).json({
      message: '⏰ 最新贴文超过 60 分钟，跳过留言与触发逻辑',
      post_id: post.id,
      created_time: post.created_time,
    })
  }

  const comments = post.comments?.data || []

  // ✅ 留言 System On（只一次）
  const hasSystemOn = comments.some(
    c => (c.message || '').toLowerCase().includes('system on') && c.from?.id === PAGE_ID
  )

  if (!hasSystemOn) {
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
      console.error('❌ 留言失败:', json.error)
    } else {
      console.log('✅ 已留言 System On:', json.id)
    }
  }

  // ✅ 留言 "zzz" 只触发一次
  let triggerCount = 0

  for (const comment of comments) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = (comment.message || '').toLowerCase()
    const alreadyDone = await isProcessed(comment.id)

    if (!isFromPage || alreadyDone) continue

    if (message.includes('zzz')) {
      console.log('🚀 触发 Webhook for:', comment.id)

      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id }),
      })

      await markAsProcessed(comment.id)
      triggerCount++
    }
  }

  return res.status(200).json({
    message:
      triggerCount > 0
        ? `✅ 已触发 ${triggerCount} 条 “zzz” 留言`
        : '✅ 无新留言需触发',
    post_id: post.id,
  })
}
