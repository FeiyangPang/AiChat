export async function generateWorldBook(apiKey, userInput = '') {
  let prompt = ''
  
  if (userInput && userInput.trim()) {
    // 如果用户提供了输入，基于用户输入生成世界书，并确保严格包含用户输入的内容
    prompt = `请基于以下用户描述，生成一个详细的虚拟世界背景设定（世界书）。

用户输入的内容：
${userInput}

重要要求：
1. 必须严格包含用户输入的所有内容，不能遗漏任何信息
2. 在用户输入的基础上进行扩展和补充，使其更加完整和详细
3. 如果用户输入中提到了角色、地点、设定等，必须在生成的世界书中完整保留并详细展开

世界书应该包括：
1. 世界观设定：世界的类型、时代背景、地理环境、世界规则、文化背景、社会结构
2. 主要地点和场景：故事发生的主要地点，每个场景的详细描述
3. 重要角色和势力：所有重要角色的详细设定（姓名、年龄、性格、背景、身体特征等），角色之间的关系
4. 世界规则和设定：世界的运行规则、魔法/科技体系、社会制度等
5. 故事背景和时代：当前的故事状态和起点

请用中文生成详细的世界书，字数控制在2000-5000字之间。确保用户输入的所有内容都完整包含在生成的世界书中。`
  } else {
    // 如果没有用户输入，生成全新的世界书
    prompt = `请生成一个详细的虚拟世界背景设定（世界书）。

世界书应该包括：
1. 世界观设定：世界的类型、时代背景、地理环境、世界规则、文化背景、社会结构
2. 主要地点和场景：故事发生的主要地点，每个场景的详细描述
3. 重要角色和势力：所有重要角色的详细设定（姓名、年龄、性格、背景、身体特征等），角色之间的关系
4. 世界规则和设定：世界的运行规则、魔法/科技体系、社会制度等
5. 故事背景和时代：当前的故事状态和起点

请用中文生成详细的世界书，字数控制在2000-5000字之间。`
  }

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
            content: '你是一个专业的世界观构建专家，擅长创造详细的虚拟世界设定。你必须严格遵循用户的要求，确保用户输入的所有内容都完整包含在生成的世界书中。'
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

export async function optimizeWorldBook(apiKey, worldBook, userInstruction) {
  if (!worldBook || !worldBook.trim()) {
    throw new Error('世界书内容不能为空，请先输入或生成世界书')
  }

  if (!userInstruction || !userInstruction.trim()) {
    throw new Error('优化指令不能为空，请输入优化指令')
  }

  const prompt = `你是一个专业的世界观优化专家。请根据用户的优化指令，对以下世界书进行优化。

原始世界书内容：
${worldBook}

用户优化指令：
${userInstruction}

重要要求：
1. 必须严格保留原始世界书中的所有内容，不能删除或遗漏任何信息
2. 根据用户的优化指令，对世界书进行相应的调整、扩展或改进
3. 如果用户要求添加内容，在保留原有内容的基础上添加
4. 如果用户要求修改内容，只修改指定的部分，其他部分保持不变
5. 如果用户要求优化结构或表达，保持所有信息完整，只改进表达方式
6. 优化后的世界书应该更加完整、详细、符合用户的要求

请输出优化后的完整世界书内容。`

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
            content: '你是一个专业的世界观优化专家。你必须严格遵循用户的要求，确保原始世界书的所有内容都完整保留在优化后的世界书中，同时根据用户的指令进行相应的优化。'
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
    console.error('优化世界书失败:', error)
    const errorMsg = error.message || '未知错误'
    if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
      throw new Error('API密钥无效，请检查API密钥是否正确')
    } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
      throw new Error('网络连接失败，请检查网络连接')
    } else {
      throw new Error(`优化世界书失败：${errorMsg}`)
    }
  }
}

