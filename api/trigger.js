const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fetch = require('node-fetch')

// 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = process.env.SUPABASE_TABLE_NAME || "triggered_comments"
const PAGE_ID = process.env.PAGE_ID

// Facebook Webhook 签名校验（POST 请求时）
function verifyRequest(req) {
  if (req.headers['x-hub-signature-256']) {
    const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return `sha256=${digest}` === req.headers['x-hub-signature-256']
  }
  return false
}

// 获取最新贴文和留言
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
  if (!post || !post.comments?.data || post.comments.data.length === 0) {
    return { message: 'No recent post or comments.' }
  }

  let triggerCount = 0

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    // ✅ 自动回复“System On”
    if (message.includes('开始') || message.includes('on') || message.includes('晚上好')) {
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

    // ✅ 触发 Make Webhook（zzz）
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

  return triggerCount > 0
    ? { triggered: triggerCount }
    : { message: 'Invalid comments. No trigger matched.' }
}

// ✅ 处理 Facebook 验证（GET）+ 留言推送（POST）
module.exports = async (req, res) => {
  // Webhook 验证阶段（GET 请求）
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    console.log('🔍 Facebook Webhook 验证中...')
    console.log('➡️ hub.mode:', mode)
    console.log('➡️ hub.verify_token (from URL):', token)
    console.log('➡️ FB_VERIFY_TOKEN (from env):', process.env.FB_VERIFY_TOKEN)

    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    } else {
      return res.status(403).send('Verification failed')
    }
  }

  // 留言监听阶段（POST 请求）
  if (req.method === 'POST') {
    if (!verifyRequest(req)) {
      return res.status(403).json({ error: 'Signature verification failed' })
    }

    try {
      const result = await processComments()
      res.status(200).json(result)
    } catch (error) {
      console.error('❌ Error:', error)
      res.status(500).json({ error: error.message })
    }
  } else {
    res.status(405).send('Method Not Allowed')
  }
}
