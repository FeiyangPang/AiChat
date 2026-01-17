import React, { useState, useEffect } from 'react'
import './App.css'
import Introduction from './components/Introduction'
import GamePlay from './components/GamePlay'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const [showIntroduction, setShowIntroduction] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [worldBook, setWorldBook] = useState('')
  const [selectedRole, setSelectedRole] = useState({ name: '', description: '' })

  useEffect(() => {
    try {
      if (localStorage.getItem('deepseek_api_key')) {
        localStorage.removeItem('deepseek_api_key')
      }
    } catch (error) {
      console.error('清除localStorage失败:', error)
    }
  }, [])

  const handleStart = () => {
    setShowIntroduction(false)
  }

  const handleApiChange = (key) => {
    const trimmedKey = key.trim()
    setApiKey(trimmedKey)
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

  return (
    <div className="app">
      <ErrorBoundary>
        {showIntroduction ? (
          <Introduction onStart={handleStart} />
        ) : (
          <GamePlay
            apiKey={apiKey}
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
