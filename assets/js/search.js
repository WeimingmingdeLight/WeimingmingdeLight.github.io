/* Aphelion — 站内搜索
   索引来自 assets/data/posts.js 里的 window.APHELION_POSTS。
   匹配范围：标题、短标题、摘要、标签、分类、系列。 */
(function () {
  'use strict';

  var modal = document.getElementById('search-modal');
  if (!modal) return;

  var input = modal.querySelector('[data-search-input]');
  var results = modal.querySelector('[data-search-results]');
  var openers = document.querySelectorAll('[data-search-open]');
  var posts = window.APHELION_POSTS || [];
  var activeIndex = -1;
  var lastFocused = null;

  /* --- 建立索引 --- */
  var index = posts.map(function (p) {
    return {
      post: p,
      title: String(p.title || ''),
      short: String(p.shortTitle || ''),
      summary: String(p.summary || ''),
      category: String(p.category || ''),
      series: String(p.series || ''),
      tags: (p.tags || []).join(' '),
      haystack: [
        p.title,
        p.shortTitle,
        p.summary,
        p.category,
        p.series,
        (p.tags || []).join(' '),
      ]
        .join(' ')
        .toLowerCase(),
    };
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function highlight(text, q) {
    var safe = escapeHtml(text);
    if (!q) return safe;
    var lower = safe.toLowerCase();
    var needle = q.toLowerCase();
    var out = '';
    var from = 0;
    var at = lower.indexOf(needle, from);
    while (at !== -1 && needle) {
      out += safe.slice(from, at) + '<mark>' + safe.slice(at, at + needle.length) + '</mark>';
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    out += safe.slice(from);
    return out;
  }

  function search(q) {
    var needle = q.trim().toLowerCase();
    if (!needle) return index.slice();
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      if (index[i].haystack.indexOf(needle) !== -1) hits.push(index[i]);
    }
    return hits;
  }

  function render(q) {
    var hits = search(q);
    activeIndex = hits.length ? 0 : -1;

    if (!hits.length) {
      results.innerHTML =
        '<p class="search__hint">没有匹配「' +
        escapeHtml(q) +
        '」的内容。<br>试试更短的关键词，或只输入一个字。</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < hits.length; i++) {
      var it = hits[i];
      var p = it.post;
      html +=
        '<a class="search__item' +
        (i === 0 ? ' is-active' : '') +
        '" href="' +
        escapeHtml(p.url) +
        '" data-index="' +
        i +
        '">' +
        '<span class="search__item-title">' +
        highlight(it.title, q) +
        '</span>' +
        '<span class="search__item-meta">' +
        '<span>' +
        escapeHtml(p.category) +
        '</span>' +
        (p.date ? '<span>' + escapeHtml(p.date) + '</span>' : '') +
        (p.cjk ? '<span>' + escapeHtml(String(p.cjk)) + ' 字</span>' : '') +
        '</span>' +
        (it.summary
          ? '<span class="search__item-meta" style="margin-top:4px;display:block">' +
            highlight(it.summary.slice(0, 60), q) +
            '</span>'
          : '') +
        '</a>';
    }
    results.innerHTML = html;
  }

  function setActive(n) {
    var items = results.querySelectorAll('.search__item');
    if (!items.length) return;
    if (n < 0) n = items.length - 1;
    if (n >= items.length) n = 0;
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('is-active', i === n);
    activeIndex = n;
    var el = items[n];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    lastFocused = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    input.value = '';
    render('');
    window.setTimeout(function () {
      input.focus();
    }, 20);
  }

  function close() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* --- 事件绑定 --- */
  for (var i = 0; i < openers.length; i++) {
    openers[i].addEventListener('click', function (ev) {
      ev.preventDefault();
      open();
    });
  }

  modal.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('[data-search-close]')) close();
    if (ev.target.classList && ev.target.classList.contains('modal__backdrop')) close();
  });

  input.addEventListener('input', function () {
    render(input.value);
  });

  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive(activeIndex + 1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive(activeIndex - 1);
    } else if (ev.key === 'Enter') {
      var items = results.querySelectorAll('.search__item');
      if (items.length) {
        ev.preventDefault();
        var target = items[activeIndex < 0 ? 0 : activeIndex];
        if (target) location.href = target.getAttribute('href');
      }
    }
  });

  document.addEventListener('keydown', function (ev) {
    var isOpen = modal.classList.contains('is-open');
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      if (isOpen) close();
      else open();
      return;
    }
    if (!isOpen) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    }
  });

  render('');
})();
