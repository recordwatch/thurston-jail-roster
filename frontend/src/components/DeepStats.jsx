import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { computeDeepStats, formatDuration, formatMoney } from '../utils/stats'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`
}

const TIME_SERVED_COLUMNS = [
  { key: 'name', label: 'Charge Type' },
  { key: 'count', label: 'Count' },
  { key: 'meanMs', label: 'Mean' },
  { key: 'medianMs', label: 'Median' },
]

export default function DeepStats() {
  const [entries, setEntries] = useState(null)
  const [sort, setSort] = useState({ key: 'count', dir: 'desc' })

  useEffect(() => {
    fetch('./data/change_log.json').then(r => r.json()).then(setEntries)
  }, [])

  const stats = useMemo(() => (entries ? computeDeepStats(entries) : null), [entries])

  const sortedTimeServed = useMemo(() => {
    if (!stats) return []
    const rows = [...stats.timeServedByCharge]
    rows.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [stats, sort])

  if (!stats) {
    return (
      <div className="app">
        <div className="loading">Loading deep analytics...</div>
      </div>
    )
  }

  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  const maxPct = Math.max(1, ...stats.chargeTypeBreakdown.map(c => c.pct))

  return (
    <div className="app stats-page">
      <Link to="/" className="back-link">← Main Page</Link>
      <div className="stats-header">
        <h2>Deep Analytics</h2>
        <p className="history-subtitle">Thurston County Jail · {stats.totalReleases} releases in history · Unlisted</p>
      </div>

      <section className="stats-section">
        <h3>Recidivism</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-num">{stats.recidivismRate.toFixed(1)}%</div>
            <div className="stat-card-label">Recidivism Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{stats.repeatPeople} / {stats.distinctPeople}</div>
            <div className="stat-card-label">People Booked More Than Once (of Distinct People Booked)</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{stats.meanGapDays ? `${stats.meanGapDays.toFixed(1)}d` : '—'}</div>
            <div className="stat-card-label">Mean Time Between Arrests (Repeat Offenders)</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{stats.medianGapDays ? `${stats.medianGapDays.toFixed(1)}d` : '—'}</div>
            <div className="stat-card-label">Median Time Between Arrests (Repeat Offenders)</div>
          </div>
        </div>
      </section>

      <section className="stats-section">
        <h3>Charge Type Breakdown</h3>
        <p className="stats-note">
          % of distinct arrestees with at least one charge of this type — a person charged with, say, both a
          drug and a violent offense counts toward both, so this does not sum to 100%.
        </p>
        <div className="bar-list">
          {stats.chargeTypeBreakdown.map(c => (
            <div className="bar-row" key={c.name}>
              <div className="bar-label">{c.name}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(c.pct / maxPct) * 100}%` }} />
              </div>
              <div className="bar-count">{c.pct.toFixed(1)}% ({c.count})</div>
            </div>
          ))}
        </div>
      </section>

      <section className="stats-section">
        <h3>Bail Summary</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-num">{formatMoney(stats.bail.today)}</div>
            <div className="stat-card-label">Today</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{formatMoney(stats.bail.week)}</div>
            <div className="stat-card-label">Last 7 Days</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{formatMoney(stats.bail.month)}</div>
            <div className="stat-card-label">This Month</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{formatMoney(stats.bail.ytd)}</div>
            <div className="stat-card-label">Year to Date</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{stats.bail.bookingsBailSet}</div>
            <div className="stat-card-label">Bail Set</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{stats.bail.bookingsHeldNoBail}</div>
            <div className="stat-card-label">Held Without Bail</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{stats.bail.bookingsBailUnknown}</div>
            <div className="stat-card-label">Unknown (No Charge Data)</div>
          </div>
          {stats.bail.mostExpensive && (
            <div className="stat-card">
              <div className="stat-card-num">{formatMoney(stats.bail.mostExpensive.amt)}</div>
              <div className="stat-card-label">Most Expensive Bail Ever — {stats.bail.mostExpensive.name}</div>
            </div>
          )}
        </div>
      </section>

      <section className="stats-section">
        <h3>Top 10 Bail Leaderboard</h3>
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Bail</th>
                <th>Status</th>
                <th>Released</th>
                <th>Charge</th>
              </tr>
            </thead>
            <tbody>
              {stats.bail.top10.map((row, i) => (
                <tr key={`${row.name}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{row.name}</td>
                  <td>{formatMoney(row.amt)}</td>
                  <td>{row.status === 'released' ? 'Released' : 'In Custody'}</td>
                  <td>{row.status === 'released' ? formatDate(row.releasedAt) : '—'}</td>
                  <td>{row.charge}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stats-section">
        <h3>Average &amp; Max Bail by Charge Type</h3>
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Charge Type</th>
                <th>Avg Bail</th>
                <th>Highest Bail</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {stats.bail.byCategory.map(row => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatMoney(row.avg)}</td>
                  <td>{formatMoney(row.max)}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stats-section">
        <h3>Time Served by Charge Type</h3>
        <p className="stats-note">Click a column to sort — e.g. by Mean to see the longest average holds.</p>
        <div className="table-wrap">
          <table className="stats-table sortable">
            <thead>
              <tr>
                {TIME_SERVED_COLUMNS.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}>
                    {col.label}{sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTimeServed.map(row => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.count}</td>
                  <td>{formatDuration(row.meanMs)}</td>
                  <td>{formatDuration(row.medianMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="stats-footer">
        <Link to="/stats" className="back-link">← Stats</Link>
      </div>
    </div>
  )
}
