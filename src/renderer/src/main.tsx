import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/theme.css'

async function render(): Promise<void> {
  const isDevelopment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true
  if (isDevelopment && new URLSearchParams(window.location.search).has('firstmateMock')) {
    const { installFirstMateMock } = await import('./dev/mock-firstmate')
    installFirstMateMock()
  }
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void render()
