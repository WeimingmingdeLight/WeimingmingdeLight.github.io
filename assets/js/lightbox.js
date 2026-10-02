/* Aphelion — 图片灯箱
   用法：给可点击的图片容器加 data-lightbox="图片地址"，可选 data-caption="说明"。 */
(function () {
  'use strict';

  var box = document.getElementById('lightbox');
  if (!box) return;

  var img = box.querySelector('[data-lightbox-img]');
  var caption = box.querySelector('[data-lightbox-caption]');
  var triggers = Array.prototype.slice.call(
    document.querySelectorAll('[data-lightbox]')
  );
  if (!triggers.length) return;

  var items = triggers.map(function (el) {
    return {
      src: el.getAttribute('data-lightbox'),
      caption: el.getAttribute('data-caption') || '',
    };
  });

  var current = 0;
  var lastFocused = null;

  function show(n) {
    if (n < 0) n = items.length - 1;
    if (n >= items.length) n = 0;
    current = n;
    var it = items[n];
    img.setAttribute('src', it.src);
    img.setAttribute('alt', it.caption || '放大查看的图片');
    caption.textContent = it.caption;
    caption.style.display = it.caption ? 'block' : 'none';
  }

  function open(n) {
    lastFocused = document.activeElement;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    show(n);
    var closeBtn = box.querySelector('.lightbox__close');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    img.setAttribute('src', '');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  for (var i = 0; i < triggers.length; i++) {
    (function (idx) {
      triggers[idx].addEventListener('click', function (ev) {
        ev.preventDefault();
        open(idx);
      });
    })(i);
  }

  box.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('[data-lightbox-close]')) {
      close();
      return;
    }
    if (ev.target.closest && ev.target.closest('[data-lightbox-next]')) {
      show(current + 1);
      return;
    }
    if (ev.target.closest && ev.target.closest('[data-lightbox-prev]')) {
      show(current - 1);
      return;
    }
    // 点击空白背景关闭
    if (ev.target === box || (ev.target.classList && ev.target.classList.contains('lightbox__stage'))) {
      close();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (!box.classList.contains('is-open')) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      show(current + 1);
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      show(current - 1);
    }
  });

  // 触屏左右滑动
  var startX = null;
  box.addEventListener(
    'touchstart',
    function (ev) {
      startX = ev.touches[0].clientX;
    },
    { passive: true }
  );
  box.addEventListener(
    'touchend',
    function (ev) {
      if (startX === null) return;
      var dx = ev.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      startX = null;
    },
    { passive: true }
  );
})();
