import { outputEl, keyboardEl, popupEl, shiftState } from './state.js';
import { insertAtCursor, backspaceAtCursor, updateCharCount } from './editor.js';

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

// ── Case ───────────────────────────────────────────────
function applyCase(ch) {
  return (shiftState.active || shiftState.locked) ? (UPPER[ch] || ch.toUpperCase()) : ch;
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
  if (shiftState.active && !shiftState.locked) {
    shiftState.active = false;
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

function startLongpress(e, btn, options, insertPos, insertedLen) {
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
    if (shiftState.locked) {
      shiftKey.classList.add('active');
      shiftKey.textContent = '⇪';
    } else if (shiftState.active) {
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
  if (now - shiftState.lastTap < 400) {
    shiftState.locked = !shiftState.locked;
    shiftState.active = false;
  } else {
    if (shiftState.locked) {
      shiftState.locked = false;
      shiftState.active = false;
    } else {
      shiftState.active = !shiftState.active;
    }
  }
  shiftState.lastTap = now;
  updateShiftState();
}

// ── Build keyboard ─────────────────────────────────────
function attachPressFx(btn, onDown) {
  btn.addEventListener('pointerdown', e => {
    btn.classList.add('pressed');
    onDown && onDown(e);
  });
  const release = () => btn.classList.remove('pressed');
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
}

export function buildKeyboard() {
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
            startLongpress(e, btn, options, insertPos, applyCase(k).length);
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

  keyboardEl.addEventListener('contextmenu', e => e.preventDefault());
}
