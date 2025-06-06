import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const TABLE_NAME = 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

// 验证请求（签名 or CRON_SECRET or debug）
function verifyRequest(req) {
  const signature = req.headers['x-hub-signature-256']
  const cronSecret = req.headers['cron_secret']
  const bypass = req.query.debug === 'true'

  if (signature) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.FB_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex')
    return signature === expected
  }

  if (cronSecret && cronSecret === process.env.FB_VERIFY_TOKEN) return true
  if (bypass) return true

  return false
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

async function markAsProcessed(commentId, postId) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .insert([{ comment_id: commentId, post_id: postId }])
  if (error) console.error('❌ Supabase insert error:', error)
}

async function processComments() {
  const post = await getLatestPost()
  if (!post || !post.comments?.data?.length) {
    return { message: 'No post comments found – system running.', post_id: post?.id || null }
  }

  let triggerCount = 0

  for (const comment of post.comments.data) {
    const isFromPage = comment.from?.id === PAGE_ID
    const message = comment.message?.toLowerCase() || ''
    const alreadyProcessed = await isProcessed(comment.id)

    if (!isFromPage || alreadyProcessed) continue

    // ✅ 留言 on / 开始 / 晚上好 → 回复欢迎语
    if (message.includes('开始') || message.includes('on') || message.includes('晚上好')) {
      await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
        method: 'POST',
        body: new URLSearchParams({
          message: 'System On 晚上好，欢迎来到情人传奇🌿',
          access_token: process.env.FB_ACCESS_TOKEN
        })
      })
      await markAsProcessed(comment.id, post.id)
      triggerCount++
    }

    // ✅ 留言 zzz → 触发 Make Webhook
    if (message.includes('zzz')) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          comment_id: comment.id
        })
      })
      await markAsProcessed(comment.id, post.id)
      triggerCount++
    }
  }

  return triggerCount > 0
    ? { triggered: triggerCount, post_id: post.id }
    : { message: 'Invalid comments. No trigger matched.', post_id: post.id }
}

export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized (missing valid signature or cron secret)' })
  }

  try {
    const result = await processComments()
    res.status(200).json(result)
  } catch (err) {
    console.error('❌ Error in handler:', err)
    res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
