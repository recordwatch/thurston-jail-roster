const DAY_MS = 86400000
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Ordered most-specific-first: a charge is placed in the first category whose
// keyword matches. Broad categories (Property, Court/Supervision) sit later so
// e.g. "ASSAULT ... WHILE ARMED" lands in Violent Crime, not Weapons Offense.
export const CHARGE_CATEGORIES = [
  { name: 'Sex Offense', keywords: ['RAPE', 'CHILD MOLESTATION', 'INDECENT LIBERTIES', 'SEXUAL EXPLOITATION', 'SEXUAL ABUSE', 'VOYEURISM', 'COMMUNICATION WITH MINOR', 'FAILURE TO REGISTER AS A SEX OFFENDER', 'DEPICTIONS OF MINOR', 'INDECENT EXPOSURE', 'COMMERCIAL SEXUAL ABUSE'] },
  { name: 'Violent Crime', keywords: ['ASSAULT', 'MURDER', 'MANSLAUGHTER', 'ROBBERY', 'KIDNAPPING', 'STRANGULATION', 'ARSON', 'DRIVE-BY SHOOTING', 'UNLAWFUL IMPRISONMENT', 'HARASSMENT', 'STALKING', 'RECKLESS ENDANGERMENT', 'THREATENING', 'INTIMIDATING A WITNESS', 'INTIMIDATION', 'CRIMINAL MISTREATMENT'] },
  { name: 'Weapons Offense', keywords: ['FIREARM', 'WEAPON', 'PISTOL', 'RIFLE', 'EXPLOSIVE', 'INCENDIARY'] },
  { name: 'Drug Offense', keywords: ['CONTROLLED SUBSTANCE', 'UPCS', 'UMCS', 'UDCS', 'NARCOTIC', 'COCAINE', 'HEROIN', 'MARIJUANA', 'DRUG PARAPHERNALIA'] },
  { name: 'DUI / Traffic', keywords: ['DRIVING UNDER THE INFLUENCE', 'DUI', 'DWLS', 'RECKLESS DRIVING', 'HIT AND RUN', 'PHYSICAL CONTROL', 'NEGLIGENT DRIVING', 'ELUDING', 'IGNITION INTERLOCK', 'FAIL TO TRANSFER TITLE', 'VEHICULAR ASSAULT', 'VEHICULAR HOMICIDE'] },
  { name: 'Property Crime', keywords: ['BURGLARY', 'THEFT', 'MALICIOUS MISCHIEF', 'TRESPASS', 'VEHICLE PROWL', 'FORGERY', 'IDENTITY THEFT', 'STOLEN', 'VANDALISM', 'POSSESSION OF ANOTHERS IDENTIFICATION', 'EXTORTION'] },
  { name: 'Court / Supervision Violation', keywords: ['VIOLATION OF', 'VIOL DV', 'PROBATION VIOLATION', 'BAIL JUMPING', 'CONTEMPT', 'FAILURE TO APPEAR', 'CIVIL COMMITMENT', 'PROTECTION ORDER VIOL'] },
  { name: 'Resisting/Obstructing Law Enforcement', keywords: ['RESISTING ARREST', 'OBSTRUCTING', 'DISARMING LAW ENFORCEMENT', 'INTERFERING WITH REPORTING', 'TAMPER WITH PHYSICAL EVIDENCE', 'TAMPERING WITH A WITNESS', 'MAKING A FALSE OR MISLEADING STATEMENT', 'HARMING A POLICE DOG'] },
  { name: 'Public Order', keywords: ['DISORDERLY CONDUCT', 'CRIMINAL IMPERSONATION', 'MEDICAL CARE VIOLATION'] },
]

export function categorizeCharge(text) {
  if (!text) return 'Other'
  const upper = text.toUpperCase()
  for (const cat of CHARGE_CATEGORIES) {
    if (cat.keywords.some(kw => upper.includes(kw))) return cat.name
  }
  return 'Other'
}

