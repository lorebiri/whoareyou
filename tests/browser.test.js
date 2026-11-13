/* Test nel browser (facoltativo): node tests/browser.test.js
 * Richiede Playwright con Chromium. Se Playwright non c'è, il test viene saltato (non fallisce).
 * Controlla: XSS, privacy (testo mai in URL, localStorage o richieste di rete), nessuna richiesta
 * esterna, nessun errore o violazione CSP, deep link ?q= #q= ?n=, niente scroll orizzontale a 360 px. */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var chromium;
try { chromium = require('playwright').chromium; } catch (e) {
  console.log('Playwright non installato: test nel browser saltati.');
  process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };

var server = http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  var f = path.join(ROOT, p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

var passed = 0;
var failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

var SECRET = 'SEGRETO123 <img src=x onerror="window.__xss=1"><script>window.__xss=2</script> Ciao mamma ho cambiato numero, ' +
  'fai un bonifico urgente https://poste-verifica.xyz/<b>x</b> IBAN IT60X0542811101000000123456 tel 3331234567 ' +
  'https://' + 'a'.repeat(250) + '.example.top/' + 'b'.repeat(150);

(async function main() {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var BASE = 'http://127.0.0.1:' + server.address().port + '/';
  var browser = await chromium.launch();

  async function open(url, viewport) {
    var page = await browser.newPage({ viewport: viewport || { width: 360, height: 740 }, reducedMotion: 'reduce' });
    page._reqs = [];
    page._errs = [];
    page.on('request', function (r) { page._reqs.push(r.url()); });
    page.on('pageerror', function (e) { page._errs.push(e.message); });
    page.on('console', function (m) { if (m.type() === 'error') page._errs.push(m.text()); });
    await page.goto(BASE + url);
    return page;
  }

  await test('messaggio: niente XSS, niente testo in URL/storage/rete, niente errori, niente scroll orizzontale', async function () {
    var page = await open('index.html');
    await page.fill('#testo', SECRET);
    await page.click('#analizza');
    await page.waitForSelector('.msg-report');
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(function () { return window.__xss; }), undefined, 'XSS eseguito');
    assert.strictEqual(await page.$$eval('#result img, #result script, #result a[href*="poste-verifica"]', function (a) { return a.length; }), 0);
    assert.ok(page.url().indexOf('SEGRETO') < 0, 'testo nell\'URL');
    assert.ok((await page.evaluate(function () { return JSON.stringify(localStorage); })).indexOf('SEGRETO') < 0, 'testo nel localStorage');
    assert.deepStrictEqual(page._reqs.filter(function (u) { return u.indexOf(BASE) !== 0; }), [], 'richieste esterne');
    assert.deepStrictEqual(page._reqs.filter(function (u) { return /SEGRETO/.test(decodeURIComponent(u)); }), [], 'testo nelle richieste');
    assert.ok(await page.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth; }), 'scroll orizzontale');
    var wide = await page.evaluate(function () {
      return [].slice.call(document.querySelectorAll('#result p, #result li, #result q')).filter(function (e) { return e.getBoundingClientRect().right > window.innerWidth + 1; }).length;
    });
    assert.strictEqual(wide, 0, 'elementi che escono dallo schermo');
    assert.deepStrictEqual(page._errs, []);
    await page.close();
  });

  await test('deep link ?q= e #q= analizzano e ripuliscono l\'indirizzo', async function () {
    for (var u of ['index.html?q=Ciao%20mamma%20ho%20cambiato%20numero%20salvalo', 'index.html#q=Ciao%20mamma%20ho%20cambiato%20numero%20salvalo']) {
      var page = await open(u);
      await page.waitForSelector('.msg-report');
      assert.ok(!/[?#]q=/.test(page.url()), 'URL non ripulito: ' + page.url());
      await page.close();
    }
  });

  await test('deep link ?n= apre il fascicolo e tiene ?n= nell\'URL', async function () {
    var page = await open('index.html?n=%2B393331234567');
    await page.waitForSelector('#dossier-num');
    assert.ok(/\?n=%2B393331234567/.test(page.url()));
    assert.ok((await page.textContent('#dossier-num')).indexOf('333') >= 0);
    await page.close();
  });

  await test('desktop e tema scuro senza errori', async function () {
    var ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    var page = await ctx.newPage();
    var errs = [];
    page.on('pageerror', function (e) { errs.push(e.message); });
    await page.goto(BASE + 'index.html');
    await page.click('#esempi button');
    await page.waitForSelector('.msg-report');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  });

  await browser.close();
  server.close();
  console.log('\n' + passed + ' superati, ' + failed + ' falliti');
  if (failed) process.exitCode = 1;
})().catch(function (e) { console.error(e); server.close(); process.exit(1); });
