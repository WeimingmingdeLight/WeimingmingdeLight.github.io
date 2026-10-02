/* Aphelion 渲染核心 —— 第 8 轮抽出。
   ────────────────────────────────────────────────────────────────────────────
   为什么要有这个文件（而不是把模板留在 build_site.mjs 里）：
     站内管理台（admin.html）需要**在浏览器里**重新生成页面。如果浏览器另写一套
     模板，两边必然漂移："网页上发的"和"本地发的"会长得不一样，而且没人会发现。
     所以模板只留一份：这个文件。
       · 本地：build_site.mjs 直接 import 它
       · 网页：构建时把它**逐字节复制**成 site/assets/js/render-core.js，由 admin.js import
     validate_site.mjs 会断言两份的 SHA256 相同，篡改副本会被拦住。

   硬性约束：
     · 零 Node API（不许出现 node:fs / node:path / process）—— 浏览器里也要能跑
     · 纯函数：相同输入必然得到相同输出（不要在里面读时钟、读随机数）
       sitemap 的 lastmod 因此取"内容日期"而不是"构建日期"（第 8 轮改的，
       顺带修掉了"每次构建都宣称全站更新"这个本就错误的信号） */

/* ------------------------------------------------------------------ 站点默认值 */
/* 这里的值可以被 site/_src/site.json 覆盖（见 mergeSite） */
export const SITE_DEFAULTS = {
  name: 'Aphelion',
  url: 'https://weimingmingdelight.github.io',
  author: 'Aphelion',
  email: 'Light55555t@163.com',
  eyebrow: 'PERSONAL BLOG',
  tagline: '在离光最远的地方，还在写故事。',
  bio: [
    '昵称 **Aphelion**，取自轨道上离恒星最远的那一点。写得慢，但一直在写。',
    '这里有同人小说、设定集、练笔，也有一些不成篇的东西。放着给自己看，也欢迎路过的你。',
    '如果哪个故事让你停了一下，欢迎去留言板坐一会儿。',
  ],
  tags: ['同人', '设定', '练笔', '杂文', 'Minecraft'],
  footerNote:
    '本站由纯 HTML / CSS / JavaScript 手写构建，托管于 GitHub Pages，无框架、无追踪。留言板使用开源项目 giscus 读取本站仓库的 GitHub Discussions，只有该页会请求 giscus.app。站内同人作品为非商业性二次创作，相关角色与世界观版权归原作者所有。文章日期为整理归档顺序，不代表创作日期。',
  /* 留言：giscus 接入参数。repoId / categoryId 是 GitHub 内部 ID，
     删库重建后必然变化，写错会让评论区**静默失效**（跨域 iframe 里报错，页面上看不出来）。
     用 tools/sync_giscus.mjs 自动查回，不要手抄。 */
  giscus: {
    repo: 'WeimingmingdeLight/WeimingmingdeLight.github.io',
    repoId: 'R_kgDOU5FM8A',
    category: 'Announcements',
    categoryId: 'DIC_kwDOU5FM8M4DG5R9',
    /* 每篇文章一个独立讨论串；留言板一个固定串。
       specific + term 比 pathname 好在：讨论串标题可读，且与文件路径解耦。 */
    guestbookTerm: '留言板',
    mapping: 'specific',
    strict: '1',
    reactionsEnabled: '1',
    emitMetadata: '0',
    inputPosition: 'top',
    lang: 'zh-CN',
    loading: 'lazy',
  },
};

export const NAV_ITEMS = [
  { label: '首页', href: 'index.html', key: 'home' },
  { label: '文章', href: 'blog.html', key: 'blog' },
  { label: '作品集', href: 'portfolio.html', key: 'portfolio' },
  { label: '留言板', href: 'guestbook.html', key: 'guestbook' },
  { label: '关于', href: 'contact.html', key: 'contact' },
];

/* ------------------------------------------------------------------ 工具 */
export const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const ICON = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M19 18v3H6.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7"/></svg>',
};