export function parseBail(bailStr) {
  if (!bailStr) return null
  const m = bailStr.match(/\$([\d,]+)/)
  if (!m) return null
  const n = parseInt(m[1].replace(/,/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function getBookedAt(entry) {
  const raw = entry.bookingDate || entry.firstSeen
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d) ? null : d
}

export function getReleasedAt(entry) {
  if (!entry.releasedAt) return null
  const d = new Date(entry.releasedAt)
  return isNaN(d) ? null : d
}

export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const mins = Math.floor(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return `${d}d ${h}h ${m}m`
}

export function formatMoney(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupByName(entries) {
  const byName = new Map()
  for (const e of entries) {
    const key = (e.name || '').trim().toUpperCase()
    if (!key) continue
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(e)
  }
  return byName
}

export function computeStats(entries) {
  const released = entries.filter(e => e.status === 'released')
  const inCustody = entries.filter(e => e.status === 'in_custody')

  const byName = groupByName(entries)
  const distinctPeople = byName.size
  const repeatPeople = [...byName.values()].filter(list => list.length > 1).length
  const recidivismRate = distinctPeople > 0 ? (repeatPeople / distinctPeople) * 100 : 0

  const withStart = entries.map(e => ({ start: getBookedAt(e), end: getReleasedAt(e) })).filter(e => e.start)
  const now = new Date()
  let avgDailyPopulation = inCustody.length
  let earliestBooking = null
    if (withStart.length) {
    earliestBooking = withStart.reduce((min, e) => (e.start < min ? e.start : min), withStart[0].start)

    // Only average over days the scraper was actually watching
    const seen = entries.map(e => new Date(e.firstSeen)).filter(d => !isNaN(d))
    const trackingStart = seen.reduce((min, d) => (d < min ? d : min), seen[0])

    const dayCount = Math.max(1, Math.floor((now - trackingStart) / DAY_MS) + 1)
    let total = 0
    for (let i = 0; i < dayCount; i++) {
      const day = new Date(trackingStart.getTime() + i * DAY_MS)
      let pop = 0
      for (const e of withStart) {
        if (e.start <= day && (!e.end || e.end > day)) pop++
      }
      total += pop
    }
    avgDailyPopulation = total / dayCount
  }

  const bookingsByDayOfWeek = DOW.map(day => ({ day, count: 0 }))
  for (const e of entries) {
    const d = getBookedAt(e)
    if (d) bookingsByDayOfWeek[d.getDay()].count++
  }

  const chargeCounts = {}
  for (const e of entries) {
    for (const c of e.charges || []) {
      if (!c.charge) continue
      const cat = categorizeCharge(c.charge)
      chargeCounts[cat] = (chargeCounts[cat] || 0) + 1
    }
  }
  const mostCommonCharges = Object.entries(chargeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const servedMs = released
    .map(e => {
      const start = getBookedAt(e)
      const end = getReleasedAt(e)
      return start && end ? end - start : null
    })
    .filter(ms => ms != null && ms > 0)

  let longestCurrent = null
  for (const e of inCustody) {
    const start = getBookedAt(e)
    if (!start) continue
    const ms = now - start
    if (!longestCurrent || ms > longestCurrent.ms) longestCurrent = { ms, name: e.name }
  }

  return {
    totalBookings: entries.length,
    totalReleases: released.length,
    currentPopulation: inCustody.length,
    avgDailyPopulation,
    recidivismRate,
    repeatPeople,
    distinctPeople,
    earliestBooking,
    bookingsByDayOfWeek,
    mostCommonCharges,
    timeServed: {
      meanMs: mean(servedMs),
      medianMs: median(servedMs),
      shortestMs: servedMs.length ? Math.min(...servedMs) : null,
      longestCurrent,
    },
  }
}

export function computeDeepStats(entries) {
  const released = entries.filter(e => e.status === 'released')
  const byName = groupByName(entries)
  const distinctPeople = byName.size
  const repeatPeople = [...byName.values()].filter(l => l.length > 1)
  const recidivismRate = distinctPeople ? (repeatPeople.length / distinctPeople) * 100 : 0

  const gapsDays = []
  for (const bookings of repeatPeople) {
    const dates = bookings.map(getBookedAt).filter(Boolean).sort((a, b) => a - b)
    for (let i = 1; i < dates.length; i++) {
      gapsDays.push((dates[i] - dates[i - 1]) / DAY_MS)
    }
  }

  const categoryPeople = {}
  for (const [, bookings] of byName) {
    const cats = new Set()
    for (const b of bookings) {
      for (const c of b.charges || []) {
        if (c.charge) cats.add(categorizeCharge(c.charge))
      }
    }
    for (const cat of cats) categoryPeople[cat] = (categoryPeople[cat] || 0) + 1
  }
  const chargeTypeBreakdown = Object.entries(categoryPeople)
    .map(([name, count]) => ({ name, count, pct: distinctPeople ? (count / distinctPeople) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)

  const bailRows = []
  for (const e of entries) {
    for (const c of e.charges || []) {
      const amt = parseBail(c.bail)
      if (amt) {
        bailRows.push({
          amt,
          name: e.name,
          charge: c.charge,
          status: e.status,
          releasedAt: e.releasedAt,
        })
      }
    }
  }
  bailRows.sort((a, b) => b.amt - a.amt)

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)

  let bailToday = 0, bailWeek = 0, bailMonth = 0, bailYTD = 0
  let bookingsWithBail = 0, bookingsNoBail = 0
  for (const e of entries) {
    const amts = (e.charges || []).map(c => parseBail(c.bail)).filter(Boolean)
    const total = amts.reduce((a, b) => a + b, 0)
    if (amts.length > 0) bookingsWithBail++
    else bookingsNoBail++
    const d = getBookedAt(e)
    if (d && total > 0) {
      if (d >= todayStart) bailToday += total
      if (d >= weekAgo) bailWeek += total
      if (d >= monthStart) bailMonth += total
      if (d >= yearStart) bailYTD += total
    }
  }

  const byCategory = {}
  for (const row of bailRows) {
    const cat = categorizeCharge(row.charge)
    if (!byCategory[cat]) byCategory[cat] = { total: 0, max: 0, count: 0 }
    byCategory[cat].total += row.amt
    byCategory[cat].count++
    if (row.amt > byCategory[cat].max) byCategory[cat].max = row.amt
  }
  const bailByCategory = Object.entries(byCategory)
    .map(([name, s]) => ({ name, avg: s.total / s.count, max: s.max, count: s.count }))
    .sort((a, b) => b.avg - a.avg)

  const servedByCategory = {}
  for (const e of released) {
    const start = getBookedAt(e)
    const end = getReleasedAt(e)
    if (!start || !end || end <= start) continue
    const ms = end - start
    const cats = new Set((e.charges || []).map(c => (c.charge ? categorizeCharge(c.charge) : null)).filter(Boolean))
    if (cats.size === 0) cats.add('Other')
    for (const cat of cats) {
      if (!servedByCategory[cat]) servedByCategory[cat] = []
      servedByCategory[cat].push(ms)
    }
  }
  const timeServedByCharge = Object.entries(servedByCategory)
    .map(([name, arr]) => ({ name, meanMs: mean(arr), medianMs: median(arr), count: arr.length }))
    .sort((a, b) => b.count - a.count)

  return {
    totalReleases: released.length,
    distinctPeople,
    repeatPeople: repeatPeople.length,
    recidivismRate,
    meanGapDays: mean(gapsDays),
    medianGapDays: median(gapsDays),
    chargeTypeBreakdown,
    bail: {
      today: bailToday,
      week: bailWeek,
      month: bailMonth,
      ytd: bailYTD,
      bookingsWithBail,
      bookingsNoBail,
      top10: bailRows.slice(0, 10),
      mostExpensive: bailRows[0] || null,
      byCategory: bailByCategory,
    },
    timeServedByCharge,
  }
}
