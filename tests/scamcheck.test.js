/* Test del motore "È una truffa?". Esecuzione: node tests/scamcheck.test.js */
'use strict';

var assert = require('assert');
var path = require('path');
var S = require(path.join(__dirname, '..', 'assets', 'js', 'scamcheck.js'));
var W = require(path.join(__dirname, '..', 'assets', 'js', 'analyzer.js'));
var FIXTURES = require(path.join(__dirname, 'fixtures', 'messages.js'));
var I = S._internals;

var passed = 0;
var failed = 0;
var pending = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + (e && e.message));
  }
}

function testAsync(name, fn) {
  pending.push(function () {
    return Promise.resolve().then(fn).then(function () {
      passed++;
      console.log('  ok   ' + name);
    }, function (e) {
      failed++;
      console.log('  FAIL ' + name + '\n       ' + (e && e.message));
    });
  });
}

var KINDS = ['phone', 'url', 'iban', 'email', 'message', 'empty'];
var VERDICTS = ['affidabile', 'neutro', 'sospetto', 'pericoloso'];
var SEVERITIES = ['info', 'low', 'medium', 'high'];
var CONFIDENCES = ['bassa', 'media', 'alta'];

/** Verifica la forma del Report secondo CONTRACT-SCAM.md. */
function assertShape(r) {
  ['input', 'kind', 'error', 'score', 'verdict', 'verdictLabel', 'headline', 'scams', 'signals', 'advice', 'entities', 'layers']
    .forEach(function (k) { assert.ok(k in r, 'manca la chiave ' + k); });
  assert.ok(KINDS.indexOf(r.kind) >= 0, 'kind ' + r.kind);
  assert.ok(VERDICTS.indexOf(r.verdict) >= 0, 'verdict ' + r.verdict);
  assert.ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 100 && Math.round(r.score) === r.score, 'score ' + r.score);
  assert.ok(typeof r.verdictLabel === 'string' && r.verdictLabel.length > 0);
  assert.ok(typeof r.headline === 'string' && r.headline.length > 0, 'headline vuoto');
  assert.ok(Array.isArray(r.scams) && Array.isArray(r.signals) && Array.isArray(r.advice) && Array.isArray(r.layers));
  r.scams.forEach(function (s) {
    assert.ok(s.id && s.label && s.explanation, 'scam incompleto');
    assert.ok(CONFIDENCES.indexOf(s.confidence) >= 0, 'confidence ' + s.confidence);
  });
  r.signals.forEach(function (s) {
    assert.ok(s.id && s.label && typeof s.detail === 'string', 'segnale incompleto ' + JSON.stringify(s));
    assert.strictEqual(typeof s.impact, 'number');
    assert.ok(SEVERITIES.indexOf(s.severity) >= 0);
    if ('evidence' in s) assert.strictEqual(typeof s.evidence, 'string');
  });
  ['phones', 'urls', 'ibans', 'emails'].forEach(function (k) { assert.ok(Array.isArray(r.entities[k]), 'entities.' + k); });
  r.entities.urls.forEach(function (u) {
    assert.ok(typeof u.raw === 'string' && Array.isArray(u.signals));
    assert.ok(['basso', 'medio', 'alto'].indexOf(u.risk) >= 0);
  });
  r.entities.ibans.forEach(function (b) {
    assert.ok(typeof b.normalized === 'string' && typeof b.validChecksum === 'boolean' && Array.isArray(b.signals));
  });
  r.entities.emails.forEach(function (e) { assert.ok(typeof e.domain === 'string' && Array.isArray(e.signals)); });
  r.entities.phones.forEach(function (p) { assert.ok(typeof p.raw === 'string' && p.result && typeof p.result.verdict === 'string'); });
  assert.strictEqual(r.layers[0].id, 'regole');
  r.layers.forEach(function (l) { assert.ok(['ok', 'error', 'skipped'].indexOf(l.status) >= 0); });
  r.advice.forEach(function (a) { assert.ok(typeof a === 'string' && a.length > 10); });
}

