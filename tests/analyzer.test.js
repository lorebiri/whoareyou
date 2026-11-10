/* Test del motore di analisi. Esecuzione: node tests/analyzer.test.js */
'use strict';

var assert = require('assert');
var path = require('path');
var W = require(path.join(__dirname, '..', 'assets', 'js', 'analyzer.js'));

var passed = 0;
var failed = 0;

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

function hasSignal(r, id) {
  return r.signals.some(function (s) { return s.id === id; });
}

function lookup(r, id) {
  return r.lookups.filter(function (l) { return l.id === id; })[0];
}

var RESULT_KEYS = ['input', 'normalized', 'valid', 'error', 'e164', 'national', 'international', 'country',
  'lineType', 'lineTypeLabel', 'area', 'operatorHint', 'score', 'verdict', 'verdictLabel', 'signals', 'advice', 'lookups'];
var LINE_TYPES = ['mobile', 'landline', 'toll_free', 'premium', 'shared_cost', 'voip', 'm2m', 'short', 'unknown'];
var VERDICTS = ['affidabile', 'neutro', 'sospetto', 'pericoloso'];
var SEVERITIES = ['info', 'low', 'medium', 'high'];
var CATEGORIES = ['motori', 'spam', 'social', 'messaggistica', 'ufficiali'];

