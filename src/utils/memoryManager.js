/**
 * 记忆管理器
 * 用于记住重要人物和上下文信息，优化token使用
 */
export class MemoryManager {
  constructor() {
    this.characters = new Map() // 人物信息：{name: {situation, personality, relationships}}
    this.contextHistory = [] // 上下文历史（最近10-20条消息的摘要）
    this.maxContextHistory = 20 // 最多保存20条上下文
  }

  /**
   * 更新人物信息
   */
  updateCharacter(name, info) {
    if (!name) return
    
    const existing = this.characters.get(name) || {}
    this.characters.set(name, {
      situation: info.situation || existing.situation || '',
      personality: info.personality || existing.personality || '',
      relationships: info.relationships || existing.relationships || '',
      lastUpdated: Date.now()
    })
  }

  /**
   * 从文本中提取人物信息
   */
  extractCharacters(text) {
    // 简单的人物提取逻辑，可以通过AI优化
    const characterPatterns = [
      /([\u4E00-\u9FAF]{2,6})(?:的|是|在|说|道|想|感到)/g,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:'s|is|was|said|thought)/g
    ]
    
    const found = new Set()
    characterPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        const name = match[1].trim()
        if (name.length >= 2 && name.length <= 15) {
          found.add(name)
        }
      }
    })
    
    return Array.from(found)
  }

  /**
   * 添加上下文摘要
   */
  addContextSummary(summary, messageIndex) {
    this.contextHistory.push({
      summary,
      index: messageIndex,
      timestamp: Date.now()
    })
    
    // 保持最多20条
    if (this.contextHistory.length > this.maxContextHistory) {
      this.contextHistory.shift()
    }
  }

  /**
   * 获取最近的上下文摘要（10-20条）
   */
  getRecentContexts(startIndex = 0, count = 20) {
    const recent = this.contextHistory.slice(-count)
    return recent.filter(ctx => ctx.index >= startIndex)
  }

  /**
   * 生成记忆摘要（优化token使用）
   */
  generateMemorySummary() {
    const characterList = []
    this.characters.forEach((info, name) => {
      const parts = []
      if (info.situation) parts.push(`处境：${info.situation}`)
      if (info.personality) parts.push(`性格：${info.personality}`)
      if (info.relationships) parts.push(`关系：${info.relationships}`)
      
      if (parts.length > 0) {
        characterList.push(`${name}：${parts.join('；')}`)
      }
    })

    const contextList = this.getRecentContexts().map(ctx => ctx.summary).join('\n')

    return {
      characters: characterList.join('\n'),
      contexts: contextList,
      totalLength: characterList.join('\n').length + contextList.length
    }
  }

  /**
   * 移除指定索引之后的上下文摘要
   */
  removeContextsAfter(messageIndex) {
    this.contextHistory = this.contextHistory.filter(
      ctx => ctx.index <= messageIndex
    )
  }

  /**
   * 清理旧记忆
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天
    const now = Date.now()
    
    // 清理旧的人物信息
    this.characters.forEach((info, name) => {
      if (now - (info.lastUpdated || 0) > maxAge) {
        this.characters.delete(name)
      }
    })
    
    // 清理旧的上下文
    this.contextHistory = this.contextHistory.filter(
      ctx => now - ctx.timestamp < maxAge
    )
  }
}

