// ✅ Facebook 留言触发器：关键词 "start"、"on"、"zzz"，支持 Supabase 判重
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fetch = require('node-fetch')

// 初始化 Supabase 客户端（固定使用 triggered_comments 表）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = "triggered_comments"
const PAGE_ID = process.env.PAGE_ID

// 验证请求来源（Facebook 签名或 Cron 密钥）
function verifyRequest(req) {
  if (req.headers['x-hub-signature-256']) {
    const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return `sha256=${digest}` === req.headers['x-hub-signature-256']
  }
  return req.headers['x-cron-secret'] === process.env.CRON_SECRET
}

// 获取主页最新一篇贴文及留言
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

// 主处理逻辑
async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data) return { message: 'No recent post or comments.' }

  let triggerCount = 0

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    // ✅ 关键词 "start" 或 "on" → 自动留言
    if (message.includes('start') || message.includes('on')) {
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

    // ✅ 关键词 "zzz" → 触发倒数
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

// 导出 HTTP Handler（支持 debug=true 绕过验证）
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
    res.status(200).json({ message: 'Checked comments successfully (Supabase)', ...result })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
}
