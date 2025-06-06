const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fetch = require('node-fetch')

// 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = "triggered_comments"
const PAGE_ID = process.env.PAGE_ID

// 请求验证函数
function verifyRequest(req) {
  if (req.headers['x-hub-signature-256']) {
    const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return `sha256=${digest}` === req.headers['x-hub-signature-256']
  }
  return req.headers['x-cron-secret'] === process.env.CRON_SECRET
}

// 获取最新贴文及留言
async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from}&access_token=${process.env.FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

// 判断留言是否已处理
async function isProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

// 标记留言为已处理
async function markAsProcessed(commentId) {
  await supabase
    .from(TABLE_NAME)
    .insert([{ comment_id: commentId }])
}

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

// ✅ 正确导出：符合 Vercel Serverless Function 格式
module.exports = async (req, res) => {
  const debugBypass = req.query.debug === 'true'

  if (!verifyRequest(req)) {
    if (!debugBypass) {
      return res.status(403).json({ error: 'Unauthorized' })
    } else {
      console.log('⚠️ Debug 模式已跳过验证')
    }
  }

  try {
    const result = await processComments()
    res.status(200).json(result)
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
}
