# 更新日志

## 0.3.0

- 新增「设为/取消 .md 默认编辑器」命令（写入 `workbench.editorAssociations`）
- 目录导航栏可显示/隐藏（右上角「目录」按钮），可拖动分隔条或通过设置 `tocWidth` 调整宽度
- 新增设置项：toc / tocWidth

## 0.2.1

- 修复预览时偶发 `Webview is disposed` 报错：所有 postMessage 增加销毁保护、清理防抖定时器、新增 ready 握手重推内容
- 修复 webview 首次加载时首条内容可能丢失的问题

## 0.2.0

- 新增自定义编辑器（右键 `.md` → 打开方式 → Markdown + ECharts 预览）
- 集成 KaTeX 公式（`$...$` / `$$...$$`）与 Mermaid 图表
- 源编辑器 ↔ 预览双向滚动同步
- 章节自动编号（设置项）
- 新增 HTML 导出
- 新增设置项：scrollSync / sectionNumbering / math / mermaid

## 0.1.0

- 首个版本
- 实时预览 Markdown，渲染 `echarts` 代码块为交互图表
- 支持 SVG 图片显示与导出光栅化
- 导出 PDF / PNG / Word（原生保存对话框）
- 内置 marked / ECharts / html2canvas / jsPDF，离线可用
