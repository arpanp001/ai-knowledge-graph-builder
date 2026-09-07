import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Toaster } from 'react-hot-toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        className: "!bg-white dark:!bg-slate-800 !text-slate-800 dark:!text-slate-100 !text-sm !rounded-xl !shadow-lg !border !border-slate-200 dark:!border-slate-700",
        success: { iconTheme: { primary: "#7c3aed", secondary: "#fff" } },
      }}
    />
    <App />
  </StrictMode>,
)