function ids(list) { return list.map(function (x) { return x.id; }); }

/* ======================================================================
 * 1. Fixture di messaggi realistici
 * ====================================================================== */
console.log('\nFixture (' + FIXTURES.length + ' messaggi)');
var fp = [];
var fn = [];
var scamCount = 0;
var legitCount = 0;
var seenIds = {};
FIXTURES.forEach(function (f) {
  var legit = f.expect.verdictIn.every(function (v) { return v === 'neutro' || v === 'affidabile'; });
  var scam = f.expect.verdictIn.every(function (v) { return v === 'sospetto' || v === 'pericoloso'; });
  if (legit) legitCount++;
  if (scam) scamCount++;
  test('fixture ' + f.id, function () {
    assert.ok(!seenIds[f.id], 'id duplicato');
    seenIds[f.id] = 1;
    var r = S.analyzeText(f.text);
    assertShape(r);
    var got = ids(r.scams);
    var info = ' [score ' + r.score + ', ' + r.verdict + ', copioni: ' + (got.join(',') || '-') + ', segnali: ' + r.signals.map(function (s) { return s.id + '(' + s.impact + ')'; }).join(' ') + ']';
    var flagged = r.verdict === 'sospetto' || r.verdict === 'pericoloso';
    if (legit && flagged) fp.push(f.id);
    if (scam && !flagged) fn.push(f.id);
    if (f.expect.verdictIn.indexOf(r.verdict) < 0) {
      assert.fail('verdetto ' + r.verdict + ' non tra ' + f.expect.verdictIn.join('/') + info);
    }
    (f.expect.scams || []).forEach(function (id) { assert.ok(got.indexOf(id) >= 0, 'manca il copione ' + id + info); });
    (f.expect.notScams || []).forEach(function (id) { assert.ok(got.indexOf(id) < 0, 'copione non atteso ' + id + info); });
    if (scam) {
      assert.ok(r.signals.some(function (s) { return s.impact < 0 && s.evidence; }), 'nessun segnale negativo con evidenza' + info);
    }
  });
});
test('fixture: almeno 60 messaggi, di cui almeno 25 legittimi', function () {
  assert.ok(FIXTURES.length >= 60, 'solo ' + FIXTURES.length);
  assert.ok(legitCount >= 25, 'solo ' + legitCount + ' legittimi');
});

/* ======================================================================
 * 2. Estrattori
 * ====================================================================== */
console.log('\nEstrattori');

test('IBAN: checksum mod-97 su esempi noti', function () {
  assert.strictEqual(I.ibanChecksumOk('IT60X0542811101000000123456'), true);
  assert.strictEqual(I.ibanChecksumOk('IT60 X054 2811 1010 0000 0123 456'), true);
  assert.strictEqual(I.ibanChecksumOk('LT121000011101001000'), true);
  assert.strictEqual(I.ibanChecksumOk('ES9121000418450200051332'), true);
  assert.strictEqual(I.ibanChecksumOk('GB82WEST12345698765432'), true);
  assert.strictEqual(I.ibanChecksumOk('IT60X0542811101000000123457'), false);
  assert.strictEqual(I.ibanChecksumOk('IT61X0542811101000000123456'), false);
  assert.strictEqual(I.ibanChecksumOk('ciao'), false);
});

test('IBAN: estrazione con spazi senza mangiare le parole successive', function () {
  var r = I.extractIbans('Fai il bonifico su IT60 X054 2811 1010 0000 0123 456 entro domani, grazie').items;
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].normalized, 'IT60X0542811101000000123456');
});

test('IBAN estero in messaggio "italiano" -> iban_foreign_mismatch', function () {
  var r = S.analyzeText('Poste Italiane: per sbloccare il conto effettua un bonifico su LT121000011101001000');
  assert.strictEqual(r.entities.ibans.length, 1);
  assert.strictEqual(r.entities.ibans[0].country, 'LT');
  assert.ok(r.entities.ibans[0].validChecksum);
  assert.ok(ids(r.entities.ibans[0].signals).indexOf('iban_foreign_mismatch') >= 0);
});

