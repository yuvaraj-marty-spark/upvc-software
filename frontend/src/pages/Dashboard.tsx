import { useEffect, useState, useMemo, Fragment } from 'react'
import type { Language } from '../components/Sidebar'
import type { Customer, Project } from './Customers'
import { matchesProjectSerial } from '../utils/projectSerials'
import { apiUrl, authFetch } from '../utils/api'
import './Dashboard.css'

interface WindowItem {
  id: string
  row_order: number
  model_id: string | null
  variant_letter: string | null
  height: number | null
  width: number | null
  input_unit: string
  glass_type: string | null
  status: string
  identification_color: string
}

interface ProjectWindowSummary {
  project_id: string
  project_name: string
  serial_number?: string
  customer_id: string
  customer_name: string
  customer_phone: string | null
  status: string
  created_at: string
  total_windows: number
  finished_windows: number
  not_finished_windows?: number
  pending_windows: number
  completion_pct: number
  windows: WindowItem[]
}

interface MonthHistory {
  month: string
  label: string
  count: number
  pending_count?: number
}

interface WeekHistory {
  week: string
  label: string
  count: number
}

interface DashboardStats {
  project_status: {
    total: number
    pending: number
    active: number
    completed: number
  }
  monthly_pending: {
    current_month_pending: number
    total_pending: number
    history: MonthHistory[]
  }
  orders_per_month: {
    this_month_count: number
    last_month_count: number
    history: MonthHistory[]
  }
  orders_per_week: {
    this_week_count: number
    last_week_count: number
    history: WeekHistory[]
  }
  projects_window_summary: ProjectWindowSummary[]
}

interface DashboardProps {
  language: Language
  onOpenProject?: (customer: Customer, project: Project) => void
  onNewOrder?: () => void
}

