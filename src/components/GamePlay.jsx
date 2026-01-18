import React, { useState, useRef, useEffect } from 'react'
import './GamePlay.css'
import ConfigModal from './ConfigModal'
import { callDeepseekAPI } from '../utils/api'
import { generateJailbreakPrompt } from '../utils/jailbreakPrompt'
import { generateImageWithStabilityAI } from '../utils/imageGenerator'

function GamePlay({ apiKey, worldBook, role, stableDiffusionApiKey, onApiChange, onWorldBookChange, onRoleChange, onStableDiffusionApiChange }) {
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
  
  // 图片生成相关状态
  const [imagePrompt, setImagePrompt] = useState('')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [generatedImages, setGeneratedImages] = useState([])
  const [numImages, setNumImages] = useState(1)
  
  // 图片查看器状态
  const [viewerImage, setViewerImage] = useState(null)
  const [imageScale, setImageScale] = useState(1)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const currentApiKey = apiKey || ''
  const currentWorldBook = worldBook || ''
  const currentRole = typeof role === 'string' ? { name: role, description: '' } : (role || { name: '', description: '' })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openConfigModal = (type) => {
    setConfigModal({ type, isOpen: true })
  }

  const handleGenerateImage = async () => {
    if (!stableDiffusionApiKey || !stableDiffusionApiKey.trim()) {
      alert('请先配置Stable Diffusion API密钥')
      return
    }

    if (!currentApiKey || !currentApiKey.trim()) {
      alert('请先配置Deepseek API密钥，用于转换提示词')
      return
    }

    if (!imagePrompt || !imagePrompt.trim()) {
      alert('请输入图片描述')
      return
    }

    setIsGeneratingImage(true)
    setGeneratedImages([])
    
    try {
      // 第一步：使用 Deepseek API 将用户的大白话转换为专业的 AI 提示词
      const promptTranslationPrompt = `你是一个专业的AI图片生成提示词专家。请将用户提供的自然语言描述转换为专业的Stable Diffusion图片生成提示词。

用户描述：
${imagePrompt.trim()}

要求：
1. 将用户的中文或英文描述转换为专业的英文提示词（prompt）
2. 提示词应该详细、具体，包含场景、风格、细节、质量等关键词
3. 使用逗号分隔关键词，格式如：detailed, high quality, epic scene, fantasy, cinematic lighting
4. 如果用户描述的是中文，需要理解其含义并转换为对应的英文专业术语
5. 提示词应该能够准确表达用户的意图，同时符合Stable Diffusion的最佳实践
6. 只输出转换后的英文提示词，不要输出任何解释、说明或其他内容
7. 提示词长度控制在200个单词以内

请直接输出转换后的专业提示词：`

      const translatedPrompt = await callDeepseekAPI(
        currentApiKey,
        promptTranslationPrompt,
        false,
        [],
        500
      )

      if (!translatedPrompt || !translatedPrompt.trim()) {
        throw new Error('提示词转换失败')
      }

      // 使用转换后的提示词替换用户输入
      const finalPrompt = translatedPrompt.trim()
      setImagePrompt(finalPrompt)

      // 第二步：使用转换后的提示词调用 Stable Diffusion API 生成图片
      const images = await generateImageWithStabilityAI(
        stableDiffusionApiKey,
        finalPrompt,
        {
          width: 1024,
          height: 1024,
          style: 'enhance',
          numImages: numImages
        }
      )
      setGeneratedImages(images)
    } catch (error) {
      alert(`生成图片失败：${error.message || '未知错误'}`)
    } finally {
      setIsGeneratingImage(false)
    }
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
      case 'stable-diffusion-api':
        onStableDiffusionApiChange(value)
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
      case 'stable-diffusion-api':
        return stableDiffusionApiKey || ''
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

请根据玩家自定义的开局描述，结合世界书和角色设定，生成一个完整、详细的初始剧情（优先控制在约2000字，按中文字符计算）。要求：
1. 必须完全包含玩家描述的所有元素和场景
2. 在玩家描述的基础上，进行详细的扩展和补充
3. 详细描写场景、动作、心理、环境等各个方面
4. 让玩家描述的开头场景变得生动、完整、引人入胜
5. 必须使用全中文输出
6. 必须使用第三人称视角进行长叙述
7. 严格遵循世界书设定和角色设定
8. 让玩家有代入感
9. 为后续互动留下空间
10. 【最重要】必须完成完整的描述，绝不能中途停止或截断。即使字数超过2000字，也必须把整个场景、事件完整叙述完毕。完整性是第一优先级，字数控制是第二优先级。`
    } else {
      prompt = `${nsfwPrompt}

你是一个专业的角色扮演游戏主持人。基于以下信息生成初始剧情：

世界书：
${currentWorldBook}

${roleInfo}

请生成一段引人入胜的初始剧情（优先控制在约2000字，按中文字符计算），让玩家进入这个虚拟世界。要求：
1. 必须使用全中文输出
2. 必须使用第三人称视角进行长叙述
3. 详细描写场景、动作、心理、环境等
4. 严格遵循世界书设定和角色设定
5. 让玩家有代入感
6. 为后续互动留下空间
7. 【最重要】必须完成完整的描述，绝不能中途停止或截断。即使字数超过2000字，也必须把整个场景、事件完整叙述完毕。完整性是第一优先级，字数控制是第二优先级。`
    }

    prompt += `\n\n【最重要】必须完成完整的描述，绝不能中途停止或截断。即使字数超过2000字，也必须把整个事件、场景、动作完整叙述完毕。完整性是第一优先级，字数控制是第二优先级。如果描述到一半就停止，这是严重错误。

重要：直接输出故事内容，不要有任何推理过程、思考过程、分析过程等元内容。不要输出"根据..."、"考虑到..."、"我认为..."等推理性语言。直接开始叙述。必须完整叙述完所有内容，不要中途停止。`

    const response = await callDeepseekAPI(currentApiKey, prompt, true, [], 4000)
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
        ? '【快问快答模式】回复要求：快速、简短、完整。优先控制在约500字左右（按中文字符计算），但如果需要完整叙述完用户指令的所有内容，即使字数超过500字也必须说完。绝不能因为字数限制而省略、截断或遗漏任何重要情节。以快答为前提，但完整性是第一优先级。'
        : '回复长度优先控制在约2000字左右（按中文字符计算），但【最重要】必须完整叙述完用户指令中的所有内容，即使字数超过2000字也必须说完。绝不能因为字数限制而省略、截断、遗漏任何重要情节或中途停止。完整性是第一优先级，字数控制是第二优先级。'

      let roleInfo = `玩家正在扮演角色：${currentRole.name}`
      if (currentRole.description && currentRole.description.trim()) {
        roleInfo += `\n\n角色详细描述：\n${currentRole.description}`
      }

      const systemPrompt = `${nsfwPrompt}

你是角色扮演游戏主持人。${roleInfo}

世界设定：
${currentWorldBook.substring(0, 2000)}

${lengthPrompt}

${messageMode === 'short' ? `要求（快问快答模式）：
1. 必须使用全中文输出
2. 必须使用第三人称视角进行叙述
3. 快速响应，语言简洁高效
4. 严格遵循世界书设定和角色设定
5. 保持剧情连贯性
6. 根据用户指令生成相应的剧情响应
7. 【最重要】必须完整叙述完用户指令中的所有内容，即使字数超过500字也必须说完。绝不能因为字数限制而省略、截断或遗漏任何重要情节。完整性是第一优先级，快答是第二优先级。
8. 优先使用简洁的语言，但必要时可以详细描述以确保完整性

重要：直接输出故事内容，不要有任何推理过程、思考过程、分析过程等元内容。不要输出"根据..."、"考虑到..."、"我认为..."等推理性语言。直接开始叙述。快问快答，但必须把话说完整。` : `要求：
1. 必须使用全中文输出
2. 必须使用第三人称视角进行长叙述
3. 详细描写场景、动作、心理、环境等
4. 严格遵循世界书设定和角色设定
5. 保持剧情连贯性
6. 根据用户指令生成相应的剧情响应
7. 【最重要】必须完整叙述完用户指令中的所有内容，绝不能中途停止或截断。即使字数超过2000字，也必须把整个事件、场景、动作完整叙述完毕。完整性是第一优先级，字数控制是第二优先级。

重要：直接输出故事内容，不要有任何推理过程、思考过程、分析过程等元内容。不要输出"根据..."、"考虑到..."、"我认为..."等推理性语言。直接开始叙述。必须完成完整的描述，不要中途停止。`}

玩家指令：${userMessage}${messageMode === 'short' ? '\n\n【快问快答要求】请快速、简短地回复，但必须完整叙述完所有内容，即使超字数也要说完。' : '\n\n【重要】请完整叙述完所有内容，必须完成整个事件、场景、动作的描述，绝不能中途停止或截断。即使字数超过2000字也要说完。'}`

      const response = await callDeepseekAPI(
        currentApiKey,
        systemPrompt,
        true,
        [
          ...recentHistory,
          { role: 'user', content: userMessage }
        ],
        messageMode === 'short' ? 2000 : 4000, // 短文模式增加token限制，确保即使超字数也能说完
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

  // 打开图片查看器
  const openImageViewer = (imageSrc) => {
    setViewerImage(imageSrc)
    setImageScale(1)
    setImagePosition({ x: 0, y: 0 })
  }

  // 关闭图片查看器
  const closeImageViewer = () => {
    setViewerImage(null)
    setImageScale(1)
    setImagePosition({ x: 0, y: 0 })
  }

  // 图片缩放
  const handleImageZoom = (delta) => {
    setImageScale(prev => {
      const newScale = prev + delta
      return Math.max(0.5, Math.min(5, newScale)) // 限制在0.5倍到5倍之间
    })
  }

  // 图片拖拽开始
  const handleImageDragStart = (e) => {
    if (e.button !== 0) return // 只响应左键
    setIsDragging(true)
    setDragStart({
      x: e.clientX - imagePosition.x,
      y: e.clientY - imagePosition.y
    })
  }

  // 图片拖拽中
  const handleImageDrag = (e) => {
    if (!isDragging) return
    setImagePosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  // 图片拖拽结束
  const handleImageDragEnd = () => {
    setIsDragging(false)
  }

  // 鼠标滚轮缩放
  const handleImageWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    handleImageZoom(delta)
  }

  // 重置图片位置和缩放
  const resetImageViewer = () => {
    setImageScale(1)
    setImagePosition({ x: 0, y: 0 })
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
            <button 
              onClick={() => openConfigModal('stable-diffusion-api')} 
              className={`config-btn ${stableDiffusionApiKey ? 'configured' : ''}`}
            >
              {stableDiffusionApiKey ? '✓ SD API已配置' : 'SD API配置'}
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
          <div className="game-content-wrapper">
            <div className="game-main-area">
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
            </div>

            <div className="image-generation-panel">
              <div className="image-panel-header">
                <h3>场景图片生成</h3>
              </div>
              <div className="image-panel-content">
                <div className="image-display-area">
                  {isGeneratingImage ? (
                    <div className="image-loading">
                      <div className="loading-spinner"></div>
                      <p>正在生成图片...</p>
                    </div>
                  ) : generatedImages.length > 0 ? (
                    <div className="generated-images-grid">
                      {generatedImages.map((image, index) => (
                        <div key={index} className="generated-image-item">
                          <img 
                            src={image} 
                            alt={`生成的图片 ${index + 1}`}
                            onClick={() => openImageViewer(image)}
                            className="clickable-image"
                          />
                          <a 
                            href={image} 
                            download={`generated-image-${index + 1}.png`}
                            className="download-btn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            下载
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="image-placeholder">
                      <p>生成的图片将显示在这里</p>
                    </div>
                  )}
                </div>
                <div className="image-controls">
                  <div className="image-prompt-section">
                    <label>图片生成</label>
                    <textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="用自然语言描述你想要生成的场景图片，例如：一座建在山上的奇幻城堡，细节丰富，高质量，史诗般的场景"
                      className="image-prompt-input"
                      rows="4"
                      disabled={isGeneratingImage}
                    />
                    <p className="hint-small">AI会自动将你的描述转换为专业提示词</p>
                  </div>
                  <div className="image-settings">
                    <label>生成数量：</label>
                    <select
                      value={numImages}
                      onChange={(e) => setNumImages(parseInt(e.target.value))}
                      className="num-images-select"
                      disabled={isGeneratingImage}
                    >
                      <option value={1}>1张</option>
                      <option value={2}>2张</option>
                      <option value={3}>3张</option>
                      <option value={4}>4张</option>
                    </select>
                  </div>
                  <button
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !imagePrompt.trim() || !stableDiffusionApiKey || !currentApiKey}
                    className="btn-generate-image"
                  >
                    {isGeneratingImage ? '生成中...' : '生成图片'}
                  </button>
                  {!stableDiffusionApiKey && (
                    <p className="hint">请先配置Stable Diffusion API密钥</p>
                  )}
                  {stableDiffusionApiKey && !currentApiKey && (
                    <p className="hint">请先配置Deepseek API密钥（用于转换提示词）</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 图片查看器 */}
        {viewerImage && (
          <div 
            className="image-viewer-overlay"
            onClick={closeImageViewer}
            onWheel={handleImageWheel}
          >
            <div 
              className="image-viewer-container"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={handleImageDragStart}
              onMouseMove={handleImageDrag}
              onMouseUp={handleImageDragEnd}
              onMouseLeave={handleImageDragEnd}
            >
              <div className="image-viewer-controls">
                <button 
                  onClick={() => handleImageZoom(0.1)}
                  className="viewer-btn zoom-in"
                  title="放大"
                >
                  +
                </button>
                <button 
                  onClick={() => handleImageZoom(-0.1)}
                  className="viewer-btn zoom-out"
                  title="缩小"
                >
                  −
                </button>
                <button 
                  onClick={resetImageViewer}
                  className="viewer-btn reset"
                  title="重置"
                >
                  ↺
                </button>
                <button 
                  onClick={closeImageViewer}
                  className="viewer-btn close"
                  title="关闭"
                >
                  ×
                </button>
              </div>
              <div 
                className="image-viewer-content"
                style={{
                  transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${imageScale})`,
                  cursor: isDragging ? 'grabbing' : 'grab'
                }}
              >
                <img 
                  src={viewerImage} 
                  alt="查看的图片"
                  draggable={false}
                />
              </div>
              <div className="image-viewer-info">
                <span>缩放: {(imageScale * 100).toFixed(0)}%</span>
                <span>拖拽移动 | 滚轮缩放 | 点击外部关闭</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GamePlay
