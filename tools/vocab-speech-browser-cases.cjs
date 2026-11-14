module.exports = async ({ send, evaluate, until, fs, path, out, assert, events }) => {
  const nativeSupport=await evaluate("({available:'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,englishVoices:window.speechSynthesis?.getVoices().filter(v=>v.lang.startsWith('en')).length})");
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    globalThis.__spoken=[];globalThis.__cancels=0;
    globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>[{name:'Chinese',lang:'zh-CN',localService:true},{name:'English',lang:'en-US',localService:true}],
      addEventListener:()=>{},cancel:()=>{__cancels++;},speak:u=>{__spoken.push(u);u.onstart?.();}
    }});
  `});
  await send('Page.reload');await until("!!document.getElementById('pronounce') && !document.getElementById('pronounce').disabled");
  const before=await evaluate("localStorage.getItem('shici.vocabulary.v1')");
  assert.equal(await evaluate('__spoken.length'),0);
  assert.equal(await evaluate("document.getElementById('study-examples').hidden"),true);
  const word=await evaluate("document.getElementById('card-text').textContent");
  await evaluate("document.getElementById('pronounce').click()");
  assert.equal(await evaluate('__spoken[0].text'),word);
  assert.equal(await evaluate('__spoken[0].lang'),'en-US');
  assert.equal(await evaluate("document.getElementById('flashcard').getAttribute('aria-pressed')"),'false');
  assert.equal(await evaluate("document.getElementById('study-examples').hidden"),true);
  assert.equal(await evaluate("document.getElementById('pronounce-label').textContent"),'朗读中…');
  await evaluate("document.getElementById('pronounce').click()");
  assert.equal(await evaluate('__spoken.length'),2);
  assert.equal(await evaluate('__cancels'),1);
  await evaluate("__spoken[0].onend()");
  assert.equal(await evaluate("document.getElementById('pronounce-label').textContent"),'朗读中…');
  await evaluate("__spoken[1].onend();document.getElementById('flashcard').click();document.getElementById('pronounce').click()");
  assert.equal(await evaluate('__spoken[2].text'),word);
  assert.equal(await evaluate("document.getElementById('flashcard').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate("localStorage.getItem('shici.vocabulary.v1')"),before);
  await evaluate("document.getElementById('next').click()");
  assert.equal(await evaluate('__cancels'),2);
  assert.equal(await evaluate("document.getElementById('study-examples').hidden"),true);
  await evaluate("document.getElementById('pronounce').click();__spoken.at(-1).onerror({error:'voice-unavailable'})");
  assert.equal(await evaluate("document.getElementById('speech-status').hidden"),false);
  assert.equal(await evaluate("document.getElementById('pronounce-label').textContent"),'发音');
  const layout=await evaluate("(() => {const c=document.getElementById('flashcard').getBoundingClientRect(),b=document.getElementById('pronounce').getBoundingClientRect();return {inside:b.left>=c.left && b.right<=c.right && b.top>=c.top && b.bottom<=c.bottom,nested:!!document.querySelector('#flashcard #pronounce')};})()");
  assert.equal(layout.inside,true);assert.equal(layout.nested,false);
  const desktop=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'speech-desktop.png'),Buffer.from(desktop.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
  await evaluate("document.getElementById('flashcard').scrollIntoView({block:'center'})");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'speech-mobile.png'),Buffer.from(mobile.data,'base64'));
  await evaluate("document.getElementById('mode-difficult').click()");
  assert.equal(await evaluate("document.getElementById('pronounce').disabled"),true);
  assert.equal(events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  const result={passed:true,nativeSupport,checks:['no automatic playback','click reads current English','English voice selection','click does not flip card or reveal examples','back side still reads English','repeat cancels previous speech','stale events ignored','switching words cancels speech','read does not change learning records','failure feedback','button overlays card without nesting buttons','390px layout','empty pool disables playback'],limitation:'Playback events verified with a controlled speech adapter; actual sound depends on device voices and volume.'};
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
};
