/* Daily goals and a word garden. State travels with the vocabulary backup. */
(() => {
  'use strict';
  const today = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00')) && today(new Date(value + 'T12:00:00')) === value;
  function initialGarden(word) {
    const known = word.status === 'known' && word.lastReviewed;
    return { stage: known ? 1 : 0, lastGrowthDay: known ? today(new Date(word.lastReviewed)) : null };
  }
  function validateGarden(value, word) {
    if (value === undefined) return initialGarden(word);
    if (!value || !Number.isInteger(value.stage) || value.stage < 0 || value.stage > 3 || !(value.lastGrowthDay === null || isDay(value.lastGrowthDay)) || (value.stage > 0 && !value.lastGrowthDay) || (value.stage === 0 && value.lastGrowthDay !== null)) throw new Error('备份中的单词成长记录不正确，未导入任何数据。');
    return { stage: value.stage, lastGrowthDay: value.lastGrowthDay };
  }
  function validate(value, words) {
    if (value === undefined) {
      const day = today();
      const remembered = words.filter(word => word.status === 'known' && word.lastReviewed && today(new Date(word.lastReviewed)) === day).map(word => word.word.toLowerCase());
      return { goal: 10, dailyKnown: remembered.length ? { [day]: [...new Set(remembered)] } : {}, celebratedOn: null };
    }
    if (!value || ![5, 10, 20].includes(value.goal) || !value.dailyKnown || typeof value.dailyKnown !== 'object' || Array.isArray(value.dailyKnown) || !(value.celebratedOn === null || isDay(value.celebratedOn))) throw new Error('备份中的每日目标记录不正确，未导入任何数据。');
    const dailyKnown = {};
    for (const [day, items] of Object.entries(value.dailyKnown)) {
      if (!isDay(day) || !Array.isArray(items) || items.length > 20000 || items.some(item => typeof item !== 'string' || !item.trim() || item.length > 100) || new Set(items.map(item => item.trim().toLowerCase())).size !== items.length) throw new Error('备份中的每日单词进度不正确，未导入任何数据。');
      dailyKnown[day] = items.map(item => item.trim().toLowerCase());
    }
    return { goal: value.goal, dailyKnown, celebratedOn: value.celebratedOn };
  }
  const count = (state, day = today()) => (state.motivation.dailyKnown[day] || []).length;
  function complete(state, day = today()) {
    if (count(state, day) < state.motivation.goal || state.motivation.celebratedOn === day) return false;
    state.motivation.celebratedOn = day; return true;
  }
  function record(state, word, status, day = today()) {
    if (status !== 'known') return false;
    const items = state.motivation.dailyKnown[day] ||= [], key = word.word.trim().toLowerCase();
    if (!items.includes(key)) items.push(key);
    if (!word.garden.lastGrowthDay || day > word.garden.lastGrowthDay) {
      word.garden.stage = Math.min(3, word.garden.stage + 1); word.garden.lastGrowthDay = day;
    }
    return complete(state, day);
  }
  const stageNames = ['种子', '发芽', '花苞', '开花'];
  const info = word => ({ stage: word.garden.stage, name: stageNames[word.garden.stage], thirsty: word.status === 'difficult' });
  const api = { today, initialGarden, validateGarden, validate, count, complete, record, info };
  globalThis.ShiciMotivation = api;
  const $ = id => document.getElementById(id);
  if (!$('daily-goal')) return;
  const PAGE_SIZE = 12;
  let filter = 'all', page = 0, currentState, seenIds, celebrationTimer;
  function plant(stage, thirsty) {
    const wrap = document.createElement('span'); wrap.className = `garden-plant garden-plant-${stage}${thirsty ? ' is-thirsty' : ''}`;
    wrap.setAttribute('aria-hidden', 'true');
    const stem = stage ? '<path d="M48 65V35" fill="none" stroke="#548261" stroke-width="3.5" stroke-linecap="round"/><path d="M48 55C25 56 26 38 28 38C42 37 48 46 48 55Z" fill="#91b578"/><path d="M48 47C67 46 69 30 67 30C53 30 48 38 48 47Z" fill="#6d9b6c"/>' : '<ellipse cx="48" cy="62" rx="7" ry="4" fill="#b4875a"/><path d="M45 62L50 59" stroke="#f6e9cc" stroke-width="1.5"/>';
    const top = stage === 2 ? '<path d="M48 38C34 30 35 16 48 13C62 17 62 30 48 38Z" fill="#d8929d"/><path d="M48 37L39 30M48 37L57 30" stroke="#73976a" stroke-width="3" stroke-linecap="round"/>' : stage === 3 ? '<g fill="#e5a0ac"><ellipse cx="48" cy="15" rx="8" ry="12"/><ellipse cx="36" cy="24" rx="12" ry="8" transform="rotate(25 36 24)"/><ellipse cx="60" cy="24" rx="12" ry="8" transform="rotate(-25 60 24)"/><ellipse cx="40" cy="34" rx="8" ry="12" transform="rotate(30 40 34)"/><ellipse cx="56" cy="34" rx="8" ry="12" transform="rotate(-30 56 34)"/></g><circle cx="48" cy="26" r="7" fill="#e6bd65"/>' : '';
    // No user content is interpolated into the static plant artwork.
    wrap.innerHTML = `<svg viewBox="0 0 96 96" focusable="false"><ellipse cx="48" cy="87" rx="29" ry="4" fill="#dce5d3"/><path d="M26 64H70L64 85H32Z" fill="#c79776"/><path d="M24 61H72V68H24Z" fill="#dbb28d"/>${stem}${top}</svg>`;
    return wrap;
  }
  function renderGoal(state) {
    const done = count(state), goal = state.motivation.goal, reached = done >= goal;
    $('goal-ring').setAttribute('aria-valuemax', String(goal)); $('goal-ring').setAttribute('aria-valuenow', String(Math.min(done, goal)));
    $('goal-ring').setAttribute('aria-valuetext', `今天已记住 ${done} 个不同单词，目标 ${goal} 个`);
    $('goal-ring').classList.toggle('is-complete', reached);
    $('goal-arc').style.strokeDashoffset = String(270.18 * (1 - Math.min(done / goal, 1)));
    $('goal-done').textContent = done; $('goal-target').textContent = `/ ${goal}`;
    $('goal-copy').textContent = reached ? '今天的小目标，完成了。' : `今天，记住 ${goal} 个单词。`;
    $('goal-detail').textContent = reached ? `你今天已经成功回忆 ${done} 个不同单词，每一步都算数。` : done ? `已记住 ${done} 个，再走 ${goal - done} 步就到啦。` : '先翻卡，再点“记住了”。每个词每天只计一次。';
    $('goal-complete').hidden = !reached;
    for (const button of document.querySelectorAll('[data-daily-goal]')) button.setAttribute('aria-pressed', String(Number(button.dataset.dailyGoal) === goal));
  }
  function renderGarden(state) {
    const counts = [0, 0, 0, 0]; let water = 0;
    for (const word of state.words) { counts[word.garden.stage]++; if (word.status === 'difficult') water++; }
    $('garden-total').textContent = `${state.words.length} 株小积累`;
    $('garden-counts').textContent = `种子 ${counts[0]} · 发芽 ${counts[1]} · 花苞 ${counts[2]} · 开花 ${counts[3]}`;
    $('garden-water-count').textContent = water; $('garden-bloom-count').textContent = counts[3];
    const words = state.words.filter(word => filter === 'all' || (filter === 'water' ? word.status === 'difficult' : word.garden.stage === 3));
    const pages = Math.max(1, Math.ceil(words.length / PAGE_SIZE)); page = Math.max(0, Math.min(page, pages - 1));
    const fragment = document.createDocumentFragment();
    for (const word of words.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const growth = info(word), tile = document.createElement('button'); tile.type = 'button';
      tile.className = `garden-tile${growth.thirsty ? ' needs-water' : ''}`; tile.dataset.wordId = word.id;
      tile.setAttribute('aria-label', `复习 ${word.word}，${growth.name}${growth.thirsty ? '，需要浇水' : ''}`);
      const name = document.createElement('strong'); name.textContent = word.word;
      const badge = document.createElement('span'); badge.className = 'garden-stage'; badge.textContent = growth.thirsty ? '💧 需要浇水' : growth.name;
      tile.append(plant(growth.stage, growth.thirsty), name, badge);
      tile.addEventListener('click', () => document.dispatchEvent(new CustomEvent('shici-garden-study', { detail: { id: word.id } })));
      fragment.append(tile);
    }
    if (!words.length) {
      const empty = document.createElement('p'); empty.className = 'garden-empty';
      empty.textContent = filter === 'water' ? '暂时没有需要浇水的词，做得不错。' : filter === 'bloom' ? '花需要时间。不同日期记住三次，就会开花。' : '添加你的第一个单词，种下一颗小种子。'; fragment.append(empty);
    }
    $('garden-grid').replaceChildren(fragment); $('garden-page').textContent = `${page + 1} / ${pages}`;
    $('garden-prev').disabled = page === 0; $('garden-next').disabled = page >= pages - 1;
    for (const button of document.querySelectorAll('[data-garden-filter]')) button.setAttribute('aria-pressed', String(button.dataset.gardenFilter === filter));
  }
  api.render = state => {
    currentState = state;
    const ids = new Set(state.words.map(word => word.id));
    if (seenIds && state.words.some(word => !seenIds.has(word.id))) { filter = 'all'; page = 0; }
    seenIds = ids; renderGoal(state); renderGarden(state);
  };
  api.celebrate = () => {
    clearTimeout(celebrationTimer); const area = $('daily-goal');
    area.classList.remove('is-celebrating'); void area.offsetWidth; area.classList.add('is-celebrating');
    $('goal-announcement').textContent = '今天的小目标完成啦！每一次回忆都在生根。';
    celebrationTimer = setTimeout(() => area.classList.remove('is-celebrating'), 2200);
  };
  for (const button of document.querySelectorAll('[data-daily-goal]')) button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('shici-goal-change', { detail: { goal: Number(button.dataset.dailyGoal) } })));
  for (const button of document.querySelectorAll('[data-garden-filter]')) button.addEventListener('click', () => { filter = button.dataset.gardenFilter; page = 0; if (currentState) renderGarden(currentState); });
  $('garden-prev').addEventListener('click', () => { page--; renderGarden(currentState); });
  $('garden-next').addEventListener('click', () => { page++; renderGarden(currentState); });
  $('goal-start').addEventListener('click', () => { $('flashcard').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('flashcard').focus({ preventScroll: true }); });
})();
