// Stable Diffusion API 图片生成工具函数

/**
 * 使用 Stability AI API 生成图片
 * @param {string} apiKey - Stability AI API密钥
 * @param {string} prompt - 图片描述提示词
 * @param {object} options - 生成选项
 * @returns {Promise<string[]>} 返回图片URL或base64数组
 */
export async function generateImageWithStabilityAI(apiKey, prompt, options = {}) {
  const {
    width = 1024,
    height = 1024,
    style = 'enhance',
    model = 'stable-diffusion-xl-1024-v1-0',
    numImages = 1
  } = options

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Stable Diffusion API密钥为空，请先设置API密钥')
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('提示词不能为空')
  }

  try {
    const response = await fetch(
      `https://api.stability.ai/v1/generation/${model}/text-to-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          text_prompts: [
            {
              text: prompt,
              weight: 1
            }
          ],
          cfg_scale: 7,
          height: height,
          width: width,
          steps: 30,
          samples: Math.min(numImages, 4), // 最多4张
          style_preset: style
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `API请求失败: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.artifacts || data.artifacts.length === 0) {
      throw new Error('API返回数据格式错误：未找到生成的图片')
    }

    // 返回base64图片数据数组
    return data.artifacts.map(artifact => 
      `data:image/png;base64,${artifact.base64}`
    )
  } catch (error) {
    console.error('生成图片失败:', error)
    const errorMsg = error.message || '未知错误'
    if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
      throw new Error('Stable Diffusion API密钥无效，请检查API密钥是否正确')
    } else if (errorMsg.includes('402') || errorMsg.includes('Payment')) {
      throw new Error('账户余额不足，请充值后重试')
    } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
      throw new Error('网络连接失败，请检查网络连接')
    } else {
      throw new Error(`生成图片失败：${errorMsg}`)
    }
  }
}

/**
 * 使用其他 Stable Diffusion API 服务（备用方案）
 * 例如：使用 Replicate 或其他服务
 */
export async function generateImageWithReplicate(apiKey, prompt, options = {}) {
  // 这里可以添加其他API服务的实现
  // 目前主要使用 Stability AI
  throw new Error('Replicate API暂未实现，请使用 Stability AI')
}

