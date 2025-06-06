import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

export const config = {
  api: {
    bodyParser: false,
  },
}

// 原生方式读取 Buffer（替代 raw-body）
async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = process.env.SUPABASE_TABLE_NAME || 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

function verifyRequest(req, rawBody) {
  const signature = req.headers['x-hub-signature-256']
  if (!signature) return false

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.FB_APP_SECRET)
    .update(rawBody)
    .digest('hex')

  return signature === expected
}

async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from}&access_token=${process.env.FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

async function isProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

async function markAsProcessed(commentId) {
  await supabase.from(TABLE_NAME).insert([{ comment_id: commentId }])
}

async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data || post.comments.data.length === 0) {
    return { message: '❌ 没有找到贴文或留言', post_id: post?.id || '无' }
  }

  let triggerCount = 0
  const triggeredIds = []

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    if (message.includes('开始') || message.includes('on') || message.includes('晚上好')) {
      await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
        method: 'POST',
        body: new URLSearchParams({
          message: 'System On 晚上好，欢迎来到情人传奇🌿',
          access_token: process.env.FB_ACCESS_TOKEN,
        }),
      })
      await markAsProcessed(comment.id)
      triggerCount++
      triggeredIds.push({ type: 'system_on', comment_id: comment.id })
    }

    if (message.includes('zzz')) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          comment_id: comment.id,
        }),
      })
      await markAsProcessed(comment.id)
      triggerCount++
      triggeredIds.push({ type: 'zzz', comment_id: comment.id })
    }
  }

  return triggerCount > 0
    ? {
        message: `✅ 共触发 ${triggerCount} 次`,
        post_id: post.id,
        triggered: triggeredIds,
      }
    : { message: '⚠️ 没有匹配留言', post_id: post.id }
}

export default async function handler(req, res) {
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

  if (req.method === 'POST') {
    const rawBody = await getRawBody(req)

    // 如果是 Webhook 触发，校验签名
    const isWebhook = req.headers['x-hub-signature-256']
    if (isWebhook && !verifyRequest(req, rawBody)) {
      return res.status(403).json({ error: 'Signature verification failed' })
    }

    try {
      req.body = JSON.parse(rawBody.toString('utf8'))
      const result = await processComments()
      res.status(200).json(result)
    } catch (error) {
      console.error('Error:', error)
      res.status(500).json({ error: error.message })
    }
  } else {
    res.status(405).send('Method Not Allowed')
  }
}
