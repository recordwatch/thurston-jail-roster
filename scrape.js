import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { scrapeRoster, scrapeDetailBatch } from './scrapers/thurston.js';
import { nowPST } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ROSTER_FILE = path.join(DATA_DIR, 'roster.json');
const LOG_FILE    = path.join(DATA_DIR, 'change_log.json');
const STATUS_FILE = path.join(DATA_DIR, 'status.json');

// The roster site is un-paginated but lists 250+ people at once. Fetching
// detail for everyone in one run is slow and impolite to a small county
// server, so new bookings are detail-fetched in a capped batch and older
// entries missing detail get backfilled a little at a time each run.
const DETAIL_BATCH_LIMIT = 30;
const BACKFILL_BATCH = 40;

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data));
}

// Earliest arrest date across a person's charges, used as a stand-in for a
// booking date since the roster doesn't expose one directly.
function earliestArrestDate(charges) {
  const dates = (charges || [])
    .map(c => c.arrestDate)
    .filter(Boolean)
    .map(d => ({ raw: d, t: new Date(d).getTime() }))
    .filter(d => !isNaN(d.t));
  if (dates.length === 0) return null;
  dates.sort((a, b) => a.t - b.t);
  return dates[0].raw;
}

async function run() {
  console.log(`[${nowPST()}] Running Thurston County scrape...`);

  let roster = readJSON(ROSTER_FILE, {});
  let log    = readJSON(LOG_FILE, []);

  let inmates;
  try {
    inmates = await scrapeRoster();
  } catch (err) {
    console.error('Roster fetch failed:', err.message);
    process.exit(1);
  }

  if (inmates.length === 0) {
    console.log('Got 0 inmates — skipping to avoid wiping data.');
    process.exit(0);
  }

  const currentIds  = new Set(inmates.map(i => i.idnum));
  const previousIds = new Set(Object.keys(roster));
  const returning = inmates.filter(i => roster[i.idnum]?.status === 'released');
  console.log(`  Roster page: ${inmates.length} | returning (marked released but on page): ${returning.length}`);
  returning.forEach(i => console.log(`    RETURNING: ${i.name} (${i.idnum})`));

  const newBookings = inmates.filter(i => !previousIds.has(i.idnum));
  console.log(`  ${newBookings.length} new booking(s) found`);

  let detailMap = {};
  if (newBookings.length > 0 && newBookings.length <= DETAIL_BATCH_LIMIT) {
    console.log(`  Fetching details for ${newBookings.length} new booking(s)...`);
    detailMap = await scrapeDetailBatch(newBookings.map(i => i.idnum));
  } else if (newBookings.length > DETAIL_BATCH_LIMIT) {
    console.log(`  Skipping details (${newBookings.length} new bookings — likely first run)`);
  }

  for (const inmate of newBookings) {
    console.log(`  NEW: ${inmate.name}`);
    const detail = detailMap[inmate.idnum];
    const charges = detail?.charges || [];
    const hasDetail = !!detail;

    const entry = {
      idnum:         inmate.idnum,
      bookingNumber: inmate.idnum,
      name:          inmate.name,
      status:        'in_custody',
      firstSeen:     nowPST(),
      releasedAt:    null,
      bookingDate:   earliestArrestDate(charges),
      charges,
      hasDetail,
    };

    roster[inmate.idnum] = entry;
    log.unshift(entry);
  }

  // Backfill details for older entries that were skipped on a busy run.
  const needsBackfill = e => !e.hasDetail;
  const backfillIds = Object.values(roster)
    .filter(e => needsBackfill(e) && e.status === 'in_custody')
    .slice(0, BACKFILL_BATCH)
    .map(e => e.idnum);

  if (backfillIds.length > 0) {
    console.log(`  Backfilling details for ${backfillIds.length} existing booking(s)...`);
    const backfillMap = await scrapeDetailBatch(backfillIds);
    for (const id of backfillIds) {
      const detail = backfillMap[id];
      if (!detail) continue;
      const bookingDate = roster[id].bookingDate || earliestArrestDate(detail.charges);
      roster[id] = {
        ...roster[id],
        charges: detail.charges,
        bookingDate,
        hasDetail: true,
      };
      const logEntry = log.find(e => e.idnum === id);
      if (logEntry) Object.assign(logEntry, { charges: detail.charges, bookingDate, hasDetail: true });
    }
    console.log('  Backfill done.');
  }

  // Releases — in previous roster but no longer on the current page.
  const releasedIds = [...previousIds].filter(id => !currentIds.has(id) && roster[id]?.status === 'in_custody');

  for (const id of releasedIds) {
    const inmate = roster[id];
    console.log(`  RELEASED: ${inmate.name}`);
    roster[id].status     = 'released';
    roster[id].releasedAt = nowPST();
    const logEntry = log.find(e => e.idnum === id);
    if (logEntry) {
      logEntry.status     = 'released';
      logEntry.releasedAt = roster[id].releasedAt;
    }
  }

  writeJSON(ROSTER_FILE, roster);
  writeJSON(LOG_FILE, log);

  const inCustody = Object.values(roster).filter(i => i.status === 'in_custody').length;
  writeJSON(STATUS_FILE, { inCustody, lastUpdated: nowPST() });

  console.log(`[${nowPST()}] Done. ${newBookings.length} new, ${releasedIds.length} released. ${inCustody} in custody.`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
