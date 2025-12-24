"use strict";

const WPM = 200;
const STORAGE_KEY_TEXT = "mte_text_v1";
const STORAGE_KEY_THEME = "mte_theme_v1";
const STORAGE_KEY_TITLE = "mte_title_v1";

const $ = (id) => document.getElementById(id);

const editor = $("editor");
const highlight = $("highlight");
const toast = $("toast");
const statChars = $("statChars");
const statWords = $("statWords");
const statSentences = $("statSentences");
const statParagraphs = $("statParagraphs");
const statReadingTime = $("statReadingTime");
const btnCopy = $("btnCopy");
const btnDownload = $("btnDownload");
const btnTheme = $("btnTheme");
const themeIcon = $("themeIcon");
const btnUpload = $("btnUpload");
const fileInput = $("fileInput");
const titleEl = $("title");

let toastTimer = 0;
let renderPending = false;
let saveTimer = 0;
let titleSaveTimer = 0;

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function escapeHTML(s) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function spacesToDots(s) {
    const tab = '<span class="tok-space">•</span>'.repeat(4);
    return s
        .replaceAll("\t", tab)
        .replaceAll(" ", '<span class="tok-space">•</span>');
}

function findCommentIndex(line) {
    for (let i = 0; i < line.length - 1; i++) {
        if (
            line[i] === "/" &&
            line[i + 1] === "/" &&
            (line[i - 1] || "") !== ":"
        )
            return i;
    }
    return -1;
}

function getLineClass(line) {
    const m = line.match(/^(\s*)(.*)$/);
    const core = m ? m[2] : line;
    return core.startsWith("#")
        ? "tok-hash"
        : core.startsWith("- ")
        ? "tok-minus"
        : core.startsWith("+ ")
        ? "tok-plus"
        : /^\[x\]/i.test(core)
        ? "tok-done"
        : core.startsWith("**")
        ? "tok-star"
        : core.startsWith(">")
        ? "tok-quote"
        : "";
}

function countWords(text) {
    const t = text.trim();
    if (!t) return 0;
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const seg = new Intl.Segmenter(void 0, {
            granularity: "word",
        });
        let n = 0;
        for (const part of seg.segment(t)) if (part.isWordLike) n++;
        return n;
    }
    const m = t.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g);
    return m ? m.length : 0;
}

function countSentences(text) {
    const t = text.trim();
    if (!t) return 0;
    const m = t.match(/[.!?]+(?=\s|$)/g);
    return m ? m.length : 0;
}

function countParagraphs(text) {
    const t = text.trim();
    return t ? t.split(/\n\s*\n+/).length : 0;
}

function formatDurationSeconds(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return `${s} sec`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h > 0
        ? `${h} hr ${String(m).padStart(2, "0")} min ${String(r).padStart(
              2,
              "0"
          )} sec`
        : `${m} min ${r} sec`;
}

function updateStats() {
    if (!editor) return;
    const t = editor.value;
    if (statChars) statChars.textContent = String(t.length);
    const w = countWords(t);
    if (statWords) statWords.textContent = String(w);
    if (statSentences) statSentences.textContent = String(countSentences(t));
    if (statParagraphs) statParagraphs.textContent = String(countParagraphs(t));
    const secs = (w / WPM) * 60;
    if (statReadingTime)
        statReadingTime.textContent = formatDurationSeconds(secs);
}

function renderHighlightText(text) {
    if (!highlight) return;
    if (!text) {
        highlight.innerHTML = "";
        return;
    }
    const lines = text.split("\n");
    const out = [];
    for (const line of lines) {
        const ci = findCommentIndex(line);
        const left = ci >= 0 ? line.slice(0, ci) : line;
        const right = ci >= 0 ? line.slice(ci) : "";
        const cls = getLineClass(left);
        const leftHtml = spacesToDots(escapeHTML(left));
        const rightHtml = right
            ? `<span class="tok-comment">${spacesToDots(
                  escapeHTML(right)
              )}</span>`
            : "";
        out.push(
            cls
                ? `<span class="${cls}">${leftHtml}</span>${rightHtml}`
                : `${leftHtml}${rightHtml}`
        );
    }
    highlight.innerHTML = out.join("\n");
}

