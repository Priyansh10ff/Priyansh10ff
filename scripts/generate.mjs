// Builds assets/*.svg and README.md from live GitHub / chess.com data + config.json.
//   node scripts/generate.mjs                 normal run (GH_TOKEN optional)
//   MOCK=1 node scripts/generate.mjs          fake contribution data, for local preview
//   node scripts/generate.mjs --list-private  print private repo names that have no entry in config.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const USER = cfg.github_user, CHESS = cfg.chess_user;
const USERS = [USER, ...(cfg.other_github_users || [])];
const TOKEN = process.env.GH_TOKEN || '', MOCK = !!process.env.MOCK;
const C = { bg: '#0c0d0f', panel: '#121417', line: '#1f252b', text: '#d7dbe0', mute: '#6b7580', dim: '#2c343c', ok: '#3fb950', warn: '#d29922', bad: '#f85149' };
const HEAT = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
const PAL = ['#3fb950', '#58a6ff', '#d29922', '#bc8cff', '#f778ba', '#79c0ff', '#8b949e'];
const headers = { 'User-Agent': `${USER}-profile`, Accept: 'application/vnd.github+json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tw = (s, z) => String(s).length * z * 0.6;
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const fmt = (n) => Number(n).toLocaleString('en');
const wrap = (s, n) => { const out = []; let l = ''; for (const w of s.split(' ')) { if ((l + ' ' + w).trim().length > n) { out.push(l); l = w; } else l = (l + ' ' + w).trim(); } if (l) out.push(l); return out; };
async function j(url, opts = {}) { try { const r = await fetch(url, { headers, ...opts }); return r.ok ? await r.json() : null; } catch { return null; } }
const fontCss = [['400', 'jbm-400.woff2'], ['700', 'jbm-700.woff2']].map(([w, f]) => { const p = path.join(root, 'fonts', f); return fs.existsSync(p) ? `@font-face{font-family:'JB';font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}) format('woff2')}` : ''; }).join('');
const svg = (w, h, body, css = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="JB,'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace"><style>${fontCss}${css}</style>${body}</svg>`;
const write = (n, s) => fs.writeFileSync(path.join(root, 'assets', n), s);
const panel = (w, h) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="10" fill="${C.panel}" stroke="${C.line}"/>`;
const pill = (x, y, t, col, dot = true) => { const w = Math.round(tw(t, 10) + t.length * 0.5 + (dot ? 28 : 18)); return { w, s: `<g transform="translate(${x} ${y})"><rect width="${w}" height="20" rx="10" fill="${col}" fill-opacity=".13" stroke="${col}" stroke-opacity=".45"/>${dot ? `<circle cx="11" cy="10" r="3" fill="${col}"/>` : ''}<text x="${dot ? 20 : 9}" y="14" font-size="10" fill="${col}" letter-spacing=".5">${esc(t)}</text></g>` }; };
for (const f of fs.readdirSync(path.join(root, 'assets'))) if (f.endsWith('.svg')) fs.unlinkSync(path.join(root, 'assets', f));

// ---------- data ----------
function mockWeeks() {
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 364); start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const weeks = []; let w = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const i = Math.floor((d - start) / 864e5), r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    w.push({ date: d.toISOString().slice(0, 10), contributionCount: r < 0.35 ? 0 : Math.floor(Math.pow(r, 3) * 14 * (2 + Math.sin(i / 20))), weekday: d.getUTCDay() });
    if (w.length === 7) { weeks.push({ contributionDays: w }); w = []; }
  }
  if (w.length) weeks.push({ contributionDays: w });
  return weeks;
}
const to = new Date(), from = new Date(to); from.setDate(from.getDate() - 364);
const Q = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}}}`;
const gq = TOKEN && !MOCK ? await j('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query: Q, variables: { login: USER, from: from.toISOString(), to: to.toISOString() } }) }) : null;
const cal = MOCK ? { weeks: mockWeeks() } : gq?.data?.user?.contributionsCollection.contributionCalendar;
const weeks = cal?.weeks ?? [];
const days = weeks.flatMap((w) => w.contributionDays);
const contribs = MOCK ? days.reduce((a, d) => a + d.contributionCount, 0) : cal?.totalContributions ?? 0;
const me = await j(`https://api.github.com/users/${USER}`);
const repos = (await j(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`)) ?? [];

async function allPRs(u) {
  const out = [];
  for (let p = 1; p <= 3; p++) {
    const r = await j(`https://api.github.com/search/issues?q=${encodeURIComponent(`author:${u} type:pr -user:${u}`)}&per_page=100&page=${p}`);
    if (!r?.items?.length) break; out.push(...r.items); if (r.items.length < 100) break;
  }
  return out;
}
const seen = new Set(), prs = [];
for (const u of USERS) for (const it of await allPRs(u)) if (!seen.has(it.id)) { seen.add(it.id); prs.push(it); }
const grp = {};
for (const it of prs) { const n = it.repository_url.split('/repos/')[1]; const g = (grp[n] ??= { name: n, merged: 0, open: 0, closed: 0 }); if (it.pull_request?.merged_at) g.merged++; else if (it.state === 'open') g.open++; else g.closed++; }
const cards = []; const hidden = { merged: 0, open: 0, closed: 0, n: 0 }; const unmapped = [];
for (const g of Object.values(grp)) {
  let r = MOCK ? { private: false } : await j(`https://api.github.com/repos/${g.name}`);
  if (!r && !MOCK) r = await j(`https://api.github.com/repos/${g.name}`); // one retry; on failure the repo is treated as private so a name never leaks
  const priv = !r || r.private;
  const pm = cfg.private_repos?.[g.name];
  if (!priv) cards.push({ ...g, title: g.name, link: `https://github.com/${g.name}/pulls?q=is%3Apr+author%3A${USER}`, private: false });
  else if (pm) cards.push({ ...g, title: pm.name, link: pm.url || '', private: true });
  else { hidden.merged += g.merged; hidden.open += g.open; hidden.closed += g.closed; hidden.n++; unmapped.push(g.name); }
}
if (hidden.n) cards.push({ title: 'Private repositories', link: '', private: true, merged: hidden.merged, open: hidden.open, closed: hidden.closed });
for (const e of cfg.extra_oss || []) cards.push({ title: e.name, link: e.url || '', private: !!e.private, merged: e.merged || 0, open: 0, closed: 0 });
cards.sort((a, b) => b.merged - a.merged);
const totals = cards.reduce((a, c) => ({ merged: a.merged + c.merged, open: a.open + c.open, closed: a.closed + c.closed }), { merged: 0, open: 0, closed: 0 });
if (unmapped.length) console.log(`${unmapped.length} private repo(s) have no entry in config.json private_repos (run with --list-private locally to see names)`);
if (process.argv.includes('--list-private')) console.log(unmapped.join('\n'));

