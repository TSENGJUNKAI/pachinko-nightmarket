// 產生 AI 產圖清單：筆畫正確的字形底稿，加一頁可以一鍵複製提示詞的清單。
// 用法：node scripts/make-art-brief.mjs <輸出資料夾>
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outDir = process.argv[2];
if (!outDir) throw new Error('請提供輸出資料夾');

const LOOKS = {
  gold: '拋光的立體熔金金屬字，深刻的斜面切角，酒紅色外框，金屬高光閃耀',
  fire: '燒紅的金屬字，字身從白熱、亮黃漸層到橘紅，字緣竄出熊熊烈焰和火星',
  blue: '電光藍的鍍鉻金屬字，白色高光，字緣有藍色閃電，銀色粗外框',
  red: '血紅色的鍍鉻金屬字，黑紅漸層，字緣有紅色閃電和碎裂感，金色粗外框',
  jade: '翡翠綠的亮面金屬字，白色高光，字緣有綠色光芒，金色粗外框',
  silver: '冰冷的銀色鍍鉻金屬字，鋼鐵質感，帶刮痕和冷光，深灰色粗外框',
  rainbow: '七彩虹光的鑽石鍍膜金屬字，紅橙黃綠藍紫流動漸層，閃耀星芒，白金粗外框',
};

const GREEN = '背景必須是完全平塗的純綠色（#00FF00），背景上不能有陰影、漸層或任何雜物，物件本身不要使用綠色';
const MAGENTA = '背景必須是完全平塗的純洋紅色（#FF00FF），背景上不能有陰影、漸層或任何雜物，物件本身不要使用洋紅色';
const TEXT_END = '只畫這些字，不要加其他文字、符號、邊框或浮水印，字的四周要留空';

function textPrompt(look, background, extra = '') {
  return `請以附圖的黑色字形為準，一筆一畫完全照著畫，字形、筆畫數和排列都不能更改。把它重新設計成日本柏青哥機台上非常浮誇的立體標題字：${LOOKS[look]}。多層厚重立體邊，強烈光影，字形銳利有衝擊力。${extra}${TEXT_END}。${background}。`;
}

// dir：h 橫書、v 直書。bg 是字身含綠色時改用洋紅底。
const TEXT_ITEMS = [
  ['017', '救救阿公的攤位', 'h', 'gold', '畫面最上方的遊戲標題', '必做'],
  ['018', '聽牌', 'h', 'gold', '聽牌大字', '必做'],
  ['019', '機會', 'v', 'blue', '預告第一段', '必做'],
  ['020', '好運', 'v', 'jade', '預告第二段', '必做', 'magenta'],
  ['021', '激熱', 'v', 'red', '預告第三段', '必做'],
  ['022', '超激熱', 'v', 'fire', '預告最高段', '必做'],
  ['023', '聖筊', 'h', 'gold', '擲出聖筊，後面由程式接 ×1、×2', '必做'],
  ['024', '笑筊', 'h', 'silver', '擲筊失敗', '必做'],
  ['025', '陰筊', 'h', 'silver', '擲筊失敗', '必做'],
  ['026', '第三次', 'h', 'silver', '第三次擲筊前', '必做'],
  ['027', '三聖筊', 'v', 'rainbow', '三聖筊必中', '必做', 'magenta'],
  ['028', '復活', 'h', 'fire', '沒中後翻盤', '必做'],
  ['029', '大獎', 'h', 'fire', '中大獎，最大的一組字', '必做'],
  ['030', '遶境', 'v', 'gold', '進入 RUSH', '必做'],
  ['031', 'RUSH', 'h', 'fire', '進入 RUSH', '必做'],
  ['032', '連莊', 'v', 'fire', 'RUSH 中獎', '必做'],
  ['033', '最後一次', 'h', 'red', 'RUSH 最後一轉', '必做'],
  ['034', '遶境成功', 'v', 'rainbow', '走到廟口', '必做', 'magenta'],
  ['035', '遶境結束', 'h', 'silver', 'RUSH 結束', '必做'],
  ['036', '總計', 'h', 'gold', 'RUSH 結算', '必做'],
  ['037', '保留', 'h', 'gold', '托盤上的保留標示', '必做'],
  ['038', '抵達香腸街', 'h', 'gold', 'RUSH 到站', '之後'],
  ['039', '抵達珍奶巷', 'h', 'gold', 'RUSH 到站', '之後'],
  ['040', '抵達大牌樓', 'h', 'gold', 'RUSH 到站', '之後'],
  ['041', '出珠', 'h', 'gold', '出珠計數的前綴', '必做'],
];

