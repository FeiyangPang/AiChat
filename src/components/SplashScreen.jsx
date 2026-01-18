import React, { useState, useEffect } from 'react'
import './SplashScreen.css'

function SplashScreen({ onComplete }) {
  const [particles, setParticles] = useState([])
  const [textVisible, setTextVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // 初始化粒子
    const initParticles = () => {
      const newParticles = []
      for (let i = 0; i < 50; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() * 4 + 1,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: (Math.random() - 0.5) * 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          delay: Math.random() * 2
        })
      }
      setParticles(newParticles)
    }

    initParticles()

    // 文字渐入动画
    const textTimer = setTimeout(() => {
      setTextVisible(true)
    }, 500)

    // 记录开始时间，确保最短停留时间为2秒
    const startTime = Date.now()
    const minDuration = 2000 // 最短2秒

    // 进度条动画
    let progressValue = 0
    let isCompleted = false
    
    const progressInterval = setInterval(() => {
      // 计算已过时间
      const elapsed = Date.now() - startTime
      
      // 根据时间计算目标进度，确保在2秒左右完成
      const targetProgress = Math.min(100, (elapsed / minDuration) * 100)
      
      // 添加一些随机波动，但确保不超过100%
      const increment = Math.random() * 8 + 2
      progressValue = Math.min(100, Math.max(progressValue, targetProgress) + increment)
      
      if (progressValue >= 100 && !isCompleted) {
        progressValue = 100
        isCompleted = true
        
        // 确保至少经过2秒后才完成
        const remainingTime = Math.max(0, minDuration - elapsed)
        clearInterval(progressInterval)
        
        setTimeout(() => {
          onComplete()
        }, remainingTime + 300) // 额外300ms缓冲
      }
      
      setProgress(progressValue)
    }, 100)

    return () => {
      clearTimeout(textTimer)
      clearInterval(progressInterval)
    }
  }, [onComplete])

  return (
    <div className="splash-screen">
      <div className="splash-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
        <div className="grid-overlay"></div>
      </div>

      <div className="particles-container">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              animationDelay: `${particle.delay}s`
            }}
          />
        ))}
      </div>

      <div className="splash-content">
        <div className={`splash-title ${textVisible ? 'visible' : ''}`}>
          <div className="title-glow">角色扮演游戏</div>
          <div className="title-subtitle">沉浸式AI剧情体验</div>
        </div>

        <div className="loading-section">
          <div className="loading-bar-container">
            <div 
              className="loading-bar" 
              style={{ width: `${progress}%` }}
            >
              <div className="loading-bar-glow"></div>
            </div>
          </div>
          <div className="loading-text">
            {progress < 30 ? '正在初始化...' :
             progress < 60 ? '加载游戏世界...' :
             progress < 90 ? '准备开始冒险...' :
             '即将开始！'}
          </div>
        </div>
      </div>

      <div className="splash-particles">
        <div className="spark spark-1"></div>
        <div className="spark spark-2"></div>
        <div className="spark spark-3"></div>
        <div className="spark spark-4"></div>
        <div className="spark spark-5"></div>
      </div>
    </div>
  )
}

export default SplashScreen