function syncScroll() {
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
}

function scheduleRender() {
    if (!editor || renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
        renderPending = false;
        updateStats();
        renderHighlightText(editor.value);
        syncScroll();
    });
}

function showToast(text, anchorEl, duration = 1100) {
    if (!toast || !anchorEl) return;
    toast.textContent = text;
    toast.classList.add("show");
    const a = anchorEl.getBoundingClientRect();
    const b = toast.getBoundingClientRect();
    const sx = window.scrollX || document.documentElement.scrollLeft || 0;
    const sy = window.scrollY || document.documentElement.scrollTop || 0;
    const top = sy + a.top - b.height - 8;
    const left = sx + a.left + a.width / 2 - b.width / 2;
    const t = clamp(top, sy + 8, sy + window.innerHeight - b.height - 8);
    const l = clamp(left, sx + 8, sx + window.innerWidth - b.width - 8);
    toast.style.top = `${t}px`;
    toast.style.left = `${l}px`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
        () => toast.classList.remove("show"),
        duration
    );
}

async function copyAll() {
    if (!editor) return;
    const t = editor.value;
    if (!t) {
        showToast("Nothing to copy", btnCopy);
        return;
    }
    try {
        await navigator.clipboard.writeText(t);
        showToast("Copied!", btnCopy);
    } catch {
        try {
            editor.focus();
            editor.select();
            const ok = document.execCommand("copy");
            editor.setSelectionRange(
                editor.selectionStart,
                editor.selectionEnd
            );
            showToast(ok ? "Copied!" : "Copy failed", btnCopy);
        } catch {
            showToast("Copy failed", btnCopy);
        }
    }
}

function onNativeCopy() {
    if (!editor) return;
    if (document.activeElement !== editor) return;
    showToast(
        (editor.selectionStart ?? 0) === (editor.selectionEnd ?? 0)
            ? "Nothing selected"
            : "Selection copied",
        btnCopy
    );
}

function sanitizeFilenameBase(s) {
    return (
        String(s || "")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "-")
            .replace(/\s+/g, " ")
            .slice(0, 60) || "document"
    );
}

