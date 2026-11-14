// Verify the Enter-to-add flow in a disposable headless Edge profile.
// Run: node tools/check-enter-flow.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'reports', 'enter-flow');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, 'test-profile-'));
const wait = ms => new Promise(r => setTimeout(r, ms));

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });

let ws, seq = 0;
const pending = new Map(), events = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(100); }
  throw new Error(`Page did not reach: ${expression}`);
}
async function type(value) {
  await evaluate("document.getElementById('word').focus(); document.getElementById('word').value = ''; document.getElementById('word').dispatchEvent(new Event('input',{bubbles:true}))");
  await send('Input.insertText', { text: value });
  await wait(400);
}
async function pressEnter(shift = false) {
  const modifiers = shift ? 8 : 0;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers });
  await wait(250);
}
// 真实按键：keydown 带 text，若页面 preventDefault 则数字不会写进输入框。
async function pressDigit(digit) {
  const code = 48 + Number(digit);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: digit, code: `Digit${digit}`, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, text: digit });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: digit, code: `Digit${digit}`, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await wait(150);
}
const total = () => evaluate("Number(document.getElementById('total').textContent)");
const toast = () => evaluate("document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent");

(async () => {
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await wait(100);
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const p = pending.get(message.id); if (!p) return;
        clearTimeout(p.timer); pending.delete(message.id);
        message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
      } else events.push(message);
    });
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
    await until("!!document.getElementById('spell-status') && document.getElementById('spell-status').textContent.includes('离线检查')");
    await until("Number(document.getElementById('total').textContent) > 0");
    const start = await total();
    const checks = [];

    // 1) 释义为空 + 未勾选：回车应自动取词典第一条并收下
    await type('forge');
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length > 0");
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${start + 1}`);
    assert.equal(await evaluate("document.getElementById('meaning').value"), '');
    assert.equal(await evaluate("document.activeElement.id"), 'word');
    assert.ok((await toast()).includes('已收下「forge」'));
    checks.push('回车收下：未勾选时自动取词典第一条，焦点回到单词框');

    const added = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words[0]");
    assert.equal(added.word, 'forge');
    assert.ok(added.meaning.length > 0);

    // 2) 勾选第 2 条后再回车：应采用勾选的释义，而不是第一条
    await type('bank');
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length > 1");
    const second = await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]')[1].value");
    await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]')[1].click()");
    await evaluate("document.getElementById('word').focus()");
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${start + 2}`);
    const bank = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words[0]");
    assert.equal(bank.meaning, second);
    checks.push('回车收下：优先使用勾选的释义（第 2 条），不被第一条覆盖');

    // 3) 释义框里回车 = 提交；Shift+回车 = 换行不提交
    await type('harbor');
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length > 0");
    await evaluate("const m=document.getElementById('meaning'); m.value=''; m.focus()");
    await pressEnter(true);
    assert.equal(await total(), start + 2, 'Shift+回车不应提交');
    const valueAfterShift = await evaluate("document.getElementById('meaning').value");
    assert.ok(valueAfterShift.includes('\n'), 'Shift+回车应产生换行');
    await evaluate("document.getElementById('meaning').value='温和的'; document.getElementById('meaning').focus()");
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${start + 3}`);
    assert.equal(await evaluate("document.activeElement.id"), 'word');
    checks.push('释义框回车提交；Shift+回车换行且不提交');

    // 4) 重复单词：提示且选中原词，方便直接重打
    await type('harbor');
    await evaluate("document.getElementById('word').focus()");
    await pressEnter();
    await wait(300);
    assert.equal(await total(), start + 3, '重复词不应入库');
    assert.ok((await toast()).includes('已经在词库中'));
    const selection = await evaluate("({s:document.getElementById('word').selectionStart,e:document.getElementById('word').selectionEnd,v:document.getElementById('word').value})");
    assert.ok(selection.s === 0 && selection.e === selection.v.length, '重复时应选中已输入的词');
    checks.push('重复单词被拦下，且自动选中输入内容便于重打');

    // 5) 连录：连续两个词，全程只按回车
    const before = await total();
    await type('meadow');
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length > 0");
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${before + 1}`);
    await type('lantern');
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length > 0");
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${before + 2}`);
    assert.equal(await evaluate("document.activeElement.id"), 'word');
    checks.push('连续录入两个词，全程回车，无需鼠标');

    // 6) 数字键勾选：按 1、3 多选释义，回车一次收下两条，数字不会写进单词框
    const multiWord = await evaluate(`(() => {
      const used = new Set(JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words.map(w => w.word.toLowerCase()));
      for (const w of ['spring', 'light', 'set', 'run', 'hold', 'fine']) {
        if (used.has(w)) continue;
        if ((window.ShiciMeanings?.lookup?.(w) || []).length >= 3) return w;
      }
      return '';
    })()`);
    assert.ok(multiWord, '应能找到一个未收录且有 3 条以上释义的词');
    await type(multiWord);
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length >= 3");
    assert.ok(await evaluate("document.querySelectorAll('.meaning-index').length >= 3"), '释义应带数字序号');
    const senseA = await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]')[0].value");
    const senseC = await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]')[2].value");
    await pressDigit('1');
    await pressDigit('3');
    assert.equal(await evaluate("document.getElementById('word').value"), multiWord, '数字键不应写进单词框');
    assert.equal(await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]:checked').length"), 2, '按 1、3 应勾选两条');
    await pressDigit('1');
    assert.equal(await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]:checked').length"), 1, '再按一次同一数字应取消勾选');
    await pressDigit('1');
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${before + 3}`);
    const multi = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words[0]");
    assert.equal(multi.meaning, `${senseA}；${senseC}`, '两条勾选释义都应入库');
    assert.ok((await toast()).includes('2 个意思'), '提示应说明收了几个意思');
    assert.equal(await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]').length"), 0, '提交后应清空上一个词的释义选项');
    checks.push('数字键勾选：按 1、3 多选后回车收下两条；再按一次可取消；数字不会污染单词框');

    // 7) 数字 0：进入自己写中文，勾选的意思先带入，补充完回车一起收下
    const manualWord = await evaluate(`(() => {
      const used = new Set(JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words.map(w => w.word.toLowerCase()));
      for (const w of ['willow', 'harvest', 'stream', 'garden', 'wander', 'hollow']) {
        if (used.has(w)) continue;
        if ((window.ShiciMeanings?.lookup?.(w) || []).length >= 2) return w;
      }
      return '';
    })()`);
    assert.ok(manualWord, '应能找到一个未收录且有 2 条释义的词');
    await type(manualWord);
    await until("document.querySelectorAll('#meaning-options input[type=checkbox]').length >= 2");
    assert.equal(await evaluate("document.querySelectorAll('.meaning-manual-btn').length"), 1, '列表末尾应有「自己写中文」入口');
    const carried = await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]')[1].value");
    await pressDigit('2');
    await pressDigit('0');
    assert.equal(await evaluate("document.activeElement.id"), 'meaning', '按 0 应把焦点交给中文框');
    assert.equal(await evaluate("document.getElementById('meaning').value"), carried, '按 0 应把已勾选的释义带进中文框');
    await send('Input.insertText', { text: '；自己补的一句' });
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${before + 4}`);
    const manualEntry = await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words[0]");
    assert.ok(manualEntry.meaning.includes(carried) && manualEntry.meaning.includes('自己补的一句'), '带入的释义和自己的补充应一起入库');
    assert.equal(await evaluate("document.activeElement.id"), 'word', '收下后焦点回到单词框');
    checks.push('数字 0：进中文框、带入已勾选释义、补充后回车一起收下');

    // 8) 词典查不到的词：按 0 直接写中文也能收下
    await type('zzzqxw');
    await until("document.querySelectorAll('.meaning-manual-btn').length === 1");
    assert.equal(await evaluate("document.querySelectorAll('#meaning-options input[type=checkbox]').length"), 0, '查不到的词不应有勾选项');
    await pressDigit('0');
    assert.equal(await evaluate("document.activeElement.id"), 'meaning');
    await send('Input.insertText', { text: '自造词测试义' });
    await pressEnter();
    await until(`Number(document.getElementById('total').textContent) === ${before + 5}`);
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words[0].meaning"), '自造词测试义');
    checks.push('词典查不到时，按 0 直接写中文并回车收下');

    assert.equal(events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0, '页面不应抛异常');
    checks.push('全程无 JS 异常');

    const result = { passed: true, checks };
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('FAILED:', error.message);
    console.error('exceptions:', JSON.stringify(events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params?.exceptionDetails?.exception?.description)));
    process.exitCode = 1;
  } finally {
    try { ws?.close(); } catch {}
    browser.kill();
    await wait(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
})();