/** Verifica la forma del Result secondo CONTRACT.md. */
function assertShape(r) {
  RESULT_KEYS.forEach(function (k) { assert.ok(k in r, 'manca la chiave ' + k); });
  assert.strictEqual(typeof r.valid, 'boolean');
  assert.ok(LINE_TYPES.indexOf(r.lineType) >= 0, 'lineType non previsto: ' + r.lineType);
  assert.ok(VERDICTS.indexOf(r.verdict) >= 0, 'verdict non previsto: ' + r.verdict);
  assert.ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 100 && Math.round(r.score) === r.score);
  assert.ok(typeof r.verdictLabel === 'string' && r.verdictLabel.length > 0);
  assert.ok(typeof r.lineTypeLabel === 'string' && r.lineTypeLabel.length > 0);
  assert.ok(Array.isArray(r.signals) && Array.isArray(r.advice) && Array.isArray(r.lookups));
  r.signals.forEach(function (s) {
    assert.ok(s.id && s.label && s.detail, 'segnale incompleto');
    assert.strictEqual(typeof s.impact, 'number');
    assert.ok(SEVERITIES.indexOf(s.severity) >= 0);
  });
  r.lookups.forEach(function (l) {
    assert.ok(l.id && l.label && l.description, 'lookup incompleto');
    assert.ok(CATEGORIES.indexOf(l.category) >= 0, 'categoria non prevista: ' + l.category);
    assert.ok(/^https:\/\//.test(l.url), 'URL non https: ' + l.url);
    assert.ok(!/[\s"]/.test(l.url), 'URL con spazi o virgolette non codificati: ' + l.url);
  });
  if (r.country) {
    ['code', 'name', 'flag', 'dialCode'].forEach(function (k) { assert.ok(r.country[k], 'country.' + k); });
  }
  if (r.e164) assert.ok(/^\+\d{4,15}$/.test(r.e164), 'e164 malformato: ' + r.e164);
}

console.log('WhoAreYou analyzer v' + W.version);

// ---------------------------------------------------------------- API
test('espone analyze e version', function () {
  assert.strictEqual(typeof W.analyze, 'function');
  assert.ok(/^\d+\.\d+\.\d+$/.test(W.version));
});

// ---------------------------------------------------------------- Cellulari italiani
test('cellulare italiano con spazi', function () {
  var r = W.analyze('333 482 9173');
  assertShape(r);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.e164, '+393334829173');
  assert.strictEqual(r.normalized, '+393334829173');
  assert.strictEqual(r.national, '333 482 9173');
  assert.strictEqual(r.international, '+39 333 482 9173');
  assert.deepStrictEqual(r.country, { code: 'IT', name: 'Italia', flag: '🇮🇹', dialCode: '39' });
  assert.strictEqual(r.lineType, 'mobile');
  assert.strictEqual(r.lineTypeLabel, 'Cellulare');
  assert.ok(/TIM/.test(r.operatorHint) && /portabilit/.test(r.operatorHint));
  assert.ok(hasSignal(r, 'it_mobile'));
  assert.strictEqual(r.verdict, 'neutro');
});

test('esempio del contratto 333 123 4567', function () {
  var r = W.analyze('333 123 4567');
  assert.strictEqual(r.e164, '+393331234567');
  assert.strictEqual(r.national, '333 123 4567');
  assert.strictEqual(r.international, '+39 333 123 4567');
  assert.ok(hasSignal(r, 'pattern_sequence'));
});

test('operatori mobili per prefisso', function () {
  assert.ok(/Vodafone/.test(W.analyze('347 5551234').operatorHint));
  assert.ok(/WindTre/.test(W.analyze('328 5551234').operatorHint));
  assert.ok(/3 Italia/.test(W.analyze('393 5551234').operatorHint));
  assert.ok(/Iliad/.test(W.analyze('351 5551234').operatorHint));
});

test('prefisso 0039 e +39 equivalenti', function () {
  var a = W.analyze('0039 347 555 1234');
  var b = W.analyze('+39 347-555-1234');
  var c = W.analyze('tel:+393475551234');
  assert.strictEqual(a.e164, '+393475551234');
  assert.strictEqual(b.e164, a.e164);
  assert.strictEqual(c.e164, a.e164);
});

test('39 senza + per cellulare (copiato da WhatsApp)', function () {
  var r = W.analyze('393475551234');
  assert.strictEqual(r.e164, '+393475551234');
  assert.ok(hasSignal(r, 'assumed_prefix'));
  // Un cellulare 393 a 10 cifre resta un numero nazionale
  assert.strictEqual(W.analyze('3934829173').e164, '+393934829173');
});

test('cellulare troppo corto non valido', function () {
  var r = W.analyze('333 12345');
  assertShape(r);
  assert.strictEqual(r.valid, false);
  assert.ok(hasSignal(r, 'invalid_length'));
  assert.ok(r.verdict === 'sospetto' || r.verdict === 'pericoloso');
});

test('SIM M2M a 13 cifre', function () {
  var r = W.analyze('3391234567890');
  assert.strictEqual(r.lineType, 'm2m');
  assert.strictEqual(r.valid, true);
});

// ---------------------------------------------------------------- Fissi italiani
test('fisso di Roma', function () {
  var r = W.analyze('+39 06 4829 1735');
  assertShape(r);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.lineType, 'landline');
  assert.strictEqual(r.area, 'Roma (06)');
  assert.strictEqual(r.e164, '+390648291735');
  assert.strictEqual(r.national, '06 4829 1735');
  assert.strictEqual(r.international, '+39 06 4829 1735');
  assert.ok(hasSignal(r, 'telemarketing_landline'));
  assert.strictEqual(r.verdict, 'neutro');
});

test('fisso di Milano con parentesi', function () {
  var r = W.analyze('(02) 8457-3921');
  assert.strictEqual(r.area, 'Milano (02)');
  assert.strictEqual(r.e164, '+390284573921');
  assert.strictEqual(r.national, '02 8457 3921');
});

test('prefissi distrettuali principali', function () {
  var cases = { '011 5551234': 'Torino', '081 5551234': 'Napoli', '055 5551234': 'Firenze', '051 5551234': 'Bologna',
    '010 5551234': 'Genova', '091 5551234': 'Palermo', '041 5551234': 'Venezia', '070 5551234': 'Cagliari',
    '080 5551234': 'Bari', '095 5551234': 'Catania', '0471 555123': 'Bolzano', '0984 555123': 'Cosenza' };
  Object.keys(cases).forEach(function (n) {
    var r = W.analyze(n);
    assert.ok(r.area && r.area.indexOf(cases[n]) === 0, n + ' -> ' + r.area);
    assert.strictEqual(r.lineType, 'landline');
  });
});

