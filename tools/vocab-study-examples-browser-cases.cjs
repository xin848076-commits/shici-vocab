module.exports = async ({ send, evaluate, until, type, fs, path, out, root, assert, events }) => {
  const original = JSON.parse(fs.readFileSync(path.join(root, 'reports/vocab-examples-20261108/current-vocabulary.json'), 'utf8'));
  await evaluate(`localStorage.setItem('shici.vocabulary.v1', ${JSON.stringify(JSON.stringify(original))})`);
  await send('Page.reload'); await until("document.getElementById('total')?.textContent==='92'");
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1'))"), original);
  assert.ok(await evaluate("document.querySelector('#study-examples .example-en')?.textContent.length > 0"));
  assert.equal(await evaluate("document.querySelector('#study-examples .example-editor')"), null);
  const layout = await evaluate("(() => {const card=document.getElementById('flashcard').getBoundingClientRect(), e=document.getElementById('study-examples').getBoundingClientRect(), b=document.querySelector('.grade-buttons').getBoundingClientRect();return {cardBottom:card.bottom,exampleTop:e.top,exampleBottom:e.bottom,buttonTop:b.top,height:e.height};})()");
  assert.ok(layout.exampleTop > layout.cardBottom);
  assert.ok(layout.buttonTop > layout.exampleBottom);
  assert.ok(layout.height >= 150);
  await type('bank');
  assert.equal(await evaluate("document.getElementById('study-examples-word').textContent"), 'bank');
  assert.equal(await evaluate("document.querySelectorAll('#study-examples .example-en').length"), 4);
  assert.ok(await evaluate("document.getElementById('study-examples').textContent.includes('savings account')"));
  await evaluate("document.getElementById('study-examples').scrollIntoView({block:'center'})");
  const desktop = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'study-examples-desktop.png'), Buffer.from(desktop.data, 'base64'));
  // No example writing or editor interaction is necessary to add a word.
  await evaluate("document.querySelector('#meaning-options input').click();document.getElementById('meaning-insert').click();document.getElementById('add-form').requestSubmit()");
  await until("document.getElementById('total').textContent==='93'");
  assert.equal(await evaluate("document.getElementById('card-text').textContent"), 'bank');
  assert.equal(await evaluate("document.querySelectorAll('#study-examples .example-en').length"), 1);
  await evaluate("document.getElementById('next').click()");
  assert.equal(await evaluate("document.getElementById('study-examples-word').textContent"), await evaluate("document.getElementById('card-text').textContent"));
  await evaluate("document.getElementById('flashcard').click();document.getElementById('remembered').click()");
  assert.equal(await evaluate("document.getElementById('study-examples-word').textContent"), await evaluate("document.getElementById('card-text').textContent"));
  // Exercise the real public service once from file://, including CORS.
  const live = await evaluate(`(async () => {
    try { const r=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/hello',{signal:AbortSignal.timeout(8000),credentials:'omit',referrerPolicy:'no-referrer'}); const data=await r.json(); return {ok:r.ok, exampleCount:Array.isArray(data)?data.flatMap(e=>e.meanings||[]).flatMap(m=>m.definitions||[]).filter(d=>d.example).length:0}; } catch(e) { return {ok:false,error:e.name}; }
  })()`);
  // Use deterministic responses for race, error and cache behavior.
  await evaluate(`globalThis.__realFetch=fetch;globalThis.__requests=[];globalThis.__resolvers={}; globalThis.fetch=(url,opts)=>{const key=decodeURIComponent(url.split('/').pop());__requests.push(key);return new Promise(resolve=>{__resolvers[key]=body=>resolve({ok:true,json:async()=>body});});}`);
  await type('xylophone'); await until("globalThis.__requests.includes('xylophone')");
  await type('umbrella'); await until("globalThis.__requests.includes('umbrella')");
  await evaluate(`__resolvers.umbrella([{sourceUrls:['https://en.wiktionary.org/wiki/umbrella'],meanings:[{partOfSpeech:'noun',definitions:[{definition:'A device for protection from rain.',example:'She opened her umbrella in the rain.'}]}]}]); __resolvers.xylophone([{meanings:[{partOfSpeech:'noun',definitions:[{definition:'A musical instrument.',example:'He played the xylophone.'}]}]}]);`);
  await until("document.getElementById('study-examples-list').textContent.includes('She opened her umbrella')");
  assert.equal(await evaluate("document.getElementById('study-examples-list').textContent.includes('xylophone')"), false);
  assert.ok(await evaluate("document.querySelector('#study-examples .study-example-source').textContent.includes('Free Dictionary')"));
  const count = await evaluate('__requests.length');
  await type('bank'); await type('umbrella');
  assert.equal(await evaluate('__requests.length'), count);
  assert.ok(await evaluate("document.getElementById('study-examples-list').textContent.includes('umbrella')"));
  await evaluate("globalThis.fetch=async()=>{throw new Error('offline');}");
  await type('unknownwordtest');
  await until("document.getElementById('study-examples-status').textContent.includes('未能自动查到')");
  assert.equal(await evaluate("document.querySelector('#study-examples button').textContent"), '重新自动查询');
  assert.equal(await evaluate("document.querySelector('#study-examples textarea')"), null);
  await type('bank');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.getElementById('study-examples').scrollIntoView({block:'center'})");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'study-examples-mobile.png'), Buffer.from(mobile.data, 'base64'));
  assert.equal(events.filter(event=>event.method==='Runtime.exceptionThrown').length, 0);
  const result={passed:true,liveDictionary:live,checks:['92 existing words and records unchanged on load','examples below card and above grading buttons with gaps','automatic input preview','no manual example needed when adding','random and grading actions update examples','real public API CORS probe','automatic online fallback with original English senses','stale responses ignored','session cache reused','offline failure and retry control','390px mobile layout','no JavaScript exceptions'],screenshots:['study-examples-desktop.png','study-examples-mobile.png']};
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
};
