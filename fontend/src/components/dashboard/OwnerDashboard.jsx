import {
  ArrowUpRight,
  Banknote,
  BookOpen,
  Filter,
  GraduationCap,
  MessagesSquare,
  TrendingUp,
  TriangleAlert,
  UserCog,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { overviewApi } from '../../lib/api'
import { formatMoney } from '../../lib/constants'
import { parseDateOnly } from '../../lib/dateWindow'

const PERIODS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
]

const COUNT_CARDS = [
  { key: 'active_students', label: 'Active Students', to: '/students', icon: GraduationCap },
  { key: 'tutors', label: 'Tutors', to: '/users', icon: UserCog },
  { key: 'active_subjects', label: 'Active Subjects', to: '/subjects', icon: BookOpen },
  { key: 'open_enquiries', label: 'Open Enquiries', to: '/enquiries', icon: MessagesSquare },
]

// All the sums are done server-side (GET /overview/); this only asks for
// them - once on load, again whenever the period changes. The previous
// figures stay on screen while a new period loads, so switching doesn't
// flash the whole page back to a spinner.
function useOverview(period) {
  const [state, setState] = useState({ data: null, loading: true, failed: false })

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ ...prev, loading: true, failed: false }))

    overviewApi
      .get(period)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, failed: true }))
      })

    return () => {
      cancelled = true
    }
  }, [period])

  return state
}

function monthLabel(month, options) {
  return parseDateOnly(`${month}-01`).toLocaleDateString('en-US', options)
}

