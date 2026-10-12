import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const word = 'الميسّر';
function star(cx, cy, r) {
  // contour de l'étoile à 8 branches (union de deux carrés) : 16 sommets, creux à r·cos(45°)/cos(22,5°)
  const inner = r * Math.cos(Math.PI/4) / Math.cos(Math.PI/8);
  const pts = [...Array(16)].map((_, i) => { const a = -Math.PI/2 + i*Math.PI/8, rr = i % 2 ? inner : r; return [cx + rr*Math.cos(a), cy + rr*Math.sin(a)]; });
  return ['M' + pts.map(q => q.map(v => v.toFixed(1)).join(',')).join('L') + 'Z', ''];
}
function svg({ bg, r, font }) {
  const c = 512, [a, b] = star(c, c, r), [a2, b2] = star(c, c, r*0.94), [a3, b3] = star(c, c, r*0.83);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}
  <g fill="#D9A21B"><path d="${a}"/><path d="${b}"/></g>
  <g fill="#083F34"><path d="${a2}"/><path d="${b2}"/></g>
  <g fill="none" stroke="#E9C46A" stroke-width="3"><path d="${a3}"/><path d="${b3}"/></g>
  <text id="t" x="${c}" y="${c}" text-anchor="middle" direction="rtl" font-family="Sch" font-size="${font}"
        fill="#F7F4EA" stroke="#F7F4EA" stroke-width="${font*0.025}" paint-order="stroke">${word}</text>
</svg>`;
}
const css = `@font-face{font-family:Sch;src:url('ScheherazadeNew-Regular.ttf')} body{margin:0;background:transparent}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [name, opt] of [['icon', { bg: '#0D5C4B', r: 480, font: 238 }], ['icon_foreground', { bg: null, r: 340, font: 168 }]]) {
  fs.writeFileSync(name + '.html', `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${svg(opt)}</body></html>`);
  await p.goto('file://' + process.cwd() + '/' + name + '.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  // centrage optique du mot sur sa boîte englobante réelle
  await p.evaluate(() => { const t = document.getElementById('t'); const bb = t.getBBox();
    const dx = 512 - (bb.x + bb.width/2), dy = 512 - (bb.y + bb.height/2);
    t.setAttribute('transform', `translate(${dx},${dy})`); });
  await p.screenshot({ path: name + '.png', omitBackground: true });
}
await b.close();
