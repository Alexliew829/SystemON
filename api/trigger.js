const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fetch = require('node-fetch')

// 初始化 Supabase（使用 triggered_comments 表）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = process.env.SUPABASE_TABLE_NAME || 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

// 验证签名（来自 Facebook Webhook 的 POST）
function verifyRequest(req) {
  const signature = req.headers['x-hub-signature-256']
  if (!signature) return false
  const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
  const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
  return signature === `sha256=${digest}`
}

// 判断留言是否已处理
async function isProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data && data.length > 0
}

// 写入已处理
async function markAsProcessed(commentId) {
  await supabase.from(TABLE_NAME).insert([{ comment_id: commentId }])
}

// 主逻辑：处理 Webhook 留言内容
async function handleWebhookEvent(reqBody) {
  const entry = reqBody.entry?.[0]
  const change = entry?.changes?.[0]
  const comment = change?.value

  if (change.field !== 'feed' || !comment || !comment.message) {
    return { status: 'ignored' }
  }

  const message = comment.message.toLowerCase()
  const commentId = comment.comment_id
  const fromId = comment.from?.id
  const postId = comment.post_id

  if (!commentId || !postId || !fromId) {
    return { status: 'missing data' }
  }

  if (fromId !== PAGE_ID) {
    return { status: 'not from page' }
  }

  const alreadyProcessed = await isProcessed(commentId)
  if (alreadyProcessed) {
    return { status: 'already processed' }
  }

  // ✅ 留言关键词判断
  if (message.includes('开始') || message.includes('on')) {
    await fetch(`https://graph.facebook.com/v19.0/${postId}/comments`, {
      method: 'POST',
      body: new URLSearchParams({
        message: 'System On 晚上好，欢迎来到情人传奇🌿',
        access_token: process.env.FB_ACCESS_TOKEN
      })
    })
    await markAsProcessed(commentId)
    return { status: 'system on replied' }
  }

  if (message.includes('zzz')) {
    await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, comment_id: commentId })
    })
    await markAsProcessed(commentId)
    return { status: 'make webhook triggered' }
  }

  return { status: 'no matching keyword' }
}

// 导出 handler
module.exports = async (req, res) => {
  // ✅ 验证 Facebook Webhook：GET 请求
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    } else {
      return res.status(403).send('Verification failed')
    }
  }

  // ✅ 处理 Webhook 传入的留言事件：POST 请求
  if (req.method === 'POST') {
    if (!verifyRequest(req)) {
      return res.status(403).json({ error: 'Signature verification failed' })
    }

    try {
      const result = await handleWebhookEvent(req.body)
      return res.status(200).json(result)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  res.status(405).send('Method Not Allowed')
}
