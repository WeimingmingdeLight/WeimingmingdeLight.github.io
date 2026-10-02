/* Aphelion 站内管理台 —— 浏览器里直接读写仓库（第 8 轮）
   ────────────────────────────────────────────────────────────────────────────
   设计要点（为什么长这样）：

   1. 渲染复用本地构建的那份代码。import 的是 assets/js/render-core.js，
      它由 tools/build_site.mjs 从 tools/render_core.mjs **逐字节复制**而来，
      validate_site.mjs 会断言两者一致。所以"网页上发的"和"本地发的"不会漂移。
   2. 令牌只进 localStorage，永远不进 DOM 之外的任何地方，也绝不写进仓库。
   3. 一次发布 = 一个提交：blob → tree(base_tree) → commit → 更新 main 引用。
   4. 只提交**真的变了**的文件：本地按 git 的 blob 算法（sha1("blob <len>\0"+内容)）
      算出每个文件的哈希，和远端 tree 里的 sha 比对 —— 这也正是「自检」的实现，
      区别只是自检不提交。
   5. 需要安全上下文（https 或 localhost）：crypto.subtle 只在安全上下文里存在。
      所以管理台必须通过 http(s) 打开，不能双击 file:// 打开。 */

import { renderAll } from './render-core.js';
import { parseBody, makePost, SLUG_RE, clean } from './post-parse.js';

const API = 'https://api.github.com';
const TOKEN_KEY = 'aphelion-admin-token';
const OWNER = 'WeimingmingdeLight';
const REPO = 'WeimingmingdeLight.github.io';
const BRANCH = 'main';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ 状态 */
const S = {
  token: '',
  login: '',
  posts: [],          // _src/posts.json 的内容
  postsText: '',      // 原样保留，未改动时不重写（避免无意义 diff）
  site: {},           // _src/site.json 的内容
  siteText: '',
  galleryItems: [],
  remoteBlobs: new Map(), // path -> sha（远端 main 的 tree）
  editing: null,      // 正在编辑的 slug（null = 新建）
  cover: null,        // { path, bytes, dataUrl, dirty }
};

