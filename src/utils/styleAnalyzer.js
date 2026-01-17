/**
 * 分析原始故事的文字风格（增强版）
 */
export function analyzeStoryStyle(story) {
  if (!story || story.length < 100) return null

  // 提取多个故事片段用于风格分析（前中后各取3000字）
  const totalLength = story.length
  const sample1 = story.substring(0, Math.min(3000, totalLength))
  const sample2 = totalLength > 6000 ? story.substring(Math.floor(totalLength / 2) - 1500, Math.floor(totalLength / 2) + 1500) : ''
  const sample3 = totalLength > 6000 ? story.substring(Math.max(0, totalLength - 3000)) : ''
  const combinedSample = sample1 + (sample2 ? '\n' + sample2 : '') + (sample3 ? '\n' + sample3 : '')
  const sample = combinedSample || sample1
  
  // 分析风格特征
  const sentences = sample.split(/[。！？]/).filter(s => s.trim().length > 0)
  const paragraphs = sample.split(/\n\n+/).filter(p => p.trim().length > 0)
  
  const features = {
    hasDialogue: /[""「」『』""]/.test(sample), // 是否有对话
    hasDescription: /[的的地得]/.test(sample), // 是否有描述性语言
    hasAction: /[了着过]/.test(sample), // 是否有动作描写
    hasEmotion: /[心情感受想]/.test(sample), // 是否有心理描写
    sentenceLength: sentences.map(s => s.length), // 句子长度
    paragraphStyle: paragraphs.length > 1 ? '分段' : '连续', // 段落风格
    avgParagraphLength: paragraphs.length > 0 
      ? Math.round(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length)
      : 0,
    // 分析常用词汇和表达
    commonWords: extractCommonWords(sample),
    // 分析句式特点
    sentencePatterns: analyzeSentencePatterns(sentences),
    // 分析修辞手法
    rhetoricalDevices: analyzeRhetoricalDevices(sample),
  }

  // 计算平均句子长度
  const avgSentenceLength = features.sentenceLength.length > 0
    ? Math.round(features.sentenceLength.reduce((a, b) => a + b, 0) / features.sentenceLength.length)
    : 50

  // 计算句子长度分布
  const shortSentences = features.sentenceLength.filter(len => len < 30).length
  const mediumSentences = features.sentenceLength.filter(len => len >= 30 && len < 60).length
  const longSentences = features.sentenceLength.filter(len => len >= 60).length
  const sentenceDistribution = {
    short: Math.round((shortSentences / features.sentenceLength.length) * 100),
    medium: Math.round((mediumSentences / features.sentenceLength.length) * 100),
    long: Math.round((longSentences / features.sentenceLength.length) * 100)
  }

  return {
    hasDialogue: features.hasDialogue,
    hasDescription: features.hasDescription,
    hasAction: features.hasAction,
    hasEmotion: features.hasEmotion,
    avgSentenceLength,
    sentenceDistribution,
    paragraphStyle: features.paragraphStyle,
    avgParagraphLength: features.avgParagraphLength,
    commonWords: features.commonWords,
    sentencePatterns: features.sentencePatterns,
    rhetoricalDevices: features.rhetoricalDevices,
    sample: sample.substring(0, 2000), // 保存更多样本用于风格参考
    samples: {
      beginning: sample1.substring(0, 1000),
      middle: sample2 ? sample2.substring(0, 1000) : '',
      end: sample3 ? sample3.substring(0, 1000) : ''
    }
  }
}

/**
 * 提取常用词汇
 */
function extractCommonWords(text, limit = 20) {
  // 提取2-4字的常用词汇
  const words = []
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= text.length - len; i++) {
      const word = text.substring(i, i + len)
      if (!/[。！？，、；：\s\n]/.test(word)) {
        words.push(word)
      }
    }
  }
  
  // 统计词频
  const wordFreq = {}
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1
  })
  
  // 返回高频词
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
}

/**
 * 分析句式特点
 */
