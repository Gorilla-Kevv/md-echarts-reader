# md-echarts-reader · Markdown + ECharts 阅读器

一个**单文件**的通用 Markdown 阅读器。打开任意 `.md` 文件，自动把 `echarts` 语言围栏代码块渲染成**交互式图表**（折线 / 柱状 / 饼图 / …），并支持一键导出 **PDF、PNG 长图、Word**。

A single-file, zero-build Markdown reader that turns `echarts` fenced code blocks into interactive charts (powered by Apache ECharts) and exports the rendered page to PDF / PNG / Word.

## ✨ 功能特性

- **纯从 .md 读取**：阅读器本身不内嵌内容，任何 Markdown 文档通用
- **ECharts 图表**：自动识别 `echarts` 代码块，把其中的 option JSON 交给 ECharts 渲染
- **标准 Markdown**：标题、表格、列表、引用、加粗、代码块等（GFM，基于 marked）
- **自动目录**：左侧 TOC + 滚动高亮，移动端折叠为抽屉
- **三种载入方式**：文件选择、拖拽、`?file=xxx.md` 参数
- **一键导出**：PDF（含图表、A4 自动分页）、PNG 长图、Word（.doc，图表内嵌为图片）
- **响应式**：桌面 / 平板 / 手机自适应，图表随窗口缩放

## 🚀 快速开始

1. 下载 `Markdown阅读器.html`
2. 用 Chrome / Edge 双击打开
3. 点击「打开 .md 文件」，或把 `.md` 拖到窗口任意位置
4. 右上角「导出」选择 PDF / 图片 / Word

> ⚠️ **需联网**：`marked`、`ECharts`、`html2canvas`、`jsPDF` 均通过 jsDelivr CDN 加载。离线时正文可阅读，图表渲染与导出功能不可用。

## 🧩 VS Code 扩展

`vscode-extension/` 是一个 VS Code 插件，把同样的渲染能力带进编辑器，对齐 markdown-preview-enhanced 的「自定义编辑器」形态：

- **自定义编辑器**：右键 `.md` → 打开方式 → 「Markdown + ECharts 预览」；或命令 / 快捷键 `Ctrl+Alt+M` 打开侧边预览
- **实时预览**：边编辑边刷新（防抖 150ms），切换文件自动跟随
- **图表与公式**：`echarts` 图表、KaTeX 公式（`$...$` / `$$...$$`）、Mermaid 图、SVG 图片
- **滚动同步**：源编辑器与预览双向联动
- **导出**：PDF / PNG / HTML / Word
- **离线可用**：依赖已内置到 `media/`

安装：VS Code → 扩展 → 从 VSIX 安装，或用 VS Code 打开 `vscode-extension/` 按 F5 调试。详见 [`vscode-extension/README.md`](./vscode-extension/README.md)。

预打包的 `.vsix` 见 [Releases](https://github.com/Gorilla-Kevv/md-echarts-reader/releases)；CI（`.github/workflows/package.yml`）会在每次 push 到 main 时自动打包并上传 artifact，打 `v*` 标签时自动发布 Release。

## 📦 单文件「快速查看」版

想**双击一个文件就直接打开某篇文档**（无需选文件、无需命令行），把 Markdown 原文内嵌进阅读器即可：复制 `Markdown阅读器.html`，在主脚本之前加入

```html
<script type="text/markdown" id="md-source" data-title="文档标题" data-sub="副标题">
…此处粘贴 Markdown 原文（图片请用 data: URI 或相对路径）…
</script>
```

打开后会自动渲染该内容，且仍支持右上角导出。

## 📝 在 Markdown 中写图表

在 `.md` 里写一个 `echarts` 语言的围栏代码块，内容为 [ECharts option](https://echarts.apache.org/zh/option.html) JSON：

````markdown
```echarts
{
  "xAxis": { "type": "category", "data": ["一", "二", "三", "四"] },
  "yAxis": { "type": "value" },
  "series": [
    { "name": "示例", "type": "bar", "data": [5, 20, 36, 10] }
  ]
}
```
````

阅读器会把这段替换成一个可交互的柱状图。更多示例见 [`demo.md`](./demo.md)。

## 📤 导出说明

| 格式 | 实现 | 说明 |
|------|------|------|
| PDF | html2canvas + jsPDF | A4 竖版自动分页，图表转高清图后合成 |
| PNG | html2canvas | 整页长图，`scale: 2` 高清 |
| Word | HTML → .doc | 图表内嵌 base64 图片，Word / WPS 可打开 |

导出时会把每个 ECharts 图表用 `chart.getDataURL()` 转成图片后再生成，避免截图失真，导出完成后自动恢复交互图表。

> ⚠️ 若文档引用了**远程图片**且该服务器未开放 CORS，浏览器会判定画布被「污染」而拒绝导出。此时请改用本地服务器（`python -m http.server`）访问，或使用支持跨域的图床。

## 🌐 通过本地服务器使用 `?file=`

双击打开（`file://` 协议）时浏览器禁止本地 `fetch`，因此 `?file=` 参数需要在 HTTP 环境下使用：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000/Markdown阅读器.html?file=demo.md
```

## 📁 文件结构

```
.
├── Markdown阅读器.html   # 阅读器本体（单文件）
├── demo.md               # 演示文档（含多种 ECharts 图表）
├── vscode-extension/     # VS Code 扩展（自定义编辑器 + 实时预览 + 导出）
├── LICENSE
└── README.md
```

## 🧰 依赖

- [marked](https://github.com/markedjs/marked) — Markdown 解析
- [Apache ECharts](https://echarts.apache.org/) — 图表渲染
- [KaTeX](https://katex.org/) — 公式渲染（仅 VS Code 扩展）
- [Mermaid](https://mermaid.js.org/) — 图表渲染（仅 VS Code 扩展）
- [html2canvas](https://html2canvas.hertzen.com/) — 页面截图
- [jsPDF](https://github.com/parallax/jsPDF) — 生成 PDF

网页版均为 CDN 引入，无需构建；VS Code 扩展已把依赖内置到 `vscode-extension/media/`，离线可用。

## 📄 License

[MIT](./LICENSE)
