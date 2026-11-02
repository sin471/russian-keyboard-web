// ── Dictionary ─────────────────────────────────────────
// 頻度順の語形リスト（dict.txt）。照合は ё→е に正規化して行う。
export const dict = {
  ready: false,
  words: [],               // 表示形
  norm: [],                // 正規化形
  firstLetterIdx: new Map(), // 正規化1文字目 -> [index...]（頻度順）
  twoLetterIdx: new Map(),   // 正規化2文字prefix -> [index...]
  norm2display: new Map()    // 正規化形 -> 表示形
};

export function normalizeWord(w) {
  return w.toLowerCase().replace(/ё/g, 'е');
}

// ЙЦУКЕНの物理的な隣接キー（誤打の置換コストを下げるため）
export const NEIGHBORS = (() => {
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

// 重み付き編集距離（Damerau）。隣接キーへの置換は 0.5、入れ替えは 1。
export function editCost(a, b) {
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

export function loadDict(onReady) {
  if (typeof fetch !== 'function') return;
  fetch('./dict.txt')
    .then(r => r.text())
    .then(text => {
      dict.words = text.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
      dict.norm = dict.words.map(normalizeWord);
      dict.norm.forEach((w, i) => {
        if (!dict.firstLetterIdx.has(w[0])) dict.firstLetterIdx.set(w[0], []);
        dict.firstLetterIdx.get(w[0]).push(i);
        if (w.length >= 2) {
          const k = w.slice(0, 2);
          if (!dict.twoLetterIdx.has(k)) dict.twoLetterIdx.set(k, []);
          dict.twoLetterIdx.get(k).push(i);
        }
        if (!dict.norm2display.has(w)) dict.norm2display.set(w, dict.words[i]);
      });
      dict.ready = true;
      if (onReady) onReady();
    })
    .catch(() => {});
}