// ---------- derived activity ----------
const today = to.toISOString().slice(0, 10);
const dayDiff = (a) => Math.round((Date.parse(today) - Date.parse(a)) / 864e5);
let best = 0, run = 0, cur = 0;
for (const d of days) { if (d.contributionCount > 0) { run++; best = Math.max(best, run); } else run = 0; }
for (let i = days.length - 1; i >= 0; i--) { if (days[i].contributionCount > 0) cur++; else if (i === days.length - 1) continue; else break; }
const lastDay = [...days].reverse().find((d) => d.contributionCount > 0);
const ago = lastDay ? dayDiff(lastDay.date) : null;
const status = ago === null ? ['UNKNOWN', C.mute] : ago <= 2 ? ['ACTIVE', C.ok] : ago <= 14 ? ['IDLE', C.warn] : ['DORMANT', C.bad];
const agoText = ago === null ? 'no data' : ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
const xp = contribs, level = Math.floor(Math.sqrt(xp / 12)) + 1, xpPrev = (level - 1) ** 2 * 12, xpNext = level ** 2 * 12;
const rank = [[1, 'Initiate'], [3, 'Tinkerer'], [5, 'Builder'], [8, 'Shipper'], [12, 'Maintainer'], [17, 'Architect']].filter(([l]) => level >= l).pop()[1];
const nRepos = me?.public_repos ?? (MOCK ? 14 : 0), nFollowers = me?.followers ?? (MOCK ? 9 : 0), nFollowing = me?.following ?? (MOCK ? 21 : 0);

// ---------- assets ----------
function nameSvg() {
  const W = 900, H = 190, nm = cfg.name, nx = 40 + tw(nm, 88) + 6, p = pill(0, 0, `${status[0]}`, status[1]);
  return svg(W, H, `${panel(W, H)}<clipPath id="r"><rect width="${W}" height="${H}"><animate attributeName="width" from="0" to="${W}" dur="1.3s" fill="freeze"/></rect></clipPath>
<text x="40" y="44" font-size="13" fill="${C.mute}">~/${esc(USER.toLowerCase())}</text><text x="${40 + tw(`~/${USER}`, 13) + 14}" y="44" font-size="13" fill="${C.ok}">$ whoami</text>
<g transform="translate(${W - 40 - p.w} 28)">${p.s}</g>
<g clip-path="url(#r)"><text x="38" y="132" font-size="88" font-weight="700" fill="${C.text}" letter-spacing="-2">${esc(nm)}</text></g>
<rect x="${nx}" y="82" width="14" height="52" fill="${C.ok}"><animate attributeName="opacity" values="1;1;0;0" dur="1.1s" repeatCount="indefinite"/></rect>
<text x="42" y="166" font-size="14" fill="${C.mute}">${esc(cfg.role)}</text>`);
}

