/* ============================================================
 * 东方红 Wiki · 人物墙（按分类分标签页）
 * ------------------------------------------------------------
 * 数据存放在 data/characters.md（Markdown），本文件只负责
 * 读取 → 解析 → 按「分类」分组 → 渲染 → 交互。
 *
 * 详情交互：点击卡片后，该人物的头像会飞到人物墙第一格，
 * 详情框显示在这个头像右侧，同一行的其余位置让给详情；
 * 再点一次头像或右上角 × 收起，卡片回到原来的位置。
 *
 * ⚠ 浏览器不允许 file:// 页面 fetch 本地文件，请用本地服务打开：
 *     python3 -m http.server 8000      → http://localhost:8000/character.html
 * ============================================================ */

/* ========== 配置 ========== */
const DATA_URL = './data/characters.md';
const IMAGE_BASE = './image/character/';          // 头像只写文件名时的默认目录

/* 没有写分类的人物归到这里 */
const DEFAULT_GROUP = '未分类';

/* 元信息的键名别名：中英文都认，大小写不敏感 */
const META_ALIAS = {
  id: 'id', 编号: 'id',
  name: 'name', 姓名: 'name', 名称: 'name',
  field: 'field', 领域: 'field', 学科: 'field', 职业: 'field',
  职位: 'field', 职务: 'field', 身份: 'field',
  group: 'group', 分类: 'group', 类别: 'group', 分组: 'group',
  img: 'img', 头像: 'img', 图片: 'img', 图像: 'img',
};

/* ========== 元素引用 ========== */
const navBarEl = document.querySelector('.chara-navbar');
const navEl    = document.querySelector('.chara-nav');
const bodyEl   = document.querySelector('.chara-body');

/* ========== 状态 ========== */
const state = {
  byId: new Map(),      // id → 人物对象，O(1) 查找
  groups: [],           // [{ id, title, items, el, btn, wall }]
  currentId: null,
  open: false,
  cardEl: null,         // 当前展开的卡片（被移出网格，收起时放回）
  wall: null,           // 该卡片所在的 .wall
  stage: null,          // 详情区元素
  nextSibling: null,    // 卡片原来的下一个兄弟，用于归位
  closeTimer: null,
};

/* ============================================================
 * 一、数据解析（分节 Markdown 的解析规则见 js/md-sections.js）
 * ============================================================ */

/**
 * 头像路径补全：einstein.png → ./image/character/einstein.png
 * 已带路径（./ / / http）的写法原样返回，因此子目录也可以写：
 *   - 头像: CPC/CPC_He_Long.png  → ./image/character/CPC/CPC_He_Long.png
 */
function resolveImg(src) {
  if (!src) return '';
  if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('/') || src.startsWith('.')) {
    return src;
  }
  return IMAGE_BASE + src;
}

/** 没写「头像」时按 id 自动猜测：einstein → ./image/character/einstein.png */
function guessImg(item) {
  return item.id ? IMAGE_BASE + item.id + '.png' : '';
}

/** characters.md → 人物数组 */
function parseCharacters(markdown) {
  return MDSections.parse(markdown, { alias: META_ALIAS }).map(item => ({
    id: item.id,
    name: item.title,
    field: item.meta.field || '',
    group: (item.meta.group || DEFAULT_GROUP).trim(),
    img: resolveImg(item.meta.img),
    bio: item.body,
    html: item.html,
  }));
}

/**
 * 按分类分组：标签顺序 = 分类在文件里首次出现的顺序，
 * 组内顺序 = 人物在文件里的顺序。
 */
