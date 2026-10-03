// Builds assets/*.svg and README.md from live GitHub / chess.com data + config.json.
//   node scripts/generate.mjs                 normal run (GH_TOKEN optional)
//   MOCK=1 node scripts/generate.mjs          fake data for local preview
//   node scripts/generate.mjs --list-private  print private repo names with no entry in config.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const USER = cfg.github_user, CHESS = cfg.chess_user, USERS = [USER, ...(cfg.other_github_users || [])];
const TOKEN = process.env.GH_TOKEN || '', MOCK = !!process.env.MOCK;
const C = { bg: '#0b0d14', card: '#141722', navy: '#10142a', line: '#222739', text: '#f2f3f7', mute: '#8b90a0', dim: '#3a4157', peri: '#8c9eff', orange: '#eb9b3a', yellow: '#f3d34a', lav: '#dcd8ff', purple: '#5b3fc4', red: '#ff6b6b', green: '#5fd68a', gray: '#4b5268' };
const RAMP = ['#161a2b', '#27337a', '#3f55c9', '#8c9eff', '#eb9b3a'], PAL = [C.peri, C.orange, C.yellow, C.lav, C.green, C.red, C.mute];
const FF = { h: "SG,'Space Grotesk',sans-serif", b: "PJ,'Plus Jakarta Sans',sans-serif", m: "JBM,'JetBrains Mono',monospace" };
const FONTS = { SG: [['700', 'sg-700.woff2']], PJ: [['400', 'pj-400.woff2']], JBM: [['400', 'jbm-400.woff2']] };
const ICONS = fs.existsSync(path.join(root, 'fonts/icons.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'fonts/icons.json'), 'utf8')) : {};
const headers = { 'User-Agent': `${USER}-profile`, Accept: 'application/vnd.github+json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tw = (s, z, k = 'b') => String(s).length * z * { m: 0.6, h: 0.58, b: 0.54 }[k];
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const fmt = (n) => Number(n).toLocaleString('en');
const wrap = (s, n) => { const o = []; let l = ''; for (const w of String(s).split(' ')) { if ((l + ' ' + w).trim().length > n) { o.push(l); l = w; } else l = (l + ' ' + w).trim(); } if (l) o.push(l); return o; };
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.z || 14}" fill="${o.c || C.text}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.w ? ` font-weight="${o.w}"` : ''} font-family="${FF[o.f || 'b']}">${esc(s)}</text>`;
async function j(url, opts = {}) { try { const r = await fetch(url, { headers, ...opts }); return r.ok ? await r.json() : null; } catch { return null; } }
const fontCss = (body) => Object.entries(FONTS).filter(([k]) => body.includes(`font-family="${k},`)).flatMap(([k, ws]) => ws.map(([w, f]) => { const p = path.join(root, 'fonts', f); return fs.existsSync(p) ? `@font-face{font-family:'${k}';font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}) format('woff2')}` : ''; })).join('');
const svg = (w, h, body, css = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${fontCss(body)}${css}</style>${body}</svg>`;
const write = (n, s) => fs.writeFileSync(path.join(root, 'assets', n), s);
const card = (w, h, fill = C.card, r = 18) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="${fill}" stroke="${C.line}"/>`;
const dots = (w, h, id = 'dg') => `<defs><pattern id="${id}" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="#1b2030"/></pattern></defs><rect width="${w}" height="${h}" rx="18" fill="${C.bg}"/><rect width="${w}" height="${h}" rx="18" fill="url(#${id})"/>`;
const ico = (name, x, y, s) => (ICONS[name.toLowerCase()] ? `<path transform="translate(${x} ${y}) scale(${s / 24})" d="${ICONS[name.toLowerCase()]}" fill="${C.text}"/>` : '');
const ago = (d) => { const h = Math.floor((Date.now() - Date.parse(d)) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
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
const weeks = cal?.weeks ?? [], days = weeks.flatMap((w) => w.contributionDays);
const contribs = MOCK ? days.reduce((a, d) => a + d.contributionCount, 0) : cal?.totalContributions ?? 0;
const PQ = `query($login:String!){user(login:$login){bio location company createdAt followers{totalCount} following{totalCount}
 pinnedItems(first:6,types:[REPOSITORY]){nodes{...R}}
 repositories(first:100,ownerAffiliation:OWNER,privacy:PUBLIC,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){totalCount nodes{...R}}}}
 fragment R on Repository{nameWithOwner name description url homepageUrl stargazerCount pushedAt createdAt isArchived primaryLanguage{name} repositoryTopics(first:8){nodes{topic{name}}} languages(first:8,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}`;
const gp = TOKEN && !MOCK ? await j('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query: PQ, variables: { login: USER } }) }) : null;
const mk = (n, d, lang, tp, st) => ({ nameWithOwner: `${USER}/${n}`, name: n, description: d, url: '', homepageUrl: '', stargazerCount: st, pushedAt: '2026-09-20T00:00:00Z', createdAt: '2022-03-01T00:00:00Z', isArchived: false, primaryLanguage: { name: lang }, repositoryTopics: { nodes: tp.map((x) => ({ topic: { name: x } })) }, languages: { edges: [{ size: 9000, node: { name: lang } }, { size: 3000, node: { name: 'CSS' } }] } });
const mockUser = { bio: 'Student building AI products', location: 'Bengaluru, India', company: null, createdAt: '2021-06-01T00:00:00Z', followers: { totalCount: 9 }, following: { totalCount: 21 }, pinnedItems: { nodes: [mk('mirrormind', 'AI digital twin built from social history', 'TypeScript', ['nextjs', 'supabase'], 3), mk('f1hub', 'F1 dashboard with a race predictor', 'TypeScript', ['nextjs', 'f1'], 5)] }, repositories: { totalCount: 14, nodes: [mk('mirrormind', 'AI digital twin', 'TypeScript', ['nextjs', 'supabase'], 3), mk('jarvis', 'Voice agent', 'Python', ['llm', 'agents'], 2), mk('f1hub', 'F1 dashboard', 'TypeScript', ['nextjs', 'f1'], 5)] } };
const pu = MOCK ? mockUser : gp?.data?.user;
if (!MOCK && process.env.CI && (!gq?.data?.user || !pu)) { console.error('GitHub GraphQL returned no usable data:', JSON.stringify(gq?.errors ?? gp?.errors ?? 'no response')); process.exit(1); }
const me = await j(`https://api.github.com/users/${USER}`);
const repos = (await j(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`)) ?? [];
const R = pu?.repositories.nodes ?? [];
const nRepos = pu?.repositories.totalCount ?? me?.public_repos ?? 0, nFollowers = pu?.followers.totalCount ?? me?.followers ?? 0;

async function latestCommits() {
  if (MOCK) return [{ sha: 'a3f9c21', msg: 'fix: handle empty changelog diff', repo: 'patchwork', ago: '4h ago' }, { sha: '71be0d4', msg: 'feat: open PR with generated patch', repo: 'patchwork', ago: '1d ago' }, { sha: 'c08e9a7', msg: 'docs: add setup notes', repo: 'jarvis', ago: '3d ago' }];
  const out = [];
  for (const r of R.slice(0, 4)) for (const c of (await j(`https://api.github.com/repos/${r.nameWithOwner}/commits?author=${USER}&per_page=3`)) ?? []) out.push({ sha: c.sha.slice(0, 7), msg: c.commit.message.split('\n')[0], repo: r.name, date: c.commit.author.date });
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((c) => ({ ...c, ago: ago(c.date) }));
}
const commits = await latestCommits();

async function allPRs(u) {
  const out = [];
  for (let p = 1; p <= 3; p++) { const r = await j(`https://api.github.com/search/issues?q=${encodeURIComponent(`author:${u} type:pr -user:${u}`)}&per_page=100&page=${p}`); if (!r?.items?.length) break; out.push(...r.items); if (r.items.length < 100) break; }
  return out;
}
const seen = new Set(), prs = [];
for (const u of USERS) for (const it of await allPRs(u)) if (!seen.has(it.id)) { seen.add(it.id); prs.push(it); }
const grp = {}, label = {};
for (const it of prs) { const n = it.repository_url.split('/repos/')[1]; const g = (grp[n] ??= { name: n, merged: 0, open: 0, closed: 0 }); if (it.pull_request?.merged_at) g.merged++; else if (it.state === 'open') g.open++; else g.closed++; }
const cards = [], hidden = { merged: 0, open: 0, closed: 0, n: 0 }, unmapped = [];
for (const g of Object.values(grp)) {
  let r = MOCK ? { private: false } : await j(`https://api.github.com/repos/${g.name}`);
  if (!r && !MOCK) r = await j(`https://api.github.com/repos/${g.name}`); // one retry; on failure treat as private so a name never leaks
  const priv = !r || r.private, pm = cfg.private_repos?.[g.name];
  if (!priv) { label[g.name] = g.name.split('/')[1]; cards.push({ ...g, title: g.name, link: `https://github.com/${g.name}/pulls?q=is%3Apr+author%3A${USER}`, private: false }); }
  else if (pm) { label[g.name] = pm.name; cards.push({ ...g, title: pm.name, link: pm.url || '', private: true }); }
  else { label[g.name] = null; hidden.merged += g.merged; hidden.open += g.open; hidden.closed += g.closed; hidden.n++; unmapped.push(g.name); }
}
if (hidden.n) cards.push({ title: 'Private repositories', link: '', private: true, merged: hidden.merged, open: hidden.open, closed: hidden.closed });
for (const e of cfg.extra_oss || []) cards.push({ title: e.name, link: e.url || '', private: !!e.private, merged: e.merged || 0, open: 0, closed: 0 });
cards.sort((a, b) => b.merged - a.merged);
const totals = cards.reduce((a, c) => ({ merged: a.merged + c.merged, open: a.open + c.open, closed: a.closed + c.closed }), { merged: 0, open: 0, closed: 0 });
if (unmapped.length) console.log(`${unmapped.length} private repo(s) have no entry in config.json private_repos (run with --list-private locally to see names)`);
if (process.argv.includes('--list-private')) console.log(unmapped.join('\n'));
const prList = prs.map((it) => { const merged = !!it.pull_request?.merged_at, open = it.state === 'open'; return { repo: it.repository_url.split('/repos/')[1], merged, open, t0: Date.parse(it.created_at), t1: open ? Date.now() : Date.parse(it.closed_at) }; }).sort((a, b) => a.t0 - b.t0);

// ---------- derived ----------
const today = to.toISOString().slice(0, 10), dayDiff = (a) => Math.round((Date.parse(today) - Date.parse(a)) / 864e5);
let best = 0, run = 0, cur = 0, bestEnd = -1;
days.forEach((d, i) => { if (d.contributionCount > 0) { run++; if (run > best) { best = run; bestEnd = i; } } else run = 0; });
for (let i = days.length - 1; i >= 0; i--) { if (days[i].contributionCount > 0) cur++; else if (i === days.length - 1) continue; else break; }
const streakDates = new Set(best ? days.slice(bestEnd - best + 1, bestEnd + 1).map((d) => d.date) : []);
const lastDay = [...days].reverse().find((d) => d.contributionCount > 0), lastAgo = lastDay ? dayDiff(lastDay.date) : null;
const status = lastAgo === null ? ['No contribution data yet', C.mute] : lastAgo <= 2 ? [lastAgo === 0 ? 'Active today' : lastAgo === 1 ? 'Active yesterday' : 'Active 2 days ago', C.green] : lastAgo <= 14 ? [`Last contribution ${lastAgo} days ago`, C.orange] : [`Last contribution ${lastAgo} days ago`, C.red];

// dynamic content
const langBytes = {}; for (const r of R) for (const e of r.languages.edges) langBytes[e.node.name] = (langBytes[e.node.name] || 0) + e.size;
const topicCnt = {}; for (const r of R) for (const tp of r.repositoryTopics.nodes) topicCnt[tp.topic.name] = (topicCnt[tp.topic.name] || 0) + 1;
const topLangs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).map(([n]) => n);
const topTopics = Object.entries(topicCnt).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 18);
const stack = structuredClone(cfg.stack);
if (topLangs.length) stack.Languages = [...new Set([...(stack.Languages || []), ...topLangs.slice(0, 8)])];
if (topTopics.length) stack['From repo topics'] = topTopics;
const about = [];
if (pu?.bio) about.push(['who', pu.bio]); if (pu?.location) about.push(['where', pu.location]); if (pu?.company) about.push(['at', pu.company]);
if (R[0]) about.push(['latest', `${R[0].name}${R[0].description ? ': ' + R[0].description : ''}`]);
if (pu?.createdAt) about.push(['github', `since ${pu.createdAt.slice(0, 4)}, ${nRepos} public repos`]);
about.push(...(cfg.about_extra || []));
const toProj = (r) => ({ name: r.name, repo: r.nameWithOwner, url: r.homepageUrl || '', status: r.isArchived ? 'archived' : '', tags: [r.primaryLanguage?.name, ...r.repositoryTopics.nodes.map((x) => x.topic.name)].filter(Boolean).slice(0, 6), desc: r.description || r.name, long: `${r.stargazerCount} stars. Updated ${r.pushedAt.slice(0, 10)}.` });
const pinned = (pu?.pinnedItems.nodes ?? []).filter(Boolean).map(toProj), pool = pinned.length ? pinned : R.slice(0, 5).map(toProj), manual = cfg.projects.filter((p) => p.name);
const projs = [...manual, ...pool.filter((p) => !manual.some((m) => m.repo && m.repo === p.repo))].slice(0, 5);
const journeyAll = [...cfg.journey];
if (pu?.createdAt) journeyAll.push({ year: pu.createdAt.slice(0, 4), text: 'Joined GitHub' });
if (R.length) { const f = [...R].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]; journeyAll.push({ year: f.createdAt.slice(0, 4), text: `First public repo: ${f.name}` }); }
journeyAll.sort((a, b) => String(a.year).localeCompare(String(b.year)));

// ---------- assets ----------
function heroSvg() {
  const W = 900, H = 420, school = cfg.school.toUpperCase(), pw = Math.round(school.length * (13 * 0.66 + 1.5) + 44);
  const mw = Math.round(`${totals.merged} MERGED`.length * (13 * 0.66 + 1) + 58), cl = commits.length ? commits.map((c, i) => `${t(24, 124 + i * 50, c.sha, { z: 13, f: 'm', c: C.yellow })}${t(86, 124 + i * 50, cut(c.msg, 36), { z: 13, f: 'm' })}${t(86, 142 + i * 50, `${cut(c.repo, 18)} · ${c.ago}`, { z: 11, f: 'm', c: C.mute })}`).join('') : t(24, 124, 'fatal: no public commits found', { z: 13, f: 'm', c: C.red });
  const py = 124 + Math.max(1, commits.length) * 50 + 8, chipX = 40 + tw('building ', 28, 'h') + 6, cw = Math.round(tw(cfg.hero_chip, 28, "h") + 48);
  return svg(W, H, `${dots(W, H)}
<g transform="rotate(-2 40 60)"><rect x="40" y="46" width="${pw}" height="32" rx="16" fill="${C.peri}"/>${t(58, 67, school, { z: 13, f: 'h', w: 700, ls: 1.5, c: C.bg })}</g>
${t(38, 176, cfg.name, { z: 84, f: 'h', w: 700, ls: -3 })}${t(40, 228, cfg.hero_lead, { z: 28, f: 'h', w: 700 })}${t(40, 276, 'building', { z: 28, f: 'h', w: 700 })}
<rect x="${chipX}" y="244" width="${cw}" height="44" rx="9" fill="${C.orange}"/>${t(chipX + 18, 276, cfg.hero_chip, { z: 28, f: 'h', w: 700, c: C.bg })}${t(chipX + cw + 4, 276, '.', { z: 28, f: 'h', w: 700 })}
${wrap(cfg.hero_sub, 44).map((l, i) => t(40, 326 + i * 24, l, { z: 15, c: C.mute })).join('')}
<g transform="translate(470 56)"><rect width="410" height="300" rx="18" fill="${C.navy}" stroke="${C.line}"/><circle cx="26" cy="26" r="5.5" fill="#ff5f56"/><circle cx="44" cy="26" r="5.5" fill="#ffbd2e"/><circle cx="62" cy="26" r="5.5" fill="#27c93f"/>${t(84, 31, `git log: ${USER.toLowerCase()}`, { z: 12, f: 'm', c: C.mute })}<line x1="0" y1="52" x2="410" y2="52" stroke="${C.line}"/>
${t(24, 88, '$', { z: 13, f: 'm', c: C.green })}${t(40, 88, `git log --author="${USER}" -3`, { z: 13, f: 'm' })}${cl}${t(24, py, '$', { z: 13, f: 'm', c: C.green })}<rect x="40" y="${py - 12}" width="8" height="15" fill="${C.mute}"><animate attributeName="opacity" values="1;1;0;0" dur="1.1s" repeatCount="indefinite"/></rect></g>
<g transform="rotate(3 ${880 - mw / 2} 56)"><rect x="${880 - mw}" y="38" width="${mw}" height="36" rx="18" fill="${C.lav}"/><circle cx="${880 - mw + 22}" cy="56" r="7" fill="${C.purple}"/>${t(880 - mw + 36, 62, `${totals.merged} MERGED`, { z: 13, f: 'h', w: 700, ls: 1, c: C.purple })}</g>
<g transform="rotate(-2 560 356)"><rect x="486" y="338" width="${Math.round(tw(`${nRepos} public repos`, 13, 'h') + 40)}" height="34" rx="17" fill="${C.bg}" stroke="${C.line}"/><circle cx="504" cy="355" r="4" fill="${C.orange}"/>${t(516, 360, `${nRepos} public repos`, { z: 13, f: 'h', w: 700 })}</g>`);
}

async function asciiSvg() {
  const W = 900, f = ['jpg', 'jpeg', 'png', 'webp'].map((e) => path.join(root, 'assets', `photo.${e}`)).find((p) => fs.existsSync(p)); let lines = null; const cols = 96;
  if (f) try {
    const { default: sharp } = await import('sharp'); const m = await sharp(f).metadata(), rows = Math.round(cols * (m.height / m.width) * 0.52);
    const { data } = await sharp(f).resize(cols, rows, { fit: 'fill' }).grayscale().normalize().raw().toBuffer({ resolveWithObject: true }); const ramp = ' .:-=+*#%@';
    lines = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => ramp[Math.min(9, Math.floor((data[y * cols + x] / 256) * 10))]).join(''));
  } catch { lines = null; }
  const head = `<circle cx="26" cy="26" r="5.5" fill="#ff5f56"/><circle cx="44" cy="26" r="5.5" fill="#ffbd2e"/><circle cx="62" cy="26" r="5.5" fill="#27c93f"/>${t(84, 31, 'photo.txt', { z: 12, f: 'm', c: C.mute })}<line x1="0" y1="52" x2="${W}" y2="52" stroke="${C.line}"/>`;
  if (!lines) return svg(W, 220, `${card(W, 220, C.navy)}${head}${t(450, 128, 'cat photo.txt', { z: 14, f: 'm', c: C.mute, a: 'middle' })}${t(450, 154, 'not generated yet: add assets/photo.jpg', { z: 12, f: 'm', c: C.dim, a: 'middle' })}`);
  const fz = 7.6, lh = 8.8, x0 = (W - cols * fz * 0.6) / 2, H = Math.round(lines.length * lh + 84);
  return svg(W, H, `${card(W, H, C.navy)}${head}${lines.map((l, i) => `<text class="l" x="${x0}" y="${78 + i * lh}" font-size="${fz}" fill="#aab3d6" xml:space="preserve" style="white-space:pre;animation-delay:${(i * 0.012).toFixed(2)}s" font-family="${FF.m}">${esc(l)}</text>`).join('')}`, '.l{animation:f .5s ease-out backwards}@keyframes f{from{opacity:0}}');
}

const headerSvg = (pill, pre, hi) => { const pw = Math.round(pill.length * (12 * 0.66 + 1.4) + 40); return svg(900, 124, `${dots(900, 124)}<g transform="rotate(-2 20 34)"><rect x="8" y="18" width="${pw}" height="28" rx="14" fill="${C.peri}"/>${t(24, 37, pill.toUpperCase(), { z: 12, f: 'h', w: 700, ls: 1.4, c: C.bg })}</g><text x="8" y="96" font-size="44" font-weight="700" fill="${C.text}" font-family="${FF.h}" letter-spacing="-1">${esc(pre)} <tspan fill="${C.peri}">${esc(hi)}</tspan></text><path d="M10 110 C70 103 150 110 214 106" fill="none" stroke="${C.peri}" stroke-width="2.4" stroke-linecap="round"/>`); };

function aboutSvg() {
  const H = 40 + about.length * 36;
  return svg(900, H, `${card(900, H)}${about.map(([k, v], i) => `${t(28, 52 + i * 36, k, { z: 12, f: 'm', c: C.mute })}${t(150, 52 + i * 36, cut(v, 82), { z: 15 })}`).join('')}`);
}

function statsSvg() {
  const items = [[nRepos, 'public repos'], [fmt(contribs), 'contributions, last year'], [totals.merged, 'pull requests merged'], [nFollowers, 'followers']];
  return svg(900, 190, `${card(900, 190)}<circle cx="34" cy="36" r="5" fill="${status[1]}"/>${t(48, 41, status[0], { z: 14 })}${t(872, 41, `streak ${cur}d · best ${best}d`, { z: 12, f: 'm', c: C.mute, a: 'end' })}
${items.map(([v, c], i) => { const x = 28 + i * 214; return `<line x1="${x}" y1="68" x2="${x + 190}" y2="68" stroke="${C.line}"/>${t(x, 126, String(v), { z: 48, f: 'h', w: 700 })}${t(x, 154, c, { z: 13, c: C.mute })}`; }).join('')}`);
}

function heatSvg() {
  const W = 900, H = 316, X0 = 26, Y0 = 138, S = 13, G = 3, max = Math.max(1, ...days.map((d) => d.contributionCount));
  const lvl = (c) => (c === 0 ? 0 : c / max <= 0.25 ? 1 : c / max <= 0.5 ? 2 : c / max <= 0.75 ? 3 : 4), bestDay = days.reduce((b, d) => (d.contributionCount > (b?.contributionCount ?? -1) ? d : b), null);
  let cells = '', months = '', lastM = -1, tX = 0, tY = 0, cX = 0, cY = 0; const marks = [];
  weeks.forEach((w, ci) => { const m = new Date(w.contributionDays[0].date + 'T00:00:00Z').getUTCMonth(); if (m !== lastM) { marks.push([ci, m]); lastM = m; } });
  if (marks.length > 1 && marks[1][0] - marks[0][0] < 4) marks.shift();
  for (const [ci, m] of marks) if (ci < weeks.length - 2) months += t(X0 + ci * (S + G), Y0 - 10, new Date(Date.UTC(2000, m, 1)).toLocaleString('en', { month: 'short' }).toUpperCase(), { z: 9, f: 'm', c: C.mute });
  weeks.forEach((w, ci) => { for (const d of w.contributionDays) {
    const x = X0 + ci * (S + G), y = Y0 + d.weekday * (S + G);
    if (d.date === today) { tX = x; tY = y; } if (bestDay && d.date === bestDay.date && d.contributionCount) { cX = x; cY = y; }
    cells += `<rect class="c" x="${x}" y="${y}" width="${S}" height="${S}" rx="3" fill="${RAMP[lvl(d.contributionCount)]}" style="animation-delay:${(ci * 0.02).toFixed(2)}s"/>${streakDates.has(d.date) ? `<rect x="${x + 5}" y="${y + 5}" width="3" height="3" fill="${C.yellow}"/>` : ''}`; } });
  const sprite = tX ? `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="1s" repeatCount="indefinite"/><rect x="${tX + 3}" y="${tY - 15}" width="6" height="2" fill="${C.orange}"/><rect x="${tX + 4}" y="${tY - 17}" width="4" height="2" fill="${C.orange}"/><rect x="${tX + 4}" y="${tY - 13}" width="4" height="3" fill="${C.lav}"/><rect x="${tX + 3}" y="${tY - 10}" width="6" height="5" fill="${C.peri}"/><rect x="${tX + 3}" y="${tY - 5}" width="2" height="4" fill="#27337a"/><rect x="${tX + 7}" y="${tY - 5}" width="2" height="4" fill="#27337a"/></g>` : '';
  const castle = cX ? `<rect x="${cX - 1}" y="${cY - 8}" width="15" height="9" fill="${C.lav}"/><rect x="${cX - 1}" y="${cY - 12}" width="4" height="4" fill="${C.lav}"/><rect x="${cX + 5}" y="${cY - 12}" width="4" height="4" fill="${C.lav}"/><rect x="${cX + 11}" y="${cY - 12}" width="4" height="4" fill="${C.lav}"/><rect x="${cX + 6}" y="${cY - 20}" width="1" height="8" fill="${C.mute}"/><rect x="${cX + 7}" y="${cY - 20}" width="6" height="4" fill="${C.orange}"/><rect x="${cX + 5}" y="${cY - 3}" width="4" height="4" fill="${C.navy}"/>` : '';
  const empty = days.length ? '' : t(450, 200, 'no contribution data yet', { z: 13, c: C.mute, a: 'middle' });
  return svg(W, H, `${card(W, H)}${t(28, 62, fmt(contribs), { z: 44, f: 'h', w: 700 })}${t(28, 88, 'contributions in the last year', { z: 13, c: C.mute })}
${t(872, 62, `${cur}d`, { z: 44, f: 'h', w: 700, a: 'end' })}${t(872, 88, 'current streak', { z: 13, c: C.mute, a: 'end' })}${t(700, 62, `${best}d`, { z: 44, f: 'h', w: 700, a: 'end' })}${t(700, 88, 'longest streak', { z: 13, c: C.mute, a: 'end' })}
<line x1="28" y1="106" x2="872" y2="106" stroke="${C.line}"/>${months}${cells}${empty}${castle}${sprite}
${t(28, 296, bestDay && bestDay.contributionCount ? `best day: ${bestDay.contributionCount} contributions on ${bestDay.date}` : '', { z: 11, f: 'm', c: C.mute })}${t(752, 296, 'less', { z: 11, f: 'm', c: C.mute, a: 'end' })}${RAMP.map((c, i) => `<rect x="${762 + i * 16}" y="286" width="11" height="11" rx="2.5" fill="${c}"/>`).join('')}${t(846, 296, 'more', { z: 11, f: 'm', c: C.mute })}${t(380, 296, 'yellow dots: longest streak', { z: 11, f: 'm', c: C.mute })}`,
    '.c{transform-box:fill-box;transform-origin:center;animation:p .35s ease-out backwards}@keyframes p{from{opacity:0;transform:scale(.4)}}');
}

function ecgSvg() {
  const W = 900, H = 290, L = 40, R = 860, b = 186, m = {};
  for (const d of days) { const k = d.date.slice(0, 7); m[k] = (m[k] || 0) + d.contributionCount; }
  const keys = Object.keys(m).sort().slice(-12), vals = keys.map((k) => m[k]), max = Math.max(1, ...vals), mw = (R - L) / Math.max(1, keys.length); let d = `M${L} ${b}`, labels = '';
  keys.forEach((k, i) => { const x0 = L + i * mw, u = mw / 10, v = vals[i], X = (q) => (x0 + q * u).toFixed(1);
    if (v > 0) { const A = 12 + (v / max) * 92; d += `L${X(1.4)} ${b}Q${X(2.2)} ${b - 9} ${X(3)} ${b}L${X(4.1)} ${b}L${X(4.5)} ${b + 10}L${X(5)} ${b - A}L${X(5.5)} ${b + 16}L${X(6)} ${b}L${X(6.8)} ${b}Q${X(7.7)} ${b - 18} ${X(8.6)} ${b}L${X(10)} ${b}`; } else d += `L${X(10)} ${b}`;
    labels += t((x0 + mw / 2).toFixed(1), 236, new Date(k + '-01T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase(), { z: 10, f: 'm', c: C.mute, a: 'middle' }) + t((x0 + mw / 2).toFixed(1), 256, String(vals[i]), { z: 12, f: 'm', a: 'middle' }); });
  if (!keys.length) d += `L${R} ${b}`;
  const avg = days.length ? (contribs / days.length).toFixed(1) : '0.0', dur = '6s', kt = 'keyTimes="0;.75;1"';
  return svg(W, H, `<defs><pattern id="g1" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="${C.peri}" stroke-opacity=".07"/></pattern><pattern id="g2" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="${C.peri}" stroke-opacity=".14"/></pattern><filter id="gl" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
${card(W, H, C.navy)}${t(28, 42, 'Monthly pulse', { z: 20, f: 'h', w: 700 })}${t(28, 62, 'contributions per month, one heartbeat each', { z: 12, c: C.mute })}${t(872, 46, `${avg} per day on average`, { z: 12, f: 'm', c: C.mute, a: 'end' })}
<rect x="24" y="76" width="852" height="136" fill="url(#g1)"/><rect x="24" y="76" width="852" height="136" fill="url(#g2)"/>
<path d="${d}" fill="none" stroke="${C.peri}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1" filter="url(#gl)"><animate attributeName="stroke-dashoffset" values="1;0;0" ${kt} dur="${dur}" repeatCount="indefinite"/></path>
<circle r="3.2" fill="${C.lav}" filter="url(#gl)"><animateMotion path="${d}" dur="${dur}" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" ${kt}/><animate attributeName="opacity" values="1;1;0" ${kt} dur="${dur}" repeatCount="indefinite"/></circle>${labels}`);
}

function stackSvg(title, items) {
  const W = 900; let x = 24, y = 58, rows = 1, out = '';
  items.forEach((n) => { const has = !!ICONS[n.toLowerCase()], w = Math.round(tw(n, 13) + (has ? 52 : 40)); if (x + w > W - 24) { x = 24; y += 46; rows++; }
    out += `<g transform="translate(${x} ${y})"><rect width="${w}" height="36" rx="10" fill="${C.navy}" stroke="${C.line}"/>${has ? ico(n, 12, 10, 16) : `<circle cx="15" cy="18" r="3.5" fill="${C.peri}"/>`}${t(has ? 36 : 28, 23, n, { z: 13 })}</g>`; x += w + 10; });
  const H = 58 + rows * 46 + 6;
  return svg(W, H, `${card(W, H)}${t(24, 34, title, { z: 20, f: 'h', w: 700 })}${t(876, 34, String(items.length), { z: 12, f: 'm', c: C.mute, a: 'end' })}${out}`);
}
function langsSvg() {
  const cnt = {}; for (const r of repos) if (r.language && !r.fork) cnt[r.language] = (cnt[r.language] || 0) + 1;
  const src = Object.keys(langBytes).length ? langBytes : cnt, arr = Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 7); if (!arr.length) return null;
  const tot = arr.reduce((a, [, n]) => a + n, 0); let x = 24, bar = '', lg = '', lx = 24;
  arr.forEach(([l, n], i) => { const w = (n / tot) * 852; bar += `<rect x="${x.toFixed(1)}" y="56" width="${Math.max(3, w - 3).toFixed(1)}" height="12" rx="6" fill="${PAL[i]}"/>`; x += w; const s = `${l} ${Math.round((n / tot) * 100)}%`; lg += `<circle cx="${lx + 4}" cy="94" r="4" fill="${PAL[i]}"/>${t(lx + 14, 98, s, { z: 12 })}`; lx += tw(s, 12) + 34; });
  return svg(900, 124, `${card(900, 124)}${t(24, 34, 'Languages across public repos', { z: 20, f: 'h', w: 700 })}${bar}${lg}`);
}

function ossSvg() {
  const W = 900, H = 340, L = 44, Rr = 856, MY = 262;
  const head = `${t(28, 70, String(totals.merged), { z: 52, f: 'h', w: 700, c: C.peri })}${t(28 + tw(String(totals.merged), 52, 'h') + 14, 64, 'pull requests merged', { z: 16 })}${t(872, 64, `${totals.open} open · ${totals.closed} closed · ${cards.length} projects`, { z: 12, f: 'm', c: C.mute, a: 'end' })}<line x1="28" y1="92" x2="872" y2="92" stroke="${C.line}"/>`;
  if (!prList.length) return svg(W, 140, `${card(W, 140)}${head}${t(450, 124, 'merged pull requests appear here once the token can see them', { z: 12, f: 'm', c: C.mute, a: 'middle' })}`);
  const tmin = prList[0].t0 - 7 * 864e5, tmax = Date.now(), X = (v) => L + ((v - tmin) / (tmax - tmin)) * (Rr - L); let g = `<line x1="${L}" y1="${MY}" x2="${Rr}" y2="${MY}" stroke="${C.gray}" stroke-width="2.5"/>`;
  const d0 = new Date(tmin); d0.setUTCDate(1); d0.setUTCMonth(d0.getUTCMonth() + 1); const nm = Math.ceil(((tmax - tmin) / 864e5) / 30), step = Math.max(1, Math.ceil(nm / 12));
  for (let i = 0, d = new Date(d0); d.getTime() < tmax; d.setUTCMonth(d.getUTCMonth() + 1), i++) if (i % step === 0) { const x = X(d.getTime()); g += `<circle cx="${x.toFixed(1)}" cy="${MY}" r="7" fill="${C.card}" stroke="${C.gray}" stroke-width="2"/>${t(x.toFixed(1), MY + 28, d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase(), { z: 10, f: 'm', c: C.mute, a: 'middle' })}`; }
  const done = new Set(), lx = [];
  prList.forEach((p, k) => { const x1 = X(p.t1) < L + 70 ? L + 70 : X(p.t1), x0 = Math.min(X(p.t0), x1 - 70), h = 52 + (k % 3) * 34, y = MY - h, col = p.merged ? C.peri : p.open ? C.orange : C.dim;
    g += `<path d="M${x0.toFixed(1)} ${MY}C${(x0 + 14).toFixed(1)} ${MY} ${(x0 + 6).toFixed(1)} ${y} ${(x0 + 22).toFixed(1)} ${y}L${(x1 - 22).toFixed(1)} ${y}C${(x1 - 6).toFixed(1)} ${y} ${(x1 - 14).toFixed(1)} ${MY} ${x1.toFixed(1)} ${MY}" fill="none" stroke="${col}" stroke-width="2.2"${p.open ? ' stroke-dasharray="5 4"' : ''}/>`;
    if (p.merged) g += `<circle cx="${x1.toFixed(1)}" cy="${MY}" r="9" fill="${C.peri}" stroke="${C.card}" stroke-width="3"/>`;
    const mid = (x0 + x1) / 2; if (label[p.repo] && !done.has(p.repo) && lx.every((q) => Math.abs(q - mid) > 90)) { done.add(p.repo); lx.push(mid); g += t(((x0 + x1) / 2).toFixed(1), y - 9, cut(label[p.repo], 16), { z: 10, f: 'm', c: C.mute, a: 'middle' }); } });
  return svg(W, H, `${card(W, H)}${head}${g}${t(28, H - 12, 'grey line: my history · blue line: a pull request · filled dot: merged', { z: 11, f: 'm', c: C.dim })}`);
}
function ossCard(c) {
  const W = 440, H = 120, tt = c.merged + c.open + c.closed, bw = 396;
  const seg = (n, col, x) => (tt && n ? `<rect x="${x.toFixed(1)}" y="92" width="${Math.max(4, (n / tt) * bw - 3).toFixed(1)}" height="6" rx="3" fill="${col}"/>` : '');
  const bars = tt ? seg(c.merged, C.peri, 22) + seg(c.open, C.orange, 22 + (c.merged / tt) * bw) + seg(c.closed, C.dim, 22 + ((c.merged + c.open) / tt) * bw) : `<rect x="22" y="92" width="${bw}" height="6" rx="3" fill="${C.dim}"/>`;
  return svg(W, H, `${card(W, H)}${t(22, 40, cut(c.title, 26), { z: 19, f: 'h', w: 700 })}${t(22, 62, c.private ? 'PRIVATE' : 'PUBLIC', { z: 10, f: 'm', c: C.mute, ls: 2 })}${t(418, 52, String(c.merged), { z: 40, f: 'h', w: 700, c: C.peri, a: 'end' })}${t(418, 68, 'merged', { z: 11, c: C.mute, a: 'end' })}${bars}${t(22, 114, `${c.open} open · ${c.closed} closed${c.link ? '' : ''}`, { z: 10, f: 'm', c: C.mute })}${c.link ? t(418, 114, '↗', { z: 12, f: 'm', c: C.peri, a: 'end' }) : ''}`);
}

const clip = (s, n, k) => { const l = wrap(s, n); return l.length > k ? [...l.slice(0, k - 1), cut(l.slice(k - 1).join(' '), n)] : l; };
function projCard(p, i, all) {
  const dl = all.map((q) => clip(q.desc, 46, 3).length), ll = all.map((q) => (q.long && q.long !== q.desc ? clip(q.long, 46, 3).length : 0));
  const H = 96 + Math.max(...dl) * 22 + (Math.max(...ll) ? 14 + Math.max(...ll) * 22 : 0) + 44, W = 440, d = clip(p.desc, 46, 3), l = p.long && p.long !== p.desc ? clip(p.long, 46, 3) : [];
  return svg(W, H, `${card(W, H)}${t(24, 46, cut(p.name, 22), { z: 24, f: 'h', w: 700 })}${t(416, 44, cut((p.status || p.tags?.[0] || '').toUpperCase(), 14), { z: 11, f: 'm', c: C.mute, ls: 2, a: 'end' })}
${d.map((x, k) => t(24, 82 + k * 22, x, { z: 14, c: C.mute })).join('')}${l.map((x, k) => t(24, 82 + d.length * 22 + 14 + k * 22, x, { z: 14 })).join('')}${t(24, H - 24, p.repo || p.url ? 'Read the source ↗' : 'closed source', { z: 12, f: 'm', c: p.repo || p.url ? C.peri : C.mute })}`);
}

function journeySvg() {
  const J = journeyAll, n = J.length, W = 900, H = 230, step = n > 1 ? 660 / (n - 1) : 0, y = 84;
  const items = J.map((e, i) => { const x = n > 1 ? 120 + i * step : 450, last = i === n - 1;
    return `<circle cx="${x}" cy="${y}" r="${last ? 15 : 12}" fill="${last ? C.peri : C.card}" stroke="${last ? C.peri : C.gray}" stroke-width="2.5">${last ? `<animate attributeName="r" values="15;18;15" dur="1.8s" repeatCount="indefinite"/>` : ''}</circle>${t(x, 46, String(e.year), { z: 24, f: 'h', w: 700, c: last ? C.peri : C.text, a: 'middle' })}${wrap(e.text, Math.max(14, Math.floor(Math.min(step, 190) / 8.2))).slice(0, 4).map((l, k) => t(x, 128 + k * 20, l, { z: 13, c: C.mute, a: 'middle' })).join('')}`; }).join('');
  return svg(W, H, `${card(W, H)}<line x1="${n > 1 ? 50 : 30}" y1="${y}" x2="${n > 1 ? 850 : 870}" y2="${y}" stroke="${C.gray}" stroke-width="2.5"/>${items}`);
}

async function chessSvg() {
  const W = 900, H = 300, S = 30, BX = 26, BY = 30, st = await j(`https://api.chess.com/pub/player/${CHESS}/stats`); let game = null;
  const arch = (await j(`https://api.chess.com/pub/player/${CHESS}/games/archives`))?.archives; if (arch?.length) game = (await j(arch[arch.length - 1]))?.games?.at(-1) ?? null;
  const fen = game?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', gl = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }; let sq = '', cs = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cs += `<rect x="${BX + c * S}" y="${BY + r * S}" width="${S}" height="${S}" fill="${(r + c) % 2 ? '#1b2140' : '#2a3263'}"/>`;
  fen.split(' ')[0].split('/').forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) { c += +ch; continue; } const w = ch === ch.toUpperCase(); sq += `<text x="${BX + c * S + S / 2}" y="${BY + r * S + S * 0.77}" font-size="24" text-anchor="middle" fill="${w ? '#f2f3f7' : '#0b0d14'}" stroke="${w ? '#0b0d14' : '#f2f3f7'}" stroke-width=".5">${gl[ch.toLowerCase()]}</text>`; c++; } });
  const rt = (k) => st?.[`chess_${k}`]?.last?.rating ?? '-', rec = st?.chess_rapid?.record;
  const cols = [['rapid', rt('rapid')], ['blitz', rt('blitz')], ['bullet', rt('bullet')]].map(([l, v], i) => `${t(310 + i * 190, 100, String(v), { z: 44, f: 'h', w: 700 })}${t(310 + i * 190, 124, l, { z: 13, c: C.mute })}`).join('');
  let recS = t(310, 186, 'no rapid record', { z: 12, f: 'm', c: C.mute });
  if (rec) { const tot = rec.win + rec.loss + rec.draw || 1, bw = 560, a = (rec.win / tot) * bw, dd = (rec.draw / tot) * bw, lo = (rec.loss / tot) * bw; recS = `${t(310, 178, 'rapid record', { z: 12, f: 'm', c: C.mute })}${t(870, 178, `${rec.win}W  ${rec.draw}D  ${rec.loss}L`, { z: 12, f: 'm', a: 'end' })}<rect x="310" y="188" width="${Math.max(0, a - 3).toFixed(1)}" height="8" rx="4" fill="${C.peri}"/><rect x="${(310 + a).toFixed(1)}" y="188" width="${Math.max(0, dd - 3).toFixed(1)}" height="8" rx="4" fill="${C.dim}"/><rect x="${(310 + a + dd).toFixed(1)}" y="188" width="${Math.max(0, lo - 3).toFixed(1)}" height="8" rx="4" fill="${C.orange}"/>`; }
  let last = t(310, 250, 'no recent game found', { z: 14, c: C.mute });
  if (game) { const mine = game.white.username.toLowerCase() === CHESS.toLowerCase() ? game.white : game.black, opp = mine === game.white ? game.black : game.white; const res = mine.result === 'win' ? ['Won', C.peri] : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(mine.result) ? ['Drew', C.mute] : ['Lost', C.orange]; last = `${t(310, 252, res[0], { z: 22, f: 'h', w: 700, c: res[1] })}${t(310 + tw(res[0], 22, 'h') + 14, 252, `vs ${opp.username} (${opp.rating}), ${game.time_class}`, { z: 14 })}`; }
  return svg(W, H, `${card(W, H)}${cs}${sq}${t(310, 52, 'chess.com', { z: 12, f: 'm', c: C.mute, ls: 2 })}${t(872, 52, `${CHESS} ↗`, { z: 13, f: 'm', c: C.peri, a: 'end' })}${cols}${recS}${t(310, 226, 'last game', { z: 12, f: 'm', c: C.mute })}${last}`);
}

