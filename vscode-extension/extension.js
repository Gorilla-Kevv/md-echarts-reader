const vscode = require('vscode');
const path = require('path');

let panel = undefined;
let panelTimer = undefined;
let panelDocUri = undefined;
const previewSessions = []; // { webview, docUri, refresh }

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 1) 命令式「侧边预览」
  context.subscriptions.push(
    vscode.commands.registerCommand('mdEchartsPreview.open', () => openPanel(context))
  );

  // 2) 自定义编辑器（对齐 MPE 形态：右键 → 打开方式 → Markdown + ECharts 预览）
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'mdEchartsPreview.editor',
      new MarkdownEchartsEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // 3) 编辑文档 → 实时刷新（命令式面板）
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!panel) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== e.document.uri.toString()) return;
      if (panelTimer) clearTimeout(panelTimer);
      panelTimer = setTimeout(() => pushDoc(panel.webview, editor.document), 150);
    })
  );

  // 4) 切换活动编辑器 → 命令式面板跟随
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!panel || !editor) return;
      if (editor.document.languageId === 'markdown') {
        panelDocUri = editor.document.uri.toString();
        pushDoc(panel.webview, editor.document);
      }
    })
  );

  // 5) 编辑器 → 预览 滚动同步（命令式面板）
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (panel && panelDocUri === e.textEditor.document.uri.toString()) {
        postScroll(panel.webview, e.visibleRanges);
      }
    })
  );

  // 6) 设置变更 → 刷新所有预览
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mdEchartsPreview')) {
        previewSessions.forEach((s) => { try { s.refresh(); } catch (err) {} });
      }
    })
  );
}

function deactivate() {
  if (panelTimer) clearTimeout(panelTimer);
  panel = undefined;
  panelDocUri = undefined;
}

/* ---------- 工具 ---------- */
function safePostMessage(webview, msg) {
  try {
    webview.postMessage(msg);
  } catch (e) {
    // webview 已被销毁时静默忽略，避免抛 "Webview is disposed"
  }
}

/* ---------- 设置 ---------- */
function readSettings() {
  const c = vscode.workspace.getConfiguration('mdEchartsPreview');
  return {
    scrollSync: c.get('scrollSync', true),
    sectionNumbering: c.get('sectionNumbering', false),
    math: c.get('math', true),
    mermaid: c.get('mermaid', true)
  };
}

/* ---------- 会话注册（用于设置变更时刷新） ---------- */
function addSession(s) {
  previewSessions.push(s);
}
function removeSession(webview) {
  for (let i = previewSessions.length - 1; i >= 0; i--) {
    if (previewSessions[i].webview === webview) previewSessions.splice(i, 1);
  }
}

/* ---------- 命令式面板 ---------- */
function openPanel(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('请先打开一个 Markdown 文件。');
    return;
  }
  const doc = editor.document;
  panelDocUri = doc.uri.toString();

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true);
  } else {
    panel = vscode.window.createWebviewPanel(
      'mdEchartsPreview.panel',
      '预览',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );
    panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);
    panel.onDidDispose(() => {
      removeSession(panel.webview);
      if (panelTimer) clearTimeout(panelTimer);
      panel = undefined;
      panelDocUri = undefined;
    }, null, context.subscriptions);
    panel.webview.onDidReceiveMessage(
      (msg) => onWebviewMessage(msg, panel.webview, panelDocUri),
      undefined,
      context.subscriptions
    );
    addSession({
      webview: panel.webview,
      docUri: doc.uri.toString(),
      refresh: () => {
        const ed = vscode.window.activeTextEditor;
        if (ed && ed.document.languageId === 'markdown') pushDoc(panel.webview, ed.document);
        else if (panel) pushDoc(panel.webview, doc);
      }
    });
  }

  pushDoc(panel.webview, doc);
}

function pushDoc(webview, doc) {
  const name = path.basename(doc.fileName || '未命名');
  if (panel && webview === panel.webview) panel.title = '预览: ' + name;
  safePostMessage(webview, {
    type: 'update',
    markdown: doc.getText(),
    title: name,
    uri: doc.uri.toString(),
    settings: readSettings()
  });
}

/* ---------- 自定义编辑器 Provider ---------- */
class MarkdownEchartsEditorProvider {
  constructor(context) {
    this.context = context;
  }

  resolveCustomTextEditor(document, webviewPanel, _token) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.context.extensionUri);

    let timer = undefined;
    let disposed = false;
    const refresh = () => {
      if (disposed) return;
      const name = path.basename(document.fileName || '未命名');
      webviewPanel.title = name;
      safePostMessage(webviewPanel.webview, {
        type: 'update',
        markdown: document.getText(),
        title: name,
        uri: document.uri.toString(),
        settings: readSettings()
      });
    };
    refresh();

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (disposed || e.document.uri.toString() !== document.uri.toString()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    });

    const visibleSub = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (disposed || e.textEditor.document.uri.toString() !== document.uri.toString()) return;
      postScroll(webviewPanel.webview, e.visibleRanges);
    });

    webviewPanel.webview.onDidReceiveMessage((msg) => onWebviewMessage(msg, webviewPanel.webview, document.uri.toString()));

    addSession({ webview: webviewPanel.webview, docUri: document.uri.toString(), refresh });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      removeSession(webviewPanel.webview);
      changeSub.dispose();
      visibleSub.dispose();
      if (timer) clearTimeout(timer);
    });
  }
}