test('fisso senza 0 iniziale è segnalato', function () {
  var r = W.analyze('64829173');
  assert.strictEqual(r.valid, false);
  assert.ok(/manca lo 0/.test(r.signals[0].detail));
});

// ---------------------------------------------------------------- Numeri speciali italiani
test('numero verde 800', function () {
  var r = W.analyze('800 123 456');
  assertShape(r);
  assert.strictEqual(r.lineType, 'toll_free');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.national, '800 123 456');
  assert.ok(hasSignal(r, 'toll_free'));
});

test('numero istituzionale noto (Agenzia Entrate)', function () {
  var r = W.analyze('800 90 96 96');
  assert.ok(hasSignal(r, 'institutional'));
  assert.strictEqual(r.verdict, 'affidabile');
  assert.ok(r.advice.some(function (a) { return /spoofing/.test(a); }));
});

test('INPS 803164', function () {
  var r = W.analyze('803164');
  assert.strictEqual(r.lineType, 'toll_free');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.verdict, 'affidabile');
});

test('numero a pagamento 899', function () {
  var r = W.analyze('899 123 456');
  assertShape(r);
  assert.strictEqual(r.lineType, 'premium');
  assert.ok(hasSignal(r, 'premium_rate'));
  assert.strictEqual(r.verdict, 'pericoloso');
  assert.ok(r.advice.some(function (a) { return /Non richiamare/.test(a); }));
});

test('costo ripartito 848', function () {
  var r = W.analyze('848 123 456');
  assert.strictEqual(r.lineType, 'shared_cost');
});

test('VoIP 55', function () {
  var r = W.analyze('55 1234 5678');
  assert.strictEqual(r.lineType, 'voip');
});

test('emergenza 112', function () {
  var r = W.analyze('112');
  assertShape(r);
  assert.strictEqual(r.lineType, 'short');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.e164, null);
  assert.strictEqual(r.normalized, '112');
  assert.ok(hasSignal(r, 'emergency'));
  assert.strictEqual(r.verdict, 'affidabile');
  assert.strictEqual(W.analyze('+39 113').lineType, 'short');
});

// ---------------------------------------------------------------- Esteri
test('Tunisia +216 (wangiri)', function () {
  var r = W.analyze('+216 22 845 913');
  assertShape(r);
  assert.strictEqual(r.country.code, 'TN');
  assert.strictEqual(r.country.dialCode, '216');
  assert.strictEqual(r.country.flag, '🇹🇳');
  assert.ok(hasSignal(r, 'wangiri_country'));
  assert.ok(hasSignal(r, 'callcenter_country'));
  assert.strictEqual(r.verdict, 'pericoloso');
  assert.ok(r.advice.some(function (a) { return /wangiri/.test(a); }));
});

test('Giamaica +1 876 (NANP caraibico)', function () {
  var r = W.analyze('+1 (876) 555-0142');
  assertShape(r);
  assert.strictEqual(r.country.code, 'JM');
  assert.strictEqual(r.country.dialCode, '1');
  assert.strictEqual(r.e164, '+18765550142');
  assert.strictEqual(r.international, '+1 876 555 0142');
  assert.ok(hasSignal(r, 'wangiri_country'));
  assert.ok(r.verdict === 'pericoloso' || r.verdict === 'sospetto');
});

test('Repubblica Dominicana +1 809', function () {
  assert.strictEqual(W.analyze('+18095550142').country.code, 'DO');
});

test('Stati Uniti +1', function () {
  var r = W.analyze('+1 212 555 0198');
  assertShape(r);
  assert.strictEqual(r.country.code, 'US');
  assert.strictEqual(r.national, '(212) 555-0198');
  assert.ok(hasSignal(r, 'foreign_number'));
  assert.ok(!hasSignal(r, 'wangiri_country'));
  assert.strictEqual(r.verdict, 'neutro');
  assert.strictEqual(W.analyze('+1 416 555 0199').country.code, 'CA');
  assert.strictEqual(W.analyze('+1 800 555 0199').lineType, 'toll_free');
});

