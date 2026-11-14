module.exports=async({send,evaluate,until,type,fs,path,out,assert,events})=>{
  const source=path.join(out,'current-vocabulary.json'),bytes=fs.readFileSync(source),original=JSON.parse(bytes);
  await evaluate(`localStorage.setItem('shici.vocabulary.v1',${JSON.stringify(JSON.stringify(original))})`);
  await send('Page.reload');await until(`document.getElementById('total')?.textContent==='${original.words.length}'`);
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1'))"),original);
  assert.equal(await evaluate("document.getElementById('study-examples').hidden"),true);
  const coverage=await evaluate(`(() => {
    return JSON.parse(localStorage.getItem('shici.vocabulary.v1')).words.map(word=>{
      const senses=ShiciExamples.savedSenses(word.meaning);
      ShiciStudyExamples.show(word,true);
      return {word:word.word,senses:senses.length,missing:senses.filter(s=>!ShiciExamples.resolved(word.word,s,word.examples||[])),rendered:document.querySelectorAll('#study-examples .example-en').length};
    });
  })()`);
  assert.deepEqual(coverage.filter(item=>item.missing.length||!item.rendered),[]);
  const structure=await evaluate(`(() => {
    const data={...SHICI_EXAMPLE_EXTENSIONS,...SHICI_EXAMPLE_DATA};
    return Object.entries(data).flatMap(([word,rows])=>rows.filter(row=>row.length<3||row.slice(0,3).some(v=>typeof v!=='string'||!v.trim())).map(()=>word));
  })()`);
  assert.deepEqual(structure,[]);
  assert.ok(await evaluate("ShiciExamples.get('look after somebody','照顾').en.includes('younger brother')"));
  assert.ok(await evaluate("ShiciExamples.get('from　time　to　time…','偶尔').en.includes('coffee')"));
  assert.ok(await evaluate("ShiciMeanings.lookup('sustain').includes('vt. 准许')"),'Adding examples must not narrow dictionary meanings');
  assert.notEqual(await evaluate("ShiciExamples.get('take advantage of','利用').en"),await evaluate("ShiciExamples.get('take advantage of','占……的便宜').en"));
  await evaluate("[...document.querySelectorAll('.word-row')].find(r=>r.querySelector('strong').textContent==='sustenance').querySelector('.tag').click()");
  assert.equal(await evaluate("document.getElementById('study-examples').hidden"),true);
  await evaluate("document.getElementById('flashcard').click()");
  assert.equal(await evaluate("document.querySelectorAll('#study-examples .example-en').length"),4);
  assert.ok(await evaluate("document.getElementById('study-examples').textContent.includes('emotional sustenance')"));
  await evaluate("document.getElementById('study-examples').scrollIntoView({block:'center'})");
  const desktop=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'expanded-desktop.png'),Buffer.from(desktop.data,'base64'));
  await evaluate("[...document.querySelectorAll('.word-row')].find(r=>r.querySelector('strong').textContent==='the possession of').querySelector('.tag').click();document.getElementById('flashcard').click()");
  assert.equal(await evaluate("document.querySelectorAll('#study-examples .example-en').length"),2);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
  await evaluate("document.getElementById('study-examples').scrollIntoView({block:'center'})");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'expanded-mobile.png'),Buffer.from(mobile.data,'base64'));
  await evaluate("document.getElementById('next').click()");
  assert.equal(await evaluate("document.getElementById('study-examples').hidden"),true);
  const state=await evaluate("JSON.parse(localStorage.getItem('shici.vocabulary.v1'))");
  assert.deepEqual(state.words,original.words);assert.deepEqual(state.daily,original.daily);assert.deepEqual(fs.readFileSync(source),bytes);
  assert.equal(events.filter(e=>e.method==='Network.requestWillBeSent'&&/^https?:/.test(e.params.request.url)).length,0);
  assert.equal(events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  const stats=await evaluate('ShiciExamples.stats()');
  const result={passed:true,currentWords:original.words.length,localExampleWords:stats.words,localSenseGroups:stats.senseGroups,missingCurrentSenses:0,checks:['all current saved meanings matched','all current words render local examples','bilingual data structure complete','placeholder and fullwidth normalization','distinct examples for different senses','dictionary definitions not narrowed by new examples','shown only after flip and hidden on next word','sustenance four senses','the possession of two senses','390px mobile layout','words, notes and learning records unchanged','no HTTP requests or JavaScript errors']};
  fs.writeFileSync(path.join(out,'coverage.json'),JSON.stringify(coverage,null,2));fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
};
