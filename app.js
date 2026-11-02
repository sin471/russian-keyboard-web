'use strict';

// ── Layout ─────────────────────────────────────────────
// Gboard式: 1段目11 / 2段目11 / 3段目9キー。
// ъ と ё は独立キーを持たず、長押しに逃がす（ъ は使用頻度が最低のため）。
const ROWS = [
  ['й','ц','у','к','е','н','г','ш','щ','з','х'],
  ['ф','ы','в','а','п','р','о','л','д','ж','э'],
  ['shift','я','ч','с','м','и','т','ь','б','ю','backspace'],
  ['.','space','—','enter']
];

// 長押しで出す代替文字。宿主は「血縁」で決める:
// ё は е の変化形、ъ は ь と対の符号。'.' には句読点一式。
const LONGPRESS = {
  'е': ['ё'],
  'ь': ['ъ'],
  '.': [',', '!', '?', '…']
};

const UPPER = {
  'й':'Й','ц':'Ц','у':'У','к':'К','е':'Е','н':'Н','г':'Г','ш':'Ш','щ':'Щ','з':'З','х':'Х',
  'ф':'Ф','ы':'Ы','в':'В','а':'А','п':'П','р':'Р','о':'О','л':'Л','д':'Д','ж':'Ж','э':'Э',
  'я':'Я','ч':'Ч','с':'С','м':'М','и':'И','т':'Т','ь':'Ь','б':'Б','ю':'Ю','.':',',
  'ё':'Ё','ъ':'Ъ'
};

const LONGPRESS_MS = 350;

let shiftActive = false;
let shiftLocked = false;
let lastShiftTap = 0;

const outputEl   = document.getElementById('output');
const charCountEl = document.getElementById('char-count');
const copyBtn    = document.getElementById('btn-copy');
const clearBtn   = document.getElementById('btn-clear');
const keyboardEl = document.getElementById('keyboard');
const suggestBar = document.getElementById('suggest-bar');
const toastEl    = document.getElementById('toast');
const popupEl    = document.getElementById('key-popup');
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
  updateSuggestions();
}

outputEl.addEventListener('input', updateCharCount);
outputEl.addEventListener('click', () => updateSuggestions());
outputEl.addEventListener('keyup', () => updateSuggestions());

// ── Insert at cursor ───────────────────────────────────
function insertAtCursor(ch) {
  const start = outputEl.selectionStart;
  const end   = outputEl.selectionEnd;
  const val   = outputEl.value;
  // 区切り文字が入ったら、直前の単語を学習する
  if (!/[а-яёА-ЯЁ]/.test(ch)) learnWordBefore(val, start);
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
    outputEl.value = val.slice(0, start) + val.slice(end);
    outputEl.selectionStart = outputEl.selectionEnd = start;
  } else {
    if (start === 0) return;
    const before = [...val.slice(0, start)];
    before.pop();
    const newBefore = before.join('');
    outputEl.value = newBefore + val.slice(start);
    outputEl.selectionStart = outputEl.selectionEnd = newBefore.length;
  }
  updateCharCount();
}

// ── Case ───────────────────────────────────────────────
function applyCase(ch) {
  return (shiftActive || shiftLocked) ? (UPPER[ch] || ch.toUpperCase()) : ch;
}

// ── Insert from virtual key ────────────────────────────
function insert(char) {
  const ch = applyCase(char);
  const savedStart = outputEl.selectionStart;
  const savedEnd   = outputEl.selectionEnd;
  outputEl.focus();
  outputEl.selectionStart = savedStart;
  outputEl.selectionEnd   = savedEnd;
  insertAtCursor(ch);
  if (shiftActive && !shiftLocked) {
    shiftActive = false;
    updateShiftState();
  }
}

// ── Long-press popup ───────────────────────────────────
// 方式: 通常タップは pointerdown で即入力し（従来通り）、
// 長押しが成立したらポップアップを出し、離した時点で
// 入力済みの1文字を選択中の代替文字に置き換える。
let lp = null; // {pointerId, timer, open, options, selected, insertPos, insertedLen, itemRects, keyRect}

function cancelLongpressTimer() {
  if (lp && lp.timer) {
    clearTimeout(lp.timer);
    lp.timer = null;
  }
}

function closePopup() {
  popupEl.classList.remove('show');
  popupEl.innerHTML = '';
  if (lp) {
    cancelLongpressTimer();
    lp.open = false;
  }
}

