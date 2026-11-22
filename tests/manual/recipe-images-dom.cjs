// Optional local UI check: npm install --no-save --package-lock=false jsdom
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { FoodImage } = loadTs('src/ui/food-first/FoodImage.tsx');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById('root'));
const render = async src => React.act(async () => root.render(React.createElement(FoodImage, { src, alt: 'Суп', retryable: true })));
(async () => {
  await render('/media/food-first/k6.webp');
  assert.ok(document.querySelector('img').src.endsWith('k6.webp'));
  await React.act(async () => document.querySelector('img').dispatchEvent(new window.Event('error')));
  assert.ok(document.querySelector('img').src.endsWith('k6.jpg'));
  await React.act(async () => document.querySelector('img').dispatchEvent(new window.Event('error')));
  assert.ok(document.querySelector('button').textContent.includes('Повторить'));
  await React.act(async () => document.querySelector('button').click());
  assert.ok(document.querySelector('img').src.endsWith('k6.webp'));
  await React.act(async () => document.querySelector('img').dispatchEvent(new window.Event('error')));
  await render('/media/food-first/k7.webp');
  assert.ok(document.querySelector('img').src.endsWith('k7.webp'), 'a different dish must reset the failure state');
  await React.act(async () => root.unmount());
  dom.window.close();
  console.log('PASS: actual FoodImage React DOM: WebP -> same-dish JPEG -> retry -> new-dish reset');
})().catch(error => { console.error(error); process.exitCode = 1; });