/** 简介里的 `**粗体**` → <strong>；其余一律转义（不允许在简介里写 HTML）。 */
export function inlineMd(s) {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** 站点配置合并：外部文件优先，giscus 逐键合并（避免漏配一个键就整段丢默认值）。 */
export function mergeSite(over) {
  const o = over || {};
  return {
    ...SITE_DEFAULTS,
    ...o,
    tags: Array.isArray(o.tags) && o.tags.length ? o.tags : SITE_DEFAULTS.tags,
    bio: Array.isArray(o.bio) && o.bio.length ? o.bio : SITE_DEFAULTS.bio,
    giscus: { ...SITE_DEFAULTS.giscus, ...(o.giscus || {}) },
  };
}

/** 按日期倒序（同日保持原顺序）。日期只是归档顺序，不代表创作日期（SPEC §7.3）。 */
export function sortPosts(posts) {
  return posts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      if (a.p.date !== b.p.date) return a.p.date < b.p.date ? 1 : -1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

/** 封面 URL：带 coverV 时加 `?v=` —— 换了图但 CDN 还缓存着旧图时，这个参数能让它立刻刷新。 */
export function coverUrl(p, base) {
  return `${base || ''}${p.cover}${p.coverV ? `?v=${encodeURIComponent(p.coverV)}` : ''}`;
}

/* ------------------------------------------------------------------ 渲染器 */

/**
 * 生成全部页面。ctx：
 *   { site, posts, galleryItems, today }
 * 返回 { files: [{rel, content}], manifest: [rel], report: [...] }
 * files 的**顺序即 manifest 顺序**，浏览器端与 Node 端必须一致（便于逐项比对）。
 */
export function renderAll(ctx) {
  const site = mergeSite(ctx.site);
  const posts = sortPosts(ctx.posts || []);
  const galleryItems = ctx.galleryItems || [];
  const files = [];
  const add = (rel, content) => files.push({ rel, content });

  /* ---------------- 片段 ---------------- */
  function head(o) {
    const b = o.base || '';
    const title = o.title ? `${o.title} · ${site.name}` : `${site.name} · ${site.tagline}`;
    const desc = o.desc || site.tagline;
    const canonical = o.canonical || site.url + '/';
    const ogImage = o.ogImage || `${site.url}/assets/img/og-image.jpg`;
    return `<!DOCTYPE html>
<html lang="zh-CN" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#2f4154">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="${b}assets/img/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${b}assets/css/style.css">
${o.preload ? `<link rel="preload" as="image" href="${esc(o.preload)}">` : ''}
<script>
(function(){
var q=null;try{q=new URLSearchParams(location.search).get('theme');}catch(e){}
var dark=false;
try{
  if(q==='dark'||q==='light'){localStorage.setItem('aphelion-theme',q);}
  var t=localStorage.getItem('aphelion-theme');
  dark=(t==='dark')||(!t&&!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches));
}catch(e){dark=(q==='dark');}
if(dark){document.documentElement.setAttribute('data-theme','dark');}
document.documentElement.className=document.documentElement.className.replace('no-js','js');
})();
</script>
</head>
<body>`;
  }

  function nav(base, active, overHero) {
    const items = NAV_ITEMS.map((it) => {
      const cur = it.key === active ? ' aria-current="page"' : '';
      return `<a class="nav__link" href="${base}${it.href}"${cur}>${esc(it.label)}</a>`;
    }).join('\n        ');
    return `<a class="skip-link" href="#main">跳到主要内容</a>
<header class="nav${overHero ? ' nav--over-hero' : ''}" id="nav">
  <div class="container nav__inner">
    <a class="nav__brand" href="${base}index.html">
      <img class="nav__brand-mark" src="${base}assets/img/favicon.svg" alt="" width="26" height="26">
      <span>${esc(site.name)}</span>
    </a>
    <nav class="nav__list" id="nav-list" aria-label="主导航">
        ${items}
    </nav>
    <div class="nav__tools">
      <button class="icon-btn" type="button" data-search-open aria-label="搜索站内文章" title="搜索（Ctrl+K）">${ICON.search}</button>
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="切换到暗色主题" title="切换主题">${ICON.sun}${ICON.moon}</button>
      <button class="icon-btn nav__burger" type="button" data-nav-burger aria-expanded="false" aria-label="打开菜单">${ICON.menu}</button>
    </div>
  </div>
</header>`;
  }

  function searchModal(base) {
    return `<div class="modal" id="search-modal" role="dialog" aria-modal="true" aria-label="站内搜索" aria-hidden="true">
  <div class="modal__backdrop" data-search-close></div>
  <div class="modal__panel">
    <div class="search__field">
      ${ICON.search}
      <input class="search__input" type="search" data-search-input placeholder="搜索文章标题、摘要、标签…" aria-label="搜索关键词" autocomplete="off">
      <span class="search__kbd">Esc</span>
    </div>
    <div class="search__results" data-search-results></div>
    <div class="search__foot">
      <span>↑ ↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span><span>Ctrl / ⌘ + K 随时唤起</span>
    </div>
  </div>
</div>`;
  }

  function lightbox() {
    return `<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="图片查看" aria-hidden="true">
  <button class="lightbox__close" type="button" data-lightbox-close aria-label="关闭">${ICON.close}</button>
  <button class="lightbox__btn lightbox__btn--prev" type="button" data-lightbox-prev aria-label="上一张">${ICON.left}</button>
  <button class="lightbox__btn lightbox__btn--next" type="button" data-lightbox-next aria-label="下一张">${ICON.right}</button>
  <div class="lightbox__stage"><img class="lightbox__img" data-lightbox-img src="" alt=""></div>
  <p class="lightbox__caption" data-lightbox-caption></p>
</div>`;
  }

  function footer(base, withNote) {
    return `<footer class="footer">
  <div class="container footer__inner">
    <p>© <span data-year>2026</span> ${esc(site.author)} · 保留所有权利</p>
    <nav class="footer__links" aria-label="页脚导航">
      <a href="${base}index.html">首页</a>
      <a href="${base}blog.html">文章</a>
      <a href="${base}portfolio.html">作品集</a>
      <a href="${base}guestbook.html">留言板</a>
      <a href="${base}contact.html">联系方式</a>
    </nav>
    ${withNote ? `<p class="footer__note">${esc(site.footerNote)}</p>` : ''}
  </div>
</footer>`;
  }

  function scripts(base, extra) {
    return `<div class="toast" id="toast" role="status" aria-live="polite"></div>
<button class="to-top" type="button" data-to-top aria-label="回到顶部">${ICON.up}</button>
<script src="${base}assets/data/posts.js"></script>
<script src="${base}assets/js/theme.js"></script>
<script src="${base}assets/js/nav.js"></script>
<script src="${base}assets/js/reveal.js"></script>
<script src="${base}assets/js/search.js"></script>
<script src="${base}assets/js/lightbox.js"></script>
<script src="${base}assets/js/main.js"></script>
${extra ? `<script src="${base}assets/js/${extra}"></script>` : ''}
</body>
</html>`;
  }

  /* 评论容器。第 8 轮：每篇文章一个独立讨论串（term = slug）。
     giscus.js 按这个元素的 data-* 属性挂载，所以"每页一个串"不需要改 JS。 */
  function giscusBlock(term) {
    const G = site.giscus;
    return `<div class="giscus-wrap reveal">
        <div class="giscus-status" id="giscus-status">
          <p>评论加载中…</p>
        </div>
        <div class="giscus"
             data-repo="${esc(G.repo)}"
             data-repo-id="${esc(G.repoId)}"
             data-category="${esc(G.category)}"
             data-category-id="${esc(G.categoryId)}"
             data-mapping="${esc(G.mapping)}"
             data-term="${esc(term)}"
             data-strict="${esc(G.strict)}"
             data-reactions-enabled="${esc(G.reactionsEnabled)}"
             data-emit-metadata="${esc(G.emitMetadata)}"
             data-input-position="${esc(G.inputPosition)}"
             data-lang="${esc(G.lang)}"
             data-loading="${esc(G.loading)}"
             data-mailto="${esc(site.email)}"></div>
        <noscript>
          <p class="giscus-status giscus-status--notice">评论需要 JavaScript。也可以直接发邮件：<a class="link" href="mailto:${esc(
            site.email
          )}">${esc(site.email)}</a></p>
        </noscript>
      </div>`;
  }

  function postCard(p, base) {
    return `<article class="post-card reveal" data-cat="${esc(p.category)}" data-tags="${esc(
      p.tags.join(',')
    )}" data-search="${esc(
      [p.title, p.shortTitle, p.summary, p.category, p.tags.join(' ')].join(' ').toLowerCase()
    )}" data-date="${esc(p.date)}">
  <a class="post-card__media" href="${base}${p.url}" tabindex="-1" aria-hidden="true">
    <img src="${coverUrl(p, base)}" alt="" width="800" height="450" loading="lazy" decoding="async">
  </a>
  <div class="post-card__body">
    <h3 class="post-card__title"><a href="${base}${p.url}">${esc(p.title)}</a></h3>
    <p class="post-card__excerpt">${esc(p.summary)}</p>
    <div class="post-card__meta">
      <span>${esc(p.date)}</span>
      <span class="meta-dot"></span>
      <span>${esc(p.category)}</span>
      <span class="meta-dot"></span>
      <span>${p.cjk} 字 · 约 ${p.readingMinutes} 分钟</span>
    </div>
    <div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </div>
</article>`;
  }

  function workCard(p, base) {
    return `<article class="work-card reveal">
  <a class="work-card__media" href="${base}${p.url}" tabindex="-1" aria-hidden="true">
    <img src="${coverUrl(p, base)}" alt="" width="800" height="450" loading="lazy" decoding="async">
    <span class="work-card__badge">${esc(p.category)}</span>
  </a>
  <div class="work-card__body">
    <h3 class="work-card__title">${esc(p.title)}</h3>
    <p class="work-card__excerpt">${esc(p.summary)}</p>
    <div class="work-card__facts">
      <span>${p.cjk} 字</span>
      <span class="meta-dot"></span>
      <span>约 ${p.readingMinutes} 分钟</span>
      ${p.series ? `<span class="meta-dot"></span><span>${esc(p.series)}</span>` : ''}
    </div>
    <div class="work-card__foot">
      <a class="btn btn--solid" href="${base}${p.url}">${ICON.book}<span>开始阅读</span></a>
    </div>
  </div>
</article>`;
  }

  function renderBlocks(blocks) {
    let out = '';
    for (const b of blocks) {
      switch (b.t) {
        case 'p':
          out += `<p>${esc(b.x)}</p>\n`;
          break;
        case 'h2':
          out += `<h2>${esc(b.x)}</h2>\n`;
          break;
        case 'h3':
          out += `<div class="section-mark"><span>${esc(b.x)}</span></div>\n`;
          break;
        case 'quote':
          out += `<blockquote>${esc(b.x)}</blockquote>\n`;
          break;
        case 'hr':
          out += `<hr>\n`;
          break;
        case 'ol':
          out += `<ol>\n${b.items.map((i) => `  <li>${esc(i)}</li>`).join('\n')}\n</ol>\n`;
          break;
        case 'ul':
          out += `<ul>\n${b.items.map((i) => `  <li>${esc(i)}</li>`).join('\n')}\n</ul>\n`;
          break;
        case 'meta':
          out += `<p><strong>${esc(b.k)}：</strong>${esc(b.v)}</p>\n`;
          break;
        default:
          out += `<p>${esc(b.x || '')}</p>\n`;
      }
    }
    return out;
  }

  function renderHead(post) {
    if (!post.head || !post.head.length) return '';
    let inner = '';
    for (const b of post.head) {
      if (b.t === 'hr') continue;
      if (b.t === 'meta') {
        inner += b.v
          ? `<p><strong>${esc(b.k)}：</strong>${esc(b.v)}</p>\n`
          : `<p><strong>${esc(b.k)}</strong></p>\n`;
      } else if (b.t === 'ol') {
        inner += `<ol>\n${b.items.map((i) => `  <li>${esc(i)}</li>`).join('\n')}\n</ol>\n`;
      } else if (b.t === 'ul') {
        inner += `<ul>\n${b.items.map((i) => `  <li>${esc(i)}</li>`).join('\n')}\n</ul>\n`;
      } else if (b.t === 'quote') {
        inner += `<blockquote>${esc(b.x)}</blockquote>\n`;
      } else if (b.t === 'h2') {
        inner += `<p><strong>${esc(b.x)}</strong></p>\n`;
      } else {
        inner += `<p>${esc(b.x)}</p>\n`;
      }
    }
    const label = post.headLabel ? `<p class="note-box__label">${esc(post.headLabel)}</p>` : '';
    return `<div class="note-box">${label}${inner}</div>`;
  }

  /* ---------------- 首页 ---------------- */
  {
    const latest = posts.slice(0, 3);
    const body = `<section class="hero">
  <div class="hero__bg" aria-hidden="true">
    <img src="assets/img/hero.jpg" alt="" width="1920" height="1080" fetchpriority="high" decoding="async">
  </div>
  <div class="hero__scrim" aria-hidden="true"></div>
  <div class="container">
    <div class="hero__inner">
      <p class="hero__eyebrow">${esc(site.eyebrow)}</p>
      <h1 class="hero__title">${esc(site.name)}</h1>
      <p class="hero__subtitle">${esc(site.tagline)}</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="blog.html">${ICON.book}<span>读文章</span></a>
        <a class="btn btn--ghost" href="#about">关于我</a>
      </div>
    </div>
  </div>
  <span class="hero__scroll" aria-hidden="true">SCROLL</span>
</section>

<main id="main">
  <section class="section" id="about">
    <div class="container">
      <div class="profile reveal">
        <div class="profile__avatar">
          <img src="assets/img/avatar.svg" alt="Aphelion 的标识：一颗运行到远日点的行星" width="168" height="168">
        </div>
        <div>
          <h2 class="profile__name">${esc(site.author)}</h2>
          <p class="profile__handle">weimingmingdelight.github.io</p>
          <div class="profile__bio">
            ${site.bio.map((p) => `<p>${inlineMd(p)}</p>`).join('\n            ')}
          </div>
          <div class="tags profile__tags">
            ${site.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('\n            ')}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head">
        <h2 class="section__title">最新文章</h2>
        <a class="section__more" href="blog.html">查看全部 ${posts.length} 篇 →</a>
      </div>
      <div class="card-grid">
        ${latest.map((p) => postCard(p, '')).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head">
        <h2 class="section__title">作品集</h2>
        <a class="section__more" href="portfolio.html">进入作品集 →</a>
      </div>
      <div class="card-grid card-grid--3">
        ${posts
          .slice(0, 3)
          .map(
            (p) => `<a class="work-card reveal" href="portfolio.html">
          <span class="work-card__media"><img src="${coverUrl(p, '')}" alt="${esc(p.coverAlt)}" width="800" height="450" loading="lazy" decoding="async"><span class="work-card__badge">${esc(p.category)}</span></span>
          <span class="work-card__body"><span class="work-card__title">${esc(p.shortTitle)}</span><span class="work-card__excerpt">${esc(p.summary.slice(0, 46))}…</span></span>
        </a>`
          )
          .join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head"><h2 class="section__title">联系</h2></div>
      <div class="profile reveal" style="grid-template-columns:1fr;display:block">
        <p style="margin-bottom:var(--s4)">想说什么都可以，邮件我基本都会看。</p>
        <div class="hero__actions">
          <a class="btn btn--solid" href="contact.html">${ICON.mail}<span>联系方式</span></a>
          <a class="btn btn--outline" href="guestbook.html">去留言板</a>
        </div>
      </div>
    </div>
  </section>
</main>`;

    add(
      'index.html',
      [
        head({
          base: '',
          title: '',
          desc: `${site.name} — ${site.tagline}收录同人小说、设定、练笔与杂文。`,
          canonical: site.url + '/',
          preload: 'assets/img/hero.jpg',
        }),
        nav('', 'home', true),
        body,
        footer('', true),
        searchModal(''),
        lightbox(),
        scripts(''),
      ].join('\n')
    );
  }

  /* ---------------- 文章列表 ---------------- */
  {
    const cats = [...new Set(posts.map((p) => p.category))];
    const tags = [...new Set(posts.flatMap((p) => p.tags))];
    const body = `<main id="main">
  <div class="container">
    <div class="page-head">
      <h1 class="page-head__title">文章</h1>
      <p class="page-head__desc">共 ${posts.length} 篇 · 合计约 ${posts.reduce(
      (s, p) => s + p.cjk,
      0
    )} 字</p>
    </div>

    <div class="filter-bar">
      <div class="filter-row">
        <span class="filter-row__label">分类</span>
        <button class="chip is-active" type="button" data-filter-cat="all">全部</button>
        ${cats.map((c) => `<button class="chip" type="button" data-filter-cat="${esc(c)}">${esc(c)}</button>`).join('\n        ')}
      </div>
      <div class="filter-row">
        <span class="filter-row__label">标签</span>
        <button class="chip is-active" type="button" data-filter-tag="all">全部</button>
        ${tags.map((t) => `<button class="chip" type="button" data-filter-tag="${esc(t)}">${esc(t)}</button>`).join('\n        ')}
      </div>
      <div class="filter-row">
        <span class="filter-row__label">关键词</span>
        <input class="search__input" type="search" data-filter-q placeholder="在标题、摘要、标签中筛选…" aria-label="关键词筛选" style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--bg-inset)">
      </div>
    </div>

    <div class="list-note">
      ${ICON.info}
      <span>文章列表中的日期为整理归档顺序，不代表创作日期。</span>
    </div>

    <div class="card-grid" id="post-list">
      ${posts.map((p) => postCard(p, '')).join('\n      ')}
    </div>

    <div class="empty" id="post-empty" hidden>
      <p class="empty__icon" aria-hidden="true">◌</p>
      <p>没有符合条件的文章，换个关键词或点「全部」试试。</p>
    </div>

    <nav class="pagination" id="post-pagination" aria-label="分页"></nav>
  </div>
</main>`;

    add(
      'blog.html',
      [
        head({
          base: '',
          title: '文章',
          desc: `${site.name} 的全部文章：同人小说、设定集、练笔与杂文，可按分类、标签或关键词筛选。`,
          canonical: site.url + '/blog.html',
        }),
        nav('', 'blog'),
        body,
        footer('', false),
        searchModal(''),
        lightbox(),
        scripts('', 'blog.js'),
      ].join('\n')
    );
  }

  /* ---------------- 作品集 ---------------- */
  {
    const body = `<main id="main">
  <div class="container">
    <div class="page-head">
      <h1 class="page-head__title">作品集</h1>
      <p class="page-head__desc">写过的故事，以及平时收着的图。</p>
    </div>
  </div>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head"><h2 class="section__title">文字作品</h2></div>
      <div class="card-grid card-grid--2">
        ${posts.map((p) => workCard(p, '')).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head">
        <h2 class="section__title">图库</h2>
        <span class="section__more">${galleryItems.length} 张 · 点击放大</span>
      </div>
      <div class="list-note">
        ${ICON.info}
        <span>这里是我平时收着的图，作为文章配图与版面素材使用，并非本人绘制。</span>
      </div>
      <div class="gallery reveal">
        ${galleryItems
          .map((g) => {
            const long = 480;
            const tw = g.w >= g.h ? long : Math.round((long * g.w) / g.h);
            const th = g.w >= g.h ? Math.round((long * g.h) / g.w) : long;
            return `<button class="gallery__item" type="button" data-lightbox="assets/img/${esc(
              g.src
            )}" data-caption="${esc(g.caption)}" aria-label="放大查看：${esc(g.caption || g.id)}">
          <img src="assets/img/${esc(g.thumb)}" alt="${esc(g.caption)}" width="${tw}" height="${th}" loading="lazy" decoding="async">
        </button>`;
          })
          .join('\n        ')}
      </div>
    </div>
  </section>
</main>`;

    add(
      'portfolio.html',
      [
        head({
          base: '',
          title: '作品集',
          desc: `${site.name} 的作品集：文字作品与图库。`,
          canonical: site.url + '/portfolio.html',
        }),
        nav('', 'portfolio'),
        body,
        footer('', false),
        searchModal(''),
        lightbox(),
        scripts(''),
      ].join('\n')
    );
  }

  /* ---------------- 联系方式 ---------------- */
  {
    const body = `<main id="main">
  <div class="container container--narrow">
    <div class="page-head">
      <h1 class="page-head__title">关于 / 联系</h1>
      <p class="page-head__desc">想聊点什么，写邮件给我就行。</p>
    </div>

    <section class="section section--tight" style="padding-top:0">
      <div class="profile reveal" style="display:block">
        <div class="profile__avatar" style="margin-bottom:var(--s5)">
          <img src="assets/img/avatar.svg" alt="Aphelion 的标识：一颗运行到远日点的行星" width="168" height="168">
        </div>
        <h2 class="profile__name">${esc(site.author)}</h2>
        <p class="profile__handle">同人 / 设定 / 练笔</p>
        <div class="profile__bio">
          ${site.bio.map((p) => `<p>${inlineMd(p)}</p>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="section__head"><h2 class="section__title">联系方式</h2></div>
      <div class="contact-list">
        <div class="contact-item reveal">
          <span class="contact-item__icon">${ICON.mail}</span>
          <div class="contact-item__body">
            <span class="contact-item__label">Email</span>
            <div class="contact-item__value">${esc(site.email)}</div>
          </div>
          <button class="copy-btn" type="button" data-copy="${esc(site.email)}">
            ${ICON.copy}<span data-copy-label>复制</span>
          </button>
        </div>
      </div>
      <div class="list-note mt-5">
        ${ICON.info}
        <span>邮件我基本都会看，但回复可能不快。想留言也可以直接去 <a class="link" href="guestbook.html">留言板</a>。</span>
      </div>
    </section>

    <section class="section section--tight">
      <div class="section__head"><h2 class="section__title">关于本站</h2></div>
      <div class="profile reveal" style="display:block">
        <p style="margin-bottom:var(--s3)">这个小站是我的个人写作主页，用纯 HTML、CSS 和 JavaScript 手写而成，没有框架、没有构建工具，托管在 GitHub Pages 上。</p>
        <p style="margin-bottom:var(--s3)">站内除了原创练笔与杂文之外，部分内容是同人二次创作，属非商业性质，相关角色与世界观版权归原作者所有。如果其中涉及你的作品且你不希望它出现在这里，请邮件告知，我会立刻撤下。</p>
        <p>文章日期是整理归档的顺序，不是创作日期。</p>
      </div>
    </section>
  </div>
</main>`;

    add(
      'contact.html',
      [
        head({
          base: '',
          title: '关于 / 联系',
          desc: `联系 ${site.author}：${site.email}`,
          canonical: site.url + '/contact.html',
        }),
        nav('', 'contact'),
        body,
        footer('', true),
        searchModal(''),
        lightbox(),
        scripts(''),
      ].join('\n')
    );
  }

  /* ---------------- 留言板（站点整体留言，与每篇文章的评论区互不干扰） ---------------- */
  {
    const G = site.giscus;
    const body = `<main id="main">
  <div class="container container--narrow">
    <div class="page-head">
      <h1 class="page-head__title">留言板</h1>
      <p class="page-head__desc">想到了什么就写下来吧。每篇文章下面也各有一个评论区。</p>
    </div>

    <section class="section section--tight" style="padding-top:0">
      <p class="giscus-lead">留言需要登录 GitHub 账号。评论保存在<a class="link" href="https://github.com/${esc(
        G.repo
      )}/discussions">本站仓库的 Discussions</a>里，不经过任何第三方评论服务；本站也不做统计、不投放广告。</p>

      ${giscusBlock(G.guestbookTerm)}

      <p class="giscus-foot">登录后可以评论、也可以只点个表情。留言会公开显示，请注意别把私人信息写进来。</p>
    </section>
  </div>
