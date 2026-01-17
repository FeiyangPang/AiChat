export function findStoryContext(story, searchText) {
  if (!story || !searchText) return null

  const trimmedSearch = searchText.trim()
  if (!trimmedSearch) return null

  let index = story.indexOf(trimmedSearch)
  if (index !== -1) {
    return extractContextAtPosition(story, index, trimmedSearch.length)
  }

  const storyLines = story.split('\n')
  const searchLines = trimmedSearch.split('\n').filter(line => line.trim())
  
  if (searchLines.length > 1) {
    for (let i = 0; i <= storyLines.length - searchLines.length; i++) {
      const matched = searchLines.every((searchLine, idx) => {
        const storyLine = storyLines[i + idx]
        return storyLine && storyLine.includes(searchLine.trim())
      })
      if (matched) {
        const lineStartIndex = storyLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
        return extractContextAtPosition(story, lineStartIndex, searchLines.join('\n').length)
      }
    }
  }

  for (let i = 0; i < storyLines.length; i++) {
    const line = storyLines[i]
    if (line.includes(trimmedSearch)) {
      const lineStartIndex = storyLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
      const matchIndex = line.indexOf(trimmedSearch)
      return extractContextAtPosition(story, lineStartIndex + matchIndex, trimmedSearch.length)
    }
  }

  const lowerStory = story.toLowerCase()
  const lowerSearch = trimmedSearch.toLowerCase()
  const fuzzyIndex = lowerStory.indexOf(lowerSearch)
  if (fuzzyIndex !== -1) {
    return extractContextAtPosition(story, fuzzyIndex, trimmedSearch.length)
  }

  if (trimmedSearch.length > 10) {
    const firstHalf = trimmedSearch.substring(0, Math.floor(trimmedSearch.length / 2))
    const secondHalf = trimmedSearch.substring(Math.floor(trimmedSearch.length / 2))
    
    const firstIndex = story.indexOf(firstHalf)
    const secondIndex = story.indexOf(secondHalf)
    
    if (firstIndex !== -1 && secondIndex !== -1 && Math.abs(secondIndex - firstIndex) < trimmedSearch.length * 2) {
      return extractContextAtPosition(story, firstIndex, trimmedSearch.length)
    }
  }

  return null
}

function extractContextAtPosition(story, matchIndex, matchLength) {
  let lineStart = matchIndex
  while (lineStart > 0 && story[lineStart - 1] !== '\n') {
    lineStart--
  }
  
  let lineEnd = matchIndex + matchLength
  while (lineEnd < story.length && story[lineEnd] !== '\n') {
    lineEnd++
  }
  
  const before = 500
  const after = 1500
  
  const start = Math.max(0, lineStart - before)
  const end = Math.min(story.length, lineEnd + after)
  
  return story.substring(start, end)
}

export async function callDeepseekAPI(apiKey, systemPrompt, nsfwEnabled = false, conversationHistory = [], maxTokens = 8000, abortController = null) {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API密钥为空，请先设置API密钥')
  }
  
  if (!systemPrompt || systemPrompt.trim().length === 0) {
    throw new Error('系统提示词为空')
  }

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...conversationHistory
  ]

  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: nsfwEnabled ? 1.2 : 0.8,
        top_p: nsfwEnabled ? 1 : 1,
        max_tokens: maxTokens,
        stream: false
      })
    }

    if (abortController) {
      fetchOptions.signal = abortController.signal
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', fetchOptions)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API请求失败: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API返回数据格式错误')
    }

    return data.choices[0].message.content
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求已取消')
    }
    console.error('API调用失败:', error)
    throw error
  }
}
