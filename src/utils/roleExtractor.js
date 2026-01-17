/**
 * 从故事中提取所有角色名称
 * 支持中文、英文、日文等多种语言
 */
export function extractAllRoles(story) {
  if (!story || story.length === 0) return []

  const roles = new Set()
  
  // 1. 提取中文角色名（引号内的内容）
  const chineseQuotes = [
    /[""]([^""]{2,10})[""]/g,  // 中文引号
    /["]([^"]{2,10})["]/g,      // 英文引号
    /「([^」]{2,10})」/g,        // 日文引号
    /『([^』]{2,10})』/g,        // 日文引号2
    /（([^）]{2,10})）/g,        // 中文括号
    /\(([^)]{2,10})\)/g,        // 英文括号
  ]
  
  chineseQuotes.forEach(pattern => {
    const matches = story.matchAll(pattern)
    for (const match of matches) {
      const name = match[1].trim()
      if (name.length >= 2 && name.length <= 15 && !isCommonWord(name)) {
        roles.add(name)
      }
    }
  })

  // 2. 提取英文角色名（首字母大写的单词组合）
  const englishNames = story.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
  englishNames.forEach(name => {
    const trimmed = name.trim()
    if (trimmed.length >= 2 && trimmed.length <= 30 && !isCommonWord(trimmed)) {
      roles.add(trimmed)
    }
  })

  // 3. 提取日文角色名（片假名、平假名组合）
  const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{2,10}/g
  const japaneseMatches = story.matchAll(japanesePattern)
  for (const match of japaneseMatches) {
    const name = match[0].trim()
    if (name.length >= 2 && name.length <= 10 && !isCommonWord(name)) {
      roles.add(name)
    }
  }

  // 4. 提取"XX说"、"XX道"等模式中的角色名
  const speechPatterns = [
    /([\u4E00-\u9FAF]{2,10})[说道讲问答回]/,  // 中文
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(said|says|asked|replied|answered)/i,  // 英文
    /([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{2,10})[はが]/,  // 日文
  ]
  
  speechPatterns.forEach(pattern => {
    const matches = story.matchAll(pattern)
    for (const match of matches) {
      const name = match[1].trim()
      if (name.length >= 2 && name.length <= 15 && !isCommonWord(name)) {
        roles.add(name)
      }
    }
  })

  // 5. 提取"XX的"、"XX之"等所有格模式
  const possessivePatterns = [
    /([\u4E00-\u9FAF]{2,10})[的之]/g,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s/gi,
  ]
  
  possessivePatterns.forEach(pattern => {
    const matches = story.matchAll(pattern)
    for (const match of matches) {
      const name = match[1].trim()
      if (name.length >= 2 && name.length <= 15 && !isCommonWord(name)) {
        roles.add(name)
      }
    }
  })

  // 6. 使用AI提取角色（如果故事太长，分段处理）
  // 这里先返回基础提取的结果，如果需要更准确，可以调用API

  // 过滤常见词汇
  const filteredRoles = Array.from(roles).filter(role => {
    return !isCommonWord(role) && 
           !isNumber(role) && 
           !isPunctuation(role) &&
           role.length >= 2
  })

  // 按出现频率排序
  const roleFrequency = {}
  filteredRoles.forEach(role => {
    const regex = new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    const matches = story.match(regex)
    roleFrequency[role] = matches ? matches.length : 0
  })

  return filteredRoles
    .sort((a, b) => roleFrequency[b] - roleFrequency[a])
    .slice(0, 50) // 最多返回50个角色
}

/**
 * 判断是否为常见词汇（需要过滤的）
 */
function isCommonWord(word) {
  const commonWords = [
    '这个', '那个', '什么', '怎么', '为什么', '哪里', '哪个',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'that', 'this', 'these', 'those', 'it', 'its', 'he', 'she',
    'they', 'them', 'their', 'there', 'here', 'where', 'when',
    'what', 'which', 'who', 'how', 'why', 'can', 'could', 'should',
    'would', 'will', 'shall', 'may', 'might', 'must', 'have', 'has',
    'had', 'do', 'does', 'did', 'get', 'got', 'go', 'went', 'come',
    'came', 'see', 'saw', 'know', 'knew', 'think', 'thought',
    'said', 'says', 'tell', 'told', 'ask', 'asked', 'look', 'looked',
    'take', 'took', 'make', 'made', 'give', 'gave', 'find', 'found',
    'said', 'says', 'asked', 'replied', 'answered', 'thought',
    '然后', '接着', '之后', '之前', '现在', '刚才', '马上',
    '但是', '可是', '然而', '不过', '虽然', '尽管', '如果',
    '因为', '所以', '因此', '于是', '然后', '接着', '最后',
  ]
  
  return commonWords.some(common => 
    word.toLowerCase() === common.toLowerCase() || 
    word.includes(common)
  )
}

/**
 * 判断是否为数字
 */
function isNumber(str) {
  return /^\d+$/.test(str)
}

/**
 * 判断是否为标点符号
 */
function isPunctuation(str) {
  return /^[，。！？、；：""''（）【】《》〈〉「」『』〔〕…—～·]+$/.test(str)
}

