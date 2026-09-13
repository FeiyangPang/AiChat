import React, { useEffect, useRef, useState } from 'react'
import './ConfigModal.css'
import { generateWorldBook, optimizeWorldBook, generateRoleDescription } from '../utils/worldBookGenerator'
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, getActiveLLMConfig, normalizeLLMSettings } from '../utils/llm/providers'
import { testLLM } from '../utils/llm/client'

function ConfigModal({
  type, isOpen, onClose, onSave, initialValue, apiKey, llmConfig, initialRoleDescription,
}) {
  const [value, setValue] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isGeneratingRole, setIsGeneratingRole] = useState(false)
  const [optimizeInstruction, setOptimizeInstruction] = useState('')
  const [showOptimizeInput, setShowOptimizeInput] = useState(false)
  const [settings, setSettings] = useState(() => normalizeLLMSettings(initialValue))
  const [isTesting, setIsTesting] = useState(false)
  const [modelStatus, setModelStatus] = useState('')
  const abortRef = useRef(null)
  const busy = isGenerating || isOptimizing || isGeneratingRole || isTesting
  const activeConfig = getActiveLLMConfig(settings)

  useEffect(() => {
    if (!isOpen) return
    if (type === 'api') {
      setSettings(normalizeLLMSettings(initialValue))
      setModelStatus('')
    } else {
      setValue(initialValue || '')
    }
    setRoleDescription(initialRoleDescription || '')
    setOptimizeInstruction('')
    setShowOptimizeInput(false)
  }, [isOpen, type, initialValue, initialRoleDescription])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!isOpen) return null

  const updateActiveConfig = patch => {
    setSettings(current => normalizeLLMSettings({
      providers: { deepseek: { ...current.providers.deepseek, apiKey: patch.apiKey } },
    }))
    setModelStatus('')
  }

  const testConnection = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setIsTesting(true)
    setModelStatus('正在测试连接...')
    try {
      await testLLM(activeConfig, { signal: controller.signal })
      setModelStatus('DeepSeek V4.1 Flash 连接成功')
    } catch (error) {
      setModelStatus(`连接失败：${error.message}`)
    } finally {
      setIsTesting(false)
      abortRef.current = null
    }
  }

  const handleSave = () => {
    if (type === 'api') {
      if (!activeConfig.apiKey?.trim()) return alert('请输入 DeepSeek API Key')
      onSave(normalizeLLMSettings(settings))
    } else if (type === 'role') {
      if (!value.trim()) return alert('请输入角色名称')
      onSave({ name: value.trim(), description: roleDescription.trim() })
    } else {
      onSave(value)
    }
    onClose()
  }

  const startTask = async (setter, task) => {
    const controller = new AbortController()
    abortRef.current = controller
    setter(true)
    try {
      await task(controller.signal)
    } catch (error) {
      if (error.message !== '请求已取消') alert(error.message || '生成失败')
    } finally {
      setter(false)
      abortRef.current = null
    }
  }

  const handleGenerateWorldBook = () => {
    const original = value.trim()
    return startTask(setIsGenerating, async signal => {
      setValue('')
      await generateWorldBook(llmConfig, original, {
        signal,
        stream: true,
        onChunk: (_chunk, full) => setValue(full),
      })
    })
  }

  const handleOptimizeWorldBook = () => {
    if (!value.trim()) return alert('请先输入或生成世界书')
    if (!optimizeInstruction.trim()) return alert('请输入优化指令')
    const original = value
    startTask(setIsOptimizing, async signal => {
      setValue('')
      await optimizeWorldBook(llmConfig, original, optimizeInstruction, {
        signal,
        stream: true,
        onChunk: (_chunk, full) => setValue(full),
      })
      setOptimizeInstruction('')
      setShowOptimizeInput(false)
    })
  }

  const handleGenerateRole = () => startTask(setIsGeneratingRole, async signal => {
    const generated = await generateRoleDescription(llmConfig, value.trim(), roleDescription.trim(), { signal })
    setRoleDescription(generated)
  })

  const title = {
    api: '配置 DeepSeek API',
    worldbook: '配置世界书',
    role: '选择角色',
  }[type] || '配置'

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="modal-body">
          {type === 'api' && settings && (
            <div className="api-config-grid">
              <div className="fixed-model-info">
                <strong>DeepSeek V4.1 Flash</strong>
                <span>模型：{DEEPSEEK_MODEL}</span>
                <span>官方接口：{DEEPSEEK_BASE_URL}</span>
              </div>
              <div className="input-group">
                <label htmlFor="deepseek-api-key">DeepSeek API Key</label>
                <input
                  id="deepseek-api-key"
                  className="modal-input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={activeConfig.apiKey || ''}
                  onChange={e => updateActiveConfig({ apiKey: e.target.value })}
                  disabled={busy}
                  placeholder="仅保存在此浏览器本地"
                />
                <p className="hint">游戏、世界书和角色生成统一使用 DeepSeek V4.1 Flash。</p>
              </div>
              <button type="button" className="btn-test-api" onClick={testConnection} disabled={busy || !activeConfig.apiKey}>
                {isTesting ? '正在测试...' : '测试连接'}
              </button>
              {isTesting && <button type="button" className="btn-abort" onClick={() => abortRef.current?.abort()}>取消测试</button>}
              <p className="hint" role="status">{modelStatus}</p>
            </div>
          )}

          {type === 'worldbook' && (
            <div className="input-group">
              <div className="worldbook-actions">
                <label>世界书内容</label>
                {apiKey && (
                  <div className="worldbook-buttons">
                    <button className="btn-generate" disabled={busy} onClick={handleGenerateWorldBook}>
                      {isGenerating ? '正在流式生成...' : 'AI生成世界书'}
                    </button>
                    <button className="btn-optimize" disabled={busy || !value.trim()} onClick={() => setShowOptimizeInput(!showOptimizeInput)}>
                      {showOptimizeInput ? '取消优化' : 'AI优化世界书'}
                    </button>
                  </div>
                )}
              </div>
              {showOptimizeInput && (
                <div className="optimize-section">
                  <label>优化指令</label>
                  <textarea
                    className="modal-textarea optimize-input"
                    rows="4"
                    value={optimizeInstruction}
                    onChange={e => setOptimizeInstruction(e.target.value)}
                    placeholder="例如：补全魔法体系的代价与限制。除非明确要求，否则 AI 不会设计后续剧情。"
                  />
                  <button className="btn-optimize-confirm" disabled={busy} onClick={handleOptimizeWorldBook}>确认优化</button>
                </div>
              )}
              <textarea
                className="modal-textarea"
                rows="15"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="描述世界规则、角色、地点和当前处境。AI会补全世界逻辑，但后续剧情由玩家主导。"
                disabled={busy}
              />
              {busy && <button type="button" className="btn-abort" onClick={() => abortRef.current?.abort()}>取消生成</button>}
              <p className="hint">使用 DeepSeek V4.1 Flash，生成内容会逐步显示。</p>
            </div>
          )}

          {type === 'role' && (
            <>
              <div className="input-group">
                <label>角色名称 *</label>
                <input className="modal-input" value={value} onChange={e => setValue(e.target.value)} disabled={busy} />
              </div>
              <div className="input-group">
                <div className="worldbook-actions">
                  <label>角色详细描述（可选）</label>
                  {apiKey && <button className="btn-generate" disabled={busy} onClick={handleGenerateRole}>AI生成角色描述</button>}
                </div>
                <textarea className="modal-textarea" rows="12" value={roleDescription} onChange={e => setRoleDescription(e.target.value)} disabled={busy} />
                {busy && <button type="button" className="btn-abort" onClick={() => abortRef.current?.abort()}>取消生成</button>}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel" disabled={busy}>取消</button>
          <button onClick={handleSave} className="btn-save" disabled={busy}>保存</button>
        </div>
      </div>
    </div>
  )
}

export default ConfigModal

