/* ============================================================
 * 分节 Markdown 解析器（character.html / content.html 共用）
 * ------------------------------------------------------------
 * 约定格式：
 *
 *   ## 小节标题
 *   - id: intro        ← 可选，锚点用；省略自动生成 p1/p2…
 *   - 任意键: 值       ← 元信息，键名由调用方通过 alias 决定
 *
 *   （空一行）

 *   正文 Markdown……
 *
 * 用法：
 *   MDSections.parse(markdown, { alias: { 职位: 'field' } })
 *   → [{ id, title, meta, body, html }, ...]
 * ============================================================ */
(function (global) {
  'use strict';

  /** 把 Markdown 渲染成 HTML；marked 未加载时退化为纯文本 */
  function toHtml(md) {
    if (!md) return '';
    if (global.marked && typeof global.marked.parse === 'function') {
      return global.marked.parse(md);
    }
    return '<p>' + escapeHtml(md).replace(/\n/g, '<br>') + '</p>';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalize(text) {
    return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  /**
   * @param {string} markdown 源文本
   * @param {{alias?: Object<string,string>}} options 元信息键名映射
   */
  function parse(markdown, options) {
    options = options || {};
    const alias = Object.assign({ id: 'id' }, options.alias || {});

    const source = normalize(markdown);
    const chunks = source.split(/^##[ \t]+/m).slice(1);   // 第一段是文件头注释
    const usedIds = new Set();

    return chunks.map(function (chunk, index) {
      const lines = chunk.split('\n');

      // 1) 标题（去掉可能存在的 ** / _ / ` 标记）
      const title = lines.shift().replace(/[*_`]/g, '').trim();

      // 2) 元信息：跳过空行后连续读取 "- 键: 值"
      //    只有第一行是「已知键」才认为是元信息块；块内出现未知键
      //    不中断（跳过即可），直到空行或非列表行结束。
      const meta = {};
      let cursor = 0;
      while (cursor < lines.length && !lines[cursor].trim()) cursor++;

      const firstLine = cursor < lines.length ? lines[cursor].trim() : '';
      const firstMatch = firstLine.match(/^[-*+]\s*([^:：]+?)\s*[:：]\s*(.*)$/);
      const firstKey = firstMatch
        ? (alias[firstMatch[1].trim().toLowerCase()] || alias[firstMatch[1].trim()])
        : null;

      if (firstKey) {
        while (cursor < lines.length) {
          const line = lines[cursor].trim();
          if (!line) { cursor++; break; }

          const matched = line.match(/^[-*+]\s*([^:：]+?)\s*[:：]\s*(.*)$/);
          if (!matched) break;

          const label = matched[1].trim();
          const key = alias[label.toLowerCase()] || alias[label];
          if (key) meta[key] = matched[2].trim();   // 未知键跳过，但仍算元信息行
          cursor++;
        }
      }

      // 3) 剩余空行之后即正文
      while (cursor < lines.length && !lines[cursor].trim()) cursor++;
      const body = lines.slice(cursor).join('\n').trim();

      // 4) id 兜底 + 去重
      const baseId = meta.id || 'p' + (index + 1);
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = baseId + '-' + suffix++;
      usedIds.add(id);

      return {
        id: id,
        title: title || '未命名 ' + (index + 1),
        meta: meta,
        body: body,
        html: toHtml(body),
      };
    });
  }

  global.MDSections = { parse: parse, toHtml: toHtml, escapeHtml: escapeHtml };
})(window);
