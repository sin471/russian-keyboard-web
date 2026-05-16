'use strict';

const ROWS = [
  ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],
  ['ф','ы','в','а','п','р','о','л','д','ж','э'],
  ['shift','я','ч','с','м','и','т','ь','б','ю','.','backspace'],
  ['ё','space','—']
];

const UPPER = {
  'й':'Й','ц':'Ц','у':'У','к':'К','е':'Е','н':'Н','г':'Г','ш':'Ш','щ':'Щ','з':'З','х':'Х','ъ':'Ъ',
  'ф':'Ф','ы':'Ы','в':'В','а':'А','п':'П','р':'Р','о':'О','л':'Л','д':'Д','ж':'Ж','э':'Э',
  'я':'Я','ч':'Ч','с':'С','м':'М','и':'И','т':'Т','ь':'Ь','б':'Б','ю':'Ю','.':',','ё':'Ё'
};

let shiftActive = false;
let shiftLocked = false;
let lastShiftTap = 0;

const outputEl   = document.getElementById('output');
const charCountEl = document.getElementById('char-count');
const copyBtn    = document.getElementById('btn-copy');
const clearBtn   = document.getElementById('btn-clear');
const keyboardEl = document.getElementById('keyboard');
const toastEl    = document.getElementById('toast');
const modalOverlay = document.getElementById('modal-overlay');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

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

// ── Char count ─────────────────────────────────────────
function updateCharCount() {
  charCountEl.textContent = `${[...outputEl.value].length} 文字`;
}

outputEl.addEventListener('input', updateCharCount);

// ── Insert at cursor ───────────────────────────────────
function insertAtCursor(ch) {
  const start = outputEl.selectionStart;
  const end   = outputEl.selectionEnd;
  const val   = outputEl.value;
  outputEl.value = val.slice(0, start) + ch + val.slice(end);
  const pos = start + ch.length;
  outputEl.selectionStart = outputEl.selectionEnd = pos;
  updateCharCount();
}

function backspaceAtCursor() {
  outputEl.focus();
  const start = outputEl.selectionStart;
  const end   = outputEl.selectionEnd;
  const val   = outputEl.value;

  if (start !== end) {
    // Delete selection
    outputEl.value = val.slice(0, start) + val.slice(end);
    outputEl.selectionStart = outputEl.selectionEnd = start;
  } else {
    if (start === 0) return;
    // Delete grapheme before cursor (handle surrogate pairs)
    const before = [...val.slice(0, start)];
    before.pop();
    const newBefore = before.join('');
    outputEl.value = newBefore + val.slice(start);
    outputEl.selectionStart = outputEl.selectionEnd = newBefore.length;
  }
  updateCharCount();
}

// ── Insert from virtual key ────────────────────────────
function insert(char) {
  const ch = (shiftActive || shiftLocked) ? (UPPER[char] || char.toUpperCase()) : char;
  // Save cursor position before any possible focus change
  const savedStart = outputEl.selectionStart;
  const savedEnd   = outputEl.selectionEnd;
  outputEl.focus();
  // Restore selection (focus() may reset it to end)
  outputEl.selectionStart = savedStart;
  outputEl.selectionEnd   = savedEnd;
  insertAtCursor(ch);
  if (shiftActive && !shiftLocked) {
    shiftActive = false;
    updateShiftState();
  }
}

// ── Shift / Caps Lock ──────────────────────────────────
function updateShiftState() {
  const shiftKey = document.querySelector('.shift-key');
  if (!shiftKey) return;
  if (shiftLocked) {
    shiftKey.classList.add('active');
    shiftKey.textContent = '⇪';
  } else if (shiftActive) {
    shiftKey.classList.add('active');
    shiftKey.textContent = '⇧';
  } else {
    shiftKey.classList.remove('active');
    shiftKey.textContent = '⇧';
  }
  document.querySelectorAll('.key[data-char]').forEach(k => {
    const ch = k.dataset.char;
    k.textContent = (shiftActive || shiftLocked) ? (UPPER[ch] || ch.toUpperCase()) : ch;
  });
}

function handleShift() {
  const now = Date.now();
  if (now - lastShiftTap < 400) {
    shiftLocked = !shiftLocked;
    shiftActive = false;
  } else {
    if (shiftLocked) {
      shiftLocked = false;
      shiftActive = false;
    } else {
      shiftActive = !shiftActive;
    }
  }
  lastShiftTap = now;
  updateShiftState();
}

// ── Build keyboard ─────────────────────────────────────
function buildKeyboard() {
  keyboardEl.innerHTML = '';

  ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'key-row';

    row.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'key';
      btn.type = 'button';

      if (k === 'shift') {
        btn.className += ' special shift-key';
        btn.textContent = '⇧';
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          handleShift();
          btn.classList.add('pressed');
        });
        btn.addEventListener('pointerup',    () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel',() => btn.classList.remove('pressed'));

      } else if (k === 'backspace') {
        btn.className += ' special backspace-key';
        btn.textContent = '⌫';
        let bsInterval;
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          outputEl.focus();
          backspaceAtCursor();
          bsInterval = setInterval(() => { outputEl.focus(); backspaceAtCursor(); }, 120);
        });
        const stopBs = () => { clearInterval(bsInterval); btn.classList.remove('pressed'); };
        btn.addEventListener('pointerup',    stopBs);
        btn.addEventListener('pointercancel',stopBs);
        btn.addEventListener('pointerleave', stopBs);

      } else if (k === 'space') {
        btn.className += ' special space-key';
        btn.textContent = 'スペース';
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          insert(' ');
        });
        btn.addEventListener('pointerup',    () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel',() => btn.classList.remove('pressed'));

      } else if (k === '—') {
        btn.className += ' special';
        btn.textContent = '—';
        btn.title = 'ダッシュ';
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          insert('—');
        });
        btn.addEventListener('pointerup',    () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel',() => btn.classList.remove('pressed'));

      } else {
        btn.dataset.char = k;
        btn.textContent = k;
        if (k === 'ё') btn.className += ' yo-key';
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          insert(k);
        });
        btn.addEventListener('pointerup',    () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel',() => btn.classList.remove('pressed'));
      }

      rowEl.appendChild(btn);
    });

    keyboardEl.appendChild(rowEl);
  });
}

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
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Init ───────────────────────────────────────────────
buildKeyboard();
updateCharCount();
// Auto-focus so cursor is visible from the start
outputEl.focus();
