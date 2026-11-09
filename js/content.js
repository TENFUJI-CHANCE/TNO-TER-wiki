/* ============================================================
 * 内容页：读取 data/content.md → 横向按钮（标签页）+ 单节正文
 * ------------------------------------------------------------
 * 点哪个按钮，就只显示那一节内容。
 * 新增一节内容 = 在 data/content.md 里加一段 "## 标题"，无需改本文件。
 * 注：fetch 本地文件需通过 HTTP 服务打开（python3 -m http.server）
 * ============================================================ */

const DATA_URL = './data/content.md';

const navEl = document.querySelector('.content-nav');
const bodyEl = document.querySelector('.content-body');

let sections = [];        // [{ id, title, el, btn }]
let currentId = null;

/* ========== 状态提示 ========== */
function showHint(html) {
  if (navEl) navEl.hidden = true;
  bodyEl.innerHTML = `<p class="content-hint">${html}</p>`;
}

/* ========== 生成按钮 + 面板 ========== */
function buildSections(list) {
  const navFrag = document.createDocumentFragment();
  const bodyFrag = document.createDocumentFragment();
  const items = [];

  list.forEach(raw => {
    const id = raw.id;

    // 横向按钮
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'content-nav-btn';
    btn.id = `tab-${id}`;
    btn.dataset.target = id;
    btn.textContent = raw.title;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `panel-${id}`);
    btn.setAttribute('aria-selected', 'false');
    btn.tabIndex = -1;

    // 内容面板
    const panel = document.createElement('section');
    panel.className = 'doc-section';
    panel.id = `panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${id}`);

    const title = document.createElement('h2');
    title.className = 'doc-title';
    title.textContent = raw.title;

    const md = document.createElement('div');
    md.className = 'md-body';
    md.innerHTML = raw.html;            // 内容来自本站 Markdown，可信

    panel.append(title, md);
    navFrag.appendChild(btn);
    bodyFrag.appendChild(panel);

    items.push({ id, title: raw.title, el: panel, btn });
  });

  navEl.setAttribute('role', 'tablist');
  navEl.replaceChildren(navFrag);
  bodyEl.replaceChildren(bodyFrag);

  return items;
}

/* ========== 切换：只显示选中那一节 ========== */
function showSection(id, options) {
  options = options || {};
  if (!sections.length) return;

  const target = sections.find(item => item.id === id) || sections[0];

  sections.forEach(item => {
    const on = item === target;
    item.el.classList.toggle('is-active', on);
    item.btn.classList.toggle('is-active', on);
    item.btn.setAttribute('aria-selected', on ? 'true' : 'false');
    item.btn.tabIndex = on ? 0 : -1;
  });

  currentId = target.id;

  // 切换后如果面板顶部已经跑到视口上方，把它拉回可视区
  if (options.scroll !== false) {
    const top = bodyEl.getBoundingClientRect().top;
    if (top < 80) window.scrollTo({ top: window.scrollY + top - 110, behavior: 'smooth' });
  }

  // 记住当前小节：刷新或分享链接都能回到同一节
  if (options.updateHash !== false) {
    history.replaceState(null, '', '#' + target.id);
  }
}

/* ========== 启动 ========== */
async function boot() {
  if (!navEl || !bodyEl) return;

  let parsed = [];
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parsed = MDSections.parse(await res.text());
  } catch (err) {
    console.error('[content] 内容加载失败：', err);
    showHint(location.protocol === 'file:'
      ? '浏览器不允许 file:// 页面读取 <code>data/content.md</code>，请通过本地服务访问：<br><code>python3 -m http.server 8000</code>'
      : '未能读取 <code>data/content.md</code>，请检查文件是否存在。');
    return;
  }

  if (!parsed.length) {
    showHint('暂无内容，请在 <code>data/content.md</code> 中添加 "## 标题" 小节。');
    return;
  }

  sections = buildSections(parsed);

  // 点击按钮切换
  navEl.addEventListener('click', e => {
    const btn = e.target.closest('.content-nav-btn');
    if (btn) showSection(btn.dataset.target);
  });

  // 键盘左右方向键切换
  navEl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const index = sections.findIndex(item => item.id === currentId);
    if (index < 0) return;

    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = sections[(index + step + sections.length) % sections.length];

    e.preventDefault();
    showSection(next.id);
    next.btn.focus();
  });

  // 初始：优先取地址栏 #锚点，否则第一节
  const initial = decodeURIComponent(location.hash.slice(1));
  showSection(initial || sections[0].id, { updateHash: false, scroll: false });
}

boot();