const btn = (label, primary) => svg(214, 68, `<rect x="6" y="6" width="204" height="56" rx="14" fill="#000"/><rect x="1" y="1" width="204" height="56" rx="14" fill="${primary ? C.yellow : C.card}" stroke="${primary ? C.yellow : C.line}"/>${t(24, 36, label.toUpperCase(), { z: 15, f: 'h', w: 700, c: primary ? C.bg : C.text, ls: 0.5 })}${t(184, 36, '↗', { z: 16, f: 'h', w: 700, c: primary ? C.bg : C.peri, a: 'end' })}`);

// ---------- write ----------
write('hero.svg', heroSvg()); write('ascii.svg', await asciiSvg());
const H = { about: ['About', 'About', 'me.'], activity: ['Activity', 'What I shipped', 'this year.'], stack: ['Tech stack', 'What I build', 'with.'], oss: ['Open source', 'Code other people', 'review.'], projects: ['Projects', 'Things I', 'built.'], journey: ['Journey', 'How I got', 'here.'], chess: ['Chess', 'Away from the', 'keyboard.'], contact: ['Contact', 'Find', 'me.'] };
for (const [k, [p, a, b]] of Object.entries(H)) write(`hdr-${k}.svg`, headerSvg(p, a, b));
write('about.svg', aboutSvg()); write('stats.svg', statsSvg()); write('heatmap.svg', heatSvg()); write('ecg.svg', ecgSvg());
const sk = Object.keys(stack); sk.forEach((k, i) => write(`stack-${i}.svg`, stackSvg(k, stack[k]))); const langs = langsSvg(); if (langs) write('langs.svg', langs);
write('oss.svg', ossSvg()); cards.forEach((c, i) => write(`oss-${i}.svg`, ossCard(c)));
projs.forEach((p, i) => write(`proj-${i}.svg`, projCard(p, i, projs)));
write('journey.svg', journeySvg()); write('chess.svg', await chessSvg());
const hasMail = cfg.email && !cfg.email.includes('CHANGE_ME'); const contacts = [...(hasMail ? [['Email', `mailto:${cfg.email}`]] : []), ['LinkedIn', cfg.linkedin], ['X', cfg.x], ['GitHub', `https://github.com/${USER}`]].filter(([, u]) => u);
contacts.forEach(([l], i) => write(`contact-${i}.svg`, btn(l, i === 0)));

