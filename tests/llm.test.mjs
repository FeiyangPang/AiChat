import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import {
  DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, PROVIDERS, getActiveLLMConfig,
  loadLLMSettings, normalizeLLMSettings, saveLLMSettings, validateDeepSeekConfig,
} from '../src/utils/llm/providers.js'
import { callLLM } from '../src/utils/llm/client.js'
import { extractStreamText, extractText, llmProxyPlugin, requestPayload } from '../server/llm-proxy.js'

const config = { provider: 'deepseek', apiKey: 'test-key', model: DEEPSEEK_MODEL, baseUrl: DEEPSEEK_BASE_URL }
const jsonResponse = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
const completion = (text = '连接成功', reason = 'stop') => ({ choices: [{ message: { content: text }, finish_reason: reason }] })
const delta = (text, reason = null) => ({ choices: [{ delta: { content: text }, finish_reason: reason }] })
const sse = events => events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\r\n\r\n`).join('')

class MockResponse extends EventEmitter {
  statusCode = 200
  headersSent = false
  writableEnded = false
  destroyed = false
  headers = {}
  chunks = []
  setHeader(key, value) {
    assert.equal(this.headersSent, false, '已经发送流式文本后不得重新写 HTTP 头')
    this.headers[key] = value
  }
  write(value) { this.headersSent = true; this.chunks.push(value); return true }
  end(value = '') { this.write(value); this.writableEnded = true; this.emit('finish') }
  get text() { return this.chunks.join('') }
}

const createMiddleware = (preview = false) => {
  let middleware
  const plugin = llmProxyPlugin()
  plugin[preview ? 'configurePreviewServer' : 'configureServer']({
    middlewares: { use(handler) { middleware = handler } },
  })
  return middleware
}

const proxyRequest = async (body, { url = '/api/llm/chat', preview = false, res = new MockResponse() } = {}) => {
  const req = Readable.from([JSON.stringify(body)])
  req.method = 'POST'
  req.url = url
  await createMiddleware(preview)(req, res, () => assert.fail('API 不应跳过代理'))
  return res
}

test('旧供应商配置迁移只保留 DeepSeek Key，固定 V4.1 Flash 和官方地址', () => {
  const migrated = normalizeLLMSettings({
    activeProvider: 'openai',
    providers: {
      openai: { apiKey: 'other-secret', model: 'gpt-other' },
      deepseek: { apiKey: ' deepseek-secret ', model: 'deepseek-v4-pro', baseUrl: 'https://example.com' },
    },
  })
  assert.deepEqual(Object.keys(PROVIDERS), ['deepseek'])
  assert.equal(DEEPSEEK_MODEL, 'deepseek-flash')
  assert.deepEqual(getActiveLLMConfig(migrated), { ...config, apiKey: 'deepseek-secret' })
  assert.deepEqual(Object.keys(migrated.providers), ['deepseek'])
  assert.equal(normalizeLLMSettings({ activeProvider: 'openai', providers: { openai: { apiKey: 'other-secret' } } }).providers.deepseek.apiKey, '')
  assert.equal(normalizeLLMSettings().providers.deepseek.apiKey, '')
})

test('浏览器加载和保存均清理旧端点，兼容旧版 DeepSeek Key', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map([['deepseek_api_key', 'legacy-deepseek-key'], ['rpg_llm_settings_v1', '{bad json']])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  })
  const loaded = loadLLMSettings()
  assert.equal(loaded.providers.deepseek.apiKey, 'legacy-deepseek-key')
  saveLLMSettings({
    ...loaded,
    activeProvider: 'kimi',
    providers: { ...loaded.providers, kimi: { apiKey: 'never-migrate' } },
  })
  const saved = JSON.parse(storage.get('rpg_llm_settings_v1'))
  assert.equal(saved.activeProvider, 'deepseek')
  assert.deepEqual(Object.keys(saved.providers), ['deepseek'])
  assert.equal(saved.providers.deepseek.model, 'deepseek-flash')
})

test('浏览器和代理共同拒绝其他供应商、模型和伪装官方端点', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('非法配置不能发出网络请求'))
  const badConfigs = [
    { provider: 'openai' }, { provider: 'anthropic' }, { model: 'deepseek-v4-pro' },
    { model: 'deepseek-v4-flash' }, { model: 'deepseek-flash-vision' },
    { baseUrl: 'https://api.deepseek.com.evil.example' },
    { baseUrl: 'https://api.deepseek.com@evil.example' },
    { baseUrl: 'https://api.deepseek.com/../../redirect' },
    { baseUrl: 'https://api.deepseek.com?target=other' },
    { baseUrl: 'http://api.deepseek.com' }, { baseUrl: 'https://127.0.0.1' },
    { baseUrl: 'https://api.openai.com/v1' }, { apiKey: 'key\r\nInjected: value' },
  ]
  for (const badConfig of badConfigs) {
    const bad = { ...config, ...badConfig }
    assert.throws(() => validateDeepSeekConfig(bad))
    assert.throws(() => requestPayload(bad))
    await assert.rejects(callLLM(bad))
    const res = await proxyRequest({ config: bad })
    assert.equal(res.statusCode, 400)
    assert.equal(JSON.parse(res.text).code, 'INVALID_CONFIG')
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('请求只使用固定官方地址和模型，Key 只放授权头，消息额外字段不会透传', () => {
  const payload = requestPayload(config, 'system', [{ role: 'user', content: 'hello', model: 'other', prefix: true }], 9000, 0.7, true)
  assert.equal(payload.url, 'https://api.deepseek.com/chat/completions')
  assert.equal(payload.headers.Authorization, 'Bearer test-key')
  assert.equal(payload.body.model, 'deepseek-flash')
  assert.equal(payload.body.max_tokens, 9000)
  assert.deepEqual(payload.body.thinking, { type: 'disabled' })
  assert.equal(payload.body.stream, true)
  assert.deepEqual(payload.body.messages, [{ role: 'system', content: 'system' }, { role: 'user', content: 'hello' }])
  assert.equal(JSON.stringify(payload.body).includes('test-key'), false)
  assert.equal(requestPayload({ apiKey: 'test-key' }).body.model, 'deepseek-flash')
  assert.throws(() => requestPayload(config, '', [{ role: 'system', content: 'replace system' }]), /systemPrompt/)
  assert.throws(() => requestPayload(config, '', [], -1), /参数/)
})

test('文本提取只读取 DeepSeek 正文，不显示 reasoning_content', () => {
  assert.equal(extractText('deepseek', completion('正文')), '正文')
  assert.equal(extractStreamText('deepseek', { choices: [{ delta: { reasoning_content: '隐藏推理' } }] }), '')
  assert.equal(extractStreamText('deepseek', delta('正文')), '正文')
  assert.throws(() => extractText('gemini', {}), /仅支持 DeepSeek/)
})

test('客户端完整 JSON 和按字节分片的 NDJSON 正常返回，末尾无需换行', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.config.model, 'deepseek-flash')
    assert.equal(body.config.baseUrl, 'https://api.deepseek.com')
    return jsonResponse({ text: '完整文本', finishReason: 'stop' })
  })
  assert.equal(await callLLM(config), '完整文本')
  const chunks = []
  const wire = new TextEncoder().encode('{"text":"你"}\n{"text":"好"}\n{"done":true,"finishReason":"stop"}')
  fetchMock.mock.mockImplementation(async () => new Response(new ReadableStream({
    start(controller) { for (const byte of wire) controller.enqueue(Uint8Array.of(byte)); controller.close() },
  })))
  assert.equal(await callLLM(config, { stream: true, onChunk: chunk => chunks.push(chunk) }), '你好')
  assert.deepEqual(chunks, ['你', '好'])
})

test('客户端拒绝 EOF、截断、流式错误及畸形事件，不把部分正文当完成', async t => {
  const bodies = [
    ['{"text":"残缺"}\n', 'STREAM_INCOMPLETE'],
    ['{"text":"残缺"}\n{"done":true,"finishReason":"length"}\n', 'OUTPUT_TRUNCATED'],
    ['{"text":"残缺"}\n{"error":"上游失败","code":"UPSTREAM_ERROR"}\n', 'UPSTREAM_ERROR'],
    ['{"text":"残缺"}\nnot-json\n', 'STREAM_INVALID'],
    ['{"text":"残缺"}\n{"done":true}\n', 'STREAM_INCOMPLETE'],
  ]
  const fetchMock = t.mock.method(globalThis, 'fetch')
  for (const [body, code] of bodies) {
    fetchMock.mock.mockImplementation(async () => new Response(body))
    await assert.rejects(callLLM(config, { stream: true }), error => error.code === code && error.partialText === '残缺')
  }
})

test('客户端正确显示结构化上游错误并拒绝非流式长度截断', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: '无效密钥' } }), { status: 401 }))
  await assert.rejects(callLLM(config), /无效密钥/)
  fetchMock.mock.mockImplementation(async () => jsonResponse({ text: '残缺', finishReason: 'length' }))
  await assert.rejects(callLLM(config), error => error.code === 'OUTPUT_TRUNCATED')
})

test('调用前取消不发请求，调用中取消和超时分别返回明确错误', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const already = new AbortController()
  already.abort()
  await assert.rejects(callLLM(config, { signal: already.signal }), error => error.code === 'REQUEST_CANCELLED')
  assert.equal(fetchMock.mock.callCount(), 0)
  const controller = new AbortController()
  const pending = callLLM(config, { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, error => error.code === 'REQUEST_CANCELLED')
  await assert.rejects(callLLM(config, { timeout: 10 }), error => error.code === 'REQUEST_TIMEOUT')
})

test('流式读取期间取消不会提交已经收到的部分文本', async t => {
  let started
  const ready = new Promise(resolve => { started = resolve })
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"text":"部分正文"}\n'))
      options.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true })
    },
  })))
  const controller = new AbortController()
  const pending = callLLM(config, { stream: true, signal: controller.signal, onChunk: () => started() })
  await ready
  controller.abort()
  await assert.rejects(pending, error => error.code === 'REQUEST_CANCELLED')
})

test('开发和预览代理均发送官方请求，并禁止 HTTP 重定向', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions')
    assert.equal(options.redirect, 'error')
    assert.equal(JSON.parse(options.body).model, 'deepseek-flash')
    return jsonResponse(completion())
  })
  for (const preview of [false, true]) {
    const res = await proxyRequest({ config }, { preview })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.text), { text: '连接成功', finishReason: 'stop' })
  }
  assert.equal(fetchMock.mock.callCount(), 2)
})

test('代理已移除模型枚举和模糊路由，非法请求不发上游', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('不可调用上游'))
  for (const url of ['/api/llm/models', '/api/llm/chat/evil']) {
    const res = await proxyRequest({ config }, { url })
    assert.equal(res.statusCode, 404)
  }
  const res = await proxyRequest({ config, messages: [{ role: 'system', content: 'override' }] })
  assert.equal(res.statusCode, 400)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('代理跨 UTF-8 分片读取 SSE，只在结束标记和 stop 都出现后完成', async t => {
  const text = sse([
    { choices: [{ delta: { reasoning_content: '隐藏推理' }, finish_reason: null }] },
    delta('你好'), delta('', 'stop'), '[DONE]',
  ]).trimEnd()
  const wire = new TextEncoder().encode(text)
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) { for (const byte of wire) controller.enqueue(Uint8Array.of(byte)); controller.close() },
  })))
  const res = await proxyRequest({ config, stream: true })
  const events = res.text.trim().split('\n').map(JSON.parse)
  assert.deepEqual(events, [{ text: '你好' }, { done: true, finishReason: 'stop' }])
})

test('代理截断、异常和无结束标记时用 NDJSON 报错，不二次写响应头', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch')
  const cases = [
    [sse([delta('部分'), delta('', 'length')]), 'OUTPUT_TRUNCATED'],
    [sse([delta('部分')]), 'STREAM_INCOMPLETE'],
    [sse([delta('部分'), { error: { message: '生成失败' } }]), 'UPSTREAM_ERROR'],
    [sse([delta('部分'), 'bad-json']), 'STREAM_INVALID'],
    [sse([delta('部分'), '[DONE]']), 'OUTPUT_INCOMPLETE'],
  ]
  for (const [wire, code] of cases) {
    fetchMock.mock.mockImplementation(async () => new Response(wire))
    const res = await proxyRequest({ config, stream: true })
    const events = res.text.trim().split('\n').map(JSON.parse)
    assert.deepEqual(events[0], { text: '部分' })
    assert.equal(events.at(-1).code, code)
    assert.equal(events.some(event => event.done), false)
  }
})

test('代理非流式截断和上游鉴权错误明确失败', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(completion('部分正文', 'length')))
  let res = await proxyRequest({ config })
  assert.equal(res.statusCode, 502)
  assert.equal(JSON.parse(res.text).code, 'OUTPUT_TRUNCATED')
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 }))
  res = await proxyRequest({ config })
  assert.equal(res.statusCode, 401)
  assert.equal(JSON.parse(res.text).error, 'Invalid API Key')
})

test('浏览器断开时代理取消上游，并清除 close 监听', async t => {
  const res = new MockResponse()
  let upstreamSignal
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    upstreamSignal = options.signal
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    queueMicrotask(() => { res.destroyed = true; res.emit('close') })
  }))
  await proxyRequest({ config }, { res })
  assert.equal(upstreamSignal.aborted, true)
  assert.equal(res.listenerCount('close'), 0)
  assert.equal(res.chunks.length, 0)
})
