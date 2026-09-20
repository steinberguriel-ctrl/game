const STORAGE_KEY = 'finish-line.lang';
const FALLBACK = 'en';

let data = { languages: { en: 'English' }, translations: { en: {} } };
try {
    const response = await fetch('translations.json');
    if (response.ok) data = await response.json();
} catch {
    // Keep the built-in defaults; the HTML already contains English text.
}

function detectLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && data.translations[stored]) return stored;
    const browser = (navigator.language || FALLBACK).slice(0, 2).toLowerCase();
    return data.translations[browser] ? browser : FALLBACK;
}

let lang = detectLanguage();
let changeHandler = null;
let currentModal = null;

export const getLanguage = () => lang;
export const getLanguages = () => data.languages;

function lookup(key) {
    return data.translations[lang]?.[key] ?? data.translations[FALLBACK]?.[key];
}

export function t(key, params = {}) {
    const text = lookup(key);
    if (text === undefined) return key;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

// Replaces the element's own text but keeps child elements (e.g. an arrow <span>) and edge whitespace.
function setText(element, text) {
    const node = [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());
    if (node) {
        const [, start, end] = node.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/);
        node.nodeValue = start + text + end;
    } else if (!element.children.length) {
        element.textContent = text;
    }
}

export function applyTranslations(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(element => {
        const text = lookup(element.dataset.i18n);
        if (text !== undefined) setText(element, text);
    });
    root.querySelectorAll('[data-i18n-html]').forEach(element => {
        const text = lookup(element.dataset.i18nHtml);
        if (text !== undefined) element.innerHTML = text;
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(element => {
        const text = lookup(element.dataset.i18nAria);
        if (text !== undefined) element.setAttribute('aria-label', text);
    });
    const titled = root.querySelector('[data-i18n-title]');
    if (titled) document.title = t(titled.dataset.i18nTitle);
}

// Only one page script is alive at a time (pages swap the whole body), so a single slot is enough.
export function onLanguageChange(handler) {
    changeHandler = handler;
}

export function setLanguage(code) {
    if (!data.translations[code] || code === lang) return;
    lang = code;
    localStorage.setItem(STORAGE_KEY, code);
    applyTranslations();
    document.querySelector('.settings-button')?.setAttribute('aria-label', t('settings.title'));
    changeHandler?.();
    if (currentModal) renderSettings(currentModal);
}

function ensureStyles() {
    if (document.querySelector('link[href="settings.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'settings.css';
    document.head.appendChild(link);
}

function renderSettings(modal) {
    modal.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'settings-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'settings-close';
    close.textContent = '×';
    close.setAttribute('aria-label', t('settings.close'));
    close.addEventListener('click', () => { modal.hidden = true; });

    const title = document.createElement('h2');
    title.textContent = t('settings.title');
    const label = document.createElement('span');
    label.className = 'settings-label';
    label.textContent = t('settings.language');

    const list = document.createElement('div');
    list.className = 'settings-languages';
    Object.entries(data.languages).forEach(([code, name]) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'settings-language' + (code === lang ? ' active' : '');
        option.textContent = name;
        option.lang = code;
        option.setAttribute('aria-pressed', String(code === lang));
        option.addEventListener('click', () => setLanguage(code));
        list.appendChild(option);
    });

    box.append(close, title, label, list);
    modal.appendChild(box);
}

export function initSettings() {
    ensureStyles();
    document.querySelectorAll('.settings-button, .settings-modal').forEach(node => node.remove());

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-button' + (document.querySelector('.home-app') ? ' on-home' : '');
    button.textContent = '⚙';
    button.setAttribute('aria-label', t('settings.title'));

    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.hidden = true;
    currentModal = modal;
    renderSettings(modal);

    button.addEventListener('click', () => { renderSettings(modal); modal.hidden = false; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
    document.body.append(button, modal);
}

window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && currentModal && !currentModal.hidden) currentModal.hidden = true;
});