function groupCharacters(list) {
  const order = [];
  const bucket = new Map();

  list.forEach(item => {
    const key = item.group || DEFAULT_GROUP;
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key).push(item);
  });

  return order.map((title, index) => ({
    id: 'g' + (index + 1),          // 锚点用，分类增删后会重排
    title,
    items: bucket.get(title),
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

/**
 * 往容器里填入头像：
 *   1. 写了「头像」字段 → 用它；
 *   2. 没写 → 自动尝试 ./image/character/<id>.png；
 *   3. 图片不存在或加载失败 → 回落到首字头像。
 */
function fillPortrait(container, item) {
  container.replaceChildren();

  const fallback = () => {
    container.replaceChildren();
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = getInitial(item.name);
    container.appendChild(avatar);
  };

  const src = item.img || guessImg(item);
  if (!src) return fallback();

  const img = document.createElement('img');
  img.src = src;
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

  const nameEl = document.createElement('h3');
  nameEl.className = 'card-name';
  nameEl.textContent = item.name;
  info.appendChild(nameEl);

  if (item.field) {
    const fieldEl = document.createElement('p');
    fieldEl.className = 'card-field';
    fieldEl.textContent = item.field;
    info.appendChild(fieldEl);
  }

  card.append(portrait, divider, info);
  return card;
}

/** 生成分类按钮 + 对应的人物面板 */
function renderGroups(groups) {
  const navFrag = document.createDocumentFragment();
  const bodyFrag = document.createDocumentFragment();

  groups.forEach(group => {
    // 1) 分类按钮
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.id = `tab-${group.id}`;
    btn.dataset.target = group.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `panel-${group.id}`);
    btn.setAttribute('aria-selected', 'false');
    btn.tabIndex = -1;

    btn.appendChild(document.createTextNode(group.title));
    const count = document.createElement('span');
    count.className = 'tab-count';
    count.textContent = group.items.length;
    btn.appendChild(count);

    // 2) 人物面板
    const panel = document.createElement('section');
    panel.className = 'chara-panel';
    panel.id = `panel-${group.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${group.id}`);

    const wall = document.createElement('div');
    wall.className = 'wall';
    group.items.forEach(item => wall.appendChild(createCard(item)));

    panel.appendChild(wall);
    navFrag.appendChild(btn);
    bodyFrag.appendChild(panel);

    group.btn = btn;
    group.el = panel;
    group.wall = wall;
  });

  navEl.setAttribute('role', 'tablist');
  navEl.setAttribute('aria-label', '人物分类');
  navEl.replaceChildren(navFrag);
  bodyEl.replaceChildren(bodyFrag);

  // 只有一个分类时没必要显示标签栏
  if (navBarEl) navBarEl.hidden = groups.length <= 1;
}

/** 切换分类：只显示选中那一组 */
function showGroup(id, options) {
  options = options || {};
  if (!state.groups.length) return;

  const target = state.groups.find(g => g.id === id) || state.groups[0];

  // 切组时顺手收起已展开的详情，避免详情留在隐藏面板里
  if (state.open && state.wall && state.wall.parentNode !== target.el) {
    closeDetail({ instant: true, restoreFocus: false });
  }

  state.groups.forEach(group => {
    const on = group === target;
    group.el.classList.toggle('is-active', on);
    group.btn.classList.toggle('is-active', on);
    group.btn.setAttribute('aria-selected', on ? 'true' : 'false');
    group.btn.tabIndex = on ? 0 : -1;
  });

  state.currentId = target.id;

  if (options.scroll !== false) {
    const top = bodyEl.getBoundingClientRect().top;
    if (top < 80) window.scrollTo({ top: window.scrollY + top - 110, behavior: 'smooth' });
  }

  if (options.updateHash !== false) {
    history.replaceState(null, '', '#' + target.id);
  }
}

/** 加载中 / 加载失败 / 空数据的提示（放在人物墙的网格容器里） */
function renderNotice({ title, desc, code }) {
  const wall = document.createElement('div');
  wall.className = 'wall';

  const box = document.createElement('div');
  box.className = 'wall-notice';
  box.innerHTML = `
    <p class="notice-title">${escapeHtml(title)}</p>
    ${desc ? `<p class="notice-desc">${desc}</p>` : ''}
    ${code ? `<code>${escapeHtml(code)}</code>` : ''}`;

  wall.appendChild(box);
  bodyEl.replaceChildren(wall);
  if (navBarEl) navBarEl.hidden = true;
}

/* ============================================================
 * 四、详情区（人物墙第一行：头像 + 右侧详情）
 * ============================================================ */

/** 取得（或创建）该墙的详情区，并放到网格最前面 */
function ensureStage(wall) {
  let stage = wall.querySelector('.chara-stage');

  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'chara-stage';

    const portraitEl = document.createElement('div');
    portraitEl.className = 'stage-portrait';
    portraitEl.tabIndex = 0;
    portraitEl.setAttribute('role', 'button');
    portraitEl.setAttribute('aria-label', '收起详情');

    const box = document.createElement('div');
    box.className = 'stage-box';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', '人物详情');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'stage-close';
    closeBtn.setAttribute('aria-label', '收起详情');
    closeBtn.innerHTML = '&times;';

    const nameEl = document.createElement('h2');
    nameEl.className = 'stage-name';

    const fieldEl = document.createElement('p');
    fieldEl.className = 'stage-field';

    const bioEl = document.createElement('div');
    bioEl.className = 'stage-bio';

    box.append(closeBtn, nameEl, fieldEl, bioEl);
    stage.append(portraitEl, box);

    closeBtn.addEventListener('click', () => closeDetail());
    portraitEl.addEventListener('click', () => closeDetail());
    portraitEl.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      closeDetail();
    });
  }

  // 保证详情区始终是第一行（新插入或已存在都移到最前）
  if (wall.firstElementChild !== stage) wall.insertBefore(stage, wall.firstChild);
  return stage;
}

