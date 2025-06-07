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

async function getLatestPost() {
  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?fields=id,created_time,comments.limit(20){id,message,from,created_time}&access_token=${FB_ACCESS_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.[0] || null
}

async function isProcessed(commentId) {
  if (!commentId || typeof commentId !== 'string') return true
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('comment_id')
    .eq('comment_id', commentId)
  return data && data.length > 0
}

// ✅ 修改后的 markAsProcessed，可记录 comment_id、post_id、type
async function markAsProcessed(commentId, postId = null, type = null) {
  if (!commentId || typeof commentId !== 'string') {
    console.error('❌ 无效的 commentId，写入失败:', commentId)
    return
  }
  const { error } = await supabase
    .from(TABLE_NAME)
    .insert([{ comment_id: commentId, post_id: postId, type: type }])
  if (error) console.error('⚠️ Supabase 写入失败:', error)
}

export default async function handler(req, res) {
  if (!verifyRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized（签名或 Cron 密钥无效）' })
  }

  const post = await getLatestPost()
  if (!post) return res.status(200).json({ message: '❌ 找不到最新贴文' })

  const comments = post.comments?.data || []
  const hasSystemOn = comments.some(
    c => (c.message || '').toLowerCase().includes('system on') && c.from?.id === PAGE_ID
  )

  let triggeredSystemOn = false
  let triggeredZzz = 0
  let zzzTriggeredThisRun = false
  let details = []

  for (const comment of comments) {
    if (!comment || !comment.id || typeof comment.id !== 'string') {
      console.error('❌ 无效评论，跳过该条:', comment)
      continue
    }

    const commentId = comment.id
    const message = (comment.message || '').toLowerCase()
    const isFromPage = comment.from?.id === PAGE_ID

    // ✅ System On 关键词触发（仅主页）
    if (isFromPage && (message.includes('on') || message.includes('开始'))) {
      const alreadyProcessed = await isProcessed(commentId)
      if (!alreadyProcessed) {
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
          if (json.error) {
            details.push('❌ 留言失败 System On')
          } else {
            details.push('✅ 触发留言 System On')
            triggeredSystemOn = true
          }
        } else {
          details.push('✅ 已留言过 System On，不重复触发')
        }
        await markAsProcessed(commentId, post.id, 'system_on')
      } else {
        details.push(`⏭ 已跳过重复 System On 留言 ID ${commentId}`)
      }
      continue
    }

    // ✅ zzz 留言触发倒数（仅主页），每次访问只触发一次
    if (!zzzTriggeredThisRun && isFromPage && message.includes('zzz')) {
      const alreadyProcessed = await isProcessed(commentId)
      if (!alreadyProcessed) {
        console.log('准备触发 zzz，留言 ID:', commentId)
        await markAsProcessed(commentId, post.id, 'zzz')
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: post.id, comment_id: commentId }),
        })
        triggeredZzz++
        zzzTriggeredThisRun = true
        details.push(`✅ 已触发倒数：zzz 留言 ID ${commentId}`)
      } else {
        details.push(`⏭ 已跳过重复的 zzz 留言 ID ${commentId}`)
      }
    }
  }

  const responseMessage =
    triggeredSystemOn || triggeredZzz > 0
      ? '✅ 系统运行完毕'
      : '✅ 系统运行完毕，没有匹配留言'

  return res.status(200).json({
    message: responseMessage,
    details,
    post_id: post.id,
    triggered: {
      system_on: triggeredSystemOn,
      zzz_triggered: triggeredZzz,
    },
  })
}
