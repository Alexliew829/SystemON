import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

// 验证请求是否来自 Facebook 或 Cron
function verifyRequest(req) {
  const fbSignature = req.headers['x-hub-signature-256']
  const cronSecret = req.headers['x-cron-secret']

  // Cron 验证
  if (cronSecret && cronSecret === process.env.X_CRON_SECRET) {
    return true
  }

  // Facebook 验证
  if (fbSignature && req.body) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.FB_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex')
    return fbSignature === expected
  }

  return false
}

// 获取最近一篇贴文及留言
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
  await supabase.from(TABLE_NAME).insert([{ comment_id: commentId }])
}

// 主处理逻辑
async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data?.length) {
    return { message: 'No post comments found.' }
  }

  let triggerCount = 0
  const summary = []

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    if (message.includes('on') || message.includes('开始')) {
      await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
        method: 'POST',
        body: new URLSearchParams({
          message: 'System On 晚上好，欢迎来到情人传奇🌿',
          access_token: process.env.FB_ACCESS_TOKEN
        })
      })
      await markAsProcessed(comment.id)
      triggerCount++
      summary.push({ action: 'replied: System On', comment_id: comment.id })
    }

    if (message.includes('zzz')) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id })
      })
      await markAsProcessed(comment.id)
      triggerCount++
      summary.push({ action: 'triggered: Make Webhook', comment_id: comment.id })
    }
  }

  return triggerCount > 0
    ? { triggered: triggerCount, post_id: post.id, summary }
    : { message: 'No matched comment. System running OK ✅', post_id: post.id }
}

// Webhook 接收入口
export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized (缺少签名或Cron密钥)' })
  }

  try {
    const result = await processComments()
    res.status(200).json(result)
  } catch (error) {
    console.error('处理出错:', error)
    res.status(500).json({ error: error.message })
  }
}
