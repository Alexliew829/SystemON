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

// 验证请求合法性
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

// 获取主页最新贴文
async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(100){id,message,from,created_time}&access_token=${FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

// 检查是否已处理过该留言
async function isZZZProcessed(commentId) {
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id, message')
    .eq('comment_id', commentId)
    .eq('message', 'zzz') // 关键修改：只检查 zzz 记录
  return data?.length > 0
}

// 标记为已处理
async function markZZZAsProcessed(commentId) {
  await supabase
    .from(TABLE_NAME)
    .insert([{ 
      comment_id: commentId,
      message: 'zzz' // 关键修改：固定存储 zzz 标识
    }])
}

export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  const post = await getLatestPost()
  if (!post) return res.status(200).json({ message: '❌ 找不到最新贴文' })

  let triggeredCount = 0
  const details = []

  for (const comment of post.comments?.data || []) {
    const isFromPage = comment.from?.id === PAGE_ID
    const isZZZ = comment.message?.toLowerCase().trim() === 'zzz'

    // 只处理主页的 zzz 留言
    if (isFromPage && isZZZ) {
      const alreadyProcessed = await isZZZProcessed(comment.id)

      if (!alreadyProcessed) {
        // 触发 Make 倒数
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          body: JSON.stringify({
            comment_id: comment.id,
            triggered_at: new Date().toISOString()
          })
        })

        // 永久记录
        await markZZZAsProcessed(comment.id)
        triggeredCount++
        details.push(`✅ 触发 zzz 倒数 (${comment.id})`)
      } else {
        details.push(`⏭ 已处理过 (${comment.id})`)
      }
    }
  }

  res.status(200).json({
    message: triggeredCount > 0 ? '有新增触发' : '无新增触发',
    triggered_count: triggeredCount,
    details
  })
}
