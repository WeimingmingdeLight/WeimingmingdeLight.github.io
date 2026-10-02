/* Aphelion — 滚动进入动画
   原则：内容永远不能因为 JS 而永久不可见。
   · 无 IntersectionObserver / 用户要求减少动效 → 直接全部显示
   · 3 秒兜底定时器：仍未进入视口的元素也强制显示 */
(function () {
  'use strict';

  var els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  function showAll() {
    for (var i = 0; i < els.length; i++) els[i].classList.add('is-visible');
  }

  var reduce =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('is-visible');
          io.unobserve(entries[i].target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
  );

  for (var i = 0; i < els.length; i++) io.observe(els[i]);

  window.setTimeout(function () {
    for (var j = 0; j < els.length; j++) {
      if (!els[j].classList.contains('is-visible')) els[j].classList.add('is-visible');
    }
  }, 3000);
})();