function openPopup(btn, options) {
  popupEl.innerHTML = '';
  options.forEach((ch, i) => {
    const item = document.createElement('span');
    item.className = 'kp-item' + (i === lp.selected ? ' selected' : '');
    item.textContent = ch;
    popupEl.appendChild(item);
  });
  popupEl.classList.add('show');

  // キーの真上に中央寄せで配置（画面端でクランプ）
  const keyRect = btn.getBoundingClientRect();
  lp.keyRect = keyRect;
  const pw = popupEl.offsetWidth;
  const ph = popupEl.offsetHeight;
  let left = keyRect.left + keyRect.width / 2 - pw / 2;
  left = Math.max(4, Math.min(left, window.innerWidth - pw - 4));
  let top = keyRect.top - ph - 8;
  if (top < 4) top = keyRect.bottom + 8;
  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;

  lp.itemRects = [...popupEl.children].map(el => el.getBoundingClientRect());
  lp.open = true;
  if (navigator.vibrate) navigator.vibrate(8);
}

function updatePopupSelection(clientX, clientY) {
  if (!lp || !lp.open) return;
  // キーのだいぶ下まで指が下がったらキャンセル扱い
  if (clientY > lp.keyRect.bottom + 28) {
    if (lp.selected !== -1) {
      lp.selected = -1;
      renderPopupSelection();
    }
    return;
  }
  let idx = lp.itemRects.findIndex(r => clientX >= r.left && clientX <= r.right);
  if (idx === -1) {
    // 項目の隙間・外側は最も近い項目に寄せる
    let best = 0;
    let bestDist = Infinity;
    lp.itemRects.forEach((r, i) => {
      const c = r.left + r.width / 2;
      const d = Math.abs(clientX - c);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    idx = best;
  }
  if (idx !== lp.selected) {
    lp.selected = idx;
    renderPopupSelection();
  }
}

function renderPopupSelection() {
  [...popupEl.children].forEach((el, i) => {
    el.classList.toggle('selected', i === lp.selected);
  });
}

function startLongpress(e, btn, char, insertPos, insertedLen, options) {
  cancelLongpressTimer();
  if (lp && lp.open) closePopup();
  lp = {
    pointerId: e.pointerId,
    timer: null,
    open: false,
    options,
    selected: 0,
    insertPos,
    insertedLen,
    itemRects: [],
    keyRect: null
  };
  lp.timer = setTimeout(() => {
    lp.timer = null;
    openPopup(btn, options);
  }, LONGPRESS_MS);
}

function finishLongpress(commit) {
  if (!lp) return;
  const wasOpen = lp.open;
  const state = lp;
  closePopup();
  lp = null;
  if (commit && wasOpen && state.selected >= 0) {
    const alt = state.options[state.selected];
    const val = outputEl.value;
    outputEl.focus();
    outputEl.value = val.slice(0, state.insertPos) + alt + val.slice(state.insertPos + state.insertedLen);
    outputEl.selectionStart = outputEl.selectionEnd = state.insertPos + alt.length;
    updateCharCount();
  }
}

// ── Shift / Caps Lock ──────────────────────────────────
function updateShiftState() {
  const shiftKey = document.querySelector('.shift-key');
  if (shiftKey) {
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
  }
  document.querySelectorAll('.key[data-char]').forEach(k => {
    const ch = k.dataset.char;
    const main = k.querySelector('.key-main');
    if (main) main.textContent = applyCase(ch);
    const hint = k.querySelector('.alt-hint');
    if (hint && LONGPRESS[ch]) hint.textContent = applyCase(LONGPRESS[ch][0]);
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
function attachPressFx(btn, onDown, onUp) {
  btn.addEventListener('pointerdown', e => {
    btn.classList.add('pressed');
    onDown && onDown(e);
  });
  const release = e => {
    btn.classList.remove('pressed');
    onUp && onUp(e);
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
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
        let bsTimeout = null;
        let bsInterval = null;
        const stopBs = () => {
          clearTimeout(bsTimeout);
          clearInterval(bsInterval);
          bsTimeout = bsInterval = null;
          btn.classList.remove('pressed');
        };
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          outputEl.focus();
          backspaceAtCursor();
          // 長押しリピートは少し待ってから開始（押しっぱなし誤爆防止）
          bsTimeout = setTimeout(() => {
            bsInterval = setInterval(() => { outputEl.focus(); backspaceAtCursor(); }, 70);
          }, 400);
        });
        btn.addEventListener('pointerup',    stopBs);
        btn.addEventListener('pointercancel', stopBs);
        btn.addEventListener('pointerleave', stopBs);

      } else if (k === 'space') {
        btn.className += ' special space-key';
        btn.textContent = 'スペース';
        attachPressFx(btn, e => {
          e.preventDefault();
          insert(' ');
        });

      } else if (k === '—') {
        btn.className += ' special';
        btn.textContent = '—';
        btn.title = 'ダッシュ';
        attachPressFx(btn, e => {
          e.preventDefault();
          insert('—');
        });

      } else if (k === 'enter') {
        btn.className += ' special enter-key';
        btn.textContent = '↵';
        btn.title = '改行';
        attachPressFx(btn, e => {
          e.preventDefault();
          insertAtCursor('\n');
          outputEl.focus();
        });

      } else {
        // 通常文字キー
        btn.dataset.char = k;
        const main = document.createElement('span');
        main.className = 'key-main';
        main.textContent = k;
        btn.appendChild(main);

        const alts = LONGPRESS[k];
        if (alts) {
          const hint = document.createElement('span');
          hint.className = 'alt-hint';
          hint.textContent = alts[0];
          btn.appendChild(hint);
        }

        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          try { btn.setPointerCapture(e.pointerId); } catch {}
          // 長押し候補はシフト消費前に確定させる
          const options = alts ? alts.map(applyCase) : null;
          const insertPos = outputEl.selectionStart ?? outputEl.value.length;
          insert(k);
          if (options) {
            startLongpress(e, btn, k, insertPos, applyCase(k).length, options);
          } else if (lp) {
            finishLongpress(false);
          }
        });
        btn.addEventListener('pointermove', e => {
          if (lp && lp.pointerId === e.pointerId && lp.open) {
            updatePopupSelection(e.clientX, e.clientY);
          }
        });
        const endPress = e => {
          btn.classList.remove('pressed');
          if (lp && lp.pointerId === e.pointerId) {
            finishLongpress(e.type === 'pointerup');
          }
        };
        btn.addEventListener('pointerup', endPress);
        btn.addEventListener('pointercancel', endPress);
      }

      rowEl.appendChild(btn);
    });

    keyboardEl.appendChild(rowEl);
  });
}