</main>`;

    add(
      'guestbook.html',
      [
        head({
          base: '',
          title: '留言板',
          desc: `${site.name} 的留言板。`,
          canonical: site.url + '/guestbook.html',
        }),
        nav('', 'guestbook'),
        body,
        footer('', false),
        searchModal(''),
        lightbox(),
        scripts('', 'giscus.js'),
      ].join('\n')
    );
  }

  /* ---------------- 404 ---------------- */
  {
    const body = `<main id="main">
  <div class="container container--narrow text-center" style="padding:calc(var(--nav-h) + var(--s8)) 0">
    <p style="font-family:var(--font-mono);letter-spacing:0.3em;color:var(--text-muted);margin-bottom:var(--s4)">ERROR 404</p>
    <h1 class="page-head__title">飘出轨道了</h1>
    <p style="color:var(--text-muted);margin:var(--s4) 0 var(--s6)">这个地址上没有内容。也许它已经远到看不见了。</p>
    <div class="hero__actions" style="justify-content:center">
      <a class="btn btn--solid" href="/">回到首页</a>
      <a class="btn btn--outline" href="/blog.html">看文章</a>
    </div>
  </div>
</main>`;

    add(
      '404.html',
      [
        head({ base: '/', title: '页面不存在', desc: '这个地址上没有内容。', ogType: 'website' }),
        nav('/', ''),
        body,
        footer('/', false),
        searchModal('/'),
        lightbox(),
        scripts('/'),
      ].join('\n')
    );
  }

  /* ---------------- 文章详情页（含各自独立的评论区） ---------------- */
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const newer = i > 0 ? posts[i - 1] : null;
    const older = i < posts.length - 1 ? posts[i + 1] : null;

    const prevBlock = older
      ? `<a class="post-nav__item" href="${older.slug}.html"><span class="post-nav__dir">上一篇</span><span class="post-nav__title">${esc(
          older.title
        )}</span></a>`
      : `<span class="post-nav__item post-nav__item--empty"><span class="post-nav__dir">上一篇</span><span class="post-nav__title">没有更早的文章了</span></span>`;

    const nextBlock = newer
      ? `<a class="post-nav__item post-nav__item--next" href="${newer.slug}.html"><span class="post-nav__dir">下一篇</span><span class="post-nav__title">${esc(
          newer.title
        )}</span></a>`
      : `<span class="post-nav__item post-nav__item--next post-nav__item--empty"><span class="post-nav__dir">下一篇</span><span class="post-nav__title">已经是最新一篇</span></span>`;

    const body = `<div class="read-progress" data-read-progress aria-hidden="true"></div>
