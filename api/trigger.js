// 主处理函数
async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data || post.comments.data.length === 0) {
    return { message: 'No recent post or comments.' }
  }

  let triggerCount = 0

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    // ✅ 关键词判断：开始 / on
    if (message.includes('开始') || message.includes('on')) {
      await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
        method: 'POST',
        body: new URLSearchParams({
          message: 'System On 晚上好，欢迎来到情人传奇🌿',
          access_token: process.env.FB_ACCESS_TOKEN
        })
      })
      await markAsProcessed(comment.id)
      triggerCount++
    }

    // ✅ 判断 zzz，触发 Make Webhook
    if (message.includes('zzz')) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id })
      })
      await markAsProcessed(comment.id)
      triggerCount++
    }
  }

  if (triggerCount > 0) {
    return { triggered: triggerCount, post_id: post.id }
  } else {
    return { message: 'Invalid comments. No trigger matched.', post_id: post.id }
  }
}