test('IBAN estero senza contesto -> solo segnale lieve', function () {
  var r = S.analyzeText('ES91 2100 0418 4502 0005 1332');
  assert.strictEqual(r.kind, 'iban');
  assert.ok(ids(r.signals).indexOf('iban_foreign') >= 0);
  assert.strictEqual(r.verdict, 'neutro');
});

test('URL: con schema, www, dominio nudo, disinnescato', function () {
  var raws = I.extractUrls('Vai su https://a.example.top/x, poi www.poste-sicura.info e poste-verifica.com/login oppure hxxp://evil[.]xyz/p').items.map(function (x) { return x.raw; });
  assert.deepStrictEqual(raws, ['https://a.example.top/x', 'www.poste-sicura.info', 'poste-verifica.com/login', 'hxxp://evil[.]xyz/p']);
  var p = I.parseUrl('hxxps://intesa-sicurezza[.]com/login?x=1');
  assert.strictEqual(p.scheme, 'https');
  assert.strictEqual(p.host, 'intesa-sicurezza.com');
  assert.strictEqual(p.path, '/login?x=1');
  assert.strictEqual(p.obfuscated, true);
});

test('URL: parole con punto e abbreviazioni non sono link', function () {
  var raws = I.extractUrls('Ciao.come stai? Sig.ra Rossi, ecc. arrivato.si lo so. Totale 1.234,56 € il 13.11.2026').items;
  assert.strictEqual(raws.length, 0, JSON.stringify(raws));
});

test('URL: le email non generano link fantasma', function () {
  var r = S.analyzeText('Scrivi a assistenza@poste-aiuto.com per info');
  assert.strictEqual(r.entities.urls.length, 0);
  assert.strictEqual(r.entities.emails.length, 1);
  assert.strictEqual(r.entities.emails[0].domain, 'poste-aiuto.com');
});

test('URL: @ nel link, IP, porta, punycode', function () {
  var u = I.parseUrl('https://www.poste.it@10.0.0.1:8080/a');
  assert.strictEqual(u.userinfo, 'www.poste.it');
  assert.strictEqual(u.host, '10.0.0.1');
  assert.strictEqual(u.port, '8080');
  var a = I.analyzeUrl('https://www.poste.it@10.0.0.1:8080/a');
  assert.ok(ids(a.signals).indexOf('url_at_sign') >= 0 && ids(a.signals).indexOf('url_ip_host') >= 0);
  assert.strictEqual(a.risk, 'alto');
  assert.strictEqual(I.punycodeDecode('xn--pste-55d'), 'pоste');
});

test('Telefoni: numeri italiani e internazionali nel testo', function () {
  var p = I.extractPhones('Chiamami al 333 000 1234 oppure allo 06 0000 1234 o su +44 7700 900123', 'IT');
  assert.deepStrictEqual(p.map(function (x) { return x.result.e164; }), ['+393330001234', '+390600001234', '+447700900123']);
});

test('Telefoni: niente falsi positivi su importi, date, codici, IBAN', function () {
  var text = 'Importo € 1.234,56 del 13/11/2026 alle 10:30. Codice OTP: 482913. Ordine n. 3330001234. ' +
    'Tracking 0451238. IBAN IT60 X054 2811 1010 0000 0123 456. Totale 12.345.678 euro. Anni 2024-2025. Tel. ok';
  var r = S.analyzeText(text);
  assert.strictEqual(r.entities.phones.length, 0, JSON.stringify(r.entities.phones.map(function (x) { return x.raw; })));
  assert.strictEqual(r.entities.ibans.length, 1);
});

test('Telefoni: numero subito dopo "chiama" anche con punti', function () {
  var p = I.extractPhones('per info chiama il 333.000.1234', 'IT');
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].result.e164, '+393330001234');
});