test('Regno Unito cellulare +44', function () {
  var r = W.analyze('+44 7911 123456');
  assertShape(r);
  assert.strictEqual(r.country.code, 'GB');
  assert.strictEqual(r.lineType, 'mobile');
  assert.strictEqual(r.e164, '+447911123456');
  assert.strictEqual(r.international, '+44 7911 123456');
  assert.strictEqual(r.national, '07911 123456');
});

test('Albania: call center', function () {
  var r = W.analyze('+355 69 482 7731');
  assert.strictEqual(r.country.code, 'AL');
  assert.ok(hasSignal(r, 'callcenter_country'));
  assert.strictEqual(r.verdict, 'sospetto');
});

test('rete satellitare +881', function () {
  var r = W.analyze('+881 6 1234 5678');
  assertShape(r);
  assert.ok(hasSignal(r, 'satellite_network'));
  assert.strictEqual(r.verdict, 'pericoloso');
});

test('Kazakistan +7 7xx vs Russia', function () {
  assert.strictEqual(W.analyze('+7 701 482 9173').country.code, 'KZ');
  assert.strictEqual(W.analyze('+7 916 482 9173').country.code, 'RU');
});

test('tabella paesi ampia', function () {
  var codes = ['+33 1 4829 1735', '+49 30 48291735', '+34 912 482 917', '+41 44 482 91 73', '+86 10 4829 1735',
    '+91 98482 91735', '+55 11 94829 1735', '+61 2 4829 1735', '+81 3 4829 1735', '+373 22 482 917',
    '+232 76 482 917', '+225 07 4829 1735', '+269 348 2917', '+239 991 2345', '+682 21234', '+383 44 482 917'];
  codes.forEach(function (n) {
    var r = W.analyze(n);
    assert.ok(r.country && r.country.code !== 'IT', n);
    assert.ok(r.country.flag && r.country.name, n);
  });
});

// ---------------------------------------------------------------- Input non validi
test('input vuoto', function () {
  var r = W.analyze('');
  assertShape(r);
  assert.ok(r.error);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.e164, null);
  assert.deepStrictEqual(r.lookups, []);
  assert.ok(W.analyze(null).error);
  assert.ok(W.analyze(undefined).error);
  assert.ok(W.analyze('   ').error);
});

test('testo senza senso', function () {
  var r = W.analyze('ciao come stai');
  assertShape(r);
  assert.ok(r.error);
  assert.strictEqual(r.valid, false);
  assert.ok(W.analyze('---').error);
  assert.ok(/nascosto/.test(W.analyze('Sconosciuto').error));
});

test('prefisso internazionale impossibile (+0...)', function () {
  var r = W.analyze('+0012345678');
  assertShape(r);
  assert.strictEqual(r.valid, false);
  assert.ok(hasSignal(r, 'spoofing_hint'));
});

test('cifre tutte uguali', function () {
  var r = W.analyze('333 777 7777');
  assert.ok(hasSignal(r, 'pattern_same_digits'));
});

// ---------------------------------------------------------------- Verdetti
test('soglie dei verdetti', function () {
  var cases = [['112', 'affidabile'], ['333 482 9173', 'neutro'], ['+355 69 482 7731', 'sospetto'], ['899 123 456', 'pericoloso']];
  cases.forEach(function (c) {
    var r = W.analyze(c[0]);
    assert.strictEqual(r.verdict, c[1], c[0] + ' score ' + r.score);
    var expected = r.score >= 70 ? 'affidabile' : r.score >= 45 ? 'neutro' : r.score >= 25 ? 'sospetto' : 'pericoloso';
    assert.strictEqual(r.verdict, expected);
  });
});

test('punteggio = 60 + somma impatti (limitato 0..100)', function () {
  ['333 482 9173', '+216 22 845 913', '06 4829 1735', '800 123 456'].forEach(function (n) {
    var r = W.analyze(n);
    var sum = r.signals.reduce(function (a, s) { return a + s.impact; }, 60);
    assert.strictEqual(r.score, Math.max(0, Math.min(100, sum)));
  });
});

