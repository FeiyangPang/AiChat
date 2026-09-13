import { validateDeepSeekConfig } from './providers.js'

const responseError = (message, code) => Object.assign(new Error(message), code ? { code } : {})
const errorMessage = (data, fallback) => typeof data?.error === 'string'
  ? data.error : data?.error?.message || data?.message || fallback

const readError = async response => {
  const data = await response.json().catch(() => ({}))
  return responseError(errorMessage(data, `请求失败 (${response.status})`), data.code)
}

const checkFinishReason = reason => {
  if (reason === 'length') throw responseError('回复达到长度上限，未完整生成。请重试或缩短本轮内容。', 'OUTPUT_TRUNCATED')
  if (reason && reason !== 'stop') throw responseError(`模型未正常完成回复 (${reason})`, 'OUTPUT_INCOMPLETE')
}

export async function callLLM(config, {
  systemPrompt = '',
  messages = [],
  maxTokens = 4000,
  temperature = 0.8,
  signal,
  timeout = 180000,
  stream = false,
  onChunk,
} = {}) {
  const fixedConfig = validateDeepSeekConfig(config)
  if (signal?.aborted) throw responseError('请求已取消', 'REQUEST_CANCELLED')
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let reader
  let fullText = ''
  try {
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ config: fixedConfig, systemPrompt, messages, maxTokens, temperature, stream }),
    })
    if (!response.ok) throw await readError(response)

    if (!stream) {
      const data = await response.json()
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (data.error) throw responseError(errorMessage(data, 'DeepSeek 请求失败'), data.code)
      checkFinishReason(data.finishReason)
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('模型返回内容为空')
      return data.text
    }
    if (!response.body) throw responseError('未收到流式响应', 'STREAM_INCOMPLETE')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let completed = false
    const readLine = line => {
      if (!line.trim()) return
      let event
      try { event = JSON.parse(line) } catch { throw responseError('流式响应格式错误，请重试', 'STREAM_INVALID') }
      if (event.error) throw responseError(errorMessage(event, 'DeepSeek 请求失败'), event.code)
      if (completed) throw responseError('流式响应完成后仍有额外数据', 'STREAM_INVALID')
      if (event.text !== undefined) {
        if (typeof event.text !== 'string') throw responseError('流式文本格式错误', 'STREAM_INVALID')
        fullText += event.text
        onChunk?.(event.text, fullText)
      }
      if (event.done) {
        checkFinishReason(event.finishReason)
        if (event.finishReason !== 'stop') throw responseError('模型未返回完整结束状态，请重试', 'STREAM_INCOMPLETE')
        completed = true
      }
    }
    while (true) {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) readLine(line)
      if (done) { readLine(buffer); break }
    }
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!completed) throw responseError('连接提前结束，回复不完整。请重试本轮。', 'STREAM_INCOMPLETE')
    if (!fullText.trim()) throw new Error('模型返回内容为空')
    return fullText
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') {
      throw responseError(signal?.aborted ? '请求已取消' : timedOut ? '请求超时，请稍后重试' : '连接已中断，请重试', signal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT')
    }
    if (fullText) error.partialText = fullText
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    if (reader) {
      try { await reader.cancel() } catch { /* Network may already be closed. */ }
      reader.releaseLock()
    }
  }
}

export async function testLLM(config, options = {}) {
  return callLLM(config, {
    systemPrompt: '你是连接测试助手。',
    messages: [{ role: 'user', content: '只回复“连接成功”' }],
    maxTokens: 64,
    temperature: 0,
    timeout: 30000,
    signal: options.signal,
  })
}
