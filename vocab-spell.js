/* Offline spelling hints. Suggestions never change an entry without a click. */
(() => {
  'use strict';
  const normalize = word => word.replace(/’/g, "'");
  const tokens = text => [...text.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g)].map(match => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
  let dictionaries;
  const cache = new Map();
  const engine = {
    init() {
      if (dictionaries) return;
      if (!globalThis.Typo || !globalThis.SHICI_DICTIONARIES) throw new Error('Missing offline dictionaries');
      dictionaries = Object.entries(globalThis.SHICI_DICTIONARIES).map(([code, data]) => new Typo(code, data.aff, data.dic));
    },
    inspect(text) {
      this.init();
      return tokens(text).filter(token => !dictionaries.some(dictionary => dictionary.check(normalize(token.word))));
    },
    suggest(word) {
      this.init();
      const key = normalize(word);
      if (key.length > 24) return [];
      if (!cache.has(key)) {
        if (cache.size > 200) cache.clear();
        cache.set(key, dictionaries[0].suggest(key, 4));
      }
      return cache.get(key);
    }
  };
  globalThis.ShiciSpelling = engine;
  const input = document.getElementById('word');
  if (!input) return;
  const mirror = document.getElementById('word-mirror-text');
  const status = document.getElementById('spell-status');
  const suggestions = document.getElementById('spell-suggestions');
  let timer, composing = false;
  function syncScroll() { mirror.style.transform = `translateX(${-input.scrollLeft}px)`; }
  function clear() {
    clearTimeout(timer); mirror.replaceChildren(); suggestions.replaceChildren();
    status.classList.remove('has-errors');
  }
  function check() {
    clear();
    const text = input.value;
    try {
      const errors = engine.inspect(text);
      let offset = 0;
      for (const token of errors) {
        mirror.append(document.createTextNode(text.slice(offset, token.start)));
        const mark = document.createElement('span'); mark.className = 'spell-error'; mark.textContent = token.word;
        mirror.append(mark); offset = token.end;
      }
      mirror.append(document.createTextNode(text.slice(offset))); syncScroll();
      status.classList.toggle('has-errors', errors.length > 0);
      status.textContent = !text.trim() ? '离线检查英美拼写；红线表示词典未收录或可能拼错。' : errors.length ? `有 ${errors.length} 处拼写待核对，可点击下方查看建议，也可以保留原文添加。` : '未发现拼写问题（不检查语法或中文释义）。';
      for (const token of errors) {
        const row = document.createElement('div'); row.className = 'spell-suggestion-row';
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `「${token.word}」查看建议`;
        button.addEventListener('click', () => {
          // Refuse a stale suggestion after typing or replacing another token.
          if (input.value !== text) { check(); return; }
          button.disabled = true; button.textContent = '正在查找…';
          setTimeout(() => {
            if (input.value !== text) return;
            const choices = engine.suggest(token.word);
            const label = document.createElement('span'); label.textContent = `${token.word} → `;
            row.replaceChildren(label);
            if (!choices.length) { label.textContent = `「${token.word}」暂无建议，可核对词典或按原文添加。`; return; }
            for (const choice of choices) {
              const pick = document.createElement('button'); pick.type = 'button'; pick.textContent = choice;
              pick.setAttribute('aria-label', `将 ${token.word} 改为 ${choice}`);
              pick.addEventListener('click', () => {
                if (input.value !== text) { check(); return; }
                input.value = text.slice(0, token.start) + choice + text.slice(token.end);
                input.focus(); input.setSelectionRange(token.start + choice.length, token.start + choice.length);
                input.dispatchEvent(new Event('input', { bubbles: true })); check();
              });
              row.append(pick);
            }
          }, 0);
        });
        row.append(button); suggestions.append(row);
      }
    } catch {
      status.textContent = '离线拼写检查未能加载，请保留 vocab-spell 文件夹并刷新。仍可正常添加单词。';
    }
  }
  input.addEventListener('input', () => {
    clear(); status.textContent = '输入完成后自动检查拼写…';
    if (!composing) timer = setTimeout(check, 300);
  });
  input.addEventListener('compositionstart', () => { composing = true; clear(); });
  input.addEventListener('compositionend', () => { composing = false; check(); });
  input.addEventListener('blur', () => { if (!composing) check(); });
  input.addEventListener('scroll', syncScroll);
  document.getElementById('add-form').addEventListener('reset', () => { clear(); setTimeout(check, 0); });
  setTimeout(check, 0);
})();
