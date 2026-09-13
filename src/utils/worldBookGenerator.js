import { callLLM } from './llm/client'
import { DEEPSEEK_MODEL } from './llm/providers'

const WORLD_BOOK_BOUNDARY = `
【世界书与剧情的边界（必须遵守）】
- 你是世界观架构师，不是剧情编剧。世界书只负责世界如何运转、角色与势力关系、地点、规则，以及故事开始前的当前状态。
- 可以补全地理、文化、社会结构、力量体系、规则代价、设定漏洞和已有信息的因果，使世界逻辑自洽。
- 禁止默认编写后续剧情大纲、章节规划、任务链、主线/支线走向、预设结局或“接下来会发生什么”。
- 用户未明确写出的后续情节应留白或标记“待玩家决定”，不能擅自推演。
- 只有用户明确要求设计剧情、路线或大纲时，才允许生成对应内容。
- 用户已写明的事件只能作为已发生背景或当前状态记录，不得续写其后续。
`

const normalizeConfig = configOrKey => typeof configOrKey === 'string'
  ? { provider: 'deepseek', apiKey: configOrKey, model: DEEPSEEK_MODEL }
  : configOrKey

const run = async (config, systemPrompt, prompt, {
  maxTokens = 4000,
  temperature = 0.55,
  signal,
  stream = false,
  onChunk,
} = {}) => callLLM(normalizeConfig(config), {
  systemPrompt,
  messages: [{ role: 'user', content: prompt }],
  maxTokens,
  temperature,
  signal,
  stream,
  onChunk,
  timeout: 180000,
})

export async function generateWorldBook(config, userInput = '', options = {}) {
  const input = userInput?.trim()
  const prompt = input
    ? `请基于用户描述生成一份详细、清晰、可直接用于角色扮演的世界书。

用户描述：
${input}

必须完整保留用户明确提供的信息。补全范围仅限世界运行逻辑与设定自洽，不虚构用户未提及的具体后续情节。

世界书包括：
1. 世界观：类型、时代、地理、文化、社会结构
2. 主要地点与当前环境
3. 重要角色和势力：身份、性格、背景、关系
4. 世界规则：魔法/科技/力量体系、限制与代价
5. 当前状态快照：故事此刻的时间点、局势和已知矛盾

${WORLD_BOOK_BOUNDARY}
请用中文输出世界书，建议 1500-3500 字；不要为凑字数增加剧情。`
    : `请创建一份可供玩家自由探索的中文角色扮演世界书。

包括世界观、主要地点、重要角色与势力、世界运行规则，以及故事开始前的当前状态快照。未知剧情保持开放，由玩家在游戏中决定。

${WORLD_BOOK_BOUNDARY}
建议 1500-3500 字；不要为凑字数增加剧情。`

  return run(config, '你是严谨的世界观架构师。只构建设定与当前状态，不替玩家规划故事发展。', prompt, {
    ...options,
    maxTokens: 3500,
  })
}

export async function optimizeWorldBook(config, worldBook, userInstruction, options = {}) {
  if (!worldBook?.trim()) throw new Error('世界书内容不能为空，请先输入或生成世界书')
  if (!userInstruction?.trim()) throw new Error('优化指令不能为空，请输入优化指令')

  const prompt = `请按用户指令优化以下世界书。

原始世界书：
${worldBook}

用户优化指令：
${userInstruction}

要求：
1. 保留未被用户要求修改的内容。
2. 默认只优化设定一致性、结构表达、角色/势力/地点与规则逻辑。
3. 除非用户明确要求设计剧情，否则不得新增剧情路线、事件序列、主线/支线或结局。
4. 用户已写明的情节只整理为已知背景，不续写。
5. 输出优化后的完整世界书，不要附加解释。

${WORLD_BOOK_BOUNDARY}`

  return run(config, '你是世界设定编辑。优化设定，不擅自成为剧情编剧。', prompt, {
    ...options,
    maxTokens: 4000,
  })
}

export async function generateWorldBookAndOpening(config, userStory, options = {}) {
  if (!userStory?.trim()) throw new Error('请提供预想的故事内容')
  const { signal, onProgress, onWorldBookChunk, onOpeningChunk } = options

  onProgress?.({ step: 1, total: 2, message: '正在生成世界书' })
  const worldBookPrompt = `从用户提供的故事想法中提取“已确定的世界要素”，生成世界书。

用户故事想法：
${userStory}

必须保留：世界类型、规则、角色、地点、关系，以及用户明确写出的已发生事件。
不得写入：用户未写明的后续发展、任务链、章节路线和结局；这些内容标记为待玩家决定。

${WORLD_BOOK_BOUNDARY}
输出 1500-3500 字的中文世界书。`

  const worldBook = await run(config, '你是世界观架构师，不是编剧。将故事想法转换为静态设定和当前状态快照。', worldBookPrompt, {
    maxTokens: 3500,
    signal,
    stream: Boolean(onWorldBookChunk),
    onChunk: onWorldBookChunk,
  })

  onProgress?.({ step: 2, total: 2, message: '正在生成可互动开头' })
  const openingPrompt = `请基于世界书和用户想法生成角色扮演游戏的开场场景。

世界书：
${worldBook}

用户想法：
${userStory}

【开场边界】
1. 只呈现“此刻”的第一幕：当前场景、角色状态与必要环境信息。
2. 不替玩家说话、行动、选择或完成目标。
3. 禁止解决核心冲突、揭示重大真相或推进到故事中后段。
4. 即使用户写了完整冒险线，也只取最初场景，不预演后续路线。
5. 结尾停在开放交互点，让玩家立即决定下一步。
6. 营造氛围但不追求情节完整；禁止为凑字数追加事件。

用中文、第三人称输出 800-1500 字的开场正文，不要解释。`

  const opening = await run(config, '你是开场场景布置者，只搭建第一幕舞台，把叙事权交给玩家。', openingPrompt, {
    maxTokens: 2000,
    signal,
    stream: Boolean(onOpeningChunk),
    onChunk: onOpeningChunk,
  })

  return { worldBook, opening }
}

export async function generateRoleDescription(config, roleName = '', userDescription = '', options = {}) {
  if (!roleName?.trim() && !userDescription?.trim()) throw new Error('请至少提供角色名称或角色描述')
  const prompt = `请生成完整的中文角色设定。

角色名称：${roleName || '由描述推断'}
用户描述：
${userDescription || '无'}

完整保留用户描述，不偏离其意图。可补充基本信息、外貌、性格、行为习惯、身份背景、社交关系、能力、目标和喜恶；不要替该角色规划后续剧情或结局。输出 1000-2500 字。`
  return run(config, '你是角色设定构建专家。补全人物设定，但不替玩家规划剧情。', prompt, {
    ...options,
    maxTokens: 3000,
  })
}

