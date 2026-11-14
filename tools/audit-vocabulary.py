"""Write a separate corrected backup and a full, human-reviewed audit table."""
import copy
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / '拾词备份-2026-11-08-1794125998922.json'
data = json.loads(source.read_text(encoding='utf-8'))
original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
# Original English -> (corrected English, corrected meaning, assessment).
edits = {
    'systematically': ('systematically', 'adv. 系统地；有条理地', '需修改：副词，中文用“地”，不是形容词的“的”。'),
    'a distorted concept of ...': ('a distorted concept of ...', '对……的错误观念；对……的歪曲认识', '需修改：英语拼写正确，原中文“曲解概念”不自然。'),
    'in essence': ('in essence', '本质上；实质上', '需修改：不宜简单记作 = in fact；后者侧重事实上，前者侧重本质。'),
    'capability': ('capability', 'n. 能力；才能；（机器等的）性能', '需修改：核心是能力、能够做某事的本领，不特指天资；天资更接近 aptitude / talent。'),
    'illustrate': ('illustrate', 'v. 说明；阐明；（用图表、例子）解释；给……加插图', '需修改：词典式释义不用“了”；illustrate 是原形，不自带完成含义。'),
    'inpatient': ('inpatient', 'n. 住院病人；adj. 住院的', '需修改：与 outpatient 写反；这个名词指人，不是住院部。'),
    'outpatient': ('outpatient', 'n. 门诊病人；adj. 门诊的', '需修改：与 inpatient 写反；门诊部可说 outpatient department / clinic。'),
    'endeaver': ('endeavor', 'v. 努力；尽力；力图（常接 to do）；n. 努力；尝试（英式拼写 endeavour）', '需修改：唯一明确的英文拼写错误；美式 endeavor，英式 endeavour。'),
    'usage': ('usage', 'n. 使用；用法；使用量；（语言的）惯用法', '需修改：去掉不适合作为常用义背诵的“使用待遇”；使用率一般用 usage rate。'),
    'reverse': ('reverse', 'v. 颠倒；逆转；撤销；倒车；adj. 相反的；n. 相反情况；背面', '需修改：原动词释义可用，但笔记 reversely = but 错误；表达转折可用 but / however，反向对应关系常用 conversely。'),
    'economical': ('economical', 'adj. 节约的；经济实惠的；省钱的', '建议完善：原“节俭的”可用；注意与 economic（经济的）区别。'),
    'in effect': ('in effect', '实际上；事实上；（规定、法律等）生效中', '建议完善：原义可用，补充另一个常见义，需结合语境。'),
    'emergency': ('emergency', 'n. 紧急情况；突发事件；（医疗语境）急症；adj. 紧急的', '建议完善：医疗语境下原“急诊”有依据，但普通核心义是紧急情况；急诊科常说 emergency department。'),
    'in-person': ('in-person', 'adj. 亲自进行的；面对面的（如 an in-person meeting）', '建议完善：带连字符通常作定语；副词短语“亲自、当面”通常写 in person。'),
    'as is vividly depicted in ....': ('as is vividly depicted in ...', '正如……中生动描绘的那样', '建议完善：补出 vividly（生动地），并把占位符统一为三个点；in 后填图画、图表等出处。'),
    '（观点)....for the following reasons': ('（观点）... for the following reasons', '……，理由如下', '格式整理：统一括号和省略号，补空格；这是写作框架，观点部分需填完整句子。'),
}
notes = {
    'abruptly': '可保留：突然地；形容说话或举止时也可表示唐突地、生硬地，原“粗暴地”应结合语境。',
    'aptitude': '可保留：偏天生的资质、学习某事的天赋，常接 for。',
    'talent': '可保留：天资、才能，也可指有才能的人；与 capability 并非完全同义。',
    'play a crucial role in': '正确：在……中起关键作用；in 后接名词或动名词。',
    'be attributed to': '正确：被归因于……；注意不要与 contribute to 混淆。',
    'be addicted to': '正确：沉迷于……；to 是介词，可接名词或动名词。',
    'be obsessed with': '正确：痴迷于……；with 后接对象。',
    'optimal': '可保留：最佳的、最适宜的；在特定条件下最优，不是所有语境都能直接替换 best。',
    'a hot-button issue': '正确：易引发争议、敏感的热点问题，不只是一般热门话题。',
    'in practice': '正确：实际上；在实践中。',
    'as a matter of fact': '正确：事实上。',
    'attitude is everything': '正确：态度决定一切；原“心态决定一切”是自然意译。',
}
corrected = copy.deepcopy(data)
rows = []
for index, (before, after) in enumerate(zip(data['words'], corrected['words']), 1):
    edit = edits.get(before['word'])
    if edit:
        after['word'], after['meaning'], assessment = edit
    else:
        assessment = notes.get(before['word'], '正确：拼写及所列常用义可保留。')
    rows.append((index, before, after, assessment))
    for key in ('id', 'status', 'reviews', 'lastReviewed'):
        assert before[key] == after[key]