/* ---------- webview 消息 ---------- */
async function onWebviewMessage(msg, webview, uriStr) {
  if (!msg) return;
  if (msg.type === 'export') {
    await handleExport(msg);
  } else if (msg.type === 'scroll' && typeof msg.line === 'number') {
    revealLineByUri(uriStr, msg.line);
  } else if (msg.type === 'ready') {
    // 首次渲染握手：webview 脚本就绪后重推一次内容，避免首条 update 丢失
    const session = previewSessions.find((s) => s.webview === webview);
    if (session) { try { session.refresh(); } catch (e) {} }
  }
}

function postScroll(webview, visibleRanges) {
  const line = visibleRanges && visibleRanges.length ? visibleRanges[0].start.line : 0;
  safePostMessage(webview, { type: 'scroll', line });
}

function revealLineByUri(uriStr, line) {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === uriStr
  );
  if (!editor) return;
  const clamped = Math.max(0, Math.min(line, Math.max(0, editor.document.lineCount - 1)));
  editor.revealRange(new vscode.Range(clamped, 0, clamped, 0), vscode.TextEditorRevealType.AtTop);
}

/* ---------- 导出 ---------- */
async function handleExport(msg) {
  try {
    const base = (msg.filename || '文档').replace(/\.(md|markdown)$/i, '');
    const extMap = { pdf: 'pdf', png: 'png', word: 'doc', html: 'html' };
    const ext = extMap[msg.format] || 'png';
    const filtersMap = {
      pdf: { 'PDF 文档': ['pdf'] },
      png: { 'PNG 图片': ['png'] },
      word: { 'Word 文档': ['doc'] },
      html: { 'HTML 文档': ['html'] }
    };
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(base + '.' + ext),
      filters: filtersMap[msg.format] || { '文件': ['*'] }
    });
    if (!uri) return;

    let buf;
    if ((msg.format === 'word' || msg.format === 'html') && typeof msg.text === 'string') {
      const prefix = msg.format === 'word' ? '\ufeff' : '';
      buf = Buffer.from(prefix + msg.text, 'utf8');
    } else if (typeof msg.dataUrl === 'string') {
      buf = dataUrlToBuffer(msg.dataUrl);
    } else {
      throw new Error('导出数据为空');
    }
    await vscode.workspace.fs.writeFile(uri, buf);
    vscode.window.showInformationMessage('已导出：' + uri.fsPath);
  } catch (e) {
    vscode.window.showErrorMessage('导出失败：' + (e && e.message ? e.message : String(e)));
  }
}

function dataUrlToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

/* ---------- webview HTML ---------- */
function getWebviewHtml(webview, extensionUri) {
  const mediaDir = vscode.Uri.joinPath(extensionUri, 'media');
  const u = (file) => webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, file)).toString();
  const csp = webview.cspSource;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data: https:; style-src ${csp} 'unsafe-inline'; font-src ${csp}; script-src ${csp};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Markdown 预览</title>
<link rel="stylesheet" href="${u('preview.css')}">
<link rel="stylesheet" href="${u('katex.min.css')}">
</head>
<body>
<header>
  <div class="brand">
    <div class="logo">M↓</div>
    <div>
      <h1 id="docTitle">Markdown 预览</h1>
      <div class="sub" id="docSub">ECharts · KaTeX · Mermaid</div>
    </div>
  </div>
  <div class="spacer"></div>
  <button class="btn ghost" id="tocToggle" type="button">目录</button>
  <div class="dropdown" id="exportDropdown">
    <button class="btn" id="exportBtn" type="button">导出 ▾</button>
    <div class="menu">
      <div class="label">导出为…</div>
      <button data-act="pdf" type="button">PDF 文档（含图表）</button>
      <button data-act="png" type="button">图片 PNG（含图表）</button>
      <button data-act="html" type="button">HTML 文档</button>
      <button data-act="word" type="button">Word 文档（.doc）</button>
    </div>
  </div>
</header>
<div class="layout">
  <nav id="toc"><p class="toc-title">目录</p><ul id="tocList"></ul></nav>
  <main id="content"><div class="empty">正在等待 Markdown 内容…</div></main>
</div>
<div id="toast" role="status"></div>
<script src="${u('marked.min.js')}"></script>
<script src="${u('echarts.min.js')}"></script>
<script src="${u('katex.min.js')}"></script>
<script src="${u('mermaid.min.js')}"></script>
<script src="${u('html2canvas.min.js')}"></script>
<script src="${u('jspdf.umd.min.js')}"></script>
<script src="${u('preview.js')}"></script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
