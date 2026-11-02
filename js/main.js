import { outputEl, copyBtn, clearBtn, toastEl, modalOverlay, modalCancel, modalConfirm } from './state.js';
import { initEditor, updateCharCount } from './editor.js';
import { buildKeyboard } from './keyboard.js';
import { loadDict } from './dict.js';
import { updateSuggestions } from './predict.js';

// ── Toast ──────────────────────────────────────────────
let toastTimer = null;

function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2500);
}

// ── Modal ──────────────────────────────────────────────
function showModal() {
  modalOverlay.classList.add('show');
}

function hideModal() {
  modalOverlay.classList.remove('show');
}

modalCancel.addEventListener('click', hideModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) hideModal();
});
modalConfirm.addEventListener('click', () => {
  outputEl.value = '';
  updateCharCount();
  hideModal();
  showToast('クリアしました', 'success');
  outputEl.focus();
});

// ── Copy button ────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  const text = outputEl.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 コピーしました', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('📋 コピーしました', 'success');
  }
});

// ── Clear button ───────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (!outputEl.value) return;
  showModal();
});

// ── PWA service worker ─────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ── Init ───────────────────────────────────────────────
initEditor();
buildKeyboard();
loadDict(() => updateSuggestions());
updateCharCount();
outputEl.focus();
