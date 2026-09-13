import React, { useState } from 'react'
import './App.css'
import Introduction from './components/Introduction'
import GamePlay from './components/GamePlay'
import ErrorBoundary from './components/ErrorBoundary'
import SplashScreen from './components/SplashScreen'
import { loadLLMSettings, saveLLMSettings } from './utils/llm/providers'
import { loadGameSession } from './utils/game-session'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [savedSession] = useState(() => loadGameSession())
  const [showIntroduction, setShowIntroduction] = useState(!savedSession?.gameStarted)
  const [llmSettings, setLlmSettings] = useState(() => loadLLMSettings())
  const [worldBook, setWorldBook] = useState(savedSession?.worldBook || '')
  const [selectedRole, setSelectedRole] = useState(savedSession?.role || { name: '', description: '' })

  const handleStart = () => {
    setShowIntroduction(false)
  }

  const handleApiChange = (settings) => {
    setLlmSettings(settings)
    saveLLMSettings(settings)
  }

  const handleWorldBookChange = (newWorldBook) => {
    setWorldBook(newWorldBook)
  }

  const handleRoleChange = (newRole) => {
    if (typeof newRole === 'string') {
      setSelectedRole({ name: newRole, description: '' })
    } else {
      setSelectedRole(newRole || { name: '', description: '' })
    }
  }

  const handleSplashComplete = () => {
    setShowSplash(false)
  }

  return (
    <div className="app">
      <ErrorBoundary>
        {showSplash ? (
          <SplashScreen onComplete={handleSplashComplete} />
        ) : showIntroduction ? (
          <Introduction onStart={handleStart} />
        ) : (
          <GamePlay
            llmSettings={llmSettings}
            worldBook={worldBook}
            role={selectedRole}
            onApiChange={handleApiChange}
            onWorldBookChange={handleWorldBookChange}
            onRoleChange={handleRoleChange}
          />
        )}
      </ErrorBoundary>
    </div>
  )
}

export default App