async function asciiSvg() {
  const W = 900; const f = ['jpg', 'jpeg', 'png', 'webp'].map((e) => path.join(root, 'assets', `photo.${e}`)).find((p) => fs.existsSync(p));
  let lines = null; const cols = 96;
  if (f) try {
    const { default: sharp } = await import('sharp'); const m = await sharp(f).metadata();
    const rows = Math.round(cols * (m.height / m.width) * 0.52);
    const { data } = await sharp(f).resize(cols, rows, { fit: 'fill' }).grayscale().normalize().raw().toBuffer({ resolveWithObject: true });
    const ramp = ' .:-=+*#%@';
    lines = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => ramp[Math.min(9, Math.floor((data[y * cols + x] / 256) * 10))]).join(''));
  } catch { lines = null; }
  if (!lines) return svg(W, 200, `${panel(W, 200)}<text x="450" y="96" font-size="14" fill="${C.mute}" text-anchor="middle">photo.txt not generated yet</text><text x="450" y="122" font-size="12" fill="${C.dim}" text-anchor="middle">add assets/photo.jpg and run the workflow</text>`);
  const fs_ = 7.6, lh = 8.8, bw = cols * fs_ * 0.6, x0 = (W - bw) / 2, H = Math.round(lines.length * lh + 56);
  const t = lines.map((l, i) => `<text class="l" x="${x0}" y="${44 + i * lh}" font-size="${fs_}" fill="#aab3bd" xml:space="preserve" style="white-space:pre;animation-delay:${(i * 0.012).toFixed(2)}s">${esc(l)}</text>`).join('');
  return svg(W, H, `${panel(W, H)}<circle cx="22" cy="20" r="4.5" fill="${C.dim}"/><circle cx="38" cy="20" r="4.5" fill="${C.dim}"/><circle cx="54" cy="20" r="4.5" fill="${C.dim}"/><text x="${W - 20}" y="24" font-size="11" fill="${C.mute}" text-anchor="end">photo.txt</text><line x1="0" y1="34" x2="${W}" y2="34" stroke="${C.line}"/>${t}`, '.l{animation:f .5s ease-out backwards}@keyframes f{from{opacity:0}}');
}

function aboutSvg() {
  const rows = cfg.about, H = 62 + rows.length * 30, kw = Math.max(...rows.map((r) => r[0].length)) * 8.4 + 24;
  const t = rows.map(([k, v], i) => `<text x="28" y="${70 + i * 30}" font-size="14" fill="${C.ok}">${esc(k)}</text><text x="${28 + kw}" y="${70 + i * 30}" font-size="14" fill="${C.text}">${esc(cut(v, Math.floor((900 - 56 - kw) / 8.4)))}</text>`).join('');
  return svg(900, H, `${panel(900, H)}<text x="28" y="32" font-size="12" fill="${C.mute}">$ cat about.md</text>${t}`);
}

function statsSvg() {
  const W = 900, H = 196, p = pill(20, 18, status[0], status[1]);
  const tiles = [['PUBLIC REPOS', nRepos, 'owned'], ['CONTRIBUTIONS', fmt(contribs), 'last 12 months'], ['MERGED PRS', totals.merged, `${cards.length} projects`], ['FOLLOWERS', nFollowers, `${nFollowing} following`]];
  const tl = tiles.map(([l, v, h], i) => { const x = 20 + i * 220; return `<g transform="translate(${x} 62)"><rect width="200" height="112" rx="8" fill="${C.bg}" stroke="${C.line}"/><text x="14" y="26" font-size="10" fill="${C.mute}" letter-spacing="1">${l}</text><text x="14" y="70" font-size="34" font-weight="700" fill="${C.text}">${v}</text><text x="14" y="94" font-size="10" fill="${C.mute}">${h}</text></g>`; }).join('');
  return svg(W, H, `${panel(W, H)}${p.s}<text x="${20 + p.w + 14}" y="32" font-size="12" fill="${C.mute}">last contribution ${agoText}</text>
<text x="880" y="32" font-size="12" fill="${C.text}" text-anchor="end">streak ${cur}d  ·  best ${best}d</text>${tl}`);
}