// 數字要一起產，同一張的質感才會一致。
const SHEET_ITEMS = [
  ['042', '0 1 2 3 4\n5 6 7 8 9\n, ×', 'gold', '數字組（金）：轉盤數字、出珠計數、RUSH 倒數都用這組', '必做', 'green'],
  ['043', '7', 'rainbow', '彩虹 7：轉盤上最特別的數字', '必做', 'magenta'],
];

const STYLE = '風格要和附圖完全一致：粗黑線條的日式街機插畫，飽和的紅金配色，強烈光影。';
const CENTERED = '物件置中、完整入鏡，正面視角，四周留空，不要加文字或浮水印。';

const OBJECT_ITEMS = [
  ['044', '轉盤外框', '比例 3:2', `台灣廟宇風格的豪華柏青哥機台外框：鎏金雕花、紅漆、金龍盤繞、邊框一圈發亮的燈泡。外框是一個完整的長方形環，中間的方形開口要很大（約佔八成面積）且完全是純綠色。${STYLE}${GREEN}。不要加文字或浮水印。`, '必做'],
  ['045', '洞口', '比例 1:1', `柏青哥的入賞口：金色雕花的小型廟宇神龕，正面有一個向內凹的黑色圓洞，兩側有金色擋板像漏斗一樣往洞口收。${STYLE}${CENTERED}${GREEN}。`, '必做'],
  ['046', '下方托盤', '比例 4:1', `機台下方的橫長形托盤面板：深紅漆面加鎏金雕花邊，兩端有金色祥雲裝飾，中間大面積是乾淨的深紅色，不要任何文字。畫面填滿，不留背景。${STYLE}`, '必做'],
  ['047', '屋頂橫幅', '比例 6:1', `台灣廟宇的橫長形屋頂：紅色琉璃瓦、金色屋脊、兩端燕尾翹起、屋脊上有彩色剪黏裝飾，中間留一段較素的區域給標題，不要任何文字。${STYLE}屋頂上方和下方都是背景。${GREEN}。`, '必做'],
  ['048', '保留燈（暗和亮）', '比例 2:1', `同一顆金框圓形燈座畫兩次、左右並排：左邊是熄滅的暗紅色燈，右邊是點亮、金黃發光的燈。兩顆大小完全一樣，中間留空。${STYLE}${GREEN}。不要加文字或浮水印。`, '必做'],
  ['049', '筊杯（兩面）', '比例 2:1', `台灣廟宇的紅色木製筊杯，同一個筊杯畫兩次、左右並排：左邊弧面朝上（紅漆亮面），右邊平面朝上（淡木色）。都是彎月形，水平擺放，大小一樣，中間留空。${STYLE}${GREEN}。不要加文字或浮水印。`, '必做'],
  ['050', '鑼', '比例 1:1', `遶境陣頭用的大銅鑼，完全正面的正圓形，金銅色，中央有凸起圓心，邊緣有紅色流蘇裝飾但不超出太多。${STYLE}${CENTERED}${GREEN}。`, '必做'],
  ['051', '燈籠', '比例 1:1', `台灣廟會的傳統紅燈籠，圓形，金色上下蓋，下方有金色流蘇，上面沒有文字，正面對稱。${STYLE}${CENTERED}${GREEN}。`, '必做'],
  ['052', '珠子和釘子', '比例 2:1', `左邊一顆閃亮的銀色鋼珠，右邊一根從正上方看的黃銅圓釘頭。都是正圓形、高光明顯、造型簡單，縮得很小也看得清楚。${STYLE}${GREEN}。不要加文字或浮水印。`, '之後'],
  ['053', '金紙碎片', '比例 2:1', `四片飄落的金紙和紅紙碎片，彼此分開不重疊，角度不同，邊緣清楚。${STYLE}${GREEN}。不要加文字或浮水印。`, '之後'],
  ['054', '廟門「好運宮」', '比例 1:1', `虛構的台灣廟宇牌樓正面：紅柱、金色屋頂、燕尾屋脊，牌匾上的三個字要完全照附圖的字形。${STYLE}${CENTERED}${GREEN}。`, '之後', '好運宮'],
  ['055', '遶境遠景', '比例 4:1', `夜晚的台灣老街剪影遠景，一排高低不同的深紫色屋頂和霓虹光暈，沒有文字。左右兩端的高度和顏色要能接起來，適合橫向重複捲動。畫面填滿，不留背景。${STYLE}`, '之後'],
  ['056', '遶境路面', '比例 8:1', `正側面視角的夜市柏油路，有金黃色路緣和白色虛線，沒有文字。左右兩端要能無縫接起來，適合橫向重複捲動。畫面填滿，不留背景。${STYLE}`, '之後'],
  ['057', '攤位：香腸', '比例 1:1', `台灣夜市攤車的正面，紅白條紋遮雨棚，霓虹招牌，招牌上的字要完全照附圖的字形。${STYLE}${CENTERED}${GREEN}。`, '之後', '香腸'],
  ['058', '攤位：珍奶', '比例 1:1', `台灣夜市攤車的正面，藍白條紋遮雨棚，霓虹招牌，招牌上的字要完全照附圖的字形。${STYLE}${CENTERED}${GREEN}。`, '之後', '珍奶'],
  ['059', '攤位：鹹酥雞', '比例 1:1', `台灣夜市攤車的正面，黃白條紋遮雨棚，霓虹招牌，招牌上的字要完全照附圖的字形。${STYLE}${CENTERED}${GREEN}。`, '之後', '鹹酥雞'],
  ['060', '攤位：彈珠台', '比例 1:1', `台灣夜市彈珠台攤位的正面，桃紅白條紋遮雨棚，霓虹招牌，招牌上的字要完全照附圖的字形。${STYLE}${CENTERED}${GREEN}。`, '之後', '彈珠台'],
  ['061', '攤位：蚵仔煎', '比例 1:1', `台灣夜市攤車的正面，橘白條紋遮雨棚，霓虹招牌，招牌上的字要完全照附圖的字形。${STYLE}${CENTERED}${GREEN}。`, '之後', '蚵仔煎'],
];

