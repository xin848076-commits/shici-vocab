// Test only our local page in a disposable headless Edge profile.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'reports', process.argv.includes('--motivation') ? 'vocab-motivation-20261109' : process.argv.includes('--expanded') ? 'vocab-examples-expanded-20261109' : process.argv.includes('--phrases') ? 'vocab-phrases-20261109' : process.argv.includes('--speech') ? 'vocab-speech-20261108' : process.argv.includes('--flip') ? 'vocab-flip-20261108' : process.argv.includes('--125') ? 'vocab-125-20261108' : process.argv.includes('--study-examples') ? 'vocab-study-examples-20261108' : process.argv.includes('--examples') ? 'vocab-examples-20261108' : process.argv.includes('--meanings') ? 'vocab-meanings-20261108' : 'vocab-20261108');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, 'test-profile-'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, seq = 0;
const pending = new Map(), events = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function until(expression) {
  for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await wait(100); }
  throw new Error(`Page did not reach: ${expression}`);
}
async function type(value) {
  await evaluate("document.getElementById('word').focus(); document.getElementById('word').value = ''");
  await send('Input.insertText', { text: value });
  await until("!document.getElementById('spell-status').textContent.includes('输入完成')");
}
(async () => {
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await wait(100);
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) { const p = pending.get(message.id); if (!p) return; clearTimeout(p.timer); pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); }
      else events.push(message);
    });
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index背单词.html')).href });
    await until("!!document.getElementById('spell-status') && document.getElementById('spell-status').textContent.includes('离线检查')");
    if (process.argv.includes('--motivation')) {
      await require('./vocab-motivation-browser-cases.cjs')({send,evaluate,until,type,fs,path,out,root,assert,events});
      return;
    }
    if (process.argv.includes('--expanded')) {
      await require('./vocab-examples-expanded-browser-cases.cjs')({send,evaluate,until,type,fs,path,out,assert,events});
      return;
    }
    if (process.argv.includes('--phrases')) {
      await require('./vocab-phrases-browser-cases.cjs')({send,evaluate,until,type,fs,path,out,assert,events});
      return;
    }
    if (process.argv.includes('--speech')) {
      await require('./vocab-speech-browser-cases.cjs')({ send, evaluate, until, fs, path, out, assert, events });
      return;
    }
    if (process.argv.includes('--flip')) {
      const hidden = () => evaluate("document.getElementById('study-examples').hidden");
      assert.equal(await hidden(), true);
      await evaluate("document.getElementById('flashcard').click()");
      assert.equal(await hidden(), false);
      assert.ok(await evaluate("document.querySelector('#study-examples .example-en')?.textContent.length>0"));
      await evaluate("document.getElementById('flashcard').click()");
      assert.equal(await hidden(), true);
      await type('bank');
      assert.equal(await hidden(), true);
      await evaluate("document.getElementById('next').click();document.getElementById('flashcard').click()");
      assert.equal(await hidden(), false);
      await evaluate("document.getElementById('remembered').click()");
      assert.equal(await hidden(), true);
      await evaluate("document.getElementById('flashcard').click();document.getElementById('mode-difficult').click()");
      assert.equal(await hidden(), true);
      const phrase = await evaluate("({example:ShiciExamples.get('top priority','重中之重'),message:ShiciExamples.exampleBlock(null,'another new phrase').textContent})");
      assert.ok(phrase.example.en.includes('top priority'));
      assert.ok(phrase.message.includes('不支持完整短语'));
      await evaluate("ShiciStudyExamples.show({word:'top priority',meaning:'重中之重'},true)");
      assert.ok(await evaluate("document.querySelector('#study-examples .example-en').textContent.includes('top priority')"));
      // A response arriving after the card is hidden must not reveal examples.
      await evaluate("globalThis.__calls=0;globalThis.fetch=()=>{__calls++;return new Promise(resolve=>{globalThis.__finish=()=>resolve({ok:true,json:async()=>[{meanings:[{partOfSpeech:'noun',definitions:[{definition:'A test meaning.',example:'A delayed example.'}]}]}]});});}; ShiciStudyExamples.show({word:'xylophone',meaning:'木琴'},true)");
      await until("globalThis.__calls===1");
      await evaluate("ShiciStudyExamples.show({word:'xylophone',meaning:'木琴'},false); __finish()");
      assert.equal(await hidden(), true);
      assert.equal(await evaluate("document.querySelectorAll('#study-examples .example-en').length"), 0);
      assert.equal(events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0);
      const result={passed:true,checks:['hidden initially','shown after flipping','hidden when flipping back','typing cannot reveal study examples','next word stays hidden until flipped','grading hides next word examples','switching learning mode hides examples','late network response cannot reveal hidden examples']};
      fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
      return;
    }
    if (process.argv.includes('--125')) {
      await require('./vocab-125-browser-cases.cjs')({ send, evaluate, until, type, fs, path, out, root, assert, events });
      return;
    }
    if (process.argv.includes('--study-examples')) {
      await require('./vocab-study-examples-browser-cases.cjs')({ send, evaluate, until, type, fs, path, out, root, assert, events });
      return;
    }
    if (process.argv.includes('--examples')) {
      await require('./vocab-examples-browser-cases.cjs')({ send, evaluate, until, type, fs, path, out, root, assert, events });
      return;
    }
    if (process.argv.includes('--meanings')) {
      await require('./vocab-meanings-browser-cases.cjs')({ send, evaluate, until, type, fs, path, out, assert, events });
      return;
    }
    // Use actual import file control and confirmation, only in the fresh profile.
    const doc = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#import-file' });
    await send('DOM.setFileInputFiles', { nodeId, files: [path.join(root, '拾词备份-校正版-2026-11-08.json')] });
    await until("document.getElementById('import-dialog').open");
    await evaluate("document.getElementById('confirm-import').click()");
    assert.equal(await evaluate("document.getElementById('total').textContent"), '71');
    const expected = JSON.parse(fs.readFileSync(path.join(root, '拾词备份-校正版-2026-11-08.json'), 'utf8'));
    const actual = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1'))");
    for (const key of ['words', 'daily', 'currentId', 'mode']) assert.deepEqual(actual[key], expected[key]);
    await type('be obssesed with');
    assert.equal(await evaluate("document.querySelector('.spell-error').textContent"), 'obssesed');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.spell-error')).textDecorationStyle"), 'wavy');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.spell-error')).textDecorationColor"), 'rgb(209, 47, 64)');
    await evaluate("document.querySelector('.spell-suggestion-row button').click()");
    await until("!!document.querySelector('[aria-label=\"将 obssesed 改为 obsessed\"]')");
    await evaluate("document.querySelector('[aria-label=\"将 obssesed 改为 obsessed\"]').click()");
    assert.equal(await evaluate("document.getElementById('word').value"), 'be obsessed with');
    assert.equal(await evaluate("document.querySelectorAll('.spell-error').length"), 0);
    await type('colour endeavor endeavour brand-name products');
    assert.equal(await evaluate("document.querySelectorAll('.spell-error').length"), 0);
    await type('endeaver');
    await evaluate("document.getElementById('word').focus()");
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(out, 'desktop-spelling.png'), Buffer.from(screenshot.data, 'base64'));
    // Unknown words can be deliberately added, then reset removes obsolete hints.
    await type('zqxvocabtest');
    await evaluate("document.getElementById('meaning').value = '测试用词'; document.getElementById('add-form').requestSubmit()");
    await until("document.getElementById('total').textContent === '72' && document.getElementById('spell-status').textContent.includes('离线检查')");
    assert.equal(await evaluate("document.querySelectorAll('.spell-error').length"), 0);
    await send('Page.reload');
    await until("document.getElementById('total')?.textContent === '72'");
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
    await type('a really long phrase containing benificial and systematically repeated words to check scrolling');
    await evaluate("document.getElementById('word').scrollLeft = 200; document.getElementById('word').dispatchEvent(new Event('scroll')); document.getElementById('word').scrollIntoView({block:'center'})");
    assert.equal(await evaluate("document.querySelector('.spell-error').textContent"), 'benificial');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await evaluate("document.getElementById('word-mirror-text').style.transform"), 'translateX(-200px)');
    const mobile = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, 'mobile-spelling.png'), Buffer.from(mobile.data, 'base64'));
    const errors = events.filter(e => e.method === 'Runtime.exceptionThrown');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const external = events.filter(e => e.method === 'Network.requestWillBeSent' && /^https?:/.test(e.params.request.url));
    assert.equal(external.length, 0);
    const result = { passed: true, cases: ['file:// offline startup', 'corrected 71-entry backup import and learning-record equality', 'phrase token underline', 'red wavy style', 'click suggestion replacement', 'US and UK spellings', 'unknown-word add', 'reset clears hints', 'reload persistence', '390px mobile layout', 'horizontal scroll mirror', 'no JavaScript exceptions', 'no HTTP requests'], screenshots: ['desktop-spelling.png', 'mobile-spelling.png'] };
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (ws?.readyState === WebSocket.OPEN) {
      try { await send('Browser.close'); } catch {}
      ws.close();
    }
    browser.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