function heatSvg() {
  const W = 900, H = 262, X0 = 26, Y0 = 122, S = 13, G = 3;
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const lvl = (c) => (c === 0 ? 0 : c / max <= 0.25 ? 1 : c / max <= 0.5 ? 2 : c / max <= 0.75 ? 3 : 4);
  const bestDay = days.reduce((b, d) => (d.contributionCount > (b?.contributionCount ?? -1) ? d : b), null);
  let cells = '', months = '';
  const marks = []; let lastM = -1;
  weeks.forEach((w, ci) => { const m = new Date(w.contributionDays[0].date + 'T00:00:00Z').getUTCMonth(); if (m !== lastM) { marks.push([ci, m]); lastM = m; } });
  if (marks.length > 1 && marks[1][0] - marks[0][0] < 4) marks.shift();
  for (const [ci, m] of marks) if (ci < weeks.length - 2) months += `<text x="${X0 + ci * (S + G)}" y="${Y0 - 10}" font-size="9" fill="${C.mute}">${new Date(Date.UTC(2000, m, 1)).toLocaleString('en', { month: 'short' }).toUpperCase()}</text>`;
  weeks.forEach((w, ci) => {
    for (const d of w.contributionDays) {
      const x = X0 + ci * (S + G), y = Y0 + d.weekday * (S + G), isT = d.date === today, isB = bestDay && d.date === bestDay.date && d.contributionCount > 0;
      cells += `<rect class="c" x="${x}" y="${y}" width="${S}" height="${S}" rx="3" fill="${HEAT[lvl(d.contributionCount)]}" style="animation-delay:${(ci * 0.02).toFixed(2)}s"${isT ? ` stroke="${C.text}" stroke-width="1"` : isB ? ` stroke="${C.warn}" stroke-width="1.3"` : ''}>${isT ? `<animate attributeName="stroke-opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/>` : ''}</rect>`;
    }
  });
  const pct = Math.max(0, Math.min(1, (xp - xpPrev) / (xpNext - xpPrev)));
  const empty = days.length ? '' : `<text x="450" y="176" font-size="13" fill="${C.mute}" text-anchor="middle">no contribution data (set the PROFILE_TOKEN secret)</text>`;
  const lg = HEAT.map((c, i) => `<rect x="${762 + i * 16}" y="238" width="11" height="11" rx="2.5" fill="${c}"/>`).join('');
  return svg(W, H, `${panel(W, H)}
<text x="26" y="30" font-size="10" fill="${C.mute}" letter-spacing="1">LEVEL</text><text x="26" y="72" font-size="40" font-weight="700" fill="${C.text}">${String(level).padStart(2, '0')}</text><text x="86" y="72" font-size="15" fill="${C.ok}">${rank}</text>
<text x="250" y="30" font-size="10" fill="${C.mute}" letter-spacing="1">XP</text><text x="520" y="30" font-size="10" fill="${C.mute}" text-anchor="end">${fmt(xp)} / ${fmt(xpNext)}</text>
<rect x="250" y="40" width="270" height="10" rx="5" fill="${C.bg}" stroke="${C.line}"/><rect x="250" y="40" width="${(270 * pct).toFixed(1)}" height="10" rx="5" fill="${C.ok}"><animate attributeName="width" from="0" to="${(270 * pct).toFixed(1)}" dur="1.4s" fill="freeze"/></rect>
<text x="250" y="76" font-size="11" fill="${C.mute}">${fmt(Math.max(0, xpNext - xp))} xp to level ${level + 1}</text>
<text x="760" y="30" font-size="10" fill="${C.mute}" letter-spacing="1" text-anchor="end">STREAK</text><text x="760" y="72" font-size="30" font-weight="700" fill="${C.text}" text-anchor="end">${cur}d</text>
<text x="880" y="30" font-size="10" fill="${C.mute}" letter-spacing="1" text-anchor="end">BEST</text><text x="880" y="72" font-size="30" font-weight="700" fill="${C.text}" text-anchor="end">${best}d</text>
<line x1="20" y1="92" x2="880" y2="92" stroke="${C.line}"/>${months}${cells}${empty}
<text x="26" y="248" font-size="10" fill="${C.mute}">${bestDay && bestDay.contributionCount ? `best day  ${bestDay.contributionCount} on ${bestDay.date}` : ''}</text>
<text x="752" y="247" font-size="10" fill="${C.mute}" text-anchor="end">less</text>${lg}<text x="846" y="247" font-size="10" fill="${C.mute}">more</text>`,
    '.c{transform-box:fill-box;transform-origin:center;animation:p .35s ease-out backwards}@keyframes p{from{opacity:0;transform:scale(.4)}}');
}

