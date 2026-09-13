import React, { useState, useRef, useEffect } from 'react'
import './GamePlay.css'
import ConfigModal from './ConfigModal'
import MemoryTablePanel from './MemoryTablePanel'
import StatusBar from './StatusBar'
import { callDeepseekAPI } from '../utils/api'
import { getMemoryStore } from '../utils/memory/memory-store'
import { getStatusStore } from '../utils/memory/status-store'
import { captureTurnState, restoreTurnState, applyTurnResponse } from '../utils/memory/turn-state'
import { buildStoryPrompt } from '../utils/story-prompt'
import { loadGameSession, saveGameSession } from '../utils/game-session'
import { generateWorldBookAndOpening } from '../utils/worldBookGenerator'
import { getActiveLLMConfig } from '../utils/llm/providers'

function GamePlay({ llmSettings, worldBook, role, onApiChange, onWorldBookChange, onRoleChange }) {
  const [initialSession] = useState(() => loadGameSession())
  const [messages, setMessages] = useState(() => initialSession?.messages || [])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messageMode, setMessageMode] = useState(initialSession?.messageMode || 'long')
  const [configModal, setConfigModal] = useState({ type: null, isOpen: false })
  const [gameStarted, setGameStarted] = useState(Boolean(initialSession?.gameStarted))
  const [customOpening, setCustomOpening] = useState('')
  const [showCustomOpening, setShowCustomOpening] = useState(false)
  const [targetRole, setTargetRole] = useState(initialSession?.targetRole || '')
  const [showStoryToWorldBook, setShowStoryToWorldBook] = useState(false)
  const [userStory, setUserStory] = useState('')
  const [isGeneratingWorldBookAndOpening, setIsGeneratingWorldBookAndOpening] = useState(false)
  const [worldBookProgress, setWorldBookProgress] = useState('')
  const [notice, setNotice] = useState('')
  const [memoryRevision, setMemoryRevision] = useState(0)
  const messagesContainerRef = useRef(null)
  const followLatestRef = useRef(true)
  const abortControllerRef = useRef(null)
  const busyRef = useRef(false)
  const [memoryStore] = useState(() => getMemoryStore())
  const [statusStore] = useState(() => getStatusStore())
  const [showMemoryPanel, setShowMemoryPanel] = useState(false)
  const currentLLMConfig = getActiveLLMConfig(llmSettings)
  const currentApiKey = currentLLMConfig.apiKey || ''
  const currentWorldBook = worldBook || ''
  const currentRole = typeof role === 'string' ? { name: role, description: '' } : (role || { name: '', description: '' })
  const canStart = currentApiKey && currentWorldBook.trim() && currentRole.name.trim()

  useEffect(() => {
    if (initialSession?.snapshot) {
      try { restoreTurnState(initialSession.snapshot, memoryStore, statusStore) }
      catch (error) { setNotice(error.message) }
    }
    return () => abortControllerRef.current?.abort()
  }, [])

  const sessionData = () => ({
    messages, gameStarted, worldBook: currentWorldBook, role: currentRole,
    messageMode, targetRole, snapshot: captureTurnState(memoryStore, statusStore),
  })
  useEffect(() => {
    if (!saveGameSession(sessionData())) setNotice('浏览器存储空间不足，当前进度尚未保存；请导出存档。')
  }, [messages, gameStarted, worldBook, role, messageMode, targetRole, memoryRevision])
  useEffect(() => {
    const container = messagesContainerRef.current
    if (container && followLatestRef.current) container.scrollTop = container.scrollHeight
  }, [messages])

  const handleMessagesScroll = event => {
    const container = event.currentTarget
    followLatestRef.current = container.scrollHeight - container.clientHeight - container.scrollTop < 80
  }

  const openConfigModal = type => setConfigModal({ type, isOpen: true })
  const closeConfigModal = () => setConfigModal({ type: null, isOpen: false })
  const handleConfigSave = (type, value) => {
    if (type === 'api') onApiChange(value)
    if (type === 'worldbook') onWorldBookChange(value)
    if (type === 'role') onRoleChange(value)
  }
  const getConfigValue = type => type === 'api' ? llmSettings : type === 'worldbook' ? currentWorldBook : currentRole.name
  const getRoleDescription = () => currentRole.description || ''

  const handleGenerateWorldBookAndOpening = async () => {
    if (busyRef.current || !userStory.trim()) return
    if (!currentApiKey) { setNotice('请先配置 DeepSeek API Key'); return }
    busyRef.current = true
    setIsGeneratingWorldBookAndOpening(true)
    setNotice('')
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const result = await generateWorldBookAndOpening(currentLLMConfig, userStory, {
        signal: controller.signal,
        onProgress: p => setWorldBookProgress(`${p.step}/${p.total} ${p.message}`),
      })
      if (controller.signal.aborted) return
      onWorldBookChange(result.worldBook)
      setCustomOpening(result.opening)
      setShowCustomOpening(true)
      setShowStoryToWorldBook(false)
      setNotice('世界书和开头已填入，可以检查后开始游戏。')
    } catch (error) { setNotice(error.message || '生成失败') }
    finally {
      busyRef.current = false
      setIsGeneratingWorldBookAndOpening(false)
      setWorldBookProgress('')
      abortControllerRef.current = null
    }
  }

  const runTurn = async ({ opening = false, userText = '' } = {}) => {
    if (busyRef.current) return
    busyRef.current = true
    setIsLoading(true)
    setNotice('')
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const mode = opening ? 'long' : messageMode
      const mem = buildStoryPrompt({ worldBook: currentWorldBook, role: currentRole, mode,
        targetRole, opening, memoryStore, statusStore, query: userText })
      const history = opening ? [] : messages.slice(-16).map(({ role, content }) => ({ role, content }))
      const command = opening
        ? (userText || '请根据世界书生成可互动的第一幕。')
        : (userText || '请承接上一句继续说，玩家尚未作出新行动。')
      const response = await callDeepseekAPI(currentLLMConfig, mem.prompt, false,
        [...history, { role: 'user', content: command }], mode === 'long' ? 10000 : 7000, controller)
      if (controller.signal.aborted) return
      const turnId = crypto.randomUUID()
      const reply = applyTurnResponse({ response, memoryStore, statusStore, turnId,
        rowIndexMap: mem.plan.rowIndexMap, tableOrder: mem.tableOrder })
      reply.undoMessageCount = messages.length
      const nextMessages = opening ? [reply] : [...messages,
        ...(userText ? [{ id: `${turnId}_user`, role: 'user', content: userText }] : []), reply]
      const saved = saveGameSession({ ...sessionData(), messages: nextMessages,
        gameStarted: true, snapshot: captureTurnState(memoryStore, statusStore) })
      if (!saved) setNotice('本轮已生成，但浏览器空间不足，尚未保存；请导出存档。')
      setMessages(nextMessages)
      setGameStarted(true)
      setInput('')
    } catch (error) {
      // Failed/cancelled requests never append fictional events or alter chat history.
      setNotice(error.message || '生成失败，请重试')
    } finally {
      busyRef.current = false
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }
  const handleStart = () => {
    if (!canStart) { setNotice('请先配置 DeepSeek API、世界书和玩家角色'); return }
    return runTurn({ opening: true, userText: showCustomOpening ? customOpening.trim() : '' })
  }
  const handleSendMessage = () => {
    if (!gameStarted || busyRef.current) return
    if (messageMode === 'dialogue' && !targetRole.trim()) { setNotice('请先填写对话目标角色'); return }
    if (messageMode !== 'dialogue' && !input.trim()) return
    return runTurn({ userText: input.trim() })
  }
  const handleAbort = () => abortControllerRef.current?.abort()
  const canUndo = () => !isLoading && messages.length > 1 && Boolean(messages.at(-1)?.before)
  const handleUndo = () => {
    if (!canUndo()) return
    const reply = messages.at(-1)
    const previous = captureTurnState(memoryStore, statusStore)
    try {
      restoreTurnState(reply.before, memoryStore, statusStore)
      const next = messages.slice(0, reply.undoMessageCount)
      if (!saveGameSession({ ...sessionData(), messages: next, snapshot: reply.before })) {
        restoreTurnState(previous, memoryStore, statusStore)
        throw new Error('存档保存失败，尚未撤回')
      }
      const userMessage = messages[reply.undoMessageCount]
      if (userMessage?.role === 'user') setInput(userMessage.content)
      setMessages(next)
      setNotice('已撤回上一轮，状态、角色记录和分层记忆同步恢复。')
    } catch (error) { setNotice(error.message) }
  }
  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ ...sessionData(), version: 1 }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `角色扮演存档-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const handleNewGame = () => {
    if (busyRef.current || !confirm('开始新游戏会清空本局聊天和记忆。需要保留时请先导出存档。继续吗？')) return
    const snapshot = captureTurnState(memoryStore, statusStore)
    try {
      restoreTurnState({ rows: [], status: {} }, memoryStore, statusStore)
      if (!saveGameSession({ ...sessionData(), messages: [], gameStarted: false,
        snapshot: captureTurnState(memoryStore, statusStore) })) {
        restoreTurnState(snapshot, memoryStore, statusStore)
        throw new Error('新游戏存档保存失败，已保留原进度')
      }
      setMessages([])
      setGameStarted(false)
      setNotice('')
    } catch (error) { setNotice(error.message) }
  }

  return (
    <div className="game-play">
      <div className="game-container">
        <header className="game-header">
          <h2 className="title">角色扮演游戏 · V4.1 Flash</h2>
          <div className="config-buttons">
            <button disabled={isLoading} className={`config-btn ${currentApiKey ? 'configured' : ''}`} onClick={() => openConfigModal('api')}>{currentApiKey ? '✓ DeepSeek API' : '配置 DeepSeek API'}</button>
            <button disabled={isLoading} className={`config-btn ${currentWorldBook ? 'configured' : ''}`} onClick={() => openConfigModal('worldbook')}>{currentWorldBook ? '✓ 世界书已配置' : '世界书'}</button>
            <button disabled={isLoading} className={`config-btn ${currentRole.name ? 'configured' : ''}`} onClick={() => openConfigModal('role')}>{currentRole.name ? `✓ ${currentRole.name}` : '角色选择'}</button>
            <button disabled={isLoading} className="config-btn" onClick={() => setShowMemoryPanel(true)}>📋 记忆</button>
            <button disabled={isLoading} className="config-btn" onClick={handleExport}>导出存档</button>
            {gameStarted && <button disabled={isLoading} className="config-btn" onClick={handleNewGame}>新游戏</button>}
          </div>
        </header>
        {notice && <p className="game-notice" role="alert">{notice}</p>}
        <ConfigModal type={configModal.type} isOpen={configModal.isOpen} onClose={closeConfigModal}
          onSave={value => handleConfigSave(configModal.type, value)} initialValue={getConfigValue(configModal.type)}
          initialRoleDescription={getRoleDescription()} apiKey={currentApiKey} llmConfig={currentLLMConfig} />
        {!gameStarted ? (
          <div className="start-section"><div className="card">
            <h3>准备开始</h3>
            <p>配置 API、世界书和玩家角色，开始你的第一幕。已有进度会自动保存。</p>
            <ul>
              <li className={currentApiKey ? 'completed' : ''}>{currentApiKey ? '✓' : '○'} DeepSeek V4.1 Flash API</li>
              <li className={currentWorldBook ? 'completed' : ''}>{currentWorldBook ? '✓' : '○'} 世界书</li>
              <li className={currentRole.name ? 'completed' : ''}>{currentRole.name ? '✓' : '○'} 玩家角色</li>
            </ul>
            <div className="story-to-worldbook-section">
              <button className="btn-story-to-worldbook" disabled={isLoading || isGeneratingWorldBookAndOpening} onClick={() => setShowStoryToWorldBook(!showStoryToWorldBook)}>{showStoryToWorldBook ? '收起' : '✨ 根据故事生成世界书和开头'}</button>
              {showStoryToWorldBook && <div className="story-to-worldbook-input">
                <textarea value={userStory} onChange={e => setUserStory(e.target.value)} rows="8" className="story-to-worldbook-textarea" disabled={isLoading || isGeneratingWorldBookAndOpening} placeholder="描述世界、角色与开始时的处境，后续剧情由你主导。" />
                <button className="btn-generate-worldbook-opening" disabled={isLoading || isGeneratingWorldBookAndOpening || !userStory.trim()} onClick={handleGenerateWorldBookAndOpening}>{isGeneratingWorldBookAndOpening ? worldBookProgress || '准备生成…' : '生成世界书和开头'}</button>
                {isGeneratingWorldBookAndOpening && <button className="btn-abort" onClick={handleAbort}>取消生成</button>}
              </div>}
            </div>
            <div className="custom-opening-section">
              <label className="custom-opening-toggle"><input type="checkbox" checked={showCustomOpening} disabled={isLoading} onChange={e => setShowCustomOpening(e.target.checked)} /><span>自定义开局（可选）</span></label>
              {showCustomOpening && <textarea className="custom-opening-textarea" value={customOpening} onChange={e => setCustomOpening(e.target.value)} rows="6" disabled={isLoading} placeholder="描述第一幕的地点、人物和当前处境…" />}
            </div>
            <button className="btn-start" disabled={!canStart || isLoading || isGeneratingWorldBookAndOpening} onClick={handleStart}>{isLoading ? '生成第一幕中…' : '开始游戏'}</button>
            {isLoading && <button className="btn-abort" onClick={handleAbort}>取消生成</button>}
          </div></div>
        ) : (
          <div className="game-content-wrapper"><div className="game-main-area">
            <div className="messages-container" ref={messagesContainerRef} onScroll={handleMessagesScroll} tabIndex={0} role="region" aria-label="对话记录">
              {messages.map((msg, index) => (
                <article key={msg.id || index} className={`message ${msg.role}`}>
                  <div className="message-content">
                    {msg.content.split('\n').map((line, i) => <p key={i} className="message-text">{line || '\u00A0'}</p>)}
                  </div>
                  {msg.role === 'assistant' && <StatusBar status={msg.status || {}} rows={msg.memories || []} warning={msg.warning} />}
                </article>
              ))}
              {isLoading && <div className="message assistant"><div className="message-content loading">正在生成故事和状态…</div></div>}
            </div>
            <div className="input-container">
              <textarea className="message-input" value={input} onChange={e => setInput(e.target.value)} disabled={isLoading} rows="3" placeholder={messageMode === 'dialogue' ? '输入对话或动作；留空可以让角色继续说…' : '输入你的行动或指令…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSendMessage() } }} />
              <div className="input-buttons">
                <div className="mode-selector">
                  {[['short', '短文'], ['long', '长文'], ['dialogue', '对话']].map(([value, label]) => <label key={value} className="mode-option"><input type="radio" name="messageMode" value={value} checked={messageMode === value} disabled={isLoading} onChange={e => setMessageMode(e.target.value)} /><span>{label}</span></label>)}
                </div>
                {messageMode === 'dialogue' && <input className="target-role-input" aria-label="目标角色" placeholder="目标角色名称" value={targetRole} disabled={isLoading} onChange={e => setTargetRole(e.target.value)} />}
                {isLoading && <button className="send-btn abort-btn" onClick={handleAbort}>⏹ 打断</button>}
                {canUndo() && <button className="btn-undo" onClick={handleUndo} title="撤回上一轮，同时恢复状态与记忆">↶ 撤回</button>}
                <button className="send-btn" disabled={isLoading || (messageMode !== 'dialogue' && !input.trim())} onClick={handleSendMessage}>{messageMode === 'dialogue' && !input.trim() ? '继续说' : '发送'}</button>
              </div>
            </div>
          </div></div>
        )}
        <MemoryTablePanel isOpen={showMemoryPanel} onChange={snapshot => {
          if (!saveGameSession({ ...sessionData(), snapshot })) {
            setNotice('记忆已修改，但整局存档写入失败；请导出存档后刷新。')
            throw new Error('整局存档写入失败，请导出存档，避免刷新后丢失本次修改。')
          }
        }} onClose={() => { setShowMemoryPanel(false); setMemoryRevision(value => value + 1) }} />
      </div>
    </div>
  )
}
export default GamePlay
