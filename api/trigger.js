import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const PAGE_ID = process.env.PAGE_ID
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN
const WEBHOOK_URL = process.env.WEBHOOK_URL
const TABLE_NAME = 'triggered_comments'
const CRON_SECRET = process.env.CRON_SECRET
const FB_APP_SECRET = process.env.FB_APP_SECRET

// ✅ 验证 EasyCron 或 webhook 签名
function verifyRequest(req) {
  const signature = req.headers['x-hub-signature-256']
  const cronSecret = req.headers['x-cron-secret']
  if (signature) {
    const hmac = crypto.createHmac('sha256', FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return signature === `sha256=${digest}`
  }
  return cronSecret === CRON_SECRET
}

// ✅ 获取最新贴文
async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from}&access_token=${FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

// ✅ 判断留言是否处理过
async function isProcessed(commentId) {
  if (!commentId || typeof commentId !== 'string') return true
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

// ✅ 写入留言为已处理
async function markAsProcessed(commentId) {
  if (!commentId || typeof commentId !== 'string') return
  const { error } = await supabase
    .from(TABLE_NAME)
    .insert([{ comment_id: commentId }])
  if (error) console.error('⚠️ Supabase 写入失败:', error)
}

export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized（签名或 Cron 密钥无效）' })
  }

  const post = await getLatestPost()
  if (!post) return res.status(200).json({ message: '❌ 找不到最新贴文' })

  const comments = post.comments?.data || []

  // ✅ 判断是否已留言 System On（只留言一次）
  const hasSystemOn = comments.some(
    c => (c.message || '').toLowerCase().includes('system on') && c.from?.id === PAGE_ID
  )

  for (const comment of comments) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = (comment.message || '').toLowerCase()
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    // ✅ 关键词触发 System On（只一次）
    if (message.includes('on') || message.includes('开始')) {
      if (!hasSystemOn) {
        const response = await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            message: 'System On 晚上好，欢迎来到情人传奇🌿',
            access_token: FB_ACCESS_TOKEN,
          }),
        })
        const json = await response.json()
        if (json.error) console.error('❌ 留言失败:', json.error)
        else console.log('✅ 已留言 System On:', json.id)
      }
      await markAsProcessed(comment.id)
    }

    // ✅ zzz 留言触发 Webhook（只触发一次）
    if (message.includes('zzz')) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id }),
      })
      await markAsProcessed(comment.id)
    }
  }

  return res.status(200).json({ message: '✅ 系统运行完毕', post_id: post.id })
}
