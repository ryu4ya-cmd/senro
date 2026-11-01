// src/game.html から、GitHub Pages で配る index.html を作る。
//
// src/game.html は claude.ai のアーティファクトと同じページ（そのまま開いても遊べる）。
// ここでは、古い Android タブレット（Chrome 49 くらい）や古い iPad でも動くように
//   1) スクリプトを Babel で古い書き方に変換する
//   2) CSS の clamp() / min() / max() を古いブラウザが読めないので、その前に
//      タブレットの画面（横 1280×800 / 縦 800×1280 / 小さい横 667×375）で計算した
//      ふつうの px の値を「かわり」として書き足す（新しいブラウザは clamp() のほうを使う）
//   3) ホーム画面に追加したときのアイコンと設定を <head> に足す
// 使い方: npm install（はじめの1回だけ）→ npm run build
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = 'chrome 49, safari 10, firefox 52';

let src = fs.readFileSync(path.join(ROOT, 'src', 'game.html'), 'utf8');

// ---------- 1) スクリプト ----------
src = src.replace(/<script>([\s\S]*?)<\/script>/g, (_, code) => {
  const out = babel.transformSync(code, {
    babelrc: false, configFile: false, sourceType: 'script', compact: false, comments: true,
    presets: [['@babel/preset-env', { targets: TARGETS, bugfixes: true, modules: false }]],
  });
  return `<script>\n${out.code}\n</script>`;
});

// ---------- 2) CSS のかわりの値 ----------
const VIEWS = { land: { w: 1280, h: 800 }, port: { w: 800, h: 1280 }, small: { w: 667, h: 375 } };
function evalLen(expr, v) {
  if (/%|var\(|em\b/.test(expr)) return null;
  let js = expr
    .replace(/(-?\d*\.?\d+)vmin/g, (_, n) => `(${n}*${Math.min(v.w, v.h) / 100})`)
    .replace(/(-?\d*\.?\d+)vmax/g, (_, n) => `(${n}*${Math.max(v.w, v.h) / 100})`)
    .replace(/(-?\d*\.?\d+)vw/g, (_, n) => `(${n}*${v.w / 100})`)
    .replace(/(-?\d*\.?\d+)vh/g, (_, n) => `(${n}*${v.h / 100})`)
    .replace(/(-?\d*\.?\d+)px/g, '($1)')
    .replace(/\bcalc\(/g, '(')
    .replace(/\bclamp\(/g, 'C(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(');
  if (/[a-zA-Z]/.test(js.replace(/Math\.(min|max)|C\(/g, ''))) return null;
  try { return Function('C', `return ${js}`)((a, b, c) => Math.max(a, Math.min(b, c))); } catch (e) { return null; }
}
// 値の中の clamp()/min()/max()/calc() を、計算した px に おきかえる
function fallbackValue(value, v) {
  let out = '', i = 0;
  while (i < value.length) {
    const m = value.slice(i).match(/^(clamp|min|max|calc)\(/);
    if (m && (i === 0 || /[\s(,]/.test(value[i - 1]))) {
      let depth = 0, j = i;
      for (; j < value.length; j++) { if (value[j] === '(') depth++; else if (value[j] === ')' && --depth === 0) break; }
      const n = evalLen(value.slice(i, j + 1), v);
      if (n == null) return null;
      out += Math.round(n) + 'px'; i = j + 1;
    } else { out += value[i++]; }
  }
  return out;
}
src = src.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => {
  let res = '', i = 0, stack = [];
  // かんたんな CSS の読みとり（{ } の入れ子と、どの @media の中か を数える）
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const head = res.slice(Math.max(res.lastIndexOf('}'), res.lastIndexOf('{'), res.lastIndexOf(';')) + 1).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      stack.push(head); res += ch; i++; continue;
    }
    if (ch === '}') { stack.pop(); res += ch; i++; continue; }
    // 宣言（ルールの中で、; か } まで）
    const inRule = stack.length && !/^@/.test(stack[stack.length - 1]);
    const inKeyframes = stack.some(h => /^@(-webkit-)?keyframes/.test(h));
    if (inRule && !inKeyframes) {
      const m = css.slice(i).match(/^([\s]*)([-a-z]+)\s*:\s*([^;{}]*?)(;|(?=}))/);
      if (m && /\b(clamp|min|max)\(/.test(m[3])) {
        const media = stack.filter(h => /^@media/.test(h)).join(' ');
        const v = /max-height:\s*560px/.test(media) ? VIEWS.small : /portrait/.test(media) ? VIEWS.port : VIEWS.land;
        const fb = fallbackValue(m[3], v);
        res += m[1] + (fb ? `${m[2]}:${fb};` : '') + `${m[2]}:${m[3]}${m[4]}`;
        i += m[0].length; continue;
      }
    }
    res += ch; i++;
  }
  return `<style>${res}</style>`;
});

// ---------- 3) ホーム画面用の設定 ----------
const HEAD_EXTRA = `<meta name="description" content="スタートの えきから ゴールの えきまで、せんろを つなげて でんしゃを はしらせる、幼児向けの線路パズル">
<meta name="theme-color" content="#cdeeb4">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="せんろ">
<link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
`;
src = src.replace('<title>', HEAD_EXTRA + '<title>');

fs.writeFileSync(path.join(ROOT, 'index.html'), src);
console.log('index.html を作りました');
