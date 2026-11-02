import { outputEl, charCountEl } from './state.js';
import { updateSuggestions, learnWordBefore } from './predict.js';

// ── Editor: textarea operations ────────────────────────
export function updateCharCount() {
  charCountEl.textContent = `${[...outputEl.value].length} 文字`;
  updateSuggestions();
}

export function initEditor() {
  outputEl.addEventListener('input', updateCharCount);
  outputEl.addEventListener('click', () => updateSuggestions());
  outputEl.addEventListener('keyup', () => updateSuggestions());
}

export function insertAtCursor(ch) {
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

export function backspaceAtCursor() {
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

// カーソル直前のキリル文字ラン（入力中の単語）
export function currentFragment() {
  const start = outputEl.selectionStart;
  const end = outputEl.selectionEnd;
  if (start == null || start !== end) return null;
  const val = outputEl.value;
  let s = start;
  while (s > 0 && /[а-яёА-ЯЁ]/.test(val[s - 1])) s--;
  if (s === start) return null;
  return { text: val.slice(s, start), start: s, end: start };
}