/* ------------------------------------------------------------------ 小工具 */
function log(msg, cls = '') {
  const el = $('log');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
const logOk = (m) => log('✓ ' + m, 'ok');
const logBad = (m) => log('✗ ' + m, 'bad');
const logWarn = (m) => log('! ' + m, 'warn');
const logDim = (m) => log('  ' + m, 'dim');

const enc = new TextEncoder();
const bytesOf = (s) => enc.encode(s);

function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

async function gitBlobSha(bytes) {
  const head = enc.encode(`blob ${bytes.length}\0`);
  const buf = new Uint8Array(head.length + bytes.length);
  buf.set(head, 0);
  buf.set(bytes, head.length);
  const d = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + S.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch (e) {
      detail = await res.text().catch(() => '');
    }
    const err = new Error(`${method} ${path} → ${res.status} ${detail}`.trim());
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/* ------------------------------------------------------------------ 读取仓库 */
/** 用 raw 媒体类型读文本：绕开 Contents API 对 >1MB 文件不再返回 content 的限制
    （文章多了以后 _src/posts.json 会超过 1MB，那时 base64 那条路就断了）。 */
async function getRawText(path) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: {
      Authorization: 'Bearer ' + S.token,
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const e = new Error(`读 ${path} → ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.text();
}

async function loadRemote() {
  const base = `/repos/${OWNER}/${REPO}`;
  const tree = await api(`${base}/git/trees/${BRANCH}?recursive=1`);
  S.postsText = await getRawText('_src/posts.json');
  S.siteText = await getRawText('_src/site.json');
  S.posts = JSON.parse(S.postsText);
  S.site = JSON.parse(S.siteText);
  if (!Array.isArray(S.posts)) throw new Error('_src/posts.json 不是数组');
  S.remoteBlobs = new Map((tree.tree || []).filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));

  /* 图库：清单 ∩ 实际存在的编号（浏览器做不到 existsSync，所以用构建时生成的 index） */
  const rd = async (p) => {
    try {
      return JSON.parse(await getRawText(p));
    } catch (e) {
      logWarn(`读不到 ${p}：${e.message}`);
      return null;
    }
  };
  const [manifest, captions, index] = await Promise.all([
    rd('assets/img/gallery-manifest.json'),
    rd('assets/img/gallery-captions.json'),
    rd('assets/img/gallery-index.json'),
  ]);
  const have = new Set(index || []);
  S.galleryItems = (manifest || [])
    .filter((g) => have.has(g.id))
    .map((g) => ({
      id: g.id,
      src: g.src,
      thumb: g.thumb,
      w: g.w,
      h: g.h,
      caption: (captions || {})[g.id] || '',
    }));
}

/* ------------------------------------------------------------------ 渲染与比对 */
/**
 * 渲染整站，并与远端逐文件比对。
 * extra：调用方额外要写的文件（`_src/*.json`、新封面图等），path → Uint8Array
 */
async function plan(extraFiles = {}) {
  const out = renderAll({
    site: S.site,
    posts: S.posts,
    galleryItems: S.galleryItems,
    today: new Date().toISOString().slice(0, 10),
  });

  const wanted = new Map();
  for (const f of out.files) wanted.set(f.rel, bytesOf(f.content));
  wanted.set('.nojekyll', new Uint8Array(0));
  wanted.set('_src/posts.json', bytesOf(JSON.stringify(S.posts, null, 2) + '\n'));
  wanted.set('_src/site.json', bytesOf(JSON.stringify(S.site, null, 2) + '\n'));
  for (const [p, b] of Object.entries(extraFiles)) wanted.set(p, b);

  const changed = [];
  const unchanged = [];
  for (const [path, bytes] of wanted) {
    const sha = await gitBlobSha(bytes);
    if (S.remoteBlobs.get(path) === sha) unchanged.push(path);
    else changed.push({ path, bytes, sha, reason: S.remoteBlobs.has(path) ? '内容有变' : '新增' });
  }

  /* 待删除：仓库里有、但渲染结果里已经没有的文章页（例如本地把某篇从 posts.json 去掉了） */
  const deletions = [];
  for (const path of S.remoteBlobs.keys()) {
    if (/^posts\/[^/]+\.html$/.test(path) && !wanted.has(path)) deletions.push(path);
  }

  return { out, wanted, changed, unchanged, deletions };
}

async function commitPlan(p, message) {
  const base = `/repos/${OWNER}/${REPO}`;
  const entries = [];
  for (const c of p.changed) {
    const blob = await api(`${base}/git/blobs`, {
      method: 'POST',
      body: { content: bytesToB64(c.bytes), encoding: 'base64' },
    });
    entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
    logDim(`blob ${blob.sha.slice(0, 8)}  ${c.path}`);
  }
  for (const path of p.deletions) {
    entries.push({ path, mode: '100644', type: 'blob', sha: null });
    logDim(`删除 ${path}`);
  }
  if (!entries.length) return null;

  const ref = await api(`${base}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const head = await api(`${base}/git/commits/${headSha}`);
  const tree = await api(`${base}/git/trees`, {
    method: 'POST',
    body: { base_tree: head.tree.sha, tree: entries },
  });
  const commit = await api(`${base}/git/commits`, {
    method: 'POST',
    body: { message, tree: tree.sha, parents: [headSha] },
  });
  await api(`${base}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
  return commit;
}

async function refreshRemoteBlobs() {
  const tree = await api(`/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  S.remoteBlobs = new Map((tree.tree || []).filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
}

/* ------------------------------------------------------------------ 封面 */
async function makeCoverBytes(file, vshift) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const W = 800;
  const H = 450;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const sw = W / scale;
  const sh = H / scale;
  const sx = (bmp.width - sw) / 2;
  const sy = (bmp.height - sh) * Number(vshift);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
  if (bmp.close) bmp.close();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, dataUrl: c.toDataURL('image/jpeg', 0.7) };
}

/* ------------------------------------------------------------------ 界面：文章列表 */
function renderPostList() {
  const ul = $('post-list');
  ul.textContent = '';
  const sorted = [...S.posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  $('posts-count').textContent = `共 ${sorted.length} 篇`;
  for (const p of sorted) {
    const li = document.createElement('li');

    const img = document.createElement('img');
    img.src = p.cover + (p.coverV ? `?v=${p.coverV}` : '');
    img.alt = '';
    img.loading = 'lazy';
    li.appendChild(img);

    const main = document.createElement('div');
    main.className = 'a-list__main';
    const t = document.createElement('div');
    t.className = 'a-list__title';
    t.textContent = p.title;
    const m = document.createElement('div');
    m.className = 'a-list__meta';
    m.textContent = `${p.slug} · ${p.date} · ${p.category} · ${p.cjk} 字/${p.readingMinutes} 分钟`;
    main.appendChild(t);
    main.appendChild(m);
    li.appendChild(main);

    const b1 = document.createElement('button');
    b1.className = 'a-btn a-btn--sm';
    b1.type = 'button';
    b1.textContent = '编辑正文';
    b1.addEventListener('click', () => openEditor(p.slug));
    li.appendChild(b1);

    const b2 = document.createElement('button');
    b2.className = 'a-btn a-btn--sm';
    b2.type = 'button';
    b2.textContent = '换封面';
    b2.addEventListener('click', () => openEditor(p.slug, true));
    li.appendChild(b2);

    const a = document.createElement('a');
    a.className = 'a-btn a-btn--sm a-btn--ghost';
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '查看';
    li.appendChild(a);

    ul.appendChild(li);
  }
}

/* ------------------------------------------------------------------ 界面：编辑器 */
function fillCategories() {
  const dl = $('cat-list');
  dl.textContent = '';
  for (const c of [...new Set(S.posts.map((p) => p.category))]) {
    const o = document.createElement('option');
    o.value = c;
    dl.appendChild(o);
  }
}

function openEditor(slug, focusCover = false) {
  S.editing = slug;
  S.cover = null;
  const p = slug ? S.posts.find((x) => x.slug === slug) : null;
  $('editor-title').textContent = p ? `编辑：${p.title}` : '上传新文本';
  $('f-date').value = p ? p.date : new Date().toISOString().slice(0, 10);
  $('f-title').value = p ? p.title : '';
  $('f-shorttitle').value = p ? p.shortTitle || '' : '';
  $('f-subtitle').value = p ? p.subtitle || '' : '';
  $('f-slug').value = p ? p.slug : suggestSlug();
  $('f-slug').readOnly = !!p;
  $('f-category').value = p ? p.category : '同人';
  $('f-series').value = p ? p.series || '' : '';
  $('f-tags').value = p ? (p.tags || []).join(', ') : '';
  $('f-headlabel').value = p ? p.headLabel || '' : '';
  $('f-summary').value = p ? p.summary || '' : '';
  $('f-coveralt').value = p ? p.coverAlt || '' : '';
  $('f-body').value = p ? blocksToText(p) : '';
  $('f-mode').value = p ? 'line' : 'auto';
  $('cover-preview').src = p ? p.cover + (p.coverV ? `?v=${p.coverV}` : '') : PLACEHOLDER;
  $('cover-note').textContent = p ? '当前封面。选新图会立刻替换。' : '还没有选图。图片会被裁成 800×450 的 JPEG 再上传。';
  $('cover-file').value = '';
  $('preview').classList.add('a-hidden');
  updateSlugPreview();
  updateParseNote();
  $('editor').classList.remove('a-hidden');
  $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (focusCover) $('btn-cover').focus();
}

const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function suggestSlug() {
  const d = $('f-date').value || new Date().toISOString().slice(0, 10);
  return 'post-' + d;
}

/** 已有文章的 blocks → 可编辑文本（尽量按"能再解析回去"的写法还原） */
function blocksToText(p) {
  const lines = [];
  for (const b of p.blocks || []) {
    switch (b.t) {
      case 'p': lines.push(b.x); break;
      case 'h2': lines.push('# ' + b.x); break;
      case 'h3': lines.push(b.x); break;
      case 'quote': lines.push(...String(b.x).split('\n').map((l) => '> ' + l)); break;
      case 'hr': lines.push('---'); break;
      case 'ol': (b.items || []).forEach((it, i) => lines.push(`${i + 1}. ${it}`)); break;
      case 'ul': (b.items || []).forEach((it) => lines.push('· ' + it)); break;
      case 'meta': lines.push(`${b.k}：${b.v}`); break;
      case 'note': lines.push('* ' + b.x); break;
      default: lines.push(b.x || '');
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

function headToLines(head) {
  const lines = [];
  for (const b of head || []) {
    if (b.t === 'meta') lines.push(b.v ? `${b.k}：${b.v}` : b.k);
    else if (b.t === 'h2') lines.push(String(b.x));
    else if (b.t === 'ol') (b.items || []).forEach((it, i) => lines.push(`${i + 1}. ${it}`));
    else if (b.t === 'ul') (b.items || []).forEach((it) => lines.push('· ' + it));
    else if (b.t === 'quote') lines.push('> ' + b.x);
    else lines.push(b.x || '');
  }
  return lines;
}

function updateSlugPreview() {
  const s = clean($('f-slug').value);
  $('slug-preview').textContent = `posts/${s || '…'}.html`;
}

function currentParse() {
  const { blocks, mode } = parseBody($('f-body').value, $('f-mode').value);
  return { blocks, mode };
}

function updateParseNote() {
  const { blocks, mode } = currentParse();
  const cjk = blocks
    .filter((b) => b.t === 'p' || b.t === 'h2' || b.t === 'quote')
    .map((b) => b.x)
    .join('\n')
    .match(/[\u4e00-\u9fff]/g);
  const n = cjk ? cjk.length : 0;
  const kinds = {};
  for (const b of blocks) kinds[b.t] = (kinds[b.t] || 0) + 1;
  $('parse-note').textContent =
    `解析出 ${blocks.length} 块（${Object.entries(kinds).map(([k, v]) => k + ':' + v).join(' ')}），` +
    `正文 ${n} 字 ≈ ${Math.max(1, Math.round(n / 400))} 分钟；分段方式：${mode === 'blank' ? '空行分段' : '每行一段'}`;
}

/** 前置信息：把正文开头连续的"像元信息/编号/注"的行切出来 —— 与本地流程同一判据（分隔线优先） */
function splitHead(text) {
  const raw = text.replace(/\r\n?/g, '\n');
  const lines = raw.split('\n');
  const nonBlank = [];
  const indexOfLine = [];
  lines.forEach((l, i) => {
    if (clean(l)) {
      nonBlank.push(clean(l));
      indexOfLine.push(i);
    }
  });
  const isHr = (s) => /^[\s\u3000]*([—–-]{3,}|[-*_]{3,})[\s\u3000]*$/.test(s);
  const isMeta = (s) =>
    /^[*＊]/.test(s) ||
    /^\d{1,2}[.、)]\s*.+$/.test(s) ||
    /^([^：:]{1,14})[：:]\s*(.*)$/.test(s) &&
      /^(summary|配对|cp|chapter|volume|出场|预警|设定|注意|tags?|warning)$/i.test(
        (s.match(/^([^：:]{1,14})[：:]/) || [])[1] || ''
      );
  let cut = 0;
  const hr = nonBlank.findIndex(isHr);
  if (hr >= 0) cut = hr;
  else {
    let n = 0;
    for (const s of nonBlank.slice(0, 20)) {
      if (!isMeta(s)) break;
      n++;
    }
    cut = n;
  }
  cut = Math.min(cut, Math.max(0, nonBlank.length - 1));
  if (!cut) return { headText: '', body: text };
  const lastIdx = indexOfLine[cut - 1];
  return { headText: nonBlank.slice(0, cut).join('\n'), body: lines.slice(lastIdx + 1).join('\n') };
}

/** 把编辑器内容组装成一条记录 */
function collectPost() {
  const slug = clean($('f-slug').value);
  if (!SLUG_RE.test(slug)) throw new Error('slug 只能用小写字母、数字和连字符，且以字母或数字开头');
  const title = $('f-title').value.trim();
  if (!title) throw new Error('标题不能为空');
  const date = $('f-date').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期要填成 YYYY-MM-DD');
  const tags = $('f-tags')
    .value.split(/[,，、]/)
    .map((s) => clean(s))
    .filter(Boolean);

  const raw = $('f-body').value;
  const split = splitHead(raw);
  const headParsed = split.headText ? parseBody(split.headText, 'line').blocks : [];
  const { blocks } = parseBody(split.body, $('f-mode').value);
  if (!blocks.length) throw new Error('正文解析出 0 块 —— 检查一下正文是不是空的');

  const meta = {
    slug,
    title,
    shortTitle: $('f-shorttitle').value.trim() || title,
    subtitle: $('f-subtitle').value.trim(),
    category: $('f-category').value.trim() || '杂文',
    series: $('f-series').value.trim(),
    tags,
    date,
    cover: `assets/img/covers/${slug}.jpg`,
    coverAlt: $('f-coveralt').value.trim(),
    headLabel: $('f-headlabel').value.trim(),
    summary: $('f-summary').value.trim(),
    sourceFile: '',
  };
  const rec = makePost(meta, blocks, headParsed);
  const old = S.posts.find((p) => p.slug === slug);
  if (old && old.coverV && !S.cover) rec.coverV = old.coverV;
  return rec;
}

/* ------------------------------------------------------------------ 发布 */
async function publish(message, extraFiles = {}) {
  const p = await plan(extraFiles);
  if (!p.changed.length && !p.deletions.length) {
    logOk('没有任何改动 —— 仓库已经是最新的');
    return { p, commit: null };
  }
  log(`准备提交 ${p.changed.length} 个文件改动${p.deletions.length ? `、删除 ${p.deletions.length} 个` : ''}…`);
  const commit = await commitPlan(p, message);
  logOk(`已提交 ${commit.sha.slice(0, 8)}：${message}`);
  logDim(`https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`);
  await refreshRemoteBlobs();
  return { p, commit };
}

/* ------------------------------------------------------------------ 事件绑定 */
function bind() {
  /* 令牌 */
  $('btn-connect').addEventListener('click', async () => {
    const t = $('token').value.trim();
    if (!t) return;
    $('gate-msg').textContent = '验证中…';
    S.token = t;
    try {
      const me = await api('/user');
      const repo = await api(`/repos/${OWNER}/${REPO}`);
      if (!repo.permissions || !repo.permissions.push) throw new Error('这个令牌对该仓库没有写权限（Contents 需要 Read and write）');
      S.login = me.login;
      localStorage.setItem(TOKEN_KEY, t);
      $('gate-msg').textContent = '';
      await enterApp();
    } catch (e) {
      S.token = '';
      $('gate-msg').textContent = '连接失败：' + e.message;
    }
  });

  $('btn-forget').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    S.token = '';
    location.reload();
  });

  /* 标签页 */
  const tabs = [
    ['tab-posts', 'pane-posts'],
    ['tab-bio', 'pane-bio'],
    ['tab-check', 'pane-check'],
    ['tab-help', 'pane-help'],
  ];
  for (const [t, pane] of tabs) {
    $(t).addEventListener('click', () => {
      for (const [t2, pane2] of tabs) {
        $(t2).setAttribute('aria-selected', String(t2 === t));
        $(pane2).classList.toggle('a-hidden', pane2 !== pane);
      }
    });
  }

  /* 文章 */
  $('btn-new').addEventListener('click', () => openEditor(null));
  $('btn-reload').addEventListener('click', async () => {
    log('重新读取仓库…');
    await loadRemote();
    renderPostList();
    fillCategories();
    renderBio();
    logOk('已重新读取 _src/posts.json 与 _src/site.json');
  });
  $('btn-cancel').addEventListener('click', () => $('editor').classList.add('a-hidden'));
  $('btn-preview').addEventListener('click', () => {
    const { blocks } = currentParse();
    const box = $('preview');
    box.textContent = '';
    box.appendChild(renderPreview(blocks));
    box.classList.remove('a-hidden');
  });
  $('f-body').addEventListener('input', updateParseNote);
  $('f-mode').addEventListener('change', updateParseNote);
  $('f-slug').addEventListener('input', updateSlugPreview);

  /* 封面 */
  $('btn-cover').addEventListener('click', () => $('cover-file').click());
  $('cover-file').addEventListener('change', async () => {
    const f = $('cover-file').files && $('cover-file').files[0];
    if (!f) return;
    try {
      const { bytes, dataUrl } = await makeCoverBytes(f, $('cover-vshift').value);
      const slug = clean($('f-slug').value);
      if (!SLUG_RE.test(slug)) throw new Error('先把 slug 填好再选封面（封面路径要用到它）');
      S.cover = { path: `assets/img/covers/${slug}.jpg`, bytes, dataUrl };
      $('cover-preview').src = dataUrl;
      $('cover-note').textContent = `已选：${(bytes.length / 1024).toFixed(0)} KB，裁成 800×450，保存后上传。`;
      logOk(`封面已裁好（${(bytes.length / 1024).toFixed(0)} KB），点「保存并发布」才会上传`);
    } catch (e) {
      logBad('封面处理失败：' + e.message);
    }
  });
  $('cover-vshift').addEventListener('change', () => {
    const f = $('cover-file').files && $('cover-file').files[0];
    if (f) $('cover-file').dispatchEvent(new Event('change'));
  });

  /* 保存文章 */
  $('btn-save').addEventListener('click', async () => {
    let rec;
    try {
      rec = collectPost();
    } catch (e) {
      logBad(e.message);
      return;
    }
    const isNew = !S.posts.some((p) => p.slug === rec.slug);
    const extra = {};
    if (S.cover) {
      rec.coverV = Date.now().toString(36);
      extra[S.cover.path] = S.cover.bytes;
    }
    const idx = S.posts.findIndex((p) => p.slug === rec.slug);
    if (idx >= 0) S.posts[idx] = rec;
    else S.posts.push(rec);

    $('btn-save').disabled = true;
    try {
      await publish(
        isNew ? `新增文章：${rec.title}` : `更新文章：${rec.title}`,
        extra
      );
      S.cover = null;
      renderPostList();
      fillCategories();
      $('editor').classList.add('a-hidden');
      await loadRemote();
      renderPostList();
    } catch (e) {
      logBad('发布失败：' + e.message);
      logWarn('仓库没有被改动；可以修好再点一次。若提示 ref 冲突，点「重新读取仓库」再试。');
      if (idx >= 0) S.posts[idx] = rec; // 内存里保留改动，方便重试
      else S.posts.push(rec);
    } finally {
      $('btn-save').disabled = false;
    }
  });

  /* 简介 */
  $('btn-bio-preview').addEventListener('click', () => {
    const box = $('bio-preview');
    box.textContent = '';
    for (const para of bioParagraphs()) {
      const p = document.createElement('p');
      p.innerHTML = para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      box.appendChild(p);
    }
    box.classList.remove('a-hidden');
  });

  $('btn-save-bio').addEventListener('click', async () => {
    const bio = bioParagraphs();
    if (!bio.length) {
      logBad('简介不能为空');
      return;
    }
    const before = JSON.stringify(S.site);
    S.site.bio = bio;
    S.site.tagline = $('f-tagline').value.trim() || S.site.tagline;
    S.site.author = $('f-author').value.trim() || S.site.author;
    S.site.tags = $('f-sitetags')
      .value.split(/[,，、]/)
      .map((s) => clean(s))
      .filter(Boolean);
    if (JSON.stringify(S.site) === before) {
      logOk('简介没有变化');
      return;
    }
    $('btn-save-bio').disabled = true;
    try {
      await publish('更新个人简介');
    } catch (e) {
      logBad('发布失败：' + e.message);
    } finally {
      $('btn-save-bio').disabled = false;
    }
  });

  /* 自检 */
  $('btn-check').addEventListener('click', async () => {
    $('check-msg').textContent = '渲染并比对中…';
    $('btn-check').disabled = true;
    try {
      const p = await plan();
      log(`自检：渲染 ${p.wanted.size} 个文件，其中 ${p.unchanged.length} 个与仓库逐字节相同`);
      if (!p.changed.length && !p.deletions.length) {
        logOk(`0 处差异 —— 站内渲染与仓库现状完全一致（${p.wanted.size} 个文件）`);
        $('check-msg').textContent = `0 处差异（${p.wanted.size} 个文件）`;
      } else {
        logWarn(`有 ${p.changed.length} 个文件与仓库不同：`);
        for (const c of p.changed) logDim(`${c.reason}  ${c.path}`);
        if (p.deletions.length) for (const d of p.deletions) logDim(`多余（仓库里有、渲染结果里没有）  ${d}`);
        $('check-msg').textContent = `${p.changed.length} 个文件不同`;
      }
    } catch (e) {
      logBad('自检失败：' + e.message);
      $('check-msg').textContent = '失败：' + e.message;
    } finally {
      $('btn-check').disabled = false;
    }
  });
}

function bioParagraphs() {
  return $('f-bio')
    .value.split(/\n\s*\n/)
    .map((s) => s.replace(/\s+$/g, '').replace(/^\s+/g, ''))
    .filter(Boolean);
}

function renderPreview(blocks) {
  const box = document.createElement('div');
  for (const b of blocks) {
    let el;
    if (b.t === 'h2' || b.t === 'h3') {
      el = document.createElement('h2');
      if (b.t === 'h3') el.className = 'section-mark';
      el.textContent = b.x;
    } else if (b.t === 'hr') {
      el = document.createElement('hr');
    } else if (b.t === 'quote') {
      el = document.createElement('blockquote');
      el.textContent = b.x;
    } else if (b.t === 'ol' || b.t === 'ul') {
      el = document.createElement(b.t);
      for (const it of b.items || []) {
        const li = document.createElement('li');
        li.textContent = it;
        el.appendChild(li);
      }
    } else if (b.t === 'meta') {
      el = document.createElement('p');
      const s = document.createElement('strong');
      s.textContent = b.k + '：';
      el.appendChild(s);
      el.appendChild(document.createTextNode(b.v || ''));
    } else {
      el = document.createElement('p');
      el.textContent = b.x || '';
    }
    box.appendChild(el);
  }
  return box;
}

function renderBio() {
  $('f-bio').value = (S.site.bio || []).join('\n\n');
  $('f-tagline').value = S.site.tagline || '';
  $('f-author').value = S.site.author || '';
  $('f-sitetags').value = (S.site.tags || []).join(', ');
}

/* ------------------------------------------------------------------ 启动 */
async function enterApp() {
  $('gate').classList.add('a-hidden');
  $('app').classList.remove('a-hidden');
  $('btn-forget').classList.remove('a-hidden');
  $('who').textContent = `已连接：${S.login} · ${OWNER}/${REPO}`;
  log(`已连接 ${S.login}，读取仓库内容…`);
  try {
    await loadRemote();
  } catch (e) {
    logBad('读取仓库内容失败：' + e.message);
    if (e.status === 404) {
      logWarn('仓库里还没有 _src/ —— 先在本机跑一次 build_site.mjs + push_site.mjs 把数据源推上去。');
    }
    $('who').textContent = `已连接：${S.login}（读取失败）`;
    return;
  }
  renderPostList();
  fillCategories();
  renderBio();
  logOk(`读到 ${S.posts.length} 篇文章、图库 ${S.galleryItems.length} 张`);
  logDim('先点「自检」确认站内渲染与仓库现状一致，再改东西。');
}

(async function boot() {
  bind();
  const saved = localStorage.getItem(TOKEN_KEY);
  if (!crypto.subtle) {
    $('gate-msg').textContent =
      '这个页面必须通过 http(s) 打开（安全上下文），双击本地文件打开时浏览器不提供加密接口。';
    return;
  }
  if (!saved) return;
  S.token = saved;
  try {
    const me = await api('/user');
    const repo = await api(`/repos/${OWNER}/${REPO}`);
    if (!repo.permissions || !repo.permissions.push) throw new Error('令牌没有写权限');
    S.login = me.login;
    await enterApp();
  } catch (e) {
    S.token = '';
    $('gate-msg').textContent = '保存的令牌已失效：' + e.message + '（重新粘贴一个新的即可）';
    localStorage.removeItem(TOKEN_KEY);
  }
})();