function defaultFilenameBase() {
    const d = new Date();
    return `document-${String(d.getFullYear())}-${String(
        d.getMonth() + 1
    ).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getFilenameBase() {
    const t = titleEl?.textContent?.trim();
    return sanitizeFilenameBase(t) || defaultFilenameBase();
}

function downloadTxt() {
    if (!editor) return;
    const t = editor.value ?? "";
    const blob = new Blob([t], {
        type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getFilenameBase()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function systemPrefersDark() {
    return !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
}

function setMetaThemeColorFor(theme) {
    const light = document.querySelector(
        'meta[name="theme-color"][media="(prefers-color-scheme: light)"]'
    );
    const dark = document.querySelector(
        'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'
    );
    if (!light || !dark) return;

    const isDark = theme === "dark";
    const active = isDark ? dark : light;
    const content =
        active.getAttribute("content") || (isDark ? "#000000" : "#ffffff");

    let plain = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!plain) {
        plain = document.createElement("meta");
        plain.setAttribute("name", "theme-color");
        document.head.appendChild(plain);
    }
    plain.setAttribute("content", content);
}

function setTheme(theme) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.colorScheme = "light dark";
    setMetaThemeColorFor(t);
    try {
        localStorage.setItem(STORAGE_KEY_THEME, t);
    } catch {}
    if (themeIcon)
        themeIcon.src = t === "dark" ? "media/sun.svg" : "media/moon.svg";
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(cur === "dark" ? "light" : "dark");
}

function inferInitialTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem(STORAGE_KEY_THEME);
    } catch {}
    if (saved === "light" || saved === "dark") return saved;
    return systemPrefersDark() ? "dark" : "light";
}

function scheduleSave() {
    if (!editor) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_KEY_TEXT, editor.value);
        } catch {}
    }, 200);
}

function restoreText() {
    if (!editor) return;
    try {
        const t = localStorage.getItem(STORAGE_KEY_TEXT);
        if (typeof t === "string") editor.value = t;
    } catch {}
}

function saveTitle() {
    if (!titleEl) return;
    const t = titleEl.textContent.trim() || "Minimal Text Editor";
    titleEl.textContent = t;
    try {
        localStorage.setItem(STORAGE_KEY_TITLE, t);
    } catch {}
    document.title = t;
}

function restoreTitle() {
    if (!titleEl) return;
    try {
        const t = localStorage.getItem(STORAGE_KEY_TITLE);
        if (typeof t === "string" && t.trim()) {
            titleEl.textContent = t;
            document.title = t;
        }
    } catch {}
}

function scheduleTitleSave() {
    window.clearTimeout(titleSaveTimer);
    titleSaveTimer = window.setTimeout(saveTitle, 200);
}

function onKeydown(e) {
    const isMac = navigator.platform?.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        downloadTxt();
        return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyAll();
    }
}

function requestUpload() {
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
}

async function handleUploadFile(file) {
    if (!file || !editor) return;
    if (editor.value.trim().length > 0) {
        if (
            !window.confirm(
                "Replace the current text with the uploaded file contents?"
            )
        )
            return;
    }
    try {
        const t = await file.text();
        editor.value = t;
        scheduleRender();
        scheduleSave();
        editor.focus();
        showToast("Uploaded", btnUpload);
    } catch {
        showToast("Upload failed", btnUpload);
    }
}

async function handleTitlePaste(e) {
    if (!titleEl) return;
    e.preventDefault();
    const t = e.clipboardData?.getData("text/plain") ?? "";
    if (!t) return;
    if (document.queryCommandSupported?.("insertText")) {
        document.execCommand("insertText", false, t);
        return;
    }
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    sel.deleteFromDocument();
    sel.getRangeAt(0).insertNode(document.createTextNode(t));
    sel.collapseToEnd();
}

function initSystemThemeListener() {
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;

    const onChange = () => {
        let saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY_THEME);
        } catch {}
        if (saved !== "light" && saved !== "dark")
            setTheme(systemPrefersDark() ? "dark" : "light");
    };

    mql.addEventListener?.("change", onChange);
    mql.addListener?.(onChange);
}

function init() {
    document.documentElement.classList.remove("theme-boot");
    setTheme(inferInitialTheme());
    restoreText();
    restoreTitle();
    scheduleRender();
    editor?.focus();

    editor?.addEventListener("input", () => {
        scheduleRender();
        scheduleSave();
    });
    editor?.addEventListener("scroll", syncScroll, {
        passive: true,
    });
    editor?.addEventListener("keydown", onKeydown);
    editor?.addEventListener("copy", onNativeCopy);

    btnCopy?.addEventListener("click", copyAll);
    btnDownload?.addEventListener("click", downloadTxt);
    btnTheme?.addEventListener("click", () => {
        setTheme(
            (document.documentElement.getAttribute("data-theme") || "light") ===
                "dark"
                ? "light"
                : "dark"
        );
    });

    btnUpload?.addEventListener("click", requestUpload);
    fileInput?.addEventListener("change", () => {
        const f = fileInput.files && fileInput.files[0];
        handleUploadFile(f);
    });

    if (titleEl) {
        titleEl.addEventListener("input", scheduleTitleSave);
        titleEl.addEventListener("blur", saveTitle);
        titleEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                titleEl.blur();
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                restoreTitle();
                titleEl.blur();
            }
        });
        titleEl.addEventListener("paste", handleTitlePaste);
    }

    initSystemThemeListener();
    requestAnimationFrame(() => document.body.classList.add("page-ready"));
}

init();