test('Classificazione dell\'input', function () {
  assert.strictEqual(I.classifyInput(''), 'empty');
  assert.strictEqual(I.classifyInput('   '), 'empty');
  assert.strictEqual(I.classifyInput('+39 333 000 1234'), 'phone');
  assert.strictEqual(I.classifyInput('tel:+390600001234'), 'phone');
  assert.strictEqual(I.classifyInput('https://poste.it'), 'url');
  assert.strictEqual(I.classifyInput('poste-verifica.com/x'), 'url');
  assert.strictEqual(I.classifyInput('IT60 X054 2811 1010 0000 0123 456'), 'iban');
  assert.strictEqual(I.classifyInput('mario@example.com'), 'email');
  assert.strictEqual(I.classifyInput('ciao come stai'), 'message');
});

/* ======================================================================
 * 3. Sosia dei marchi
 * ====================================================================== */
console.log('\nSosia dei marchi');

test('Domini ufficiali mai segnalati', function () {
  ['poste.it', 'www.poste.it', 'posteitaliane.it', 'inps.it', 'servizi2.inps.it', 'agenziaentrate.gov.it',
    'infoprecompilata.agenziaentrate.gov.it', 'intesasanpaolo.com', 'unicredit.it', 'amazon.it', 'www.amazon.com',
    'paypal.com', 'netflix.com', 'mybrt.it', 'gls-italy.com', 'telepass.com', 'autostrade.it', 'pagopa.gov.it', 'tim.it',
    'windtre.it', 'iliad.it', 'enel.it', 'apple.com', 'checkout.pagopa.it', 'amzn.to'].forEach(function (h) {
    assert.strictEqual(I.checkBrandLookalike(h), null, h + ' segnalato per errore');
    var a = I.analyzeUrl('https://' + h + '/');
    assert.ok(a.official, h + ' non riconosciuto come ufficiale');
    assert.strictEqual(a.risk, 'basso', h);
  });
});

test('Sosia riconosciuti (sottodominio, parole extra, refusi, omoglifi)', function () {
  var cases = {
    'poste.it.verifica-conto.com': ['poste', 'subdomain'],
    'poste-it-verifica.com': ['poste', 'combo'],
    'inpsrimborso.com': ['inps', 'combo'],
    'intesasanpaolo.sicurezza-clienti.com': ['intesa', 'subdomain'],
    'unicredlt.it': ['unicredit', 'homoglyph'],
    'unicreditt.it': ['unicredit', 'typo'],
    'amazom.it': ['amazon', 'typo'],
    'amaz0n-consegna.shop': ['amazon', 'homoglyph'],
    'paypa1.com': ['paypal', 'homoglyph'],
    'xn--pste-55d.it': ['poste', 'homoglyph'],
    'netflixitalia.com': ['netflix', 'combo'],
    'telepas.com': ['telepass', 'typo'],
    'agenziaentrate-gov.com': ['agenziaentrate', 'combo']
  };
  Object.keys(cases).forEach(function (h) {
    var l = I.checkBrandLookalike(h);
    assert.ok(l, h + ' non riconosciuto');
    assert.strictEqual(l.brand.id, cases[h][0], h + ' -> ' + l.brand.id);
    assert.strictEqual(l.how, cases[h][1], h + ' -> ' + l.how);
  });
});

test('Nessun sosia per domini innocui che contengono parole simili', function () {
  ['timeout.com', 'posteggiomilano.it', 'blue-sky.com', 'ilpost.it', 'ingegneria.it', 'mieposte.org', 'upsidedown.com',
    'subitoinforma.it', 'brtoscana.it', 'inpsicologia.it', 'amazonia-viaggi.it'].forEach(function (h) {
    var l = I.checkBrandLookalike(h);
    assert.strictEqual(l, null, h + ' segnalato come ' + (l && l.brand.id + '/' + l.how));
  });
});

test('Accorciatori e TLD sospetti', function () {
  var a = I.analyzeUrl('https://bit.ly/abc');
  assert.ok(ids(a.signals).indexOf('url_shortener') >= 0);
  assert.strictEqual(a.risk, 'medio');
  var b = I.analyzeUrl('https://consegne-rapide.top/x');
  assert.ok(ids(b.signals).indexOf('url_suspicious_tld') >= 0);
  var c = I.analyzeUrl('http://esempio-negozio.it/');
  assert.strictEqual(c.risk, 'basso');
});

