import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
const TABLE_NAME = 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

function verifyRequest(req) {
  const signature = req.headers['x-hub-signature-256']
  const cronSecret = req.headers['x-cron-secret']
  const expectedCron = process.env.CRON_SECRET

  if (signature) {
    const hmac = crypto.createHmac('sha256', process.env.FB_APP_SECRET)
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex')
    return signature === `sha256=${digest}`
  }

  return cronSecret === expectedCron
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

async function hasSystemOnComment(comments) {
  return comments?.some(
    c => c.message?.includes('System On') && c.from?.id === PAGE_ID
  )
}

function isWithinMinutes(createdTime, minutes) {
  const created = new Date(createdTime).getTime()
  const now = Date.now()
  return now - created < minutes * 60 * 1000
}

async function processComments({ forceSystemOn = false } = {}) {
  const post = await getLatestPost()
  if (!post || !post.id) {
    return { message: '⚠️ 无贴文可处理。' }
  }

  const within30Min = isWithinMinutes(post.created_time, 30)
  const comments = post.comments?.data || []
  const alreadyHasSystemOn = await hasSystemOnComment(comments)

  if (!alreadyHasSystemOn && within30Min) {
    await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
      method: 'POST',
      body: new URLSearchParams({
        message: 'System On 晚上好，欢迎来到情人传奇🌿',
        access_token: process.env.FB_ACCESS_TOKEN,
      }),
    })
    return { message: '✅ 已留言 System On', post_id: post.id }
  }

  if (!alreadyHasSystemOn) {
    return { message: '✅ 系统正常运行，但暂无留言或贴文已过期。', post_id: post.id }
  }

  let triggerCount = 0
  let responseMessages = []

  for (const comment of comments) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    if (message.includes('zzz')) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, comment_id: comment.id }),
      })
      await markAsProcessed(comment.id)
      responseMessages.push(`✅ “zzz”留言已触发 Webhook`)
      triggerCount++
    }
  }

  return triggerCount > 0
    ? { triggered: triggerCount, post_id: post.id, logs: responseMessages }
    : { message: '✅ 系统运行正常，但无有效留言匹配关键词。', post_id: post.id }
}

export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized（缺少签名或 Cron 密钥）' })
  }

  try {
    const result = await processComments()
    res.status(200).json(result)
  } catch (err) {
    console.error('执行出错:', err)
    res.status(500).json({ error: err.message })
  }
}