const FONT = "'Noto Serif TC'";
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function renderLines(file, lines, width, height) {
  const longest = Math.max(...lines.map((l) => [...l].length));
  const latin = lines.every((l) => /^[\x00-\x7f×]*$/.test(l));
  const unit = latin ? 0.72 : 1.08;
  const size = Math.min((width * 0.88) / (longest * unit), (height * 0.82) / (lines.length * 1.18));
  const lineHeight = size * 1.18;
  const startY = height / 2 - (lineHeight * lines.length) / 2 + lineHeight / 2;
  const tspans = lines.map((line, i) =>
    `<text x="${width / 2}" y="${startY + i * lineHeight}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="900" font-size="${size}" fill="#000">${esc(line)}</text>`,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${tspans.join('')}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function renderItem(file, text, dir) {
  if (dir === 'v') await renderLines(file, [...text], 1024, 1536);
  else if (text.includes('\n')) await renderLines(file, text.split('\n'), 1536, 1024);
  else await renderLines(file, [text], 1536, [...text].length > 4 ? 512 : 768);
}

const refDir = path.join(outDir, '底稿');
await mkdir(refDir, { recursive: true });

const cards = [];
const card = (group, id, name, use, priority, prompt, ref) => cards.push({ group, id, name, use, priority, prompt, ref });

for (const [id, text, dir, look, use, priority, bg] of TEXT_ITEMS) {
  const file = `${id}-${text}.png`;
  await renderItem(path.join(refDir, file), text, dir);
  const background = bg === 'magenta' ? MAGENTA : GREEN;
  card('文字', id, text, `${use}（${dir === 'v' ? '直書' : '橫書'}）`, priority, textPrompt(look, background), file);
}
for (const [id, text, look, use, priority, bg] of SHEET_ITEMS) {
  const file = `${id}-${text.length > 1 ? '數字組' : '彩虹7'}.png`;
  await renderItem(path.join(refDir, file), text, 'h');
  const background = bg === 'magenta' ? MAGENTA : GREEN;
  const extra = text.length > 1 ? '每個字元的大小和質感要完全一致，彼此分開不相連，留明顯間距。' : '';
  card('數字', id, text.length > 1 ? '數字組 0–9、逗號、×' : '彩虹 7', use, priority, textPrompt(look, background, extra), file);
}
for (const [id, name, ratio, prompt, priority, refText] of OBJECT_ITEMS) {
  let file = null;
  if (refText) {
    file = `${id}-${refText}.png`;
    await renderItem(path.join(refDir, file), refText, 'h');
  }
  const attach = refText ? `先附字形底稿，再附 016.png 當風格參考。` : `附 016.png 當風格參考。`;
  card('物件', id, name, `${ratio}。${attach}`, priority, prompt, file);
}

const groupTitles = { 文字: '文字（要附字形底稿）', 數字: '數字（要附字形底稿）', 物件: '畫面物件' };
const sections = Object.keys(groupTitles).map((group) => {
  const items = cards.filter((c) => c.group === group);
  const html = items
    .map((c) => `
    <article class="card" data-priority="${c.priority}">
      ${c.ref ? `<img src="底稿/${esc(c.ref)}" alt="${esc(c.name)} 的字形底稿" loading="lazy">` : '<div class="noref">不需底稿</div>'}
      <div class="body">
        <h3><span class="id">${c.id}.png</span> ${esc(c.name)} <span class="tag ${c.priority === '必做' ? 'must' : ''}">${c.priority}</span></h3>
        <p class="use">${esc(c.use)}</p>
        <p class="prompt">${esc(c.prompt)}</p>
        <div class="actions">
          <button type="button" data-copy>複製提示詞</button>
          <label><input type="checkbox" data-done="${c.id}"> 已產好</label>
        </div>
      </div>
    </article>`)
    .join('');
  return `<section><h2>${groupTitles[group]}</h2>${html}</section>`;
});

const must = cards.filter((c) => c.priority === '必做').length;
const page = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 產圖清單</title>
<style>
:root { --bg:#f6f2ea; --panel:#fff; --text:#241a14; --muted:#6d5f54; --line:#ddd2c2; --accent:#a81e2c; --on:#fff; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg:#17120f; --panel:#231c18; --text:#f4ebdf; --muted:#b7a899; --line:#43362d; --accent:#ff6b5e; --on:#17120f; } }
* { box-sizing: border-box; }
body { margin:0 auto; max-width:920px; padding:24px 16px 64px; background:var(--bg); color:var(--text); font-family:"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif; line-height:1.6; }
h1 { margin:0 0 4px; font-size:28px; }
h2 { margin:32px 0 12px; font-size:20px; }
h3 { margin:0; font-size:17px; }
.how { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 16px; }
.how ol { margin:0; padding-left:20px; }
.bar { position:sticky; top:0; display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:10px 0; background:var(--bg); z-index:1; }
.card { display:flex; gap:14px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; margin-bottom:10px; }
.card img, .noref { flex:0 0 130px; width:130px; height:130px; object-fit:contain; background:#fff; border:1px solid var(--line); border-radius:6px; }
.noref { display:flex; align-items:center; justify-content:center; font-size:13px; color:#6d5f54; }
.body { min-width:0; flex:1; }
.id { font-variant-numeric:tabular-nums; color:var(--accent); }
.tag { font-size:12px; font-weight:400; padding:1px 7px; border:1px solid var(--line); border-radius:99px; color:var(--muted); }
.tag.must { background:var(--accent); border-color:var(--accent); color:var(--on); }
.use { margin:2px 0 6px; font-size:14px; color:var(--muted); }
.prompt { margin:0 0 8px; font-size:14px; overflow-wrap:anywhere; }
.actions { display:flex; gap:12px; align-items:center; font-size:14px; }
button { font:inherit; min-height:36px; padding:0 14px; border-radius:8px; border:1px solid var(--accent); background:var(--accent); color:var(--on); cursor:pointer; }
button:focus-visible, input:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
.card.done { opacity:.55; }
.hide-later .card[data-priority="之後"] { display:none; }
@media (max-width:560px) { .card { flex-direction:column; } .card img, .noref { width:100%; flex-basis:auto; height:150px; } }
</style>
</head>
<body>
<h1>AI 產圖清單</h1>
<p>共 ${cards.length} 張，標「必做」的有 ${must} 張。</p>
<div class="how"><ol>
  <li>文字和數字：上傳左邊那張字形底稿（在「底稿」資料夾），再貼上提示詞。</li>
  <li>物件：上傳 016.png 當風格參考，有底稿的也一起上傳，再貼上提示詞。</li>
  <li>存成卡片標示的檔名，例如 <b>029.png</b>，放進 pachinkoimage 資料夾。</li>
  <li>產完先自己對一下字有沒有寫錯；我接之前也會逐字再檢查。</li>
</ol></div>
<div class="bar">
  <label><input type="checkbox" id="only-must"> 只看必做</label>
  <span id="count"></span>
</div>
${sections.join('\n')}
<script>
const KEY = 'pachinko-art-done';
let done = [];
try { done = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
const boxes = [...document.querySelectorAll('[data-done]')];
function render() {
  boxes.forEach((box) => {
    box.checked = done.includes(box.dataset.done);
    box.closest('.card').classList.toggle('done', box.checked);
  });
  document.getElementById('count').textContent = '已產好 ' + done.length + ' / ' + boxes.length;
}
boxes.forEach((box) => box.addEventListener('change', () => {
  done = box.checked ? [...done, box.dataset.done] : done.filter((id) => id !== box.dataset.done);
  try { localStorage.setItem(KEY, JSON.stringify(done)); } catch {}
  render();
}));
document.getElementById('only-must').addEventListener('change', (event) => {
  document.body.classList.toggle('hide-later', event.target.checked);
});
document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
  const text = button.closest('.body').querySelector('.prompt').textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  button.textContent = '已複製';
  setTimeout(() => { button.textContent = '複製提示詞'; }, 1200);
}));
render();
</script>
</body>
</html>
`;
await writeFile(path.join(outDir, 'AI產圖清單.html'), page, 'utf8');
console.log(`${cards.length} items, ${must} must, refs in ${refDir}`);
