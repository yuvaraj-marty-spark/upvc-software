import { useEffect, useState } from 'react'

import Customers, { type Customer } from './pages/Customers'
import Sidebar, { type Language, type PageKey } from './components/Sidebar'
import Measurements from './pages/Measurements'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import Drawings from './pages/Drawings'
import PasscodeLogin from './pages/PasscodeLogin'
import {
  apiUrl,
  authFetch,
  clearPasscodeSession,
  getSessionLabel,
  getSessionToken,
} from './utils/api'
import { clearDraftFormulas } from './utils/formulaStorage'

import './App.css'

function App() {
  const [sessionLabel, setSessionLabel] = useState<string | null>(() =>
    getSessionToken() ? getSessionLabel() || 'Active User' : null
  )
  const [authNotice, setAuthNotice] = useState('')
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('ls-interiors-language') === 'ta' ? 'ta' : 'en'
    } catch {
      return 'en'
    }
  })

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage)
    try {
      localStorage.setItem('ls-interiors-language', nextLanguage)
    } catch {
      // Ignore storage errors
    }
  }
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeFormulaProjectId, setActiveFormulaProjectId] = useState<string | null>(null)

  useEffect(() => {
    const handleExpired = () => {
      setSessionLabel(null)
      setSelectedCustomer(null)
      setSelectedProjectId(null)
      setActiveFormulaProjectId(null)
      setAuthNotice('Your session expired. Please enter your passcode again.')
    }
    window.addEventListener('ls-passcode-expired', handleExpired)
    return () => window.removeEventListener('ls-passcode-expired', handleExpired)
  }, [])

  useEffect(() => {
    if (!sessionLabel) return
    const sendHeartbeat = () => {
      if (!getSessionToken()) return
      void authFetch(apiUrl('/passcode/heartbeat'), { method: 'POST' })
    }
    sendHeartbeat()
    const id = window.setInterval(sendHeartbeat, 20000)
    return () => window.clearInterval(id)
  }, [sessionLabel])

  async function handleLogout() {
    try {
      await authFetch(apiUrl('/passcode/logout'), { method: 'POST' })
    } catch {
      // Ignore network errors on logout
    } finally {
      clearPasscodeSession()
      setSessionLabel(null)
      setSelectedCustomer(null)
      setSelectedProjectId(null)
      setActiveFormulaProjectId(null)
      setActivePage('dashboard')
    }
  }

  if (!sessionLabel) {
    return (
      <PasscodeLogin
        initialError={authNotice}
        onSuccess={(label) => {
          setAuthNotice('')
          setSessionLabel(label)
        }}
      />
    )
  }

  const pageTitles: Record<PageKey, { en: string; ta: string }> = {
    dashboard: { en: 'Dashboard', ta: 'முகப்பு' },
    customers: { en: 'Customers', ta: 'வாடிக்கையாளர்கள்' },
    measurementsOrders: {
      en: 'Measurements & Orders',
      ta: 'அளவீடுகள் மற்றும் ஆர்டர்கள்',
    },
    drawings: { en: 'Drawings & PDFs', ta: 'வரைபடங்கள் மற்றும் PDF' },
    settings: { en: 'Settings', ta: 'அமைப்புகள்' },
  }

  const currentTitle = pageTitles[activePage]

  function handleNewOrder(customer: Customer) {
    clearDraftFormulas()
    setSelectedCustomer(customer)
    setSelectedProjectId(null)
    setActiveFormulaProjectId(null)
    setActivePage('measurementsOrders')
  }

  return (
    <div className="app-shell">
      <Sidebar
        language={language}
        onLanguageChange={handleLanguageChange}
        activePage={activePage}
        onNavigate={setActivePage}
        sessionLabel={sessionLabel}
        onLogout={() => void handleLogout()}
      />

      <main className="main-content">
        <header className="dashboard-header">
          <div>
            <h1>{language === 'en' ? currentTitle.en : currentTitle.ta}</h1>
            <p>
              {language === 'en'
                ? 'Welcome to LS INTERIORS'
                : 'LS INTERIORS-க்கு வரவேற்கிறோம்'}
            </p>
          </div>
        </header>

        {activePage === 'dashboard' ? (
          <Dashboard
            language={language}
            onOpenProject={(customer, project) => {
              clearDraftFormulas()
              setSelectedCustomer(customer)
              setSelectedProjectId(project.id)
              setActiveFormulaProjectId(project.id)
              setActivePage('measurementsOrders')
            }}
            onNewOrder={() => {
              clearDraftFormulas()
              setSelectedCustomer(null)
              setSelectedProjectId(null)
              setActiveFormulaProjectId(null)
              setActivePage('measurementsOrders')
            }}
          />
        ) : activePage === 'customers' ? (
          <Customers
            language={language}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={(customer) => {
              if (customer?.id !== selectedCustomer?.id) {
                clearDraftFormulas()
                setSelectedProjectId(null)
                setActiveFormulaProjectId(null)
              }
              setSelectedCustomer(customer)
            }}
            onNewOrder={handleNewOrder}
          />
        ) : activePage === 'measurementsOrders' ? (
          <Measurements
            key={selectedProjectId || (selectedCustomer ? `customer-${selectedCustomer.id}` : 'new-order')}
            selectedCustomer={selectedCustomer}
            initialProjectId={selectedProjectId}
            language={language}
            onProjectActive={setActiveFormulaProjectId}
          />
        ) : activePage === 'drawings' ? (
          <Drawings
            language={language}
            initialProjectId={selectedProjectId}
            onOpenMeasurements={(projId, customer) => {
              clearDraftFormulas()
              if (projId) {
                setSelectedProjectId(projId)
                setActiveFormulaProjectId(projId)
              }
              if (customer) setSelectedCustomer(customer)
              setActivePage('measurementsOrders')
            }}
          />
        ) : activePage === 'settings' ? (
          <Settings
            key={`${selectedCustomer?.id || 'none'}-${activeFormulaProjectId || 'new-order'}`}
            language={language}
            selectedProjectId={activeFormulaProjectId}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={(customer, projectId) => {
              clearDraftFormulas()
              setSelectedCustomer(customer)
              setSelectedProjectId(projectId)
              setActiveFormulaProjectId(projectId)
            }}
          />
        ) : (
          <section className="dashboard-placeholder">{currentTitle.en}</section>
        )}
      </main>
    </div>
  )
}

export default App
