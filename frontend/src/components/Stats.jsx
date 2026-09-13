import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { computeStats, formatDuration } from '../utils/stats'

function formatShortDate(d) {
  if (!d) return ''
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function BarList({ items, maxItems = 10 }) {
  const max = Math.max(1, ...items.map(i => i.count))
  return (
    <div className="bar-list">
      {items.slice(0, maxItems).map(item => (
        <div className="bar-row" key={item.name}>
          <div className="bar-label">{item.name}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <div className="bar-count">{item.count}</div>
        </div>
      ))}
    </div>
  )
}

export default function Stats() {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    fetch('./data/change_log.json').then(r => r.json()).then(setEntries)
  }, [])

  const stats = useMemo(() => (entries ? computeStats(entries) : null), [entries])

  if (!stats) {
    return (
      <div className="app">
        <div className="loading">Loading statistics...</div>
      </div>
    )
  }

  const maxDow = Math.max(1, ...stats.bookingsByDayOfWeek.map(d => d.count))

  return (
    <div className="app stats-page">
      <Link to="/" className="back-link">← Main Page</Link>
      <div className="stats-header">
        <h2>Statistics Dashboard</h2>
        <p className="history-subtitle">
          Data from the Thurston County Jail Roster{stats.earliestBooking ? ` since ${formatShortDate(stats.earliestBooking)}` : ''}
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-num">{stats.totalBookings}</div>
          <div className="stat-card-label">Total Bookings Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num">{stats.totalReleases}</div>
          <div className="stat-card-label">Total Releases Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num">{stats.currentPopulation}</div>
          <div className="stat-card-label">Current Population</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num">{stats.avgDailyPopulation.toFixed(1)}</div>
          <div className="stat-card-label">Avg Daily Population</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num">{stats.recidivismRate.toFixed(1)}%</div>
          <div className="stat-card-label">
            Recidivism Rate ({stats.repeatPeople} of {stats.distinctPeople} people booked more than once)
          </div>
        </div>
      </div>

      <section className="stats-section">
        <h3>Most Common Charges</h3>
        <BarList items={stats.mostCommonCharges} />
      </section>

      <section className="stats-section">
        <h3>Bookings by Day of Week</h3>
        <div className="bar-list">
          {stats.bookingsByDayOfWeek.map(d => (
            <div className="bar-row" key={d.day}>
              <div className="bar-label">{d.day}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(d.count / maxDow) * 100}%` }} />
              </div>
              <div className="bar-count">{d.count}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="stats-section">
        <h3>Time Served Statistics</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-num">{formatDuration(stats.timeServed.meanMs)}</div>
            <div className="stat-card-label">Mean Time Served</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{formatDuration(stats.timeServed.medianMs)}</div>
            <div className="stat-card-label">Median Time Served</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-num">{formatDuration(stats.timeServed.shortestMs)}</div>
            <div className="stat-card-label">Shortest Stay</div>
          </div>
          {stats.timeServed.longestCurrent && (
            <div className="stat-card">
              <div className="stat-card-num">{formatDuration(stats.timeServed.longestCurrent.ms)}</div>
              <div className="stat-card-label">Longest Current Stay — {stats.timeServed.longestCurrent.name}</div>
            </div>
          )}
        </div>
      </section>

      <div className="stats-footer">
        <Link to="/deepstats" className="back-link">Deep Analytics →</Link>
      </div>
    </div>
  )
}
