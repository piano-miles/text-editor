"use strict";

const WPM = 200;
const STORAGE_KEY_TEXT = "mte_text_v1";
const STORAGE_KEY_THEME = "mte_theme_v1";
const STORAGE_KEY_TITLE = "mte_title_v1";

const $ = (t) => document.getElementById(t);

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

function clamp(t, e, n) {
    return Math.min(n, Math.max(e, t));
}

function escapeHTML(t) {
    return t
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function spacesToDots(t) {
    const e = '<span class="tok-space">•</span>'.repeat(4);
    return t
        .replaceAll("\t", e)
        .replaceAll(" ", '<span class="tok-space">•</span>');
}

function findCommentIndex(t) {
    for (let e = 0; e < t.length - 1; e++) {
        if (t[e] === "/" && t[e + 1] === "/" && ":" !== (t[e - 1] || ""))
            return e;
    }
    return -1;
}

function getLineClass(t) {
    const e = t.match(/^(\s*)(.*)$/);
    const n = e ? e[2] : t;
    return n.startsWith("#")
        ? "tok-hash"
        : n.startsWith("- ")
        ? "tok-minus"
        : n.startsWith("+ ")
        ? "tok-plus"
        : /^\[x\]/i.test(n)
        ? "tok-done"
        : n.startsWith("**")
        ? "tok-star"
        : n.startsWith(">")
        ? "tok-quote"
        : "";
}

function countWords(t) {
    const e = t.trim();
    if (!e) return 0;
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const t = new Intl.Segmenter(void 0, {
            granularity: "word",
        });
        let n = 0;
        for (const o of t.segment(e)) if (o.isWordLike) n++;
        return n;
    }
    const n = e.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g);
    return n ? n.length : 0;
}

function countSentences(t) {
    const e = t.trim();
    if (!e) return 0;
    const n = e.match(/[.!?]+(?=\s|$)/g);
    return n ? n.length : 0;
}

function countParagraphs(t) {
    const e = t.trim();
    return e ? e.split(/\n\s*\n+/).length : 0;
}

function formatDurationSeconds(t) {
    const e = Math.max(0, Math.round(t));
    if (e < 60) return `${e} sec`;
    const n = Math.floor(e / 3600);
    const o = Math.floor((e % 3600) / 60);
    const i = e % 60;
    return n > 0
        ? `${n} hr ${String(o).padStart(2, "0")} min ${String(i).padStart(
              2,
              "0"
          )} sec`
        : `${o} min ${i} sec`;
}

function updateStats() {
    if (!editor) return;
    const t = editor.value;
    if (statChars) statChars.textContent = String(t.length);
    const e = countWords(t);
    if (statWords) statWords.textContent = String(e);
    if (statSentences) statSentences.textContent = String(countSentences(t));
    if (statParagraphs) statParagraphs.textContent = String(countParagraphs(t));
    const n = (e / WPM) * 60;
    if (statReadingTime) statReadingTime.textContent = formatDurationSeconds(n);
}

function renderHighlightText(t) {
    if (!highlight) return;
    if (!t) {
        highlight.innerHTML = "";
        return;
    }
    const e = t.split("\n");
    const n = [];
    for (const t of e) {
        const e = findCommentIndex(t);
        const o = e >= 0 ? t.slice(0, e) : t;
        const i = e >= 0 ? t.slice(e) : "";
        const a = getLineClass(o);
        const r = spacesToDots(escapeHTML(o));
        const s = i
            ? `<span class="tok-comment">${spacesToDots(escapeHTML(i))}</span>`
            : "";
        n.push(a ? `<span class="${a}">${r}</span>${s}` : `${r}${s}`);
    }
    highlight.innerHTML = n.join("\n");
}

function syncScroll() {
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
}

function scheduleRender() {
    if (!editor) return;
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
        renderPending = false;
        updateStats();
        renderHighlightText(editor.value);
        syncScroll();
    });
}

