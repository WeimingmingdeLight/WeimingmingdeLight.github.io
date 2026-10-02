/* Aphelion — 杂项交互：复制、提示条、回到顶部、阅读进度、页脚年份 */
(function () {
  'use strict';

  /* --- 页脚年份 --- */
  var years = document.querySelectorAll('[data-year]');
  for (var i = 0; i < years.length; i++) {
    years[i].textContent = String(new Date().getFullYear());
  }

  /* --- 轻提示 --- */
  var toast = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-show');
    }, 2000);
  }

  /* --- 复制到剪贴板 --- */
  var copyBtns = document.querySelectorAll('[data-copy]');
  for (var c = 0; c < copyBtns.length; c++) {
    copyBtns[c].addEventListener('click', function (ev) {
      ev.preventDefault();
      var btn = ev.currentTarget;
      var text = btn.getAttribute('data-copy');
      var done = function () {
        var label = btn.querySelector('[data-copy-label]');
        var original = label ? label.textContent : '';
        btn.classList.add('is-done');
        if (label) label.textContent = '已复制';
        showToast('已复制到剪贴板');
        window.setTimeout(function () {
          btn.classList.remove('is-done');
          if (label) label.textContent = original;
        }, 1800);
      };
      var fallback = function () {
        // 老浏览器 / 非安全上下文：选中文本让用户手动复制
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
        document.body.removeChild(ta);
        if (ok) done();
        else showToast('复制失败，请手动选择：' + text);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
  }

  /* --- 回到顶部 --- */
  var toTop = document.querySelector('[data-to-top]');
  if (toTop) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.pageYOffset || document.documentElement.scrollTop;
        toTop.classList.toggle('is-show', y > 480);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', function (ev) {
      ev.preventDefault();
      var reduce =
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* --- 文章阅读进度条 --- */
  var bar = document.querySelector('[data-read-progress]');
  var article = document.querySelector('[data-article]');
  if (bar && article) {
    var raf = false;
    var update = function () {
      if (raf) return;
      raf = true;
      window.requestAnimationFrame(function () {
        var rect = article.getBoundingClientRect();
        var start = rect.top + (window.pageYOffset || 0);
        var total = article.offsetHeight - window.innerHeight * 0.4;
        var seen = (window.pageYOffset || 0) - start + window.innerHeight * 0.4;
        var pct = total > 0 ? Math.min(100, Math.max(0, (seen / total) * 100)) : 0;
        bar.style.width = pct + '%';
        raf = false;
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* --- 锚点平滑滚动（补偿吸顶导航高度，CSS scroll-padding 不支持时兜底） --- */
  document.addEventListener('click', function (ev) {
    var link = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!link) return;
    var hash = link.getAttribute('href');
    if (!hash || hash === '#') return;
    var target = document.querySelector(hash);
    if (!target) return;
    ev.preventDefault();
    var navH =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--nav-h'),
        10
      ) || 64;
    var top = target.getBoundingClientRect().top + window.pageYOffset - navH - 12;
    var reduce =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    try {
      if (history.replaceState) history.replaceState(null, '', hash);
    } catch (e) {
      /* 直接以 file:// 打开时浏览器会抛 SecurityError；滚动本身已完成 */
    }
  });
})();
