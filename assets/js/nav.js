/* Aphelion — 吸顶导航：滚动变色、移动端菜单、当前页高亮 */
(function () {
  'use strict';

  var nav = document.querySelector('.nav');
  if (!nav) return;

  var burger = nav.querySelector('[data-nav-burger]');
  var list = nav.querySelector('.nav__list');

  /* --- 滚动状态 --- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      nav.classList.toggle('is-scrolled', y > 24);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --- 移动端菜单 --- */
  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    if (burger) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    }
  }

  if (burger) {
    burger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setOpen(!nav.classList.contains('is-open'));
    });
  }

  // 点击菜单内链接后收起
  if (list) {
    list.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) setOpen(false);
    });
  }

  // 点击空白处 / 按 Esc 收起
  document.addEventListener('click', function (ev) {
    if (!nav.classList.contains('is-open')) return;
    if (!nav.contains(ev.target)) setOpen(false);
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      if (burger) burger.focus();
    }
  });

  // 视口变宽到桌面尺寸时复位
  if (window.matchMedia) {
    var wide = window.matchMedia('(min-width: 768px)');
    var onWide = function (e) {
      if (e.matches) setOpen(false);
    };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* --- 当前页高亮 --- */
  var here = location.pathname.replace(/index\.html$/, '');
  var links = nav.querySelectorAll('.nav__link');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || '';
    var target = href.replace(/^\.\//, '').replace(/index\.html$/, '');
    if (!target || target === '#') continue;
    // 详情页归到「文章」一级
    var isPost = /\/posts\//.test(location.pathname);
    var match =
      target === here ||
      (isPost && /blog\.html$/.test(target)) ||
      (here === '' && target === '');
    if (match) links[i].setAttribute('aria-current', 'page');
  }
})();
