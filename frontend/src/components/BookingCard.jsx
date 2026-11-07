import { useState } from 'react'

function calcTimeHeld(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return null
  const totalMins = Math.floor(ms / 60000)
  const days  = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins  = totalMins % 60
  if (days > 0)  return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function BookingCard({ entry }) {
  const [open, setOpen] = useState(false)

  const isReleased = entry.status === 'released'
  // Only on the county's Recently Released list: no idnum, booking or charges.
  const releaseOnly = entry.source === 'released-list'
  const timeHeld = isReleased ? calcTimeHeld(entry.firstSeen, entry.releasedAt) : null

  return (
    <div className={`card ${isReleased ? 'card-released' : 'card-custody'}`}>
      <div className="card-header" onClick={() => setOpen(!open)}>
        <div className="card-left">
          <div className="card-name">{entry.name}</div>
          <div className="card-meta">
            {releaseOnly
              ? <>Docket #{entry.dockets?.join(', ') || 'not listed'} &nbsp;·&nbsp; Not seen in custody by this monitor</>
              : <>ID #{entry.idnum || entry.bookingNumber} &nbsp;·&nbsp; Booked: {entry.bookingDate || entry.firstSeen}</>}
            {timeHeld && <span className="card-time-held"> &nbsp;·&nbsp; Held: {timeHeld}</span>}
          </div>
        </div>
        <div className="card-right">
          <span className={`badge ${isReleased ? 'badge-released' : 'badge-custody'}`}>
            {isReleased ? 'Released' : 'In Custody'}
          </span>
          <span className="card-toggle">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="card-body">
          {isReleased && entry.releasedAt && (
            <div className="card-release-row">
              Released: {entry.releasedAt}{timeHeld && <span className="card-time-held-detail"> &nbsp;·&nbsp; Time held: {timeHeld}</span>}
            </div>
          )}

          {releaseOnly ? (
            <div className="card-charges">
              <div className="charges-title">Charges</div>
              <div className="charge-row charge-pending">Not published. The monitor never saw this person in custody (a stay shorter than its 30-minute check, or during a source outage), so this release comes from the county's released list, which gives only the name, release date and docket number.</div>
            </div>
          ) : entry.charges && entry.charges.length > 0 ? (
            <div className="card-charges">
              <div className="charges-title">Charges ({entry.charges.length})</div>
              {entry.charges.map((c, i) => (
                <div key={i} className="charge-row">
                  <div className="charge-violation">{c.charge || 'Charge pending'}</div>
                  {c.court && (
                    <div className="charge-court">{c.court}{c.causeNumber && ` — Cause #${c.causeNumber}`}</div>
                  )}
                  {c.bail && <div className="charge-bail">Bail: {c.bail}</div>}
                  {c.arrestDate && <div className="charge-agency">Arrest date: {c.arrestDate}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="card-charges">
              <div className="charges-title">Charges</div>
              <div className="charge-row charge-pending">Not yet available — check back shortly.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
