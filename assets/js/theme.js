/* Aphelion — 亮暗色主题切换
   初始主题在 <head> 的内联脚本里已应用（避免首屏闪烁）；
   这里只负责：点击切换、持久化、未设偏好时跟随系统。 */
(function () {
  'use strict';

  var KEY = 'aphelion-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function readStored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function writeStored(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* 隐私模式下忽略 */
    }
  }

  function isDark() {
    return root.getAttribute('data-theme') === 'dark';
  }

  function render(theme) {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      btns[i].setAttribute(
        'aria-label',
        theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'
      );
      btns[i].setAttribute('title', theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141821' : '#2f4154');
    // 广播给需要跟随主题的组件（目前是留言板的 giscus iframe）
    document.dispatchEvent(new CustomEvent('aphelion:theme', { detail: { theme: theme } }));
  }

  function current() {
    return isDark() ? 'dark' : 'light';
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-theme-toggle]') : null;
    if (!btn) return;
    ev.preventDefault();
    var next = isDark() ? 'light' : 'dark';
    writeStored(next);
    render(next);
  });

  // 用户没手动设过偏好时，跟随系统变化
  if (mq) {
    var onChange = function (e) {
      if (readStored()) return;
      render(e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  render(current());
})();