function analyzeSentencePatterns(sentences) {
  const patterns = {
    hasQuestion: 0,
    hasExclamation: 0,
    hasParallel: 0, // 排比
    hasRepetition: 0, // 重复
  }
  
  sentences.forEach(sentence => {
    if (/[？?]/.test(sentence)) patterns.hasQuestion++
    if (/[！!]/.test(sentence)) patterns.hasExclamation++
    if (/([，,]|、).*\1/.test(sentence)) patterns.hasParallel++
    if (/(.{2,})\1/.test(sentence)) patterns.hasRepetition++
  })
  
  return {
    questionRatio: Math.round((patterns.hasQuestion / sentences.length) * 100),
    exclamationRatio: Math.round((patterns.hasExclamation / sentences.length) * 100),
    hasParallel: patterns.hasParallel > 0,
    hasRepetition: patterns.hasRepetition > 0
  }
}

/**
 * 分析修辞手法
 */
function analyzeRhetoricalDevices(text) {
  return {
    hasMetaphor: /[像如似仿佛]/g.test(text), // 比喻
    hasPersonification: /[说笑哭]/g.test(text), // 拟人（简化检测）
    hasExaggeration: /[非常极其特别]/g.test(text), // 夸张
    hasContrast: /[但是然而不过]/g.test(text), // 对比
  }
}

/**
 * 生成风格指导提示词（增强版）
 */
export function generateStylePrompt(storyStyle, storySample) {
  if (!storyStyle) return ''

  const samples = storyStyle.samples || {}
  const sampleText = storySample || storyStyle.sample || ''
  
  let styleDetails = `# 文字风格要求（极其重要，必须严格遵守）

## 原始故事的文字风格特征分析：

### 基础特征：
- **句子平均长度**：约${storyStyle.avgSentenceLength}字
- **句子长度分布**：短句(${storyStyle.sentenceDistribution?.short || 0}%)、中句(${storyStyle.sentenceDistribution?.medium || 0}%)、长句(${storyStyle.sentenceDistribution?.long || 0}%)
- **段落风格**：${storyStyle.paragraphStyle}
- **段落平均长度**：约${storyStyle.avgParagraphLength || 0}字
- **包含对话**：${storyStyle.hasDialogue ? '是' : '否'}
- **包含描述**：${storyStyle.hasDescription ? '是' : '否'}
- **包含动作**：${storyStyle.hasAction ? '是' : '否'}
- **包含心理**：${storyStyle.hasEmotion ? '是' : '否'}

### 句式特点：
${storyStyle.sentencePatterns ? `
- 疑问句比例：${storyStyle.sentencePatterns.questionRatio}%
- 感叹句比例：${storyStyle.sentencePatterns.exclamationRatio}%
- 使用排比：${storyStyle.sentencePatterns.hasParallel ? '是' : '否'}
- 使用重复：${storyStyle.sentencePatterns.hasRepetition ? '是' : '否'}
` : ''}

### 修辞手法：
${storyStyle.rhetoricalDevices ? `
- 比喻：${storyStyle.rhetoricalDevices.hasMetaphor ? '常用' : '少用'}
- 拟人：${storyStyle.rhetoricalDevices.hasPersonification ? '常用' : '少用'}
- 夸张：${storyStyle.rhetoricalDevices.hasExaggeration ? '常用' : '少用'}
- 对比：${storyStyle.rhetoricalDevices.hasContrast ? '常用' : '少用'}
` : ''}

### 常用词汇特征：
${storyStyle.commonWords && storyStyle.commonWords.length > 0 ? `
原始故事中常用的词汇包括：${storyStyle.commonWords.slice(0, 10).join('、')}等
请在生成内容中适当使用这些词汇，保持用词习惯的一致性。
` : ''}

## 原始故事风格示例（必须严格模仿）：

### 开头风格示例：
${samples.beginning || sampleText.substring(0, 500)}

${samples.middle ? `### 中间风格示例：
${samples.middle}

` : ''}${samples.end ? `### 结尾风格示例：
${samples.end}

` : ''}## 风格模仿要求（必须严格遵守）：

**你必须像复制粘贴一样严格模仿原始故事的文字风格**，具体要求：

1. **句子长度**：严格按照原始故事的句子长度分布来写
   - 短句（<30字）占${storyStyle.sentenceDistribution?.short || 0}%
   - 中句（30-60字）占${storyStyle.sentenceDistribution?.medium || 0}%
   - 长句（>60字）占${storyStyle.sentenceDistribution?.long || 0}%

2. **段落结构**：${storyStyle.paragraphStyle === '分段' ? '使用分段式，每段独立成段' : '使用连续式，段落之间紧密连接'}

3. **用词习惯**：
   - 必须使用与原始故事相似的词汇
   - 保持相同的语言风格和表达方式
   - 避免使用原始故事中没有出现的现代网络用语或过于口语化的表达

4. **句式结构**：
   - 保持与原始故事相同的句式特点
   - ${storyStyle.sentencePatterns?.hasParallel ? '适当使用排比句式' : '避免过度使用排比'}
   - ${storyStyle.sentencePatterns?.hasRepetition ? '可以适当使用重复强调' : '避免不必要的重复'}

5. **描写风格**：
   - ${storyStyle.hasDialogue ? '必须包含对话，格式与原始故事保持一致' : '少用或不用对话'}
   - ${storyStyle.hasDescription ? '详细描写场景、环境、外貌等' : '描写要简洁'}
   - ${storyStyle.hasAction ? '详细描写动作和过程' : '动作描写要简洁'}
   - ${storyStyle.hasEmotion ? '详细描写心理活动和情感' : '心理描写要简洁'}

6. **叙述节奏**：
   - 保持与原始故事相同的叙述节奏
   - 快慢结合的方式要与原始故事一致
   - 详略安排要与原始故事保持一致

7. **修辞手法**：
   - ${storyStyle.rhetoricalDevices?.hasMetaphor ? '适当使用比喻' : '少用比喻'}
   - ${storyStyle.rhetoricalDevices?.hasPersonification ? '可以适当使用拟人' : '少用拟人'}
   - ${storyStyle.rhetoricalDevices?.hasExaggeration ? '可以适当使用夸张' : '避免过度夸张'}
   - ${storyStyle.rhetoricalDevices?.hasContrast ? '适当使用对比' : '少用对比'}

## 重要提醒：

**生成的内容必须与原始故事的文字风格高度一致，让读者感觉是同一作者写的。**
**在生成每一句话时，都要参考原始故事的风格示例，确保风格完全一致。**
**如果生成的风格与原始故事不一致，必须重新生成。**`

  return styleDetails
}

