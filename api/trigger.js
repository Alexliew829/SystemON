// pages/api/trigger.js
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'

export const config = {
  api: {
    bodyParser: false,
  },
}

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

// ...省略中间内容保持不变...

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
    // ✅ 使用动态导入 raw-body
    const { default: getRawBody } = await import('raw-body')
    const rawBody = await getRawBody(req)

    if (!verifyRequest(req, rawBody)) {
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