keyboardEl.addEventListener('contextmenu', e => e.preventDefault());

// ── Predictions ────────────────────────────────────────
// 辞書は頻度順の語形リスト（dict.txt）。照合は ё→е に正規化して行う。
// 候補は前方一致を基本に、足りない分をあいまい検索（編集距離）で埋める。
let DICT = [];        // 表示形
let DICT_N = [];      // 正規化形
let dictReady = false;
const firstLetterIdx = new Map();  // 正規化1文字目 -> [index...]（頻度順）
const twoLetterIdx = new Map();    // 正規化2文字prefix -> [index...]
const NORM2DISPLAY = new Map();    // 正規化形 -> 表示形
let learned = {};
try { learned = JSON.parse(localStorage.getItem('ru-kb-learned') || '{}'); } catch { learned = {}; }

// ЙЦУКЕНの物理的な隣接キー（誤打の置換コストを下げるため）
const NEIGHBORS = (() => {
  const rows = ['йцукенгшщзх', 'фывапролджэ', 'ячсмитьбю'];
  const map = new Map();
  rows.forEach(r => {
    [...r].forEach((ch, i) => {
      const set = new Set();
      if (i > 0) set.add(r[i - 1]);
      if (i < r.length - 1) set.add(r[i + 1]);
      map.set(ch, set);
    });
  });
  return map;
})();

function normalizeWord(w) {
  return w.toLowerCase().replace(/ё/g, 'е');
}

function effRank(i) {
  return i - (learned[DICT[i]] || 0) * 400;
}

function learnWord(displayWord) {
  if (!displayWord || displayWord.length < 2) return;
  learned[displayWord] = (learned[displayWord] || 0) + 1;
  const keys = Object.keys(learned);
  if (keys.length > 800) {
    keys.sort((a, b) => learned[a] - learned[b]);
    keys.slice(0, keys.length - 800).forEach(k => delete learned[k]);
  }
  try { localStorage.setItem('ru-kb-learned', JSON.stringify(learned)); } catch {}
}

function learnWordBefore(val, pos) {
  if (!dictReady || pos == null) return;
  let s = pos;
  while (s > 0 && /[а-яёА-ЯЁ]/.test(val[s - 1])) s--;
  if (s === pos) return;
  const display = NORM2DISPLAY.get(normalizeWord(val.slice(s, pos)));
  if (display) learnWord(display);
}