function showToast(t, e, n = 1100) {
    if (!toast || !e) return;
    toast.textContent = t;
    toast.classList.add("show");
    const o = e.getBoundingClientRect();
    const i = toast.getBoundingClientRect();
    const a = window.scrollX || document.documentElement.scrollLeft || 0;
    const r = window.scrollY || document.documentElement.scrollTop || 0;
    const s = r + o.top - i.height - 8;
    const l = a + o.left + o.width / 2 - i.width / 2;
    const c = clamp(s, r + 8, r + window.innerHeight - i.height - 8);
    const d = clamp(l, a + 8, a + window.innerWidth - i.width - 8);
    toast.style.top = `${c}px`;
    toast.style.left = `${d}px`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
    }, n);
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
            const t = document.execCommand("copy");
            editor.setSelectionRange(
                editor.selectionStart,
                editor.selectionEnd
            );
            showToast(t ? "Copied!" : "Copy failed", btnCopy);
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

function sanitizeFilenameBase(t) {
    return (
        String(t || "")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "-")
            .replace(/\s+/g, " ")
            .slice(0, 60) || "document"
    );
}

function defaultFilenameBase() {
    const t = new Date();
    return `document-${String(t.getFullYear())}-${String(
        t.getMonth() + 1
    ).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function getFilenameBase() {
    const t = titleEl?.textContent?.trim();
    return sanitizeFilenameBase(t) || defaultFilenameBase();
}

function downloadTxt() {
    if (!editor) return;
    const t = editor.value ?? "";
    const e = new Blob([t], {
        type: "text/plain;charset=utf-8",
    });
    const n = URL.createObjectURL(e);
    const o = document.createElement("a");
    o.href = n;
    o.download = `${getFilenameBase()}.txt`;
    document.body.appendChild(o);
    o.click();
    o.remove();
    window.setTimeout(() => URL.revokeObjectURL(n), 0);
}

function setTheme(t) {
    const e = t === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", e);
    try {
        localStorage.setItem(STORAGE_KEY_THEME, e);
    } catch {}
    if (themeIcon)
        themeIcon.src = e === "dark" ? "media/sun.svg" : "media/moon.svg";
}

function toggleTheme() {
    setTheme(
        (document.documentElement.getAttribute("data-theme") || "light") ===
            "dark"
            ? "light"
            : "dark"
    );
}

function inferInitialTheme() {
    let t = null;
    try {
        t = localStorage.getItem(STORAGE_KEY_THEME);
    } catch {}
    if (t === "light" || t === "dark") return t;
    const e = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return e ? "dark" : "light";
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

function onKeydown(t) {
    const e = navigator.platform?.toLowerCase().includes("mac");
    const n = e ? t.metaKey : t.ctrlKey;
    if (n && t.key.toLowerCase() === "s") {
        t.preventDefault();
        downloadTxt();
        return;
    }
    if (n && t.shiftKey && t.key.toLowerCase() === "c") {
        t.preventDefault();
        copyAll();
    }
}

function requestUpload() {
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
}

async function handleUploadFile(t) {
    if (!t || !editor) return;
    if (editor.value.trim().length > 0) {
        if (
            !window.confirm(
                "Replace the current text with the uploaded file contents?"
            )
        )
            return;
    }
    try {
        const e = await t.text();
        editor.value = e;
        scheduleRender();
        scheduleSave();
        editor.focus();
        showToast("Uploaded", btnUpload);
    } catch {
        showToast("Upload failed", btnUpload);
    }
}

async function handleTitlePaste(t) {
    if (!titleEl) return;
    t.preventDefault();
    const e = t.clipboardData?.getData("text/plain") ?? "";
    if (!e) return;
    if (document.queryCommandSupported?.("insertText")) {
        document.execCommand("insertText", false, e);
        return;
    }
    const n = window.getSelection?.();
    if (!n || n.rangeCount === 0) return;
    n.deleteFromDocument();
    n.getRangeAt(0).insertNode(document.createTextNode(e));
    n.collapseToEnd();
}

function initSystemThemeListener() {
    const t = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!t) return;
    t.addEventListener?.("change", () => {
        let t = null;
        try {
            t = localStorage.getItem(STORAGE_KEY_THEME);
        } catch {}
        if (t !== "light" && t !== "dark") setTheme(inferInitialTheme());
    });
}

function init() {
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
    btnTheme?.addEventListener("click", toggleTheme);

    btnUpload?.addEventListener("click", requestUpload);
    fileInput?.addEventListener("change", () => {
        const f = fileInput.files && fileInput.files[0];
        handleUploadFile(f);
    });

    if (titleEl) {
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
    requestAnimationFrame(() => {
        document.body.classList.add("page-ready");
    });
}

init();
