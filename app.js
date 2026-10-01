/* =====================================================================
 * ĐOÁN TỪ GIÁN ĐIỆP — app.js
 * ---------------------------------------------------------------------
 * Single Page App viết bằng JavaScript thuần, không cần build.
 *
 * Kiến trúc:
 *   - `state`         : toàn bộ dữ liệu của app (cài đặt, kho từ, ván chơi).
 *   - renderXxx()     : vẽ lại giao diện từ `state` cho từng màn hình.
 *   - showXxx(), startXxx() : chuyển màn hình / chuyển pha của ván chơi.
 *   - bindEvents()    : gắn sự kiện một lần duy nhất (event delegation).
 *
 * Mọi thay đổi cài đặt / ván chơi đều được lưu vào LocalStorage, nên
 * lỡ tải lại trang vẫn có thể "Tiếp tục" ván đang chơi dở.
 * ===================================================================== */
'use strict';

/* =====================================================================
 * 1. HẰNG SỐ
 * ===================================================================== */
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const TIMER_MIN = 30;
const TIMER_MAX = 600;
const NAME_MAX_LENGTH = 16;

const STORAGE_KEYS = {
  settings: 'spyword.settings.v1',
  custom: 'spyword.customPairs.v1',
  history: 'spyword.history.v1', // các cặp từ vừa dùng, để tránh lặp lại
  game: 'spyword.game.v1',       // ván chơi đang dở
};

/** Thông tin hiển thị của từng vai trò */
const ROLE_INFO = {
  civilian: { label: 'Dân làng', icon: '🏡' },
  spy: { label: 'Gián điệp', icon: '🕵️' },
  white: { label: 'Mr. White', icon: '👻' },
};

/** Màu avatar xoay vòng theo vị trí người chơi */
const AVATAR_COLORS = ['#f4c25b', '#46d2a8', '#7cb7ff', '#ff9f6b', '#c79bff', '#ff7fb0', '#9be37c', '#6fe0e6', '#ffd36e', '#b8b8ff'];

const DEFAULT_SETTINGS = Object.freeze({
  players: ['Người chơi 1', 'Người chơi 2', 'Người chơi 3', 'Người chơi 4'],
  spyCount: 1,
  spyMode: 'word',      // 'word': Gián điệp có từ tương tự | 'blank': không có từ
  spyKnowsRole: false,  // (chỉ khi spyMode = 'word') thẻ có ghi "Bạn là Gián điệp" không
  mrWhite: false,
  timerSec: 120,
  revealMode: 'hold',   // 'hold': nhấn giữ để xem | 'tap': chạm để lật
  useDefaultPairs: true,
});

/* =====================================================================
 * 2. TIỆN ÍCH CHUNG
 * ===================================================================== */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Đọc JSON từ LocalStorage; lỗi (bị chặn / dữ liệu hỏng) thì trả về fallback */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Bộ nhớ đầy hoặc chế độ ẩn danh: bỏ qua, app vẫn chạy bình thường */
  }
}

function removeKey(key) {
  try { localStorage.removeItem(key); } catch { /* bỏ qua */ }
}

/** Xáo trộn mảng (Fisher–Yates), trả về mảng mới */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const randomItem = (array) => array[Math.floor(Math.random() * array.length)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Chống chèn HTML từ dữ liệu người dùng nhập (tên, từ khóa...) */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, (ch) => map[ch]);
}

/**
 * Chuẩn hóa từ để so sánh: bỏ dấu, đ→d, chữ thường, gộp khoảng trắng.
 * Giúp Mr. White gõ "tra sua" vẫn được tính đúng với "Trà sữa".
 */
function normalizeWord(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Khóa định danh 1 cặp từ, không phụ thuộc thứ tự (A-B == B-A) */
const pairKey = (pair) => [normalizeWord(pair.a), normalizeWord(pair.b)].sort().join('|');

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Số kẻ gian (Gián điệp + Mr. White) tối đa cho n người chơi.
 * Dân làng phải đông hơn kẻ gian lúc bắt đầu, nếu không ván sẽ kết thúc ngay.
 */
const maxImpostors = (n) => Math.floor((n - 1) / 2);

function avatarHtml(player) {
  const letter = escapeHtml((player.name.trim()[0] || '?').toUpperCase());
  const color = AVATAR_COLORS[player.id % AVATAR_COLORS.length];
  return `<span class="avatar" style="--avatar:${color}" aria-hidden="true">${letter}</span>`;
}

function roleTagHtml(role) {
  const info = ROLE_INFO[role];
  return `<span class="role-tag ${role}">${info.icon} ${info.label}</span>`;
}

/* =====================================================================
 * 3. TRẠNG THÁI ỨNG DỤNG
 * ===================================================================== */
const state = {
  settings: loadSettings(),
  customPairs: loadCustomPairs(),
  game: null,            // ván chơi hiện tại (xem createGame)
  selectedVoteId: null,  // người đang được chọn để loại (chưa xác nhận)
  wakeLock: null,        // giữ màn hình sáng trong lúc chơi
};

function loadSettings() {
  const saved = loadJSON(STORAGE_KEYS.settings, {});
  const settings = { ...DEFAULT_SETTINGS, players: [...DEFAULT_SETTINGS.players], ...saved };
  // Dữ liệu cũ/hỏng: quay về danh sách mặc định
  const players = settings.players;
  if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    settings.players = [...DEFAULT_SETTINGS.players];
  }
  return settings;
}

function loadCustomPairs() {
  const saved = loadJSON(STORAGE_KEYS.custom, []);
  return Array.isArray(saved) ? saved.filter((p) => p && p.a && p.b) : [];
}

const saveSettings = () => saveJSON(STORAGE_KEYS.settings, state.settings);
const saveCustomPairs = () => saveJSON(STORAGE_KEYS.custom, state.customPairs);
const saveGame = () => state.game && saveJSON(STORAGE_KEYS.game, state.game);