// 重み付き編集距離（Damerau）。隣接キーへの置換は 0.5、入れ替えは 1。
function editCost(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return Infinity;
  let prev2 = null;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : (NEIGHBORS.get(a[i - 1])?.has(b[j - 1]) ? 0.5 : 1);
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
    }
    prev2 = prev; prev = cur; cur = new Array(n + 1);
  }
  return prev[n];
}

function currentFragment() {
  const start = outputEl.selectionStart;
  const end = outputEl.selectionEnd;
  if (start == null || start !== end) return null;
  const val = outputEl.value;
  let s = start;
  while (s > 0 && /[а-яёА-ЯЁ]/.test(val[s - 1])) s--;
  if (s === start) return null;
  return { text: val.slice(s, start), start: s, end: start };
}

function computeSuggestions(fragText) {
  const f = normalizeWord(fragText);
  const out = [];
  const seen = new Set();

  // 前方一致（頻度順バケットから集め、学習ブーストで並べ替え）
  const bucket = (f.length >= 2 ? twoLetterIdx.get(f.slice(0, 2)) : firstLetterIdx.get(f[0])) || [];
  const prefixHits = [];
  for (const i of bucket) {
    if (DICT_N[i].startsWith(f)) {
      prefixHits.push(i);
      if (prefixHits.length >= 40) break;
    }
  }
  prefixHits.sort((a, b) => effRank(a) - effRank(b));
  for (const i of prefixHits) {
    if (out.length >= 3) break;
    out.push(i);
    seen.add(i);
  }

  // あいまい検索で残りを埋める
  if (out.length < 3) {
    const maxCost = f.length <= 5 ? 1.0 : 2.0;
    const firstChars = new Set([f[0], ...(NEIGHBORS.get(f[0]) || [])]);
    const pool = new Set();
    firstChars.forEach(c => (firstLetterIdx.get(c) || []).forEach(i => pool.add(i)));
    const fuzzy = [];
    for (const i of pool) {
      if (seen.has(i)) continue;
      const w = DICT_N[i];
      if (w === f) continue;
      if (Math.abs(w.length - f.length) > 2) continue;
      const cost = editCost(f, w);
      if (cost <= maxCost) fuzzy.push([cost, effRank(i), i]);
    }
    fuzzy.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , i] of fuzzy) {
      if (out.length >= 3) break;
      out.push(i);
    }
  }

  const cap = /^[А-ЯЁ]/.test(fragText);
  return out.map(i => {
    const w = DICT[i];
    return cap ? w[0].toUpperCase() + w.slice(1) : w;
  });
}

function renderSuggestions(list) {
  suggestBar.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggest-item';
    const word = list[i];
    if (word) {
      btn.textContent = word;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        applySuggestion(word);
      });
    }
    suggestBar.appendChild(btn);
  }
}

function updateSuggestions() {
  if (!dictReady || !suggestBar) { renderSuggestions([]); return; }
  const frag = currentFragment();
  if (!frag) { renderSuggestions([]); return; }
  renderSuggestions(computeSuggestions(frag.text));
}

function applySuggestion(word) {
  const frag = currentFragment();
  if (!frag) return;
  const val = outputEl.value;
  outputEl.focus();
  outputEl.value = val.slice(0, frag.start) + word + ' ' + val.slice(frag.end);
  outputEl.selectionStart = outputEl.selectionEnd = frag.start + word.length + 1;
  learnWord(NORM2DISPLAY.get(normalizeWord(word)) || word.toLowerCase());
  updateCharCount();
}

function loadDict() {
  if (typeof fetch !== 'function') return;
  fetch('./dict.txt')
    .then(r => r.text())
    .then(text => {
      DICT = text.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
      DICT_N = DICT.map(normalizeWord);
      DICT_N.forEach((w, i) => {
        if (!firstLetterIdx.has(w[0])) firstLetterIdx.set(w[0], []);
        firstLetterIdx.get(w[0]).push(i);
        if (w.length >= 2) {
          const k = w.slice(0, 2);
          if (!twoLetterIdx.has(k)) twoLetterIdx.set(k, []);
          twoLetterIdx.get(k).push(i);
        }
        if (!NORM2DISPLAY.has(w)) NORM2DISPLAY.set(w, DICT[i]);
      });
      dictReady = true;
      updateSuggestions();
    })
    .catch(() => {});
}

loadDict();

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
buildKeyboard();
updateCharCount();
outputEl.focus();