export default function Dashboard({
  language,
  onOpenProject,
  onNewOrder,
}: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [updatingWindowId, setUpdatingWindowId] = useState<string | null>(null)
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null)
  const [windowSubFilter, setWindowSubFilter] = useState<Record<string, 'all' | 'finished' | 'pending'>>({})

  // Translations dictionary
  const t = {
    dashboardTitle: language === 'en' ? 'Dashboard & Project Analytics' : 'முகப்பு & திட்ட பகுப்பாய்வு',
    dashboardSub: language === 'en' ? 'Real-time project statuses, pending orders, and window fabrication tracking' : 'நிகழ்நேர திட்ட நிலைகள், நிலுவையில் உள்ள ஆர்டர்கள் மற்றும் சாளர தயாரிப்பு கண்காணிப்பு',
    refresh: language === 'en' ? 'Refresh Data' : 'புதுப்பிக்கவும்',
    newOrder: language === 'en' ? '+ New Order' : '+ புதிய ஆர்டர்',
    
    // KPI Cards
    projectStatus: language === 'en' ? 'Project Status' : 'திட்ட நிலை',
    totalProjects: language === 'en' ? 'Total Projects' : 'மொத்த திட்டங்கள்',
    pendingProjectsMonthly: language === 'en' ? 'Pending Projects (Monthly)' : 'நிலுவை திட்டங்கள் (மாதாந்திரம்)',
    pendingThisMonth: language === 'en' ? 'Pending This Month' : 'இந்த மாதம் நிலுவை',
    allTimePending: language === 'en' ? 'Total Pending:' : 'மொத்த நிலுவை:',
    ordersPerWeek: language === 'en' ? 'Orders Taken This Week' : 'இந்த வாரம் பெறப்பட்ட ஆர்டர்கள்',
    lastWeek: language === 'en' ? 'Last Week:' : 'கடந்த வாரம்:',
    ordersPerMonth: language === 'en' ? 'Orders Taken This Month' : 'இந்த மாதம் பெறப்பட்ட ஆர்டர்கள்',
    lastMonth: language === 'en' ? 'Last Month:' : 'கடந்த மாதம்:',

    // Status Badges
    active: language === 'en' ? 'In Progress' : 'செயலில்',
    pending: language === 'en' ? 'Pending' : 'நிலுவை',
    completed: language === 'en' ? 'Finished' : 'முடிந்தது',
    all: language === 'en' ? 'All' : 'அனைத்தும்',

    // Charts
    monthlyTrend: language === 'en' ? 'Monthly Orders & Pending Trend' : 'மாதாந்திர ஆர்டர்கள் & நிலுவை போக்கு',
    weeklyTrend: language === 'en' ? 'Weekly Order Volume' : 'வாராந்திர ஆர்டர் அளவு',
    ordersLegend: language === 'en' ? 'Orders Taken' : 'பெறப்பட்ட ஆர்டர்கள்',
    pendingLegend: language === 'en' ? 'Pending Projects' : 'நிலுவை திட்டங்கள்',

    // Projects Window Table
    windowFabricationSection: language === 'en' ? 'Project Window Status (Finished & Not Finished)' : 'திட்ட சாளர நிலை (முடிந்தது & முடியாதவை)',
    windowSectionSub: language === 'en' ? 'Track finished vs not finished windows for each project. All windows finished automatically completes project.' : 'ஒவ்வொரு திட்டத்திற்கும் முடிந்த மற்றும் முடியாத சாளரங்களை கண்காணிக்கவும். அனைத்தும் முடிந்ததும் திட்டம் தானாக முடிவடையும்.',
    searchPlaceholder: language === 'en' ? 'Search project, customer or ID (e.g. proj-1)...' : 'திட்டம், வாடிக்கையாளர் அல்லது ID (எ.கா. proj-1) மூலம் தேடவும்...',
    projectCol: language === 'en' ? 'Project & Customer' : 'திட்டம் & வாடிக்கையாளர்',
    statusCol: language === 'en' ? 'Project Status' : 'திட்ட நிலை',
    totalWindowsCol: language === 'en' ? 'Total Windows' : 'மொத்த சாளரங்கள்',
    finishedCol: language === 'en' ? 'Finished Windows' : 'முடிந்த சாளரங்கள்',
    pendingCol: language === 'en' ? 'Not Finished Windows' : 'முடியாத சாளரங்கள்',
    progressCol: language === 'en' ? 'Fabrication Progress' : 'தயாரிப்பு முன்னேற்றம்',
    actionsCol: language === 'en' ? 'Actions' : 'செயல்கள்',
    viewWindows: language === 'en' ? 'View Windows' : 'சாளரங்களைப் பார்',
    hideWindows: language === 'en' ? 'Hide Windows' : 'சாளரங்களை மறை',
    openOrder: language === 'en' ? 'Open in Measurements' : 'அளவீடுகளில் திறக்கவும்',
    noProjectsFound: language === 'en' ? 'No projects matching filter' : 'பொருந்தும் திட்டங்கள் எதுவும் இல்லை',
    
    // Window Items & Actions
    markFinished: language === 'en' ? '✓ Mark Finished' : '✓ முடிந்தது என குறிக்கவும்',
    markPending: language === 'en' ? '⏳ Mark Not Finished' : '⏳ முடியாதது என குறிக்கவும்',
    markAllFinished: language === 'en' ? '✓ Mark All Windows Finished (Auto-Complete)' : '✓ அனைத்து சாளரங்களும் முடிந்தது (தானாக முடி)',
    allWindowsTab: language === 'en' ? 'All Windows' : 'அனைத்து சாளரங்கள்',
    finishedTab: language === 'en' ? 'Finished' : 'முடிந்தது',
    notFinishedTab: language === 'en' ? 'Not Finished' : 'முடியாதவை',
    windowLabel: language === 'en' ? 'Window' : 'சாளரம்',
    glass: language === 'en' ? 'Glass' : 'கண்ணாடி',
  }

  const fetchStats = async (isManual = false) => {
    try {
      const res = await authFetch(apiUrl('/dashboard/stats'))
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        return
      }
    } catch (err) {
      console.warn('Backend offline or not reachable, loading stats from local storage fallback:', err)
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }

    type FallbackRow = {
      id?: string | number
      variantLetter?: string
      isFinished?: boolean
      status?: string
      height?: string | number
      width?: string | number
      modelId?: string
      glassType?: string
      identificationColor?: string
    }
    type FallbackOrder = {
      id?: string
      projectName?: string
      customerName?: string
      customerId?: string
      customerPhone?: string
      serialNumber?: string
      orderDate?: string
      fromUnit?: string
      rows?: FallbackRow[]
    }

    // Client-side fallback from saved orders for zero-crash offline/static deployment
    try {
      const stored = localStorage.getItem('ls-interiors-saved-orders')
      if (stored) {
        const orders: unknown = JSON.parse(stored)
        if (Array.isArray(orders) && orders.length > 0) {
          const summaries: ProjectWindowSummary[] = (orders as FallbackOrder[]).map((o, idx) => {
            const rows = o.rows || []
            const total = rows.length
            const finished = rows.filter(
              (r) => Boolean(r.isFinished) || r.status === 'finished'
            ).length
            const pending = total - finished
            const pct = total > 0 ? Math.round((finished / total) * 1000) / 10 : 0
            const status = total > 0 && finished === total ? 'completed' : 'pending'
            return {
              project_id: o.id || `proj-${idx + 1}`,
              project_name: o.projectName || o.customerName || `Project ${idx + 1}`,
              serial_number: o.serialNumber || `PROJ-${idx + 1}`,
              customer_id: o.customerId || 'cust-1',
              customer_name: o.customerName || 'General Customer',
              customer_phone: o.customerPhone || '',
              status,
              created_at: o.orderDate || new Date().toISOString(),
              total_windows: total,
              finished_windows: finished,
              not_finished_windows: pending,
              pending_windows: pending,
              completion_pct: pct,
              windows: rows.map((r, wIdx) => ({
                id: String(r.id || `win-${wIdx + 1}`),
                row_order: wIdx + 1,
                model_id: r.modelId || null,
                variant_letter: r.variantLetter || '',
                height: r.height !== undefined && r.height !== '' ? Number(r.height) : null,
                width: r.width !== undefined && r.width !== '' ? Number(r.width) : null,
                input_unit: o.fromUnit || 'in',
                glass_type: r.glassType || null,
                status: r.isFinished || r.status === 'finished' ? 'finished' : 'pending',
                identification_color: r.identificationColor || '#FDE68A',
              })),
            }
          })
          const totalProjects = summaries.length
          const completedProjects = summaries.filter(s => s.status === 'completed').length
          const pendingProjects = totalProjects - completedProjects
          setStats({
            project_status: {
              total: totalProjects,
              pending: pendingProjects,
              active: 0,
              completed: completedProjects,
            },
            monthly_pending: {
              current_month_pending: pendingProjects,
              total_pending: pendingProjects,
              history: [],
            },
            orders_per_month: {
              this_month_count: totalProjects,
              last_month_count: 0,
              history: [],
            },
            orders_per_week: {
              this_week_count: totalProjects,
              last_week_count: 0,
              history: [],
            },
            projects_window_summary: summaries,
          })
        }
      }
    } catch (e) {
      console.error('Error generating fallback stats:', e)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => fetchStats())
  }, [])

  // Toggle single window status
  const handleToggleWindowStatus = async (
    projectId: string,
    windowId: string,
    currentStatus: string
  ) => {
    const nextStatus = currentStatus === 'finished' ? 'pending' : 'finished'
    setUpdatingWindowId(windowId)

    // Optimistic update
    setStats((prev) => {
      if (!prev) return prev
      const updatedSummaries = prev.projects_window_summary.map((proj) => {
        if (proj.project_id !== projectId) return proj
        const updatedWindows = proj.windows.map((w) =>
          w.id === windowId ? { ...w, status: nextStatus } : w
        )
        const total = updatedWindows.length
        const finished = updatedWindows.filter((w) => w.status === 'finished').length
        const pending = total - finished
        const pct = total > 0 ? Math.round((finished / total) * 1000) / 10 : 0
        let newProjectStatus = proj.status
        if (total > 0 && finished === total) {
          newProjectStatus = 'completed'
        } else if (total > 0 && finished < total && proj.status === 'completed') {
          newProjectStatus = 'active'
        }
        return {
          ...proj,
          status: newProjectStatus,
          windows: updatedWindows,
          finished_windows: finished,
          pending_windows: pending,
          not_finished_windows: pending,
          completion_pct: pct,
        }
      })
      return { ...prev, projects_window_summary: updatedSummaries }
    })

    try {
      const res = await authFetch(apiUrl(`/projects/${projectId}/measurements/${windowId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        fetchStats()
      } else {
        // Refresh stats to ensure project status cards are synchronized
        fetchStats()
      }
    } catch (err) {
      console.error('Error updating window status:', err)
      fetchStats()
    } finally {
      setUpdatingWindowId(null)
    }
  }

  // Mark all windows in project finished or pending in one click
  const handleMarkAllWindows = async (
    projectId: string,
    targetStatus: 'finished' | 'pending'
  ) => {
    setUpdatingProjectId(projectId)
    try {
      const res = await authFetch(apiUrl(`/projects/${projectId}/measurements/mark-all-status`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
      if (res.ok) {
        await fetchStats()
      }
    } catch (err) {
      console.error('Error marking all windows:', err)
      fetchStats()
    } finally {
      setUpdatingProjectId(null)
    }
  }

  // Update project status
  const handleUpdateProjectStatus = async (
    projectId: string,
    newStatus: string
  ) => {
    setUpdatingProjectId(projectId)
    // Optimistic update
    setStats((prev) => {
      if (!prev) return prev
      const updatedSummaries = prev.projects_window_summary.map((proj) =>
        proj.project_id === projectId ? { ...proj, status: newStatus } : proj
      )
      return { ...prev, projects_window_summary: updatedSummaries }
    })

    try {
      const res = await authFetch(apiUrl(`/projects/${projectId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        // Refresh to re-tally overall status counts accurately
        fetchStats()
      } else {
        // Revert optimistic state on failure
        fetchStats()
      }
    } catch (err) {
      console.error('Error updating project status:', err)
      fetchStats()
    } finally {
      setUpdatingProjectId(null)
    }
  }

  // Toggle accordion expand
  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }))
  }

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!stats) return []
    return stats.projects_window_summary.filter((proj) => {
      // Status filter
      if (statusFilter !== 'all') {
        const isAllFinished = proj.total_windows > 0 && proj.finished_windows === proj.total_windows
        const st = isAllFinished ? 'completed' : proj.status.toLowerCase()
        if (statusFilter === 'active' && st !== 'active' && st !== 'in_progress') return false
        if (statusFilter === 'pending' && st !== 'pending') return false
        if (statusFilter === 'completed' && st !== 'completed' && st !== 'finished') return false
      }
      // Search query: match name, customer, phone, or project ID / serial number (e.g. proj-1)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchName = proj.project_name.toLowerCase().includes(query)
        const matchCust = proj.customer_name.toLowerCase().includes(query)
        const matchPhone = proj.customer_phone?.toLowerCase().includes(query) || false
        const matchSerial = matchesProjectSerial(proj.serial_number, query)
        if (!matchName && !matchCust && !matchPhone && !matchSerial) return false
      }
      return true
    })
  }, [stats, statusFilter, searchQuery])

  // Calculate highest count for bar chart scaling
  const maxMonthlyOrders = useMemo(() => {
    if (!stats) return 10
    const counts = stats.orders_per_month.history.map((m) =>
      Math.max(m.count, m.pending_count || 0)
    )
    return Math.max(...counts, 4)
  }, [stats])

  const maxWeeklyOrders = useMemo(() => {
    if (!stats) return 10
    const counts = stats.orders_per_week.history.map((w) => w.count)
    return Math.max(...counts, 4)
  }, [stats])

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-empty-state">
          <div className="spin-icon" style={{ fontSize: '32px', marginBottom: '12px' }}>⟳</div>
          <p>{language === 'en' ? 'Loading dashboard analytics...' : 'முகப்பு பகுப்பாய்வு ஏற்றப்படுகிறது...'}</p>
        </div>
      </div>
    )
  }

  const pStatus = stats?.project_status || { total: 0, pending: 0, active: 0, completed: 0 }
  const mPending = stats?.monthly_pending || { current_month_pending: 0, total_pending: 0, history: [] }
  const mOrders = stats?.orders_per_month || { this_month_count: 0, last_month_count: 0, history: [] }
  const wOrders = stats?.orders_per_week || { this_week_count: 0, last_week_count: 0, history: [] }

  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <div className="dashboard-top-bar">
        <div className="dashboard-title-area">
          <h2>{t.dashboardTitle}</h2>
          <p>{t.dashboardSub}</p>
        </div>
        <div className="dashboard-actions-area">
          <button
            type="button"
            className="dashboard-btn dashboard-btn-outline"
            onClick={() => {
              setRefreshing(true)
              void fetchStats(true)
            }}
            disabled={refreshing}
          >
            <span className={refreshing ? 'spin-icon' : ''}>⟳</span>
            {t.refresh}
          </button>

          {onNewOrder && (
            <button
              type="button"
              className="dashboard-btn dashboard-btn-primary"
              onClick={onNewOrder}
            >
              {t.newOrder}
            </button>
          )}
        </div>
      </div>

      {/* 4 Core Metric KPI Cards */}
      <div className="dashboard-metrics-grid">
        {/* Card 1: Project Status */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">{t.projectStatus}</span>
            <div className="metric-card-icon metric-icon-blue">📁</div>
          </div>
          <div className="metric-card-value">{pStatus.total}</div>
          <div className="metric-card-subtext">
            <span className="metric-pill metric-pill-pending">
              {pStatus.pending} {t.pending}
            </span>
            <span className="metric-pill metric-pill-active">
              {pStatus.active} {t.active}
            </span>
            <span className="metric-pill metric-pill-completed">
              {pStatus.completed} {t.completed}
            </span>
          </div>
        </div>

        {/* Card 2: Monthly Pending Projects */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">{t.pendingProjectsMonthly}</span>
            <div className="metric-card-icon metric-icon-amber">⏳</div>
          </div>
          <div className="metric-card-value">{mPending.current_month_pending}</div>
          <div className="metric-card-subtext">
            <span>{t.pendingThisMonth}</span>
            <span style={{ fontWeight: 700, color: '#b45309' }}>
              {t.allTimePending} {mPending.total_pending}
            </span>
          </div>
        </div>

        {/* Card 3: Orders Taken Per Week */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">{t.ordersPerWeek}</span>
            <div className="metric-card-icon metric-icon-green">📅</div>
          </div>
          <div className="metric-card-value">{wOrders.this_week_count}</div>
          <div className="metric-card-subtext">
            <span>
              {t.lastWeek} <strong>{wOrders.last_week_count}</strong>
            </span>
            {wOrders.this_week_count >= wOrders.last_week_count ? (
              <span style={{ color: '#059669', fontWeight: 700 }}>
                ↑ +{wOrders.this_week_count - wOrders.last_week_count}
              </span>
            ) : (
              <span style={{ color: '#dc2626', fontWeight: 700 }}>
                ↓ {wOrders.this_week_count - wOrders.last_week_count}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Orders Taken Per Month */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">{t.ordersPerMonth}</span>
            <div className="metric-card-icon metric-icon-purple">📊</div>
          </div>
          <div className="metric-card-value">{mOrders.this_month_count}</div>
          <div className="metric-card-subtext">
            <span>
              {t.lastMonth} <strong>{mOrders.last_month_count}</strong>
            </span>
            {mOrders.this_month_count >= mOrders.last_month_count ? (
              <span style={{ color: '#059669', fontWeight: 700 }}>
                ↑ +{mOrders.this_month_count - mOrders.last_month_count}
              </span>
            ) : (
              <span style={{ color: '#dc2626', fontWeight: 700 }}>
                ↓ {mOrders.this_month_count - mOrders.last_month_count}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Visual Analytics / Charts Row */}
      <div className="dashboard-analytics-row">
        {/* Chart 1: Monthly Orders & Pending Trend */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3>{t.monthlyTrend}</h3>
            <span className="analytics-badge">
              {language === 'en' ? 'Last 6 Months' : 'கடந்த 6 மாதங்கள்'}
            </span>
          </div>

          <div className="chart-bars-container">
            {mOrders.history.map((item) => {
              const ordersHeightPct = Math.round((item.count / maxMonthlyOrders) * 100)
              const pendingHeightPct = Math.round(((item.pending_count || 0) / maxMonthlyOrders) * 100)

              return (
                <div key={item.month} className="chart-bar-group">
                  <div className="chart-bars-pair">
                    {/* Orders Taken bar */}
                    <div
                      className="chart-bar chart-bar-orders"
                      style={{ height: `${Math.max(ordersHeightPct, 6)}%` }}
                    >
                      {item.count > 0 && (
                        <span className="chart-bar-tooltip">{item.count}</span>
                      )}
                    </div>
                    {/* Pending bar */}
                    <div
                      className="chart-bar chart-bar-pending"
                      style={{ height: `${Math.max(pendingHeightPct, 6)}%` }}
                    >
                      {(item.pending_count || 0) > 0 && (
                        <span className="chart-bar-tooltip">{item.pending_count}</span>
                      )}
                    </div>
                  </div>
                  <span className="chart-bar-label">{item.label}</span>
                </div>
              )
            })}
          </div>

          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-color-dot" style={{ background: '#3b82f6' }}></span>
              <span>{t.ordersLegend}</span>
            </div>
            <div className="legend-item">
              <span className="legend-color-dot" style={{ background: '#f59e0b' }}></span>
              <span>{t.pendingLegend}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Weekly Orders Volume */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3>{t.weeklyTrend}</h3>
            <span className="analytics-badge">
              {language === 'en' ? 'Last 6 Weeks' : 'கடந்த 6 வாரங்கள்'}
            </span>
          </div>

          <div className="chart-bars-container">
            {wOrders.history.map((item) => {
              const heightPct = Math.round((item.count / maxWeeklyOrders) * 100)
              return (
                <div key={item.week} className="chart-bar-group">
                  <div className="chart-bars-pair">
                    <div
                      className="chart-bar chart-bar-orders"
                      style={{ height: `${Math.max(heightPct, 6)}%`, width: '28px' }}
                    >
                      {item.count > 0 && (
                        <span className="chart-bar-tooltip">{item.count}</span>
                      )}
                    </div>
                  </div>
                  <span className="chart-bar-label">{item.label}</span>
                </div>
              )
            })}
          </div>

          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-color-dot" style={{ background: '#3b82f6' }}></span>
              <span>{t.ordersLegend}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Section: Per-Project Window Status (Finished & Pending) */}
      <div className="projects-window-section">
        <div className="section-top-toolbar">
          <div className="section-title-group">
            <h3>{t.windowFabricationSection}</h3>
            <p>{t.windowSectionSub}</p>
          </div>

          <div className="section-filters">
            <input
              type="text"
              className="filter-search-input"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                {t.all} ({stats?.project_status.total || 0})
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${statusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                {t.pending} ({stats?.project_status.pending || 0})
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${statusFilter === 'active' ? 'active' : ''}`}
                onClick={() => setStatusFilter('active')}
              >
                {t.active} ({stats?.project_status.active || 0})
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${statusFilter === 'completed' ? 'active' : ''}`}
                onClick={() => setStatusFilter('completed')}
              >
                {t.completed} ({stats?.project_status.completed || 0})
              </button>
            </div>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="dashboard-empty-state">
            <p>{t.noProjectsFound}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="projects-window-table">
              <thead>
                <tr>
                  <th>{t.projectCol}</th>
                  <th>{t.statusCol}</th>
                  <th style={{ textAlign: 'center' }}>{t.totalWindowsCol}</th>
                  <th style={{ textAlign: 'center' }}>{t.finishedCol}</th>
                  <th style={{ textAlign: 'center' }}>{t.pendingCol}</th>
                  <th>{t.progressCol}</th>
                  <th style={{ textAlign: 'right' }}>{t.actionsCol}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => {
                  const isExpanded = !!expandedProjects[project.project_id]
                  const isAllFinished = project.total_windows > 0 && project.finished_windows === project.total_windows
                  const statusKey = isAllFinished ? 'completed' : (project.status.toLowerCase() === 'finished' ? 'completed' : project.status.toLowerCase())

                  return (
                    <Fragment key={project.project_id}>
                      <tr className="project-row">
                        {/* Project & Customer Name */}
                        <td>
                          <div className="project-name-cell">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                              {project.serial_number && (
                                <span
                                  style={{
                                    backgroundColor: '#2563eb',
                                    color: '#ffffff',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.5px',
                                  }}
                                >
                                  {project.serial_number}
                                </span>
                              )}
                              <span className="project-name-title">{project.project_name}</span>
                            </div>
                            <span className="project-customer-subtitle">
                              👤 {project.customer_name} {project.customer_phone ? `(${project.customer_phone})` : ''}
                            </span>
                          </div>
                        </td>

                        {/* Project Status with Dropdown */}
                        <td>
                          <select
                            className={`status-select ${statusKey === 'completed' ? 'completed' : statusKey === 'pending' ? 'pending' : 'active'}`}
                            value={statusKey}
                            disabled={updatingProjectId === project.project_id}
                            onChange={(e) =>
                              handleUpdateProjectStatus(project.project_id, e.target.value)
                            }
                          >
                            <option value="pending">⏳ {t.pending}</option>
                            <option value="active">⚙️ {t.active}</option>
                            <option value="completed">✓ {t.completed}</option>
                          </select>
                        </td>

                        {/* Total Windows */}
                        <td style={{ textAlign: 'center' }}>
                          <span className="window-count-badge window-count-total">
                            {project.total_windows}
                          </span>
                        </td>

                        {/* Finished Windows */}
                        <td style={{ textAlign: 'center' }}>
                          <span className="window-count-badge window-count-finished">
                            ✓ {project.finished_windows}
                          </span>
                        </td>

                        {/* Pending Windows */}
                        <td style={{ textAlign: 'center' }}>
                          <span className="window-count-badge window-count-pending">
                            ⏳ {project.pending_windows}
                          </span>
                        </td>

                        {/* Progress Bar */}
                        <td>
                          <div className="project-progress-wrapper">
                            <div className="project-progress-bar-bg">
                              <div
                                className="project-progress-bar-fill"
                                style={{
                                  width: `${project.completion_pct}%`,
                                  background:
                                    project.completion_pct === 100
                                      ? '#10b981'
                                      : project.completion_pct > 0
                                      ? 'linear-gradient(90deg, #3b82f6, #10b981)'
                                      : '#f59e0b',
                                }}
                              ></div>
                            </div>
                            <span className="project-progress-text">
                              {project.completion_pct}%
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="dashboard-btn dashboard-btn-outline"
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                              onClick={() => toggleProjectExpand(project.project_id)}
                            >
                              {isExpanded ? `▲ ${t.hideWindows}` : `▼ ${t.viewWindows} (${project.total_windows})`}
                            </button>

                            {onOpenProject && (
                              <button
                                type="button"
                                className="dashboard-btn dashboard-btn-primary"
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => {
                                  const cust: Customer = {
                                    id: project.customer_id,
                                    name: project.customer_name,
                                    phone: project.customer_phone,
                                    email: null,
                                    address: null,
                                    is_active: true,
                                  }
                                  const proj: Project = {
                                    id: project.project_id,
                                    customer_id: project.customer_id,
                                    name: project.project_name,
                                    description: null,
                                    status: project.status,
                                    input_unit: 'in',
                                    output_unit: 'mm',
                                    default_tolerance_mm: 5,
                                    default_apply_tolerance: true,
                                    created_at: project.created_at,
                                  }
                                  onOpenProject(cust, proj)
                                }}
                              >
                                {t.openOrder} →
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Subtable of Windows */}
                      {isExpanded && (
                        <tr key={`${project.project_id}-expanded`}>
                          <td colSpan={7} style={{ padding: '0 16px 16px', background: '#f8fafc' }}>
                            <div className="windows-subtable-wrapper">
                              <div className="windows-subtable-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                  <h4 style={{ margin: '0 0 4px' }}>
                                    {t.windowFabricationSection} — {project.project_name} ({project.total_windows} {t.totalWindowsCol})
                                  </h4>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span className="window-count-badge window-count-finished">
                                      ✓ {project.finished_windows} {t.finishedTab}
                                    </span>
                                    <span className="window-count-badge window-count-pending">
                                      ⏳ {project.pending_windows} {t.notFinishedTab}
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  {/* Sub filter tabs: All / Finished / Not Finished */}
                                  <div className="filter-pill-group">
                                    <button
                                      type="button"
                                      className={`filter-tab-btn ${(windowSubFilter[project.project_id] || 'all') === 'all' ? 'active' : ''}`}
                                      onClick={() =>
                                        setWindowSubFilter((prev) => ({
                                          ...prev,
                                          [project.project_id]: 'all',
                                        }))
                                      }
                                    >
                                      {t.allWindowsTab} ({project.total_windows})
                                    </button>
                                    <button
                                      type="button"
                                      className={`filter-tab-btn ${windowSubFilter[project.project_id] === 'finished' ? 'active' : ''}`}
                                      onClick={() =>
                                        setWindowSubFilter((prev) => ({
                                          ...prev,
                                          [project.project_id]: 'finished',
                                        }))
                                      }
                                    >
                                      ✓ {t.finishedTab} ({project.finished_windows})
                                    </button>
                                    <button
                                      type="button"
                                      className={`filter-tab-btn ${windowSubFilter[project.project_id] === 'pending' ? 'active' : ''}`}
                                      onClick={() =>
                                        setWindowSubFilter((prev) => ({
                                          ...prev,
                                          [project.project_id]: 'pending',
                                        }))
                                      }
                                    >
                                      ⏳ {t.notFinishedTab} ({project.pending_windows})
                                    </button>
                                  </div>

                                  {/* Quick action: Mark All Finished */}
                                  {project.pending_windows > 0 && (
                                    <button
                                      type="button"
                                      className="dashboard-btn"
                                      style={{
                                        background: '#ecfdf5',
                                        color: '#065f46',
                                        border: '1px solid #a7f3d0',
                                        padding: '5px 12px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                      }}
                                      disabled={updatingProjectId === project.project_id}
                                      onClick={() => handleMarkAllWindows(project.project_id, 'finished')}
                                    >
                                      {t.markAllFinished}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {project.windows.length === 0 ? (
                                <p style={{ fontSize: '13px', color: '#64748b', margin: '8px 0' }}>
                                  No window measurements added to this project yet.
                                </p>
                              ) : (
                                <div className="windows-grid">
                                  {(() => {
                                    let nextWinNum = 0
                                    let currBaseNum = 0
                                    const winLabelMap = new Map<string, string>()
                                    for (const w of project.windows) {
                                      const letter = w.variant_letter?.toLowerCase().trim() || ''
                                      if (!letter || currBaseNum === 0) {
                                        currBaseNum = ++nextWinNum
                                      }
                                      winLabelMap.set(
                                        w.id,
                                        letter ? `W${currBaseNum}${letter}` : `W${currBaseNum}`
                                      )
                                    }

                                    return project.windows
                                      .filter((win) => {
                                        const currentFilter = windowSubFilter[project.project_id] || 'all'
                                        if (currentFilter === 'finished') return win.status === 'finished'
                                        if (currentFilter === 'pending') return win.status !== 'finished'
                                        return true
                                      })
                                      .map((win) => {
                                        const isWinFinished = win.status === 'finished'
                                        const isUpdating = updatingWindowId === win.id
                                        const windowLabelStr =
                                          winLabelMap.get(win.id) || `W${win.row_order}`

                                      return (
                                        <div
                                          key={win.id}
                                          className={`window-item-card ${isWinFinished ? 'is-finished' : 'is-pending'}`}
                                        >
                                          <div className="window-item-info">
                                            <div className="window-item-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span
                                                style={{
                                                  display: 'inline-block',
                                                  width: '10px',
                                                  height: '10px',
                                                  borderRadius: '3px',
                                                  backgroundColor: win.identification_color || '#FDE68A',
                                                  border: '1px solid #cbd5e1',
                                                }}
                                              ></span>
                                              <span>{windowLabelStr} — {win.model_id || 'Standard'}</span>
                                              <span
                                                style={{
                                                  fontSize: '10px',
                                                  fontWeight: 700,
                                                  padding: '2px 6px',
                                                  borderRadius: '4px',
                                                  background: isWinFinished ? '#dcfce7' : '#fef3c7',
                                                  color: isWinFinished ? '#15803d' : '#b45309',
                                                }}
                                              >
                                                {isWinFinished ? '✓ FINISHED' : '⏳ NOT FINISHED'}
                                              </span>
                                            </div>
                                            <div className="window-item-dims">
                                              {win.height !== null && win.width !== null
                                                ? `${win.height} × ${win.width} ${win.input_unit}`
                                                : 'Dimensions pending'}
                                              {win.glass_type ? ` • ${win.glass_type}` : ''}
                                            </div>
                                          </div>

                                          <button
                                            type="button"
                                            disabled={isUpdating}
                                            className={`window-status-toggle-btn ${isWinFinished ? 'btn-to-pending' : 'btn-to-finished'}`}
                                            onClick={() =>
                                              handleToggleWindowStatus(
                                                project.project_id,
                                                win.id,
                                                win.status
                                              )
                                            }
                                          >
                                            {isUpdating ? '...' : isWinFinished ? t.markPending : t.markFinished}
                                          </button>
                                        </div>
                                      )
                                    })
                                  })()}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
