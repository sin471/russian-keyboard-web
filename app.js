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

let text = '';
let shiftActive = false;
let shiftLocked = false; // caps lock via double-tap
let lastShiftTap = 0;

const outputEl = document.getElementById('output');
const charCountEl = document.getElementById('char-count');
const copyBtn = document.getElementById('btn-copy');
const clearBtn = document.getElementById('btn-clear');
const keyboardEl = document.getElementById('keyboard');

function renderOutput() {
  outputEl.textContent = text;
  charCountEl.textContent = `${text.length} 文字`;
  outputEl.scrollTop = outputEl.scrollHeight;
}

function insert(char) {
  const ch = (shiftActive || shiftLocked) ? (UPPER[char] || char.toUpperCase()) : char;
  text += ch;
  if (shiftActive && !shiftLocked) {
    shiftActive = false;
    updateShiftState();
  }
  renderOutput();
}

function backspace() {
  if (text.length === 0) return;
  // Handle surrogate pairs
  const arr = [...text];
  arr.pop();
  text = arr.join('');
  renderOutput();
}

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

  // Update all letter key labels
  document.querySelectorAll('.key[data-char]').forEach(k => {
    const ch = k.dataset.char;
    const display = (shiftActive || shiftLocked) ? (UPPER[ch] || ch.toUpperCase()) : ch;
    k.textContent = display;
  });
}

function handleShift() {
  const now = Date.now();
  if (now - lastShiftTap < 400) {
    // Double tap = caps lock
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
        btn.addEventListener('pointerdown', e => { e.preventDefault(); handleShift(); btn.classList.add('pressed'); });
        btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));
      } else if (k === 'backspace') {
        btn.className += ' special backspace-key';
        btn.textContent = '⌫';
        let bsInterval;
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          backspace();
          bsInterval = setInterval(backspace, 120);
        });
        const stopBs = () => { clearInterval(bsInterval); btn.classList.remove('pressed'); };
        btn.addEventListener('pointerup', stopBs);
        btn.addEventListener('pointercancel', stopBs);
        btn.addEventListener('pointerleave', stopBs);
      } else if (k === 'space') {
        btn.className += ' special space-key';
        btn.textContent = 'スペース';
        btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); insert(' '); });
        btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));
      } else if (k === '—') {
        btn.className += ' special';
        btn.textContent = '—';
        btn.title = 'ダッシュ';
        btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); insert('—'); });
        btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));
      } else {
        btn.dataset.char = k;
        btn.textContent = k;
        if (k === 'ё') btn.className += ' yo-key';
        btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); insert(k); });
        btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
        btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));
      }

      rowEl.appendChild(btn);
    });

    keyboardEl.appendChild(rowEl);
  });
}

// Copy button
copyBtn.addEventListener('click', async () => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '✓ コピー済み';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.innerHTML = '📋 コピー';
      copyBtn.classList.remove('copied');
    }, 2000);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copyBtn.textContent = '✓ コピー済み';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.innerHTML = '📋 コピー';
      copyBtn.classList.remove('copied');
    }, 2000);
  }
});

// Clear button
clearBtn.addEventListener('click', () => {
  if (!text) return;
  if (confirm('テキストをクリアしますか？')) {
    text = '';
    renderOutput();
  }
});

// Keyboard shortcut support (physical keyboard)
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) return;

  if (e.key === 'Backspace') {
    e.preventDefault();
    backspace();
    return;
  }

  if (e.key === 'Shift') {
    handleShift();
    return;
  }

  if (e.key === 'CapsLock') {
    shiftLocked = !shiftLocked;
    shiftActive = false;
    updateShiftState();
    return;
  }
});

// PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Init
buildKeyboard();
renderOutput();