/**
 * 计算文本风格相似度（用于实时对比）
 */
export function calculateStyleSimilarity(originalStyle, generatedText) {
  if (!originalStyle || !generatedText) return 0
  
  let score = 0
  let factors = 0
  
  // 1. 句子长度相似度（30%）
  const genSentences = generatedText.split(/[。！？]/).filter(s => s.trim().length > 0)
  if (genSentences.length > 0) {
    const genAvgLength = genSentences.reduce((sum, s) => sum + s.length, 0) / genSentences.length
    const lengthDiff = Math.abs(genAvgLength - originalStyle.avgSentenceLength)
    const lengthScore = Math.max(0, 100 - (lengthDiff / originalStyle.avgSentenceLength) * 100)
    score += lengthScore * 0.3
    factors++
  }
  
  // 2. 对话使用相似度（20%）
  const genHasDialogue = /[""「」『』""]/.test(generatedText)
  if (genHasDialogue === originalStyle.hasDialogue) {
    score += 100 * 0.2
  }
  factors++
  
  // 3. 常用词汇使用度（30%）
  if (originalStyle.commonWords && originalStyle.commonWords.length > 0) {
    const usedWords = originalStyle.commonWords.filter(word => generatedText.includes(word))
    const wordScore = (usedWords.length / originalStyle.commonWords.length) * 100
    score += wordScore * 0.3
    factors++
  }
  
  // 4. 段落风格相似度（20%）
  const genParagraphs = generatedText.split(/\n\n+/).filter(p => p.trim().length > 0)
  const genParagraphStyle = genParagraphs.length > 1 ? '分段' : '连续'
  if (genParagraphStyle === originalStyle.paragraphStyle) {
    score += 100 * 0.2
  }
  factors++
  
  return Math.round(score / factors)
}

