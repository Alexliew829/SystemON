const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fetch = require('node-fetch')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = "triggered_comments"
const PAGE_ID = process.env.PAGE_ID

// 验证 Meta 签名
function verifyRequest(req) {
  const signature = req.headers['x-hub-signature-256']
  if (!signature) return false
  const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
  const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex')
  return signature === digest
}

// 判断是否已处理
async function isProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

// 标记为已处理
async function markAsProcessed(commentId) {
  await supabase
    .from(TABLE_NAME)
    .insert([{ comment_id: commentId }])
}

// 主逻辑：处理一条留言
async function handleComment(change) {
  const comment = change.value
  const message = comment.message?.toLowerCase() || ''
  const fromId = comment.from?.id
  const postId = comment.post_id
  const commentId = comment.comment_id

  if (!message || !fromId || !postId || !commentId) return 'Missing data'
  if (fromId !== PAGE_ID) return 'Not from Page'
  if (await isProcessed(commentId)) return 'Already processed'

  if (message.includes('开始') || message.includes('on')) {
    await fetch(`https://graph.facebook.com/v19.0/${postId}/comments`, {
      method: 'POST',
      body: new URLSearchParams({
        message: 'System On 晚上好，欢迎来到情人传奇🌿',
        access_token: process.env.FB_ACCESS_TOKEN
      })
    })
    await markAsProcessed(commentId)
    return 'System On sent'
  }

  if (message.includes('zzz')) {
    await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, comment_id: commentId })
    })
    await markAsProcessed(commentId)
    return 'zzz triggered'
  }

  return 'No keyword matched'
}

// 导出函数（支持验证）
module.exports = async (req, res) => {
  // Meta webhook 验证用：首次接入时
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    } else {
      return res.status(403).send('Verification failed')
    }
  }

  // POST 请求处理留言推送
  if (req.method === 'POST') {
    if (!verifyRequest(req)) {
      return res.status(403).json({ error: 'Invalid signature' })
    }

    try {
      const entries = req.body.entry || []
      const results = []

      for (const entry of entries) {
        for (const change of entry.changes || []) {
          if (change.field === 'feed' && change.value?.item === 'comment') {
            const result = await handleComment(change)
            results.push(result)
          }
        }
      }

      res.status(200).json({ handled: results })
    } catch (err) {
      console.error('Error handling webhook:', err)
      res.status(500).json({ error: err.message })
    }
  } else {
    res.status(405).send('Method Not Allowed')
  }
}
