import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const PAGE_ID = process.env.PAGE_ID
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN
const WEBHOOK_URL = process.env.WEBHOOK_URL
const TABLE_NAME = 'triggered_comments'
const CRON_SECRET = process.env.CRON_SECRET

function verifyRequest(req) {
  const signature = req.headers['x-hub-signature-256']
  const cronSecret = req.headers['x-cron-secret']
  if (signature) {
    const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return signature === `sha256=${digest}`
  }
  return cronSecret === CRON_SECRET
}

async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,comments.limit(100){id,message,from}&access_token=${FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

async function isProcessed(commentId) {
  if (!commentId) return true
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

async function markAsProcessed(commentId) {
  if (!commentId) return
  const { error } = await supabase
    .from(TABLE_NAME)
    .insert([{ comment_id: commentId }])
  if (error) console.error('⚠️ Supabase 写入失败:', error)
}

export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized（签名或密钥无效）' })
  }

  const post = await getLatestPost()
  if (!post) return res.status(200).json({ message: '❌ 找不到最新贴文' })

  const comments = post.comments?.data || []

  // ✅ 每次访问 → 自动留言一次 System On（只要主页没留言过）
  const hasSystemOn = comments.some(
    c => (c.message || '').toLowerCase().includes('system on') && c.from?.id === PAGE_ID
  )

  if (!hasSystemOn) {
    const commentRes = await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        message: 'System On 晚上好，欢迎来到情人传奇🌿',
        access_token: FB_ACCESS_TOKEN,
      }),
    })

    const json = await commentRes.json()

    if (json.error) {
      return res.status(200).json({ message: '❌ 留言失败', error: json.error })
    }

    return res.status(200).json({
      message: '✅ 已留言 System On',
      comment_id: json.id,
      post_id: post.id,
    })
  }

  // ✅ 后续留言监听（zzz）
  let triggerCount = 0

  for (const comment of comments) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = (comment.message || '').toLowerCase()
    const alreadyDone = await isProcessed(comment.id)

    if (!isFromPage || alreadyDone) continue

    if (message.includes('zzz')) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id }),
      })

      await markAsProcessed(comment.id)
      triggerCount++
    }
  }

  return res.status(200).json({
    message:
      triggerCount > 0
        ? `✅ 已触发 ${triggerCount} 条 “zzz” 留言`
        : '✅ 无新留言需触发',
    post_id: post.id,
  })
}
