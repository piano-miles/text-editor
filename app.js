"use strict";

const editor = document.getElementById("editor");
const highlight = document.getElementById("highlight");
const toast = document.getElementById("toast");

const statChars = document.getElementById("statChars");
const statWords = document.getElementById("statWords");
const statSentences = document.getElementById("statSentences");
const statParagraphs = document.getElementById("statParagraphs");
const statReadingTime = document.getElementById("statReadingTime");

const btnCopy = document.getElementById("btnCopy");
const btnDownload = document.getElementById("btnDownload");
const btnTheme = document.getElementById("btnTheme");
const themeIcon = document.getElementById("themeIcon");

const WPM = 200;
const STORAGE_KEY_TEXT = "mte_text_v1";
const STORAGE_KEY_THEME = "mte_theme_v1";

let toastTimer = 0;
let renderPending = false;
let saveTimer = 0;

function escapeHTML(s) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function spacesToDots(s) {
    const tabDots = '<span class="tok-space">•</span>'.repeat(4);
    return s
        .replaceAll("\t", tabDots)
        .replaceAll(" ", '<span class="tok-space">•</span>');
}

function findCommentIndex(line) {
    for (let i = 0; i < line.length - 1; i++) {
        if (line[i] === "/" && line[i + 1] === "/") {
            if ((line[i - 1] || "") !== ":") return i;
        }
    }
    return -1;
}

function getLineClass(line) {
    const m = line.match(/^(\s*)(.*)$/);
    const body = m ? m[2] : line;

    if (body.startsWith("#")) return "tok-hash";
    if (body.startsWith("- ")) return "tok-minus";
    if (body.startsWith("+ ")) return "tok-plus";
    if (/^\[x\]/i.test(body)) return "tok-done";
    if (body.startsWith("**")) return "tok-star";
    if (body.startsWith(">")) return "tok-quote";
    return "";
}

function countWords(text) {
    const t = text.trim();
    if (!t) return 0;

    if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: "word" });
        let c = 0;
        for (const part of seg.segment(t)) {
            if (part.isWordLike) c++;
        }
        return c;
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
    if (!t) return 0;
    return t.split(/\n\s*\n+/).length;
}

function formatDurationSeconds(seconds) {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s} sec`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;

    if (h > 0)
        return `${h} hr ${String(m).padStart(2, "0")} min ${String(r).padStart(
            2,
            "0"
        )} sec`;
    return `${m} min ${r} sec`;
}

function updateStats() {
    const t = editor.value;
    statChars.textContent = String(t.length);

    const words = countWords(t);
    statWords.textContent = String(words);
    statSentences.textContent = String(countSentences(t));
    statParagraphs.textContent = String(countParagraphs(t));

    const seconds = (words / WPM) * 60;
    statReadingTime.textContent = formatDurationSeconds(seconds);
}

function renderHighlightText(text) {
    if (!text) {
        highlight.innerHTML = "";
        return;
    }

    const lines = text.split("\n");
    const out = [];

    for (const line of lines) {
        const idx = findCommentIndex(line);
        const a = idx >= 0 ? line.slice(0, idx) : line;
        const c = idx >= 0 ? line.slice(idx) : "";

        const cls = getLineClass(a);
        const main = spacesToDots(escapeHTML(a));
        const comm = c
            ? `<span class="tok-comment">${spacesToDots(escapeHTML(c))}</span>`
            : "";

        if (cls) out.push(`<span class="${cls}">${main}</span>${comm}`);
        else out.push(`${main}${comm}`);
    }

    highlight.innerHTML = out.join("\n");
}

function syncScroll() {
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
}

function scheduleRender() {
    if (renderPending) return;
    renderPending = true;

    requestAnimationFrame(() => {
        renderPending = false;
        updateStats();
        renderHighlightText(editor.value);
        syncScroll();
    });
}

function showToast(message, anchorEl, duration = 1100) {
    if (!toast || !anchorEl) return;

    toast.textContent = message;

    const a = anchorEl.getBoundingClientRect();
    const t = toast.getBoundingClientRect();
    const top = Math.max(8, a.top - t.height - 8);
    const left = Math.max(8, a.left + a.width / 2 - t.width / 2);

    toast.style.top = `${top}px`;
    toast.style.left = `${left}px`;

    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
    }, duration);
}

async function copyAll() {
    const text = editor.value;
    if (!text) {
        showToast("Nothing to copy", btnCopy);
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
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

function safeFilenameBase() {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `document-${yyyy}-${mm}-${dd}`;
}

function downloadTxt() {
    const text = editor.value;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFilenameBase()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    // showToast("Downloaded", btnDownload);
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY_THEME, theme);

    const isDark = theme === "dark";
    themeIcon.src = isDark ? "media/sun.svg" : "media/moon.svg";
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(cur === "dark" ? "light" : "dark");
    // showToast("Theme toggled", btnTheme, 900);
}

function inferInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
        localStorage.setItem(STORAGE_KEY_TEXT, editor.value);
    }, 200);
}

function restoreText() {
    const saved = localStorage.getItem(STORAGE_KEY_TEXT);
    if (typeof saved === "string") editor.value = saved;
}

function onKeydown(e) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        downloadTxt();
    }

    if (mod && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyAll();
    }
}

setTheme(inferInitialTheme());
restoreText();
scheduleRender();
editor.focus();

editor.addEventListener("input", () => {
    scheduleRender();
    scheduleSave();
});
editor.addEventListener("scroll", syncScroll);
editor.addEventListener("keydown", onKeydown);

btnCopy.addEventListener("click", copyAll);
btnDownload.addEventListener("click", downloadTxt);
btnTheme.addEventListener("click", toggleTheme);

if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => {
        const saved = localStorage.getItem(STORAGE_KEY_THEME);
        if (saved !== "light" && saved !== "dark")
            setTheme(inferInitialTheme());
    });
}
