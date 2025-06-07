async function processComments() {
  const post = await getLatestPost()
  if (!post) {
    return { message: '❌ 找不到最新贴文' }
  }

  const comments = post.comments?.data || []

  // ✅ 检查是否已留言 System On（只留言一次）
  const hasSystemOn = comments.some(
    c => c.message?.toLowerCase().includes('system on') && c.from?.id === PAGE_ID
  )

  if (!hasSystemOn) {
    // 自动留言一次 System On
    await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
      method: 'POST',
      body: new URLSearchParams({
        message: 'System On 晚上好，欢迎来到情人传奇🌿',
        access_token: process.env.FB_ACCESS_TOKEN,
      }),
    })
    return {
      message: '✅ 系统正常运行，已自动留言 System On',
      post_id: post.id,
    }
  }

  // ✅ 检查是否有新的 zzz 留言（主页身份留言，且未触发过）
  let triggerCount = 0
  let responseMessages = []

  for (const comment of comments) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    if (message.includes('zzz')) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id }),
      })
      await markAsProcessed(comment.id)
      responseMessages.push(`✅ “zzz”留言已触发 Webhook`)
      triggerCount++
    }
  }

  if (triggerCount > 0) {
    return {
      message: `✅ 触发 ${triggerCount} 条 “zzz” 留言`,
      post_id: post.id,
      logs: responseMessages,
    }
  } else {
    return {
      message: '✅ 系统运行正常，已留言 System On，无新留言需触发',
      post_id: post.id,
    }
  }
}