/** Kho từ đang dùng = kho mặc định (nếu bật) + cặp từ tự thêm */
function getWordPool() {
  const base = state.settings.useDefaultPairs ? DEFAULT_WORD_PAIRS : [];
  return [...base, ...state.customPairs];
}

/* =====================================================================
 * 4. ĐIỀU HƯỚNG MÀN HÌNH, MODAL, TOAST
 * ===================================================================== */
function showScreen(name) {
  $$('.screen').forEach((el) => el.classList.toggle('is-active', el.id === `screen-${name}`));
  window.scrollTo({ top: 0 });
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

/**
 * Hiện hộp thoại dùng chung.
 * @param {object} opts
 *   icon, title       : nội dung tiêu đề (text thuần)
 *   body              : HTML phần thân (đã escape dữ liệu người dùng)
 *   actions           : [{ label, variant: 'primary'|'danger'|'ghost', onClick, validate }]
 *                       `validate()` trả về false => giữ modal mở.
 *   dismissible       : cho phép đóng bằng nền mờ / phím Esc
 */
function showModal({ icon = '', title = '', body = '', actions = [{ label: 'Đóng' }], dismissible = true }) {
  const modal = $('#modal');
  $('#toast').classList.remove('is-visible'); // tránh toast cũ đè lên hộp thoại
  $('#modal-icon').textContent = icon;
  $('#modal-icon').hidden = !icon;
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;

  const actionsBox = $('#modal-actions');
  actionsBox.innerHTML = '';
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-${action.variant || 'ghost'}`;
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      if (action.validate && !action.validate()) return;
      closeModal();
      action.onClick?.(); // gọi sau khi đóng để onClick có thể mở modal mới
    });
    actionsBox.appendChild(btn);
  });

  modal.dataset.dismissible = String(dismissible);
  modal.hidden = false;

  // Ưu tiên focus ô nhập (nếu có), không thì nút cuối (nút chính)
  const focusTarget = $('#modal-body input') || actionsBox.lastElementChild;
  setTimeout(() => focusTarget?.focus(), 60);
}

function closeModal() {
  $('#modal').hidden = true;
}

/** Hộp thoại xác nhận nhanh */
function confirmDialog({ icon = '❓', title, body = '', confirmLabel = 'Đồng ý', variant = 'primary', onConfirm }) {
  showModal({
    icon,
    title,
    body,
    actions: [
      { label: 'Hủy' },
      { label: confirmLabel, variant, onClick: onConfirm },
    ],
  });
}

/* =====================================================================
 * 5. MÀN HÌNH CÀI ĐẶT
 * ===================================================================== */

/** Số Gián điệp tối đa với cấu hình hiện tại (đã trừ chỗ cho Mr. White) */
function getSpyMax() {
  const { players, mrWhite } = state.settings;
  return maxImpostors(players.length) - (mrWhite ? 1 : 0);
}

/** Ép các giá trị cài đặt về khoảng hợp lệ */
function normalizeSettings() {
  const s = state.settings;
  s.spyCount = clamp(s.spyCount, 1, Math.max(1, getSpyMax()));
  s.timerSec = clamp(s.timerSec, TIMER_MIN, TIMER_MAX);
}

/** Tên cuối cùng của người chơi (ô trống thì dùng tên mặc định) */
function getPlayerNames() {
  return state.settings.players.map((name, i) => name.trim() || `Người chơi ${i + 1}`);
}

/** Trả về thông báo lỗi nếu cài đặt chưa hợp lệ, ngược lại null */
function getSetupError() {
  const s = state.settings;
  const n = s.players.length;
  if (n < MIN_PLAYERS) return `Cần ít nhất ${MIN_PLAYERS} người chơi.`;

  const seen = new Set();
  for (const name of getPlayerNames()) {
    const key = normalizeWord(name);
    if (seen.has(key)) return `Tên "${name}" bị trùng. Hãy đặt tên khác nhau.`;
    seen.add(key);
  }

  const impostors = s.spyCount + (s.mrWhite ? 1 : 0);
  if (impostors > maxImpostors(n)) {
    return `Với ${n} người, chỉ được tối đa ${maxImpostors(n)} kẻ gian (Gián điệp + Mr. White). Hãy thêm người chơi hoặc tắt Mr. White.`;
  }

  if (getWordPool().length === 0) return 'Kho từ đang trống. Hãy bật kho mặc định hoặc thêm cặp từ.';
  return null;
}

function renderPlayerList() {
  const { players } = state.settings;
  $('#player-list').innerHTML = players.map((name, i) => `
    <li class="player-row">
      <span class="player-index">${i + 1}</span>
      <input class="input" type="text" value="${escapeHtml(name)}" data-player-index="${i}"
             maxlength="${NAME_MAX_LENGTH}" placeholder="Người chơi ${i + 1}"
             aria-label="Tên người chơi ${i + 1}" enterkeyhint="next" autocomplete="off">
      <button type="button" class="icon-btn" data-remove-player="${i}"
              aria-label="Xóa người chơi ${i + 1}" ${players.length <= MIN_PLAYERS ? 'disabled' : ''}>✕</button>
    </li>`).join('');

  $('#player-count').textContent = `${players.length}/${MAX_PLAYERS}`;
  $('#btn-add-player').disabled = players.length >= MAX_PLAYERS;
}

/** Vẽ lại các tùy chọn (stepper, công tắc, nút chọn) + phần tóm tắt + lỗi */
function renderSetupOptions() {
  normalizeSettings();
  const s = state.settings;

  // Stepper
  $('#out-spyCount').textContent = s.spyCount;
  $('[data-step="spyCount"][data-delta="-1"]').disabled = s.spyCount <= 1;
  $('[data-step="spyCount"][data-delta="1"]').disabled = s.spyCount >= getSpyMax();
  $('#out-timerSec').textContent = formatTime(s.timerSec);
  $('[data-step="timerSec"][data-delta="-30"]').disabled = s.timerSec <= TIMER_MIN;
  $('[data-step="timerSec"][data-delta="30"]').disabled = s.timerSec >= TIMER_MAX;

  // Nhóm nút chọn
  $$('.segmented[data-setting]').forEach((group) => {
    const value = s[group.dataset.setting];
    $$('button', group).forEach((btn) => {
      const active = btn.dataset.value === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  });

  // Công tắc
  $$('input[type="checkbox"][data-setting]').forEach((input) => {
    input.checked = Boolean(s[input.dataset.setting]);
  });
  $('#row-spyKnowsRole').hidden = s.spyMode !== 'word';

  // Tóm tắt thành phần ván chơi
  const n = s.players.length;
  const whiteCount = s.mrWhite ? 1 : 0;
  const civCount = n - s.spyCount - whiteCount;
  const parts = [`🏡 <b>${Math.max(0, civCount)}</b> Dân làng`, `🕵️ <b>${s.spyCount}</b> Gián điệp`];
  if (whiteCount) parts.push('👻 <b>1</b> Mr. White');
  $('#composition').innerHTML = parts.join(' · ');

  $('#pool-count').textContent = getWordPool().length;
  renderSetupError();
}

function renderSetupError() {
  const error = getSetupError();
  const el = $('#setup-error');
  el.textContent = error || '';
  el.hidden = !error;
  $('#btn-start').disabled = Boolean(error);
}

function renderResumeBanner() {
  $('#resume-banner').hidden = !(state.game && state.game.phase !== 'result');
}

function addPlayer() {
  const { players } = state.settings;
  if (players.length >= MAX_PLAYERS) return;

  // Tìm tên mặc định chưa bị dùng
  const used = new Set(players.map(normalizeWord));
  let k = players.length + 1;
  while (used.has(normalizeWord(`Người chơi ${k}`))) k++;
  players.push(`Người chơi ${k}`);

  saveSettings();
  renderPlayerList();
  renderSetupOptions();
  const input = $(`[data-player-index="${players.length - 1}"]`);
  input?.focus();
  input?.select();
}

function removePlayer(index) {
  const { players } = state.settings;
  if (players.length <= MIN_PLAYERS) return;
  players.splice(index, 1);
  saveSettings();
  renderPlayerList();
  renderSetupOptions();
}

/* =====================================================================
 * 6. KHO TỪ VỰNG
 * ===================================================================== */
function renderWordsScreen() {
  $('#default-count').textContent = DEFAULT_WORD_PAIRS.length;
  $('#custom-count').textContent = state.customPairs.length;
  $('#words-total').textContent = getWordPool().length;
  $('#btn-clear-custom').hidden = state.customPairs.length === 0;

  const pairHtml = (pair) =>
    `<span class="pair-words">${escapeHtml(pair.a)}<span>↔</span>${escapeHtml(pair.b)}</span>`;

  $('#custom-list').innerHTML = state.customPairs.length
    ? state.customPairs.map((pair, i) => `
        <li>${pairHtml(pair)}
          <button type="button" class="icon-btn" data-delete-pair="${i}" aria-label="Xóa cặp từ">🗑</button>
        </li>`).join('')
    : '<li class="empty">Chưa có cặp từ nào. Thêm ở phía trên nhé!</li>';

  // Kho mặc định không đổi nên chỉ cần vẽ một lần
  const defaultList = $('#default-list');
  if (!defaultList.childElementCount) {
    defaultList.innerHTML = DEFAULT_WORD_PAIRS.map((pair) =>
      `<li>${pairHtml(pair)}<span class="pair-cat">${escapeHtml(pair.category)}</span></li>`).join('');
  }
}

function handleAddPair(event) {
  event.preventDefault();
  const inputA = $('#pair-a');
  const inputB = $('#pair-b');
  const a = inputA.value.trim().replace(/\s+/g, ' ');
  const b = inputB.value.trim().replace(/\s+/g, ' ');

  const invalid = (input, message) => {
    input.classList.remove('is-invalid');
    void input.offsetWidth; // reset animation rung
    input.classList.add('is-invalid');
    input.focus();
    toast(message);
  };

  if (!a) return invalid(inputA, 'Hãy nhập từ thứ nhất.');
  if (!b) return invalid(inputB, 'Hãy nhập từ thứ hai.');
  if (normalizeWord(a) === normalizeWord(b)) return invalid(inputB, 'Hai từ phải khác nhau.');

  const key = pairKey({ a, b });
  const exists = [...DEFAULT_WORD_PAIRS, ...state.customPairs].some((p) => pairKey(p) === key);
  if (exists) return invalid(inputA, 'Cặp từ này đã có trong kho.');

  state.customPairs.unshift({ a, b });
  saveCustomPairs();
  inputA.value = '';
  inputB.value = '';
  inputA.classList.remove('is-invalid');
  inputB.classList.remove('is-invalid');
  inputA.focus();
  renderWordsScreen();
  renderSetupOptions();
  toast(`Đã thêm "${a} ↔ ${b}"`);
}

function deleteCustomPair(index) {
  const [removed] = state.customPairs.splice(index, 1);
  saveCustomPairs();
  renderWordsScreen();
  renderSetupOptions();
  if (removed) toast(`Đã xóa "${removed.a} ↔ ${removed.b}"`);
}

/**
 * Chọn ngẫu nhiên 1 cặp từ, ưu tiên những cặp chưa dùng gần đây.
 * Lịch sử được lưu trong LocalStorage để không lặp từ giữa các ván.
 */
function pickWordPair() {
  const pool = getWordPool();
  let history = loadJSON(STORAGE_KEYS.history, []);
  if (!Array.isArray(history)) history = [];

  let candidates = pool.filter((p) => !history.includes(pairKey(p)));
  if (candidates.length === 0) {
    candidates = pool; // đã dùng hết: bắt đầu lại
    history = [];
  }

  const pair = randomItem(candidates);
  history.push(pairKey(pair));
  // Chỉ nhớ tối đa (kho - 1) cặp, và không quá 40 cặp
  const limit = Math.min(40, Math.max(0, pool.length - 1));
  saveJSON(STORAGE_KEYS.history, limit > 0 ? history.slice(-limit) : []);
  return pair;
}

/* =====================================================================
 * 7. KHỞI TẠO VÁN CHƠI
 * ===================================================================== */
/**
 * Cấu trúc 1 ván chơi (được lưu nguyên vào LocalStorage):
 * {
 *   phase: 'reveal' | 'play' | 'result',
 *   civWord, spyWord,                 // 2 từ của ván
 *   spyMode, spyKnowsRole, revealMode, timerSec, hasWhite,   // bản chụp cài đặt
 *   players: [{ id, name, role, word, alive, eliminatedRound }],
 *   revealIndex, revealStage: 'handoff'|'card', hasPeeked,   // pha xem từ
 *   round, speakOrder: [id...],                               // pha thảo luận
 *   winner: 'civ'|'spy'|'white'|null, reason
 * }
 */
function createGame() {
  const s = state.settings;
  const names = getPlayerNames();

  // Chọn cặp từ và ngẫu nhiên hóa từ nào thuộc về Dân làng
  const pair = pickWordPair();
  const [civWord, spyWord] = Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];

  // Tạo danh sách vai trò rồi xáo trộn
  const whiteCount = s.mrWhite ? 1 : 0;
  const roles = shuffle([
    ...Array(s.spyCount).fill('spy'),
    ...Array(whiteCount).fill('white'),
    ...Array(names.length - s.spyCount - whiteCount).fill('civilian'),
  ]);

  const wordForRole = (role) => {
    if (role === 'civilian') return civWord;
    if (role === 'spy') return s.spyMode === 'word' ? spyWord : null;
    return null; // Mr. White không có từ
  };

  return {
    phase: 'reveal',
    civWord,
    spyWord,
    spyMode: s.spyMode,
    spyKnowsRole: s.spyKnowsRole,
    revealMode: s.revealMode,
    timerSec: s.timerSec,
    hasWhite: whiteCount > 0,
    players: names.map((name, i) => ({
      id: i,
      name,
      role: roles[i],
      word: wordForRole(roles[i]),
      alive: true,
      eliminatedRound: null,
    })),
    revealIndex: 0,
    revealStage: 'handoff',
    hasPeeked: false,
    round: 1,
    speakOrder: [],
    winner: null,
    reason: '',
  };
}

function startGame() {
  const error = getSetupError();
  if (error) {
    toast(error);
    return;
  }
  state.game = createGame();
  state.selectedVoteId = null;
  saveGame();
  requestWakeLock();
  showReveal();
}

/** Tiếp tục ván dở sau khi tải lại trang */
function resumeGame() {
  const g = state.game;
  if (!g) return;
  requestWakeLock();
  if (g.phase === 'reveal') {
    g.revealStage = 'handoff'; // an toàn: bắt người chơi hiện tại xác nhận lại
    showReveal();
  } else {
    showPlay();
  }
}

/** Hủy ván hiện tại và quay về màn hình cài đặt */
function quitGame() {
  timerStop();
  releaseWakeLock();
  state.game = null;
  state.selectedVoteId = null;
  removeKey(STORAGE_KEYS.game);
  renderResumeBanner();
  showScreen('setup');
}

/* =====================================================================
 * 8. PHA XEM TỪ BÍ MẬT (PASS & PLAY)
 * ===================================================================== */
function showReveal() {
  renderReveal();
  showScreen('reveal');
}

/** Nội dung mặt sau của thẻ bí mật, tùy vai trò */
function secretCardContent(player, game) {
  if (player.role === 'white') {
    return {
      cls: 'is-white',
      html: `
        <div class="secret-icon">👻</div>
        <div class="secret-role">Bạn là Mr. White</div>
        <p class="secret-desc">Bạn <b>không có từ khóa</b>. Hãy lắng nghe thật kỹ và giả vờ như mình biết từ!</p>`,
    };
  }

  if (player.role === 'spy' && !player.word) {
    return {
      cls: 'is-spy',
      html: `
        <div class="secret-icon">🕵️</div>
        <div class="secret-role">Bạn là Gián điệp</div>
        <p class="secret-desc">Bạn <b>không có từ khóa</b>. Lắng nghe mô tả để đoán từ của Dân làng và trà trộn vào.</p>`,
    };
  }

  // Có từ khóa: Dân làng, hoặc Gián điệp ở chế độ "từ tương tự"
  const revealSpy = player.role === 'spy' && game.spyKnowsRole;
  return {
    cls: revealSpy ? 'is-spy' : 'is-word',
    html: `
      ${revealSpy ? '<div class="secret-role">🕵️ Bạn là Gián điệp</div>' : ''}
      <div class="secret-label">Từ khóa của bạn</div>
      <div class="secret-word">${escapeHtml(player.word)}</div>
      <p class="secret-desc">${revealSpy
        ? 'Từ của bạn <b>khác</b> với Dân làng. Hãy mô tả thật khéo để không bị lộ!'
        : 'Mô tả từ này thật khéo: đủ để đồng đội nhận ra, nhưng đừng để kẻ gian đoán được!'}</p>`,
  };
}

function renderReveal() {
  const g = state.game;
  const player = g.players[g.revealIndex];
  const total = g.players.length;
  const isLast = g.revealIndex === total - 1;
  const isHold = g.revealMode === 'hold';

  $('#reveal-progress').textContent = `${g.revealIndex + 1}/${total}`;
  $('#reveal-dots').innerHTML = g.players.map((_, i) => {
    const cls = i < g.revealIndex ? 'is-done' : i === g.revealIndex ? 'is-current' : '';
    return `<span class="dot ${cls}"></span>`;
  }).join('');

  const isHandoff = g.revealStage === 'handoff';
  $('#reveal-handoff').hidden = !isHandoff;
  $('#reveal-card').hidden = isHandoff;

  $('#handoff-name').textContent = player.name;
  $('#ready-name').textContent = player.name;
  $('#card-owner').textContent = player.name;

  // Úp thẻ trước khi thay nội dung để không lộ từ của người trước
  setCardRevealed(false);
  const back = $('#card-back');
  const content = secretCardContent(player, g);
  back.className = `flip-face flip-back ${content.cls}`;
  back.innerHTML = content.html;

  $('#card-hint').textContent = isHold ? 'Nhấn và giữ để xem' : 'Chạm để lật thẻ';
  $('#card-subhint').textContent = isHold
    ? 'Thả tay ra, thẻ sẽ tự úp lại.'
    : 'Chạm lần nữa để úp thẻ trước khi chuyền máy.';

  const nextBtn = $('#btn-next-player');
  nextBtn.disabled = !g.hasPeeked;
  nextBtn.textContent = isLast ? 'Đã nhớ, bắt đầu thảo luận' : 'Đã nhớ, chuyền máy';
}

/** Lật / úp thẻ bí mật. Lần đầu lật sẽ mở khóa nút "tiếp theo". */
function setCardRevealed(revealed) {
  const card = $('#secret-card');
  card.classList.toggle('is-revealed', revealed);
  card.setAttribute('aria-pressed', String(revealed));

  const g = state.game;
  if (revealed && g && !g.hasPeeked) {
    g.hasPeeked = true;
    saveGame();
    $('#btn-next-player').disabled = false;
  }
}

const isCardRevealed = () => $('#secret-card').classList.contains('is-revealed');
const isHoldMode = () => state.game?.revealMode === 'hold';

/** Gắn sự kiện cho thẻ: hỗ trợ cả chuột, cảm ứng và bàn phím */
function bindSecretCard() {
  const card = $('#secret-card');

  // --- Chế độ nhấn giữ ---
  card.addEventListener('pointerdown', (e) => {
    if (!isHoldMode()) return;
    e.preventDefault();
    card.setPointerCapture?.(e.pointerId); // vẫn nhận pointerup dù ngón tay trượt ra ngoài
    setCardRevealed(true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    card.addEventListener(type, () => {
      if (isHoldMode()) setCardRevealed(false);
    });
  });

  // --- Chế độ chạm để lật ---
  card.addEventListener('click', () => {
    if (!isHoldMode()) setCardRevealed(!isCardRevealed());
  });

  // --- Bàn phím (Space/Enter) ---
  card.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (isHoldMode()) setCardRevealed(true);
    else if (!e.repeat) setCardRevealed(!isCardRevealed());
  });
  card.addEventListener('keyup', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && isHoldMode()) setCardRevealed(false);
  });

  // Chặn menu ngữ cảnh khi nhấn giữ lâu trên điện thoại
  card.addEventListener('contextmenu', (e) => e.preventDefault());
}

function nextRevealPlayer() {
  const g = state.game;
  setCardRevealed(false);

  if (g.revealIndex >= g.players.length - 1) {
    startDiscussion();
    return;
  }
  g.revealIndex += 1;
  g.revealStage = 'handoff';
  g.hasPeeked = false;
  saveGame();
  renderReveal();
  window.scrollTo({ top: 0 });
}

/* =====================================================================
 * 9. PHA THẢO LUẬN & BỎ PHIẾU
 * ===================================================================== */
const alivePlayers = (g = state.game) => g.players.filter((p) => p.alive);

/**
 * Thứ tự mô tả: theo vòng tròn chỗ ngồi, bắt đầu từ 1 người ngẫu nhiên.
 * Tránh để Mr. White nói đầu tiên (vì họ chưa có thông tin gì).
 */
function computeSpeakOrder(g) {
  const alive = alivePlayers(g);
  const candidates = alive.filter((p) => p.role !== 'white');
  const first = randomItem(candidates.length ? candidates : alive);
  const start = alive.indexOf(first);
  return [...alive.slice(start), ...alive.slice(0, start)].map((p) => p.id);
}

function startDiscussion() {
  const g = state.game;
  g.phase = 'play';
  g.round = 1;
  g.speakOrder = computeSpeakOrder(g);
  saveGame();
  showPlay();
}

function showPlay() {
  state.selectedVoteId = null;
  timerReset(state.game.timerSec);
  renderPlay();
  showScreen('play');
}

function renderPlay() {
  const g = state.game;
  const alive = alivePlayers(g);
  const count = (role, list) => list.filter((p) => p.role === role).length;

  $('#round-num').textContent = g.round;
  $('#alive-count').textContent = `${alive.length} người`;

  // Thống kê công khai: số kẻ gian còn ẩn nấp
  const chips = [
    `<span class="chip civ">🏡 Dân làng: ${count('civilian', alive)}</span>`,
    `<span class="chip spy">🕵️ Gián điệp: ${count('spy', alive)}/${count('spy', g.players)}</span>`,
  ];
  if (g.hasWhite) {
    chips.push(`<span class="chip white">👻 Mr. White: ${count('white', alive) ? 'còn ẩn' : 'đã loại'}</span>`);
  }
  $('#status-row').innerHTML = chips.join('');

  // Thứ tự mô tả
  $('#speak-order').innerHTML = g.speakOrder
    .map((id) => g.players[id])
    .filter((p) => p.alive)
    .map((p, i) => `<li><span class="order-num">${i + 1}</span>${escapeHtml(p.name)}</li>`)
    .join('');

  // Lưới bỏ phiếu
  $('#vote-grid').innerHTML = alive.map((p) => `
    <button type="button" class="vote-card ${p.id === state.selectedVoteId ? 'is-selected' : ''}"
            data-vote="${p.id}" aria-pressed="${p.id === state.selectedVoteId}">
      ${avatarHtml(p)}<span>${escapeHtml(p.name)}</span>
    </button>`).join('');

  const selected = state.selectedVoteId !== null ? g.players[state.selectedVoteId] : null;
  const elimBtn = $('#btn-eliminate');
  elimBtn.disabled = !selected;
  elimBtn.textContent = selected ? `Loại ${selected.name}` : 'Loại người chơi';

  // Danh sách đã bị loại (công khai vai trò)
  const eliminated = g.players
    .filter((p) => !p.alive)
    .sort((a, b) => a.eliminatedRound - b.eliminatedRound);
  $('#eliminated-panel').hidden = eliminated.length === 0;
  $('#eliminated-list').innerHTML = eliminated.map((p) => `
    <li>${avatarHtml(p)}<span class="name">${escapeHtml(p.name)}</span>
      ${roleTagHtml(p.role)}<small>V${p.eliminatedRound}</small>
    </li>`).join('');
}

function selectVote(id) {
  state.selectedVoteId = state.selectedVoteId === id ? null : id;
  renderPlay();
}

function confirmElimination() {
  const g = state.game;
  const player = g.players[state.selectedVoteId];
  if (!player || !player.alive) return;

  confirmDialog({
    icon: '🗳️',
    title: 'Xác nhận loại',
    body: `<p>Cả nhóm đồng ý loại <b>${escapeHtml(player.name)}</b>?</p>`,
    confirmLabel: 'Loại',
    variant: 'danger',
    onConfirm: () => eliminatePlayer(player.id),
  });
}

function eliminatePlayer(id) {
  const g = state.game;
  const player = g.players[id];
  player.alive = false;
  player.eliminatedRound = g.round;
  state.selectedVoteId = null;
  saveGame();
  timerStop();
  renderPlay();

  if (player.role === 'white') askWhiteGuess(player);
  else announceElimination(player);
}

/** Mr. White bị loại: cho 1 cơ hội đoán từ của Dân làng */
function askWhiteGuess(player) {
  const g = state.game;
  showModal({
    icon: '👻',
    title: `${player.name} là Mr. White!`,
    body: `
      <p>Mr. White có <b>một cơ hội cuối</b>: đoán đúng từ khóa của Dân làng để lật kèo chiến thắng.</p>
      <input class="input" id="white-guess" maxlength="30" placeholder="Nhập từ đoán..." autocomplete="off" enterkeyhint="done">`,
    dismissible: false,
    actions: [{
      label: 'Chốt đáp án',
      variant: 'primary',
      validate: () => {
        const input = $('#white-guess');
        if (input.value.trim()) return true;
        input.classList.remove('is-invalid');
        void input.offsetWidth;
        input.classList.add('is-invalid');
        input.focus();
        return false;
      },
      onClick: () => {
        const guess = $('#white-guess').value.trim();
        if (normalizeWord(guess) === normalizeWord(g.civWord)) {
          finishGame({
            winner: 'white',
            reason: `${player.name} đã đoán đúng từ khóa "${g.civWord}"!`,
          });
        } else {
          announceElimination(player, `<p>Đoán "<b>${escapeHtml(guess)}</b>": sai rồi! ❌</p>`);
        }
      },
    }],
  });
}

/** Công bố vai trò người vừa bị loại, rồi sang vòng mới hoặc kết thúc */
function announceElimination(player, extraHtml = '') {
  const info = ROLE_INFO[player.role];
  const outcome = checkWinner();
  const message = player.role === 'civilian'
    ? 'Ôi không, loại nhầm người tốt rồi! 😱'
    : 'Chính xác! Một kẻ gian đã bị lật mặt. 🎯';

  showModal({
    icon: info.icon,
    title: `${player.name} là ${info.label}`,
    body: `${extraHtml}<p class="role-reveal">${message}</p>`,
    dismissible: false,
    actions: [{
      label: outcome ? 'Xem kết quả' : `Sang vòng ${state.game.round + 1}`,
      variant: 'primary',
      onClick: () => (outcome ? finishGame(outcome) : nextRound()),
    }],
  });
}

/**
 * Kiểm tra điều kiện thắng:
 *  - Hết kẻ gian (Gián điệp + Mr. White)  => Dân làng thắng.
 *  - Số kẻ gian còn lại >= số Dân làng     => phe kẻ gian thắng.
 * @returns {{winner, reason}|null}  null nếu ván tiếp tục
 */
function checkWinner() {
  const alive = alivePlayers();
  const civ = alive.filter((p) => p.role === 'civilian').length;
  const impostors = alive.length - civ;

  if (impostors === 0) {
    return { winner: 'civ', reason: 'Toàn bộ kẻ gian đã bị lật mặt.' };
  }
  if (impostors >= civ) {
    const spyAlive = alive.some((p) => p.role === 'spy');
    return {
      winner: spyAlive ? 'spy' : 'white',
      reason: `Số kẻ gian còn lại (${impostors}) đã bằng hoặc nhiều hơn Dân làng (${civ}).`,
    };
  }
  return null;
}

function nextRound() {
  const g = state.game;
  g.round += 1;
  g.speakOrder = computeSpeakOrder(g);
  saveGame();
  showPlay();
  toast(`Bắt đầu vòng ${g.round}`);
}

function skipRound() {
  confirmDialog({
    icon: '⚖️',
    title: 'Hòa phiếu?',
    body: '<p>Không ai bị loại ở vòng này. Chuyển sang vòng tiếp theo?</p>',
    confirmLabel: 'Sang vòng mới',
    onConfirm: nextRound,
  });
}

/* =====================================================================
 * 10. ĐỒNG HỒ ĐẾM NGƯỢC
 * ===================================================================== */
const RING_CIRCUMFERENCE = 2 * Math.PI * 54; // r = 54 trong SVG
const timer = { total: 120, remaining: 120, endAt: 0, handle: null };
let audioCtx = null;

const isTimerRunning = () => timer.handle !== null;

function timerReset(seconds) {
  timerStop();
  timer.total = seconds;
  timer.remaining = seconds;
  renderTimer();
}

function timerStart() {
  if (isTimerRunning() || timer.remaining <= 0) return;
  ensureAudio(); // khởi tạo âm thanh trong thao tác người dùng (yêu cầu của trình duyệt)
  // Dùng mốc thời gian tuyệt đối để không bị lệch khi tab bị chậm
  timer.endAt = Date.now() + timer.remaining * 1000;
  timer.handle = setInterval(timerTick, 200);
  renderTimer();
}

function timerStop() {
  clearInterval(timer.handle);
  timer.handle = null;
  renderTimer();
}

function timerTick() {
  timer.remaining = Math.max(0, (timer.endAt - Date.now()) / 1000);
  if (timer.remaining <= 0) {
    timerStop();
    onTimeUp();
    return;
  }
  renderTimer();
}

function timerAdd(seconds) {
  timer.remaining += seconds;
  if (isTimerRunning()) timer.endAt += seconds * 1000;
  timer.total = Math.max(timer.total, timer.remaining);
  renderTimer();
}

function renderTimer() {
  const ring = $('#timer-ring');
  if (!ring) return;
  const progress = timer.total > 0 ? timer.remaining / timer.total : 0;
  const fg = $('#ring-fg');
  fg.style.strokeDasharray = RING_CIRCUMFERENCE;
  fg.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  $('#timer-text').textContent = formatTime(timer.remaining);
  ring.classList.toggle('is-warning', timer.remaining > 0 && timer.remaining <= 10);
  ring.classList.toggle('is-timeup', timer.remaining <= 0);

  const toggle = $('#btn-timer-toggle');
  if (isTimerRunning()) toggle.textContent = '⏸ Tạm dừng';
  else if (timer.remaining <= 0) toggle.textContent = '⏰ Hết giờ';
  else toggle.textContent = timer.remaining < timer.total ? '▶ Tiếp tục' : '▶ Bắt đầu';
  toggle.disabled = timer.remaining <= 0;
}

function onTimeUp() {
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  playBeep();
  toast('⏰ Hết giờ! Mời cả nhóm bỏ phiếu.');
}

function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

/** 3 tiếng "bíp" ngắn báo hết giờ (tạo bằng Web Audio, không cần file âm thanh) */
function playBeep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  [0, 0.3, 0.6].forEach((offset) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.25);
  });
}

/* =====================================================================
 * 11. MÀN HÌNH KẾT QUẢ
 * ===================================================================== */
const RESULT_TEXT = {
  civ: { icon: '🏡', title: 'Dân làng chiến thắng!' },
  spy: { icon: '🕵️', title: 'Phe Gián điệp chiến thắng!' },
  white: { icon: '👻', title: 'Mr. White chiến thắng!' },
};

/** Ai thuộc phe thắng (để đánh dấu trong danh sách) */
function isWinner(player, winner) {
  if (winner === 'civ') return player.role === 'civilian';
  if (winner === 'spy') return player.role !== 'civilian'; // cả phe kẻ gian
  return player.role === 'white';
}

function finishGame({ winner, reason }) {
  const g = state.game;
  g.phase = 'result';
  g.winner = winner;
  g.reason = reason;
  timerStop();
  releaseWakeLock();
  removeKey(STORAGE_KEYS.game); // ván đã xong, không cần "tiếp tục"
  renderResult();
  showScreen('result');
  navigator.vibrate?.(150);
}

function renderResult() {
  const g = state.game;
  const text = RESULT_TEXT[g.winner];

  $('#result-hero').className = `result-hero ${g.winner}`;
  $('#result-icon').textContent = text.icon;
  $('#result-title').textContent = text.title;
  $('#result-reason').textContent = g.reason;
  $('#result-civ-word').textContent = g.civWord;
  $('#result-spy-word').textContent = g.spyMode === 'word' ? g.spyWord : '(không có từ)';

  $('#result-players').innerHTML = g.players.map((p) => {
    const status = p.alive ? 'Sống sót' : `Bị loại ở vòng ${p.eliminatedRound}`;
    const word = p.word ? ` · từ: ${escapeHtml(p.word)}` : '';
    const win = isWinner(p, g.winner);
    return `
      <li class="${win ? 'is-winner' : ''}">
        ${avatarHtml(p)}
        <div class="info">
          <span class="name">${win ? '🏆 ' : ''}${escapeHtml(p.name)}</span>
          <small>${status}${word}</small>
        </div>
        ${roleTagHtml(p.role)}
      </li>`;
  }).join('');
}

/* =====================================================================
 * 12. GIỮ MÀN HÌNH SÁNG (Screen Wake Lock API, nếu trình duyệt hỗ trợ)
 * ===================================================================== */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !state.wakeLock && document.visibilityState === 'visible') {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    }
  } catch {
    /* Không hỗ trợ / bị từ chối: bỏ qua */
  }
}

function releaseWakeLock() {
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

/* =====================================================================
 * 13. GẮN SỰ KIỆN
 * ===================================================================== */
function bindEvents() {
  /* --- Cài đặt: danh sách người chơi --- */
  $('#player-list').addEventListener('input', (e) => {
    const index = e.target.dataset.playerIndex;
    if (index === undefined) return;
    // Chỉ cập nhật state, không vẽ lại danh sách để không mất focus khi gõ
    state.settings.players[Number(index)] = e.target.value;
    saveSettings();
    renderSetupError();
  });
  $('#player-list').addEventListener('keydown', (e) => {
    // Enter: nhảy sang ô tiếp theo (hoặc thêm người mới ở ô cuối)
    if (e.key !== 'Enter' || e.target.dataset.playerIndex === undefined) return;
    e.preventDefault();
    const next = $(`[data-player-index="${Number(e.target.dataset.playerIndex) + 1}"]`);
    if (next) next.focus();
    else if (state.settings.players.length < MAX_PLAYERS) addPlayer();
    else e.target.blur();
  });
  $('#player-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-player]');
    if (btn) removePlayer(Number(btn.dataset.removePlayer));
  });
  $('#btn-add-player').addEventListener('click', addPlayer);

  /* --- Cài đặt: stepper, nhóm nút chọn (dùng chung delegation) --- */
  document.addEventListener('click', (e) => {
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      const key = stepBtn.dataset.step;
      state.settings[key] += Number(stepBtn.dataset.delta);
      saveSettings();
      renderSetupOptions();
      return;
    }
    const segBtn = e.target.closest('.segmented[data-setting] button[data-value]');
    if (segBtn) {
      state.settings[segBtn.parentElement.dataset.setting] = segBtn.dataset.value;
      saveSettings();
      renderSetupOptions();
    }
  });

  /* --- Công tắc bật/tắt (ở cả màn hình cài đặt và kho từ) --- */
  document.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'checkbox' || !input.dataset.setting) return;
    state.settings[input.dataset.setting] = input.checked;
    saveSettings();
    renderSetupOptions();
    renderWordsScreen();
  });

  $('#btn-start').addEventListener('click', startGame);
  $('#btn-resume-game').addEventListener('click', resumeGame);
  $('#btn-discard-game').addEventListener('click', () => confirmDialog({
    icon: '🗑️',
    title: 'Hủy ván đang chơi?',
    body: '<p>Tiến trình của ván dở sẽ bị xóa.</p>',
    confirmLabel: 'Hủy ván',
    variant: 'danger',
    onConfirm: quitGame,
  }));

  /* --- Kho từ vựng --- */
  $('#btn-open-words').addEventListener('click', () => {
    renderWordsScreen();
    showScreen('words');
  });
  $('#btn-words-back').addEventListener('click', () => {
    renderSetupOptions();
    showScreen('setup');
  });
  $('#pair-form').addEventListener('submit', handleAddPair);
  $('#custom-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-pair]');
    if (btn) deleteCustomPair(Number(btn.dataset.deletePair));
  });
  $('#btn-clear-custom').addEventListener('click', () => confirmDialog({
    icon: '🗑️',
    title: 'Xóa tất cả cặp từ tự thêm?',
    body: `<p>${state.customPairs.length} cặp từ sẽ bị xóa vĩnh viễn.</p>`,
    confirmLabel: 'Xóa hết',
    variant: 'danger',
    onConfirm: () => {
      state.customPairs = [];
      saveCustomPairs();
      renderWordsScreen();
      renderSetupOptions();
    },
  }));

  /* --- Xem từ bí mật --- */
  bindSecretCard();
  $('#btn-ready').addEventListener('click', () => {
    state.game.revealStage = 'card';
    saveGame();
    renderReveal();
  });
  $('#btn-next-player').addEventListener('click', nextRevealPlayer);

  /* --- Thảo luận & bỏ phiếu --- */
  $('#btn-timer-toggle').addEventListener('click', () => (isTimerRunning() ? timerStop() : timerStart()));
  $('#btn-timer-reset').addEventListener('click', () => timerReset(state.game.timerSec));
  $('#btn-timer-add').addEventListener('click', () => timerAdd(30));
  $('#vote-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-vote]');
    if (card) selectVote(Number(card.dataset.vote));
  });
  $('#btn-eliminate').addEventListener('click', confirmElimination);
  $('#btn-skip-round').addEventListener('click', skipRound);

  /* --- Nút thoát ván (✕) ở các màn hình trong ván --- */
  $$('[data-action="quit"]').forEach((btn) => btn.addEventListener('click', () => confirmDialog({
    icon: '🚪',
    title: 'Thoát ván chơi?',
    body: '<p>Ván hiện tại sẽ kết thúc và không thể tiếp tục.</p>',
    confirmLabel: 'Thoát',
    variant: 'danger',
    onConfirm: quitGame,
  })));

  /* --- Kết quả --- */
  $('#btn-play-again').addEventListener('click', startGame);
  $('#btn-back-setup').addEventListener('click', () => {
    state.game = null;
    renderResumeBanner();
    renderPlayerList();
    renderSetupOptions();
    showScreen('setup');
  });

  /* --- Modal: đóng bằng nền mờ / Esc, Enter trong ô nhập = nút chính --- */
  $('#modal').addEventListener('click', (e) => {
    if (e.target.matches('[data-modal-backdrop]') && $('#modal').dataset.dismissible === 'true') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    const modal = $('#modal');
    if (modal.hidden) return;
    if (e.key === 'Escape' && modal.dataset.dismissible === 'true') closeModal();
    if (e.key === 'Enter' && e.target.matches('#modal-body input')) {
      e.preventDefault();
      $('#modal-actions').lastElementChild?.click();
    }
  });

  /* --- Bảo mật & tiện ích khi chuyển tab / khóa màn hình --- */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      setCardRevealed(false); // luôn úp thẻ khi rời ứng dụng
    } else if (state.game && state.game.phase !== 'result') {
      requestWakeLock(); // Wake Lock tự nhả khi tab bị ẩn, cần xin lại
    }
  });
}

/* =====================================================================
 * 14. KHỞI ĐỘNG
 * ===================================================================== */
function init() {
  // Khôi phục ván dở (nếu có)
  const saved = loadJSON(STORAGE_KEYS.game, null);
  if (saved && Array.isArray(saved.players) && saved.phase !== 'result') {
    state.game = saved;
  }

  bindEvents();
  renderPlayerList();
  renderSetupOptions();
  renderResumeBanner();
  renderWordsScreen();
  renderTimer();
}

document.addEventListener('DOMContentLoaded', init);