const V = crypto.createHash('md5').update(fs.readdirSync(path.join(root, 'assets')).filter((f) => f.endsWith('.svg')).sort().map((f) => fs.readFileSync(path.join(root, 'assets', f), 'utf8')).join('')).digest('hex').slice(0, 8);
const im = (f, alt, w = '100%') => `<img src="assets/${f}?v=${V}" width="${w}" alt="${esc(alt)}">`, lk = (href, html) => (href ? `<a href="${href}">${html}</a>` : html);
const pair = (arr, fn) => { const o = []; for (let i = 0; i < arr.length; i += 2) o.push(arr.slice(i, i + 2).map((x, k) => fn(x, i + k)).join(' ')); return o.join('\n'); };
const cw = contacts.length === 4 ? '23.4%' : '31.5%';
const readme = [
  lk(`https://github.com/${USER}`, im('hero.svg', `${cfg.name}, ${cfg.hero_lead}`)), im('ascii.svg', 'ASCII portrait'),
  im('hdr-about.svg', 'About'), im('about.svg', 'About me'),
  im('hdr-activity.svg', 'Activity'), im('stats.svg', 'GitHub stats'), lk(`https://github.com/${USER}`, im('heatmap.svg', 'Contribution heatmap')), lk(`https://github.com/${USER}`, im('ecg.svg', 'Monthly contributions')),
  im('hdr-stack.svg', 'Tech stack'), sk.map((k, i) => im(`stack-${i}.svg`, k)).join('\n') + (langs ? `\n${im('langs.svg', 'Languages')}` : ''),
  im('hdr-oss.svg', 'Open source'), lk(`https://github.com/pulls?q=is%3Apr+author%3A${USER}+is%3Amerged`, im('oss.svg', 'Pull requests as a commit graph')), pair(cards, (c, i) => lk(c.link, im(`oss-${i}.svg`, `${c.title}, ${c.merged} merged`, '49%'))),
  im('hdr-projects.svg', 'Projects'), pair(projs, (p, i) => lk(p.repo ? `https://github.com/${p.repo}` : p.url, im(`proj-${i}.svg`, p.name, '49%'))),
  im('hdr-journey.svg', 'Journey'), im('journey.svg', 'Journey'),
  im('hdr-chess.svg', 'Chess'), lk(`https://www.chess.com/member/${CHESS}`, im('chess.svg', 'Chess.com stats')),
  im('hdr-contact.svg', 'Contact'), contacts.map(([l, u], i) => lk(u, im(`contact-${i}.svg`, l, cw))).join(' '),
].join('\n');
fs.writeFileSync(path.join(root, 'README.md'), readme);
console.log('done', { contribs, status: status[0], cards: cards.length, merged: totals.merged, prs: prList.length, v: V });