function ecgSvg() {
  const W = 900, H = 270, L = 40, R = 860, b = 176;
  const m = {}; for (const d of days) { const k = d.date.slice(0, 7); m[k] = (m[k] || 0) + d.contributionCount; }
  const keys = Object.keys(m).sort().slice(-12), vals = keys.map((k) => m[k]), max = Math.max(1, ...vals), mw = (R - L) / Math.max(1, keys.length);
  let d = `M${L} ${b}`; let labels = '';
  keys.forEach((k, i) => {
    const x0 = L + i * mw, u = mw / 10, v = vals[i], X = (t) => (x0 + t * u).toFixed(1);
    if (v > 0) { const A = 12 + (v / max) * 88; d += `L${X(1.4)} ${b}Q${X(2.2)} ${b - 9} ${X(3)} ${b}L${X(4.1)} ${b}L${X(4.5)} ${b + 10}L${X(5)} ${b - A}L${X(5.5)} ${b + 16}L${X(6)} ${b}L${X(6.8)} ${b}Q${X(7.7)} ${b - 18} ${X(8.6)} ${b}L${X(10)} ${b}`; } else d += `L${X(10)} ${b}`;
    labels += `<text x="${(x0 + mw / 2).toFixed(1)}" y="226" font-size="10" fill="${C.mute}" text-anchor="middle">${new Date(k + '-01T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</text><text x="${(x0 + mw / 2).toFixed(1)}" y="244" font-size="11" fill="${C.text}" text-anchor="middle">${vals[i]}</text>`;
  });
  if (!keys.length) d += `L${R} ${b}`;
  const avg = days.length ? (contribs / days.length).toFixed(1) : '0.0', live = pill(0, 0, 'LIVE', C.ok);
  const dur = '6s', kt = 'keyTimes="0;.75;1"';
  return svg(W, H, `<defs><pattern id="g1" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="${C.ok}" stroke-opacity=".06"/></pattern><pattern id="g2" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="${C.ok}" stroke-opacity=".12"/></pattern><filter id="gl" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
${panel(W, H)}<text x="24" y="32" font-size="12" fill="${C.ok}" letter-spacing="2">PULSE</text><text x="86" y="32" font-size="11" fill="${C.mute}">contributions per month</text>
<g transform="translate(${W - 24 - live.w} 18)">${live.s}</g><text x="${W - 24 - live.w - 14}" y="32" font-size="11" fill="${C.mute}" text-anchor="end">avg ${avg}/day</text>
<rect x="24" y="52" width="852" height="150" fill="url(#g1)"/><rect x="24" y="52" width="852" height="150" fill="url(#g2)"/>
<path d="${d}" fill="none" stroke="${C.ok}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1" filter="url(#gl)"><animate attributeName="stroke-dashoffset" values="1;0;0" ${kt} dur="${dur}" repeatCount="indefinite"/></path>
<circle r="3.2" fill="#fff" filter="url(#gl)"><animateMotion path="${d}" dur="${dur}" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" ${kt}/><animate attributeName="opacity" values="1;1;0" ${kt} dur="${dur}" repeatCount="indefinite"/></circle>${labels}`);
}

function chipsSvg(title, items) {
  const W = 900; let x = 20, y = 46, rows = 1, out = '';
  items.forEach((t, i) => { const w = Math.round(tw(t, 13) + 36); if (x + w > W - 20) { x = 20; y += 42; rows++; } out += `<g transform="translate(${x} ${y})"><rect width="${w}" height="32" rx="8" fill="${C.bg}" stroke="${C.line}"/><circle cx="16" cy="16" r="3.5" fill="${PAL[(t.length + i) % PAL.length]}"/><text x="28" y="21" font-size="13" fill="${C.text}">${esc(t)}</text></g>`; x += w + 10; });
  const H = 46 + rows * 42 + 4;
  return svg(W, H, `${panel(W, H)}<text x="20" y="28" font-size="11" fill="${C.mute}" letter-spacing="2">${esc(title.toUpperCase())}</text><text x="880" y="28" font-size="11" fill="${C.mute}" text-anchor="end">${items.length}</text>${out}`);
}

function langsSvg() {
  const cnt = {}; for (const r of repos) if (r.language && !r.fork) cnt[r.language] = (cnt[r.language] || 0) + 1;
  const arr = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 7); if (!arr.length) return null;
  const tot = arr.reduce((a, [, n]) => a + n, 0); let x = 20, bar = '', lg = '', lx = 20;
  arr.forEach(([l, n], i) => { const w = (n / tot) * 860; bar += `<rect x="${x.toFixed(1)}" y="46" width="${Math.max(2, w - 2).toFixed(1)}" height="12" rx="3" fill="${PAL[i]}"/>`; x += w; const t = `${l} ${Math.round((n / tot) * 100)}%`; lg += `<circle cx="${lx + 4}" cy="84" r="4" fill="${PAL[i]}"/><text x="${lx + 14}" y="88" font-size="11" fill="${C.text}">${esc(t)}</text>`; lx += tw(t, 11) + 34; });
  return svg(900, 112, `${panel(900, 112)}<text x="20" y="28" font-size="11" fill="${C.mute}" letter-spacing="2">DETECTED FROM PUBLIC REPOS</text>${bar}${lg}`);
}

