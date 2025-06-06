// trigger.js
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

// 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

// 安全验证：支持 Facebook Webhook 或 EasyCron header
function verifyRequest(req) {
  const fbSig = req.headers['x-hub-signature-256']
  const cronSecret = req.headers['x-cron-secret']
  const validCron = cronSecret === process.env.CRON_SECRET

  if (fbSig) {
    const digest =
      'sha256=' +
      crypto
        .createHmac('sha256', process.env.FB_APP_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex')
    return fbSig === digest
  }

  return validCron
}

// 获取最新贴文和留言
async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from}&access_token=${process.env.FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

// 留言是否已处理
async function isProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

// 标记为已处理
async function markAsProcessed(commentId) {
  await supabase.from(TABLE_NAME).insert([{ comment_id: commentId }])
}

// 主处理逻辑
async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data || post.comments.data.length === 0) {
    return { message: '✅ 无贴文或留言，系统正常运行。' }
  }

  let triggerCount = 0

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
          access_token: process.env.FB_ACCESS_TOKEN
        })
      })
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

  return triggerCount > 0
    ? { triggered: triggerCount, post_id: post.id }
    : { message: '无匹配留言（无触发）', post_id: post.id }
}

// 主入口
export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized (缺少签名或Cron密钥)' })
  }

  try {
    const result = await processComments()
    return res.status(200).json(result)
  } catch (err) {
    console.error('❌ 执行错误:', err)
    return res.status(500).json({ error: err.message })
  }
}
