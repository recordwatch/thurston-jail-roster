import axios from 'axios';
import * as cheerio from 'cheerio';

// The county moved the roster off www.co.thurston.wa.us (unreachable since
// ~2026-10-30) to this app, which www.thurstoncountywa.gov embeds in an iframe.
// Inmate numbers (Z0012345) are unchanged, so roster.json history carries over.
const BASE_URL = 'https://tcos.thurstoncountywa.gov/Sheriff/Roster';
const ROSTER_URL = BASE_URL;
const DETAIL_BASE = `${BASE_URL}/Detail/`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

export function detailUrl(idnum) {
  return DETAIL_BASE + idnum;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const cellText = ($, td) => $(td).text().replace(/\s+/g, ' ').trim();

function joinName(last, first, middle) {
  const firstMiddle = [first, middle].filter(Boolean).join(' ');
  return firstMiddle ? `${last}, ${firstMiddle}` : last;
}

// One unpaginated page with two tables: everyone currently booked (linked to
// a detail page via idnum) and recent releases (last ~5 days, no idnum).
export async function scrapeRoster() {
  const res = await axios.get(ROSTER_URL, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(res.data);
  return { inmates: parseCurrent($), released: parseReleased($) };
}

function parseCurrent($) {
  const inmates = [];
  const seen = new Set();

  // #currentTable = in custody (one row per person, name split into
  // Last/First/Middle cells).
  $('#currentTable tbody tr').each((_, row) => {
    const href = $(row).find('a[href*="/Roster/Detail/"]').attr('href') || '';
    const m = href.match(/\/Detail\/([A-Za-z0-9]+)/);
    if (!m) return;
    const idnum = m[1];
    if (seen.has(idnum)) return;
    seen.add(idnum);

    const [last, first, middle] = $(row).find('td').map((_, td) => cellText($, td)).get();
    if (!last) return;

    inmates.push({ idnum, name: joinName(last, first, middle) });
  });

  return inmates;
}

// #releasedTable: Release Date / Last / First / Middle / Docket Number, one
// row per docket, so a person released on several cases appears several
// times. Grouped here into one release per person per day.
function parseReleased($) {
  const byKey = new Map();
  $('#releasedTable tbody tr').each((_, row) => {
    const [date, last, first, middle, docket] = $(row).find('td').map((_, td) => cellText($, td)).get();
    if (!date || !last || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) return;
    const name = joinName(last, first, middle);
    const key = `${name}|${date}`;
    if (!byKey.has(key)) byKey.set(key, { name, date, dockets: [] });
    if (docket && docket !== '—' && !byKey.get(key).dockets.includes(docket)) {
      byKey.get(key).dockets.push(docket);
    }
  });
  return [...byKey.values()];
}

// The new site prints bail as "$25,000 (BONDABLE)"; the old one printed
// "$25000, BONDABLE". Keep the old shape so data/roster.json stays uniform.
function normalizeBail(bail) {
  if (!bail) return null;
  const m = bail.match(/^\$([\d,]+)\s*\((.+)\)$/);
  return m ? `$${m[1].replace(/,/g, '')}, ${m[2]}` : bail;
}

// Inmate Detail page: one card per charge, each a <dl> of Court / Cause Number
// / Charge / Bail / Arrest Date. Warrant cards have Jurisdiction instead of
// Court and no cause number.
export async function scrapeDetail(idnum) {
  try {
    const res = await axios.get(detailUrl(idnum), { headers: HEADERS, timeout: 20000 });
    const $ = cheerio.load(res.data);

    const charges = [];

    $('main dl').each((_, dl) => {
      const fields = {};
      $(dl).find('dt').each((_, dt) => {
        const label = $(dt).text().replace(/\s+/g, ' ').trim().toLowerCase();
        fields[label] = $(dt).next('dd').text().replace(/\s+/g, ' ').trim() || null;
      });
      if (!fields.charge) return;
      charges.push({
        court: fields.court || fields.jurisdiction || null,
        causeNumber: fields['cause number'] || null,
        charge: fields.charge,
        bail: normalizeBail(fields.bail),
        arrestDate: fields['arrest date'] || null
      });
    });

    return { charges };
  } catch (err) {
    console.error(`  Detail fetch failed for ${idnum}:`, err.message);
    return null;
  }
}

// Fetch detail pages for a batch of idnums sequentially, with a small delay
// between requests out of courtesy to the county's server.
export async function scrapeDetailBatch(idnums) {
  const results = {};
  for (const idnum of idnums) {
    results[idnum] = await scrapeDetail(idnum);
    await delay(400);
  }
  return results;
}
