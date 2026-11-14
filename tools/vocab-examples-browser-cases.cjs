module.exports = async ({ send, evaluate, until, type, fs, path, out, root, assert, events }) => {
  const source = path.join(out, 'current-vocabulary.json');
  const current = JSON.parse(fs.readFileSync(source, 'utf8'));
  assert.equal(current.words.length, 92);
  const original = fs.readFileSync(source);
  await evaluate(`localStorage.setItem('shici.vocabulary.v1', ${JSON.stringify(JSON.stringify(current))})`);
  await send('Page.reload');
  await until("document.getElementById('total')?.textContent === '92'");
  const stored = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1'))");
  assert.deepEqual(stored, current, 'Loading old vocabulary must preserve every entry and learning record');
  const coverage = await evaluate(`(() => {
    const words = JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words;
    return words.map(w => ({word:w.word, referenceSenses:ShiciMeanings.lookup(w.word).length, referenceMissing:ShiciMeanings.lookup(w.word).filter(s=>!ShiciExamples.get(w.word,s)), savedMissing:[...ShiciExamples.renderSaved(w).querySelectorAll('.sense-group')].filter(g=>g.querySelector('.example-missing')).map(g=>g.querySelector('.sense-title').textContent)}));
  })()`);
  fs.writeFileSync(path.join(out, 'coverage.json'), JSON.stringify(coverage, null, 2));
  const missing = coverage.filter(item => !item.referenceSenses || item.referenceMissing.length || item.savedMissing.length);
  if (missing.length) console.log('Missing sense examples:', JSON.stringify(missing));
  for (const item of coverage) {
    assert.ok(item.referenceSenses > 0, item.word);
    assert.deepEqual(item.referenceMissing, [], item.word);
    assert.deepEqual(item.savedMissing, [], `${item.word}: saved meaning coverage`);
  }
  const lookup = async word => { await type(word); await until("!document.getElementById('meaning-query-status').textContent.includes('正在查找')"); };
  await lookup('bank');
  const bank = await evaluate("[...document.querySelectorAll('.meaning-sense-card')].map(c=>({sense:c.querySelector('.meaning-option span').textContent,en:c.querySelector('.example-en')?.textContent,zh:c.querySelector('.example-zh')?.textContent}))");
  assert.equal(bank.length, 4);
  assert.ok(bank[0].en.includes('savings account'));
  assert.ok(bank[1].en.includes('river'));
  assert.ok(bank[2].en.includes('flooding'));
  assert.ok(bank[3].en.includes('wages'));
  const selected = await evaluate("(() => {document.querySelectorAll('#meaning-options input')[0].click();document.querySelectorAll('#meaning-options input')[1].click(); document.getElementById('meaning-insert').click(); return document.getElementById('meaning').value;})()");
  assert.equal(selected, 'n. 银行；n. 岸');
  assert.equal(await evaluate("document.querySelectorAll('#draft-examples .example-en').length"), 2);
  await evaluate("document.querySelector('#draft-examples details').open=true; document.querySelector('#draft-examples details textarea[lang=en]').value='I keep my savings in this bank.'; document.querySelectorAll('#draft-examples details textarea')[1].value='我把积蓄存放在这家银行。'; document.querySelector('#draft-examples .example-save').click()");
  assert.equal(await evaluate("document.querySelector('#draft-examples .example-en').textContent"), 'I keep my savings in this bank.');
  await evaluate("document.getElementById('add-form').requestSubmit()");
  await until("document.getElementById('total').textContent === '93'");
  assert.equal(await evaluate("document.getElementById('draft-examples').hidden"), true);
  const saved = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words[0]");
  assert.equal(saved.word, 'bank');
  assert.equal(saved.examples[0].en, 'I keep my savings in this bank.');
  assert.equal(await evaluate("document.querySelector('.word-row .example-en').textContent"), saved.examples[0].en);
  // Editing the saved second sense must not change the first or learning stats.
  await evaluate("(() => {const e=document.querySelectorAll('.word-row')[0].querySelectorAll('details')[1]; e.open=true; e.querySelectorAll('textarea')[0].value='The children played on the river bank.';e.querySelectorAll('textarea')[1].value='孩子们在河岸上玩耍。'; e.querySelector('.example-save').click();})()");
  const edited = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1'))");
  assert.equal(edited.words[0].examples.length, 2);
  assert.equal(edited.words[0].examples[0].en, saved.examples[0].en);
  assert.equal(edited.words[0].reviews, saved.reviews);
  assert.deepEqual(edited.words.slice(1), current.words);
  assert.deepEqual(edited.daily, current.daily);
  // Exercise the actual export action while keeping downloads in the test directory.
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  const beforeDownloads = new Set(fs.readdirSync(out));
  await evaluate("document.getElementById('export').click()");
  let exported;
  for (let i = 0; i < 50; i++) {
    const name = fs.readdirSync(out).find(name => !beforeDownloads.has(name) && /^拾词备份-/.test(name) && name.endsWith('.json'));
    if (name) { exported = path.join(out, name); break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(exported, 'Example backup must be exported');
  const backedUp = JSON.parse(fs.readFileSync(exported, 'utf8'));
  assert.deepEqual(backedUp.words, edited.words);
  // Restore the exported backup through the file control and confirmation.
  const doc = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#import-file' });
  await send('DOM.setFileInputFiles', { nodeId, files: [exported] });
  await until("document.getElementById('import-dialog').open");
  await evaluate("document.getElementById('confirm-import').click()");
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words"), edited.words);
  const malformed = structuredClone(backedUp); malformed.words[0].examples[0].en = '';
  const invalidFile = path.join(out, 'invalid-example-test.json');
  fs.writeFileSync(invalidFile, JSON.stringify(malformed));
  await send('DOM.setFileInputFiles', { nodeId, files: [invalidFile] });
  await until("document.getElementById('toast').textContent.includes('例句不完整')");
  assert.equal(await evaluate("document.getElementById('import-dialog').open"), false);
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words"), edited.words);
  fs.unlinkSync(invalidFile);
  await send('Page.reload'); await until("document.getElementById('total')?.textContent === '93'");
  assert.equal(await evaluate("document.querySelectorAll('.word-row')[0].querySelectorAll('.example-en')[1].textContent"), 'The children played on the river bank.');
  await lookup('approach');
  assert.ok(await evaluate("document.querySelector('#meaning-options').textContent.includes('new approach')"));
  await evaluate("document.getElementById('meaning-reference').scrollIntoView({block:'center'})");
  const desktop = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'examples-desktop.png'), Buffer.from(desktop.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.getElementById('search').value='bank'; document.getElementById('search').dispatchEvent(new Event('input')); document.querySelector('.library').scrollIntoView({block:'start'})");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'examples-mobile.png'), Buffer.from(mobile.data, 'base64'));
  // A missing example must be explicit and still allow a custom example.
  await lookup('zqxexampleword');
  await evaluate("document.getElementById('meaning').value='自定义意思'; document.getElementById('meaning').dispatchEvent(new Event('input'))");
  assert.ok(await evaluate("document.querySelector('#draft-examples .example-missing').textContent.includes('暂未收录')"));
  await evaluate("document.querySelector('#draft-examples details').open=true; document.querySelector('#draft-examples .example-save').click()");
  assert.ok(await evaluate("document.querySelector('#draft-examples .example-feedback').textContent.includes('都填上')"));
  assert.equal(events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
  assert.equal(events.filter(e => e.method === 'Network.requestWillBeSent' && /^https?:/.test(e.params.request.url)).length, 0);
  assert.deepEqual(fs.readFileSync(source), original);
  const result = { passed: true, currentWords: 92, referenceSenseExamples: coverage.reduce((sum, item) => sum + item.referenceSenses, 0), missingSavedSenses: 0, checks: ['92-word snapshot compatibility and unchanged learning records', 'all 92 words reference senses and saved meanings covered', 'bank four senses use distinct examples', 'multiple meaning selection and draft examples', 'custom example save with new word', 'saved sense-specific editing', 'old entries and stats unchanged', 'actual JSON export/import preserves examples', 'malformed example backup rejected without changing state', 'reload preserves custom examples', 'new approach examples', '390px mobile layout', 'unknown sense fallback and custom editor', 'incomplete editor validation', 'no JavaScript errors or HTTP requests'], screenshots: ['examples-desktop.png', 'examples-mobile.png'] };
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
};
