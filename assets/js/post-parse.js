/* Aphelion 正文解析 —— 第 8 轮抽出，供「本地脚本」与「站内管理台」共用。
   ────────────────────────────────────────────────────────────────────────────
   抽出的理由与 render_core.mjs 相同：站内管理台要把**粘贴进来的纯文本**解析成
   blocks，如果它自己再写一套规则，同一段文字在"网页上发的"和"本地发的"里就会
   被切成不同的段落。构建时本文件被逐字节复制成 site/assets/js/post-parse.js。

   零 Node API（浏览器里也要跑）。纯函数。

   支持的写法（第 8 轮作者选定的输入方式）：
     # 小标题      → h2
     ## 小标题     → h3（渲染为带序号的 section-mark）
     > 引用        → blockquote
     --- / ***     → 分隔线
     1. / 1、      → 有序列表
     · / •         → 无序列表
     键：值        → 元信息行（只认 summary/配对/cp/出场/预警… 等已知键）
     * 备注        → 备注行
     其余          → 段落

   段落怎么切（parseBody 的 mode）：
     'auto'（默认）—— 文里有空行 → 按空行分段（行内换行合并）；没空行 → 每行一段。
                       前者对应"从网页/聊天窗口复制"，后者对应"Word/PDF 导出的纯文本"
                       （本项目最初 4 篇就是后者：每个非空行都是自然段）。
     'blank'       —— 强制按空行分段
     'line'        —— 强制每行一段 */
