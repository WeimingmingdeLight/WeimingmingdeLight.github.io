/* Aphelion — 文章列表页：分类 / 标签 / 关键词筛选 + 前端分页 */
(function () {
  'use strict';

  var list = document.getElementById('post-list');
  if (!list) return;

  var cards = Array.prototype.slice.call(list.querySelectorAll('.post-card'));
  var empty = document.getElementById('post-empty');
  var pager = document.getElementById('post-pagination');
  var qInput = document.querySelector('[data-filter-q]');
  var catBtns = Array.prototype.slice.call(document.querySelectorAll('[data-filter-cat]'));
  var tagBtns = Array.prototype.slice.call(document.querySelectorAll('[data-filter-tag]'));
  var PER_PAGE = 6;

  var state = { cat: 'all', tag: 'all', q: '', page: 1 };

  function readQuery() {
    var p = new URLSearchParams(location.search);
    state.cat = p.get('cat') || 'all';
    state.tag = p.get('tag') || 'all';
    state.q = p.get('q') || '';
    state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
    if (qInput) qInput.value = state.q;
  }

  function writeQuery() {
    if (!history.replaceState) return;
    var p = new URLSearchParams();
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.tag !== 'all') p.set('tag', state.tag);
    if (state.q) p.set('q', state.q);
    if (state.page > 1) p.set('page', String(state.page));
    var qs = p.toString();
    try {
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    } catch (e) {
      /* 直接以 file:// 打开时浏览器会抛 SecurityError；筛选功能本身不受影响 */
    }
  }

  function matches(card) {
    if (state.cat !== 'all' && card.getAttribute('data-cat') !== state.cat) return false;
    if (state.tag !== 'all') {
      var tags = (card.getAttribute('data-tags') || '').split(',');
      if (tags.indexOf(state.tag) === -1) return false;
    }
    if (state.q) {
      var hay = card.getAttribute('data-search') || '';
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function syncButtons(btns, attr, value) {
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute(attr) === value);
    }
  }

  function renderPager(pages) {
    if (!pager) return;
    if (pages <= 1) {
      pager.innerHTML = '';
      return;
    }
    var html =
      '<button class="pagination__item" type="button" data-page="' +
      (state.page - 1) +
      '"' +
      (state.page === 1 ? ' aria-disabled="true" disabled' : '') +
      ' aria-label="上一页">上一页</button>';
    for (var i = 1; i <= pages; i++) {
      html +=
        '<button class="pagination__item" type="button" data-page="' +
        i +
        '"' +
        (i === state.page ? ' aria-current="true"' : '') +
        '>' +
        i +
        '</button>';
    }
    html +=
      '<button class="pagination__item" type="button" data-page="' +
      (state.page + 1) +
      '"' +
      (state.page === pages ? ' aria-disabled="true" disabled' : '') +
      ' aria-label="下一页">下一页</button>';
    pager.innerHTML = html;
  }

  function render() {
    var hits = cards.filter(matches);
    var pages = Math.max(1, Math.ceil(hits.length / PER_PAGE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PER_PAGE;

    for (var i = 0; i < cards.length; i++) cards[i].hidden = true;
    for (var j = start; j < Math.min(start + PER_PAGE, hits.length); j++) hits[j].hidden = false;

    if (empty) empty.hidden = hits.length > 0;
    renderPager(pages);
    syncButtons(catBtns, 'data-filter-cat', state.cat);
    syncButtons(tagBtns, 'data-filter-tag', state.tag);
    if (pager) pager.hidden = pages <= 1;
    writeQuery();
  }

  /* --- 事件 --- */
  catBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      state.cat = b.getAttribute('data-filter-cat');
      state.page = 1;
      render();
    });
  });

  tagBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      state.tag = b.getAttribute('data-filter-tag');
      state.page = 1;
      render();
    });
  });

  var qTimer = null;
  if (qInput) {
    qInput.addEventListener('input', function () {
      if (qTimer) window.clearTimeout(qTimer);
      qTimer = window.setTimeout(function () {
        state.q = qInput.value.trim();
        state.page = 1;
        render();
      }, 160);
    });
  }

  if (pager) {
    pager.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-page]') : null;
      if (!btn || btn.disabled) return;
      state.page = parseInt(btn.getAttribute('data-page'), 10) || 1;
      render();
      var top = list.getBoundingClientRect().top + window.pageYOffset - 96;
      var reduce =
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  readQuery();
  // URL 里的分类 / 标签可能已不存在，回落为「全部」
  if (state.cat !== 'all' && !catBtns.some(function (b) { return b.getAttribute('data-filter-cat') === state.cat; })) {
    state.cat = 'all';
  }
  if (state.tag !== 'all' && !tagBtns.some(function (b) { return b.getAttribute('data-filter-tag') === state.tag; })) {
    state.tag = 'all';
  }
  render();
})();
