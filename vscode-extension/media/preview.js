(function () {
  "use strict";
  var vscode = acquireVsCodeApi();
  var _vscodeApi = vscode;
  function post(msg) {
    try { _vscodeApi.postMessage(msg); } catch (e) { /* webview 已销毁，静默忽略 */ }
  }

  var contentEl = document.getElementById("content");
  var tocListEl = document.getElementById("tocList");
  var charts = [];
  var chartsById = {};
  var chartSeq = 0;
  var mermaidSeq = 0;
  var currentTitle = "文档";
  var currentBaseName = "文档";
  var busy = false;
  var activeObserver = null;
  var suppressReportUntil = 0;

  var settings = { scrollSync: true, sectionNumbering: false, math: true, mermaid: true, toc: true, tocWidth: 230 };

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function toast(msg, isError) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove("show"); }, 3000);
  }
  function setBusy(b) {
    busy = b;
    document.getElementById("exportBtn").disabled = b;
    document.querySelectorAll("#exportDropdown .menu button").forEach(function (m) { m.disabled = b; });
  }
  function slugify(text) {
    var s = text.trim().toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, "-");
    return s.replace(/^-+|-+$/g, "") || ("sec-" + Math.random().toString(36).slice(2));
  }

  function disposeCharts() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    charts = [];
    chartsById = {};
  }

  /* ---------- KaTeX（marked 扩展） ---------- */
  var katexInlineExt = {
    name: "katexInline",
    level: "inline",
    start: function (src) { return src.indexOf("$"); },
    tokenizer: function (src) {
      var m = /^\$([^$\n]+?)\$/.exec(src);
      if (m) return { type: "katexInline", raw: m[0], text: m[1] };
    },
    renderer: function (token) {
      if (!settings.math || typeof katex === "undefined") return escapeHtml(token.raw);
      try { return katex.renderToString(token.text, { throwOnError: false, displayMode: false }); }
      catch (e) { return escapeHtml(token.raw); }
    }
  };
  var katexBlockExt = {
    name: "katexBlock",
    level: "block",
    start: function (src) { return src.indexOf("$$"); },
    tokenizer: function (src) {
      var m = /^\$\$([\s\S]+?)\$\$/.exec(src);
      if (m) return { type: "katexBlock", raw: m[0], text: m[1].trim() };
    },
    renderer: function (token) {
      if (!settings.math || typeof katex === "undefined") return "<pre>" + escapeHtml(token.raw) + "</pre>";
      try {
        return '<div class="katex-block">' + katex.renderToString(token.text, { throwOnError: false, displayMode: true }) + "</div>";
      } catch (e) { return "<pre>" + escapeHtml(token.raw) + "</pre>"; }
    }
  };
  if (typeof marked !== "undefined") {
    marked.use({ gfm: true, breaks: true });
    marked.use({ extensions: [katexBlockExt, katexInlineExt] });
  }
  if (typeof mermaid !== "undefined") {
    try { mermaid.initialize({ startOnLoad: false, theme: "default" }); } catch (e) {}
  }

  /* ---------- 标题源行号（用于滚动同步） ---------- */
  function scanHeadingLines(mdText) {
    var lines = String(mdText || "").split(/\r?\n/);
    var result = [];
    var inFence = false;
    var fenceChar = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var fm = line.match(/^\s*(```+|~~~+)/);
      if (fm) {
        if (!inFence) { inFence = true; fenceChar = fm[1][0]; }
        else if (fm[1][0] === fenceChar) { inFence = false; }
        continue;
      }
      if (inFence) continue;
      var hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) result.push({ line: i, level: hm[1].length });
    }
    return result;
  }
  function attachHeadingLines(root, mdText) {
    var lines = scanHeadingLines(mdText);
    var heads = root.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (var i = 0; i < heads.length && i < lines.length; i++) {
      heads[i].setAttribute("data-line", String(lines[i].line));
    }
  }

  /* ---------- 章节编号（Markdown All in One 风格） ---------- */
  function applySectionNumbering(root) {
    if (!settings.sectionNumbering) return;
    var counters = [0, 0, 0, 0, 0, 0];
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(function (h) {
      var level = parseInt(h.tagName.charAt(1), 10) - 1;
      counters[level]++;
      for (var i = level + 1; i < 6; i++) counters[i] = 0;
      var parts = [];
      for (var j = 0; j <= level; j++) parts.push(counters[j]);
      var span = document.createElement("span");
      span.className = "section-num";
      span.textContent = parts.join(".") + " ";
      h.insertBefore(span, h.firstChild);
    });
  }

  /* ---------- 目录 ---------- */
  function buildToc(root) {
    var heads = root.querySelectorAll("h2, h3");
    tocListEl.innerHTML = "";
    if (!heads.length) { tocListEl.innerHTML = '<li class="empty-toc">无目录</li>'; return; }
    heads.forEach(function (h) {
      if (!h.id) h.id = slugify(h.textContent);
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      a.className = h.tagName.toLowerCase() === "h3" ? "lvl3" : "";
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        document.getElementById(h.id).scrollIntoView({ behavior: "smooth", block: "start" });
        document.body.classList.remove("toc-open");
      });
      li.appendChild(a);
      tocListEl.appendChild(li);
    });
    observeHeadings(root);
  }
  function observeHeadings(root) {
    if (!("IntersectionObserver" in window)) return;
    if (activeObserver) activeObserver.disconnect();
    activeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          tocListEl.querySelectorAll("a").forEach(function (a) {
            a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id);
          });
        }
      });
    }, { rootMargin: "-60px 0px -70% 0px" });
    root.querySelectorAll("h2,h3").forEach(function (h) { activeObserver.observe(h); });
  }

  /* ---------- ECharts 渲染 ---------- */
  function renderCharts(root) {
    var blocks = root.querySelectorAll("pre code.language-echarts");
    blocks.forEach(function (code) {
      var pre = code.parentElement;
      var jsonText = code.textContent.trim();
      var holder = document.createElement("div");
      holder.className = "chart-box";
      holder.id = "echart-" + (chartSeq++);
      pre.replaceWith(holder);

      if (typeof echarts === "undefined") {
        holder.outerHTML = "<pre>" + escapeHtml(jsonText) + "</pre>";
        return;
      }
      var option;
      try { option = JSON.parse(jsonText); }
      catch (e) {
        holder.outerHTML = '<div class="chart-error">ECharts 配置解析失败：' + escapeHtml(e.message) + "</div>";
        return;
      }
      try {
        var chart = echarts.init(holder);
        chart.setOption(option);
        charts.push(chart);
        chartsById[holder.id] = chart;
      } catch (e) {
        holder.outerHTML = '<div class="chart-error">ECharts 渲染失败：' + escapeHtml(e.message) + "</div>";
      }
    });
  }

  /* ---------- Mermaid 渲染 ---------- */
  async function renderMermaidBlocks(root) {
    var blocks = Array.prototype.slice.call(root.querySelectorAll("pre code.language-mermaid"));
    for (var i = 0; i < blocks.length; i++) {
      var code = blocks[i];
      var pre = code.parentElement;
      var src = code.textContent.trim();
      if (!settings.mermaid || typeof mermaid === "undefined") continue;
      var holder = document.createElement("div");
      holder.className = "mermaid-box";
      pre.replaceWith(holder);
      try {
        var id = "m-" + (mermaidSeq++);
        var result = await mermaid.render(id, src);
        holder.innerHTML = result.svg;
      } catch (e) {
        holder.outerHTML = '<div class="chart-error">Mermaid 渲染失败：' + escapeHtml(e.message) + "</div>";
      }
    }
  }

  /* ---------- 渲染 ---------- */
  async function render(mdText, title, sub, s) {
    disposeCharts();
    settings = s || settings;
    document.body.classList.toggle("toc-hidden", !settings.toc);
    document.documentElement.style.setProperty("--toc-width", (settings.tocWidth || 230) + "px");
    currentTitle = title || "文档";
    currentBaseName = (title || "文档").replace(/\.(md|markdown)$/i, "");
    document.getElementById("docTitle").textContent = currentTitle;
    document.getElementById("docSub").textContent = sub || "ECharts · KaTeX · Mermaid";
    document.title = currentTitle + " · 预览";

    if (typeof marked === "undefined") {
      contentEl.innerHTML = '<div class="chart-error">无法加载 Markdown 解析库（marked）。</div>';
      return;
    }
    var html;
    try { html = marked.parse(mdText || ""); }
    catch (e) {
      contentEl.innerHTML = '<div class="chart-error">Markdown 解析失败：' + escapeHtml(e.message) + "</div>";
      return;
    }

    contentEl.innerHTML = html;
    attachHeadingLines(contentEl, mdText);
    applySectionNumbering(contentEl);
    buildToc(contentEl);
    renderCharts(contentEl);
    await renderMermaidBlocks(contentEl);
    setBusy(false);
  }

  /* ---------- 导出：图表快照 ---------- */
  function chartToImage(chart, width, height) {
    var url = null;
    try { url = chart.getDataURL({ pixelRatio: 2, backgroundColor: "#ffffff" }); }
    catch (e) { url = null; }
    if (!url) {
      var dom = chart.getDom();
      var cv = dom && dom.querySelector("canvas");
      if (cv) { try { url = cv.toDataURL("image/png"); } catch (e2) { url = null; } }
    }
    if (!url) return null;
    var img = document.createElement("img");
    img.src = url;
    img.width = width || 800;
    img.height = height || 400;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    img.alt = "chart";
    return img;
  }
  function chartPlaceholder() {
    var ph = document.createElement("div");
    ph.className = "chart-error";
    ph.textContent = "（该图表被判定为受污染画布，无法导出，已省略）";
    return ph;
  }
  function swapChartBox(box, liveSize) {
    var chart = chartsById[box.id];
    if (!chart) return null;
    var live = chart.getDom();
    var w = (liveSize && live && live.offsetWidth) || box.offsetWidth || 800;
    var h = (liveSize && live && live.offsetHeight) || box.offsetHeight || 400;
    var replacement = chartToImage(chart, w, h) || chartPlaceholder();
    box.replaceWith(replacement);
    return { el: replacement, box: box };
  }
  function snapshotChartsIn(root) {
    root.querySelectorAll(".chart-box").forEach(function (box) { swapChartBox(box, true); });
  }
  function swapChartsWithImages(root) {
    var boxes = Array.prototype.slice.call(root.querySelectorAll(".chart-box"));
    var swaps = [];
    boxes.forEach(function (box) {
      var r = swapChartBox(box, false);
      if (r) swaps.push(r);
    });
    return function restore() {
      swaps.forEach(function (s) { s.el.replaceWith(s.box); });
      charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
    };
  }

  /* ---------- 导出：SVG 光栅化 ---------- */
  function parseViewBox(src) {
    if (!/^data:image\/svg\+xml/i.test(src)) return null;
    try {
      var b64 = src.split(",").slice(1).join(",");
      var xml = atob(b64.replace(/\s+/g, ""));
      var m = xml.match(/viewBox\s*=\s*["']\s*([\d.\-\s,]+)["']/);
      if (m) {
        var parts = m[1].trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { w: parts[2], h: parts[3] };
      }
    } catch (e) {}
    return null;
  }
  function svgToPng(src) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, 5000);
      var img = new Image();
      img.onload = function () {
        if (settled) return;
        clearTimeout(timer);
        try {
          var w = img.naturalWidth || 0;
          var h = img.naturalHeight || 0;
          if (!w || !h) {
            var vb = parseViewBox(src);
            if (vb) { w = vb.w; h = vb.h; }
          }
          if (!w || !h) { w = 800; h = 600; }
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          settled = true;
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          settled = true;
          resolve(null);
        }
      };
      img.onerror = function () {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        resolve(null);
      };
      img.src = src;
    });
  }
  async function rasterizeSvgImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll("img"));
    var swaps = [];
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute("src") || "";
      if (!/^data:image\/svg\+xml/i.test(src) && !/\.svg(\?.*)?$/i.test(src)) continue;
      var png = await svgToPng(src);
      if (!png) continue;
      var prev = img.getAttribute("src");
      img.setAttribute("src", png);
      swaps.push({ img: img, prev: prev });
    }
    return function restore() {
      swaps.forEach(function (s) { s.img.setAttribute("src", s.prev); });
    };
  }

  async function captureContentCanvas() {
    var restore = swapChartsWithImages(contentEl);
    var restoreSvg = await rasterizeSvgImages(contentEl);
    try {
      var canvas = await html2canvas(contentEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        allowTaint: false,
        imageTimeout: 15000
      });
      try { canvas.toDataURL("image/png"); }
      catch (e) { throw new Error("截图被浏览器判定为受污染（多因跨域图片）。"); }
      return canvas;
    } finally {
      restoreSvg();
      restore();
    }
  }

  /* ---------- 导出：PNG / PDF / HTML / Word ---------- */
  async function exportPNG() {
    if (busy) return;
    setBusy(true);
    toast("正在生成图片…");
    try {
      var canvas = await captureContentCanvas();
      post({ type: "export", format: "png", dataUrl: canvas.toDataURL("image/png"), filename: currentBaseName });
      toast("已生成，请选择保存位置");
    } catch (e) { toast("导出失败：" + e.message, true); }
    finally { setBusy(false); }
  }

  async function exportPDF() {
    if (busy) return;
    if (typeof jspdf === "undefined") { toast("PDF 库未加载", true); return; }
    setBusy(true);
    toast("正在生成 PDF…");
    try {
      var canvas = await captureContentCanvas();
      var imgData = canvas.toDataURL("image/jpeg", 0.92);
      var pdf = new jspdf.jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var imgW = pageW;
      var imgH = canvas.height * pageW / canvas.width;
      var heightLeft = imgH;
      var position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      pdf.setProperties({ title: currentTitle });
      post({ type: "export", format: "pdf", dataUrl: pdf.output("datauristring"), filename: currentBaseName });
      toast("已生成，请选择保存位置");
    } catch (e) { toast("导出失败：" + e.message, true); }
    finally { setBusy(false); }
  }

  var WORD_CSS =
    'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:12pt;line-height:1.7;color:#1f2328;}' +
    'h1{font-size:22pt;}h2{font-size:16pt;border-bottom:1px solid #ccc;padding-bottom:4pt;margin-top:18pt;}' +
    'h3{font-size:13.5pt;}table{border-collapse:collapse;width:100%;margin:8pt 0;}' +
    'th,td{border:1px solid #999;padding:4pt 8pt;font-size:10.5pt;vertical-align:top;}' +
    'th{background:#f0f4fa;font-weight:bold;}' +
    'img{max-width:100%;height:auto;}' +
    'blockquote{border-left:4px solid #ccc;padding-left:10pt;color:#555;margin:8pt 0;}' +
    'code{font-family:Consolas,monospace;background:#f2f2f2;padding:1pt 3pt;border-radius:2pt;}' +
    'pre{background:#f5f5f5;padding:8pt;border:1px solid #ddd;white-space:pre-wrap;font-size:10pt;}' +
    'hr{border:none;border-top:1px solid #ccc;margin:12pt 0;}li{margin:3pt 0;}';

  async function exportWord() {
    if (busy) return;
    setBusy(true);
    toast("正在生成 Word…");
    try {
      var clone = contentEl.cloneNode(true);
      clone.id = "word-export";
      snapshotChartsIn(clone);
      await rasterizeSvgImages(clone);
      var bodyHtml = clone.innerHTML;
      var docHtml =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
        'xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8"><title>' + escapeHtml(currentTitle) + '</title>' +
        '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
        '<style>' + WORD_CSS + '</style></head>' +
        '<body>' + bodyHtml + '</body></html>';
      post({ type: "export", format: "word", text: docHtml, filename: currentBaseName });
      toast("已生成，请选择保存位置");
    } catch (e) { toast("导出失败：" + e.message, true); }
    finally { setBusy(false); }
  }

  async function exportHTML() {
    if (busy) return;
    setBusy(true);
    toast("正在生成 HTML…");
    try {
      var clone = contentEl.cloneNode(true);
      clone.id = "html-export";
      snapshotChartsIn(clone);
      await rasterizeSvgImages(clone);
      var html =
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + escapeHtml(currentTitle) + '</title>' +
        '<style>' + getEmbeddedStyle() + '</style></head><body><main class="export">' + clone.innerHTML + '</main></body></html>';
      post({ type: "export", format: "html", text: html, filename: currentBaseName });
      toast("已生成，请选择保存位置");
    } catch (e) { toast("导出失败：" + e.message, true); }
    finally { setBusy(false); }
  }

  function getEmbeddedStyle() {
    var out = "";
    try {
      for (var i = 0; i < document.styleSheets.length; i++) {
        var ss = document.styleSheets[i];
        var rules = ss.cssRules || ss.rules;
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          out += rules[j].cssText + "\n";
        }
      }
    } catch (e) {}
    return out;
  }

  /* ---------- 滚动同步 ---------- */
  function reportScroll() {
    if (!settings.scrollSync || Date.now() < suppressReportUntil) return;
    var heads = contentEl.querySelectorAll("h1,h2,h3,h4,h5,h6");
    var topLine = null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= 48) {
        topLine = heads[i].getAttribute("data-line");
      } else { break; }
    }
    if (topLine !== null && topLine !== undefined) {
      post({ type: "scroll", line: parseInt(topLine, 10) });
    }
  }
  function scrollToLine(line) {
    if (!settings.scrollSync) return;
    var heads = contentEl.querySelectorAll("h1,h2,h3,h4,h5,h6");
    var target = null;
    for (var i = 0; i < heads.length; i++) {
      var ln = parseInt(heads[i].getAttribute("data-line") || "-1", 10);
      if (ln >= line) { target = heads[i]; break; }
    }
    if (target) {
      suppressReportUntil = Date.now() + 300;
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }

  /* ---------- 事件 ---------- */
  window.addEventListener("message", function (ev) {
    var msg = ev.data;
    if (!msg) return;
    if (msg.type === "update") {
      render(msg.markdown || "", msg.title, msg.title, msg.settings);
    } else if (msg.type === "scroll" && typeof msg.line === "number") {
      scrollToLine(msg.line);
    }
  });

  document.getElementById("exportBtn").addEventListener("click", function (ev) {
    ev.stopPropagation();
    if (busy) return;
    document.getElementById("exportDropdown").classList.toggle("open");
  });
  document.querySelectorAll("#exportDropdown .menu button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.getElementById("exportDropdown").classList.remove("open");
      var act = btn.getAttribute("data-act");
      if (act === "pdf") exportPDF();
      else if (act === "png") exportPNG();
      else if (act === "html") exportHTML();
      else if (act === "word") exportWord();
    });
  });
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest("#exportDropdown")) document.getElementById("exportDropdown").classList.remove("open");
  });
  document.getElementById("tocToggle").addEventListener("click", function () {
    if (window.matchMedia("(max-width: 820px)").matches) {
      document.body.classList.toggle("toc-open");
    } else {
      var hidden = document.body.classList.toggle("toc-hidden");
      post({ type: "tocToggle", visible: !hidden });
    }
  });

  // 拖动调整目录宽度
  var resizer = document.getElementById("tocResizer");
  if (resizer) {
    resizer.addEventListener("mousedown", function (e) {
      e.preventDefault();
      resizer.classList.add("active");
      var startX = e.clientX;
      var startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--toc-width")) || 230;
      function onMove(ev) {
        var w = Math.min(480, Math.max(160, startW + (ev.clientX - startX)));
        document.documentElement.style.setProperty("--toc-width", w + "px");
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        resizer.classList.remove("active");
        var w = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--toc-width")) || 230;
        post({ type: "tocWidth", width: w });
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  var scrollTimer = null;
  window.addEventListener("scroll", function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(reportScroll, 120);
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
    }, 150);
  });

  post({ type: "ready" });
})();
