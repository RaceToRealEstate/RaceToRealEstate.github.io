/* ===== North State St — reviewer annotation tool =====
   No backend. Jon edits text inline and/or selects text to leave notes.
   Everything is saved in his browser (localStorage) and exported as a file /
   copied to clipboard / emailed back. The live page is never touched. */
(function () {
  "use strict";
  var KEY = "nss-review-v1";
  var MAILTO = "edgelesscorner@gmail.com";
  var EDIT_SEL = "h1,h2,h3,h4,h5,p,li,figcaption,summary,blockquote";

  // ---------- state ----------
  function blank() { return { edits: {}, comments: [], nextC: 1 }; }
  function load() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { return blank(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} refreshCounts(); }
  var store = load();

  // ---------- utilities ----------
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function inUI(node) { return !!(node && node.closest && node.closest(".nssr, .nssr-bar, .nssr-panel, .nssr-pop, .nssr-addbtn, .nssr-toast")); }
  function sectionLabel(node) {
    var s = node && node.closest ? node.closest("section, header, footer") : null;
    if (s) { var h = s.querySelector("h1,h2,h3"); if (h) return h.textContent.trim().replace(/\s+/g, " ").slice(0, 48); }
    return "Page";
  }
  function toast(msg) {
    var t = document.querySelector(".nssr-toast") || document.body.appendChild(el("div", "nssr-toast"));
    t.textContent = msg; t.classList.add("nssr-show");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("nssr-show"); }, 1900);
  }

  // ---------- inline text editing ----------
  function initEditable() {
    var i = 0;
    document.querySelectorAll(EDIT_SEL).forEach(function (node) {
      if (node.hasAttribute("data-nssr-edit")) return;
      if (inUI(node)) return;
      if (node.closest("nav, .ch-nav, script, style, form, #videoPlaceholder, #videoSound, .ch-counter")) return;
      if (node.querySelector(EDIT_SEL)) return;          // only leaf text blocks
      if (!node.textContent.trim()) return;
      var rid = "r" + (i++);                              // deterministic on a static page
      node.setAttribute("data-nssr-edit", rid);
      node.setAttribute("contenteditable", "true");
      node.setAttribute("spellcheck", "true");
      if (!store.edits[rid]) node.dataset.nssrOrig = node.textContent.trim();
      else { node.innerHTML = store.edits[rid].html; node.classList.add("nssr-changed"); node.dataset.nssrOrig = store.edits[rid].orig; }
      node.addEventListener("focus", function () { if (node.dataset.nssrOrig == null) node.dataset.nssrOrig = node.textContent.trim(); });
      node.addEventListener("input", function () {
        var orig = node.dataset.nssrOrig || "";
        var cur = node.textContent.trim();
        if (cur === orig) { delete store.edits[rid]; node.classList.remove("nssr-changed"); }
        else { store.edits[rid] = { orig: orig, text: cur, html: node.innerHTML, section: sectionLabel(node) }; node.classList.add("nssr-changed"); }
        save();
      });
      // keep in-page links from navigating while editing
      node.addEventListener("keydown", function (e) { if (e.key === "Enter" && node.tagName === "H1") e.preventDefault(); });
    });
  }

  // ---------- comments (select text -> note) ----------
  var addBtn = null, pop = null, savedRange = null;
  function clearAddBtn() { if (addBtn) { addBtn.remove(); addBtn = null; } }
  function clearPop() { if (pop) { pop.remove(); pop = null; } }

  document.addEventListener("mouseup", function (e) {
    if (inUI(e.target)) return;
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { clearAddBtn(); return; }
      var text = sel.toString().trim();
      if (text.length < 2) { clearAddBtn(); return; }
      var range = sel.getRangeAt(0);
      if (inUI(range.commonAncestorContainer.parentNode || range.commonAncestorContainer)) return;
      savedRange = range.cloneRange();
      var r = range.getBoundingClientRect();
      clearAddBtn();
      addBtn = el("button", "nssr-addbtn", "💬 Add note");
      document.body.appendChild(addBtn);
      addBtn.style.top = (window.scrollY + r.bottom + 6) + "px";
      addBtn.style.left = (window.scrollX + r.left) + "px";
      addBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openComposer(text, r); });
    }, 0);
  });
  document.addEventListener("mousedown", function (e) {
    if (addBtn && !addBtn.contains(e.target)) clearAddBtn();
    if (pop && !pop.contains(e.target)) clearPop();
  });

  function openComposer(quote, rect) {
    clearAddBtn(); clearPop();
    pop = el("div", "nssr-pop");
    pop.appendChild(el("p", "nssr-quote", "“" + quote.replace(/</g, "&lt;").slice(0, 160) + "”"));
    var ta = el("textarea"); ta.placeholder = "Your note or suggested change…"; pop.appendChild(ta);
    var row = el("div", "nssr-pop-row");
    var cancel = el("button", "nssr-btn", "Cancel");
    var saveB = el("button", "nssr-btn nssr-primary", "Save note");
    row.appendChild(cancel); row.appendChild(saveB); pop.appendChild(row);
    document.body.appendChild(pop);
    pop.style.top = (window.scrollY + rect.bottom + 6) + "px";
    pop.style.left = (window.scrollX + Math.max(8, rect.left)) + "px";
    ta.focus();
    cancel.addEventListener("click", clearPop);
    saveB.addEventListener("click", function () {
      var note = ta.value.trim();
      if (!note) { ta.focus(); return; }
      addComment(quote, note);
      clearPop();
      window.getSelection().removeAllRanges();
    });
  }

  function addComment(quote, note) {
    var cid = store.nextC++;
    var section = savedRange ? sectionLabel(savedRange.commonAncestorContainer.parentNode || savedRange.commonAncestorContainer) : "Page";
    store.comments.push({ id: cid, quote: quote, note: note, section: section });
    if (savedRange) wrapRange(savedRange, cid);
    savedRange = null;
    save(); renderPanel(); toast("Note added");
  }

  function wrapRange(range, cid) {
    try {
      var m = el("mark", "nssr-hl"); m.setAttribute("data-cid", cid);
      range.surroundContents(m);
      var sup = el("sup", "nssr-badge"); sup.textContent = cid; m.appendChild(sup);
      return true;
    } catch (e) { return false; }     // selection spanned elements; note still recorded
  }

  // best-effort re-highlight after reload (exact first text match)
  function rehighlight(quote, cid) {
    if (document.querySelector('mark.nssr-hl[data-cid="' + cid + '"]')) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return (!inUI(n.parentNode) && n.nodeValue.indexOf(quote) >= 0) ? 1 : 3; }
    });
    var node = walker.nextNode();
    if (!node) return;
    var idx = node.nodeValue.indexOf(quote);
    var r = document.createRange();
    r.setStart(node, idx); r.setEnd(node, idx + quote.length);
    wrapRange(r, cid);
  }

  // ---------- comments panel ----------
  var panel;
  function renderPanel() {
    var list = panel.querySelector(".nssr-list");
    list.innerHTML = "";
    if (!store.comments.length) { list.appendChild(el("div", "nssr-empty", "No notes yet.<br>Select any text on the page to add one.")); }
    store.comments.forEach(function (c) {
      var item = el("div", "nssr-item");
      var x = el("button", "nssr-x", "×"); x.title = "Delete note";
      x.addEventListener("click", function () {
        store.comments = store.comments.filter(function (k) { return k.id !== c.id; });
        var m = document.querySelector('mark.nssr-hl[data-cid="' + c.id + '"]');
        if (m) { var sup = m.querySelector(".nssr-badge"); if (sup) sup.remove(); m.replaceWith(document.createTextNode(m.textContent)); }
        save(); renderPanel();
      });
      item.appendChild(x);
      item.appendChild(el("div", "nssr-sec", "#" + c.id + " · " + c.section));
      item.appendChild(el("div", "nssr-q", "“" + c.quote.replace(/</g, "&lt;").slice(0, 140) + "”"));
      item.appendChild(el("div", "nssr-n", c.note.replace(/</g, "&lt;")));
      item.addEventListener("click", function (e) {
        if (e.target === x) return;
        var m = document.querySelector('mark.nssr-hl[data-cid="' + c.id + '"]');
        if (m) m.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      list.appendChild(item);
    });
    refreshCounts();
  }

  // ---------- export ----------
  function buildReport() {
    var lines = ["# Feedback — 132 North State Street", "", "Reviewer: Jon — " + new Date().toLocaleString(), ""];
    var edits = Object.keys(store.edits);
    lines.push("## Text edits (" + edits.length + ")", "");
    if (!edits.length) lines.push("_(none)_", "");
    edits.forEach(function (k) {
      var e = store.edits[k];
      lines.push("- **[" + e.section + "]**");
      lines.push("  - was: “" + e.orig + "”");
      lines.push("  - now: “" + e.text + "”");
    });
    lines.push("", "## Comments & notes (" + store.comments.length + ")", "");
    if (!store.comments.length) lines.push("_(none)_", "");
    store.comments.forEach(function (c) {
      lines.push(c.id + ". **[" + c.section + "]** “" + c.quote.replace(/\s+/g, " ").slice(0, 200) + "”");
      lines.push("   → " + c.note);
    });
    return lines.join("\n");
  }
  function exportFile() {
    var txt = buildReport();
    var blob = new Blob([txt], { type: "text/markdown" });
    var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "north-state-feedback.md";
    document.body.appendChild(a); a.click(); a.remove();
    copyText(txt, "Feedback downloaded + copied to clipboard");
  }
  function copyText(txt, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast(msg || "Copied"); }, function () { toast("Downloaded (copy blocked)"); });
    } else { toast(msg || "Done"); }
  }
  function emailReport() {
    var body = buildReport();
    var url = "mailto:" + MAILTO + "?subject=" + encodeURIComponent("Feedback — 132 North State Street") +
      "&body=" + encodeURIComponent(body.slice(0, 1700) + (body.length > 1700 ? "\n\n[…full feedback also downloaded as a file—please attach it]" : ""));
    exportFile();                              // ensure full version is saved too
    window.location.href = url;
  }

  function refreshCounts() {
    var n = (store.comments ? store.comments.length : 0) + Object.keys(store.edits || {}).length;
    document.querySelectorAll(".nssr-count").forEach(function (c) { c.textContent = n; });
  }

  // ---------- chrome (toolbar + panel) ----------
  function buildUI() {
    var bar = el("div", "nssr-bar nssr");
    bar.innerHTML =
      '<strong>📝 Review mode</strong>' +
      '<span class="nssr-hint">Click any text to edit it · select text to leave a note</span>' +
      '<span class="nssr-spacer"></span>' +
      '<button class="nssr-btn" data-act="panel">💬 Notes <span class="nssr-count">0</span></button>' +
      '<button class="nssr-btn" data-act="copy">⧉ Copy</button>' +
      '<button class="nssr-btn nssr-primary" data-act="export">⬇ Export</button>' +
      '<button class="nssr-btn nssr-primary" data-act="email">✉ Email Barry</button>' +
      '<button class="nssr-btn nssr-danger" data-act="reset">↺ Reset</button>';
    document.body.appendChild(bar);

    panel = el("div", "nssr-panel nssr");
    panel.innerHTML = '<header><b>Notes &amp; comments</b><button class="nssr-btn" data-act="close">Close</button></header><div class="nssr-list"></div>';
    document.body.appendChild(panel);

    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "panel") panel.classList.toggle("nssr-open");
      else if (act === "copy") copyText(buildReport(), "Feedback copied to clipboard");
      else if (act === "export") exportFile();
      else if (act === "email") emailReport();
      else if (act === "reset") { if (confirm("Clear ALL your edits and notes? This cannot be undone.")) { localStorage.removeItem(KEY); location.reload(); } }
    });
    panel.querySelector('[data-act="close"]').addEventListener("click", function () { panel.classList.remove("nssr-open"); });
  }

  // ---------- in-page anchor scrolling (because <base> rewrites #links) ----------
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href*="#"]') : null;
    if (!a || a.closest(".nssr")) return;
    var href = a.getAttribute("href") || "";
    var hash = href.slice(href.indexOf("#"));
    if (hash.length > 1) { var t = document.querySelector(hash); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth" }); } }
  });

  // ---------- boot ----------
  function boot() {
    buildUI();
    initEditable();
    renderPanel();
    store.comments.forEach(function (c) { try { rehighlight(c.quote, c.id); } catch (e) {} });
    refreshCounts();
    // catch any text that the page builds slightly later (e.g. gallery captions)
    setTimeout(initEditable, 1800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
