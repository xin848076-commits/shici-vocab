/* Click-to-speak using the browser's installed/available English voices. */
(() => {
  'use strict';
  const button = document.getElementById('pronounce');
  const label = document.getElementById('pronounce-label');
  const status = document.getElementById('speech-status');
  if (!button) return;
  const synth = globalThis.speechSynthesis;
  let word = '', utterance, revision = 0;
  const supported = !!synth && typeof globalThis.SpeechSynthesisUtterance === 'function';
  function reset() { label.textContent = '发音'; button.removeAttribute('aria-busy'); }
  function stop() {
    revision++;
    if (utterance) { synth?.cancel(); utterance = null; }
    reset(); status.hidden = true; status.textContent = '';
  }
  function message(text) { status.textContent = text; status.hidden = false; }
  function englishVoice() {
    const voices = synth.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang));
    return voices.find(voice => voice.localService && /^en[-_]US$/i.test(voice.lang)) || voices.find(voice => voice.localService) || voices.find(voice => /^en[-_]US$/i.test(voice.lang)) || voices[0];
  }
  globalThis.ShiciSpeech = {
    setWord(next) {
      if (next !== word) { stop(); word = next; }
      button.disabled = !word;
      button.setAttribute('aria-label', word ? `朗读英文：${word}` : '暂无单词可朗读');
      button.title = word ? `朗读 ${word}` : '暂无单词可朗读';
    }
  };
  button.addEventListener('click', () => {
    if (!word) return;
    stop();
    if (!supported) { message('当前浏览器不支持朗读，请使用 Microsoft Edge 或 Chrome。'); return; }
    const ticket = revision;
    utterance = new SpeechSynthesisUtterance(word);
    const voice = englishVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US'; utterance.rate = 0.85;
    const current = utterance;
    current.onstart = () => {
      if (ticket !== revision) return;
      label.textContent = '朗读中…'; button.setAttribute('aria-busy', 'true');
    };
    current.onend = () => { if (ticket === revision) { utterance = null; reset(); } };
    current.onerror = event => {
      if (ticket !== revision) return;
      utterance = null; reset();
      if (!['canceled', 'interrupted'].includes(event.error)) message('暂时无法发音，请检查设备音量和系统英文语音，或稍后重试。');
    };
    try { synth.speak(current); } catch { utterance = null; reset(); message('暂时无法发音，请检查浏览器和系统英文语音后重试。'); }
  });
  // Some browsers populate the voice list asynchronously after page load.
  if (supported) {
    synth.getVoices();
    synth.addEventListener('voiceschanged', () => synth.getVoices());
  }
  window.addEventListener('pagehide', stop);
})();
