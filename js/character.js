/* ============================================================
 * 东方红 Wiki · 人物墙
 * ------------------------------------------------------------
 * 数据不再写在 JS 里，而是存放在 data/characters.md（Markdown），
 * 本文件只负责：读取 → 解析 → 渲染 → 交互。
 *
 * 新增一个人物 = 在 characters.md 里加一段，无需改动这里。
 *
 * ⚠ 浏览器不允许 file:// 页面 fetch 本地文件，请用本地服务打开：
 *     python3 -m http.server 8000      → http://localhost:8000/character.html
 *     npx serve                        → 任选端口
 * ============================================================ */

/* ========== 配置 ========== */
const DATA_URL = './data/characters.md';
const IMAGE_BASE = './image/';          // 头像只写文件名时的默认目录

/* 元信息的键名别名：中英文都认，大小写不敏感 */
const META_ALIAS = {
  id: 'id', 编号: 'id',
  name: 'name', 姓名: 'name', 名称: 'name',
  field: 'field', 领域: 'field', 学科: 'field', 职业: 'field',
  img: 'img', 头像: 'img', 图片: 'img', 图像: 'img',
};

/* ========== 元素引用 ========== */
const wallEl         = document.querySelector('.wall');
const detailLayer    = document.querySelector('.detail-layer');
const detailInner    = document.querySelector('.detail-inner');
const detailPortrait = document.querySelector('.detail-portrait');
const detailBox      = document.querySelector('.detail-box');
const detailName     = document.querySelector('.detail-name');
const detailField    = document.querySelector('.detail-field');
const detailBio      = document.querySelector('.detail-bio');
const detailClose    = document.querySelector('.detail-close');

/* ========== 状态 ========== */
const state = {
  byId: new Map(),      // id → 人物对象，O(1) 查找
  open: false,
  activeCard: null,     // 打开详情时对应的卡片，关闭后归还焦点
  hideTimer: null,      // 关闭动画定时器，避免快速开关时互相打断
};

/* ============================================================
 * 一、数据解析（分节 Markdown 的解析规则见 js/md-sections.js）
 * ============================================================ */

/** 头像路径补全：einstein.png → ./image/einstein.png */
function resolveImg(src) {
  if (!src) return '';
  if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('/') || src.startsWith('.')) {
    return src;
  }
  return IMAGE_BASE + src;
}

/** characters.md → 人物数组 */
function parseCharacters(markdown) {
  return MDSections.parse(markdown, { alias: META_ALIAS }).map(item => ({
    id: item.id,
    name: item.title,
    field: item.meta.field || '',
    img: resolveImg(item.meta.img),
    bio: item.body,
    html: item.html,
  }));
}

/* ============================================================
 * 二、工具函数
 * ============================================================ */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 取姓名首字作为占位头像（中文取首字，英文取首字母） */
function getInitial(name) {
  const clean = String(name).replace(/[·•・.\s]/g, '');
  return clean ? clean.charAt(0).toUpperCase() : '?';
}

/** 往容器里填入头像：有图用图，没图用首字；图片加载失败也回落到首字 */
function fillPortrait(container, item) {
  container.replaceChildren();

  const fallback = () => {
    container.replaceChildren();
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = getInitial(item.name);
    container.appendChild(avatar);
  };

  if (!item.img) return fallback();

  const img = document.createElement('img');
  img.src = item.img;
  img.alt = item.name;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', fallback, { once: true });
  container.appendChild(img);
}

/* ============================================================
 * 三、渲染
 * ============================================================ */
function createCard(item) {
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.dataset.id = item.id;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label',
    item.field ? `${item.name}，${item.field}` : item.name);

  // 1) 头像区
  const portrait = document.createElement('div');
  portrait.className = 'portrait';
  fillPortrait(portrait, item);

  // 2) 分隔线
  const divider = document.createElement('div');
  divider.className = 'divider';

  // 3) 文字区
  const info = document.createElement('div');
  info.className = 'info';
  info.innerHTML =
    `<h3 class="card-name">${escapeHtml(item.name)}</h3>` +
    (item.field ? `<p class="card-field">${escapeHtml(item.field)}</p>` : '');

  card.append(portrait, divider, info);
  return card;
}

function renderWall(list) {
  const frag = document.createDocumentFragment();
  list.forEach(item => frag.appendChild(createCard(item)));
  wallEl.replaceChildren(frag);
}

/** 加载中 / 加载失败 / 空数据的提示 */
function renderNotice({ title, desc, code }) {
  const box = document.createElement('div');
  box.className = 'wall-notice';
  box.innerHTML = `
    <p class="notice-title">${escapeHtml(title)}</p>
    ${desc ? `<p class="notice-desc">${desc}</p>` : ''}
    ${code ? `<code>${escapeHtml(code)}</code>` : ''}`;
  wallEl.replaceChildren(box);
}

