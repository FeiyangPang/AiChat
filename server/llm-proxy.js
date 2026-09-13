import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, validateDeepSeekConfig } from '../src/utils/llm/providers.js'

const failure = (message, status = 502, code = 'UPSTREAM_ERROR') => Object.assign(new Error(message), { status, code })

const readBody = req => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  let rejected = false
  req.on('data', chunk => {
    if (rejected) return
    size += Buffer.byteLength(chunk)
    if (size > 2_000_000) {
      rejected = true
      reject(failure('请求内容过大', 413, 'INVALID_REQUEST'))
      return
    }
    chunks.push(Buffer.from(chunk))
  })
  req.on('end', () => {
    if (rejected) return
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
      resolve(body)
    } catch { reject(failure('请求格式错误', 400, 'INVALID_REQUEST')) }
  })
  req.on('aborted', () => reject(failure('请求已取消', 499, 'REQUEST_CANCELLED')))
  req.on('error', reject)
})

const sendJson = (res, status, data) => {
  if (res.destroyed || res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

const upstreamError = async response => {
  const raw = await response.text()
  try {
    const data = JSON.parse(raw)
    const message = data?.error?.message || data?.error || data?.message
    return typeof message === 'string' ? message : `DeepSeek 请求失败 (${response.status})`
  } catch {
    return `DeepSeek 请求失败 (${response.status})`
  }
}

export const requestPayload = (config, systemPrompt = '', messages = [], maxTokens = 4000, temperature = 0.8, stream = false) => {
  let fixedConfig
  try { fixedConfig = validateDeepSeekConfig(config) } catch (error) { throw Object.assign(error, { status: 400, code: 'INVALID_CONFIG' }) }
  if (typeof systemPrompt !== 'string' || !Array.isArray(messages) ||
    messages.some(message => !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
    throw failure('消息必须是 user / assistant 文本，系统设定请放在 systemPrompt', 400, 'INVALID_REQUEST')
  }
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 65536 ||
    !Number.isFinite(temperature) || temperature < 0 || temperature > 2 || typeof stream !== 'boolean') {
    throw failure('生成参数格式错误', 400, 'INVALID_REQUEST')
  }
  return {
    url: `${DEEPSEEK_BASE_URL}/chat/completions`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixedConfig.apiKey}` },
    body: {
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages.map(({ role, content }) => ({ role, content }))],
      max_tokens: maxTokens,
      temperature,
      thinking: { type: 'disabled' },
      stream,
    },
  }
}

export const extractText = (provider, data) => {
  if (provider !== 'deepseek') throw failure('本游戏仅支持 DeepSeek 官方 API', 400, 'INVALID_CONFIG')
  const text = data.choices?.[0]?.message?.content
  return typeof text === 'string' ? text : ''
}

export const extractStreamText = (provider, data) => {
  if (provider !== 'deepseek') throw failure('本游戏仅支持 DeepSeek 官方 API', 400, 'INVALID_CONFIG')
  const text = data.choices?.[0]?.delta?.content
  return typeof text === 'string' ? text : ''
}

const ensureComplete = reason => {
  if (reason === 'length') throw failure('回复达到长度上限，未完整生成。请重试或缩短本轮内容。', 502, 'OUTPUT_TRUNCATED')
  if (reason !== 'stop') throw failure(reason ? `模型未正常完成回复 (${reason})` : 'DeepSeek 回复提前结束，未收到完成状态', 502, 'OUTPUT_INCOMPLETE')
}

async function handleChat(req, res) {
  const { config = {}, systemPrompt = '', messages = [], maxTokens = 4000, temperature = 0.8, stream = false } = await readBody(req)
  const payload = requestPayload(config, systemPrompt, messages, maxTokens, temperature, stream)
  const upstreamController = new AbortController()
  const abortUpstream = () => upstreamController.abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; upstreamController.abort() }, 180000)
  res.once('close', abortUpstream)
  let reader
  try {
    const response = await fetch(payload.url, {
      method: 'POST',
      headers: payload.headers,
      body: JSON.stringify(payload.body),
      signal: upstreamController.signal,
      // A redirect must never send this game's requests to another endpoint.
      redirect: 'error',
    })
    if (!response.ok) throw failure(await upstreamError(response), response.status, 'UPSTREAM_ERROR')
    if (!stream) {
      const data = await response.json()
      if (data.error) throw failure(typeof data.error === 'string' ? data.error : data.error.message || 'DeepSeek 请求失败')
      const finishReason = data.choices?.[0]?.finish_reason
      ensureComplete(finishReason)
      const text = extractText('deepseek', data)
      if (!text.trim()) throw failure('模型返回内容为空', 502, 'EMPTY_RESPONSE')
      return sendJson(res, 200, { text, finishReason })
    }
    if (!response.body) throw failure('未收到流式响应', 502, 'STREAM_INCOMPLETE')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Accel-Buffering', 'no')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventData = []
    let receivedDone = false
    let finishReason = null
    let hasText = false
    const dispatchEvent = () => {
      if (!eventData.length) return
      const raw = eventData.join('\n').trim()
      eventData = []
      if (!raw) return
      if (receivedDone) throw failure('DeepSeek 完成标记后仍有数据', 502, 'STREAM_INVALID')
      if (raw === '[DONE]') { receivedDone = true; return }
      let data
      try { data = JSON.parse(raw) } catch { throw failure('DeepSeek 流式响应格式错误', 502, 'STREAM_INVALID') }
      if (data.error) throw failure(typeof data.error === 'string' ? data.error : data.error.message || 'DeepSeek 流式请求失败')
      const text = extractStreamText('deepseek', data)
      if (text) {
        hasText = true
        res.write(`${JSON.stringify({ text })}\n`)
      }
      const reason = data.choices?.[0]?.finish_reason
      if (reason) { finishReason = reason; ensureComplete(reason) }
    }
    const readLine = line => {
      const cleanLine = line.replace(/\r$/, '')
      if (!cleanLine) dispatchEvent()
      else if (cleanLine.startsWith('data:')) eventData.push(cleanLine.slice(5).trimStart())
    }
    while (true) {
      if (upstreamController.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) readLine(line)
      if (done) { readLine(buffer); dispatchEvent(); break }
    }
    if (!receivedDone) throw failure('DeepSeek 连接提前结束，请重试本轮', 502, 'STREAM_INCOMPLETE')
    ensureComplete(finishReason)
    if (!hasText) throw failure('模型返回内容为空', 502, 'EMPTY_RESPONSE')
    res.end(`${JSON.stringify({ done: true, finishReason })}\n`)
  } catch (error) {
    upstreamController.abort()
    if (timedOut) throw failure('DeepSeek 请求超时，请稍后重试', 504, 'REQUEST_TIMEOUT')
    throw error
  } finally {
    clearTimeout(timer)
    res.removeListener('close', abortUpstream)
    if (reader) {
      try { await reader.cancel() } catch { /* Upstream may already be closed. */ }
      reader.releaseLock()
    }
  }
}

const installProxy = server => {
  server.middlewares.use(async (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (!path?.startsWith('/api/llm/')) return next()
    if (req.method !== 'POST') return sendJson(res, 405, { error: '仅支持 POST 请求' })
    try {
      if (path === '/api/llm/chat') return await handleChat(req, res)
      return sendJson(res, 404, { error: '接口不存在；模型已固定为 DeepSeek V4.1 Flash' })
    } catch (error) {
      if (res.destroyed || res.writableEnded) return
      const data = { error: error.message || '本机代理请求失败', code: error.code || 'PROXY_ERROR' }
      if (res.headersSent) res.end(`${JSON.stringify(data)}\n`)
      else sendJson(res, error.status || 502, data)
    }
  })
}

export function llmProxyPlugin() {
  return {
    name: 'local-deepseek-proxy',
    configureServer: installProxy,
    configurePreviewServer: installProxy,
  }
}
