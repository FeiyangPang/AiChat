export const DEEPSEEK_PROVIDER = 'deepseek'
export const DEEPSEEK_MODEL = 'deepseek-flash'
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const SETTINGS_KEY = 'rpg_llm_settings_v1'

export const PROVIDERS = Object.freeze({
  deepseek: Object.freeze({
    id: DEEPSEEK_PROVIDER,
    name: 'DeepSeek',
    baseUrl: DEEPSEEK_BASE_URL,
    defaultModel: DEEPSEEK_MODEL,
  }),
})

export const DEFAULT_LLM_SETTINGS = Object.freeze({
  activeProvider: DEEPSEEK_PROVIDER,
  providers: Object.freeze({
    deepseek: Object.freeze({ apiKey: '', model: DEEPSEEK_MODEL, baseUrl: DEEPSEEK_BASE_URL }),
  }),
})

// Only a key explicitly saved for DeepSeek may survive migration.
export const normalizeLLMSettings = settings => ({
  activeProvider: DEEPSEEK_PROVIDER,
  providers: {
    deepseek: {
      apiKey: typeof settings?.providers?.deepseek?.apiKey === 'string'
        ? settings.providers.deepseek.apiKey.trim()
        : '',
      model: DEEPSEEK_MODEL,
      baseUrl: DEEPSEEK_BASE_URL,
    },
  },
})

export const loadLLMSettings = () => {
  try {
    let saved
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') } catch { saved = null }
    const settings = normalizeLLMSettings(saved)
    if (!settings.providers.deepseek.apiKey) {
      settings.providers.deepseek.apiKey = (localStorage.getItem('deepseek_api_key') || '').trim()
    }
    // Write the migration back so old providers and custom endpoints are removed.
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* Storage may be read-only. */ }
    return settings
  } catch {
    return normalizeLLMSettings()
  }
}

export const saveLLMSettings = settings => {
  const normalized = normalizeLLMSettings(settings)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
  return normalized
}

export const getActiveLLMConfig = settings => ({
  provider: DEEPSEEK_PROVIDER,
  ...normalizeLLMSettings(settings).providers.deepseek,
})

// Shared by browser and local proxy; incoming requests cannot select another service.
export const validateDeepSeekConfig = (config = {}) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('DeepSeek 配置格式错误')
  if (config.provider !== undefined && config.provider !== DEEPSEEK_PROVIDER) {
    throw new Error('本游戏仅支持 DeepSeek 官方 API')
  }
  if (config.model !== undefined && config.model !== DEEPSEEK_MODEL) {
    throw new Error(`模型固定为 ${DEEPSEEK_MODEL}`)
  }
  if (config.baseUrl !== undefined && config.baseUrl !== DEEPSEEK_BASE_URL && config.baseUrl !== `${DEEPSEEK_BASE_URL}/`) {
    throw new Error('API 地址固定为 https://api.deepseek.com')
  }
  if (typeof config.apiKey !== 'string' || !config.apiKey.trim()) throw new Error('请先配置 DeepSeek API Key')
  if (/[\r\n]/.test(config.apiKey)) throw new Error('DeepSeek API Key 格式错误')
  return { provider: DEEPSEEK_PROVIDER, model: DEEPSEEK_MODEL, baseUrl: DEEPSEEK_BASE_URL, apiKey: config.apiKey.trim() }
}