test('editDistance e skeleton', function () {
  assert.strictEqual(I.editDistance('poste', 'poste'), 0);
  assert.strictEqual(I.editDistance('poste', 'psote'), 1);
  assert.strictEqual(I.editDistance('unicredit', 'unicredlt'), 1);
  assert.strictEqual(I.skeleton('arnaz0n'), I.skeleton('amazon'));
  assert.strictEqual(I.skeleton('paypa1'), I.skeleton('paypal'));
});

/* ======================================================================
 * 4. Parità con WhoAreYou per gli input "solo numero"
 * ====================================================================== */
console.log('\nParità con WhoAreYou');

['333 000 1234', '+39 06 0000 1234', '+370 600 00123', '893 123', '800 123 456', '+44 7700 900123', 'anonimo', '12', '00216 20 000 123']
  .forEach(function (n) {
    test('numero "' + n + '"', function () {
      var r = S.analyzeText(n);
      var w = W.analyze(n, { defaultCountry: 'IT' });
      assertShape(r);
      assert.strictEqual(r.kind, 'phone');
      assert.strictEqual(r.score, w.score);
      assert.strictEqual(r.verdict, w.verdict);
      assert.deepStrictEqual(r.advice, w.advice);
      assert.strictEqual(r.error, w.error);
      assert.strictEqual(r.entities.phones.length, 1);
      assert.deepStrictEqual(r.entities.phones[0].result, w);
    });
  });

test('numero premium in un messaggio alza il rischio', function () {
  var r = S.analyzeText('Richiama il 899 000 123');
  assert.strictEqual(r.kind, 'message');
  assert.ok(ids(r.signals).indexOf('phone_risky') >= 0);
});

/* ======================================================================
 * 5. Report: casi limite
 * ====================================================================== */
console.log('\nCasi limite');

test('input vuoto', function () {
  var r = S.analyzeText('');
  assertShape(r);
  assert.strictEqual(r.kind, 'empty');
  assert.ok(r.error);
  assert.strictEqual(r.layers[0].status, 'skipped');
});

test('messaggio senza segnali: neutro, mai affidabile, headline prudente', function () {
  var r = S.analyzeText('Ci vediamo domani in ufficio alle nove');
  assert.strictEqual(r.verdict, 'neutro');
  assert.ok(/garantire|prudente/i.test(r.headline), r.headline);
  var r2 = S.analyzeText('Leggi qui https://www.poste.it e https://www.inps.it');
  assert.notStrictEqual(r2.verdict, 'affidabile');
});

test('copione forte + link pericoloso = pericoloso con evidenza testuale', function () {
  var r = S.analyzeText('BRT: pacco in giacenza, paga 1,99 € di spese di sdoganamento su brt-pagamenti.top');
  assert.strictEqual(r.verdict, 'pericoloso');
  var s = r.signals.filter(function (x) { return x.id === 'scam_finto_corriere'; })[0];
  assert.ok(s && s.evidence && /giacenza|sdoganamento/i.test(s.evidence), JSON.stringify(s));
});

test('robustezza: input strani non lanciano eccezioni', function () {
  [null, undefined, 123, '🙂🙂🙂', 'a'.repeat(20000), '((((((', 'http://', 'xn--', '@@@', 'IT00', '+', '\u0000\u0001'].forEach(function (x) {
    var r = S.analyzeText(x);
    assertShape(r);
  });
});

test('normalizzazione: accenti, maiuscole, leetspeak, omoglifi', function () {
  var N = I.normalizeText('È URGENTE: P0STE ti scrive. Pоste');
  assert.strictEqual(N.s, 'e urgente: poste ti scrive. poste');
});

/* ======================================================================
 * 6. Livelli aggiuntivi (registerLayer)
 * ====================================================================== */