<main id="main">
  <div class="container container--narrow">
    <article class="article" data-article>
      <p class="back-link"><a href="../blog.html">${ICON.left}<span>返回文章列表</span></a></p>

      <header class="article__head">
        <h1 class="article__title">${esc(p.title)}</h1>
        ${p.subtitle ? `<p class="article__subtitle">${esc(p.subtitle)}</p>` : ''}
        <div class="article__meta">
          <span>${esc(p.date)}</span>
          <span class="meta-dot"></span>
          <span>${esc(p.category)}${p.series ? ' › ' + esc(p.series) : ''}</span>
          <span class="meta-dot"></span>
          <span>${p.cjk} 字 · 约 ${p.readingMinutes} 分钟</span>
        </div>
        <div class="tags">
          ${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('\n          ')}
        </div>
        <figure class="article__cover">
          <img src="../${coverUrl(p, '')}" alt="${esc(p.coverAlt)}" width="800" height="450" decoding="async">
        </figure>
      </header>

      ${renderHead(p)}

      <div class="prose">
${renderBlocks(p.blocks)}
      </div>

      <nav class="post-nav" aria-label="文章导航">
        ${prevBlock}
        ${nextBlock}
      </nav>
    </article>

    <section class="comments" id="comments" aria-label="评论">
      <div class="section__head">
        <h2 class="section__title">评论</h2>
        <a class="section__more" href="https://github.com/${esc(
          site.giscus.repo
        )}/discussions">在 GitHub 上看这一篇的讨论 →</a>
      </div>
      <p class="giscus-lead">这一篇有自己的讨论串，和留言板、其他文章都分开。需要登录 GitHub 账号。</p>

      ${giscusBlock(p.slug)}

      <p class="giscus-foot">评论会公开显示，请注意别把私人信息写进来。</p>
    </section>
  </div>
