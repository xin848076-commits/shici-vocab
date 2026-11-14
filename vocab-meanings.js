/* Local dictionary references are optional; only user actions fill the meaning. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Reviewed supplements for common phrases and easily confused dictionary entries.
  const supplements = {
    'bank': 'n. 银行；岸；堤\nv. 把钱存入银行',
    'apple': 'n. 苹果；苹果树',
    'inpatient': 'n. 住院病人\nadj. 住院的',
    'outpatient': 'n. 门诊病人\nadj. 门诊的',
    'capability': 'n. 能力；才能；（机器等的）性能',
    'in essence': '本质上；实质上',
    'in practice': '实际上；在实践中',
    'in effect': '实际上；事实上；生效中',
    'as a matter of fact': '事实上',
    'be obsessed with': '痴迷于……；对……着迷',
    'be addicted to': '沉迷于……；对……上瘾',
    'a distorted concept of': '对……的错误观念；对……的歪曲认识',
    'brand-name products': '名牌商品',
    'consumer goods': '消费品',
    'play a crucial role in': '在……中起关键作用',
    'attitude is everything': '态度决定一切',
    'a case in point is': '一个典型的例子是……',
    'for instance': '例如；比如',
    'as is vividly depicted in': '正如……中生动描绘的那样',
    'for the following reasons': '理由如下；出于以下原因',
    'a hot-button issue': '敏感的热点问题；容易引起争议的问题',
    'in-person': 'adj. 亲自进行的；面对面的',
    'in person': '亲自；当面',
    'be attributed to': '被归因于……',
    'contribute to': '有助于……；促成……；为……作贡献',
    'rely on': '依赖；依靠；信赖',
    'embrace life': '拥抱生活',
  };
  const normalize = text => text.normalize('NFKC').trim().toLowerCase().replace(/[‘’]/g, "'").replace(/[‐‑‒–—−]/g, '-').replace(/[\u200b\uFEFF]/g, '').replace(/\s+/g, ' ').replace(/\s*(?:\.{2,}|…+|[.!?,;:]+)\s*$/, '').trim();
  function candidates(text) {
    const original = normalize(text), result = new Set([original]);
    const add = key => { if (key) result.add(key); };
    add(original.replace(/^[(（]观点[)）]\s*\.{2,}\s*/, ''));
    add(original.replace(/\s*-\s*/g, '-'));
    add(original.replace(/-/g, ' '));
    const placeholder = original.replace(/\b(?:someone|somebody|sb)\.?\b/g, 'sb.').replace(/\b(?:something|sth)\.?\b/g, 'sth.').replace(/\.{2,}/g, '.');
    add(placeholder);
    for (const sth of ['sth.', 'sth', 'something']) for (const sb of ['sb.', 'sb', 'somebody', 'someone']) add(placeholder.replace(/\bsth\./g, sth).replace(/\bsb\./g, sb));
    for (const key of [...result]) {
      add(key.replace(/^(?:can|could|may|might|must|should|will|would)\s+(be\s+)/, '$1'));
      add(key.replace(/^(?:am|is|are|was|were|being|been)\s+/, 'be '));
      if (key.startsWith('be ')) add(key.slice(3));
    }
    for (const key of [...result]) add(key.replace(/\b(?:sb\.?|sth\.?|somebody|someone|something)\s*$/g, '').trim());
    return [...result];
  }
  function splitSenses(raw) {
    const lines = raw.replace(/\\n/g, '\n').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    // Prefer general senses over specialist domain notes when both are available.
    const general = lines.filter(line => !/^\[[^\]]+\]/.test(line));
    const selected = general.length ? general : lines;
    const result = [];
    for (let line of selected) {
      const match = line.match(/^([a-z]+\.)\s*/i);
      let pos = match ? match[1] + ' ' : '';
      if (match) line = line.slice(match[0].length);
      let depth = 0, chunk = '';
      const add = () => {
        let part = chunk.trim();
        const ownPos = part.match(/^([a-z]+\.)\s*/i);
        if (ownPos) { pos = ownPos[1] + ' '; part = part.slice(ownPos[0].length); }
        const sense = (pos + part).trim();
        if (part && !result.includes(sense)) result.push(sense);
        chunk = '';
      };
      for (const char of line) {
        if ('（(['.includes(char)) depth++;
        if ('）)]'.includes(char)) depth = Math.max(0, depth - 1);
        if (depth === 0 && ',，;；'.includes(char)) add(); else chunk += char;
      }
      add();
    }
    return result.slice(0, 40);
  }
  function lookupDetailed(text) {
    for (const key of candidates(text)) {
      const illustrated = globalThis.ShiciExamples?.referenceSenses(key);
      if (illustrated?.length && !globalThis.ShiciExamples?.isExtendedWord(key)) return { meanings: illustrated, key };
      for (const source of [globalThis.SHICI_PHRASE_SUPPLEMENTS, supplements, globalThis.SHICI_PHRASES, globalThis.SHICI_MEANINGS]) {
        if (source && Object.hasOwn(source, key)) return { meanings: splitSenses(source[key]), key };
      }
      if (illustrated?.length) return { meanings: illustrated, key };
    }
    return { meanings: [], key: normalize(text) };
  }
  function lookup(text) { return lookupDetailed(text).meanings; }
  globalThis.ShiciMeanings = { lookup, lookupDetailed, normalize, splitSenses };
  const input = $('word');
  if (!input) return;
  const area = $('meaning-reference'), options = $('meaning-options'), feedback = $('meaning-feedback');
  const actions = $('meaning-actions'), status = $('meaning-query-status'), manual = $('meaning-copy-fallback');
  let timer, composing = false, entries = [], query = '';
  const selected = () => [...options.querySelectorAll('input:checked')].map(box => box.value);
  function updateActions() {
    const count = selected().length;
    $('meaning-insert').disabled = $('meaning-copy-selected').disabled = !count;
    $('meaning-insert').textContent = count ? `加入已选释义（${count}）` : '加入已选释义';
  }
  function clear() {
    clearTimeout(timer); entries = []; query = ''; options.replaceChildren();
    actions.hidden = true; options.hidden = true; feedback.textContent = ''; manual.hidden = true; manual.value = '';
  }
  // 「0 = 自己写中文」：始终排在列表末尾，按数字 0 或点一下就能进中文框。
  function appendManualOption() {
    const card = document.createElement('div'); card.className = 'meaning-sense-card meaning-manual';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'meaning-manual-btn';
    const badge = document.createElement('b'); badge.className = 'meaning-index'; badge.textContent = '0'; badge.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = '自己写中文（写好按回车收下）';
    button.append(badge, text);
    button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('shici-manual-meaning')));
    card.append(button); options.append(card);
  }
  function render() {
    clear();
    query = input.value;
    if (!query.trim()) { area.hidden = true; return; }
    area.hidden = false;
    if (!globalThis.SHICI_MEANINGS) { status.textContent = '本地词典未能加载，请保留 vocab-meanings 文件夹并刷新。仍可自行填写中文。'; return; }
    const match = lookupDetailed(query);
    entries = match.meanings;
    if (!entries.length) {
      status.textContent = '暂未查到这个单词或完整短语。按 0 自己写中文，写好按回车收下。';
      appendManualOption(); options.hidden = false; return;
    }
    status.textContent = match.key !== normalize(query) ? `匹配到基础短语「${match.key}」。修饰词请结合句意理解；按数字键 1-9 勾选意思，按 0 自己写，回车收下。` : `「${query.trim()}」的释义参考：按 1-9 勾选想要的意思（可多选），按 0 自己写，回车收下。`;
    entries.forEach((entry, index) => {
      const card = document.createElement('div'); card.className = 'meaning-sense-card';
      const label = document.createElement('label'); label.className = 'meaning-option';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = entry;
      checkbox.addEventListener('change', updateActions);
      const text = document.createElement('span'); text.textContent = entry;
      label.append(checkbox, text);
      // 前 9 条带序号：焦点在单词框时按数字键即可开关，不用鼠标。
      if (index < 9) {
        const badge = document.createElement('b'); badge.className = 'meaning-index';
        badge.textContent = String(index + 1); badge.setAttribute('aria-hidden', 'true');
        label.prepend(badge);
      }
      card.append(label);
      if (globalThis.ShiciExamples) card.append(ShiciExamples.exampleBlock(ShiciExamples.get(query, entry), query));
      options.append(card);
    });
    appendManualOption();
    options.hidden = actions.hidden = false; updateActions();
  }
  function isCurrent() { if (query === input.value) return true; render(); return false; }
  $('meaning-insert').addEventListener('click', () => {
    if (!isCurrent()) return;
    const meaning = $('meaning'), old = meaning.value, choices = selected();
    const existing = new Set(old.split(/[;；\n]/).map(item => item.trim()));
    const fresh = choices.filter(item => !existing.has(item));
    if (!fresh.length) { feedback.textContent = '所选释义已在中文框中，可以继续编辑。'; return; }
    const next = old + (old.trim() && !/[;；\n]\s*$/.test(old) ? '；' : '') + fresh.join('；');
    if (next.length > meaning.maxLength) { feedback.textContent = '加入后会超过中文释义的 500 字上限，请减少选择或先整理中文框。'; return; }
    meaning.value = next; meaning.dispatchEvent(new Event('input', { bubbles: true }));
    feedback.textContent = `已加入 ${fresh.length} 项，你原来写的内容已保留，可继续修改。`;
  });
  async function copy(text) {
    if (!text || !isCurrent()) return;
    const oldQuery = query;
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {
      const active = document.activeElement;
      const start = active?.selectionStart, end = active?.selectionEnd;
      const helper = document.createElement('textarea'); helper.value = text; helper.readOnly = true;
      helper.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(helper); helper.select();
      try { copied = document.execCommand('copy'); } catch {}
      helper.remove(); active?.focus({ preventScroll: true });
      if (typeof start === 'number') active.setSelectionRange(start, end);
    }
    if (input.value !== oldQuery) return;
    feedback.textContent = copied ? '释义已复制，可粘贴到中文框或其他地方。' : '未能自动复制，请在下面选中文字后手动复制。';
    if (!copied) { manual.value = text; manual.hidden = false; manual.focus(); manual.select(); }
  }
  $('meaning-copy-selected').addEventListener('click', () => copy(selected().join('；')));
  $('meaning-copy-all').addEventListener('click', () => copy(entries.join('；')));
  input.addEventListener('input', () => {
    clear(); area.hidden = !input.value.trim(); status.textContent = '正在查找常见中文意思…';
    if (!composing) timer = setTimeout(render, 250);
  });
  input.addEventListener('compositionstart', () => { composing = true; clear(); area.hidden = true; });
  input.addEventListener('compositionend', () => { composing = false; render(); });
  input.addEventListener('blur', () => { if (!composing && query !== input.value) render(); });
  $('add-form').addEventListener('reset', () => { clear(); area.hidden = true; });
  render();
})();
