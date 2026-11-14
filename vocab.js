/* 拾词：普通脚本，不使用模块、网络或第三方依赖，支持 file:// 双击打开。 */
(() => {
  'use strict';
  const KEY = 'shici.vocabulary.v1';
  const $ = id => document.getElementById(id);
  const dayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const seed = [['serendipity', '不期而遇的美好；意外发现珍宝的运气'], ['wonder', '惊奇；奇迹；想知道'], ['gentle', '温柔的；轻柔的'], ['bloom', '开花；绽放'], ['journey', '旅行；旅程'], ['persist', '坚持；持续']];
  let state = { version: 1, words: seed.map(([word, meaning]) => ({ id: uid(), word, meaning, status: 'new', reviews: 0, lastReviewed: null })), daily: {}, currentId: null, mode: 'all' };
  let flipped = false, pendingImport = null, toastTimer, loadFailed = false, lastRenderedDay;

  // 对本地数据和导入文件采用同一套严格检查，避免坏备份覆盖词库。
  function validate(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.words) || data.words.length > 20000 || !data.daily || typeof data.daily !== 'object' || Array.isArray(data.daily)) throw new Error('备份格式不正确，请选择拾词导出的 JSON 文件。');
    const ids = new Set(), names = new Set();
    const words = data.words.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 150 || typeof item.word !== 'string' || !item.word.trim() || item.word.length > 100 || typeof item.meaning !== 'string' || !item.meaning.trim() || item.meaning.length > 500 || !['new', 'difficult', 'known'].includes(item.status) || !Number.isSafeInteger(item.reviews) || item.reviews < 0 || !(item.lastReviewed === null || (typeof item.lastReviewed === 'string' && Number.isFinite(Date.parse(item.lastReviewed))))) throw new Error('备份中的单词或学习记录不完整，未导入任何数据。');
      const name = item.word.trim().toLowerCase();
      if (ids.has(item.id) || names.has(name)) throw new Error('备份有重复单词或编号，未导入任何数据。');
      ids.add(item.id); names.add(name);
      const result = { id: item.id, word: item.word.trim(), meaning: item.meaning.trim(), status: item.status, reviews: item.reviews, lastReviewed: item.lastReviewed };
      if (item.examples !== undefined) {
        if (!Array.isArray(item.examples) || item.examples.length > 40) throw new Error('备份中的例句格式不正确，未导入任何数据。');
        const senses = new Set();
        result.examples = item.examples.map(example => {
          if (!example || !['sense', 'en', 'zh'].every(key => typeof example[key] === 'string' && example[key].trim()) || example.sense.length > 500 || example.en.length > 1000 || example.zh.length > 1000 || senses.has(example.sense.trim())) throw new Error('备份中的例句不完整或重复，未导入任何数据。');
          senses.add(example.sense.trim());
          return { sense: example.sense.trim(), en: example.en.trim(), zh: example.zh.trim() };
        });
      }
      result.garden = ShiciMotivation.validateGarden(item.garden, result);
      return result;
    });
    const daily = {};
    for (const [date, count] of Object.entries(data.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(count) || count < 0) throw new Error('备份中的每日记录格式不正确。');
      daily[date] = count;
    }
    return { version: 1, words, daily, currentId: ids.has(data.currentId) ? data.currentId : null, mode: data.mode === 'difficult' ? 'difficult' : 'all', motivation: ShiciMotivation.validate(data.motivation, words) };
  }
  function notify(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }
  function warning(message) { $('storage-warning').hidden = false; $('storage-warning').textContent = message; }
  function save() {
    if (loadFailed) { notify('原本地记录无法读取。请先导出当前内容，或导入有效备份恢复。'); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('storage-warning').hidden = true; return true; }
    catch { warning('浏览器暂时无法保存数据（可能空间已满或禁止存储）。请导出备份；本次未保存的修改不会生效。'); return false; }
  }
  function change(mutator) {
    const previous = JSON.stringify(state);
    mutator();
    if (!save()) { state = JSON.parse(previous); render(); return false; }
    render(); return true;
  }
  function pool() { return state.words.filter(w => state.mode === 'all' || w.status === 'difficult'); }
  function current() { return pool().find(w => w.id === state.currentId); }
  function choose(exclude) {
    const available = pool();
    const others = available.filter(w => w.id !== exclude);
    const candidates = others.length ? others : available;
    state.currentId = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].id : null;
    flipped = false;
  }
  function draw() { change(() => choose(state.currentId)); }
  function flip() { if (current()) { flipped = !flipped; renderCard(); } }
  function renderCard() {
    const word = current();
    const empty = !word;
    globalThis.ShiciSpeech?.setWord(word?.word || '');
    $('flashcard').disabled = empty;
    $('flashcard').setAttribute('aria-pressed', String(flipped));
    $('flashcard').setAttribute('aria-label', flipped ? '翻回英文单词' : '翻开卡片查看中文释义');
    $('card-label').textContent = empty ? 'A FRESH START / 新的开始' : (flipped ? 'MEANING / 中文释义' : 'ENGLISH / 英文');
    $('card-text').textContent = empty ? (state.mode === 'difficult' ? '暂时没有不会的词' : '你的词库，等你开始') : (flipped ? word.meaning : word.word);
    $('card-hint').textContent = empty ? (state.mode === 'difficult' ? '继续学习，在需要时标记「还不会」' : '添加一个单词，开启积累') : (flipped ? '对照答案，诚实地给自己一个反馈' : '先想一想，它的中文意思是什么？');
    $('card-record').textContent = word ? `已复习 ${word.reviews} 次 · ${word.status === 'known' ? '已掌握' : word.status === 'difficult' ? '还需巩固' : '新单词'}${word.lastReviewed ? ` · 上次 ${new Date(word.lastReviewed).toLocaleDateString('zh-CN')}` : ''}` : '每天一点点，慢慢积累。';
    $('forgot').disabled = empty || !flipped;
    $('remembered').disabled = empty || !flipped;
    $('next').disabled = !pool().length;
    $('forgot').title = $('remembered').title = flipped ? '记录一次复习' : '先翻卡查看释义，再记录学习结果';
    globalThis.ShiciStudyExamples?.show(word, flipped);
  }
  function renderList() {
    const query = $('search').value.trim().toLowerCase();
    const words = state.words.filter(w => `${w.word}\n${w.meaning}`.toLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    if (!words.length) {
      const empty = document.createElement('p'); empty.className = 'empty';
      empty.textContent = query ? '没有找到这个词，试试其他关键词。' : '还没有单词。添加你的第一个单词吧。'; fragment.append(empty);
    }
    for (const word of words) {
      const row = document.createElement('div'); row.className = 'word-row';
      const info = document.createElement('div'); info.className = 'word-info';
      const title = document.createElement('strong'); title.textContent = word.word;
      const meaning = globalThis.ShiciExamples ? ShiciExamples.renderSaved(word) : document.createElement('p');
      if (!globalThis.ShiciExamples) meaning.textContent = word.meaning;
      const record = document.createElement('small'); record.textContent = `复习 ${word.reviews} 次`;
      info.append(title, meaning, record);
      const tag = document.createElement('button'); tag.type = 'button'; tag.className = `tag ${word.status}`;
      tag.textContent = { new: '新单词', difficult: '还不会', known: '已掌握' }[word.status];
      tag.setAttribute('aria-label', `学习 ${word.word}，当前状态：${tag.textContent}`);
      tag.addEventListener('click', () => { if (change(() => { state.mode = 'all'; state.currentId = word.id; flipped = false; })) { $('flashcard').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('flashcard').focus({ preventScroll: true }); } });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete'; remove.textContent = '删除'; remove.setAttribute('aria-label', `删除 ${word.word}`);
      remove.addEventListener('click', () => {
        if (!confirm(`确定删除「${word.word}」及它的复习记录？建议先导出备份。`)) return;
        if (change(() => { state.words = state.words.filter(w => w.id !== word.id); if (!current()) choose(); })) notify('单词已删除，历史每日复习次数仍保留。');
      });
      row.append(info, tag, remove); fragment.append(row);
    }
    $('word-list').replaceChildren(fragment);
    $('list-count').textContent = query ? `找到 ${words.length} 个单词 · 共 ${state.words.length} 个` : `共 ${words.length} 个单词 · 点击状态标签可学习这个词`;
  }
  function render() {
    lastRenderedDay = dayKey();
    $('total').textContent = state.words.length;
    $('difficult-total').textContent = state.words.filter(w => w.status === 'difficult').length;
    $('known-total').textContent = state.words.filter(w => w.status === 'known').length;
    $('today-total').textContent = state.daily[dayKey()] || 0;
    $('pool-count').textContent = `${pool().length} 个可学习`;
    $('mode-all').setAttribute('aria-pressed', String(state.mode === 'all'));
    $('mode-difficult').setAttribute('aria-pressed', String(state.mode === 'difficult'));
    renderCard(); renderList();
    ShiciMotivation.render(state);
  }
  function grade(status) {
    const word = current();
    if (!word || !flipped) return;
    const reviewTime = new Date(), reviewDay = ShiciMotivation.today(reviewTime);
    let completed = false;
    if (change(() => {
      completed = ShiciMotivation.record(state, word, status, reviewDay);
      word.status = status; word.reviews++; word.lastReviewed = reviewTime.toISOString();
      state.daily[reviewDay] = (state.daily[reviewDay] || 0) + 1;
      choose(word.id);
    })) {
      if (completed) ShiciMotivation.celebrate();
      notify(completed ? '今天的小目标完成啦！你的努力正在生根。' : status === 'known' ? '已记录「记住了」，继续下一个！' : '已加入不会的单词，花园里会提醒你来浇水。');
    }
  }
  // 回车连录：释义为空时，优先用已勾选的释义，否则取词典第一条。
  function pickMeanings(word) {
    const checked = [...document.querySelectorAll('#meaning-options input[type="checkbox"]:checked')]
      .map(box => box.value.trim()).filter(Boolean);
    if (checked.length) return checked;
    const senses = globalThis.ShiciMeanings?.lookup?.(word) || [];
    return senses.slice(0, 1);
  }
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    const word = $('word').value.trim();
    const meaningBox = $('meaning');
    let meaning = meaningBox.value.trim(), autoFilled = false;
    if (!word) { notify('先打一个英文单词，再按回车。'); $('word').focus(); return; }
    if (!/[a-z]/i.test(word)) { notify('英文单词或短语中至少需要一个英文字母。'); $('word').focus(); $('word').select(); return; }
    if (state.words.some(w => w.word.toLowerCase() === word.toLowerCase())) { notify('这个单词已经在词库中了，请勿重复添加。'); $('word').focus(); $('word').select(); return; }
    if (state.words.length >= 20000) { notify('词库已达到 20000 个单词上限，请先导出备份整理。'); return; }
    if (!meaning) {
      const picks = pickMeanings(word);
      if (picks.length) { meaning = picks.join('；'); meaningBox.value = meaning; autoFilled = true; }
      else { notify('本地词典没有这个词，请填一下中文释义再按回车。'); meaningBox.focus(); return; }
    }
    if (change(() => { const entry = { id: uid(), word, meaning, status: 'new', reviews: 0, lastReviewed: null, garden: { stage: 0, lastGrowthDay: null } }; const examples = globalThis.ShiciExamples?.draftExamples(word, meaning); if (examples?.length) entry.examples = examples; state.words.unshift(entry); state.currentId = entry.id; state.mode = 'all'; flipped = false; })) {
      const pickedCount = meaning.split(/[;；]/).map(part => part.trim()).filter(Boolean).length;
      $('add-form').reset();
      // 清空单词框后让释义区自己收起，避免下一个词打字前残留上一个词的选项。
      $('word').dispatchEvent(new Event('input', { bubbles: true }));
      $('word').focus();
      const picked = pickedCount > 1 ? `（${pickedCount} 个意思）` : autoFilled ? '（释义取自词典第 1 条，可在上下文中再核对）' : '';
      notify(`已收下「${word}」${picked}，继续打下一个，回车就收下。`);
    }
  });
  // 数字键勾选：焦点在单词框时，按 1-9 开关对应释义，收多个意思不用碰鼠标。
  const meaningBoxes = () => [...document.querySelectorAll('#meaning-options input[type="checkbox"]')];
  function toggleMeaningByIndex(index) {
    const box = meaningBoxes()[index - 1];
    if (!box) return false;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    // 条目多时滚到视野内，否则按了数字也看不见选中了哪条。
    box.closest('.meaning-sense-card')?.scrollIntoView({ block: 'nearest' });
    return true;
  }
  // 勾选状态统一回显：鼠标点、空格、数字键都走这条。
  $('meaning-options')?.addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const feedback = $('meaning-feedback');
    if (!feedback) return;
    const picked = meaningBoxes().filter(box => box.checked).map(box => box.value);
    feedback.textContent = picked.length ? `已勾选 ${picked.length} 个意思：${picked.join('；')} —— 按回车收下` : '已全部取消，回车就只收词典第 1 条。';
  });
  // 数字 0 / 点「自己写中文」：焦点交给中文释义框，已勾选的意思先带过去。
  function enterManualMeaning() {
    const meaningBox = $('meaning');
    if (!$('word').value.trim()) { notify('先打一个英文单词，再按 0 自己写中文。'); $('word').focus(); return; }
    const picked = [...document.querySelectorAll('#meaning-options input[type="checkbox"]:checked')].map(box => box.value.trim()).filter(Boolean);
    if (picked.length && !meaningBox.value.trim()) meaningBox.value = picked.join('；');
    const end = meaningBox.value.length;
    meaningBox.focus();
    meaningBox.setSelectionRange(end, end);
    const feedback = $('meaning-feedback');
    if (feedback) feedback.textContent = picked.length ? '已把勾选的意思带进中文框，可以接着补充；写好按回车收下，Esc 回单词框。' : '写自己的中文意思；写好按回车收下，Esc 回单词框。';
  }
  document.addEventListener('shici-manual-meaning', enterManualMeaning);
  $('word').addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    // ↓/↑ 进入释义列表逐条浏览，列表会自动滚到当前条目，条目再多也不用鼠标。
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const boxes = meaningBoxes();
      if (!boxes.length) return;
      event.preventDefault();
      (event.key === 'ArrowDown' ? boxes[0] : boxes[boxes.length - 1]).focus();
      return;
    }
    if (event.key === '0') { event.preventDefault(); enterManualMeaning(); return; }
    if (!/^[1-9]$/.test(event.key)) return;
    if (!toggleMeaningByIndex(Number(event.key))) return;
    event.preventDefault();
  });
  // 列表内：↑↓ 逐条移动，空格勾选（原生），回车收下，Esc 回单词框，数字键同样可勾。
  $('meaning-options')?.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    const boxes = meaningBoxes();
    const index = boxes.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!boxes.length) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(boxes.length - 1, Math.max(0, index) + 1) : Math.max(0, index - 1);
      boxes[index < 0 ? 0 : next]?.focus();
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); $('word').focus(); return; }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); $('add-form').requestSubmit(); return;
    }
    if (event.key === '0') { event.preventDefault(); enterManualMeaning(); return; }
    if (/^[1-9]$/.test(event.key)) { if (toggleMeaningByIndex(Number(event.key))) event.preventDefault(); }
  });
  // 中文框里按 Esc 回单词框，改词不用再摸鼠标。
  $('meaning').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    $('word').focus();
  });
  // 单词框 / 释义框里按回车都等于「收下」；释义框 Shift+回车保留换行。
  for (const id of ['word', 'meaning']) {
    $(id).addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      $('add-form').requestSubmit();
    });
  }
  document.addEventListener('shici-goal-change', event => {
    const goal = event.detail?.goal;
    if (![5, 10, 20].includes(goal) || state.motivation.goal === goal) return;
    let completed = false;
    if (change(() => { state.motivation.goal = goal; completed = ShiciMotivation.complete(state); })) {
      if (completed) ShiciMotivation.celebrate();
      notify(`每日目标已改为 ${goal} 个不同单词。`);
    }
  });
  document.addEventListener('shici-garden-study', event => {
    const word = state.words.find(item => item.id === event.detail?.id);
    if (!word) return;
    if (change(() => { state.mode = 'all'; state.currentId = word.id; flipped = false; })) {
      $('flashcard').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('flashcard').focus({ preventScroll: true });
    }
  });
  document.addEventListener('shici-save-example', event => {
    const { id, example } = event.detail || {};
    const entry = state.words.find(word => word.id === id);
    if (!entry || !example || !['sense', 'en', 'zh'].every(key => typeof example[key] === 'string' && example[key].trim()) || example.sense.length > 500 || example.en.length > 1000 || example.zh.length > 1000) return;
    if ((entry.examples || []).filter(item => item.sense !== example.sense).length >= 40) { notify('每个单词最多保存 40 条自定义例句。'); return; }
    if (change(() => { entry.examples = [...(entry.examples || []).filter(item => item.sense !== example.sense), { ...example }]; })) notify('例句已保存，学习记录已保留。');
  });
  $('flashcard').addEventListener('click', flip);
  $('next').addEventListener('click', draw);
  $('forgot').addEventListener('click', () => grade('difficult'));
  $('remembered').addEventListener('click', () => grade('known'));
  for (const mode of ['all', 'difficult']) $('mode-' + mode).addEventListener('click', () => change(() => { state.mode = mode; choose(); }));
  $('search').addEventListener('input', renderList);
  document.addEventListener('keydown', event => {
    if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'SUMMARY'].includes(event.target.tagName) || $('import-dialog').open || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'Space') { event.preventDefault(); flip(); }
    if (event.code === 'ArrowRight') { event.preventDefault(); draw(); }
  });
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ ...state, app: 'shici', exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `拾词备份-${dayKey()}-${Date.now()}.json`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000); notify('已发起备份下载，请在浏览器下载记录中查看。');
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { notify('文件过大，请选择小于 20 MB 的拾词 JSON 备份。'); return; }
    try {
      pendingImport = validate(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      $('import-summary').textContent = `这份备份有 ${pendingImport.words.length} 个单词，包含学习记录；每日目标和花园成长也会一并恢复。旧备份会根据已有记录初始化花园。`;
      $('import-dialog').showModal();
    } catch (error) { pendingImport = null; notify(error instanceof SyntaxError ? '文件不是有效的 JSON 备份，当前词库未改动。' : error.message); }
  });
  $('cancel-import').addEventListener('click', () => { pendingImport = null; $('import-dialog').close(); });
  $('import-dialog').addEventListener('cancel', () => { pendingImport = null; });
  $('confirm-import').addEventListener('click', () => {
    if (!pendingImport) return;
    const previous = state, wasLoadFailed = loadFailed; state = pendingImport; loadFailed = false;
    if (!current()) choose();
    if (!save()) { state = previous; loadFailed = wasLoadFailed; render(); return; }
    flipped = false; pendingImport = null; $('import-dialog').close(); render(); notify('备份已恢复，词库和学习记录都回来了。');
  });
  // 多个标签页保持一致，避免旧页面意外覆盖刚保存的记录。
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    try {
      if (!event.newValue) { loadFailed = true; warning('其他页面已清除本地记录。请导出当前内容，或导入备份恢复。'); return; }
      state = validate(JSON.parse(event.newValue)); flipped = false; loadFailed = false; if (!current()) choose(); render();
    } catch { loadFailed = true; warning('其他页面的记录无法读取，请导出当前内容后恢复有效备份。'); }
  });
  state = validate(state);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) state = validate(JSON.parse(raw));
    if (!current()) choose();
    save();
  } catch {
    loadFailed = true;
    warning('原本地记录无法读取，已保护原数据不被覆盖。下方暂时展示示例词；请从有效备份恢复。');
    choose();
  }
  render();
  const refreshDay = () => { if (lastRenderedDay !== dayKey()) render(); };
  window.addEventListener('focus', refreshDay);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
  setInterval(refreshDay, 30000);
})();

