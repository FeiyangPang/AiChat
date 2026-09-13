import { callLLM } from './llm/client'
import { DEEPSEEK_MODEL } from './llm/providers'

export { DEEPSEEK_MODEL }

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

export async function callDeepseekAPI(configOrKey, systemPrompt, nsfwEnabled = false, conversationHistory = [], maxTokens = 8000, abortController = null) {
  const config = typeof configOrKey === 'string'
    ? { provider: 'deepseek', apiKey: configOrKey, model: DEEPSEEK_MODEL }
    : configOrKey
  return callLLM(config, {
    systemPrompt,
    messages: conversationHistory,
    maxTokens,
    temperature: 0.8,
    signal: abortController?.signal,
  })
}
