export async function generateWorldBook(apiKey) {
  const prompt = `请生成一个详细的虚拟世界背景设定（世界书）。

世界书应该包括：
1. 世界观设定：世界的类型、时代背景、地理环境、世界规则、文化背景、社会结构
2. 主要地点和场景：故事发生的主要地点，每个场景的详细描述
3. 重要角色和势力：所有重要角色的详细设定（姓名、年龄、性格、背景、身体特征等），角色之间的关系
4. 世界规则和设定：世界的运行规则、魔法/科技体系、社会制度等
5. 故事背景和时代：当前的故事状态和起点

请用中文生成详细的世界书，字数控制在2000-5000字之间。`

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的世界观构建专家，擅长创造详细的虚拟世界设定。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API请求失败: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API返回数据格式错误')
    }
    
    const content = data.choices[0].message.content
    if (!content || content.trim().length === 0) {
      throw new Error('API返回内容为空')
    }
    return content
  } catch (error) {
    console.error('生成世界书失败:', error)
    const errorMsg = error.message || '未知错误'
    if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
      throw new Error('API密钥无效，请检查API密钥是否正确')
    } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
      throw new Error('网络连接失败，请检查网络连接')
    } else {
      throw new Error(`生成世界书失败：${errorMsg}`)
    }
  }
}