for key in ('daily', 'currentId', 'mode'):
    assert corrected[key] == data[key]
assert len({item['word'].lower() for item in corrected['words']}) == len(data['words'])
target = root / '拾词备份-校正版-2026-11-08.json'
target.write_text(json.dumps(corrected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def cell(value):
    return str(value).replace('|', '\\|').replace('\n', '<br>')
report = [
    '# 拾词词库核对与拼写提示说明（2026-11-08）', '',
    f'已逐项审阅备份中的 {len(rows)} 条词汇、短语和写作框架。发现 1 处明确英文拼写错误（endeaver）；10 条需要修改拼写、释义或笔记，5 条建议完善，另 1 条整理格式，其余 55 条原有内容可保留。以下属于学习笔记校对，并非每个词的全部义项；短语能否用于完整句子仍取决于上下文。', '',
    '校正版已另存为 `拾词备份-校正版-2026-11-08.json`，共调整 16 条；原始备份保持不变。所有单词 ID、掌握状态、复习次数、复习时间、每日统计、当前卡片及学习模式逐项保持一致。导出时间仍沿用原备份，表示数据采集时间。', '',
    '## 怎样使用校正版', '',
    '刷新原来的 `index背单词.html`，点击底部“导入备份”，选择同文件夹的“拾词备份-校正版-2026-11-08.json”，核对 71 条后确认恢复。导入会替换当前词库；如果导出原备份后又添加了词或复习过，请先导出最新备份，避免回退这些后续记录。开发过程中没有操作真实浏览器词库。', '',
    '## 全部 71 条核对表', '',
    '| 序号 | 原英文 | 原释义 | 校对结论 | 校正版英文／释义 |',
    '| --- | --- | --- | --- | --- |',
]
for index, before, after, assessment in rows:
    result = f"{after['word']}：{after['meaning']}" if before != after else '保留原文'
    report.append('| ' + ' | '.join(map(cell, (index, before['word'], before['meaning'], assessment, result))) + ' |')
report += ['', '## 拼写提示功能', '',
    '- 输入英文后停顿约 0.3 秒，对词典未识别的单词显示红色波浪线。短语只标记其中有疑问的词，支持连字符、大小写和英文撇号。',
    '- 点击输入框下方“查看建议”，再点击候选拼写即可替换；没有点击不会自动改字，也不会修改已保存的词库。',
    '- 同时接受常见英式、美式拼写，例如 endeavour / endeavor、colour / color。',
    '- 使用随程序附带的本地词典，不依赖浏览器的拼写设置，不请求网络或 AI。红线只是疑似拼错或未收录提示，生僻词、姓名、缩写可能被标记，仍可按原文添加。',
    '- 检查的是字母拼写，不判断语法、短语搭配、中文释义，也不能识别拼成另一个合法词的错误，例如把 form 写成 from。',
    '- 保留 `index背单词.html`、`vocab.css`、`vocab.js`、`vocab-spell.js` 和完整 `vocab-spell` 文件夹在当前相对位置；移动文件前请导出词库。', '',
    '## 重点核对参考', '',
    '以下词典用于核对重点疑点；整表的建议表述为人工归纳，未整页复制词典内容。', '',
    '- [Cambridge：endeavour（英式 endeavour / 美式 endeavor）](https://dictionary.cambridge.org/us/dictionary/english/endeavour?topic=trying-and-making-an-effort)',
    '- [Cambridge：systematically](https://dictionary.cambridge.org/dictionary/english-chinese-simplified/systematically)',
    '- [Cambridge：in essence](https://dictionary.cambridge.org/dictionary/english-chinese-simplified/in-essence)',
    '- [APA：inpatient](https://dictionary.apa.org/inpatient)',
    '- [Cambridge：outpatient](https://dictionary.cambridge.org/dictionary/english/outpatient)',
    '- [Wordsmyth：capability](https://www.wordsmyth.net/?level=2&rid=6107)',
    '- [Cambridge：emergency](https://dictionary.cambridge.org/zhs/词典/英语-汉语-简体/emergency)',
    '- [Dictionary.com：reverse / reversely](https://www.dictionary.com/browse/reverse)',
    '- [Dictionary.com：usage](https://www.dictionary.com/browse/usage)', '',
    '离线拼写使用 [Typo.js](https://github.com/cfinke/Typo.js/) 与 SCOWL 派生的 dictionary-en / dictionary-en-gb；版本、来源及许可位于 `vocab-spell` 文件夹。', '',
    f'原始备份 SHA-256：`{original_hash}`。',
]
(root / '背单词词库核对-2026-11-08.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
print(f'Audited {len(rows)} entries; {len(edits)} changed; original SHA-256 preserved; learning records identical.')
