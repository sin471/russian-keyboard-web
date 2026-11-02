// ── Shared state / DOM refs ────────────────────────────
// ESモジュールは defer 実行されるため、ここで DOM を掴んでよい。
export const outputEl     = document.getElementById('output');
export const charCountEl  = document.getElementById('char-count');
export const copyBtn      = document.getElementById('btn-copy');
export const clearBtn     = document.getElementById('btn-clear');
export const keyboardEl   = document.getElementById('keyboard');
export const suggestBar   = document.getElementById('suggest-bar');
export const toastEl      = document.getElementById('toast');
export const popupEl      = document.getElementById('key-popup');
export const modalOverlay = document.getElementById('modal-overlay');
export const modalCancel  = document.getElementById('modal-cancel');
export const modalConfirm = document.getElementById('modal-confirm');

// シフト状態（ワンショット / Caps Lock）
export const shiftState = { active: false, locked: false, lastTap: 0 };