function ossSummary() {
  const p1 = pill(0, 0, `${cards.length} PROJECTS`, C.mute, false), p2 = pill(0, 0, `${totals.open} OPEN`, C.warn, false), p3 = pill(0, 0, `${totals.closed} CLOSED`, C.mute, false);
  return svg(900, 96, `${panel(900, 96)}<text x="28" y="66" font-size="44" font-weight="700" fill="${C.ok}">${totals.merged}</text><text x="${28 + tw(String(totals.merged), 44) + 14}" y="62" font-size="14" fill="${C.text}">pull requests merged</text>
<g transform="translate(${880 - p1.w - p2.w - p3.w - 20} 38)">${p1.s}<g transform="translate(${p1.w + 10} 0)">${p2.s}<g transform="translate(${p2.w + 10} 0)">${p3.s}</g></g></g>`);
}
function ossCard(c) {
  const W = 440, H = 112, t = c.merged + c.open + c.closed, bw = 404, pp = c.private ? pill(18, 46, 'PRIVATE', C.warn, false) : pill(18, 46, 'PUBLIC', C.mute, false);
  const seg = (n, col, x) => (t && n ? `<rect x="${x.toFixed(1)}" y="86" width="${Math.max(3, (n / t) * bw - 2).toFixed(1)}" height="6" rx="3" fill="${col}"/>` : '');
  const bars = t ? seg(c.merged, C.ok, 18) + seg(c.open, C.warn, 18 + (c.merged / t) * bw) + seg(c.closed, C.dim, 18 + ((c.merged + c.open) / t) * bw) : `<rect x="18" y="86" width="${bw}" height="6" rx="3" fill="${C.dim}"/>`;
  return svg(W, H, `${panel(W, H)}<text x="18" y="32" font-size="15" font-weight="700" fill="${C.text}">${esc(cut(c.title, 28))}</text>${pp.s}
<text x="422" y="50" font-size="34" font-weight="700" fill="${C.ok}" text-anchor="end">${c.merged}</text><text x="422" y="66" font-size="10" fill="${C.mute}" text-anchor="end">merged</text>${c.link ? `<text x="${W - 14}" y="22" font-size="11" fill="${C.mute}" text-anchor="end">↗</text>` : ''}
${bars}<text x="18" y="106" font-size="10" fill="${C.mute}">${c.open} open · ${c.closed} closed</text>`);
}

