/* Aphelion — 留言板评论接入（giscus → 仓库 Discussions）
   ────────────────────────────────────────────────────────────────────────
   为什么不把 giscus 的 <script> 直接写死在 HTML 里：
     1. client.js 会把脚本标签上的 data-theme 当作初始主题。写死的话，
        「系统暗色 + 首屏内联脚本已生效」这种情况会先渲染成亮色，再由下面
        的逻辑改回来，看起来就是闪一下。运行时插入就能一次给对。
     2. 需要按当前协议决定是否挂载（见下）。
     3. 需要在主题切换时通知 iframe 换肤。

   为什么要有「失败可视化」：
     giscus 自己只在控制台里 console.error，页面上什么都不显示。如果
     Discussions 被关掉、App 没装、或者 giscus.app 被网络挡住，访客看到的
     就是一块空白，完全不知道发生了什么。这里把 postMessage 传来的错误显示
     出来，并给出邮件兜底。

   file:// 预览：giscus 的登录回调需要 https，双击打开本地文件时无法留言。
   这种情况直接给出提示，不挂载。 */
(function () {
  'use strict';

  var box = document.querySelector('.giscus');
  if (!box) return;

  var status = document.getElementById('giscus-status');
  var GISCUS = 'https://giscus.app';
  var MAIL = box.getAttribute('data-mailto') || '';
  var failed = false;

  function theme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* 用 DOM API 而不是 innerHTML —— error 字段是远端来的字符串，
     虽然来自 giscus 官方域名，也没有理由把它当 HTML 解析。 */
  function show(title, detail, hint) {
    if (!status) return;
    status.textContent = '';
    status.className = 'giscus-status giscus-status--notice';
    status.hidden = false;

    var h = document.createElement('p');
    h.className = 'giscus-status__title';
    h.textContent = title;
    status.appendChild(h);

    if (detail) {
      var d = document.createElement('p');
      d.className = 'giscus-status__detail';
      d.textContent = detail;
      status.appendChild(d);
    }

    var f = document.createElement('p');
    f.className = 'giscus-status__fallback';
    if (MAIL) {
      f.appendChild(document.createTextNode('不想折腾的话，直接发邮件给我：'));
      var a = document.createElement('a');
      a.className = 'link';
      a.href = 'mailto:' + MAIL;
      a.textContent = MAIL;
      f.appendChild(a);
    } else {
      f.appendChild(document.createTextNode('可以先通过联系方式页找我。'));
    }
    status.appendChild(f);

    if (hint) {
      var t = document.createElement('p');
      t.className = 'giscus-status__hint';
      t.textContent = hint;
      status.appendChild(t);
    }
  }

  function fail(detail) {
    failed = true;
    show(
      '评论没能加载出来',
      detail ? 'giscus 返回：' + detail : '没有收到 giscus 的响应，可能是网络无法访问 giscus.app。',
      '刷新页面可以重试；也可以直接发邮件，我会看到。'
    );
  }

  function ready() {
    if (failed || !status) return;
    status.hidden = true;
  }

  /* giscus 把「还没人留言」也放在 error 字段里返回：首次打开留言板、讨论串尚未
     创建时就会收到 "Discussion not found"。这不是故障 —— 访客登录后发第一条
     评论时 giscus 会自动建好讨论串。按报错处理会吓到人，所以这里只当作正常状态。
     出处：giscus client.js 自己对这条消息走的是 console.warn 分支。 */
  var BENIGN = ['Discussion not found'];

  /* giscus 的报错是通过 postMessage 发给父页面的，必须先挂监听再插入脚本，
     否则极快返回的错误会漏掉。 */
  window.addEventListener('message', function (ev) {
    if (ev.origin !== GISCUS) return;
    var data = ev.data;
    if (!data || typeof data !== 'object' || !data.giscus) return;
    var err = data.giscus.error;
    if (!err) return;
    if (BENIGN.some(function (s) { return String(err).indexOf(s) !== -1; })) return;
    fail(String(err));
  });

  /* 主题切换：通知 iframe 换肤，不重新加载，已输入的评论不会丢。 */
  document.addEventListener('aphelion:theme', function () {
    var frame = document.querySelector('iframe.giscus-frame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ giscus: { setConfig: { theme: theme() } } }, GISCUS);
  });

  function bindFrame(frame) {
    if (frame.getAttribute('data-bound')) return;
    frame.setAttribute('data-bound', '1');
    frame.addEventListener('load', ready);
    if (!frame.classList.contains('giscus-frame--loading')) ready();
  }

  function watchFrame() {
    var frame = document.querySelector('iframe.giscus-frame');
    if (frame) {
      bindFrame(frame);
      return true;
    }
    return false;
  }

  function mount() {
    var script = document.createElement('script');
    script.src = GISCUS + '/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    var attrs = {
      repo: box.getAttribute('data-repo'),
      'repo-id': box.getAttribute('data-repo-id'),
      category: box.getAttribute('data-category'),
      'category-id': box.getAttribute('data-category-id'),
      mapping: box.getAttribute('data-mapping'),
      term: box.getAttribute('data-term'),
      strict: box.getAttribute('data-strict'),
      'reactions-enabled': box.getAttribute('data-reactions-enabled'),
      'emit-metadata': box.getAttribute('data-emit-metadata'),
      'input-position': box.getAttribute('data-input-position'),
      lang: box.getAttribute('data-lang'),
      loading: box.getAttribute('data-loading'),
      theme: theme(),
    };
    Object.keys(attrs).forEach(function (k) {
      if (attrs[k]) script.setAttribute('data-' + k, attrs[k]);
    });

    /* client.js 会把 .giscus 容器清空后放入 iframe，所以脚本标签也放进去 ——
       它执行完就被清掉，不留残余。 */
    box.appendChild(script);

    if (watchFrame()) return;

    var mo = new MutationObserver(function () {
      if (watchFrame()) mo.disconnect();
    });
    mo.observe(box, { childList: true, subtree: true });

    /* client.js 若根本没取到（域名被墙、被拦截），永远不会有 iframe。 */
    setTimeout(function () {
      mo.disconnect();
      if (!failed && !document.querySelector('iframe.giscus-frame')) {
        failed = true;
        show(
          '评论没能加载出来',
          '没能从 giscus.app 取到评论组件，可能是网络无法访问该域名，或浏览器扩展把它拦住了。',
          '刷新页面可以重试；也可以直接发邮件，我会看到。'
        );
      }
    }, 10000);
  }

  if (location.protocol === 'file:') {
    show(
      '本地预览模式下评论不可用',
      '留言板依赖 giscus（GitHub Discussions），需要 https 回调，双击打开本地文件时无法登录。',
      '用 http 服务打开本站，或直接访问线上站点即可正常留言。'
    );
    return;
  }

  mount();
})();