/* ============================================================
 * 四、详情层
 * ============================================================ */
function openDetail(cardEl, item) {
  if (state.open) return;
  state.open = true;
  state.activeCard = cardEl;

  // 若上一次关闭动画还没走完，先取消，避免它把新内容清空
  clearTimeout(state.hideTimer);
  state.hideTimer = null;

  // 填充文本
  detailName.textContent = item.name;

  detailField.textContent = item.field || '';
  detailField.hidden = !item.field;

  detailBio.innerHTML = item.html || '<p>暂无介绍内容。</p>';

  // 头像：与卡片共用同一套填充逻辑
  fillPortrait(detailPortrait, item);

  // 显示详情层（此刻 opacity 仍为 0，但排版已完成）
  detailLayer.hidden = false;
  detailLayer.setAttribute('aria-hidden', 'false');
  detailLayer.setAttribute('role', 'dialog');
  detailLayer.setAttribute('aria-modal', 'true');
  document.body.classList.add('no-scroll');
  void detailLayer.offsetWidth;            // 强制重排，保证 rect 可测
  detailLayer.classList.add('visible');

  // FLIP：测量卡片头像与详情头像的位置差，先瞬间位移过去
  const srcPortrait = cardEl.querySelector('.portrait');
  const startRect = srcPortrait.getBoundingClientRect();
  const endRect   = detailPortrait.getBoundingClientRect();

  const dx = startRect.left - endRect.left;
  const dy = startRect.top  - endRect.top;
  const sx = startRect.width  / endRect.width;
  const sy = startRect.height / endRect.height;

  detailPortrait.style.transition = 'none';
  detailPortrait.style.transformOrigin = 'top left';
  detailPortrait.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  // 其他卡片淡出，被点中的卡片隐藏（视觉上由飞行头像顶替）
  wallEl.querySelectorAll('.card').forEach(card => {
    card.classList.add(card === cardEl ? 'is-hidden' : 'card-out');
  });

  void detailPortrait.offsetWidth;         // 强制应用初始 transform

  requestAnimationFrame(() => {
    detailPortrait.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
    detailPortrait.style.transform = 'none';
    detailBox.classList.add('show');
  });

  detailClose.focus({ preventScroll: true });
}

function closeDetail() {
  if (!state.open) return;
  state.open = false;

  detailLayer.classList.remove('visible');
  detailBox.classList.remove('show');
  document.body.classList.remove('no-scroll');
  detailLayer.setAttribute('aria-hidden', 'true');

  wallEl.querySelectorAll('.card').forEach(card => {
    card.classList.remove('is-hidden', 'card-out');
  });

  // 焦点归还给刚才那张卡片
  if (state.activeCard) {
    state.activeCard.focus({ preventScroll: true });
    state.activeCard = null;
  }

  state.hideTimer = setTimeout(() => {
    detailLayer.hidden = true;
    detailPortrait.replaceChildren();
    detailPortrait.style.transition = 'none';
    detailPortrait.style.transform = 'none';
    state.hideTimer = null;
  }, 360);
}

/* ============================================================
 * 五、事件
 * ============================================================ */
function activateCard(cardEl) {
  if (!cardEl || state.open) return;
  const item = state.byId.get(cardEl.dataset.id);
  if (item) openDetail(cardEl, item);
}

wallEl.addEventListener('click', e => {
  activateCard(e.target.closest('.card'));
});

wallEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  activateCard(card);
});

detailClose.addEventListener('click', closeDetail);

detailLayer.addEventListener('click', e => {
  // 点击遮罩空白或 inner 空白处关闭
  if (e.target === detailLayer || e.target === detailInner) closeDetail();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.open) closeDetail();
});

/* ============================================================
 * 六、启动
 * ============================================================ */
async function loadCharacters() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCharacters(await res.text());
}

(async function boot() {
  renderNotice({ title: '正在加载人物数据…' });

  let list = [];
  try {
    list = await loadCharacters();
  } catch (err) {
    console.error('[character] 数据加载失败：', err);

    const isFileProtocol = location.protocol === 'file:';
    renderNotice({
      title: isFileProtocol ? '请不要双击打开本页' : '人物数据加载失败',
      desc: isFileProtocol
        ? '浏览器出于安全限制，禁止 file:// 页面读取 <code>data/characters.md</code>。请在项目根目录起一个本地服务后再访问：'
        : '未能读取 <code>data/characters.md</code>，请检查文件是否存在：',
      code: 'python3 -m http.server 8000  →  http://localhost:8000/character.html',
    });
    return;
  }

  if (!list.length) {
    renderNotice({ title: '暂无人物数据', desc: '请在 <code>data/characters.md</code> 中添加内容。' });
    return;
  }

  state.byId = new Map(list.map(item => [item.id, item]));
  renderWall(list);
})();