function projRow(p, i) {
  const W = 900, H = 78, st = p.status ? pill(0, 0, p.status.toUpperCase(), p.status === 'building' ? C.warn : C.ok, true) : null;
  return svg(W, H, `${panel(W, H)}<text x="26" y="46" font-size="22" fill="${C.dim}" font-weight="700">${String(i + 1).padStart(2, '0')}</text><text x="80" y="34" font-size="18" font-weight="700" fill="${C.text}">${esc(p.name)}</text><text x="80" y="58" font-size="12" fill="${C.mute}">${esc(cut(p.desc, 92))}</text>
${st ? `<g transform="translate(${840 - st.w} 29)">${st.s}</g>` : ''}<text x="872" y="45" font-size="14" fill="${C.mute}" text-anchor="end">▸</text>`);
}
function projDetail(p) {
  const W = 900, lines = wrap(p.long || p.desc, 100); let x = 26; const y0 = 28 + lines.length * 22 + 10;
  const chips = (p.tags || []).map((t) => { const w = Math.round(tw(t, 11) + 22); const s = `<g transform="translate(${x} ${y0})"><rect width="${w}" height="24" rx="6" fill="${C.bg}" stroke="${C.line}"/><text x="11" y="16" font-size="11" fill="${C.text}">${esc(t)}</text></g>`; x += w + 8; return s; }).join('');
  const link = p.repo ? `github.com/${p.repo}` : p.url ? p.url.replace(/^https?:\/\//, '') : 'closed source';
  const H = y0 + 24 + 44;
  return svg(W, H, `${panel(W, H)}${lines.map((l, i) => `<text x="26" y="${34 + i * 22}" font-size="13" fill="${C.text}">${esc(l)}</text>`).join('')}${chips}<text x="26" y="${H - 18}" font-size="12" fill="${p.repo || p.url ? C.ok : C.mute}">${p.repo || p.url ? '↗ ' : ''}${esc(link)}</text>`);
}

function journeySvg() {
  const J = cfg.journey, H = 40 + J.length * 66, W = 900;
  const t = J.map((e, i) => { const y = 52 + i * 66, last = i === J.length - 1; return `<circle cx="60" cy="${y}" r="6" fill="${last ? C.ok : C.panel}" stroke="${last ? C.ok : C.mute}" stroke-width="2">${last ? `<animate attributeName="r" values="6;9;6" dur="1.8s" repeatCount="indefinite"/>` : ''}</circle><text x="96" y="${y + 6}" font-size="20" font-weight="700" fill="${last ? C.ok : C.text}">${esc(e.year)}</text><text x="190" y="${y + 5}" font-size="14" fill="${C.text}">${esc(e.text)}</text>`; }).join('');
  return svg(W, H, `${panel(W, H)}<line x1="60" y1="52" x2="60" y2="${52 + (J.length - 1) * 66}" stroke="${C.line}" stroke-width="2"/>${t}`);
}

async function chessSvg() {
  const W = 900, H = 290, S = 30, BX = 24, BY = 25;
  const st = await j(`https://api.chess.com/pub/player/${CHESS}/stats`);
  let game = null; const arch = (await j(`https://api.chess.com/pub/player/${CHESS}/games/archives`))?.archives;
  if (arch?.length) game = (await j(arch[arch.length - 1]))?.games?.at(-1) ?? null;
  const fen = game?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', gl = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  let cellsS = '', sq = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cellsS += `<rect x="${BX + c * S}" y="${BY + r * S}" width="${S}" height="${S}" fill="${(r + c) % 2 ? '#242b30' : '#333c42'}"/>`;
  fen.split(' ')[0].split('/').forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) { c += +ch; continue; } const w = ch === ch.toUpperCase(); sq += `<text x="${BX + c * S + S / 2}" y="${BY + r * S + S * 0.77}" font-size="24" text-anchor="middle" fill="${w ? '#f2f2f2' : '#0c0d0f'}" stroke="${w ? '#0c0d0f' : '#f2f2f2'}" stroke-width=".5">${gl[ch.toLowerCase()]}</text>`; c++; } });
  const rt = (k) => st?.[`chess_${k}`]?.last?.rating ?? '-', rec = st?.chess_rapid?.record;
  const tiles = [['RAPID', rt('rapid')], ['BLITZ', rt('blitz')], ['BULLET', rt('bullet')]].map(([l, v], i) => `<g transform="translate(${300 + i * 196} 56)"><rect width="180" height="84" rx="8" fill="${C.bg}" stroke="${C.line}"/><text x="14" y="26" font-size="10" fill="${C.mute}" letter-spacing="1">${l}</text><text x="14" y="64" font-size="34" font-weight="700" fill="${C.text}">${v}</text></g>`).join('');
  let recS = `<text x="300" y="176" font-size="11" fill="${C.mute}">no rapid record</text>`;
  if (rec) { const tot = rec.win + rec.loss + rec.draw || 1, bw = 568, a = (rec.win / tot) * bw, d = (rec.draw / tot) * bw, l = (rec.loss / tot) * bw; recS = `<text x="300" y="172" font-size="10" fill="${C.mute}" letter-spacing="1">RAPID RECORD</text><text x="868" y="172" font-size="11" fill="${C.text}" text-anchor="end">${rec.win}W  ${rec.draw}D  ${rec.loss}L</text><rect x="300" y="182" width="${Math.max(0, a - 2).toFixed(1)}" height="8" rx="4" fill="${C.ok}"/><rect x="${(300 + a).toFixed(1)}" y="182" width="${Math.max(0, d - 2).toFixed(1)}" height="8" rx="4" fill="${C.mute}"/><rect x="${(300 + a + d).toFixed(1)}" y="182" width="${Math.max(0, l - 2).toFixed(1)}" height="8" rx="4" fill="${C.bad}"/>`; }
  let last = '<text x="300" y="236" font-size="12" fill="' + C.mute + '">no recent game found</text>';
  if (game) { const mine = game.white.username.toLowerCase() === CHESS.toLowerCase() ? game.white : game.black, opp = mine === game.white ? game.black : game.white; const res = mine.result === 'win' ? ['WON', C.ok] : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(mine.result) ? ['DREW', C.mute] : ['LOST', C.bad]; const p = pill(300, 220, res[0], res[1]); last = `${p.s}<text x="${300 + p.w + 12}" y="234" font-size="13" fill="${C.text}">vs ${esc(opp.username)} (${opp.rating}) · ${game.time_class}</text>`; }
  return svg(W, H, `${panel(W, H)}${cellsS}${sq}<text x="300" y="34" font-size="11" fill="${C.mute}" letter-spacing="2">CHESS.COM</text><text x="880" y="34" font-size="12" fill="${C.text}" text-anchor="end">${esc(CHESS)} ↗</text>${tiles}${recS}<text x="300" y="212" font-size="10" fill="${C.mute}" letter-spacing="1">LAST GAME</text>${last}`);
}

const contactTile = (label, handle) => svg(290, 84, `${panel(290, 84)}<text x="20" y="30" font-size="10" fill="${C.mute}" letter-spacing="2">${label}</text><text x="20" y="58" font-size="14" fill="${C.text}">${esc(cut(handle, 26))}</text><text x="270" y="30" font-size="13" fill="${C.ok}" text-anchor="end">↗</text>`);
const hdr = (n, title, right) => svg(900, 52, `<rect x=".5" y=".5" width="899" height="51" rx="10" fill="${C.bg}" stroke="${C.line}"/><text x="20" y="32" font-size="12" fill="${C.mute}">${n}</text><text x="54" y="33" font-size="15" font-weight="700" fill="${C.text}" letter-spacing="3">${esc(title.toUpperCase())}</text><text x="880" y="32" font-size="11" fill="${C.mute}" text-anchor="end">${esc(right)}</text>`);

