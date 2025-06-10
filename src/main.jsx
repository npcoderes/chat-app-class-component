import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import AppContextProvider from './context/AppContext.jsx'
createRoot(document.getElementById('root')).render(
  <>
    <AppContextProvider>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            // Styles applied to all toast types
            style: {
              background: '#ffffff',
              color: '#333333',
              padding: '16px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              fontSize: '14px',
              maxWidth: '350px',
              border: 'none'
            },
            // Custom styling for each toast type
            success: {
              style: {
                background: '#edf7ed',
                border: '1px solid #c6e6c6',
                color: '#1e4620',
                iconTheme: {
                  primary: '#4caf50',
                  secondary: '#ffffff',
                }
              },
              duration: 3000,
            },
            error: {
              style: {
                background: '#fdeded',
                border: '1px solid #f6c9c9',
                color: '#5f2120',
              },
              iconTheme: {
                primary: '#ef5350',
                secondary: '#ffffff',
              },
              duration: 4000,
            },
            loading: {
              style: {
                background: '#e8eaf6',
                border: '1px solid #c5cae9',
                color: '#3f51b5',
              },
              iconTheme: {
                primary: '#3f51b5',
                secondary: '#ffffff',
              },
            },
          }}
        />
      </BrowserRouter>
    </AppContextProvider>

  </>,
)