/**
 * 展开详情：
 *   记录卡片原位置 → 创建/复用详情区 → 移除卡片（其余卡片顺势补位）
 *   → 用 FLIP 让头像从原卡片位置飞到第一格。
 */
function openDetail(cardEl, item) {
  const wall = cardEl.closest('.wall');
  if (!wall) return;

  // 已经是这个人在展开状态，再点不做处理
  if (state.open && state.cardEl === cardEl) return;

  // 换人：先把上一位瞬间收起（不恢复焦点，避免抢焦点）
  if (state.open) closeDetail({ instant: true, restoreFocus: false });

  // 先量卡片头像的位置，再改变布局
  const startRect = cardEl.querySelector('.portrait').getBoundingClientRect();

  const stage = ensureStage(wall);
  const portraitEl = stage.querySelector('.stage-portrait');
  const nameEl = stage.querySelector('.stage-name');
  const fieldEl = stage.querySelector('.stage-field');
  const bioEl = stage.querySelector('.stage-bio');

  nameEl.textContent = item.name;
  fieldEl.textContent = item.field || '';
  fieldEl.hidden = !item.field;
  bioEl.innerHTML = item.html || '<p>暂无介绍内容。</p>';
  fillPortrait(portraitEl, item);
  portraitEl.setAttribute('aria-label', `收起 ${item.name} 的详情`);

  // 记住归位锚点，然后把卡片从网格里摘掉，让其他卡片补位
  const nextSibling = cardEl.nextElementSibling;
  cardEl.remove();

  // 布局稳定后再量落点
  const endRect = portraitEl.getBoundingClientRect();
  void portraitEl.offsetWidth;

  const dx = startRect.left - endRect.left;
  const dy = startRect.top - endRect.top;
  const sx = endRect.width ? startRect.width / endRect.width : 1;
  const sy = endRect.height ? startRect.height / endRect.height : 1;

  portraitEl.style.transition = 'none';
  portraitEl.style.transformOrigin = 'top left';
  portraitEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  void portraitEl.offsetWidth;

  requestAnimationFrame(() => {
    stage.classList.add('is-open');
    portraitEl.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
    portraitEl.style.transform = 'none';
  });

  state.open = true;
  state.cardEl = cardEl;
  state.wall = wall;
  state.stage = stage;
  state.nextSibling = nextSibling;

  // 详情区在视口上方时（点了靠下的卡片）把它拉回可视区
  const stageTop = stage.getBoundingClientRect().top;
  if (stageTop < 90) {
    window.scrollTo({ top: window.scrollY + stageTop - 110, behavior: 'smooth' });
  }

  stage.querySelector('.stage-close').focus({ preventScroll: true });
}

/** 收起详情：卡片放回原位，详情区淡出后移除 */
function closeDetail(options) {
  options = options || {};
  if (!state.open) return;

  const { cardEl, wall, nextSibling, stage } = state;
  state.open = false;

  if (stage) stage.classList.remove('is-open');

  // 把卡片插回原来的位置
  if (cardEl && wall) {
    if (nextSibling && nextSibling.parentNode === wall) {
      wall.insertBefore(cardEl, nextSibling);
    } else {
      wall.appendChild(cardEl);
    }
  }

  const finish = () => {
    if (stage && stage.parentNode) stage.remove();
    if (cardEl && options.restoreFocus !== false) {
      cardEl.focus({ preventScroll: true });
    }
  };

  clearTimeout(state.closeTimer);
  if (options.instant) {
    finish();
  } else {
    state.closeTimer = setTimeout(finish, 260);
  }

  state.cardEl = null;
  state.wall = null;
  state.stage = null;
  state.nextSibling = null;
}

/* ============================================================
 * 五、事件
 * ============================================================ */
function activateCard(cardEl) {
  if (!cardEl) return;
  const item = state.byId.get(cardEl.dataset.id);
  if (item) openDetail(cardEl, item);
}

bodyEl.addEventListener('click', e => {
  activateCard(e.target.closest('.card'));
});

bodyEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  activateCard(card);
});

/* 点击分类按钮切换 */
navEl.addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (btn) showGroup(btn.dataset.target);
});

/* 键盘左右方向键切换分类 */
navEl.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const index = state.groups.findIndex(group => group.id === state.currentId);
  if (index < 0) return;

  const step = e.key === 'ArrowRight' ? 1 : -1;
  const next = state.groups[(index + step + state.groups.length) % state.groups.length];

  e.preventDefault();
  showGroup(next.id);
  next.btn.focus();
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
  state.groups = groupCharacters(list);
  renderGroups(state.groups);

  // 初始：优先取地址栏 #锚点，否则第一组
  const initial = decodeURIComponent(location.hash.slice(1));
  showGroup(initial || state.groups[0].id, { updateHash: false, scroll: false });
})();
