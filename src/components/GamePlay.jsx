import React, { useState, useRef, useEffect } from 'react'
import './GamePlay.css'
import ConfigModal from './ConfigModal'
import { callDeepseekAPI } from '../utils/api'
import { generateJailbreakPrompt } from '../utils/jailbreakPrompt'

function GamePlay({ apiKey, worldBook, role, onApiChange, onWorldBookChange, onRoleChange }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messageMode, setMessageMode] = useState('long')
  const [configModal, setConfigModal] = useState({ type: null, isOpen: false })
  const [gameStarted, setGameStarted] = useState(false)
  const [customOpening, setCustomOpening] = useState('')
  const [showCustomOpening, setShowCustomOpening] = useState(false)
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  const currentApiKey = apiKey || ''
  const currentWorldBook = worldBook || ''
  const currentRole = typeof role === 'string' ? { name: role, description: '' } : (role || { name: '', description: '' })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openConfigModal = (type) => {
    setConfigModal({ type, isOpen: true })
  }

  const closeConfigModal = () => {
    setConfigModal({ type: null, isOpen: false })
  }

  const handleConfigSave = (type, value) => {
    switch (type) {
      case 'api':
        onApiChange(value)
        break
      case 'worldbook':
        onWorldBookChange(value)
        break
      case 'role':
        onRoleChange(value)
        break
    }
  }

  const getConfigValue = (type) => {
    switch (type) {
      case 'api':
        return currentApiKey
      case 'worldbook':
        return currentWorldBook
      case 'role':
        return currentRole.name
      default:
        return ''
    }
  }

  const getRoleDescription = () => {
    return currentRole.description || ''
  }

  const canStart = currentApiKey && currentWorldBook && currentRole.name

  const generateInitialStory = async (customOpeningText = null) => {
    if (!currentApiKey) {
      throw new Error('API密钥未设置')
    }
    if (!currentWorldBook) {
      throw new Error('世界书未设置')
    }
    if (!currentRole.name) {
      throw new Error('角色未选择')
    }

    const nsfwPrompt = generateJailbreakPrompt()
    
    let roleInfo = `玩家角色：${currentRole.name}`
    if (currentRole.description && currentRole.description.trim()) {
      roleInfo += `\n\n角色详细描述：\n${currentRole.description}`
    }

    let prompt = ''
    if (customOpeningText && customOpeningText.trim()) {
      prompt = `${nsfwPrompt}

你是一个专业的角色扮演游戏主持人。基于以下信息生成初始剧情：

世界书：
${currentWorldBook}

${roleInfo}

玩家自定义的开局描述：
${customOpeningText}

请根据玩家自定义的开局描述，结合世界书和角色设定，生成一个完整、详细的初始剧情（1000-3000字）。要求：
1. 必须完全包含玩家描述的所有元素和场景
2. 在玩家描述的基础上，进行详细的扩展和补充
3. 详细描写场景、动作、心理、环境等各个方面
4. 让玩家描述的开头场景变得生动、完整、引人入胜
5. 必须使用全中文输出
6. 必须使用第三人称视角进行长叙述
7. 严格遵循世界书设定和角色设定
8. 让玩家有代入感
9. 为后续互动留下空间`
    } else {
      prompt = `${nsfwPrompt}

你是一个专业的角色扮演游戏主持人。基于以下信息生成初始剧情：

世界书：
${currentWorldBook}

${roleInfo}

请生成一段引人入胜的初始剧情（1000-3000字），让玩家进入这个虚拟世界。要求：
1. 必须使用全中文输出
2. 必须使用第三人称视角进行长叙述
3. 详细描写场景、动作、心理、环境等
4. 严格遵循世界书设定和角色设定
5. 让玩家有代入感
6. 为后续互动留下空间`
    }

    prompt += `\n\n重要：直接输出故事内容，不要有任何推理过程、思考过程、分析过程等元内容。不要输出"根据..."、"考虑到..."、"我认为..."等推理性语言。直接开始叙述。`

    const response = await callDeepseekAPI(currentApiKey, prompt, true, [])
    if (!response || response.trim().length === 0) {
      throw new Error('API返回空内容')
    }
    return response
  }

  const handleStart = async () => {
    if (!canStart) {
      alert('请先完成所有配置：API密钥、世界书、角色选择')
      return
    }

    setIsLoading(true)
    try {
      const openingText = showCustomOpening && customOpening.trim() ? customOpening.trim() : null
      const initialMessage = await generateInitialStory(openingText)
      setMessages([{ role: 'assistant', content: initialMessage }])
      setGameStarted(true)
    } catch (error) {
      alert(`生成开场白失败：${error.message || '未知错误'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !gameStarted) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const nsfwPrompt = generateJailbreakPrompt()
      const recentHistory = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const lengthPrompt = messageMode === 'short' 
        ? '回复长度控制在600字以内'
        : '回复长度控制在1000-3000字之间'

      let roleInfo = `玩家正在扮演角色：${currentRole.name}`
      if (currentRole.description && currentRole.description.trim()) {
        roleInfo += `\n\n角色详细描述：\n${currentRole.description}`
      }

      const systemPrompt = `${nsfwPrompt}

你是角色扮演游戏主持人。${roleInfo}

世界设定：
${currentWorldBook.substring(0, 2000)}

${lengthPrompt}

要求：
1. 必须使用全中文输出
2. 必须使用第三人称视角进行长叙述
3. 详细描写场景、动作、心理、环境等
4. 严格遵循世界书设定和角色设定
5. 保持剧情连贯性
6. 根据用户指令生成相应的剧情响应

重要：直接输出故事内容，不要有任何推理过程、思考过程、分析过程等元内容。不要输出"根据..."、"考虑到..."、"我认为..."等推理性语言。直接开始叙述。

玩家指令：${userMessage}`

      const response = await callDeepseekAPI(
        currentApiKey,
        systemPrompt,
        true,
        [
          ...recentHistory,
          { role: 'user', content: userMessage }
        ],
        messageMode === 'short' ? 1500 : 7500,
        abortController
      )

      if (!response || response.trim().length === 0) {
        throw new Error('AI返回空内容')
      }

      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (error) {
      if (error.message === '请求已取消') {
        setIsLoading(false)
        return
      }
      console.error('发送消息失败:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `❌ 发送消息失败：${error.message || '未知错误'}` 
      }])
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
  }

  return (
    <div className="game-play">
      <div className="game-container">
        <div className="game-header">
          <h2 className="title">角色扮演游戏</h2>
          <div className="config-buttons">
            <button 
              onClick={() => openConfigModal('api')} 
              className={`config-btn ${currentApiKey ? 'configured' : ''}`}
            >
              {currentApiKey ? '✓ API已配置' : '配置API'}
            </button>
            <button 
              onClick={() => openConfigModal('worldbook')} 
              className={`config-btn ${currentWorldBook ? 'configured' : ''}`}
            >
              {currentWorldBook ? '✓ 世界书已配置' : '世界书'}
            </button>
            <button 
              onClick={() => openConfigModal('role')} 
              className={`config-btn ${currentRole.name ? 'configured' : ''}`}
            >
              {currentRole.name ? `✓ ${currentRole.name}` : '角色选择'}
            </button>
          </div>
        </div>

        <ConfigModal
          type={configModal.type}
          isOpen={configModal.isOpen}
          onClose={closeConfigModal}
          onSave={(value) => handleConfigSave(configModal.type, value)}
          initialValue={getConfigValue(configModal.type)}
          initialRoleDescription={getRoleDescription()}
          apiKey={currentApiKey}
        />

        {!gameStarted ? (
          <div className="start-section">
            <div className="card">
              <h3>准备开始</h3>
              <p>请完成以下配置后点击"开始游戏"：</p>
              <ul>
                <li className={currentApiKey ? 'completed' : ''}>
                  {currentApiKey ? '✓' : '○'} API密钥
                </li>
                <li className={currentWorldBook ? 'completed' : ''}>
                  {currentWorldBook ? '✓' : '○'} 世界书
                </li>
                <li className={currentRole.name ? 'completed' : ''}>
                  {currentRole.name ? '✓' : '○'} 角色选择
                </li>
              </ul>
              <div className="custom-opening-section">
                <label className="custom-opening-toggle">
                  <input
                    type="checkbox"
                    checked={showCustomOpening}
                    onChange={(e) => setShowCustomOpening(e.target.checked)}
                    disabled={isLoading}
                  />
                  <span>自定义开局（可选）</span>
                </label>
                {showCustomOpening && (
                  <div className="custom-opening-input">
                    <textarea
                      value={customOpening}
                      onChange={(e) => setCustomOpening(e.target.value)}
                      placeholder="描述你想要的故事开头场景、情节或设定，AI将根据你的描述生成详细的开场白...&#10;&#10;例如：在一个雨夜，我独自走在空无一人的街道上，突然听到身后传来脚步声..."
                      className="custom-opening-textarea"
                      rows="6"
                      disabled={isLoading}
                    />
                    <p className="hint">自定义开局是可选的，如果不填写，AI将自动生成开场白</p>
                  </div>
                )}
              </div>
              <button 
                onClick={handleStart} 
                className="btn-start"
                disabled={!canStart || isLoading}
              >
                {isLoading ? '生成开场白中...' : '开始游戏'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.role}`}>
                  <div className="message-content">
                    {msg.content.split('\n').map((line, i) => (
                      <p key={i} className="message-text">{line || '\u00A0'}</p>
                    ))}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-content">
                    <div className="loading">AI正在思考...</div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-container">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="输入您的指令或行动..."
                className="message-input"
                rows="3"
              />
              <div className="input-buttons">
                <div className="mode-selector">
                  <label className="mode-option">
                    <input
                      type="radio"
                      name="messageMode"
                      value="short"
                      checked={messageMode === 'short'}
                      onChange={(e) => setMessageMode(e.target.value)}
                      disabled={isLoading}
                    />
                    <span>短文</span>
                  </label>
                  <label className="mode-option">
                    <input
                      type="radio"
                      name="messageMode"
                      value="long"
                      checked={messageMode === 'long'}
                      onChange={(e) => setMessageMode(e.target.value)}
                      disabled={isLoading}
                    />
                    <span>长文</span>
                  </label>
                </div>
                {isLoading && (
                  <button onClick={handleAbort} className="send-btn abort-btn">
                    ⏹️ 打断
                  </button>
                )}
                <button 
                  onClick={handleSendMessage} 
                  className="send-btn"
                  disabled={isLoading || !input.trim()}
                >
                  {messageMode === 'short' ? '短文' : '长文'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default GamePlay
