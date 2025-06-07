import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

// ✅ 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const TABLE_NAME = 'triggered_comments'
const PAGE_ID = process.env.PAGE_ID

// ✅ 验证请求：支持 webhook 签名 或 EasyCron 密钥
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

// ✅ 获取最新贴文（包含留言）
async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from}&access_token=${process.env.FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

// ✅ 判断留言是否已处理过
async function isProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data.length > 0
}

// ✅ 标记留言为已处理
async function markAsProcessed(commentId) {
  await supabase.from(TABLE_NAME).insert([{ comment_id: commentId }])
}

// ✅ 核心逻辑
async function processComments() {
  const post = await getLatestPost()
  if (!post) {
    return { message: '❌ 找不到最新贴文' }
  }

  const comments = post.comments?.data || []

  // ✅ 自动留言一次 System On（不重复）
  const hasSystemOn = comments.some(
    c => c.message?.toLowerCase().includes('system on') && c.from?.id === PAGE_ID
  )

  if (!hasSystemOn) {
    await fetch(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
      method: 'POST',
      body: new URLSearchParams({
        message: 'System On 晚上好，欢迎来到情人传奇🌿',
        access_token: process.env.FB_ACCESS_TOKEN,
      }),
    })

    return {
      message: '✅ 系统正常运行，已自动留言 System On',
      post_id: post.id,
    }
  }

  // ✅ 检查是否有新的 zzz 留言（主页身份，未处理）
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

  if (triggerCount > 0) {
    return {
      message: `✅ 触发 ${triggerCount} 条 “zzz” 留言`,
      post_id: post.id,
      logs: responseMessages,
    }
  } else {
    return {
      message: '✅ 系统运行正常，已留言 System On，无新留言需触发',
      post_id: post.id,
    }
  }
}

// ✅ 主入口函数（Vercel API）
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
