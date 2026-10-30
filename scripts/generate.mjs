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
const C = { bg: '#09090a', card: '#131315', navy: '#0f0f11', line: '#232326', text: '#f4f4f5', mute: '#8e8e93', dim: '#3f3f46', peri: '#e4e4e7', orange: '#eb9b3a', yellow: '#f4f4f5', lav: '#d4d4d8', purple: '#e5484d', red: '#e5484d', green: '#5fd68a', gray: '#52525b', sig: '#e5484d' };
const RAMP = ['#1a1a1f', '#26382d', '#1f7a45', '#27d067', '#b44cff'], PAL = ['#f4f4f5', '#a1a1aa', '#71717a', '#e5484d', '#52525b', '#d4d4d8', '#3f3f46'];
const FF = { h: "SG,'Space Grotesk',sans-serif", b: "PJ,'Plus Jakarta Sans',sans-serif", m: "JBM,'JetBrains Mono',monospace", hc: "BC,'Barlow Condensed',sans-serif", e: "JBM,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',monospace" };
const FONTS = { PH: [['400', 'ph-400.woff2']], NU: [['400', 'nu-400.woff2']] };
const ICONS = fs.existsSync(path.join(root, 'fonts/icons.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'fonts/icons.json'), 'utf8')) : {};
const UA = { 'User-Agent': `${USER}-profile-readme (github.com/${USER})` };
const headers = { ...UA, Accept: 'application/vnd.github+json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tw = (s, z, k = 'b') => String(s).length * z * { m: 0.6, h: 0.58, b: 0.54, hc: 0.5 }[k];
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const fmt = (n) => Number(n).toLocaleString('en');
const wrap = (s, n) => { const o = []; let l = ''; for (const w of String(s).split(' ')) { if ((l + ' ' + w).trim().length > n) { o.push(l); l = w; } else l = (l + ' ' + w).trim(); } if (l) o.push(l); return o; };
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.z || 14}" fill="${o.c || C.text}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.w ? ` font-weight="${o.w}"` : ''} font-family="${FF[o.f || 'b']}">${esc(s)}</text>`;
async function jg(url, opts = {}) { try { const r = await fetch(url, { headers, ...opts }); return r.ok ? await r.json() : null; } catch { return null; } }
async function j(url, opts = {}) { try { const r = await fetch(url, { headers: UA, ...opts }); return r.ok ? await r.json() : null; } catch { return null; } }
const fontCss = (body) => Object.entries(FONTS).filter(([k]) => body.includes(`font-family="${k},`)).flatMap(([k, ws]) => ws.map(([w, f]) => { const p = path.join(root, 'fonts', f); return fs.existsSync(p) ? `@font-face{font-family:'${k}';font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}) format('woff2')}` : ''; })).join('');
const svg = (w, h, body, css = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${fontCss(body)}${css}</style>${body}</svg>`;
const OUT = process.env.GITHUB_ACTIONS ? root : path.join(root, 'preview'), OA = path.join(OUT, 'assets');
fs.mkdirSync(OA, { recursive: true }); fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
if (!process.env.GITHUB_ACTIONS) console.log('local run: writing to preview/ (your committed files are not touched)');
const write = (n, s) => fs.writeFileSync(path.join(OA, n), s);


const card = (w, h, fill = C.card, r = 18) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="${fill}" stroke="${C.line}"/>`;
const dots = (w, h, id = 'dg') => `<defs><pattern id="${id}" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="#1d1d21"/></pattern></defs><rect width="${w}" height="${h}" rx="18" fill="${C.bg}"/><rect width="${w}" height="${h}" rx="18" fill="url(#${id})"/>`;
const ico = (name, x, y, s) => (ICONS[name.toLowerCase()] ? `<path transform="translate(${x} ${y}) scale(${s / 24})" d="${ICONS[name.toLowerCase()]}" fill="${C.text}"/>` : '');
const ago = (d) => { const n = Math.floor((Date.now() - Date.parse(d)) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n}d ago`; };

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
const gq = TOKEN && !MOCK ? await jg('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query: Q, variables: { login: USER, from: from.toISOString(), to: to.toISOString() } }) }) : null;
const cal = MOCK ? { weeks: mockWeeks() } : gq?.data?.user?.contributionsCollection.contributionCalendar;
const weeks = cal?.weeks ?? [], days = weeks.flatMap((w) => w.contributionDays);
const contribs = MOCK ? days.reduce((a, d) => a + d.contributionCount, 0) : cal?.totalContributions ?? 0;
const PQ = `query($login:String!){user(login:$login){bio location company createdAt followers{totalCount} following{totalCount}
 pinnedItems(first:6,types:[REPOSITORY]){nodes{...R}}
 repositories(first:100,ownerAffiliations:OWNER,privacy:PUBLIC,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){totalCount nodes{...R}}}}
 fragment R on Repository{nameWithOwner name description url homepageUrl stargazerCount pushedAt createdAt isArchived primaryLanguage{name} repositoryTopics(first:8){nodes{topic{name}}} languages(first:8,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}`;
const gp = TOKEN && !MOCK ? await jg('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query: PQ, variables: { login: USER } }) }) : null;
const mk = (n, d, lang, tp, st) => ({ nameWithOwner: `${USER}/${n}`, name: n, description: d, url: '', homepageUrl: '', stargazerCount: st, pushedAt: '2026-09-20T00:00:00Z', createdAt: '2022-03-01T00:00:00Z', isArchived: false, primaryLanguage: { name: lang }, repositoryTopics: { nodes: tp.map((x) => ({ topic: { name: x } })) }, languages: { edges: [{ size: 9000, node: { name: lang } }, { size: 3000, node: { name: 'CSS' } }] } });
const mockUser = { bio: 'Student building AI products', location: 'Bengaluru, India', company: null, createdAt: '2021-06-01T00:00:00Z', followers: { totalCount: 9 }, following: { totalCount: 21 }, pinnedItems: { nodes: [mk('mirrormind', 'AI digital twin built from social history', 'TypeScript', ['nextjs', 'supabase'], 3), mk('f1hub', 'F1 dashboard with a race predictor', 'TypeScript', ['nextjs', 'f1'], 5)] }, repositories: { totalCount: 14, nodes: [mk('mirrormind', 'AI digital twin', 'TypeScript', ['nextjs', 'supabase'], 3), mk('jarvis', 'Voice agent', 'Python', ['llm', 'agents'], 2), mk('f1hub', 'F1 dashboard', 'TypeScript', ['nextjs', 'f1'], 5)] } };
const pu = MOCK ? mockUser : gp?.data?.user;
if (!MOCK && process.env.CI && (!gq?.data?.user || !pu)) { console.error('GitHub GraphQL returned no usable data:', JSON.stringify(gq?.errors ?? gp?.errors ?? 'no response')); process.exit(1); }
const me = await jg(`https://api.github.com/users/${USER}`);
const repos = ((await jg(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`)) ?? []).filter((r) => r.full_name.toLowerCase() !== `${USER}/${USER}`.toLowerCase());
const SELF = `${USER}/${USER}`.toLowerCase();
const R = (pu?.repositories.nodes ?? []).filter((r) => r.nameWithOwner.toLowerCase() !== SELF);
const nRepos = pu?.repositories.totalCount ?? me?.public_repos ?? 0, nFollowers = pu?.followers.totalCount ?? me?.followers ?? 0;

async function latestCommits() {
  if (MOCK) return [{ sha: 'a3f9c21', msg: 'fix: handle empty changelog diff', repo: 'patchwork', ago: '4h ago' }, { sha: '71be0d4', msg: 'feat: open PR with generated patch', repo: 'patchwork', ago: '1d ago' }, { sha: 'c08e9a7', msg: 'docs: add setup notes', repo: 'jarvis', ago: '3d ago' }];
  const out = [];
  for (const r of R.slice(0, 4)) for (const c of (await jg(`https://api.github.com/repos/${r.nameWithOwner}/commits?author=${USER}&per_page=3`)) ?? []) out.push({ sha: c.sha.slice(0, 7), msg: c.commit.message.split('\n')[0], repo: r.name, date: c.commit.author.date });
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((c) => ({ ...c, ago: ago(c.date) }));
}
const commits = await latestCommits();

async function allPRs(u) {
  const out = [];
  for (let p = 1; p <= 3; p++) { const r = await jg(`https://api.github.com/search/issues?q=${encodeURIComponent(`author:${u} type:pr -user:${u}`)}&per_page=100&page=${p}`); if (!r?.items?.length) break; out.push(...r.items); if (r.items.length < 100) break; }
  return out;
}
const seen = new Set(), prs = [];
for (const u of USERS) for (const it of await allPRs(u)) if (!seen.has(it.id)) { seen.add(it.id); prs.push(it); }
const grp = {}, label = {};
for (const it of prs) { const n = it.repository_url.split('/repos/')[1]; const g = (grp[n] ??= { name: n, merged: 0, open: 0, closed: 0 }); if (it.pull_request?.merged_at) g.merged++; else if (it.state === 'open') g.open++; else g.closed++; }
const cards = [], hidden = { merged: 0, open: 0, closed: 0, n: 0 }, unmapped = [];
for (const g of Object.values(grp)) {
  let r = MOCK ? { private: false } : await jg(`https://api.github.com/repos/${g.name}`);
  if (!r && !MOCK) r = await jg(`https://api.github.com/repos/${g.name}`); // one retry; on failure treat as private so a name never leaks
  const priv = !r || r.private, pm = cfg.private_repos?.[g.name];
  if (!priv) { label[g.name] = g.name.split('/')[1]; cards.push({ ...g, title: g.name, link: `https://github.com/${g.name}/pulls?q=is%3Apr+author%3A${USER}`, private: false }); }
  else if (pm) { label[g.name] = pm.name; cards.push({ ...g, title: pm.name, link: pm.url || '', private: true }); }
  else { label[g.name] = null; hidden.merged += g.merged; hidden.open += g.open; hidden.closed += g.closed; hidden.n++; unmapped.push(g.name); }
}
if (hidden.n) cards.push({ title: 'Private repositories', link: '', private: true, merged: hidden.merged, open: hidden.open, closed: hidden.closed });
for (const e of cfg.extra_oss || []) cards.push({ title: e.name, link: e.url || '', private: !!e.private, merged: e.merged || 0, open: 0, closed: 0 });
for (let i = cards.length - 1; i >= 0; i--) if (!cards[i].merged) cards.splice(i, 1);
cards.sort((a, b) => b.merged - a.merged);
const totals = cards.reduce((a, c) => ({ merged: a.merged + c.merged, open: a.open + c.open, closed: a.closed + c.closed }), { merged: 0, open: 0, closed: 0 });
if (unmapped.length) console.log(`${unmapped.length} private repo(s) have no entry in config.json private_repos (run with --list-private locally to see names)`);
if (process.argv.includes('--list-private')) console.log(unmapped.join('\n'));
const prList = prs.map((it) => { const merged = !!it.pull_request?.merged_at, open = it.state === 'open'; return { repo: it.repository_url.split('/repos/')[1], num: it.number, merged, open, t0: Date.parse(it.created_at), t1: open ? Date.now() : Date.parse(it.closed_at) }; }).filter((p) => p.merged).sort((a, b) => a.t0 - b.t0);
for (const [i, p] of prList.entries()) { const d = MOCK ? null : await jg(`https://api.github.com/repos/${p.repo}/pulls/${p.num}`); p.size = d ? d.additions + d.deletions : MOCK ? [38, 6, 120, 640, 220, 380][i % 6] : 40; }

// ---------- LeetCode / Codeforces (cached: a failed fetch keeps the last good data) ----------
const cachePath = path.join(root, 'data', 'cache.json'); fs.mkdirSync(path.dirname(cachePath), { recursive: true });
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
async function getCF() {
  const h = cfg.codeforces_user; if (MOCK) return { handle: h || 'demo_handle', rating: 1452, maxRating: 1511, rank: 'specialist', maxRank: 'specialist', contests: 19, solved: 241, history: Array.from({ length: 19 }, (_, i) => [Date.now() - (19 - i) * 20 * 864e5, Math.round(900 + i * 32 + Math.sin(i * 1.7) * 60)]) };
  if (!h) return null;
  const info = await j(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(h)}`); if (info?.status !== 'OK') return null;
  const rt = await j(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(h)}`), st = await j(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}`), u = info.result[0];
  return { handle: u.handle, rating: u.rating ?? 0, maxRating: u.maxRating ?? 0, rank: u.rank ?? 'unrated', maxRank: u.maxRank ?? 'unrated', contests: rt?.status === 'OK' ? rt.result.length : 0, history: rt?.status === 'OK' ? rt.result.map((r) => [r.ratingUpdateTimeSeconds * 1000, r.newRating]) : [], solved: st?.status === 'OK' ? new Set(st.result.filter((x) => x.verdict === 'OK').map((x) => `${x.problem.contestId}-${x.problem.index}`)).size : null };
}
async function getLC() {
  const u = cfg.leetcode_user;
  if (MOCK) { const cal = {}; const now = Math.floor(Date.now() / 864e5); for (let i = 0; i < 365; i++) { const r = Math.abs(Math.sin(i * 7.31) * 9999) % 1; if (r > 0.45) cal[(now - i) * 86400] = Math.ceil(r * 9); } return { user: u || 'demo_user', all: 318, easy: 142, medium: 152, hard: 24, ranking: 184213, contest: { rating: 1623.4, top: 22.4 }, cal }; }
  if (!u) return null;
  const q = 'query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}} profile{ranking} userCalendar{submissionCalendar}} userContestRanking(username:$u){rating topPercentage}}';
  const r = await j('https://leetcode.com/graphql', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json', Referer: 'https://leetcode.com' }, body: JSON.stringify({ query: q, variables: { u } }) });
  const m = r?.data?.matchedUser; if (!m) return null;
  const ac = Object.fromEntries(m.submitStatsGlobal.acSubmissionNum.map((x) => [x.difficulty, x.count])), cr = r.data.userContestRanking;
  let cal = {}; try { cal = JSON.parse(m.userCalendar?.submissionCalendar || '{}'); } catch {}
  return { user: u, all: ac.All || 0, easy: ac.Easy || 0, medium: ac.Medium || 0, hard: ac.Hard || 0, ranking: m.profile?.ranking ?? null, contest: cr?.rating ? { rating: cr.rating, top: cr.topPercentage } : null, cal };
}
const cfNew = await getCF(), lcNew = await getLC();
const cfData = cfNew ?? (cfg.codeforces_user ? cache.cf ?? null : null), lcData = lcNew ?? (cfg.leetcode_user ? cache.lc ?? null : null);
if (!MOCK) fs.writeFileSync(path.join(OUT, 'data', 'cache.json'), JSON.stringify({ cf: cfNew ?? cache.cf ?? null, lc: lcNew ?? cache.lc ?? null }));
if (cfg.codeforces_user && !cfNew) console.log('codeforces fetch failed, using cached data'); if (cfg.leetcode_user && !lcNew) console.log('leetcode fetch failed, using cached data');

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
const about = (cfg.about_lines || []).map((l) => ({ e: l.e, t: l.t }));
if (R[0]) about.push({ e: '🕒', t: `last push: ${R[0].name}, ${ago(R[0].pushedAt)}` });
const motto = cfg.motto || '';
const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
async function findRepo(p, i) {
  if (MOCK) return { full: `${USER}/${p.name.replace(/\s+/g, '-')}`, desc: 'Description pulled from the GitHub repo appears here, exactly as written on GitHub.', home: i % 3 === 2 ? '' : 'https://example.com', lang: ['TypeScript', 'JavaScript', 'Python'][i % 3], priv: !!p.private, pushed: new Date(Date.now() - i * 3 * 864e5).toISOString() };
  const want = norm(p.match || p.name), r = p.repo ? null : R.find((x) => norm(x.name) === want) || R.find((x) => norm(x.name).includes(want));
  if (r) return { full: r.nameWithOwner, desc: r.description || '', home: r.homepageUrl || '', lang: r.primaryLanguage?.name || '', priv: false, pushed: r.pushedAt };
  const slugs = p.repo ? [p.repo] : [...new Set([p.name.trim().replace(/\s+/g, '-'), p.name.replace(/\s+/g, ''), p.name.trim()])].map((x) => `${USER}/${x}`);
  for (const sl of slugs) { const x = await jg(`https://api.github.com/repos/${sl}`); if (x) return { full: x.full_name, desc: x.description || '', home: x.homepage || '', lang: x.language || '', priv: !!x.private, pushed: x.pushed_at }; }
  return null;
}
const projs = [], missing = [];
for (const [i, p] of (cfg.projects || []).slice(0, 10).entries()) {
  const r = await findRepo(p, i); if (!r) missing.push(p.name); const priv = !!(p.private || r?.priv);
  projs.push({ name: p.name, repo: priv ? '' : r?.full || '', url: p.url || r?.home || '', desc: r?.desc || p.desc || '', lang: r?.lang || '', priv, pushed: r?.pushed || '', status: p.status || '' });
}
if (missing.length) console.log(`no GitHub repo found for: ${missing.join(', ')} (add "repo": "owner/name" to that project in config.json)`);

// ---------- assets (notebook style) ----------
for (const f of fs.readdirSync(OA)) if (f.endsWith('.svg')) fs.unlinkSync(path.join(OA, f));
const N = { ink: '#2b2724', paper: '#f6f0e3', card: '#fffdf8', line: '#d9d0bc', hole: '#e6dcc6', mute: '#7a7064', rust: '#a2412c', red: '#d9453a', green: '#3f7a3a', hl: '#f6e3a1', sticky: '#fff6c8', blue: '#c6d6e8' };
const CF_COL = { newbie: '#7a7064', pupil: '#3f7a3a', specialist: '#1f8a80', expert: '#2c4bbf', 'candidate master': '#8a3fb0', master: '#c06a12', 'international master': '#c06a12', grandmaster: '#c0392b', 'international grandmaster': '#c0392b', 'legendary grandmaster': '#c0392b', unrated: '#7a7064' };
const cap = (x) => String(x).replace(/\b\w/g, (m) => m.toUpperCase());
const TABC = ['#c8ddb5', '#f4c9a8', '#f6e3a1', '#c6d6e8', '#e3cfe0'];
const HW = "PH,'Patrick Hand',cursive", BODY = "NU,'Nunito',sans-serif", EMO = "NU,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
const T = (x, y, s, o = {}) => `<text x="${typeof x === 'number' ? x.toFixed(1) : x}" y="${typeof y === 'number' ? y.toFixed(1) : y}" font-size="${o.z || 16}" fill="${o.c || N.ink}"${o.a ? ` text-anchor="${o.a}"` : ''} font-family="${o.b ? BODY : HW}">${esc(s)}</text>`;
const tw2 = (s, z, b) => String(s).length * z * (b ? 0.53 : 0.44);
const FILT = `<filter id="r" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>`;
const sheet = (w, h) => `<defs>${FILT}</defs><rect x="12" y="12" width="${w - 18}" height="${h - 18}" rx="16" fill="${N.ink}"/><g filter="url(#r)"><rect x="4" y="4" width="${w - 18}" height="${h - 18}" rx="16" fill="${N.paper}" stroke="${N.ink}" stroke-width="2.2"/></g>` + Array.from({ length: Math.max(0, Math.floor((h - 50) / 44)) }, (_, i) => `<circle cx="24" cy="${44 + i * 44}" r="6.5" fill="${N.hole}" stroke="${N.line}"/>`).join('');
const tape = (x, y, w, rot, col) => `<rect x="${x}" y="${y}" width="${w}" height="16" fill="${col}" opacity=".85" transform="rotate(${rot} ${x + w / 2} ${y + 8})"/>`;
const hl = (x, y, w, col = N.hl) => `<path d="M${x} ${y} q${w / 2} 5 ${w} -2" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" opacity=".9"/>`;
const paperBox = (x, y, w, h, fill = N.card, rot = 0) => `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})" filter="url(#r)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${N.ink}" stroke-width="2"/></g>`;
const arrowN = (x, y, z, col = N.ink) => `<path d="M${x} ${y + z}L${x + z} ${y}M${x + z * 0.25} ${y}H${x + z}V${y + z * 0.75}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
const icoN = (name, x, y, s) => (ICONS[name.toLowerCase()] ? `<path transform="translate(${x} ${y}) scale(${s / 24})" d="${ICONS[name.toLowerCase()]}" fill="${N.ink}"/>` : '');
const clip2 = (s, n, k) => { const l = wrap(s, n); return l.length > k ? [...l.slice(0, k - 1), cut(l.slice(k - 1).join(' '), n)] : l; };
const md = (d) => new Date(d).toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function heroN() {
  const W = 900, H = 416, now = new Date(), day = `${now.toLocaleString('en', { weekday: 'long', timeZone: 'Asia/Kolkata' })}, ${now.toLocaleString('en', { day: 'numeric', timeZone: 'Asia/Kolkata' })} ${now.toLocaleString('en', { month: 'short', timeZone: 'Asia/Kolkata' })}`;
  let g = sheet(W, H) + `<circle cx="72" cy="52" r="17" fill="none" stroke="${N.ink}" stroke-width="2"/>${T(72, 59, cfg.name[0], { z: 20, a: 'middle' })}${T(98, 60, `${cfg.name.toLowerCase()}.`, { z: 30 })}`;
  g += T(58, 122, day, { z: 46 }) + T(66 + tw2(day, 46), 120, `${fmt(contribs)} contributions in the last year`, { z: 15, b: 1, c: N.mute });
  g += `<circle cx="850" cy="60" r="24" fill="${N.hl}" stroke="${N.ink}" stroke-width="2"/><path d="M836 75 q14 9 28 -5" fill="none" stroke="#e0c66e" stroke-width="5"/>`;
  g += paperBox(58, 150, 560, 210, N.card, -0.6) + tape(90, 140, 70, -6, TABC[1]) + T(80, 190, 'Dear diary,', { z: 24 });
  if (commits.length) commits.forEach((c, i) => { const y = 228 + i * 42; g += `<line x1="80" y1="${y + 9}" x2="596" y2="${y + 9}" stroke="${N.line}"/>${T(80, y, c.sha, { z: 12, b: 1, c: N.mute })}${T(146, y, cut(c.msg, 40), { z: 19 })}${T(596, y, `${cut(c.repo, 16)} · ${c.ago}`, { z: 12, b: 1, c: N.mute, a: 'end' })}`; });
  else g += T(80, 232, 'nothing new to report yet', { z: 19, c: N.mute });
  g += `<g transform="rotate(2 755 255)">${paperBox(650, 160, 210, 190, N.sticky)}${tape(718, 150, 80, 3, TABC[3])}${T(672, 198, 'right now', { z: 24 })}<circle cx="678" cy="225" r="5" fill="${status[1]}"/>${T(690, 231, status[0].toLowerCase(), { z: 17 })}${T(672, 262, `${totals.merged} PRs merged`, { z: 19 })}${T(672, 290, `${nRepos} public repos`, { z: 19 })}${T(672, 320, `streak ${cur}d, best ${best}d`, { z: 17, c: N.rust })}</g>`;
  return svg(W, H, g + `<path d="M60 386 q40 -8 80 0 t80 0" fill="none" stroke="${N.rust}" stroke-width="2"/>${T(232, 390, 'turn the page', { z: 17 })}`);
}

const tabSvg = (name, i) => { const w = Math.round(tw2(name, 21) + 38); return [w, svg(w + 6, 50, `<defs>${FILT}</defs><path d="M3 49 V14 q0 -9 9 -9 H${w - 6} q9 0 9 9 V49" fill="${N.ink}" transform="translate(3 0)"/><g filter="url(#r)"><path d="M2 48 V12 q0 -9 9 -9 H${w - 9} q9 0 9 9 V48 Z" fill="${TABC[i % 5]}" stroke="${N.ink}" stroke-width="2"/></g>${T(w / 2, 34, name, { z: 21, a: 'middle' })}`)]; };
const hdrSvg = (title, note, i) => { const w = Math.round(tw2(title, 36) + (note ? tw2(note, 14, 1) + 30 : 0) + 56); return [w, svg(w + 8, 76, `<defs>${FILT}</defs><path d="M8 75 V20 q0 -12 12 -12 H${w - 8} q12 0 12 12 V75" fill="${N.ink}" transform="translate(4 0)"/><g filter="url(#r)"><path d="M4 74 V18 q0 -12 12 -12 H${w - 12} q12 0 12 12 V74 Z" fill="${TABC[i % 5]}" stroke="${N.ink}" stroke-width="2.2"/></g>${T(26, 54, title, { z: 36 })}${note ? T(26 + tw2(title, 36) + 18, 52, note, { z: 14, b: 1, c: '#4a443d' }) : ''}`)]; };
const topSvg = () => svg(170, 46, `<defs>${FILT}</defs><g filter="url(#r)"><rect x="3" y="3" width="160" height="36" rx="8" fill="${N.paper}" stroke="${N.ink}" stroke-width="2"/></g><path d="M30 30 V14 M23 21 L30 13 L37 21" fill="none" stroke="${N.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${T(48, 28, 'back to top', { z: 19 })}`);

function aboutN() {
  const rh = 50, H = Math.max(76 + about.length * rh, 290), W = 900;
  let g = sheet(W, H);
  for (let y = 70; y < H - 20; y += 25) g += `<line x1="52" y1="${y}" x2="600" y2="${y}" stroke="${N.blue}" stroke-opacity=".6"/>`;
  g += `<line x1="96" y1="20" x2="96" y2="${H - 20}" stroke="${N.red}" stroke-opacity=".35"/>`;
  about.forEach((r, i) => { const y = 72 + i * rh; g += `<text x="58" y="${y}" font-size="22" font-family="${EMO}">${r.e}</text>${T(108, y - 2, cut(r.t, 52), { z: 22 })}`; });
  if (motto) { const nl = wrap(motto, 15); g += `<g transform="rotate(-3 745 ${H / 2})">${paperBox(632, H / 2 - 20 - nl.length * 17, 230, 50 + nl.length * 34, N.sticky)}${tape(710, H / 2 - 30 - nl.length * 17, 76, -4, TABC[0])}${nl.map((l, k) => T(654, H / 2 + 14 - nl.length * 17 + k * 34, l, { z: 28 })).join('')}</g>`; }
  return svg(W, H, g);
}

function statsN() {
  const items = [[nRepos, 'public repos', 'owned by me'], [fmt(contribs), 'contributions', 'last 12 months'], [totals.merged, 'PRs merged', `${cards.length} projects`], [nFollowers, 'followers', 'on github']];
  let g = sheet(900, 200);
  items.forEach(([v, l, h], i) => { const x = 60 + i * 204, rot = i % 2 ? 1.2 : -1.2; g += `<g transform="rotate(${rot} ${x + 92} 100)">${paperBox(x, 40, 184, 126, N.card)}${tape(x + 60, 32, 64, rot * 3, TABC[i])}${T(x + 18, 104, String(v), { z: 46 })}${T(x + 18, 130, l, { z: 14, b: 1 })}${T(x + 18, 152, h, { z: 15, c: N.mute })}</g>`; });
  return svg(900, 200, g);
}

function heatN() {
  const W = 900, H = 420, X0 = 66, Y0 = 176, P = 14.2, LT = 3.5, max = Math.max(1, ...days.map((d) => d.contributionCount));
  const RA = [N.paper, '#d7e6c7', '#a9cc8e', '#6fa85a', '#b694d6'], lvl = (c) => (c === 0 ? 0 : c / max <= 0.25 ? 1 : c / max <= 0.5 ? 2 : c / max <= 0.75 ? 3 : 4);
  const bestDay = days.reduce((b, d) => (d.contributionCount > (b?.contributionCount ?? -1) ? d : b), null), pos = {};
  weeks.forEach((w, ci) => w.contributionDays.forEach((d) => { pos[d.date] = [X0 + ci * P, Y0 + d.weekday * P]; }));
  let g = sheet(W, H) + T(58, 76, fmt(contribs), { z: 44 }) + T(60, 100, 'contributions, last 12 months', { z: 13, b: 1, c: N.mute });
  g += [0, 1, 2, 3, 4].map((i) => `<circle cx="${396 + i * 27}" cy="52" r="10" fill="${N.paper}" stroke="${N.ink}" stroke-width="2"><animate attributeName="fill" values="${N.paper};${N.red};${N.paper}" keyTimes="0;${((0.4 + i * 0.5) / LT).toFixed(3)};${(3.1 / LT).toFixed(3)}" dur="${LT}s" calcMode="discrete" fill="freeze"/></circle>`).join('');
  g += T(450, 92, `LAP ${days.slice(-365).filter((d) => d.contributionCount).length} / 365`, { z: 20, a: 'middle' }) + T(842, 76, `${best}d longest · ${cur}d now`, { z: 22, a: 'end' }) + T(842, 100, 'streaks', { z: 13, b: 1, c: N.mute, a: 'end' });
  if (weeks.length) { const n = weeks.length, ca = Math.floor(n / 3), cb = Math.floor((2 * n) / 3), secs = [[0, ca - 1], [ca, cb - 1], [cb, n - 1]].map(([a, b]) => ({ a, b, t: weeks.slice(a, b + 1).flatMap((w) => w.contributionDays).reduce((s, d) => s + d.contributionCount, 0) })), bt = Math.max(...secs.map((s) => s.t));
    secs.forEach((s, k) => { const x = X0 + s.a * P, col = s.t === bt ? TABC[4] : k && s.t < secs[k - 1].t ? TABC[2] : TABC[0]; g += `<path d="M${x + 4} 128 H${x + (s.b - s.a + 1) * P - 8}" stroke="${col}" stroke-width="10" stroke-linecap="round"/>${T(x + 4, 150, `S${k + 1}  ${fmt(s.t)}`, { z: 15 })}`; }); }
  let lastM = -1; const marks = []; weeks.forEach((w, ci) => { const m = new Date(w.contributionDays[0].date + 'T00:00:00Z').getUTCMonth(); if (m !== lastM) { marks.push([ci, m]); lastM = m; } });
  if (marks.length > 1 && marks[1][0] - marks[0][0] < 4) marks.shift();
  for (const [ci, m] of marks) if (ci < weeks.length - 2) g += T(X0 + ci * P, Y0 - 6, new Date(Date.UTC(2000, m, 1)).toLocaleString('en', { month: 'short' }), { z: 14, c: N.mute });
  for (const d of days) { const [x, y] = pos[d.date], l = lvl(d.contributionCount), rot = ((Date.parse(d.date) / 864e5) % 7 - 3) * 1.2; g += `<rect class="c" style="animation-delay:${(LT + (x - X0) / P * 0.02).toFixed(2)}s" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="11" height="11" rx="2" fill="${RA[l]}" stroke="${N.ink}" stroke-width=".8" stroke-opacity="${l ? 0.55 : 0.2}" transform="rotate(${rot.toFixed(1)} ${(x + 5.5).toFixed(1)} ${(y + 5.5).toFixed(1)})"/>${streakDates.has(d.date) ? `<circle cx="${(x + 5.5).toFixed(1)}" cy="${(y + 5.5).toFixed(1)}" r="1.8" fill="${N.rust}"/>` : ''}`; }
  if (!days.length) g += T(450, 230, 'no contribution data yet', { z: 22, a: 'middle', c: N.mute });
  if (bestDay && bestDay.contributionCount && pos[bestDay.date]) { const [x, y] = pos[bestDay.date]; g += `<ellipse cx="${x + 5.5}" cy="${y + 5.5}" rx="12" ry="10" fill="none" stroke="${N.red}" stroke-width="2"/>${T(x - 6, y - 10, 'FL', { z: 16, c: N.red })}`; }
  const fx = X0 + weeks.length * P + 4; if (weeks.length) for (let r = 0; r < 9; r++) for (let k = 0; k < 2; k++) g += `<rect x="${fx + k * 6}" y="${Y0 + r * 11}" width="6" height="11" fill="${(r + k) % 2 ? N.ink : N.paper}" stroke="${N.ink}" stroke-width=".5"/>`;
  const laneY = 300, tags = [];
  if (days.length && cfg.show_pit !== false) { const gaps = []; let gs = -1; days.forEach((d, i) => { if (!d.contributionCount) { if (gs < 0) gs = i; } else { if (gs >= 0 && i - gs >= 4) gaps.push({ s: gs, n: i - gs }); gs = -1; } }); gaps.sort((a, b) => b.n - a.n);
    gaps.slice(0, 8).forEach((gp, k) => { const p = pos[days[gp.s].date]; if (p && tags.every((t) => Math.abs(t.x - p[0]) > 46)) tags.push({ x: p[0], dnf: k === 0 }); }); }
  g += `<path d="M${X0} ${laneY} H${fx + 12}" stroke="${N.ink}" stroke-width="1.6" stroke-dasharray="7 6"/>` + tags.map((t) => `${paperBox(t.x, laneY + 8, 42, 22, N.paper)}${T(t.x + 21, laneY + 25, t.dnf ? 'DNF' : 'PIT', { z: 16, a: 'middle', c: t.dnf ? N.rust : N.ink })}`).join('');
  if (days.length) { const L0 = X0 + 10, L1 = fx + 6, sp = L1 - L0, drive = 7, st = [...tags].sort((a, b) => a.x - b.x).map((t) => ({ f: Math.min(0.97, Math.max(0.03, (t.x + 21 - L0) / sp)), d: t.dnf ? 1.4 : 0.7 })), dur = drive + st.reduce((q, s) => q + s.d, 0) + 1.2, kp = [0], kt = [0]; let tc = 0, lf = 0;
    for (const s of st) { tc += (s.f - lf) * drive; kp.push(s.f); kt.push(tc); tc += s.d; kp.push(s.f); kt.push(tc); lf = s.f; } tc += (1 - lf) * drive; kp.push(1); kt.push(tc); kp.push(1); kt.push(dur);
    const car = `<g fill="none" stroke="${N.ink}" stroke-width="1.8" stroke-linejoin="round"><path d="M-22 -2 h8 l4 -8 h10 l3 6 h18 l6 4 v4 h-49z" fill="${N.card}"/><path d="M-26 -12 v12 M-29 -12 h8"/><circle cx="-14" cy="4" r="5" fill="${N.ink}"/><circle cx="16" cy="4" r="5" fill="${N.ink}"/></g><circle cx="-2" cy="-10" r="3" fill="${N.red}"/>`;
    g += `<g opacity="0"><set attributeName="opacity" to="1" begin="${LT + 1.1}s" fill="freeze"/><g><animateMotion path="M${L0} ${laneY - 9}H${L1}" dur="${dur.toFixed(2)}s" begin="${LT + 1.1}s" repeatCount="indefinite" keyPoints="${kp.map((v) => v.toFixed(4)).join(';')}" keyTimes="${kt.map((v, i) => (i === kt.length - 1 ? '1' : (v / dur).toFixed(4))).join(';')}" calcMode="linear"/>${car}</g></g>`; }
  g += T(66, 370, 'circled: fastest lap · dots: longest streak · PIT: 4+ days off · DNF: longest break · checkered: this week', { z: 15, c: N.mute });
  g += T(700, 396, 'less', { z: 14, c: N.mute, a: 'end' }) + RA.map((c, i) => `<rect x="${708 + i * 18}" y="384" width="13" height="13" rx="2" fill="${c}" stroke="${N.ink}" stroke-opacity=".5"/>`).join('') + T(802, 396, 'more', { z: 14, c: N.mute });
  return svg(W, H, g, '.c{animation:f .3s ease-out backwards}@keyframes f{from{opacity:0}}');
}

function ecgN() {
  const W = 900, H = 310, L = 66, R0 = 850, b = 210, m = {};
  for (const d of days) { const k = d.date.slice(0, 7); m[k] = (m[k] || 0) + d.contributionCount; }
  const keys = Object.keys(m).sort().slice(-12), vals = keys.map((k) => m[k]), max = Math.max(1, ...vals), mw = (R0 - L) / Math.max(1, keys.length); let d = `M${L} ${b}`, lab = '';
  keys.forEach((k, i) => { const x0 = L + i * mw, u = mw / 10, v = vals[i], X = (q) => (x0 + q * u).toFixed(1);
    if (v > 0) { const A = 12 + (v / max) * 100; d += `L${X(1.4)} ${b}Q${X(2.2)} ${b - 9} ${X(3)} ${b}L${X(4.1)} ${b}L${X(4.5)} ${b + 10}L${X(5)} ${b - A}L${X(5.5)} ${b + 16}L${X(6)} ${b}L${X(6.8)} ${b}Q${X(7.7)} ${b - 18} ${X(8.6)} ${b}L${X(10)} ${b}`; } else d += `L${X(10)} ${b}`;
    lab += T(x0 + mw / 2, 258, new Date(k + '-01T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }), { z: 16, a: 'middle', c: N.mute }) + T(x0 + mw / 2, 280, String(v), { z: 13, b: 1, a: 'middle' }); });
  if (!keys.length) d += `L${R0} ${b}`;
  let g = sheet(W, H) + `<defs><pattern id="gp" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="${N.blue}" stroke-width=".8"/></pattern></defs><rect x="56" y="88" width="804" height="140" fill="url(#gp)" opacity=".8"/>`;
  g += T(58, 66, 'Monthly pulse', { z: 32 }) + hl(60, 74, 170, TABC[1]) + T(250, 64, 'one heartbeat a month, taller = busier', { z: 14, b: 1, c: N.mute }) + T(850, 64, `${days.length ? (contribs / days.length).toFixed(1) : '0.0'} a day on average`, { z: 17, a: 'end' });
  g += `<path d="${d}" fill="none" stroke="${N.red}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1"><animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;.75;1" dur="6s" repeatCount="indefinite"/></path>`;
  return svg(W, H, g + lab);
}

function flightN() {
  const W = 900, H = 430, G = 350, m = {};
  for (const d of days) { const k = d.date.slice(0, 7); m[k] = (m[k] || 0) + d.contributionCount; }
  const keys = Object.keys(m).sort().slice(-12), vals = keys.map((k) => m[k]), mxv = Math.max(1, ...vals), tot = vals.reduce((a, b) => a + b, 0), bi = vals.indexOf(Math.max(...vals, 0));
  const step = keys.length > 1 ? 720 / (keys.length - 1) : 0, P = keys.map((k, i) => [110 + i * step, G - 34 - Math.sqrt(vals[i] / mxv) * 170]);
  const pts = [[60, G - 8], ...P, [868, (P.length ? P[P.length - 1][1] : G - 40) + 20]];
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    if (vals.length && i + 1 === bi + 1 && vals[bi] > 0) { const [x, y] = p2, r = 32; d += ` C${(x + r * 1.3).toFixed(1)} ${y.toFixed(1)} ${(x + r * 1.3).toFixed(1)} ${(y - r * 2).toFixed(1)} ${x.toFixed(1)} ${(y - r * 2).toFixed(1)} C${(x - r * 1.3).toFixed(1)} ${(y - r * 2).toFixed(1)} ${(x - r * 1.3).toFixed(1)} ${y.toFixed(1)} ${(x + 1).toFixed(1)} ${y.toFixed(1)}`; } }
  let g = sheet(W, H) + `<defs><pattern id="gp" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="${N.blue}" stroke-width=".7"/></pattern><linearGradient id="sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f2f4"/><stop offset="1" stop-color="#b9b9c0"/></linearGradient><mask id="trail" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><path d="${d}" fill="none" stroke="white" stroke-width="34" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;.85;1" dur="11s" repeatCount="indefinite"/></path></mask></defs><rect x="52" y="96" width="810" height="${G - 96}" fill="url(#gp)" opacity=".55"/>`;
  g += T(58, 54, 'Year in the air', { z: 32 }) + hl(60, 62, 180, TABC[1]) ;
  g += `<path d="M52 ${G} H862" stroke="${N.ink}" stroke-width="1.8"/>` + [[150, 24], [180, 40], [380, 30], [410, 18], [600, 36], [630, 22], [780, 28]].map(([x, h]) => `<rect x="${x}" y="${G - h}" width="24" height="${h}" fill="${N.card}" stroke="${N.ink}" stroke-width="1.3"/><rect x="${x + 5}" y="${G - h + 6}" width="5" height="6" fill="${N.hl}" stroke="${N.ink}" stroke-width=".6"/><rect x="${x + 14}" y="${G - h + 6}" width="5" height="6" fill="${N.hl}" stroke="${N.ink}" stroke-width=".6"/>`).join('');
  keys.forEach((k, i) => { const [x, y] = P[i]; g += T(x, G + 26, new Date(k + '-01T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }), { z: 16, a: 'middle' }) + `<line x1="${x.toFixed(1)}" y1="${(y + 8).toFixed(1)}" x2="${x.toFixed(1)}" y2="${G}" stroke="${N.ink}" stroke-width=".7" stroke-dasharray="2 4" opacity=".3"/>` + T(x, i === bi ? y + 26 : y - 12, String(vals[i]), { z: 12, b: 1, a: 'middle', c: N.mute }); });
  if (!keys.length) g += T(450, 220, 'no contribution data yet', { z: 22, a: 'middle', c: N.mute });
  g += `<g mask="url(#trail)"><path d="${d}" fill="none" stroke="#b9b2a8" stroke-width="10" stroke-linecap="round" stroke-dasharray=".1 14" opacity=".7"/><path d="${d}" fill="none" stroke="#d9d3c9" stroke-width="6" stroke-linecap="round" stroke-dasharray=".1 10" stroke-dashoffset="4"/></g>`;
  const wheel = (x) => `<circle cx="${x}" cy="17" r="6" fill="${N.ink}"/><circle cx="${x}" cy="17" r="3.6" fill="#55555c" stroke="#9a9aa2" stroke-width=".6"/>` + [0, 72, 144, 216, 288].map((a) => `<line x1="${x}" y1="17" x2="${(x + Math.cos((a * Math.PI) / 180) * 3.4).toFixed(1)}" y2="${(17 + Math.sin((a * Math.PI) / 180) * 3.4).toFixed(1)}" stroke="#c9c9cf" stroke-width=".8"/>`).join('');
  const flame = (x) => `<path class="fl" d="M${x - 3} 21 L${x - 5} 31 L${x - 1} 26 L${x + 1} 33 L${x + 3} 21Z" fill="#f0a73a" stroke="${N.ink}" stroke-width=".9"/>`;
  const car = `<g transform="translate(-30 -14)">${flame(18)}${flame(44)}<path d="M2 9 L4 4 L22 1.5 L40 4.5 L60 10.5 L61 14 L58 17 H3 Z" fill="url(#sv)" stroke="${N.ink}" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 4.2 L22 2 L39 4.8 L33 7.4 L9 7.6 Z" fill="#3a3330" stroke="${N.ink}" stroke-width="1"/><path d="M3 15 H58 L57 18 H4Z" fill="#3a3a40" stroke="${N.ink}" stroke-width="1"/><path d="M59.5 12.2 L61 12.6" stroke="#ffffff" stroke-width="1.6"/><path d="M48 9.6 L60 12" stroke="#ffffff" stroke-width=".8" opacity=".9"/>${wheel(14)}${wheel(47)}</g>`;
  g += `<g><animateMotion path="${d}" dur="11s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;.85;1" calcMode="linear"/>${car}</g>`;
  const bm = keys.length ? new Date(keys[bi] + '-01T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }) : '-';
  g += T(862, 50, `${fmt(tot)} contributions · best: ${bm} ${keys.length ? vals[bi] : 0}`, { z: 18, a: 'end' }) + T(862, 70, 'altitude = contributions · flips at the best month', { z: 14, a: 'end', c: N.rust });
  return svg(W, H, g, '.fl{transform-box:fill-box;transform-origin:50% 0%;animation:fk .12s steps(2) infinite}@keyframes fk{50%{opacity:.5;transform:scaleY(.6)}}');
}

function stackN(title, items, i) {
  const W = 900; let x = 60, y = 78, rows = 1, out = '';
  items.forEach((n, k) => { const has = !!ICONS[n.toLowerCase()], w = Math.round(tw2(n, 15, 1) + (has ? 50 : 36)); if (x + w > W - 40) { x = 60; y += 48; rows++; }
    out += `<g transform="rotate(${k % 2 ? 0.8 : -0.8} ${x + w / 2} ${y + 17})">${paperBox(x, y, w, 34, N.card)}${has ? icoN(n, x + 12, y + 9, 16) : `<circle cx="${x + 15}" cy="${y + 17}" r="4" fill="${TABC[k % 5]}" stroke="${N.ink}"/>`}${T(x + (has ? 36 : 26), y + 23, n, { z: 15, b: 1 })}</g>`; x += w + 12; });
  const H = 78 + rows * 48 + 24;
  return svg(W, H, sheet(W, H) + T(58, 56, title, { z: 30 }) + hl(60, 64, tw2(title, 30), TABC[i % 5]) + T(850, 54, `${items.length}`, { z: 22, a: 'end', c: N.mute }) + out);
}
function langsN() {
  const cnt = {}; for (const r of repos) if (r.language && !r.fork) cnt[r.language] = (cnt[r.language] || 0) + 1;
  const src = Object.keys(langBytes).length ? langBytes : cnt, arr = Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 6); if (!arr.length) return null;
  const tot = arr.reduce((a, [, n]) => a + n, 0); let x = 60, g = sheet(900, 170) + T(58, 56, 'Languages, public repos', { z: 30 }), lx = 60;
  arr.forEach(([l, n], i) => { const w = (n / tot) * 780; g += `<rect x="${x.toFixed(1)}" y="80" width="${Math.max(4, w - 4).toFixed(1)}" height="20" rx="4" fill="${TABC[i % 5]}" stroke="${N.ink}" stroke-width="1.4"/>`; x += w; const s = `${l} ${Math.round((n / tot) * 100)}%`; g += `<rect x="${lx}" y="120" width="12" height="12" rx="2" fill="${TABC[i % 5]}" stroke="${N.ink}"/>${T(lx + 18, 131, s, { z: 17 })}`; lx += tw2(s, 17) + 40; });
  return svg(900, 170, g);
}

function cityN() {
  const W = 900, list = prList.slice(-14), n = list.length, two = n > 7, half = Math.ceil(n / 2), rows = two ? [list.slice(0, half), list.slice(half)] : [list], H = two ? 590 : 500, street = H - 106;
  let g = sheet(W, H) + T(58, 70, `${totals.merged}`, { z: 50 }) + T(66 + tw2(String(totals.merged), 50), 66, 'pull requests merged', { z: 24 }) + T(850, 64, `${cards.length} projects · oldest to newest`, { z: 16, a: 'end', c: N.mute });
  if (!n) return svg(W, 160, sheet(W, 160) + T(58, 70, '0 pull requests merged', { z: 28 }) + T(58, 110, 'merged PRs show up here once the token can see them', { z: 18, c: N.mute }));
  g += `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${N.ink}" stroke-width=".9" opacity=".5"/></pattern></defs><path d="M52 ${street} H860 M52 ${street + 30} H860" stroke="${N.ink}" stroke-width="1.6"/><path d="M52 ${street + 15} H860" stroke="${N.line}" stroke-width="2" stroke-dasharray="14 10"/>`;
  const c = 0.866, s = 0.5, FW = 30, P = (bx, by, x, y, z = 0) => [bx + (x - y) * c, by + (x + y) * s - z], pts = (a) => a.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '); let bills = '', idx = 0;
  rows.forEach((row, ri) => { const front = ri === rows.length - 1, per = row.length, step = per > 1 ? Math.min(124, 680 / (per - 1)) : 0, x0 = 455 - ((per - 1) * step) / 2 - FW * c + (front ? 0 : 56), by = street - 6 - FW - (front ? 0 : 50);
    row.forEach((p, j) => { const i = idx++, bx = x0 + j * step + FW * c, H2 = Math.min(230, 56 + Math.log2(1 + (p.size || 40)) * 17), dl = (i * 0.15).toFixed(2);
      const A = P(bx, by, 0, 0), B = P(bx, by, FW, 0), C2 = P(bx, by, FW, FW), D = P(bx, by, 0, FW), u = (q) => [q[0], q[1] - H2];
      let b = `<polygon points="${pts([D, C2, u(C2), u(D)])}" fill="${N.card}" stroke="${N.ink}" stroke-width="1.8"/><polygon points="${pts([B, C2, u(C2), u(B)])}" fill="url(#hatch)" stroke="${N.ink}" stroke-width="1.8"/><polygon points="${pts([u(A), u(B), u(C2), u(D)])}" fill="${N.card}" stroke="${N.ink}" stroke-width="1.8"/>`;
      for (let z = 12; z < H2 - 10; z += 14) for (let x = 5; x < FW - 4; x += 8) { const q = [P(bx, by, x, FW, z), P(bx, by, x + 5, FW, z), P(bx, by, x + 5, FW, z + 8), P(bx, by, x, FW, z + 8)]; b += `<polygon points="${pts(q)}" fill="${(Math.sin((i + 1) * 97 + z * 3 + x) + 1) / 2 > 0.5 ? N.hl : 'none'}" stroke="${N.ink}" stroke-width=".9"/>`; }
      const an = P(bx, by, 6, 6, H2); b += `<path d="M${an[0].toFixed(1)} ${an[1].toFixed(1)} v-18" stroke="${N.ink}" stroke-width="1.4"/><circle cx="${an[0].toFixed(1)}" cy="${(an[1] - 18).toFixed(1)}" r="2.5" fill="${N.red}"/>`;
      g += `<g class="b" style="animation-delay:${dl}s" filter="url(#r)">${b}</g>`;
      if (front) g += T(C2[0], street + 52, md(p.t1), { z: 16, a: 'middle' });
      const nm = cut(label[p.repo] || 'private', 15), nb = label[p.repo] ? `#${p.num} merged` : 'merged', bw = Math.max(tw2(nm, 15), tw2(nb, 13)) + 22, o = P(bx, by, 2, FW - 4, H2 + 46);
      bills += `<g class="f" style="animation-delay:${(+dl + 1.2).toFixed(2)}s"><g transform="matrix(.866 .5 0 1 ${(o[0] - bw * 0.25).toFixed(1)} ${(o[1] - bw * 0.14).toFixed(1)})"><path d="M${(bw * 0.22).toFixed(1)} 30 v20 M${(bw * 0.62).toFixed(1)} 30 v14" stroke="${N.ink}" stroke-width="1.6"/><rect width="${bw.toFixed(1)}" height="30" rx="2" fill="${N.card}" stroke="${N.ink}" stroke-width="1.6"/>${T(8, 15, nm, { z: 15 })}${T(8, 27, nb, { z: 13, c: N.rust })}<rect x="${(bw / 2 - 14).toFixed(1)}" y="-6" width="28" height="9" fill="${TABC[1]}" opacity=".85"/></g></g>`; }); });
  const more = prList.length > 14 ? `+${prList.length - 14} earlier · ` : '';
  return svg(W, H, g + bills + T(58, H - 26, `${more}one building per merged PR · taller = more lines changed`, { z: 15, c: N.mute }), '.b{transform-box:fill-box;transform-origin:50% 100%;animation:rise 1s cubic-bezier(.2,.8,.2,1) backwards}.f{animation:f .5s ease-out backwards}@keyframes rise{from{transform:scaleY(0)}}@keyframes f{from{opacity:0}}');
}

function projN(p, all) {
  const W = 440, ml = Math.max(...all.map((q) => (q.desc ? clip2(q.desc, 44, 3).length : 1))), H = 150 + ml * 22, d = p.desc ? clip2(p.desc, 44, 3) : ['no description on GitHub yet'];
  const st = p.priv ? ['private', N.rust] : p.status ? [p.status, '#9a7a1a'] : p.url ? ['live', N.green] : null;
  let g = `<defs>${FILT}</defs><rect x="10" y="12" width="${W - 16}" height="${H - 18}" rx="8" fill="${N.ink}"/>${paperBox(4, 6, W - 16, H - 18, N.card)}${tape(W / 2 - 40, 0, 80, -2, TABC[all.indexOf(p) % 5])}`;
  g += T(26, 52, cut(p.name, 22), { z: 30 }) + (p.lang ? T(W - 30, 50, p.lang.toLowerCase(), { z: 13, b: 1, c: N.mute, a: 'end' }) : '') + d.map((x, k) => T(26, 84 + k * 22, x, { z: 14, b: 1, c: p.desc ? '#4a443d' : N.mute })).join('');
  if (st) g += `<g transform="rotate(-6 70 ${H - 42})"><rect x="26" y="${H - 56}" width="${Math.round(tw2(st[0], 18) + 26)}" height="26" rx="5" fill="none" stroke="${st[1]}" stroke-width="2"/>${T(38, H - 37, st[0], { z: 18, c: st[1] })}</g>`;
  if (p.pushed) g += T(W - 30, H - 36, `updated ${md(p.pushed)}`, { z: 15, c: N.mute, a: 'end' });
  return svg(W, H, g);
}
const pbtnN = (label, primary) => svg(214, 60, `<defs>${FILT}</defs><rect x="8" y="8" width="200" height="44" rx="10" fill="${primary ? N.rust : N.ink}"/><g filter="url(#r)"><rect x="3" y="3" width="200" height="44" rx="10" fill="${primary ? N.ink : N.paper}" stroke="${N.ink}" stroke-width="2"/></g>${T(26, 32, label, { z: 22, c: primary ? N.paper : N.ink })}${arrowN(168, 17, 14, primary ? N.paper : N.ink)}`);
const noteN = () => svg(900, 64, `<defs>${FILT}</defs>${paperBox(6, 10, 640, 40, N.sticky, -0.6)}${tape(30, 4, 60, -5, TABC[3])}${T(30, 37, 'a few projects are still in development, so their live links may not work yet', { z: 18 })}`);

function lcN(lc) {
  const W = 900, H = 290, X1 = 360, RA = [N.paper, '#f8dcc0', '#f4c9a8', '#e9a46f', '#d9733a'];
  let g = sheet(W, H) + T(58, 60, 'LeetCode', { z: 32 }) + hl(60, 68, 120, TABC[2]) + T(320, 58, lc.user, { z: 13, b: 1, c: N.mute, a: 'end' });
  const c2 = lc.contest; g += T(58, 92, c2 ? `contest rating ${Math.round(c2.rating)} · top ${c2.top}%` : 'no contest rating yet', { z: 18, c: c2 ? N.rust : N.mute }) + T(58, 112, lc.ranking ? `global rank #${fmt(lc.ranking)}` : '', { z: 13, b: 1, c: N.mute });
  g += T(58, 168, String(lc.all), { z: 56 }) + T(62 + tw2(String(lc.all), 56), 164, 'solved', { z: 20, c: N.mute });
  const mx = Math.max(1, lc.easy, lc.medium, lc.hard);
  [['easy', lc.easy, '#a9cc8e'], ['medium', lc.medium, '#f4c9a8'], ['hard', lc.hard, '#e8a2a2']].forEach(([l, v, cc], i) => { const y = 200 + i * 26; g += T(58, y, l, { z: 17 }) + `<path d="M126 ${y - 6} H${(126 + (150 * v) / mx).toFixed(1)}" stroke="${cc}" stroke-width="12" stroke-linecap="round"/>` + T(320, y, String(v), { z: 18, a: 'end' }); });
  g += `<line x1="340" y1="40" x2="340" y2="260" stroke="${N.line}" stroke-width="2" stroke-dasharray="4 5"/>` + T(X1, 60, 'submissions, last 12 months', { z: 18 });
  const byDay = {}; for (const [ts, k] of Object.entries(lc.cal || {})) { const key = new Date(Number(ts) * 1000).toISOString().slice(0, 10); byDay[key] = (byDay[key] || 0) + k; }
  const end = new Date(); end.setUTCHours(0, 0, 0, 0); const start = new Date(end); start.setUTCDate(start.getUTCDate() - 364); start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const cmax = Math.max(1, ...Object.values(byDay)); let total = 0, active = 0, ci = 0;
  for (const dd = new Date(start); dd <= end; dd.setUTCDate(dd.getUTCDate() + 1)) { const k = dd.toISOString().slice(0, 10), v = byDay[k] || 0, wd = dd.getUTCDay(); if (wd === 0 && dd > start) ci++; if (v) { total += v; active++; }
    const l = v === 0 ? 0 : v / cmax <= 0.25 ? 1 : v / cmax <= 0.5 ? 2 : v / cmax <= 0.75 ? 3 : 4; g += `<rect x="${(X1 + ci * 9.4).toFixed(1)}" y="${80 + wd * 9.4}" width="7.6" height="7.6" rx="1.5" fill="${RA[l]}" stroke="${N.ink}" stroke-opacity="${l ? 0.4 : 0.15}" stroke-width=".7"/>`; }
  return svg(W, H, g + T(X1, 200, fmt(total), { z: 40 }) + T(X1, 222, 'submissions', { z: 14, b: 1, c: N.mute }) + T(X1 + 190, 200, String(active), { z: 40 }) + T(X1 + 190, 222, 'active days', { z: 14, b: 1, c: N.mute }));
}
function cfN(cf) {
  const W = 900, H = 290, X1 = 370, X2 = 850, Y1 = 84, Y2 = 230, col = CF_COL[cf.rank] || N.ink;
  let g = sheet(W, H) + T(58, 60, 'Codeforces', { z: 32 }) + hl(60, 68, 140, TABC[3]) + T(320, 58, cf.handle, { z: 13, b: 1, c: N.mute, a: 'end' }) + T(58, 94, cap(cf.rank), { z: 22, c: col });
  g += T(58, 160, String(cf.rating || '-'), { z: 56, c: col }) + T(58, 186, `max ${cf.maxRating || '-'} · ${cf.maxRank}`, { z: 13, b: 1, c: N.mute }) + T(58, 222, 'problems solved', { z: 17 }) + T(320, 222, cf.solved == null ? '-' : String(cf.solved), { z: 20, a: 'end' }) + T(58, 250, 'rated contests', { z: 17 }) + T(320, 250, String(cf.contests), { z: 20, a: 'end' });
  g += `<line x1="340" y1="40" x2="340" y2="260" stroke="${N.line}" stroke-width="2" stroke-dasharray="4 5"/>` + T(X1, 60, 'rating history', { z: 18 }) + `<defs><pattern id="gp2" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="${N.blue}" stroke-width=".8"/></pattern></defs><rect x="${X1}" y="${Y1 - 10}" width="${X2 - X1}" height="${Y2 - Y1 + 20}" fill="url(#gp2)"/>`;
  const hs = cf.history || []; if (hs.length < 2) return svg(W, H, g + T((X1 + X2) / 2, 160, hs.length ? 'one rated contest so far' : 'no rated contests yet', { z: 20, a: 'middle', c: N.mute }));
  const lo = Math.min(...hs.map((h) => h[1])) - 80, hi = Math.max(...hs.map((h) => h[1])) + 80, t0 = hs[0][0], t1 = hs[hs.length - 1][0], X = (v) => X1 + ((v - t0) / Math.max(1, t1 - t0)) * (X2 - X1), Y = (v) => Y2 - ((v - lo) / (hi - lo)) * (Y2 - Y1);
  for (const [r, nm] of [[1200, 'pupil'], [1400, 'specialist'], [1600, 'expert'], [1900, 'cand. master'], [2100, 'master']]) if (r > lo && r < hi) g += `<line x1="${X1}" y1="${Y(r).toFixed(1)}" x2="${X2}" y2="${Y(r).toFixed(1)}" stroke="${N.mute}" stroke-dasharray="3 4"/>${T(X1 + 4, Y(r) - 4, `${r} ${nm}`, { z: 13, c: N.mute })}`;
  g += `<path d="M${hs.map((h) => `${X(h[0]).toFixed(1)} ${Y(h[1]).toFixed(1)}`).join('L')}" fill="none" stroke="${N.red}" stroke-width="2.2" stroke-linejoin="round" pathLength="1" stroke-dasharray="1"><animate attributeName="stroke-dashoffset" from="1" to="0" dur="2s" fill="freeze"/></path>` + hs.map((h, i) => `<circle cx="${X(h[0]).toFixed(1)}" cy="${Y(h[1]).toFixed(1)}" r="${i === hs.length - 1 ? 5 : 2.6}" fill="${i === hs.length - 1 ? col : N.ink}"/>`).join('');
  return svg(W, H, g + T(X1, 262, new Date(t0).getUTCFullYear(), { z: 14, c: N.mute }) + T(X2, 262, 'now', { z: 14, c: N.mute, a: 'end' }));
}

async function chessN() {
  const W = 900, H = 320, S = 30, BX = 60, BY = 40, st = await j(`https://api.chess.com/pub/player/${CHESS}/stats`); let game = null;
  const arch = (await j(`https://api.chess.com/pub/player/${CHESS}/games/archives`))?.archives; for (const u of (arch || []).slice(-2).reverse()) { game = (await j(u))?.games?.at(-1) ?? null; if (game) break; }
  const fen = game?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', gl = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  let g = sheet(W, H) + `<defs><pattern id="hc" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${N.ink}" stroke-width=".8" opacity=".45"/></pattern></defs><rect x="${BX - 3}" y="${BY - 3}" width="${8 * S + 6}" height="${8 * S + 6}" fill="none" stroke="${N.ink}" stroke-width="2"/>`;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) g += `<rect x="${BX + c * S}" y="${BY + r * S}" width="${S}" height="${S}" fill="${(r + c) % 2 ? 'url(#hc)' : N.card}"/>`;
  fen.split(' ')[0].split('/').forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) { c += +ch; continue; } const w = ch === ch.toUpperCase(); g += `<text x="${BX + c * S + S / 2}" y="${BY + r * S + S * 0.77}" font-size="24" text-anchor="middle" fill="${w ? N.card : N.ink}" stroke="${N.ink}" stroke-width="${w ? 1 : 0.4}">${gl[ch.toLowerCase()]}</text>`; c++; } });
  const rt = (k) => st?.[`chess_${k}`]?.last?.rating ?? '-', rec = st?.chess_rapid?.record;
  g += T(350, 66, 'Chess', { z: 32 }) + hl(352, 74, 70, TABC[0]) + T(850, 64, `${CHESS} on chess.com`, { z: 16, a: 'end', c: N.mute }) + [['rapid', rt('rapid')], ['blitz', rt('blitz')], ['bullet', rt('bullet')]].map(([l, v], i) => T(352 + i * 170, 140, String(v), { z: 48 }) + T(352 + i * 170, 164, l, { z: 15, b: 1, c: N.mute })).join('');
  if (rec) { const tot = rec.win + rec.loss + rec.draw || 1, bw = 490, a = (rec.win / tot) * bw, dd = (rec.draw / tot) * bw, lo = (rec.loss / tot) * bw; g += T(352, 202, 'rapid record', { z: 16 }) + T(842, 202, `${rec.win}W  ${rec.draw}D  ${rec.loss}L`, { z: 16, a: 'end' }) + `<path d="M356 216 H${(352 + a).toFixed(1)}" stroke="#a9cc8e" stroke-width="10" stroke-linecap="round"/><path d="M${(356 + a).toFixed(1)} 216 H${(352 + a + dd).toFixed(1)}" stroke="${N.line}" stroke-width="10" stroke-linecap="round"/><path d="M${(356 + a + dd).toFixed(1)} 216 H${(352 + a + dd + lo).toFixed(1)}" stroke="#e8a2a2" stroke-width="10" stroke-linecap="round"/>`; }
  else g += T(352, 206, 'no rapid record yet', { z: 16, c: N.mute });
  if (game) { const mine = game.white.username.toLowerCase() === CHESS.toLowerCase() ? game.white : game.black, opp = mine === game.white ? game.black : game.white, res = mine.result === 'win' ? ['won', N.green] : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(mine.result) ? ['drew', N.mute] : ['lost', N.rust]; g += T(352, 262, `last game: ${res[0]}`, { z: 24, c: res[1] }) + T(352, 288, `vs ${opp.username} (${opp.rating}), ${game.time_class}`, { z: 15, b: 1 }); }
  else g += T(352, 262, 'no recent game found', { z: 20, c: N.mute });
  return svg(W, H, g);
}
const contactN = (label, i) => svg(214, 92, `<defs>${FILT}</defs><g transform="rotate(${i % 2 ? 2 : -2} 107 48)">${paperBox(8, 14, 196, 66, TABC[i % 5])}${tape(77, 6, 60, i % 2 ? 4 : -4, '#ffffff')}${T(28, 56, label, { z: 26 })}${arrowN(164, 36, 16)}</g>`);

// ---------- write ----------
write('hero.svg', heroN()); write('top.svg', topSvg()); write('about.svg', aboutN()); write('stats.svg', statsN()); write('heatmap.svg', heatN()); write('flight.svg', flightN());
const sk = Object.keys(stack); sk.forEach((k, i) => write(`stack-${i}.svg`, stackN(k, stack[k], i))); const langs = langsN(); if (langs) write('langs.svg', langs);
write('oss.svg', cityN()); projs.forEach((p, i) => write(`proj-${i}.svg`, projN(p, projs))); write('btn-source.svg', pbtnN('source', false)); write('btn-live.svg', pbtnN('live', true)); write('btn-none.svg', svg(214, 60, '')); write('proj-note.svg', noteN());
if (lcData) write('lc.svg', lcN(lcData)); if (cfData) write('cf.svg', cfN(cfData)); write('chess.svg', await chessN());
const hasMail = cfg.email && !cfg.email.includes('CHANGE_ME'), contacts = [...(hasMail ? [['email', `mailto:${cfg.email}`]] : []), ['linkedin', cfg.linkedin], ['x', cfg.x], ['github', `https://github.com/${USER}`]].filter(([, u]) => u);
contacts.forEach(([l], i) => write(`contact-${i}.svg`, contactN(l, i)));
const hasCP = !!(cfData || lcData), nTools = sk.reduce((a, k) => a + stack[k].length, 0);
const SECTIONS = [['about', 'About', 'who'], ['activity', 'Activity', 'live from github'], ['stack', 'Stack', `${nTools} tools`], ['open-source', 'Open source', `${totals.merged} merged`], ['projects', 'Projects', `${projs.length} picks`], ...(hasCP ? [['problem-solving', 'Problem solving', [lcData && 'leetcode', cfData && 'codeforces'].filter(Boolean).join(' & ')]] : []), ['chess', 'Chess', 'for fun'], ['contact', 'Contact', 'say hi']];
const tabW = {}, hdrW = {}; SECTIONS.forEach(([k, ti, no], i) => { const [w, s] = tabSvg(ti, i); tabW[k] = w; write(`tab-${k}.svg`, s); const [w2, s2] = hdrSvg(ti, no, i); hdrW[k] = w2; write(`hdr-${k}.svg`, s2); });

const V = crypto.createHash('md5').update(fs.readdirSync(OA).filter((f) => f.endsWith('.svg')).sort().map((f) => fs.readFileSync(path.join(OA, f), 'utf8')).join('')).digest('hex').slice(0, 8);
const im = (f, alt, w = '100%', h) => `<img src="assets/${f}?v=${V}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} alt="${esc(alt)}">`, lk = (href, html) => (href ? `<a href="${href}">${html}</a>` : html);
const totTab = SECTIONS.reduce((a, [k]) => a + tabW[k] + 6, 0), navRow = SECTIONS.map(([k, ti]) => lk(`#${k}`, im(`tab-${k}.svg`, ti, `${((tabW[k] + 6) / totTab * 97).toFixed(1)}%`))).join('');
const backTop = lk('#top', im('top.svg', 'back to top', '150'));
const body = {
  about: im('about.svg', 'About me'),
  activity: `${im('stats.svg', 'GitHub stats')}\n${lk(`https://github.com/${USER}`, im('heatmap.svg', 'Contribution heatmap'))}\n${lk(`https://github.com/${USER}`, im('flight.svg', 'Monthly contributions as a flying car route'))}`,
  stack: sk.map((k, i) => im(`stack-${i}.svg`, k)).join('\n') + (langs ? `\n${im('langs.svg', 'Languages')}` : ''),
  'open-source': lk(`https://github.com/pulls?q=is%3Apr+author%3A${USER}+is%3Amerged`, im('oss.svg', 'Merged pull requests as a city street')),
  projects: (() => { const r = []; for (let i = 0; i < projs.length; i += 2) { const pr = projs.slice(i, i + 2); r.push(pr.map((p, k) => lk(p.url || (p.repo ? `https://github.com/${p.repo}` : ''), im(`proj-${i + k}.svg`, p.name, '49%'))).join(' ')); r.push(pr.map((p) => [p.repo ? lk(`https://github.com/${p.repo}`, im('btn-source.svg', `${p.name} source`, '24%')) : im('btn-none.svg', '', '24%'), p.url ? lk(p.url, im('btn-live.svg', `${p.name} live site`, '24%')) : im('btn-none.svg', '', '24%')].join(' ')).join(' ')); } return r.join('<br>\n') + '<br>\n' + im('proj-note.svg', 'A few projects are still in development, so their live links may not work yet.'); })(),
  'problem-solving': [lcData && lk(`https://leetcode.com/u/${lcData.user}/`, im('lc.svg', 'LeetCode stats')), cfData && lk(`https://codeforces.com/profile/${cfData.handle}`, im('cf.svg', 'Codeforces stats'))].filter(Boolean).join('\n'),
  chess: lk(`https://www.chess.com/member/${CHESS}`, im('chess.svg', 'Chess.com stats')),
  contact: contacts.map(([l, u], i) => lk(u, im(`contact-${i}.svg`, l, contacts.length === 4 ? '23.4%' : '31.5%'))).join(' '),
};
const readme = [`<a name="top"></a>`, lk(`https://github.com/${USER}`, im('hero.svg', cfg.name)), '', navRow, '',
  ...SECTIONS.map(([k, ti]) => `<a name="${k}"></a>\n\n${im(`hdr-${k}.svg`, ti, String(hdrW[k] + 8))}\n\n${body[k]}\n\n${backTop}\n`)].join('\n');
fs.writeFileSync(path.join(OUT, 'README.md'), readme);
console.log('done', { contribs, status: status[0], merged: totals.merged, prs: prList.length, projects: projs.length, v: V });