// ---------------------------------------------------------------- Consigli e link
test('consigli presenti e in italiano', function () {
  var r = W.analyze('+216 22 845 913');
  assert.ok(r.advice.length >= 3);
  assert.ok(r.advice.some(function (a) { return /OTP/.test(a); }));
  assert.ok(r.advice.some(function (a) { return /commissariatodips\.it/.test(a); }));
  var t = W.analyze('02 8457 3921');
  assert.ok(t.advice.some(function (a) { return /registropubblicodelleopposizioni\.it/.test(a); }));
});

test('lookups presenti in tutte le categorie', function () {
  var r = W.analyze('333 482 9173');
  CATEGORIES.forEach(function (c) {
    assert.ok(r.lookups.some(function (l) { return l.category === c; }), 'manca categoria ' + c);
  });
  var ids = r.lookups.map(function (l) { return l.id; });
  assert.strictEqual(new Set(ids).size, ids.length, 'id duplicati');
});

test('lookups correttamente codificati', function () {
  var r = W.analyze('333 482 9173');
  var g = lookup(r, 'google');
  assert.ok(g.url.indexOf('https://www.google.com/search?q=') === 0);
  var q = decodeURIComponent(g.url.split('?q=')[1]);
  assert.ok(q.indexOf('"3334829173"') >= 0);
  assert.ok(q.indexOf('"333 482 9173"') >= 0);
  assert.ok(q.indexOf('"+393334829173"') >= 0);
  assert.ok(/ OR /.test(q));
  assert.ok(g.url.indexOf('%2B39') > 0, 'il + deve essere codificato');
  assert.ok(/truffa/.test(decodeURIComponent(lookup(r, 'google_spam').url)));
  assert.strictEqual(lookup(r, 'tellows').url, 'https://www.tellows.it/num/3334829173');
  assert.strictEqual(lookup(r, 'truecaller').url, 'https://www.truecaller.com/search/it/3334829173');
  assert.strictEqual(lookup(r, 'syncme').url, 'https://sync.me/search/?number=393334829173');
  assert.strictEqual(lookup(r, 'whatsapp').url, 'https://wa.me/393334829173');
  assert.strictEqual(lookup(r, 'telegram').url, 'https://t.me/+393334829173');
  assert.ok(lookup(r, 'bing') && lookup(r, 'duckduckgo') && lookup(r, 'facebook') && lookup(r, 'linkedin') && lookup(r, 'instagram'));
  assert.ok(/registropubblicodelleopposizioni\.it/.test(lookup(r, 'registro_opposizioni').url));
  assert.ok(/commissariatodips\.it/.test(lookup(r, 'polizia_postale').url));
  assert.ok(/agcom\.it/.test(lookup(r, 'agcom').url));
});

test('lookups per numero estero usano il formato internazionale', function () {
  var r = W.analyze('+44 7911 123456');
  assert.strictEqual(lookup(r, 'tellows').url, 'https://www.tellows.it/num/00447911123456');
  assert.strictEqual(lookup(r, 'truecaller').url, 'https://www.truecaller.com/search/gb/07911123456');
  assert.ok(decodeURIComponent(lookup(r, 'google').url).indexOf('"00447911123456"') >= 0);
});

test('numero breve: niente link di messaggistica', function () {
  var r = W.analyze('112');
  assert.ok(r.lookups.length > 0);
  assert.ok(!lookup(r, 'whatsapp'));
});

// ---------------------------------------------------------------- Robustezza
test('nessuna eccezione su input vari', function () {
  ['+', '00', '0', '1', '+39', '+1', '123456789012345678901', '+999 123', '☎ 333 482 9173', '333.482.9173',
    '+39 (0)6 4829 1735', '02 1234567 int. 21', 12345, {}, []].forEach(function (n) {
    var r = W.analyze(n);
    assertShape(r);
  });
});

console.log('\n' + passed + ' superati, ' + failed + ' falliti');
process.exit(failed ? 1 : 0);