// ---------- write everything ----------
write('name.svg', nameSvg()); write('ascii.svg', await asciiSvg()); write('about.svg', aboutSvg());
write('stats.svg', statsSvg()); write('heatmap.svg', heatSvg()); write('ecg.svg', ecgSvg());
const stackKeys = Object.keys(cfg.stack); stackKeys.forEach((k, i) => write(`stack-${i}.svg`, chipsSvg(k, cfg.stack[k])));
const langs = langsSvg(); if (langs) write('langs.svg', langs);
write('oss-summary.svg', ossSummary()); cards.forEach((c, i) => write(`oss-${i}.svg`, ossCard(c)));
const projs = cfg.projects.slice(0, 5); projs.forEach((p, i) => { write(`proj-${i}.svg`, projRow(p, i)); write(`proj-${i}-d.svg`, projDetail(p)); });
write('journey.svg', journeySvg()); write('chess.svg', await chessSvg());
write('contact-email.svg', contactTile('EMAIL', cfg.email)); write('contact-linkedin.svg', contactTile('LINKEDIN', cfg.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, ''))); write('contact-github.svg', contactTile('GITHUB', USER));
const nTools = stackKeys.reduce((a, k) => a + cfg.stack[k].length, 0);
const heads = { about: ['01', 'About', 'whoami'], activity: ['02', 'Activity', `lvl ${level} ${rank.toLowerCase()}`], stack: ['03', 'Tech stack', `${nTools} tools`], oss: ['04', 'Open source', `${totals.merged} merged`], projects: ['05', 'Projects', `${projs.length} selected`], journey: ['06', 'Journey', `${cfg.journey[0].year} to now`], chess: ['07', 'Chess', 'chess.com'], contact: ['08', 'Contact', ''] };
for (const [k, [n, t, r]] of Object.entries(heads)) write(`hdr-${k}.svg`, hdr(n, t, r));

// version hash from content so README only changes when assets change
const V = crypto.createHash('md5').update(fs.readdirSync(path.join(root, 'assets')).filter((f) => f.endsWith('.svg')).sort().map((f) => fs.readFileSync(path.join(root, 'assets', f), 'utf8')).join('')).digest('hex').slice(0, 8);
const im = (f, alt, w = '100%') => `<img src="assets/${f}?v=${V}" width="${w}" alt="${esc(alt)}">`;
const lk = (href, html) => (href ? `<a href="${href}">${html}</a>` : html);
const sec = (k, inner) => `<details open>\n<summary>${im(`hdr-${k}.svg`, heads[k][1])}</summary>\n\n${inner}\n\n</details>\n`;
const pairs = []; for (let i = 0; i < cards.length; i += 2) pairs.push([cards[i], cards[i + 1]].map((c, k) => (c ? lk(c.link, im(`oss-${i + k}.svg`, `${c.title}, ${c.merged} merged`, '49%')) : '')).join(' '));
const readme = [
  im('name.svg', cfg.name), im('ascii.svg', 'ASCII portrait'),
  sec('about', im('about.svg', 'About')),
  sec('activity', `${im('stats.svg', 'GitHub stats')}\n${lk(`https://github.com/${USER}`, im('heatmap.svg', 'Contribution heatmap'))}\n${lk(`https://github.com/${USER}`, im('ecg.svg', 'Monthly contributions as an ECG'))}`),
  sec('stack', stackKeys.map((k, i) => im(`stack-${i}.svg`, k)).join('\n') + (langs ? `\n${im('langs.svg', 'Languages')}` : '')),
  sec('oss', `${lk(`https://github.com/pulls?q=is%3Apr+author%3A${USER}+is%3Amerged`, im('oss-summary.svg', 'Open source summary'))}\n${pairs.join('\n')}`),
  sec('projects', projs.map((p, i) => `<details>\n<summary>${im(`proj-${i}.svg`, p.name)}</summary>\n${lk(p.repo ? `https://github.com/${p.repo}` : p.url, im(`proj-${i}-d.svg`, `${p.name} details`))}\n</details>`).join('\n')),
  sec('journey', im('journey.svg', 'Journey')),
  sec('chess', lk(`https://www.chess.com/member/${CHESS}`, im('chess.svg', 'Chess.com stats'))),
  sec('contact', `${lk(`mailto:${cfg.email}`, im('contact-email.svg', 'Email', '32%'))} ${lk(cfg.linkedin, im('contact-linkedin.svg', 'LinkedIn', '32%'))} ${lk(`https://github.com/${USER}`, im('contact-github.svg', 'GitHub', '32%'))}`),
].join('\n');
fs.writeFileSync(path.join(root, 'README.md'), readme);
console.log('done', { contribs, level, status: status[0], cards: cards.length, merged: totals.merged, v: V });