/* ==========================================================================
   拾词 · 动效增强层（追加脚本）
   只添加视觉动效，不读取、不写入、不修改任何学习数据。
   ========================================================================== */
(() => {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const doc = document.documentElement;
  const $ = id => document.getElementById(id);
  doc.classList.add('motion-ready');

  /* ---------- 自适应降级：机器带不动就自动收掉最贵的装饰层 ----------
     首屏稳定后采样 60 帧，超过四成帧长于 26ms（约 38fps 以下）就标记 lite-motion，
     由 CSS 关掉水透镜、光斑漂移与纸纹混合。表现力留在好机器上，弱机器优先保流畅。 */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => {
      let frames = 0, slow = 0, last = performance.now();
      const sample = now => {
        const dt = now - last; last = now; frames++;
        if (dt > 26) slow++;
        if (frames < 60) { requestAnimationFrame(sample); return; }
        if (slow > 24) doc.classList.add('lite-motion');
      };
      requestAnimationFrame(sample);
    }, 1600);
  }

  // 移动采样：第一次移动指针时再测 40 帧。有些机器静态不卡、一动鼠标就掉帧，
  // 这时直接降级，比让用户自己去关动效省事。
  let moveSampled = false;
  const sampleOnMove = () => {
    if (moveSampled) return;
    moveSampled = true;
    let frames = 0, slow = 0, last = performance.now();
    const step = now => {
      const dt = now - last; last = now; frames++;
      if (dt > 24) slow++;
      if (frames < 40) { requestAnimationFrame(step); return; }
      if (slow > 16) doc.classList.add('lite-motion');
    };
    requestAnimationFrame(step);
  };
  addEventListener('pointermove', sampleOnMove, { passive: true, once: true });

  /* ---------- 浸水感：整页水光 + 跟随指针的折射 ---------- */
  const waterLayer = document.createElement('div');
  waterLayer.className = 'water-layer';
  waterLayer.setAttribute('aria-hidden', 'true');
  waterLayer.innerHTML = `
    <div class="water-parallax">
      <i class="water-caustics wave-a"></i>
      <i class="water-caustics wave-b"></i>
      <i class="water-caustics wave-c"></i>
    </div>`;
  document.body.append(waterLayer);

  const parallax = waterLayer.querySelector('.water-parallax');

  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'scroll-top';
  toTop.setAttribute('aria-label', '回到顶部');
  toTop.title = '回到顶部';
  toTop.innerHTML = '<svg viewBox="0 0 46 46" aria-hidden="true"><circle class="scroll-top-track" cx="23" cy="23" r="19"/><circle class="scroll-top-arc" cx="23" cy="23" r="19"/></svg><span aria-hidden="true">↑</span>';
  document.body.append(toTop);

  const topbar = document.querySelector('.topbar');
  const arc = toTop.querySelector('.scroll-top-arc');
  const ARC_LENGTH = 2 * Math.PI * 19;
  const scroller = () => doc.scrollingElement || doc;

  // 指针位置与“水压”：移动越快，水面被推开得越明显，停下后自然回弹。
  const pointer = { x: innerWidth / 2, y: innerHeight * .45, at: -1e9, seen: false };
  let energy = 0;
  let sway = 0;
  let lastPointerAt = -1e9;
  let rafId = 0;
  let lastFrame = performance.now();
  let vw = innerWidth;
  let vh = innerHeight;

  addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; }, { passive: true });

  const wake = () => {
    if (rafId) return;
    // 降级后不再跑透镜动画，省下每帧的滤镜重算。
    if (doc.classList.contains('lite-motion')) return;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  };

  // 指针只用来带动背景视差，不做任何逐帧滤镜计算（那会让核显上的鼠标移动明显发涩）。

  addEventListener('pointermove', event => {
    const now = performance.now();
    const dt = Math.max(8, Math.min(90, now - pointer.at));
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const speed = Math.min(3.4, Math.hypot(dx, dy) / dt);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.at = now;
    pointer.seen = true;
    lastPointerAt = now;
    energy = Math.min(1, energy + .045 + speed * .085);
    wake();
  }, { passive: true });

  addEventListener('pointerdown', event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.at = performance.now();
    pointer.seen = true;
    lastPointerAt = pointer.at;
    energy = Math.min(1, energy + .2);
    wake();
  }, { passive: true });

  // 指针离开窗口或页面失焦时，水感自然收住，不会留在原地。
  const leave = () => wake();
  addEventListener('pointerleave', leave, { passive: true });
  addEventListener('pointerout', event => { if (!event.relatedTarget) leave(); }, { passive: true });
  addEventListener('mouseleave', leave, { passive: true });
  addEventListener('blur', leave);

  const tick = now => {
    rafId = 0;
    if (doc.classList.contains('lite-motion')) return;
    const dt = Math.min(48, Math.max(8, now - lastFrame));
    lastFrame = now;
    energy *= Math.pow(.9, dt / 16.7);
    sway *= Math.pow(.88, dt / 16.7);

    // 只改一层 transform：交给合成器处理，不触发重绘，指针再快也不掉帧。
    const nx = pointer.x / vw - .5;
    const ny = pointer.y / vh - .5;
    parallax.style.transform =
      `translate3d(${(nx * 22).toFixed(1)}px, ${(ny * 16 - sway * 26).toFixed(1)}px, 0)`;

    const settled = energy < .006 && Math.abs(sway) < .01;
    if (settled && now - lastPointerAt > 600) return;
    rafId = requestAnimationFrame(tick);
  };

  let scrollTick = false;
  let lastTop = scroller().scrollTop;
  let lastTime = performance.now();

  const onScroll = () => {
    const el = scroller();
    const top = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, top / max)) : 0;
    doc.style.setProperty('--scroll-y', String(Math.min(top, 420)));
    if (arc) arc.style.strokeDashoffset = String(ARC_LENGTH * (1 - progress));
    toTop.classList.toggle('is-on', top > 620);
    if (topbar) topbar.classList.toggle('is-scrolled', top > 8);

    // 滚动像在水里推动水体：水光轻微滞后，停止后自然回落。
    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    const speed = Math.abs(top - lastTop) / dt; // px / ms
    if (speed > .04) {
      sway = Math.min(1.4, sway + speed * .5);
      wake();
    }

    lastTop = top;
    lastTime = now;
    scrollTick = false;
  };

  addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });

  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  onScroll();

  /* ---------- 滚动入场 ---------- */
  const sections = [...document.querySelectorAll('.intro, .stats, .daily-goal, .workspace > .panel, .word-garden, .library, .backup')];
  const tiltTargets = new Set([...document.querySelectorAll('.daily-goal, .workspace > .panel, .word-garden, .library')]);
  sections.forEach((el, index) => {
    el.classList.add('reveal');
    if (tiltTargets.has(el)) el.classList.add('reveal-tilt');
    // 延迟只用于同屏相邻元素的轻微错峰，避免下方区块迟迟不显形。
    el.style.setProperty('--reveal-delay', `${Math.min(index, 3) * 60}ms`);
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    }, { threshold: 0.03, rootMargin: '0px 0px -3% 0px' });
    sections.forEach(el => io.observe(el));
  } else {
    sections.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------- 数字滚动 ---------- */
  const counters = ['total', 'difficult-total', 'known-total', 'today-total'].map($).filter(Boolean);
  const targets = new Map(counters.map(el => [el, Number(el.textContent) || 0]));
  const shown = new Map(counters.map(el => [el, Number(el.textContent) || 0]));
  const busy = new WeakSet();
  const readNumber = el => Number((el.textContent || '').replace(/[^\d]/g, '')) || 0;

  const animateNumber = (el, from, to) => {
    busy.add(el);
    const start = performance.now();
    const duration = 720;
    const frame = now => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const value = Math.round(from + (to - from) * eased);
      shown.set(el, value);
      el.textContent = String(value);
      if (k < 1) { requestAnimationFrame(frame); return; }
      shown.set(el, to);
      el.textContent = String(to);
      busy.delete(el);
      // 动画期间数据又变了：从当前值继续补到最新目标，而不是停在旧值。
      const latest = targets.get(el);
      if (latest !== undefined && latest !== to) animateNumber(el, to, latest);
    };
    requestAnimationFrame(frame);
  };

  new MutationObserver(records => {
    const visited = new Set();
    for (const record of records) {
      const el = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      if (!el || !counters.includes(el) || visited.has(el)) continue;
      // 动画帧自身的写入不算数据变化，忽略，避免把中间值误当成新目标。
      if (busy.has(el) && readNumber(el) === shown.get(el)) continue;
      visited.add(el);
      const to = readNumber(el);
      targets.set(el, to);
      if (busy.has(el)) continue; // 动画结束后会补到最新值
      const from = shown.has(el) ? shown.get(el) : to;
      if (from !== to) animateNumber(el, from, to);
    }
  }).observe(document.querySelector('.stats') || document.body, { childList: true, characterData: true, subtree: true });

  /* ---------- 闪卡：倾斜、翻面、文字切换 ---------- */
  const card = $('flashcard');
  const cardText = $('card-text');

  if (card && cardText) {
    const fitText = () => {
      const length = (cardText.textContent || '').length;
      cardText.classList.toggle('is-long', length > 16);
      cardText.classList.toggle('is-xl', length > 40);
    };
    fitText();

    new MutationObserver(() => {
      fitText();
      cardText.classList.remove('is-swapping');
      void cardText.offsetWidth;
      cardText.classList.add('is-swapping');
    }).observe(cardText, { childList: true, characterData: true, subtree: true });

    let lastPressed = card.getAttribute('aria-pressed');
    let turnTimer;
    new MutationObserver(() => {
      const pressed = card.getAttribute('aria-pressed');
      if (pressed === lastPressed) return;
      lastPressed = pressed;
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      clearTimeout(turnTimer);
      card.classList.remove('is-turning');
      void card.offsetWidth;
      card.classList.add('is-turning');
      turnTimer = setTimeout(() => card.classList.remove('is-turning'), 720);
    }).observe(card, { attributes: true, attributeFilter: ['aria-pressed'] });

    const wrap = card.closest('.flashcard-wrap');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (wrap && finePointer) {
      let raf = null, lastEvent = null;
      wrap.addEventListener('pointermove', event => {
        if (card.classList.contains('is-turning')) return;
        lastEvent = event;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          if (!lastEvent) return;
          const rect = card.getBoundingClientRect();
          const x = (lastEvent.clientX - rect.left) / rect.width - .5;
          const y = (lastEvent.clientY - rect.top) / rect.height - .5;
          card.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`);
          card.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`);
          card.style.setProperty('--glow-x', `${((x + .5) * 100).toFixed(1)}%`);
          card.style.setProperty('--glow-y', `${((y + .5) * 100).toFixed(1)}%`);
        });
      });
      wrap.addEventListener('pointerleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    }
  }

  /* ---------- 按钮水波纹 ---------- */
  const rippleTarget = '.button, .goal-start, .goal-options button, .segmented button, .garden-filters button, .tag, .outline';
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest(rippleTarget);
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    if (!size) return;
    const ink = document.createElement('span');
    ink.className = 'ripple';
    ink.style.width = ink.style.height = `${size}px`;
    ink.style.left = `${event.clientX - rect.left - size / 2}px`;
    ink.style.top = `${event.clientY - rect.top - size / 2}px`;
    target.append(ink);
    setTimeout(() => ink.remove(), 640);
  });
})();
