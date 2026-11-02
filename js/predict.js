import { outputEl, suggestBar } from './state.js';
import { dict, normalizeWord, NEIGHBORS, editCost } from './dict.js';
import { currentFragment, updateCharCount } from './editor.js';

// ── Predictions ────────────────────────────────────────
// 候補は前方一致を基本に、足りない分をあいまい検索（編集距離）で埋める。
// 選んだ／確定した単語は localStorage に学習し、順位を押し上げる。
let learned = {};
try { learned = JSON.parse(localStorage.getItem('ru-kb-learned') || '{}'); } catch { learned = {}; }

function effRank(i) {
  return i - (learned[dict.words[i]] || 0) * 400;
}

export function learnWord(displayWord) {
  if (!displayWord || displayWord.length < 2) return;
  learned[displayWord] = (learned[displayWord] || 0) + 1;
  const keys = Object.keys(learned);
  if (keys.length > 800) {
    keys.sort((a, b) => learned[a] - learned[b]);
    keys.slice(0, keys.length - 800).forEach(k => delete learned[k]);
  }
  try { localStorage.setItem('ru-kb-learned', JSON.stringify(learned)); } catch {}
}

export function learnWordBefore(val, pos) {
  if (!dict.ready || pos == null) return;
  let s = pos;
  while (s > 0 && /[а-яёА-ЯЁ]/.test(val[s - 1])) s--;
  if (s === pos) return;
  const display = dict.norm2display.get(normalizeWord(val.slice(s, pos)));
  if (display) learnWord(display);
}

function computeSuggestions(fragText) {
  const f = normalizeWord(fragText);
  const out = [];
  const seen = new Set();

  // 前方一致（頻度順バケットから集め、学習ブーストで並べ替え）
  const bucket = (f.length >= 2 ? dict.twoLetterIdx.get(f.slice(0, 2)) : dict.firstLetterIdx.get(f[0])) || [];
  const prefixHits = [];
  for (const i of bucket) {
    if (dict.norm[i].startsWith(f)) {
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
    firstChars.forEach(c => (dict.firstLetterIdx.get(c) || []).forEach(i => pool.add(i)));
    const fuzzy = [];
    for (const i of pool) {
      if (seen.has(i)) continue;
      const w = dict.norm[i];
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
    const w = dict.words[i];
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

export function updateSuggestions() {
  if (!dict.ready || !suggestBar) { renderSuggestions([]); return; }
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
  learnWord(dict.norm2display.get(normalizeWord(word)) || word.toLowerCase());
  updateCharCount();
}
