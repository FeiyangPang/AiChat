import React, { useState, useEffect } from 'react'
import './ConfigModal.css'
import { generateWorldBook, optimizeWorldBook } from '../utils/worldBookGenerator'

function ConfigModal({ type, isOpen, onClose, onSave, initialValue, apiKey, initialRoleDescription }) {
  const [value, setValue] = useState(initialValue || '')
  const [roleDescription, setRoleDescription] = useState(initialRoleDescription || '')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeInstruction, setOptimizeInstruction] = useState('')
  const [showOptimizeInput, setShowOptimizeInput] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue || '')
      setRoleDescription(initialRoleDescription || '')
      setOptimizeInstruction('')
      setShowOptimizeInput(false)
    }
  }, [isOpen, initialValue, initialRoleDescription])

  if (!isOpen) return null

  const handleSave = () => {
    if (type === 'api') {
      const trimmedValue = value.trim()
      if (!trimmedValue) {
        alert('请输入API密钥')
        return
      }
      onSave(trimmedValue)
    } else if (type === 'role') {
      if (!value.trim()) {
        alert('请输入角色名称')
        return
      }
      onSave({ name: value.trim(), description: roleDescription.trim() })
    } else {
      onSave(value)
    }
    onClose()
  }

  const handleGenerateWorldBook = async () => {
    if (!apiKey) {
      alert('请先配置API密钥')
      return
    }
    setIsGenerating(true)
    try {
      // 如果当前有输入内容，将其作为基础传递给生成函数
      const userInput = value.trim() || ''
      const generated = await generateWorldBook(apiKey, userInput)
      setValue(generated)
    } catch (error) {
      alert(`生成失败：${error.message || '未知错误'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleOptimizeWorldBook = async () => {
    if (!apiKey) {
      alert('请先配置API密钥')
      return
    }
    if (!value || !value.trim()) {
      alert('请先输入或生成世界书内容')
      return
    }
    if (!optimizeInstruction || !optimizeInstruction.trim()) {
      alert('请输入优化指令')
      return
    }
    setIsOptimizing(true)
    try {
      const optimized = await optimizeWorldBook(apiKey, value, optimizeInstruction)
      setValue(optimized)
      setOptimizeInstruction('')
      setShowOptimizeInput(false)
    } catch (error) {
      alert(`优化失败：${error.message || '未知错误'}`)
    } finally {
      setIsOptimizing(false)
    }
  }

  const getTitle = () => {
    switch (type) {
      case 'api':
        return '配置API密钥'
      case 'worldbook':
        return '配置世界书'
      case 'role':
        return '选择角色'
      default:
        return '配置'
    }
  }

  const getPlaceholder = () => {
    switch (type) {
      case 'api':
        return '请输入Deepseek API密钥（sk-...）'
      case 'worldbook':
        return '请输入或编辑世界书内容...\n\n世界书应该包括：\n1. 世界观设定\n2. 主要地点和场景\n3. 重要角色和势力\n4. 世界规则和设定\n5. 故事背景和时代'
      case 'role':
        return '请输入角色名称（例如：张三、李四等）'
      default:
        return ''
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{getTitle()}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {type === 'api' && (
            <div className="input-group">
              <label>API密钥</label>
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={getPlaceholder()}
                className="modal-input"
              />
              <p className="hint">API密钥仅在当前会话有效，关闭页面后需要重新输入</p>
            </div>
          )}
          {type === 'worldbook' && (
            <div className="input-group">
              <div className="worldbook-actions">
                <label>世界书内容</label>
                {apiKey && (
                  <div className="worldbook-buttons">
                    <button
                      onClick={handleGenerateWorldBook}
                      disabled={isGenerating || isOptimizing}
                      className="btn-generate"
                    >
                      {isGenerating ? '生成中...' : 'AI生成世界书'}
                    </button>
                    <button
                      onClick={() => setShowOptimizeInput(!showOptimizeInput)}
                      disabled={isGenerating || isOptimizing || !value.trim()}
                      className="btn-optimize"
                    >
                      {showOptimizeInput ? '取消优化' : 'AI优化世界书'}
                    </button>
                  </div>
                )}
              </div>
              {showOptimizeInput && apiKey && value.trim() && (
                <div className="optimize-section">
                  <label>优化指令</label>
                  <textarea
                    value={optimizeInstruction}
                    onChange={(e) => setOptimizeInstruction(e.target.value)}
                    placeholder="请输入优化指令，例如：&#10;- 添加更多角色设定&#10;- 扩展世界观描述&#10;- 优化文字表达&#10;- 添加魔法体系设定&#10;- 补充角色关系描述等"
                    className="modal-textarea optimize-input"
                    rows="4"
                    disabled={isOptimizing}
                  />
                  <button
                    onClick={handleOptimizeWorldBook}
                    disabled={isOptimizing || !optimizeInstruction.trim()}
                    className="btn-optimize-confirm"
                  >
                    {isOptimizing ? '优化中...' : '确认优化'}
                  </button>
                </div>
              )}
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={getPlaceholder()}
                className="modal-textarea"
                rows="15"
                disabled={isGenerating || isOptimizing}
              />
              {!apiKey && (
                <p className="hint">提示：请先配置API密钥后，可以使用"AI生成世界书"和"AI优化世界书"功能</p>
              )}
              {apiKey && value.trim() && !showOptimizeInput && (
                <p className="hint">提示：如果当前有内容，AI生成世界书会基于现有内容进行扩展；点击"AI优化世界书"可以根据指令优化现有内容</p>
              )}
            </div>
          )}
          {type === 'role' && (
            <>
              <div className="input-group">
                <label>角色名称 *</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="请输入角色名称（例如：张三、李四等）"
                  className="modal-input"
                />
              </div>
              <div className="input-group">
                <label>角色详细描述（可选）</label>
                <textarea
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="请描述这个角色在故事中的：&#10;- 扮演的角色是什么&#10;- 地位和身份&#10;- 社交关系&#10;- 权利和影响力&#10;- 目标和动机&#10;- 背景故事&#10;&#10;例如：&#10;这是一个年轻的魔法师学徒，出身于一个没落的贵族家庭。他在魔法学院中地位较低，但有着强烈的求知欲和野心。他的目标是成为一名强大的魔法师，重振家族荣耀。他与学院中的其他学徒关系一般，但有一位导师对他颇为赏识。"
                  className="modal-textarea"
                  rows="12"
                />
                <p className="hint">详细描述可以帮助AI更好地理解你的角色，生成更符合角色设定的剧情</p>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">取消</button>
          <button onClick={handleSave} className="btn-save">保存</button>
        </div>
      </div>
    </div>
  )
}

export default ConfigModal