// Grouped columns: enrolled beside withdrawn, one pair per month, on one
// shared count axis. Each month is a focusable group whose tooltip gives
// the exact figures; the same numbers are in a visually-hidden table.
function EnrollmentTrend({ rows }) {
  const max = Math.max(0, ...rows.flatMap((row) => [row.enrolled, row.withdrawn]))

  if (max === 0) {
    return <p className="recent-enrollments__status">No enrollments or withdrawals in the last six months.</p>
  }

  const height = (value) => `${(value / max) * 100}%`

  return (
    <div className="viz-root">
      <ul className="viz-legend" aria-hidden="true">
        <li>
          <span className="viz-legend__swatch viz-legend__swatch--1" />
          Enrolled
        </li>
        <li>
          <span className="viz-legend__swatch viz-legend__swatch--2" />
          Withdrawn
        </li>
      </ul>

      <div className="trend-chart" aria-hidden="true">
        <div className="trend-chart__axis">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="trend-chart__plot">
          {rows.map((row) => (
            <div key={row.month} className="trend-chart__month" tabIndex={0}>
              <div className="trend-chart__bars">
                <span className="trend-chart__bar trend-chart__bar--1" style={{ height: height(row.enrolled) }} />
                <span className="trend-chart__bar trend-chart__bar--2" style={{ height: height(row.withdrawn) }} />
              </div>
              <span className="trend-chart__label">{monthLabel(row.month, { month: 'short' })}</span>
              <span className="viz-tooltip" role="presentation">
                <strong>{monthLabel(row.month, { month: 'long', year: 'numeric' })}</strong>
                <span>
                  <span className="viz-legend__swatch viz-legend__swatch--1" />
                  Enrolled <b>{row.enrolled}</b>
                </span>
                <span>
                  <span className="viz-legend__swatch viz-legend__swatch--2" />
                  Withdrawn <b>{row.withdrawn}</b>
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* A <table> ignores the 1px width .visually-hidden sets (tables size to
          their content), so it widened the page on phones. The wrapper clips it. */}
      <div className="visually-hidden">
        <table>
          <caption>Enrollments and withdrawals per month, last six months</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Enrolled</th>
              <th scope="col">Withdrawn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <th scope="row">{monthLabel(row.month, { month: 'long', year: 'numeric' })}</th>
                <td>{row.enrolled}</td>
                <td>{row.withdrawn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Funnel({ funnel }) {
  if (funnel.total === 0) {
    return <p className="recent-enrollments__status">No enquiries yet.</p>
  }

  const max = Math.max(...funnel.stages.map((stage) => stage.count))

  return (
    <div className="viz-root">
      <p className="funnel__headline">
        <strong>{Math.round(funnel.conversion_rate * 100)}%</strong> of all enquiries have enrolled ({funnel.enrolled}{' '}
        of {funnel.total})
      </p>
      <ul className="funnel">
        {funnel.stages.map((stage) => (
          <li key={stage.stage} className="funnel__row">
            <span className="funnel__label">{stage.label}</span>
            <span className="funnel__track">
              <span className="funnel__bar" style={{ width: `${(stage.count / max) * 100}%` }} />
              <span className="funnel__count">{stage.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OwnerDashboard() {
  const [period, setPeriod] = useState('this_month')
  const { data, loading, failed } = useOverview(period)
  const periodLabel = PERIODS.find((p) => p.key === period).label.toLowerCase()

  return (
    <div className="page">
      <div className="dashboard-grid">
        {COUNT_CARDS.map(({ key, label, to, icon: Icon }) => (
          <Link key={key} to={to} className="dashboard-card">
            <span className="dashboard-card__top">
              <span className="dashboard-card__icon">
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <ArrowUpRight className="dashboard-card__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="dashboard-card__count">{data ? data.counts[key] : failed ? '—' : '···'}</span>
            <span className="dashboard-card__label">{label}</span>
          </Link>
        ))}
      </div>

      {failed && (
        <p className="form-error overview__error" role="alert">
          Could not load the company overview.
        </p>
      )}

      <section className="recent-enrollments">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <Banknote size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Money</h2>
          </div>
          <div className="period-toggle" role="group" aria-label="Period">
            {PERIODS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`period-toggle__option${option.key === period ? ' period-toggle__option--active' : ''}`}
                aria-pressed={option.key === period}
                onClick={() => setPeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!data && loading && <p className="recent-enrollments__status">Loading…</p>}
        {data && (
          <div className={`money-tiles${loading ? ' money-tiles--loading' : ''}`} aria-busy={loading}>
            <div className="money-tile">
              <span className="money-tile__label">Invoiced</span>
              <span className="money-tile__value">{formatMoney(data.money.invoiced)}</span>
              <span className="money-tile__note">{periodLabel}</span>
            </div>
            <div className="money-tile">
              <span className="money-tile__label">Collected</span>
              <span className="money-tile__value">{formatMoney(data.money.collected)}</span>
              <span className="money-tile__note">{periodLabel}</span>
            </div>
            <div className="money-tile">
              <span className="money-tile__label">Outstanding</span>
              <span className="money-tile__value">{formatMoney(data.money.outstanding)}</span>
              <span className="money-tile__note">owed as of today</span>
            </div>
            <Link to="/invoices" className="money-tile money-tile--link">
              <span className="money-tile__label">
                {data.money.overdue_count > 0 && <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />}
                Overdue
              </span>
              <span className="money-tile__value">{formatMoney(data.money.overdue_amount)}</span>
              <span className="money-tile__note">
                {data.money.overdue_count === 0
                  ? 'nothing past due'
                  : `${data.money.overdue_count} ${data.money.overdue_count === 1 ? 'invoice' : 'invoices'} past due`}
              </span>
            </Link>
          </div>
        )}
      </section>

      {data && (
        <div className="overview-grid">
          <section className="recent-enrollments">
            <div className="recent-enrollments__header">
              <div className="recent-enrollments__title">
                <TrendingUp size={16} strokeWidth={1.75} aria-hidden="true" />
                <h2>Enrollments, last 6 months</h2>
              </div>
            </div>
            <EnrollmentTrend rows={data.enrollment_trend} />
          </section>

          <section className="recent-enrollments">
            <div className="recent-enrollments__header">
              <div className="recent-enrollments__title">
                <Filter size={16} strokeWidth={1.75} aria-hidden="true" />
                <h2>Onboarding funnel</h2>
              </div>
            </div>
            <Funnel funnel={data.funnel} />
          </section>
        </div>
      )}
    </div>
  )
}
