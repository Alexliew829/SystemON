const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fetch = require('node-fetch')

// 初始化 Supabase 客户端
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const PAGE_ID = process.env.PAGE_ID

// 验证请求来源（x-cron-secret 或 x-hub-signature）
function verifyRequest(req) {
  if (req.headers['x-hub-signature-256']) {
    const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return `sha256=${digest}` === req.headers['x-hub-signature-256']
  }
  return req.headers['x-cron-secret'] === process.env.CRON_SECRET
}

// 拉取最新一篇贴文（仅限第一页）
async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from}&access_token=${process.env.FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

// 判断是否处理过
async function isProcessed(commentId) {
  const { data } = await supabase
    .from(process.env.SUPABASE_TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

// 标记为已处理
async function markAsProcessed(commentId) {
  await supabase
    .from(process.env.SUPABASE_TABLE_NAME)
    .insert([{ comment_id: commentId }])
}

// 主处理函数
async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data) return { message: 'No recent post or comments.' }

  let triggerCount = 0

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    if (message.includes('start') || message.includes('on')) {
      await fetch(
        `https://graph.facebook.com/v19.0/${post.id}/comments`,
        {
          method: 'POST',
          body: new URLSearchParams({
            message: 'System On 晚上好，欢迎来到情人传奇🌿',
            access_token: process.env.FB_ACCESS_TOKEN
          })
        }
      )
      await markAsProcessed(comment.id)
      triggerCount++
    }

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

  return { triggered: triggerCount }
}

// 导出 handler
module.exports = async (req, res) => {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  try {
    const result = await processComments()
    res.status(200).json({ message: 'Checked comments successfully (Supabase)', ...result })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
}
