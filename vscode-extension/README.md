# Markdown + ECharts Preview

一个 VS Code 扩展：在编辑器侧边**实时预览** Markdown，自动把 `echarts` 代码块渲染成**交互式图表**（折线 / 柱状 / 饼图…），支持 SVG 图片，并可一键导出 **PDF / 图片 / Word**。

参考 [markdown-preview-enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced) 的「实时编辑 + 预览」交互，但聚焦 ECharts，采用更轻量的单 Webview 实现。

## 功能特性

- **实时预览**：编辑 `.md` 时预览同步刷新（防抖 150ms），切换 Markdown 文件自动跟随
- **ECharts 图表**：识别 ` ```echarts ` 代码块，把其中的 option JSON 交给 ECharts 渲染
- **标准 Markdown**：标题 / 表格 / 列表 / 引用 / 代码块（GFM，基于 marked）
- **SVG 图片**：md 中的 `![图](xxx.svg)` 正常显示；导出时自动光栅化，避免丢图
- **自动目录**：左侧 TOC + 滚动高亮，窄屏折叠为抽屉
- **一键导出**：PDF（A4 自动分页）、PNG 长图、Word（.doc，图表内嵌图片）——通过原生保存对话框落盘
- **离线可用**：`marked`、`ECharts`、`html2canvas`、`jsPDF` 已内置到 `media/`，无需联网

## 使用方式

1. 打开任意 `.md` 文件
2. 点编辑器右上角的预览图标，或执行命令 `Markdown+ECharts: 打开实时预览`（快捷键 `Ctrl+Alt+M` / `Cmd+Alt+M`）
3. 边编辑边看渲染结果；右上角「导出」选择 PDF / 图片 / Word

### 在 Markdown 中写图表

````markdown
```echarts
{
  "xAxis": { "type": "category", "data": ["一", "二", "三", "四"] },
  "yAxis": { "type": "value" },
  "series": [{ "name": "示例", "type": "bar", "data": [5, 20, 36, 10] }]
}
```
````

## 本地运行 / 调试

```bash
# 1. 安装依赖（仅打包需要）
npm install

# 2. 在 VS Code 中打开本目录，按 F5 启动「扩展开发宿主」即可调试

# 3. 打包成 .vsix（可选）
npm run package
# 然后在 VS Code 里：扩展面板 → 从 VSIX 安装
```

## 项目结构

```
.
├── extension.js          # 宿主侧：WebviewPanel + 文档监听 + 原生保存
├── media/
│   ├── preview.html 逻辑  # 由 extension.js 内联注入
│   ├── preview.css        # 预览样式
│   ├── preview.js         # 渲染 + 图表 + 导出逻辑（webview 内运行）
│   ├── marked.min.js      # 内置依赖
│   ├── echarts.min.js
│   ├── html2canvas.min.js
│   └── jspdf.umd.min.js
├── package.json
├── CHANGELOG.md
└── LICENSE
```

## 技术要点

- Webview CSP 采用 `default-src 'none'` + 白名单（脚本走 `cspSource`，图片允许 `data:` 与 `https:`）
- 导出时先把 ECharts 图表 `getDataURL()` 转图片、SVG 光栅化为 PNG，再交给 html2canvas，规避跨域/污染问题
- 导出文件经 `webview → 宿主 → showSaveDialog → workspace.fs` 写入，符合 VS Code 规范

## License

[MIT](./LICENSE)
