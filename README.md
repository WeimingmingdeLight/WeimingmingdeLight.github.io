# Aphelion

个人博客：<https://weimingmingdelight.github.io/>

放同人小说、设定和练笔的地方。整站为纯 HTML / CSS / JavaScript 手写，没有框架、没有构建步骤，直接托管在 GitHub Pages 上。

## 页面

| 路径 | 说明 |
| --- | --- |
| `index.html` | 首页：Hero、简介、最新文章、作品集入口 |
| `blog.html` | 文章列表：分类 / 标签 / 关键词筛选 |
| `posts/*.html` | 文章详情页（含阅读进度、上下篇导航） |
| `portfolio.html` | 作品集：文字作品 + 图库（带灯箱） |
| `contact.html` | 关于 / 联系方式 |
| `guestbook.html` | 留言板 |
| `404.html` | 找不到页面时的提示页 |
| `assets/` | 样式、脚本、图片与文章索引数据 |

## 说明

- 亮 / 暗色主题切换、站内搜索（`Ctrl` / `⌘` + `K`）、平滑滚动、滚动入场动画、响应式布局，全部手写实现，不依赖任何前端库。
- 唯一的外部依赖是留言板使用的开源组件 [giscus](https://github.com/giscus/giscus)，只有 `guestbook.html` 会去请求 `giscus.app`；评论以 Discussions 的形式保存在本仓库，不经过第三方评论服务。
- 本站不做统计、不投放广告、不加载任何字体文件。

## 版权

站内同人作品为非商业性二次创作，相关角色与世界观版权归原作者所有。文章列表中的日期为整理归档顺序，不代表创作日期。