export const CJK = /[\u4e00-\u9fff]/g;
export const HR = /^[\s\u3000]*([—–-]{3,}|[-*_]{3,})[\s\u3000]*$/;
export const OL = /^(\d{1,2})[.、)]\s*(.+)$/;
export const UL = /^[·•]\s*(.+)$/;
export const H2 = /^((Part|Volume|Chapter)\s*\d+.*|第[一二三四五六七八九十百零〇\d]+[章节篇回].*|（[一二三四五六七八九十]+）.*)$/i;
export const SECTION = /^[0-9]{1,3}\s*[.、]?$/;
export const META = /^([^：:]{1,14})[：:]\s*(.*)$/;
export const META_KEY = /^(summary|配对|cp|chapter|volume|出场|预警|设定|注意|tags?|warning)$/i;
export const MD_H = /^(#{1,6})\s+(.*)$/;
export const MD_Q = /^>\s?(.*)$/;

export const isHr = (s) => HR.test(s);

export function clean(s) {
  return String(s)
    .replace(/^[\s\u3000]+/, '')
    .replace(/[\s\u3000]+$/, '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\s\u3000]{2,}/g, ' ');
}

export const countCjk = (s) => (String(s).match(CJK) || []).length;

/** 阅读时长：每分钟 400 字（与第 6 轮保持一致，不要在这里改口径）。 */
export const readingMinutes = (cjk) => Math.max(1, Math.round(cjk / 400));

/**
 * 行 → blocks。源文档是 Word/PDF 导出的纯文本时**每个非空行就是一个自然段**，
 * 因此这里不做跨行合并（合并由 parseBody 在"有空行"的情况下才做）。
 */
export function toBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const s = clean(lines[i]);
    if (!s) {
      i++;
      continue;
    }
    if (HR.test(s)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    const mh = s.match(MD_H);
    if (mh) {
      blocks.push({ t: mh[1].length <= 1 ? 'h2' : 'h3', x: clean(mh[2]) });
      i++;
      continue;
    }
    if (MD_Q.test(s)) {
      const buf = [];
      while (i < lines.length) {
        const m = clean(lines[i]).match(MD_Q);
        if (!m) break;
        buf.push(m[1].replace(/[\s\u3000]{2,}$/, ''));
        i++;
      }
      blocks.push({ t: 'quote', x: buf.join('\n') });
      continue;
    }
    if (SECTION.test(s)) {
      blocks.push({ t: 'h3', x: s.replace(/[.、]\s*$/, '') });
      i++;
      continue;
    }
    const ol = s.match(OL);
    if (ol) {
      const items = [];
      while (i < lines.length) {
        const m = clean(lines[i]).match(OL);
        if (!m) break;
        items.push(m[2].trim());
        i++;
      }
      blocks.push({ t: 'ol', items });
      continue;
    }
    const ul = s.match(UL);
    if (ul) {
      const items = [];
      while (i < lines.length) {
        const m = clean(lines[i]).match(UL);
        if (!m) break;
        items.push(m[1].trim());
        i++;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (H2.test(s) && s.length <= 40) {
      blocks.push({ t: 'h2', x: s });
      i++;
      continue;
    }
    const meta = s.match(META);
    if (meta && meta[1].length <= 14 && META_KEY.test(meta[1].trim())) {
      blocks.push({ t: 'meta', k: meta[1].trim(), v: meta[2].trim() });
      i++;
      continue;
    }
    if (/^[*＊]/.test(s)) {
      blocks.push({ t: 'note', x: s.replace(/^[*＊]\s*/, '') });
      i++;
      continue;
    }
    blocks.push({ t: 'p', x: s });
    i++;
  }
  return blocks;
}

/** 去掉文稿开头的 YAML front matter（`---` 包裹块）。 */
export function stripFrontMatter(raw) {
  return String(raw).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

/** 取正文的非空行数组（已清洗、已去空行、已去 front matter）。 */
export function bodyLines(raw) {
  return stripFrontMatter(raw)
    .split('\n')
    .map(clean)
    .filter((s) => s.length > 0);
}

/** 中英混排的软换行合并：两侧都是 ASCII 字母/数字时补一个空格，否则直接接上。 */
export function softJoin(a, b) {
  if (!a) return b;
  if (!b) return a;
  const l = a.slice(-1);
  const r = b.slice(0, 1);
  const ascii = /[A-Za-z0-9]/;
  return ascii.test(l) && ascii.test(r) ? a + ' ' + b : a + b;
}

/**
 * 粘贴的纯文本 → blocks。
 * mode: 'auto' | 'blank' | 'line'
 * 返回 { blocks, mode }（mode 是实际采用的那种，界面上要显示出来）
 */
export function parseBody(text, mode = 'auto') {
  const raw = stripFrontMatter(text).replace(/\r\n?/g, '\n');
  const hasBlank = /\n[ \u3000]*\n/.test(raw);
  const use = mode === 'auto' ? (hasBlank ? 'blank' : 'line') : mode;

  if (use === 'line') {
    return { blocks: toBlocks(raw.split('\n')), mode: use };
  }

  /* 空行分段：把连续非空行合成一段，但**结构性行不合并**
     （小标题、引用、列表、分隔线、元信息行各自成块，否则会被粘进段落里） */
  const lines = raw.split('\n');
  const chunks = [];
  let buf = [];
  const flush = () => {
    if (buf.length) chunks.push(buf.join('\n'));
    buf = [];
  };
  for (const line of lines) {
    const s = clean(line);
    if (!s) {
      flush();
      continue;
    }
    const structural =
      HR.test(s) || MD_H.test(s) || MD_Q.test(s) || SECTION.test(s) || OL.test(s) || UL.test(s) ||
      /^[*＊]/.test(s) || (META.test(s) && META_KEY.test((s.match(META) || [])[1] || ''));
    if (structural) {
      flush();
      chunks.push(s);
      continue;
    }
    buf.push(s);
  }
  flush();

  const merged = chunks.map((c) => {
    if (!c.includes('\n')) return c;
    return c.split('\n').reduce((a, b) => softJoin(a, b), '');
  });
  return { blocks: toBlocks(merged), mode: use };
}

/** blocks 里"正文"的字数（不含前言/元信息，与第 6 轮口径一致）。 */
export function countBodyCjk(blocks) {
  return countCjk(
    blocks
      .filter((b) => b.t === 'p' || b.t === 'h2' || b.t === 'quote')
      .map((b) => b.x)
      .join('\n')
  );
}

/** 摘要：优先 head 里的 `summary：`，否则取第一段前 110 字。 */
export function deriveSummary(head, blocks) {
  const sm = (head || []).find((b) => b.t === 'meta' && /^summary$/i.test(b.k));
  if (sm && sm.v) return sm.v;
  const firstP = (blocks || []).find((b) => b.t === 'p');
  if (!firstP) return '';
  return firstP.x.slice(0, 110) + (firstP.x.length > 110 ? '…' : '');
}

/**
 * 组装一条 posts 记录。字段顺序与 _src/posts.json 里既有的条目保持一致，
 * 这样管理台发布后的 diff 只包含真正改动的行。
 */
export function makePost(meta, blocks, head, opts = {}) {
  const cjk = countBodyCjk(blocks);
  return {
    slug: meta.slug,
    title: meta.title,
    shortTitle: meta.shortTitle || meta.title,
    subtitle: meta.subtitle || '',
    category: meta.category || '杂文',
    series: meta.series || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    date: meta.date,
    cover: meta.cover,
    coverAlt: meta.coverAlt || '',
    headLabel: meta.headLabel || '',
    summary: meta.summary || deriveSummary(head, blocks),
    cjk,
    readingMinutes: readingMinutes(cjk),
    url: `posts/${meta.slug}.html`,
    sourceFile: meta.sourceFile || '',
    head: head || [],
    blocks,
  };
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
