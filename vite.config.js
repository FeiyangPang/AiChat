import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { llmProxyPlugin } from './server/llm-proxy.js'

export default defineConfig({
  plugins: [react(), llmProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: true
  }
})