</main>`;

    add(
      `posts/${p.slug}.html`,
      [
        head({
          base: '../',
          title: p.title,
          desc: p.summary.slice(0, 140),
          canonical: `${site.url}/${p.url}`,
          ogType: 'article',
          ogImage: `${site.url}/${coverUrl(p, '')}`,
        }),
        nav('../', 'blog'),
        body,
        footer('../', false),
        searchModal('../'),
        lightbox(),
        scripts('../', 'giscus.js'),
      ].join('\n')
    );
  }

  /* ---------------- 搜索索引 ---------------- */
  {
    const data = posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      shortTitle: p.shortTitle,
      summary: p.summary,
      category: p.category,
      series: p.series,
      tags: p.tags,
      date: p.date,
      cjk: p.cjk,
      cover: p.cover,
      url: p.url,
    }));
    add(
      'assets/data/posts.js',
      `/* ${site.name} 文章索引 —— 由构建脚本生成，供站内搜索使用 */\nwindow.APHELION_POSTS = ${JSON.stringify(
        data,
        null,
        2
      )};\n`
    );
  }

  /* ---------------- sitemap / robots ---------------- */
  {
    /* lastmod 用"内容日期"而不是"构建日期"：每次构建都宣称全站更新是错的信号，
       而且会让产物不确定（同一天重建两次都可能不同），使"逐字节回归"和
       "站内自检 0 差异"都失去意义。第 8 轮改。 */
    const newest = posts.length ? posts.map((p) => p.date).sort().slice(-1)[0] : ctx.today;
    const urls = [
      { loc: site.url + '/', lastmod: newest, pri: '1.0' },
      { loc: site.url + '/blog.html', lastmod: newest, pri: '0.9' },
      { loc: site.url + '/portfolio.html', lastmod: newest, pri: '0.8' },
      { loc: site.url + '/guestbook.html', lastmod: newest, pri: '0.5' },
      { loc: site.url + '/contact.html', lastmod: newest, pri: '0.5' },
      ...posts.map((p) => ({ loc: `${site.url}/${p.url}`, lastmod: p.date, pri: '0.7' })),
    ];
    add(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map(
          (u) =>
            `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.pri}</priority>\n  </url>`
        )
        .join('\n')}\n</urlset>\n`
    );
    add(
      'robots.txt',
      `User-agent: *\nAllow: /\nDisallow: /admin.html\n\nSitemap: ${site.url}/sitemap.xml\n`
    );
  }

  return {
    files,
    manifest: files.map((f) => f.rel),
    report: files.map((f) => ({ rel: f.rel, bytes: f.content.length })),
  };
}

/** 只要某几页时用这个（管理台只发布受影响的部分时要先知道哪些算"受影响"）。 */
export const PAGE_DEPS = {
  'index.html': ['posts', 'site'],
  'blog.html': ['posts'],
  'portfolio.html': ['posts', 'gallery'],
  'contact.html': ['site'],
  'guestbook.html': ['site'],
  '404.html': [],
  'assets/data/posts.js': ['posts'],
  'sitemap.xml': ['posts'],
  'robots.txt': [],
  post: ['posts'],
};
