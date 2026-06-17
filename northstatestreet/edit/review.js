/* ===== North State St — reviewer annotation tool =====
   No backend. Jon edits text inline and/or selects text to leave notes.
   Everything is saved in his browser (localStorage) and exported as a file /
   copied to clipboard / emailed back. The live page is never touched. */
(function () {
  "use strict";
  var KEY = "nss-review-v3";
  var DEST = "barrington@racetorealestate.com";
  // Web3Forms access key for DEST. When set, the Email button sends automatically
  // (no mail client). Get a free key at https://web3forms.com (it is emailed to DEST)
  // and paste it here. Left blank => falls back to opening a prefilled email.
  var ACCESS_KEY = "0b43b0ee-f3ee-4165-88e4-1c51dc2ee8e5";

  // ---------- state ----------
  function blank() { return { edits: {}, comments: [], nextC: 1 }; }
  function load() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { return blank(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} refreshCounts(); }
  var store = load();

  // ---------- utilities ----------
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function inUI(node) { return !!(node && node.closest && node.closest(".nssr, .nssr-bar, .nssr-panel, .nssr-pop, .nssr-addbtn, .nssr-toast")); }
  function cap(s) { return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function asEl(node) { return node && (node.nodeType === 1 ? node : node.parentElement); }
  // Where on the page is this? Friendly, human-readable region name.
  function sectionLabel(node) {
    var e = asEl(node); if (!e) return "Page";
    if (e.closest("nav, .ch-nav")) return "Header / nav";
    if (e.closest(".ch-hero")) return "Hero (top banner)";
    if (e.closest("footer, .ch-footer")) return "Footer";
    var s = e.closest("section");
    if (s) {
      if (s.id) return cap(s.id.replace(/[-_]+/g, " ")) + " section";
      var h = s.querySelector("h2,h3,h1");
      if (h) return h.textContent.trim().replace(/\s+/g, " ").slice(0, 44);
    }
    return "Page";
  }
  // What kind of text is it?
  function friendlyType(el) {
    if (!el) return "text";
    var t = el.tagName;
    if (/^H[1-6]$/.test(t)) return "Heading";
    return ({ P: "Paragraph", LI: "List item", FIGCAPTION: "Photo caption", SUMMARY: "Section toggle",
      A: "Link", TD: "Table cell", TH: "Table cell", BLOCKQUOTE: "Quote", SPAN: "Text", DIV: "Text block" })[t] || t.toLowerCase();
  }
  // Precise CSS locator so the exact element can be found in the source.
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    var parts = [];
    while (el && el.nodeType === 1 && el.tagName !== "BODY") {
      if (el.id) { parts.unshift("#" + el.id); break; }
      var sel = el.tagName.toLowerCase(), p = el.parentElement;
      if (p) {
        var same = Array.prototype.filter.call(p.children, function (c) { return c.tagName === el.tagName; });
        if (same.length > 1) sel += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      parts.unshift(sel); el = p;
    }
    return parts.join(" > ");
  }
  function toast(msg) {
    var t = document.querySelector(".nssr-toast") || document.body.appendChild(el("div", "nssr-toast"));
    t.textContent = msg; t.classList.add("nssr-show");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("nssr-show"); }, 1900);
  }

  // ---------- inline text editing ----------
  // Block-level tags: an element that contains one of these is a container, not a leaf
  // text block, so we don't make it editable (we make its inner text blocks editable).
  var BLOCK = "address,article,aside,blockquote,div,dl,dd,dt,fieldset,figure,figcaption," +
    "footer,form,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,pre,section,table,tbody,td,th,thead,tr,ul";
  function isControl(node) {
    return node.matches("button,input,select,textarea,label,svg,i.bi,.navbar-toggler," +
      "[data-bs-toggle],.swiper-button-prev,.swiper-button-next,.swiper-pagination,#videoSound,.ch-counter");
  }
  function excludedZone(node) {
    return !!node.closest(".nssr,.nssr-bar,.nssr-panel,script,style,noscript," +
      ".swiper-button-prev,.swiper-button-next,.swiper-pagination,#videoSound,.ch-counter");
  }
  function hasOwnText(node) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3 && c.nodeValue.trim()) return true;
    }
    return false;
  }
  function hasBlockChild(node) {
    for (var i = 0; i < node.children.length; i++) if (node.children[i].matches(BLOCK)) return true;
    return false;
  }
  var ridCounter = 0;
  function initEditable() {
    var all = document.body.getElementsByTagName("*");
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      if (node.nodeType !== 1 || node.hasAttribute("data-nssr-edit")) continue;
      if (excludedZone(node) || isControl(node)) continue;
      if (!hasOwnText(node)) continue;            // must directly hold visible text
      if (hasBlockChild(node)) continue;          // only leaf text blocks (avoids nesting)
      if (node.closest("[data-nssr-edit]")) continue; // an ancestor is already editable
      assignEditable(node, "r" + (ridCounter++));
    }
  }
  function assignEditable(node, rid) {
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
      else {
        store.edits[rid] = { rid: rid, orig: orig, text: cur, html: node.innerHTML,
          section: sectionLabel(node), type: friendlyType(node), locator: cssPath(node) };
        node.classList.add("nssr-changed");
      }
      save();
    });
    node.addEventListener("keydown", function (e) { if (e.key === "Enter" && node.tagName === "H1") e.preventDefault(); });
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
    var container = savedRange ? asEl(savedRange.commonAncestorContainer) : null;
    var host = container ? (container.closest("[data-nssr-edit]") || container) : null;
    store.comments.push({
      id: cid, quote: quote, note: note,
      section: sectionLabel(host || container),
      type: friendlyType(host),
      locator: host ? cssPath(host) : "",
      context: host ? host.textContent.trim().replace(/\s+/g, " ") : ""
    });
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
  function rule(ch) { return new Array(60).join(ch || "="); }
  function buildReport() {
    var edits = Object.keys(store.edits).map(function (k) { return store.edits[k]; });
    var L = [];
    L.push(rule("="));
    L.push("FEEDBACK — 132 North State Street (Clark House listing)");
    L.push("Reviewer: Jon   ·   " + new Date().toLocaleString());
    L.push("Page reviewed: https://racetorealestate.com/northstatestreet/");
    L.push(rule("="));
    L.push("");
    L.push("HOW TO READ THIS: each item says where it is (section + element +");
    L.push("locator). For TEXT EDITS, replace the ORIGINAL text with the NEW text.");
    L.push("For NOTES, Jon is commenting on the quoted text — no change unless his");
    L.push("note asks for one.");
    L.push("");

    L.push(rule("-"));
    L.push("TEXT EDITS  (" + edits.length + ")");
    L.push(rule("-"));
    if (!edits.length) L.push("(none)");
    edits.forEach(function (e, i) {
      L.push("");
      L.push("[Edit " + (i + 1) + "]  " + e.section + "  ·  " + (e.type || "text"));
      L.push("  Locator: " + (e.locator || "n/a") + "   (field " + (e.rid || "?") + ")");
      L.push("  ORIGINAL:");
      L.push(indent(e.orig));
      L.push("  CHANGE TO:");
      L.push(indent(e.text));
    });

    L.push("");
    L.push(rule("-"));
    L.push("NOTES & COMMENTS  (" + store.comments.length + ")");
    L.push(rule("-"));
    if (!store.comments.length) L.push("(none)");
    store.comments.forEach(function (c, i) {
      L.push("");
      L.push("[Note " + (i + 1) + "]  " + c.section + "  ·  " + (c.type || "text"));
      if (c.locator) L.push("  Locator: " + c.locator);
      L.push("  Jon highlighted:");
      L.push(indent("“" + c.quote.replace(/\s+/g, " ") + "”"));
      if (c.context && c.context.length > c.quote.length + 4) {
        L.push("  Within this text:");
        L.push(indent("“" + c.context + "”"));
      }
      L.push("  Jon's note:");
      L.push(indent(c.note));
    });
    L.push("");
    L.push(rule("="));
    L.push("End of feedback — " + edits.length + " edit(s), " + store.comments.length + " note(s).");
    return L.join("\n");
  }
  function indent(s) { return String(s == null ? "" : s).split("\n").map(function (ln) { return "      " + ln; }).join("\n"); }
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
  function emailReport(btn) {
    var body = buildReport();
    if (!ACCESS_KEY) {
      // No email service configured yet -> open a prefilled message instead.
      window.location.href = "mailto:" + DEST + "?subject=" + encodeURIComponent("Feedback — 132 North State Street") +
        "&body=" + encodeURIComponent(body.slice(0, 1700) + (body.length > 1700 ? "\n\n[…full feedback also downloaded — please attach it]" : ""));
      exportFile();
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        access_key: ACCESS_KEY,
        subject: "Feedback — 132 North State Street",
        from_name: "North State St — Jon's review",
        replyto: DEST,
        message: body
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success) toast("✓ Feedback emailed to Barrington");
      else { toast("Send failed — downloading instead"); exportFile(); }
    }).catch(function () { toast("Send failed — downloading instead"); exportFile(); })
      .then(function () { if (btn) { btn.disabled = false; btn.innerHTML = "✉ Send Feedback"; } });
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
      '<button class="nssr-btn nssr-primary" data-act="email">✉ Send Feedback</button>' +
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
      else if (act === "email") emailReport(b);
      else if (act === "reset") { if (confirm("Clear ALL your edits and notes? This cannot be undone.")) { localStorage.removeItem(KEY); location.reload(); } }
    });
    panel.querySelector('[data-act="close"]').addEventListener("click", function () { panel.classList.remove("nssr-open"); });
  }

  // ---------- in-page anchor scrolling (because <base> rewrites #links) ----------
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href*="#"]') : null;
    if (!a || a.closest(".nssr") || a.closest("[data-nssr-edit]")) return; // editable link -> let him edit it
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
