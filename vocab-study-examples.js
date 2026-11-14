/* Automatic examples between the learning card and grading buttons. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const box = $('study-examples'), list = $('study-examples-list'), status = $('study-examples-status');
  if (!box) return;
  const remoteCache = new Map();
  let revision = 0, timer, controller;
  function stop() { clearTimeout(timer); controller?.abort(); controller = null; revision++; }
  function row(sense, example) {
    const group = document.createElement('div'); group.className = 'study-example-item';
    if (sense) { const title = document.createElement('p'); title.className = 'study-example-sense'; title.textContent = sense; group.append(title); }
    group.append(ShiciExamples.exampleBlock(example)); list.append(group);
  }
  function renderRemote(word, examples, preview) {
    list.replaceChildren();
    for (const example of examples) row(example.sense, { en: example.en, zh: '' });
    status.textContent = `${preview ? '输入预览 · ' : ''}自动查询到的网络例句；下面保留原词典的英文义项，供对照用法。`;
    const credit = document.createElement('a'); credit.className = 'study-example-source';
    credit.href = 'https://dictionaryapi.dev/'; credit.target = '_blank'; credit.rel = 'noopener noreferrer'; credit.textContent = '来源：Free Dictionary API（英文例句）';
    list.append(credit);
    for (const source of [...new Set(examples.map(example => example.source).filter(Boolean))]) {
      const attribution = document.createElement('a'); attribution.className = 'study-example-source'; attribution.href = source;
      attribution.target = '_blank'; attribution.rel = 'noopener noreferrer'; attribution.textContent = '查看原词条及许可'; list.append(attribution);
    }
    const licenses = new Map(examples.filter(example => example.licenseUrl).map(example => [example.licenseUrl, example.licenseName]));
    for (const [url, name] of licenses) {
      const license = document.createElement('a'); license.className = 'study-example-source'; license.href = url;
      license.target = '_blank'; license.rel = 'noopener noreferrer'; license.textContent = `许可：${name || '查看许可'}`; list.append(license);
    }
  }
  async function queryRemote(word, ticket, preview) {
    if (ticket !== revision) return;
    const requestController = new AbortController(); controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), 8000);
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: requestController.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('No dictionary entry');
      const payload = await response.json(), examples = [], seen = new Set();
      if (!Array.isArray(payload)) throw new Error('Invalid dictionary response');
      for (const entry of payload.slice(0, 8)) {
        const source = Array.isArray(entry.sourceUrls) ? entry.sourceUrls.find(url => typeof url === 'string' && url.startsWith('https://')) : undefined;
        for (const meaning of (Array.isArray(entry.meanings) ? entry.meanings : [])) {
          for (const definition of (Array.isArray(meaning.definitions) ? meaning.definitions : [])) {
            if (typeof definition.example !== 'string' || !definition.example.trim() || seen.has(definition.example)) continue;
            seen.add(definition.example);
            examples.push({ sense: `${typeof meaning.partOfSpeech === 'string' ? meaning.partOfSpeech : ''} · ${typeof definition.definition === 'string' ? definition.definition.slice(0, 600) : ''}`, en: definition.example.slice(0, 1500), source, licenseName: typeof entry.license?.name === 'string' ? entry.license.name : '', licenseUrl: typeof entry.license?.url === 'string' && entry.license.url.startsWith('https://') ? entry.license.url : '' });
            if (examples.length >= 8) break;
          }
          if (examples.length >= 8) break;
        }
        if (examples.length >= 8) break;
      }
      if (ticket !== revision) return;
      if (!examples.length) throw new Error('No example sentences');
      if (remoteCache.size >= 100) remoteCache.delete(remoteCache.keys().next().value);
      remoteCache.set(word, examples); renderRemote(word, examples, preview);
    } catch {
      if (ticket !== revision) return;
      status.textContent = '暂时未能自动查到例句。请检查网络，或点击重试。';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'example-save'; retry.textContent = '重新自动查询';
      retry.addEventListener('click', () => {
        if (ticket !== revision) return;
        list.replaceChildren(); status.textContent = '正在自动查询例句…'; queryRemote(word, ticket, preview);
      });
      list.replaceChildren(retry);
    } finally { clearTimeout(timeout); }
  }
  function render(entry, preview = false) {
    stop(); list.replaceChildren();
    $('study-examples-word').textContent = entry?.word || '';
    if (!entry?.word?.trim()) { status.textContent = '添加或抽取单词后，例句会自动显示在这里。'; return; }
    const senses = preview ? ShiciMeanings.lookup(entry.word) : ShiciExamples.savedSenses(entry.meaning || '');
    let count = 0;
    for (const sense of senses) {
      const example = ShiciExamples.resolved(entry.word, sense, entry.examples || []);
      if (example) { row(sense, example); count++; }
    }
    // A known word can still provide useful examples when the learner's own
    // Chinese note uses wording that is absent from the alias list.
    if (!count) for (const sense of ShiciExamples.referenceSenses(entry.word) || []) {
      const example = ShiciExamples.get(entry.word, sense);
      if (example) { row(sense, example); count++; }
    }
    if (count) {
      status.textContent = `${preview ? '输入预览 · ' : ''}已自动配好例句与中文翻译。`;
      return;
    }
    const key = ShiciExamples.wordKey(entry.word);
    if (remoteCache.has(key)) { renderRemote(key, remoteCache.get(key), preview); return; }
    if (!ShiciExamples.supportsRemoteWord(key)) {
      status.textContent = '该短语暂无离线例句；自动网络查询目前支持单个英文单词。'; return;
    }
    status.textContent = `${preview ? '输入预览 · ' : ''}正在自动查询例句（需要联网，仅查询当前英文单词）…`;
    const ticket = revision;
    timer = setTimeout(() => queryRemote(key, ticket, preview), 650);
  }
  globalThis.ShiciStudyExamples = {
    show(entry, revealed = false) {
      if (!entry || !revealed) {
        stop(); box.hidden = true; list.replaceChildren(); status.textContent = '';
        $('study-examples-word').textContent = ''; return;
      }
      box.hidden = false; render(entry);
    }
  };
})();
