import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initFirebase } from './firebase'
import './index.css'

await initFirebase()

const { default: App } = await import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