console.log('\nLivelli aggiuntivi');

testAsync('analyze senza livelli = analyzeText', function () {
  I.clearLayers();
  var t = 'Poste: pacco in giacenza, paga 1,99 € su poste-pacchi.top';
  return S.analyze(t).then(function (r) {
    assertShape(r);
    var s = S.analyzeText(t);
    assert.strictEqual(r.score, s.score);
    assert.strictEqual(r.layers.length, 1);
  });
});

testAsync('livello che funziona + livello che fallisce + livello lento', function () {
  I.clearLayers();
  S.registerLayer({
    id: 'mock', label: 'Livello di prova',
    run: function (text, report) {
      assert.strictEqual(typeof text, 'string');
      assert.strictEqual(report.kind, 'message');
      return Promise.resolve({ signals: [{ id: 'mock_sig', label: 'Prova', detail: 'dal livello', impact: -5, severity: 'low' }], scoreAdjust: -20, summary: 'Analisi di prova completata.' });
    }
  });
  S.registerLayer({ id: 'rotto', label: 'Livello rotto', run: function () { throw new Error('boom'); } });
  S.registerLayer({ id: 'lento', label: 'Livello lento', run: function () { return new Promise(function () {}); } });
  S.registerLayer({ id: 'vuoto', label: 'Livello senza risposta', run: function () { return Promise.resolve(null); } });
  var t = 'Ci vediamo domani in ufficio alle nove';
  var base = S.analyzeText(t);
  return S.analyze(t, { layerTimeoutMs: 50 }).then(function (r) {
    assertShape(r);
    var st = {};
    r.layers.forEach(function (l) { st[l.id] = l; });
    assert.strictEqual(st.regole.status, 'ok');
    assert.strictEqual(st.mock.status, 'ok');
    assert.strictEqual(st.mock.summary, 'Analisi di prova completata.');
    assert.strictEqual(st.rotto.status, 'error');
    assert.strictEqual(st.lento.status, 'error');
    assert.ok(/tempo/i.test(st.lento.summary));
    assert.strictEqual(st.vuoto.status, 'skipped');
    assert.strictEqual(r.score, base.score - 20);
    assert.strictEqual(r.verdict, 'sospetto');
    var ms = r.signals.filter(function (s) { return s.id === 'mock_sig'; })[0];
    assert.ok(ms && ms.layer === 'mock');
    I.clearLayers();
  });
});

testAsync('livello registrato due volte viene sostituito; registerLayer valida i parametri', function () {
  I.clearLayers();
  S.registerLayer({ id: 'x', label: 'A', run: function () { return Promise.resolve(null); } });
  S.registerLayer({ id: 'x', label: 'B', run: function () { return Promise.resolve(null); } });
  assert.deepStrictEqual(I.listLayers(), ['x']);
  assert.throws(function () { S.registerLayer({ id: 'y' }); });
  I.clearLayers();
  return Promise.resolve();
});

testAsync('analyze su input vuoto: livelli "skipped"', function () {
  I.clearLayers();
  var called = false;
  S.registerLayer({ id: 'z', label: 'Z', run: function () { called = true; return Promise.resolve({}); } });
  return S.analyze('').then(function (r) {
    assert.strictEqual(called, false);
    assert.strictEqual(r.layers[1].status, 'skipped');
    I.clearLayers();
  });
});

/* ======================================================================
 * Riepilogo
 * ====================================================================== */
pending.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
  console.log('\nFixture: ' + FIXTURES.length + ' (' + scamCount + ' truffe, ' + legitCount + ' legittimi)');
  console.log('Falsi positivi (legittimi segnalati sospetti/pericolosi): ' + fp.length + (fp.length ? ' -> ' + fp.join(', ') : ''));
  console.log('Falsi negativi (truffe valutate neutre/affidabili): ' + fn.length + (fn.length ? ' -> ' + fn.join(', ') : ''));
  console.log('\n' + passed + ' superati, ' + failed + ' falliti');
  if (failed) process.exitCode = 1;
});
