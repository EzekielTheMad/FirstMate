import { useEffect, useState } from 'react'
import type { AuthState, PublicSettings } from '@shared/types'
import { useUpdates } from './lib/hooks'
import { Dashboard } from './views/Dashboard'
import { Exploration } from './views/Exploration'
import { Economy } from './views/Economy'
import { Assets } from './views/Assets'
import { Mining } from './views/Mining'
import { Industry } from './views/Industry'
import { Combat } from './views/Combat'
import { Clones } from './views/Clones'
import { Advisor } from './views/Advisor'
import { Settings } from './views/Settings'
import { Loader, EmptyState, ErrorBox } from './components/ui'
import { Nav } from './components/Nav'
import { EveClock } from './components/EveClock'

type TabId =
  | 'dashboard'
  | 'exploration'
  | 'economy'
  | 'assets'
  | 'mining'
  | 'industry'
  | 'combat'
  | 'clones'
  | 'advisor'
  | 'settings'

interface Tab {
  id: TabId
  label: string
  icon: string
  /** Requires an authenticated character. */
  needsAuth?: boolean
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🛰', needsAuth: true },
  { id: 'exploration', label: 'Explore', icon: '🌀' },
  { id: 'economy', label: 'Economy', icon: '💰', needsAuth: true },
  { id: 'assets', label: 'Assets', icon: '📦', needsAuth: true },
  { id: 'mining', label: 'Mining', icon: '⛏', needsAuth: true },
  { id: 'industry', label: 'Industry', icon: '🏭', needsAuth: true },
  { id: 'combat', label: 'Combat', icon: '🎯' },
  { id: 'clones', label: 'Clones', icon: '🧬', needsAuth: true },
  { id: 'advisor', label: 'Advisor', icon: '✨' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
]

export function App(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ status: 'logged-out' })
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [tab, setTab] = useState<TabId>('dashboard')
  const updates = useUpdates()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const updateReady =
    !bannerDismissed &&
    (updates?.status === 'available' || updates?.status === 'downloaded') &&
    Boolean(updates?.newVersion)

  useEffect(() => {
    window.firstmate.settings.get().then(setSettings)
    window.firstmate.auth.getState().then(setAuth)
    const off = window.firstmate.auth.onChange(setAuth)
    return off
  }, [])

  async function login(): Promise<void> {
    setAuth({ status: 'logging-in' })
    const state = await window.firstmate.auth.login()
    setAuth(state)
  }

  async function logout(): Promise<void> {
    const state = await window.firstmate.auth.logout()
    setAuth(state)
  }

  const identity = auth.identity
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  const autoRefreshMs = settings?.autoRefreshSeconds ? settings.autoRefreshSeconds * 1000 : undefined

  return (
    <div className="app">
      {updateReady && (
        <div
          className="update-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            background: 'var(--accent-soft, rgba(56,189,248,0.15))',
            borderBottom: '1px solid var(--border-soft)',
            fontSize: 13
          }}
        >
          <span>
            FirstMate <strong>v{updates?.newVersion}</strong> is available.
          </span>
          <span className="grow" style={{ flex: 1 }} />
          <button className="btn sm primary" onClick={() => setTab('settings')}>
            View &amp; install
          </button>
          <button
            className="btn sm"
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            ✕
          </button>
        </div>
      )}
      <div className="topbar">
        <div className="brand">
          <span className="mark">FM</span>
          <span>FirstMate</span>
        </div>
        <div className="spacer" />
        <EveClock />
        {identity ? (
          <div className="who">
            {identity.portrait && <img src={identity.portrait} alt="" />}
            <div className="meta">
              <div className="name">{identity.characterName}</div>
              <button
                className="status"
                onClick={logout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-faint)',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn primary sm"
            onClick={login}
            disabled={auth.status === 'logging-in'}
          >
            {auth.status === 'logging-in' ? 'Logging in…' : 'Log in with EVE'}
          </button>
        )}
      </div>

      <div className="body">
        <Nav tabs={TABS} active={tab} onSelect={setTab} />

        <div className="content">
          <TabContent
            tab={active}
            auth={auth}
            settings={settings}
            onLogin={login}
            onSettingsSaved={setSettings}
            autoRefreshMs={autoRefreshMs}
          />
        </div>
      </div>
    </div>
  )
}

function TabContent({
  tab,
  auth,
  settings,
  onLogin,
  onSettingsSaved,
  autoRefreshMs
}: {
  tab: Tab
  auth: AuthState
  settings: PublicSettings | null
  onLogin: () => void
  onSettingsSaved: (s: PublicSettings) => void
  autoRefreshMs?: number
}): JSX.Element {
  if (tab.needsAuth && auth.status !== 'logged-in') {
    if (auth.status === 'logging-in') return <Loader label="Waiting for EVE SSO…" />
    return (
      <EmptyState title="Not connected">
        {settings && !settings.ssoClientId ? (
          <>
            Add your EVE application Client ID in <strong>Settings</strong> first, then log in.
          </>
        ) : (
          <div style={{ marginTop: 12 }}>
            {auth.status === 'error' && auth.error && (
              <ErrorBox message={auth.error} />
            )}
            <button className="btn primary" onClick={onLogin}>
              Log in with EVE
            </button>
          </div>
        )}
      </EmptyState>
    )
  }

  switch (tab.id) {
    case 'dashboard':
      return <Dashboard autoRefreshMs={autoRefreshMs} />
    case 'exploration':
      return <Exploration />
    case 'economy':
      return <Economy autoRefreshMs={autoRefreshMs} />
    case 'assets':
      return <Assets autoRefreshMs={autoRefreshMs} />
    case 'mining':
      return <Mining />
    case 'industry':
      return <Industry autoRefreshMs={autoRefreshMs} />
    case 'combat':
      return <Combat />
    case 'clones':
      return <Clones />
    case 'advisor':
      return <Advisor hasKey={settings?.hasAnthropicKey ?? false} />
    case 'settings':
      return settings ? (
        <Settings settings={settings} onSaved={onSettingsSaved} />
      ) : (
        <Loader />
      )
    default:
      return <Dashboard />
  }
}
