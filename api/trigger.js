for (const comment of post.comments.data) {
  const isFromPage = comment.from?.id === PAGE_ID
  const message = comment.message?.toLowerCase() || ''
  const alreadyProcessed = await isProcessed(comment.id)

  // ✅ 已处理或非主页留言，跳过
  if (!isFromPage || alreadyProcessed) continue

  let matched = false

  // ✅ “zzz”留言 → 触发倒数，只执行 webhook
  if (!matched && message.includes('zzz')) {
    await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: post.id, comment_id: comment.id }),
    })
    responseMessages.push(`✅ “zzz”留言已触发 Webhook`)
    matched = true
    triggerCount++
  }

  // ✅ “on”或“开始”留言 → 仅在未曾留言 System On 时触发
  if (!matched && (message.includes('on') || message.includes('开始'))) {
    const hasSystemOn = post.comments.data.some(
      c => c.message?.includes('System On') && c.from?.id === PAGE_ID
    )
    if (!hasSystemOn) {
      await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
        method: 'POST',
        body: new URLSearchParams({
          message: 'System On 晚上好，欢迎来到情人传奇🌿',
          access_token: process.env.FB_ACCESS_TOKEN,
        }),
      })
      responseMessages.push(`✅ “on”留言已触发 System On`)
    } else {
      responseMessages.push(`⚠️ 已有 System On，无需重复触发`)
    }
    matched = true
    triggerCount++
  }

  // ✅ 每条留言最多标记处理一次
  if (matched) {
    await markAsProcessed(comment.id)
  }
}
