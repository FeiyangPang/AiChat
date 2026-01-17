export function parseCommand(input) {
  if (!input || typeof input !== 'string') {
    return {
      action: input || '',
      directives: [],
      hasDirectives: false
    }
  }

  const slashIndex = input.indexOf('/')
  if (slashIndex === -1) {
    return {
      action: input.trim(),
      directives: [],
      hasDirectives: false
    }
  }

  const action = input.substring(0, slashIndex).trim()
  const directivesText = input.substring(slashIndex + 1).trim()

  const directives = []
  const directivePattern = /([^，,]+?)(?:\((\d+)%\))?(?:，|,|$)/g
  let match

  while ((match = directivePattern.exec(directivesText)) !== null) {
    const description = match[1].trim()
    const percentage = match[2] ? parseInt(match[2], 10) : null
    
    if (description) {
      directives.push({
        description,
        percentage
      })
    }
  }

  if (directives.length === 0 && directivesText) {
    directives.push({
      description: directivesText,
      percentage: null
    })
  }

  return {
    action,
    directives,
    hasDirectives: directives.length > 0
  }
}

export function generateDirectivePrompt(directives) {
  if (!directives || directives.length === 0) {
    return ''
  }

  const parts = directives.map((dir, index) => {
    const percentage = dir.percentage ? `（占${dir.percentage}%的文字）` : ''
    return `${index + 1}. ${dir.description}${percentage}`
  }).join('\n')

  return `\n\n# 内容生成指导（重要）
用户希望生成的内容按照以下方向和比例分配：
${parts}

请严格按照以上指导生成内容，确保：
1. 每个部分的内容比例符合要求
2. 内容连贯自然，过渡流畅
3. 所有部分都要详细展开，不能简略
4. 保持与原始故事风格一致`
}
