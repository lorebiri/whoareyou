/*!
 * ScamCheck – "È una truffa?": analisi di messaggi, link, IBAN, email e numeri.
 *
 * Script classico (UMD), nessuna dipendenza, nessuna chiamata di rete.
 * Espone `window.ScamCheck` nel browser e `module.exports` in Node.
 * Per i numeri di telefono riusa il motore WhoAreYou (assets/js/analyzer.js).
 * API documentata in CONTRACT-SCAM.md:
 *
 *   ScamCheck.analyzeText(text, opts) -> Report      (sincrono, livello "regole")
 *   ScamCheck.analyze(text, opts)     -> Promise<Report>  (regole + livelli registrati)
 *   ScamCheck.registerLayer({ id, label, run })
 *   ScamCheck.version
 *
 * Tutta l'analisi è euristica: riconosce i COPIONI tipici delle truffe
 * italiane e i segnali tecnici di rischio (link che imitano siti noti, IBAN
 * esteri, numeri a sovrapprezzo...). Non può certificare che un messaggio
 * sia sicuro.
 *
 * Indice delle sezioni:
 *   1. Utilità e normalizzazione del testo
 *   2. Dati: marchi e domini ufficiali, accorciatori, TLD, IBAN
 *   3. Estrazione: URL, email, IBAN, telefoni
 *   4. Analisi dei link (sosia di marchi, punycode, IP, ...)
 *   5. Analisi di IBAN ed email
 *   6. Indizi testuali (cue) e rilevatori dei copioni di truffa
 *   7. Punteggio, titolo e consigli
 *   8. API pubblica: analyzeText, analyze, registerLayer
 */
(function (root, factory) {
  'use strict';
  var W = null;
  if (typeof module === 'object' && module.exports) {
    try { W = require('./analyzer.js'); } catch (e) { W = null; }
  }
  if (!W && root && root.WhoAreYou) W = root.WhoAreYou;
  var api = factory(W, root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ScamCheck = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (WhoAreYouRef, root) {
  'use strict';

  var VERSION = '1.0.0';
  /** Punteggio di partenza di un messaggio senza segnali (neutro: non possiamo certificarlo). */
  var BASE_MESSAGE = 55;
  /** Un messaggio non può mai risultare "affidabile": nessun controllo automatico lo garantisce. */
  var MESSAGE_MAX = 64;
  var BASE_URL = 50;
  var BASE_EMAIL = 50;
  var BASE_IBAN = 55;
  var DEFAULT_LAYER_TIMEOUT = 8000;
  var MAX_INPUT = 30000;

  function getW() {
    if (WhoAreYouRef) return WhoAreYouRef;
    if (root && root.WhoAreYou) return root.WhoAreYou;
    return null;
  }

  /* =====================================================================
   * 1. UTILITÀ E NORMALIZZAZIONE DEL TESTO
   * ===================================================================== */

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /**
   * Crea un segnale nel formato del contratto.
   * @param {string} id
   * @param {string} label
   * @param {string} detail
   * @param {number} impact negativo = più rischio, positivo = rassicura
   * @param {"info"|"low"|"medium"|"high"} severity
   * @param {string} [evidence] frammento del testo che ha fatto scattare il segnale
   */
  function sig(id, label, detail, impact, severity, evidence) {
    var s = { id: id, label: label, detail: detail, impact: impact, severity: severity };
    if (evidence) s.evidence = String(evidence).slice(0, 160);
    return s;
  }

  /**
   * Lettere di altri alfabeti che sembrano latine (omoglifi): usate nei
   * messaggi e nei domini per eludere i filtri ("Pоste" con la "о" cirillica).
   */
  var HOMOGLYPHS = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
    'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ӏ': 'l', 'һ': 'h', 'ԛ': 'q', 'ԝ': 'w', 'к': 'k', 'м': 'm',
    'н': 'h', 'т': 't', 'в': 'b', 'ь': 'b', 'п': 'n', 'г': 'r', 'ү': 'y', 'ꞵ': 'b',
    'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u', 'ε': 'e',
    'ϲ': 'c', 'ɑ': 'a', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ß': 'ss'
  };

  var KEEP_PUNCT = '.,%€\'/:@-+?!';

  /** Converte un carattere nella forma "ripiegata": minuscolo, senza accenti, ASCII. */
  function foldChar(ch) {
    var l = ch.toLowerCase();
    if (HOMOGLYPHS[l]) return HOMOGLYPHS[l];
    var d = l.normalize ? l.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : l;
    if (d === '') return '';
    if (/^[a-z0-9]+$/.test(d)) return d;
    if (ch === '\u2019' || ch === '\u2018' || ch === '`' || ch === '\u00b4') return '\'';
    if (ch === '\u2026') return '.';
    if (KEEP_PUNCT.indexOf(ch) >= 0) return ch;
    return ' ';
  }

  /**
   * Normalizza il testo per la ricerca degli indizi: minuscolo, senza accenti,
   * emoji e simboli trasformati in spazi, spazi multipli compressi, cifre al
   * posto di lettere tra due lettere ("P0ste" -> "poste").
   * Mantiene una mappa indice-normalizzato -> indice-originale per poter
   * riportare il frammento originale come evidenza.
   * @param {string} text
   * @returns {{ s: string, map: number[], orig: string }}
   */
  function normalizeText(text) {
    var orig = String(text == null ? '' : text);
    var out = [];
    var map = [];
    var lastSpace = true;
    for (var i = 0; i < orig.length; i++) {
      var f = foldChar(orig.charAt(i));
      for (var k = 0; k < f.length; k++) {
        var c = f.charAt(k);
        if (c === ' ') {
          if (lastSpace) continue;
          lastSpace = true;
        } else {
          lastSpace = false;
        }
        out.push(c);
        map.push(i);
      }
    }
    var s = out.join('');
    // Leetspeak tra lettere: stessa lunghezza, la mappa resta valida.
    var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
    for (var pass = 0; pass < 2; pass++) {
      s = s.replace(/([a-z])([013457])(?=[a-z])/g, function (m, a, d) { return a + LEET[d]; });
    }
    return { s: s, map: map, orig: orig };
  }

  /** Riporta il frammento originale corrispondente a [start, end) del testo normalizzato. */
  function evidenceOf(N, start, end) {
    if (!N.map.length) return '';
    var a = N.map[Math.max(0, Math.min(start, N.map.length - 1))];
    var b = N.map[Math.max(0, Math.min(end - 1, N.map.length - 1))];
    var ev = N.orig.slice(a, b + 1).replace(/\s+/g, ' ').trim();
    return ev.length > 120 ? ev.slice(0, 117) + '…' : ev;
  }

  /** Distanza di Levenshtein (per i domini che imitano un marchio). */
  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var d = [];
    var i;
    var j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        // trasposizione di due lettere adiacenti ("psote" / "poste")
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  /**
   * "Scheletro" visivo di una stringa: lettere simili ridotte alla stessa
   * forma (0->o, 1/i->l, rn->m, vv->w, cirillico->latino). Due domini con lo
   * stesso scheletro si confondono a colpo d'occhio.
   */
  function skeleton(s) {
    var out = '';
    s = String(s).toLowerCase();
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += HOMOGLYPHS[ch] || ch;
    }
    return out.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/[1i|!]/g, 'l')
      .replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/\$/g, 's');
  }

  /** Decodifica un'etichetta punycode (RFC 3492), es. "xn--pste-..." -> Unicode. */
  function punycodeDecode(label) {
    var input = label.replace(/^xn--/i, '');
    var base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700, n = 128, bias = 72, i = 0;
    var output = [];
    var basic = input.lastIndexOf('-');
    if (basic < 0) basic = 0;
    for (var j = 0; j < basic; j++) output.push(input.charCodeAt(j));
    function adapt(delta, numPoints, first) {
      var k = 0;
      delta = first ? Math.floor(delta / damp) : delta >> 1;
      delta += Math.floor(delta / numPoints);
      for (; delta > ((base - tMin) * tMax) >> 1; k += base) delta = Math.floor(delta / (base - tMin));
      return Math.floor(k + (base - tMin + 1) * delta / (delta + skew));
    }
    function digit(cp) {
      if (cp - 48 < 10) return cp - 22;
      if (cp - 65 < 26) return cp - 65;
      if (cp - 97 < 26) return cp - 97;
      return base;
    }
    for (var idx = basic > 0 ? basic + 1 : 0; idx < input.length;) {
      var oldi = i;
      for (var w = 1, k = base; ; k += base) {
        if (idx >= input.length) return null;
        var d = digit(input.charCodeAt(idx++));
        if (d >= base) return null;
        i += d * w;
        var t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
        if (d < t) break;
        w *= base - t;
      }
      var out = output.length + 1;
      bias = adapt(i - oldi, out, oldi === 0);
      n += Math.floor(i / out);
      i %= out;
      output.splice(i++, 0, n);
    }
    try { return String.fromCodePoint.apply(null, output); } catch (e) { return null; }
  }

  /* =====================================================================
   * 2. DATI: MARCHI E DOMINI UFFICIALI, ACCORCIATORI, TLD, IBAN
   * ===================================================================== */

  /**
   * Marchi spesso imitati. kw = parole chiave cercate nei domini (le parole
   * corte o comuni sono "strict": contano solo come parola intera);
   * domains = domini ufficiali (il marchio e i suoi sottodomini non vengono
   * mai segnalati); text = regex per riconoscere il marchio nel messaggio.
   */
  var BRANDS = [
    { id: 'poste', name: 'Poste Italiane', kw: ['poste', 'posteitaliane', 'bancoposta', 'postepay', 'posteid', 'postemobile'], strict: [], domains: ['poste.it', 'posteitaliane.it', 'postepay.it', 'postemobile.it'], text: /\b(poste ?italiane|poste|bancoposta|banco posta|postepay|poste ?pay|posteid|ufficio postale)\b/ },
    { id: 'intesa', name: 'Intesa Sanpaolo', kw: ['intesasanpaolo', 'intesa', 'sanpaolo', 'isybank'], domains: ['intesasanpaolo.com', 'intesasanpaolo.it', 'isybank.com'], text: /\b(intesa|sanpaolo|isybank)\b/ },
    { id: 'unicredit', name: 'UniCredit', kw: ['unicredit'], domains: ['unicredit.it', 'unicredit.eu', 'unicreditgroup.eu'], text: /\bunicredit\b/ },
    { id: 'bnl', name: 'BNL', kw: ['bnl'], domains: ['bnl.it'], text: /\bbnl\b/ },
    { id: 'mps', name: 'Monte dei Paschi', kw: ['mps', 'montepaschi', 'bancamps'], domains: ['mps.it', 'gruppomps.it'], text: /\b(mps|monte (dei )?paschi)\b/ },
    { id: 'bper', name: 'BPER Banca', kw: ['bper'], domains: ['bper.it'], text: /\bbper\b/ },
    { id: 'fineco', name: 'Fineco', kw: ['fineco', 'finecobank'], domains: ['finecobank.com', 'fineco.it'], text: /\bfineco(bank)?\b/ },
    { id: 'nexi', name: 'Nexi', kw: ['nexi'], domains: ['nexi.it', 'nexigroup.com'], text: /\bnexi\b/ },
    { id: 'mediolanum', name: 'Banca Mediolanum', kw: ['mediolanum', 'bancamediolanum'], domains: ['bancamediolanum.it'], text: /\bmediolanum\b/ },
    { id: 'bancobpm', name: 'Banco BPM', kw: ['bancobpm', 'bpm', 'webank'], domains: ['bancobpm.it', 'webank.it'], text: /\b(banco ?bpm|bpm|webank)\b/ },
    { id: 'credem', name: 'Credem', kw: ['credem'], domains: ['credem.it'], text: /\bcredem\b/ },
    { id: 'creditagricole', name: 'Crédit Agricole', kw: ['creditagricole', 'agricole'], domains: ['credit-agricole.it', 'credit-agricole.com'], text: /\bcredit agricole\b/ },
    { id: 'ing', name: 'ING', kw: ['ing'], domains: ['ing.it', 'ing.com'], text: /\bing (direct|bank)\b/ },
    { id: 'hype', name: 'Hype', kw: ['hype'], domains: ['hype.it'], text: /\bhype\b/ },
    { id: 'n26', name: 'N26', kw: ['n26'], domains: ['n26.com'], text: /\bn26\b/ },
    { id: 'revolut', name: 'Revolut', kw: ['revolut'], domains: ['revolut.com'], text: /\brevolut\b/ },
    { id: 'paypal', name: 'PayPal', kw: ['paypal'], domains: ['paypal.com', 'paypal.it', 'paypal.me', 'paypalobjects.com'], text: /\bpaypal\b/ },
    { id: 'satispay', name: 'Satispay', kw: ['satispay'], domains: ['satispay.com'], text: /\bsatispay\b/ },
    { id: 'amex', name: 'American Express', kw: ['americanexpress', 'amex'], domains: ['americanexpress.com', 'americanexpress.it'], text: /\b(american express|amex)\b/ },
    { id: 'inps', name: 'INPS', kw: ['inps'], domains: ['inps.it'], text: /\binps\b/ },
    { id: 'agenziaentrate', name: 'Agenzia delle Entrate', kw: ['agenziaentrate', 'agenziadelleentrate', 'entrate', 'riscossione'], domains: ['agenziaentrate.gov.it', 'agenziaentrateriscossione.gov.it', 'agenziaentrate.it'], text: /\b(agenzia (delle )?entrate|agenziaentrate|riscossione)\b/ },
    { id: 'pagopa', name: 'PagoPA', kw: ['pagopa'], domains: ['pagopa.gov.it', 'pagopa.it'], text: /\bpago ?pa\b/ },
    { id: 'governo', name: 'Pubblica Amministrazione', kw: ['gov', 'governo', 'ministero', 'spid', 'cie'], domains: ['gov.it', 'italia.it', 'europa.eu'], text: /\b(ministero|governo|app io|spid)\b/ },
    { id: 'telepass', name: 'Telepass', kw: ['telepass'], domains: ['telepass.com', 'telepass.it'], text: /\btelepass\b/ },
    { id: 'autostrade', name: 'Autostrade per l\'Italia', kw: ['autostrade', 'autostradeperlitalia', 'pedaggi', 'pedaggio'], domains: ['autostrade.it', 'movyon.com', 'freetox.it'], text: /\bautostrade\b/ },
    { id: 'amazon', name: 'Amazon', kw: ['amazon', 'amzn'], domains: ['amazon.it', 'amazon.com', 'amazon.de', 'amazon.fr', 'amazon.es', 'amazon.co.uk', 'amazon.nl', 'amazon.eu', 'amzn.to', 'amzn.eu', 'primevideo.com', 'media-amazon.com'], text: /\b(amazon|prime video)\b/ },
    { id: 'apple', name: 'Apple', kw: ['apple', 'icloud', 'itunes', 'appleid'], domains: ['apple.com', 'icloud.com', 'itunes.com'], text: /\b(apple|icloud|itunes|apple ?id)\b/ },
    { id: 'microsoft', name: 'Microsoft', kw: ['microsoft', 'outlook', 'office365', 'hotmail', 'onedrive'], domains: ['microsoft.com', 'live.com', 'outlook.com', 'office.com', 'hotmail.com', 'hotmail.it', 'onedrive.com', 'microsoftonline.com', 'office365.com'], text: /\b(microsoft|outlook|office ?365|onedrive)\b/ },
    { id: 'google', name: 'Google', kw: ['google', 'gmail'], domains: ['google.com', 'google.it', 'gmail.com', 'youtube.com', 'youtu.be', 'g.co'], text: /\b(google|gmail)\b/ },
    { id: 'netflix', name: 'Netflix', kw: ['netflix'], domains: ['netflix.com'], text: /\bnetflix\b/ },
    { id: 'disney', name: 'Disney+', kw: ['disneyplus', 'disney'], domains: ['disneyplus.com', 'disney.it', 'disney.com'], text: /\bdisney\b/ },
    { id: 'spotify', name: 'Spotify', kw: ['spotify'], domains: ['spotify.com'], text: /\bspotify\b/ },
    { id: 'dazn', name: 'DAZN', kw: ['dazn'], domains: ['dazn.com'], text: /\bdazn\b/ },
    { id: 'sky', name: 'Sky', kw: ['sky'], domains: ['sky.it', 'sky.com'], text: /\bsky (tv|wifi|glass|go)\b/ },
    { id: 'whatsapp', name: 'WhatsApp', kw: ['whatsapp'], domains: ['whatsapp.com', 'whatsapp.net', 'wa.me'], text: null },
    { id: 'meta', name: 'Facebook/Instagram', kw: ['facebook', 'instagram', 'meta'], domains: ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'meta.com', 'messenger.com'], text: null },
    { id: 'dhl', name: 'DHL', kw: ['dhl'], domains: ['dhl.com', 'dhl.it', 'dhl.de'], text: /\bdhl\b/ },
    { id: 'brt', name: 'BRT', kw: ['brt', 'bartolini', 'mybrt'], domains: ['brt.it', 'mybrt.it'], text: /\b(brt|bartolini)\b/ },
    { id: 'gls', name: 'GLS', kw: ['gls'], domains: ['gls-italy.com', 'gls-group.com', 'gls-group.eu'], text: /\bgls\b/ },
    { id: 'sda', name: 'SDA', kw: ['sda'], domains: ['sda.it'], text: /\bsda\b/ },
    { id: 'inpost', name: 'InPost', kw: ['inpost'], domains: ['inpost.it', 'inpost.eu', 'inpost.pl'], text: /\binpost\b/ },
    { id: 'ups', name: 'UPS', kw: ['ups'], domains: ['ups.com'], text: null },
    { id: 'fedex', name: 'FedEx', kw: ['fedex'], domains: ['fedex.com'], text: /\bfedex\b/ },
    { id: 'tnt', name: 'TNT', kw: ['tnt'], domains: ['tnt.it', 'tnt.com'], text: /\btnt\b/ },
    { id: 'enel', name: 'Enel', kw: ['enel', 'enelenergia'], domains: ['enel.it', 'enel.com'], text: /\benel\b/ },
    { id: 'eni', name: 'Eni Plenitude', kw: ['plenitude', 'eniplenitude'], domains: ['eniplenitude.com', 'eni.com'], text: /\b(eni plenitude|plenitude)\b/ },
    { id: 'tim', name: 'TIM', kw: ['tim', 'telecomitalia'], domains: ['tim.it', 'telecomitalia.it', 'gruppotim.it', 'timvision.it'], text: /\btim\b/ },
    { id: 'vodafone', name: 'Vodafone', kw: ['vodafone'], domains: ['vodafone.it', 'vodafone.com'], text: /\bvodafone\b/ },
    { id: 'windtre', name: 'WindTre', kw: ['windtre'], domains: ['windtre.it', 'wind.it', 'tre.it'], text: /\bwind ?tre\b/ },
    { id: 'iliad', name: 'Iliad', kw: ['iliad'], domains: ['iliad.it'], text: /\biliad\b/ },
    { id: 'fastweb', name: 'Fastweb', kw: ['fastweb'], domains: ['fastweb.it'], text: /\bfastweb\b/ },
    { id: 'trenitalia', name: 'Trenitalia', kw: ['trenitalia'], domains: ['trenitalia.com'], text: /\btrenitalia\b/ },
    { id: 'italo', name: 'Italo', kw: ['italotreno'], domains: ['italotreno.it', 'italotreno.com'], text: null },
    { id: 'ebay', name: 'eBay', kw: ['ebay'], domains: ['ebay.it', 'ebay.com'], text: /\bebay\b/ },
    { id: 'subito', name: 'Subito', kw: ['subito'], domains: ['subito.it'], text: /\bsubito\.it\b/ },
    { id: 'vinted', name: 'Vinted', kw: ['vinted'], domains: ['vinted.it', 'vinted.com'], text: /\bvinted\b/ },
    { id: 'booking', name: 'Booking.com', kw: ['booking'], domains: ['booking.com'], text: /\bbooking\b/ },
    { id: 'aruba', name: 'Aruba', kw: ['aruba'], domains: ['aruba.it', 'pec.it'], text: /\baruba\b/ },
    { id: 'findomestic', name: 'Findomestic', kw: ['findomestic'], domains: ['findomestic.it'], text: /\bfindomestic\b/ },
    { id: 'polizia', name: 'Polizia di Stato', kw: ['poliziadistato', 'poliziapostale', 'commissariatodips', 'polizia', 'carabinieri', 'guardiadifinanza', 'gdf'], domains: ['poliziadistato.it', 'commissariatodips.it', 'carabinieri.it', 'gdf.gov.it', 'interno.gov.it'], text: /\b(polizia (di stato|postale)|carabinieri|guardia di finanza)\b/ }
  ];

  /** Parole chiave corte o comuni: valgono solo come parola intera del dominio. */
  var STRICT_KW = { bnl: 1, mps: 1, bper: 1, ing: 1, hype: 1, n26: 1, amex: 1, inps: 1, entrate: 1, riscossione: 1, gov: 1, governo: 1, ministero: 1, spid: 1, cie: 1, dhl: 1, brt: 1, gls: 1, sda: 1, ups: 1, tnt: 1, enel: 1, tim: 1, sky: 1, meta: 1, subito: 1, booking: 1, aruba: 1, polizia: 1, gdf: 1, nexi: 1, amzn: 1, dazn: 1, credem: 1, bpm: 1, webank: 1, agricole: 1, apple: 1, pedaggi: 1, pedaggio: 1, sanpaolo: 1, intesa: 1, outlook: 1, hotmail: 1 };

  /** Altri domini molto diffusi e sicuri come destinazione (non sono marchi imitati di solito). */
  var OTHER_OFFICIAL = ['commissariatodips.it', 'garanteprivacy.it', 'agcom.it', 'consob.it', 'bancaditalia.it',
    'registropubblicodelleopposizioni.it', 'wikipedia.org', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com',
    'telegram.org', 't.me', 'github.com', 'zoom.us', 'teams.microsoft.com', 'esselunga.it', 'coop.it', 'conad.it',
    'ilpost.it', 'corriere.it', 'repubblica.it', 'ansa.it', 'rai.it', 'aci.it', 'ilmeteo.it', 'ikea.com', 'zalando.it',
    'lorebiri.github.io'];

  var BRAND_BY_ID = {};
  var OFFICIAL_INDEX = [];
  (function buildBrandIndex() {
    BRANDS.forEach(function (b) {
      BRAND_BY_ID[b.id] = b;
      b.domains.forEach(function (d) { OFFICIAL_INDEX.push({ domain: d, brand: b }); });
    });
    OTHER_OFFICIAL.forEach(function (d) { OFFICIAL_INDEX.push({ domain: d, brand: null }); });
  })();

  /** Servizi per accorciare i link: nascondono la destinazione reale. */
  var SHORTENERS = ['bit.ly', 'bitly.com', 'tinyurl.com', 't.ly', 'cutt.ly', 'is.gd', 'v.gd', 'rb.gy', 'ow.ly', 'buff.ly',
    't.co', 'goo.gl', 'shorturl.at', 'tiny.cc', 's.id', 'rebrand.ly', 'bl.ink', 'short.io', 'qrco.de', 'lnkd.in',
    'x.gd', 'u.to', 'clck.ru', 'urlz.fr', 'surl.li', 'gg.gg', 'tiny.one', 'shorturl.asia', 'shrtco.de', 'tr.im',
    'cli.re', 'l.ead.me', 'han.gl', 'linktr.ee', 'shor.by', 'trib.al', 'soo.gd', 'adf.ly', 'bit.do', 'mcaf.ee', 'kutt.it',
    '2u.pw', 'urly.it', 'sh.st', 'shorte.st', 'zpr.io', 'smarturl.it', 'did.li', '1url.it'];

  /**
   * TLD molto usati per siti di phishing perché economici o poco controllati.
   * Fascia alta: abuso molto frequente. Fascia media: usati anche da siti onesti
   * (piccole attività, blog), contano poco da soli.
   */
  var SUSPICIOUS_TLDS_HIGH = ['top', 'xyz', 'icu', 'buzz', 'click', 'cfd', 'sbs', 'rest', 'cyou', 'monster', 'quest', 'bond',
    'tk', 'ml', 'ga', 'cf', 'gq', 'su', 'zip', 'mov', 'lol', 'mom', 'cam', 'win', 'bid', 'loan', 'men', 'date', 'review',
    'country', 'kim', 'gdn', 'racing', 'stream', 'download', 'party', 'trade', 'science', 'accountant', 'faith', 'cricket',
    'webcam', 'pw', 'ws', 'autos', 'boats', 'homes', 'beauty', 'hair', 'makeup', 'skin', 'pics', 'support', 'help', 'live',
    'sbs', 'tokyo', 'uno', 'lat', 'surf'];
  var SUSPICIOUS_TLDS_MID = ['info', 'biz', 'online', 'site', 'website', 'space', 'fun', 'store', 'shop', 'life', 'vip', 'work',
    'link', 'services', 'center', 'digital', 'today', 'world', 'best', 'club', 'host', 'press', 'cloud', 'email', 'network',
    'tech', 'ink', 'wiki', 'asia', 'one', 'run', 'pro', 'cc', 'us.com', 'delivery', 'express', 'company', 'solutions',
    'agency', 'global', 'zone', 'ltd', 'money', 'cash', 'finance'];
  var SUSPICIOUS_TLDS = SUSPICIOUS_TLDS_HIGH.concat(SUSPICIOUS_TLDS_MID);

  /** Hosting gratuiti e costruttori di siti spesso usati per pagine di phishing. */
  var FREE_HOSTING = ['github.io', 'netlify.app', 'vercel.app', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev',
    'herokuapp.com', 'blogspot.com', 'wixsite.com', 'weebly.com', '000webhostapp.com', 'glitch.me', 'repl.co', 'ngrok.io',
    'ngrok-free.app', 'duckdns.org', 'azurewebsites.net', 'appspot.com', 'r2.dev', 'surge.sh', 'onrender.com', 'fly.dev',
    'godaddysites.com', 'webflow.io', 'mystrikingly.com', 'square.site', 'jimdosite.com', 'framer.website', 'carrd.co',
    'ipfs.io', 'dweb.link', 'translate.goog', 'notion.site', 'yolasite.com', 'sites.google.com', 'forms.gle',
    'docs.google.com', 'drive.google.com', 'script.google.com', 'storage.googleapis.com', 'firebasestorage.googleapis.com',
    'forms.office.com', 'sway.office.com', 'onedrive.live.com', '1drv.ms', 'sharepoint.com', 'dropboxusercontent.com'];

  /**
   * Indirizzi che stanno su domini ufficiali (google.com, office.com, live.com...) ma ospitano
   * pagine, moduli e file creati da chiunque: molto usati per il phishing, quindi NON sono "ufficiali".
   */
  var USER_CONTENT = ['sites.google.com', 'docs.google.com', 'drive.google.com', 'script.google.com', 'forms.gle',
    'storage.googleapis.com', 'firebasestorage.googleapis.com', 'forms.office.com', 'sway.office.com', 'onedrive.live.com',
    '1drv.ms', 'translate.goog'];

  /** Suffissi a due livelli (registro pubblico semplificato). */
  var MULTI_SUFFIX = ['gov.it', 'edu.it', 'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'com.br', 'com.au', 'co.jp', 'co.in',
    'com.tr', 'com.cn', 'com.mx', 'co.za', 'com.ar', 'com.es', 'com.pl', 'co.nz', 'com.ua', 'com.ru', 'com.co', 'com.ng',
    'com.sg', 'com.hk', 'com.my', 'co.id', 'co.il', 'co.kr', 'com.pe', 'com.ve', 'us.com', 'eu.com', 'uk.com', 'com.de'];

  /**
   * TLD accettati per i domini scritti SENZA http/www (es. "poste-verifica.com/x").
   * Esclusi i TLD che coincidono con parole italiane comuni (si, no, ma, va, da, di, la...).
   */
  var BARE_TLDS = ('it com net org eu info biz io co me ly gd gl cc tk ml ga cf gq ru cn de fr uk es pt nl be ch at us ' +
    'pl ro bg gr hr cz sk hu se dk fi ie lt lv ee ua by kz tr ae in br ar mx ca au nz jp kr hk sg tw vn id my ph th za ' +
    'ng ke ma tn eg xyz top icu buzz click live shop cfd sbs rest cyou monster quest bond support help online site ' +
    'website space fun work link life vip win bid loan men date review country kim cam su mom lol zip mov beauty hair ' +
    'makeup skin autos boats homes pics best today world store center services digital pw ws app dev page tech cloud ' +
    'email network club host press ink wiki asia pro one run lat uno surf gdn racing stream download party trade ' +
    'science tv fm ai sh gs am cx la to sm mt cy lu li mc ws biz mobi travel news blog delivery express company ' +
    'solutions agency global group zone ltd plus systems management finance money cash').split(' ');
  var BARE_TLD_SET = {};
  BARE_TLDS.forEach(function (t) { BARE_TLD_SET[t] = 1; });

  /** Parole tipiche dei domini di phishing, usate per capire se "marchio + parole" è un sosia. */
  var PHISHY_WORDS = ['it', 'ita', 'italia', 'italy', 'online', 'web', 'app', 'login', 'accesso', 'accedi', 'verifica',
    'verify', 'verifiche', 'sicurezza', 'sicuro', 'sicura', 'sicure', 'sicuri', 'secure', 'security', 'safe', 'account', 'conto', 'conti', 'clienti',
    'cliente', 'customer', 'support', 'supporto', 'assistenza', 'help', 'servizi', 'servizio', 'service', 'services',
    'update', 'aggiorna', 'aggiornamento', 'conferma', 'confirm', 'sblocco', 'sblocca', 'unlock', 'rimborso', 'rimborsi',
    'refund', 'pagamento', 'pagamenti', 'payment', 'pay', 'paga', 'pacco', 'pacchi', 'consegna', 'consegne', 'delivery',
    'spedizione', 'spedizioni', 'tracking', 'track', 'traccia', 'giacenza', 'ritiro', 'dogana', 'info', 'informazioni',
    'area', 'riservata', 'personale', 'my', 'mio', 'mia', 'id', 'auth', 'portal', 'portale', 'gestione', 'bonus',
    'premio', 'premi', 'promo', 'gift', 'card', 'carta', 'carte', 'bank', 'banca', 'banking', 'mobile', 'notifica',
    'notifiche', 'avviso', 'avvisi', 'alert', 'center', 'centro', 'net', 'group', 'team', 'official', 'ufficiale', 'srl',
    'spa', 'live', 'now', 'go', 'get', 'new', 'nuovo', 'check', 'controllo', 'antifrode', 'protezione', 'protect', 'data',
    'dati', 'multa', 'multe', 'pedaggio', 'pedaggi', 'rinnovo', 'abbonamento', 'prime', 'store', 'shop', 'eu', 'ue',
    'gov', 'cloud', 'digital', 'digitale', 'identita', 'spid', 'inps', 'web', 'www', 'x', 'pro', 'plus', 'si', 'ok',
    'tuo', 'tua', 'link', 'page', 'site', 'sito', 'home', 'main', 'portale', 'utente', 'utenti', 'user', 'users', 'me'];
  var PHISHY_SET = {};
  PHISHY_WORDS.forEach(function (w) { PHISHY_SET[w] = 1; });

  var FREEMAIL = ['gmail.com', 'googlemail.com', 'libero.it', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it',
    'live.com', 'live.it', 'yahoo.com', 'yahoo.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tim.it', 'email.it',
    'inwind.it', 'iol.it', 'aol.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.it',
    'mail.com', 'mail.ru', 'yandex.com', 'yandex.ru', 'tutanota.com', 'zoho.com', 'fastwebnet.it', 'msn.com'];

  /** Lunghezze IBAN per paese (registro SWIFT). */
  var IBAN_LENGTHS = {
    AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22,
    CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22,
    GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30,
    KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27,
    MT: 31, MU: 30, NI: 28, NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33,
    SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29,
    VA: 22, VG: 24, XK: 20, YE: 30, HN: 28
  };

  var COUNTRY_NAMES = {
    IT: 'Italia', SM: 'San Marino', VA: 'Città del Vaticano', LT: 'Lituania', LV: 'Lettonia', EE: 'Estonia',
    ES: 'Spagna', PT: 'Portogallo', FR: 'Francia', DE: 'Germania', NL: 'Paesi Bassi', BE: 'Belgio', LU: 'Lussemburgo',
    IE: 'Irlanda', GB: 'Regno Unito', CH: 'Svizzera', AT: 'Austria', PL: 'Polonia', RO: 'Romania', BG: 'Bulgaria',
    HU: 'Ungheria', CZ: 'Repubblica Ceca', SK: 'Slovacchia', SI: 'Slovenia', HR: 'Croazia', GR: 'Grecia', CY: 'Cipro',
    MT: 'Malta', DK: 'Danimarca', SE: 'Svezia', FI: 'Finlandia', NO: 'Norvegia', IS: 'Islanda', TR: 'Turchia',
    UA: 'Ucraina', RU: 'Russia', AE: 'Emirati Arabi Uniti', GE: 'Georgia', MD: 'Moldavia', AL: 'Albania', RS: 'Serbia',
    BA: 'Bosnia ed Erzegovina', ME: 'Montenegro', MK: 'Macedonia del Nord', XK: 'Kosovo', MC: 'Monaco', LI: 'Liechtenstein',
    GI: 'Gibilterra', BR: 'Brasile', TN: 'Tunisia', MU: 'Mauritius', SC: 'Seychelles', KZ: 'Kazakistan', BY: 'Bielorussia',
    AD: 'Andorra', AZ: 'Azerbaigian', SA: 'Arabia Saudita', QA: 'Qatar', IL: 'Israele', EG: 'Egitto'
  };

  /* =====================================================================
   * 3. ESTRAZIONE: URL, EMAIL, IBAN, TELEFONI
   * ===================================================================== */

  // Punto anche "offuscato" ([.], (.), {.}, [dot]) come nei link disinnescati.
  var DOT = '(?:\\.|\\[\\.\\]|\\(\\.\\)|\\{\\.\\}|\\[dot\\]|\\(dot\\))';
  var LCH = 'a-z0-9\\u00c0-\\u024f\\u0370-\\u03ff\\u0400-\\u04ff';
  var LABEL = '[' + LCH + '](?:[' + LCH + '_-]{0,61}[' + LCH + '])?';
  var PATH = '(?:[/?#][^\\s<>"\'«»]*)?';
  var RE_SCHEME_URL = new RegExp('(?:h(?:tt|xx)ps?|ftp)(?::|\\[:\\])//[^\\s<>"\'«»]+', 'gi');
  var RE_EMAIL = new RegExp('[a-z0-9._%+-]{1,64}@(?:' + LABEL + DOT + ')+[a-z]{2,24}', 'gi');
  var RE_WWW = new RegExp('www\\d?' + DOT + '(?:' + LABEL + DOT + ')*' + LABEL + '(?::\\d{2,5})?' + PATH, 'gi');
  var RE_BARE = new RegExp('(?:' + LABEL + DOT + ')+[a-z]{2,12}(?::\\d{2,5})?' + PATH, 'gi');

  /** Sostituisce un intervallo con spazi (stessa lunghezza) per non riestrarlo. */
  function maskRange(s, start, end) {
    return s.slice(0, start) + new Array(end - start + 1).join(' ') + s.slice(end);
  }

  /** Toglie la punteggiatura finale che non fa parte del link. */
  function trimTrailing(raw) {
    var r = raw;
    for (;;) {
      var last = r.charAt(r.length - 1);
      if (/[.,;:!?'"»…>\]}]/.test(last)) { r = r.slice(0, -1); continue; }
      if (last === ')' && (r.match(/\(/g) || []).length < (r.match(/\)/g) || []).length) { r = r.slice(0, -1); continue; }
      break;
    }
    return r;
  }

  /** Rende "cliccabile" un link disinnescato: hxxp -> http, [.] -> . */
  function refang(s) {
    return String(s).replace(/^hxxp/i, 'http').replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)/gi, '.').replace(/\[:\]/g, ':');
  }

  function isObfuscated(raw) { return /hxxp|\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)|\[:\]/i.test(raw); }

  /**
   * Scompone un URL (anche senza schema o disinnescato).
   * @param {string} raw
   * @returns {{ raw: string, url: string, scheme: string|null, host: string|null, port: string|null,
   *   path: string, userinfo: string|null, obfuscated: boolean }}
   */
  function parseUrl(raw) {
    var s = refang(String(raw).trim());
    var res = { raw: raw, url: s, scheme: null, host: null, port: null, path: '', userinfo: null, obfuscated: isObfuscated(raw) };
    var m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
    var rest = s;
    if (m) { res.scheme = m[1].toLowerCase(); rest = s.slice(m[0].length); }
    var cut = rest.search(/[/?#\\]/);
    var authority = cut < 0 ? rest : rest.slice(0, cut);
    res.path = cut < 0 ? '' : rest.slice(cut);
    var at = authority.lastIndexOf('@');
    if (at >= 0) { res.userinfo = authority.slice(0, at); authority = authority.slice(at + 1); }
    var pm = /:(\d{1,5})$/.exec(authority);
    if (pm) { res.port = pm[1]; authority = authority.slice(0, pm.index); }
    var host = authority.toLowerCase().replace(/\.+$/, '').replace(/^\[|\]$/g, '');
    res.host = host || null;
    return res;
  }

  /** IP in qualsiasi forma che il browser accetta: 1.2.3.4, IPv6, decimale (3232235777) o esadecimale (0x7f000001). */
  function isIp(host) {
    if (/^[0-9a-f:]+:[0-9a-f:]*$/i.test(host) && host.indexOf(':') >= 0) return true;
    return /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){0,3}$/i.test(host);
  }

  /**
   * Trova i link nel testo: con schema (anche "hxxp"), con "www.", e domini
   * "nudi" come "poste-verifica.com/x" (solo con TLD conosciuti).
   * @param {string} text
   * @returns {{ items: Array<{raw: string, index: number}>, masked: string }}
   */
  function extractUrls(text) {
    var s = String(text);
    var items = [];
    function scan(re, validate) {
      re.lastIndex = 0;
      var m;
      var found = [];
      while ((m = re.exec(s)) !== null) {
        var raw = trimTrailing(m[0]);
        if (!raw) continue;
        var idx = m.index;
        var prev = idx > 0 ? s.charAt(idx - 1) : '';
        if (validate && !validate(raw, prev)) continue;
        found.push({ raw: raw, index: idx });
      }
      found.forEach(function (f) { s = maskRange(s, f.index, f.index + f.raw.length); items.push(f); });
    }
    scan(RE_SCHEME_URL, function (raw) { return !!parseUrl(raw).host; });
    // Le email vanno tolte prima dei domini nudi (altrimenti "nome@poste.it" darebbe il link "poste.it").
    var emailMasked = s;
    RE_EMAIL.lastIndex = 0;
    var em;
    while ((em = RE_EMAIL.exec(s)) !== null) emailMasked = maskRange(emailMasked, em.index, em.index + em[0].length);
    var keep = s;
    var emailRanges = [];
    RE_EMAIL.lastIndex = 0;
    while ((em = RE_EMAIL.exec(keep)) !== null) emailRanges.push([em.index, em.index + em[0].length]);
    s = emailMasked;
    scan(RE_WWW, function (raw, prev) { return !/[a-z0-9@._-]/i.test(prev); });
    scan(RE_BARE, function (raw, prev) {
      if (/[a-z0-9@._\-\u00c0-\u024f]/i.test(prev)) return false;
      var p = parseUrl(raw);
      if (!p.host || isIp(p.host)) return false;
      var labels = p.host.split('.');
      var tld = labels[labels.length - 1];
      if (!BARE_TLD_SET[tld]) return false;
      if (/^\d+$/.test(labels[0]) && labels.length === 2) return false;
      // "Sig.ra", "ecc.it" ecc.: etichetta principale di almeno 2 caratteri
      if (labels[labels.length - 2].length < 2) return false;
      return true;
    });
    // le email restano nel testo restituito: le estrae extractEmails
    var masked = s;
    emailRanges.forEach(function (r) { masked = masked.slice(0, r[0]) + keep.slice(r[0], r[1]) + masked.slice(r[1]); });
    items.sort(function (a, b) { return a.index - b.index; });
    return { items: items, masked: masked };
  }

  /**
   * Trova gli indirizzi email (anche con "[.]").
   * @param {string} text testo con i link già mascherati
   */
  function extractEmails(text) {
    var s = String(text);
    var items = [];
    RE_EMAIL.lastIndex = 0;
    var m;
    while ((m = RE_EMAIL.exec(s)) !== null) {
      var raw = trimTrailing(m[0]);
      items.push({ raw: raw, index: m.index });
    }
    items.forEach(function (it) { s = maskRange(s, it.index, it.index + it.raw.length); });
    return { items: items, masked: s };
  }

  /** Controllo mod-97 dell'IBAN (ISO 13616). */
  function ibanChecksumOk(iban) {
    var s = String(iban).replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return false;
    var r = s.slice(4) + s.slice(0, 4);
    var rem = 0;
    for (var i = 0; i < r.length; i++) {
      var c = r.charCodeAt(i);
      var v = c >= 65 ? String(c - 55) : r.charAt(i);
      for (var k = 0; k < v.length; k++) rem = (rem * 10 + (v.charCodeAt(k) - 48)) % 97;
    }
    return rem === 1;
  }

  /**
   * Trova gli IBAN (qualsiasi paese, con o senza spazi). Usa la lunghezza
   * prevista per il paese per non "mangiare" le parole che seguono.
   * @param {string} text testo con link ed email mascherati
   */
  function extractIbans(text) {
    var s = String(text);
    // "IT60X05428..." oppure a gruppi all'italiana "IT 60 X 05428 11101 000000123456"
    var re = /\b([A-Za-z]{2}[ \u00a0]?\d{2}(?:[ \u00a0-]?[A-Za-z0-9]){10,34})/g;
    var items = [];
    var m;
    while ((m = re.exec(s)) !== null) {
      var cand = m[1];
      var cc = cand.slice(0, 2).toUpperCase();
      var L = IBAN_LENGTHS[cc];
      if (!L) { re.lastIndex = m.index + 2; continue; }
      // con lo spazio dopo il paese serve il codice in maiuscolo ("IT 60"), non parole come "se 12"
      if (/^[A-Za-z]{2}[ \u00a0]/.test(cand) && cand.slice(0, 2) !== cc) { re.lastIndex = m.index + 2; continue; }
      if (cand.slice(0, 2) !== cc && !/^[a-z]{2}\d{2}[a-z0-9]+$/i.test(cand.replace(/[\s-]/g, ''))) { re.lastIndex = m.index + 2; continue; }
      // Prendi esattamente L caratteri alfanumerici
      var count = 0;
      var end = 0;
      for (var i = 0; i < cand.length && count < L; i++) {
        if (/[A-Za-z0-9]/.test(cand.charAt(i))) count++;
        end = i + 1;
      }
      var before = s.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
      var ibanKw = /\b(iban|conto|bonifico|coordinate|beneficiario|intestat)/.test(before);
      if (count < L) {
        var compactShort = cand.replace(/[^A-Za-z0-9]/g, '');
        // IBAN incompleto: solo se il testo parla di IBAN/conto/bonifico (altrimenti è un codice qualunque)
        if (compactShort.length >= 14 && ibanKw && /\d{6,}/.test(compactShort)) {
          items.push({ raw: cand.trim(), index: m.index, normalized: compactShort.toUpperCase(), lengthOk: false });
        }
        continue;
      }
      var raw = cand.slice(0, end);
      var next = s.charAt(m.index + end);
      var compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      // Un IBAN vero ha quasi solo cifre dopo le prime 4/5 posizioni
      if ((compact.slice(4).match(/\d/g) || []).length < compact.length * 0.5) { re.lastIndex = m.index + 2; continue; }
      var glued = /[A-Za-z0-9]/.test(next);
      if (glued) {
        var tail = s.slice(m.index + end).match(/^[A-Za-z0-9]+/)[0];
        items.push({ raw: raw + tail, index: m.index, normalized: compact + tail.toUpperCase(), lengthOk: false });
        re.lastIndex = m.index + end + tail.length;
        continue;
      }
      items.push({ raw: raw, index: m.index, normalized: compact, lengthOk: true });
      re.lastIndex = m.index + end;
    }
    items.forEach(function (it) { s = maskRange(s, it.index, it.index + it.raw.length); });
    return { items: items, masked: s };
  }

  var PHONE_KW_BEFORE = /(tel|telefono|telefonare|telefona|cell|cellulare|chiama|chiamare|chiamaci|chiamami|richiama|richiamare|richiamaci|contatta|contattare|contattaci|contattami|whatsapp|whats app|wa|numero|num|sms|scrivi|scrivimi|scrivere|verde|assistenza|operatore|ufficio|recapito|al n\.|al nr|al numero|nuovo numero|mio numero|questo numero)\b[^0-9]{0,22}$/i;
  var CODE_KW_BEFORE = /(p\.? ?iva|partita iva|c\.f\.?|cod\. ?fisc\.?|codice|code|otp|pin|password|ordine|order|ord\.|pratica|fattura|ricevuta|protocollo|tracking|traccia|spedizione|cliente|contratto|rif\.?|riferimento|\bid|cap|importo|totale|carta|conto|iban|matricola|seriale|pod|pdr|prenotazione|biglietto|posizione|verbale|targa|fiscale|tessera|n\.|nr\.?|n°|#|lotto|serie|pacco|collo|avviso|bolletta|abbonamento|utenza|cod\.)\s*[:#°.]*\s*(e|è|di|del|n\.|nr|numero|n°)?\s*[:#°.]*\s*$/i;

  /** Forma plausibile di un numero italiano scritto senza prefisso internazionale. */
  function plausibleNational(d, hasKw) {
    if (/^3\d{8,9}$/.test(d)) return true;
    if (/^0\d{5,10}$/.test(d)) return true;
    if (/^(80[03]|84[0178]|89[2459]|178|199|16[56])\d{3,7}$/.test(d)) return true;
    if (/^39[03]\d{8,11}$/.test(d)) return true;
    if (hasKw && /^\d{3,6}$/.test(d)) return true;
    return false;
  }

  /**
   * Trova i numeri di telefono nel testo evitando date, importi, codici
   * OTP, numeri d'ordine e cifre dell'IBAN (che vanno mascherati prima).
   * @param {string} text testo con link, email e IBAN mascherati
   * @param {string} defaultCountry
   * @returns {Array<{raw: string, index: number, result: object|null}>}
   */
  function extractPhones(text, defaultCountry) {
    var s = String(text);
    var W = getW();
    var re = /(?:\+|\b00)?\(?\d[\d \u00a0\t.\-()]{1,22}\d/g;
    var out = [];
    var seen = {};
    var m;
    while ((m = re.exec(s)) !== null) {
      var cand = m[0];
      var idx = m.index;
      var prev = idx > 0 ? s.charAt(idx - 1) : '';
      var after = s.slice(idx + cand.length, idx + cand.length + 6);
      if (/[A-Za-z0-9\u00c0-\u024f_/\\]/.test(prev)) continue;
      if (/^[A-Za-z0-9_\u00c0-\u024f]/.test(after)) continue;
      if (/^\s?(€|eur\b|euro|%|,\d|\.\d|:\d|\/\d|°)/i.test(after)) continue;
      var before = s.slice(Math.max(0, idx - 40), idx);
      if (/(€|eur|euro|\$|£|chf|usd)\s*$/i.test(before)) continue;
      var hasKw = PHONE_KW_BEFORE.test(before);
      if (!hasKw && CODE_KW_BEFORE.test(before)) continue;
      // date e orari
      var compactSep = cand.replace(/\s+/g, '');
      if (/^\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4}$/.test(compactSep)) continue;
      if (/^\d{4}[.\-]\d{1,2}[.\-]\d{1,2}$/.test(compactSep)) continue;
      // importi con separatore delle migliaia: 1.234.567
      if (!hasKw && /^\d{1,3}(\.\d{3})+$/.test(compactSep)) continue;
      // anni e intervalli di anni
      if (/^(19|20)\d{2}(\s*[-–]\s*(19|20)?\d{2})?$/.test(compactSep)) continue;
      var best = pickPhone(cand, hasKw, defaultCountry, W);
      if (!best) continue;
      var key = best.result && best.result.e164 ? best.result.e164 : best.raw.replace(/\D/g, '');
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ raw: best.raw, index: idx + cand.indexOf(best.raw), result: best.result });
    }
    return out;
  }

  /** Tra i gruppi di cifre del candidato sceglie la sequenza contigua più lunga che sia un numero valido. */
  function pickPhone(cand, hasKw, defaultCountry, W) {
    var trimmed = cand.replace(/^[\s()\-.]+|[\s()\-.]+$/g, '');
    var groups = trimmed.split(/[\s\u00a0\t]+/);
    var n = groups.length;
    for (var len = n; len >= 1; len--) {
      for (var i = 0; i + len <= n; i++) {
        var raw = groups.slice(i, i + len).join(' ');
        var plus = raw.charAt(0) === '+' || /^00/.test(raw.replace(/[^\d]/g, ''));
        var digits = raw.replace(/\D/g, '');
        if (plus) {
          if (digits.length < 8 || digits.length > 17) continue;
        } else if (!plausibleNational(digits, hasKw)) {
          continue;
        }
        if (!W) return { raw: raw, result: null };
        var r = W.analyze(raw, { defaultCountry: defaultCountry });
        if (r.error) continue;
        if (!r.valid && !hasKw) continue;
        return { raw: raw, result: r };
      }
    }
    return null;
  }

  /* =====================================================================
   * 4. ANALISI DEI LINK
   * ===================================================================== */

  /** Restituisce il dominio registrabile (es. "a.b.poste.it" -> "poste.it", "x.gov.it" -> "x.gov.it"). */
  function registrableDomain(host) {
    if (!host) return null;
    var labels = host.split('.');
    if (labels.length <= 2) return host;
    var last2 = labels.slice(-2).join('.');
    var last3 = labels.slice(-3).join('.');
    for (var i = 0; i < FREE_HOSTING.length; i++) {
      var fh = FREE_HOSTING[i];
      if (host === fh) return host;
      if (host.slice(-(fh.length + 1)) === '.' + fh) {
        var fl = fh.split('.').length;
        return labels.slice(-(fl + 1)).join('.');
      }
    }
    if (MULTI_SUFFIX.indexOf(last2) >= 0) return last3;
    return last2;
  }

  function endsWithDomain(host, d) {
    return host === d || host.slice(-(d.length + 1)) === '.' + d;
  }

  /**
   * Il dominio è ufficiale? Ritorna { brand, domain } oppure null.
   * Tutti i sottodomini di gov.it sono riservati alla Pubblica Amministrazione.
   */
  function officialMatch(host) {
    if (!host) return null;
    for (var u = 0; u < USER_CONTENT.length; u++) {
      if (endsWithDomain(host, USER_CONTENT[u])) return null;
    }
    for (var i = 0; i < OFFICIAL_INDEX.length; i++) {
      if (endsWithDomain(host, OFFICIAL_INDEX[i].domain)) return OFFICIAL_INDEX[i];
    }
    if (/\.gov\.it$/.test(host) || /\.gov$/.test(host) || /\.gov\.[a-z]{2}$/.test(host)) {
      return { domain: host, brand: BRAND_BY_ID.governo };
    }
    return null;
  }

  /** Il resto del nome dopo aver tolto il marchio è fatto solo di "parole da phishing"? */
  function isPhishyRemainder(rem) {
    rem = rem.replace(/[-_.\d]+/g, '');
    if (!rem) return true;
    // segmentazione con il dizionario PHISHY_WORDS
    var ok = [true];
    for (var i = 1; i <= rem.length; i++) {
      ok[i] = false;
      for (var j = Math.max(0, i - 16); j < i; j++) {
        if (ok[j] && PHISHY_SET[rem.slice(j, i)]) { ok[i] = true; break; }
      }
    }
    return ok[rem.length];
  }

  /**
   * Cerca un marchio imitato nel nome host (non ufficiale).
   * @param {string} host
   * @returns {{ brand: object, how: string, kw: string }|null}
   *   how: "subdomain" | "combo" | "typo" | "homoglyph" | "other_tld"
   */
  function checkBrandLookalike(host) {
    if (!host || officialMatch(host)) return null;
    var reg = registrableDomain(host);
    var regLabels = reg.split('.');
    var hostLabels = host.split('.');
    var subLabels = hostLabels.slice(0, hostLabels.length - regLabels.length);
    var main = regLabels[0];
    var tld = regLabels.slice(1).join('.');
    var mainDecoded = main;
    if (/^xn--/.test(main)) mainDecoded = punycodeDecode(main) || main;
    var mainSk = skeleton(mainDecoded);
    var mainPlain = mainDecoded.replace(/[^a-z0-9]/g, '');
    var tokens = mainDecoded.split(/[-_]+/).filter(Boolean);
    var tokensSk = tokens.map(skeleton);
    var suspiciousTld = SUSPICIOUS_TLDS.indexOf(tld) >= 0;
    var subTokens = [];
    subLabels.forEach(function (l) {
      var dl = /^xn--/.test(l) ? (punycodeDecode(l) || l) : l;
      dl.split(/[-_]+/).forEach(function (t) { if (t) subTokens.push(skeleton(t)); });
    });
    var best = null;
    function consider(c) {
      var rank = { homoglyph: 5, subdomain: 4, combo: 3, typo: 2, other_tld: 1 };
      if (!best || rank[c.how] > rank[best.how]) best = c;
    }
    for (var b = 0; b < BRANDS.length; b++) {
      var brand = BRANDS[b];
      for (var k = 0; k < brand.kw.length; k++) {
        var kw = brand.kw[k];
        var kwSk = skeleton(kw);
        var strict = !!STRICT_KW[kw] || kw.length < 5;
        // 1) marchio nei sottodomini di un dominio diverso: "poste.it.verifica-conto.com"
        if (subTokens.indexOf(kwSk) >= 0 && subLabels.join('.') !== 'www') {
          consider({ brand: brand, how: 'subdomain', kw: kw });
        }
        // 2) etichetta principale uguale al marchio ma con TLD diverso ("inps.com")
        if (mainPlain === kw) {
          if (suspiciousTld) consider({ brand: brand, how: 'combo', kw: kw });
          else consider({ brand: brand, how: 'other_tld', kw: kw });
          continue;
        }
        // 3) omoglifi: stesso scheletro ma caratteri diversi ("p0ste", "pаypal" cirillico)
        if (mainSk === kwSk || tokensSk.indexOf(kwSk) >= 0) {
          if (mainPlain !== kw && tokens.indexOf(kw) < 0) {
            consider({ brand: brand, how: 'homoglyph', kw: kw });
            continue;
          }
        }
        // 4) marchio + altre parole: "poste-verifica", "inpsrimborso", "netflixitalia"
        var tokIdx = tokens.indexOf(kw);
        if (tokIdx >= 0 && tokens.length > 1) {
          var restTokens = tokens.filter(function (t, i) { return i !== tokIdx; }).join('');
          if (isPhishyRemainder(restTokens) || suspiciousTld || !strict) {
            consider({ brand: brand, how: 'combo', kw: kw });
          }
          continue;
        }
        if (!strict || kw.length >= 4) {
          var pos = mainPlain.indexOf(kw);
          if (pos === 0 || (pos > 0 && pos + kw.length === mainPlain.length)) {
            var rem = mainPlain.slice(0, pos) + mainPlain.slice(pos + kw.length);
            if (isPhishyRemainder(rem)) { consider({ brand: brand, how: 'combo', kw: kw }); continue; }
          }
        }
        // 5) errori di battitura voluti: "unicredlt", "telepas", "amazom"
        if (!strict && kw.length >= 6) {
          var maxD = kw.length >= 9 ? 2 : 1;
          var cands = [mainSk].concat(tokensSk);
          for (var c = 0; c < cands.length; c++) {
            var cs = cands[c];
            if (Math.abs(cs.length - kwSk.length) > maxD || cs === kwSk) continue;
            if (editDistance(cs, kwSk) <= maxD) { consider({ brand: brand, how: 'typo', kw: kw }); break; }
          }
        }
      }
    }
    return best;
  }

  /**
   * Analizza un singolo link.
   * @param {string} raw link così come compare nel testo
   * @returns {{ raw: string, host: string|null, signals: object[], risk: "basso"|"medio"|"alto",
   *   official: {domain: string, brand: string|null, brandName: string|null}|null,
   *   lookalike: {brand: string, brandName: string, how: string}|null }}
   */
  function analyzeUrl(raw) {
    var p = parseUrl(raw);
    var host = p.host;
    var signals = [];
    var ev = raw;
    var entry = { raw: raw, host: host, signals: signals, risk: 'basso', official: null, lookalike: null };
    if (!host) {
      signals.push(sig('url_unparsable', 'Link non leggibile', 'Non riesco a capire a quale sito porta questo link.', -5, 'low', ev));
      entry.risk = 'medio';
      return entry;
    }
    if (p.obfuscated) {
      signals.push(sig('url_defanged', 'Link "disinnescato"', 'Il link è scritto in forma non cliccabile (es. hxxp o [.]): l\'ho ricostruito per analizzarlo.', 0, 'info', ev));
    }
    if (isIp(host)) {
      signals.push(sig('url_ip_host', 'Indirizzo IP al posto del nome', 'Il link porta a un indirizzo numerico (' + host + ') invece che al nome di un sito: le aziende serie non lo fanno mai.', -30, 'high', ev));
    }
    if (p.userinfo !== null) {
      // "https://www.poste.it@evil.com": un nome di sito prima della @ serve solo a ingannare -> rischio alto
      var fakeHost = /[a-z0-9-]+\.[a-z]{2,}/i.test(p.userinfo);
      signals.push(sig('url_at_sign', 'Simbolo @ nel link', 'Tutto quello che sta prima della "@" viene ignorato dal browser: "' + p.userinfo.slice(0, 40) + '@" serve solo a ingannare, il sito vero è ' + host + '.', fakeHost ? -35 : -25, 'high', ev));
    }
    var off = officialMatch(host);
    if (off && p.userinfo === null) {
      entry.official = { domain: off.domain, brand: off.brand ? off.brand.id : null, brandName: off.brand ? off.brand.name : null };
      var who = off.brand ? off.brand.name : host;
      signals.push(sig('url_official', 'Dominio ufficiale', host + ' è un dominio ufficiale' + (off.brand ? ' di ' + who : '') + '. Controlla comunque che il link sia scritto esattamente così.', 20, 'info', ev));
      if (p.scheme === 'http') {
        signals.push(sig('url_no_https', 'Connessione non cifrata', 'Il link usa http:// senza la "s": i dati viaggiano in chiaro.', -3, 'low', ev));
      }
      return finishUrl(entry);
    }
    var regd = registrableDomain(host);
    if (SHORTENERS.indexOf(host.replace(/^www\./, '')) >= 0) {
      signals.push(sig('url_shortener', 'Link accorciato', 'È un link accorciato (' + host + '): nasconde il sito di destinazione. Nei messaggi di truffa si usa proprio per non far vedere l\'indirizzo vero.', -15, 'medium', ev));
    }
    var hasPuny = host.split('.').some(function (l) { return /^xn--/.test(l); });
    var hasNonAscii = /[^\x00-\x7f]/.test(host);
    var look = isIp(host) ? null : checkBrandLookalike(host);
    if (look) {
      entry.lookalike = { brand: look.brand.id, brandName: look.brand.name, how: look.how };
      var bn = look.brand.name;
      var offList = look.brand.domains.slice(0, 2).join(' o ');
      var details = {
        subdomain: 'Il nome "' + look.kw + '" è messo all\'inizio di un indirizzo che in realtà appartiene a ' + regd + '. Il sito vero di ' + bn + ' è ' + offList + '.',
        combo: 'L\'indirizzo unisce il nome ' + bn + ' ad altre parole (' + regd + '), ma non è un sito di ' + bn + '. Il sito vero è ' + offList + '.',
        typo: 'L\'indirizzo ' + regd + ' è quasi uguale a quello di ' + bn + ' ma con lettere cambiate: è un sito sosia. Il sito vero è ' + offList + '.',
        homoglyph: 'L\'indirizzo ' + regd + ' usa numeri o lettere di altri alfabeti che sembrano uguali per imitare ' + bn + '. Il sito vero è ' + offList + '.',
        other_tld: 'L\'indirizzo ha il nome di ' + bn + ' ma un\'estensione diversa da quella ufficiale (' + offList + '): potrebbe non appartenere a ' + bn + '.'
      };
      var impact = look.how === 'other_tld' ? -15 : -35;
      signals.push(sig('url_lookalike', 'Imita ' + bn, details[look.how], impact, look.how === 'other_tld' ? 'medium' : 'high', ev));
    }
    if (hasPuny || hasNonAscii) {
      signals.push(sig('url_punycode', 'Caratteri speciali nell\'indirizzo', 'L\'indirizzo contiene lettere non latine o codificate (punycode "xn--"): è una tecnica per creare siti che sembrano identici a quelli veri.', look ? -5 : -20, 'medium', ev));
    }
    var labels = host.split('.');
    var tld = labels[labels.length - 1];
    if (SUSPICIOUS_TLDS_HIGH.indexOf(tld) >= 0 && SHORTENERS.indexOf(host) < 0) {
      signals.push(sig('url_suspicious_tld', 'Estensione del dominio a rischio', 'Il dominio finisce in ".' + tld + '", un\'estensione economica molto usata per siti di truffa e quasi mai da banche, enti o corrieri italiani.', -12, 'medium', ev));
    } else if (SUSPICIOUS_TLDS_MID.indexOf(tld) >= 0 && SHORTENERS.indexOf(host) < 0) {
      signals.push(sig('url_uncommon_tld', 'Estensione del dominio poco comune', 'Il dominio finisce in ".' + tld + '": la usano anche siti onesti, ma banche, enti e corrieri italiani usano quasi sempre .it o .com.', -5, 'low', ev));
    }
    for (var f = 0; f < FREE_HOSTING.length; f++) {
      if (endsWithDomain(host, FREE_HOSTING[f]) || (FREE_HOSTING[f].indexOf('/') < 0 && host === FREE_HOSTING[f])) {
        signals.push(sig('url_free_hosting', 'Sito su hosting gratuito', 'Il link porta a una pagina creata su un servizio gratuito (' + FREE_HOSTING[f] + '): chiunque può crearne una in pochi minuti, anche per imitare un sito noto.', -10, 'medium', ev));
        break;
      }
    }
    var subCount = labels.length - regd.split('.').length;
    if (subCount >= 3) {
      signals.push(sig('url_many_subdomains', 'Indirizzo molto lungo', 'L\'indirizzo ha molti sottodomini (' + host + '): spesso serve a far comparire un nome noto all\'inizio e nascondere il dominio vero alla fine.', -8, 'low', ev));
    }
    if (p.port && p.port !== '80' && p.port !== '443') {
      signals.push(sig('url_port', 'Porta insolita', 'Il link usa la porta ' + p.port + ': i siti normali non la indicano.', -8, 'low', ev));
    }
    var mainLabel = regd.split('.')[0];
    if (!look && (mainLabel.match(/-/g) || []).length >= 3) {
      signals.push(sig('url_many_hyphens', 'Nome del sito con molti trattini', 'Nomi come "' + mainLabel + '" sono tipici dei siti creati in fretta per una truffa.', -5, 'low', ev));
    }
    if (!look) {
      var words = mainLabel.split(/[-_]/).filter(function (w) { return w.length > 2 && PHISHY_SET[w] && ['it', 'web', 'net', 'www', 'pro', 'home', 'shop', 'store', 'news', 'info', 'live', 'now', 'go', 'me', 'my'].indexOf(w) < 0; });
      if (words.length) {
        signals.push(sig('url_phishy_words', 'Parole da phishing nel dominio', 'Il nome del sito contiene parole come "' + words.join('", "') + '": i truffatori le usano per sembrare un servizio di sicurezza o di assistenza.', -6, 'low', ev));
      }
      // marchio nel percorso di un dominio sconosciuto: example.top/poste/login
      var pathLow = (p.path || '').toLowerCase();
      if (pathLow.length > 1) {
        for (var b = 0; b < BRANDS.length; b++) {
          var hit = BRANDS[b].kw.filter(function (kw) { return kw.length >= 5 && !STRICT_KW[kw] && pathLow.indexOf(kw) >= 0; })[0];
          if (hit) {
            signals.push(sig('url_brand_in_path', 'Marchio nel percorso del link', 'Il nome "' + hit + '" compare nel percorso, ma il sito è ' + regd + ', non ' + BRANDS[b].name + '.', -6, 'low', ev));
            break;
          }
        }
      }
    }
    if (p.scheme === 'http') {
      signals.push(sig('url_no_https', 'Connessione non cifrata', 'Il link usa http:// senza la "s": i dati che inserisci viaggerebbero in chiaro.', -3, 'low', ev));
    }
    return finishUrl(entry);
  }

  function finishUrl(entry) {
    var sum = 0;
    entry.signals.forEach(function (s) { if (s.impact < 0) sum += s.impact; });
    if (entry.official && sum > -20) entry.risk = 'basso';
    else entry.risk = sum <= -30 ? 'alto' : (sum <= -10 ? 'medio' : 'basso');
    return entry;
  }

  /* =====================================================================
   * 5. ANALISI DI IBAN ED EMAIL
   * ===================================================================== */

  /**
   * Analizza un IBAN.
   * @param {{raw: string, normalized: string, lengthOk: boolean}} item
   * @param {{claimsItalian?: boolean}} ctx il messaggio dice di venire da una banca/ente italiano
   */
  function analyzeIban(item, ctx) {
    var n = item.normalized;
    var cc = n.slice(0, 2);
    var known = !!IBAN_LENGTHS[cc];
    var lengthOk = known && n.length === IBAN_LENGTHS[cc] && item.lengthOk !== false;
    var valid = lengthOk && ibanChecksumOk(n);
    var signals = [];
    var cname = COUNTRY_NAMES[cc] || cc;
    var ev = item.raw;
    if (!valid) {
      signals.push(sig('iban_invalid', 'IBAN non valido', lengthOk
        ? 'Le cifre di controllo dell\'IBAN non tornano: è sbagliato o inventato. Non fare bonifici a questo IBAN senza verificarlo.'
        : 'L\'IBAN non ha la lunghezza prevista per ' + cname + ' (' + (IBAN_LENGTHS[cc] || '?') + ' caratteri): è incompleto, sbagliato o inventato.', -20, 'medium', ev));
    }
    if (cc !== 'IT' && cc !== 'SM' && cc !== 'VA') {
      if (ctx && ctx.claimsItalian) {
        signals.push(sig('iban_foreign_mismatch', 'IBAN estero in un messaggio "italiano"', 'Il messaggio si presenta come una banca, un ente o un\'azienda italiana ma chiede un bonifico su un conto in ' + cname + ' (IBAN ' + cc + '). È lo schema tipico dei «conti sicuri» e delle finte pratiche: i soldi finiscono su conti esteri difficili da bloccare.', -25, 'high', ev));
      } else {
        signals.push(sig('iban_foreign', 'IBAN estero', 'È un conto in ' + cname + '. Non è per forza un problema (molte banche online usano IBAN esteri), ma un bonifico all\'estero è più difficile da recuperare.', -3, 'low', ev));
      }
    } else if (valid) {
      signals.push(sig('iban_valid_it', 'IBAN italiano formalmente corretto', 'L\'IBAN è scritto correttamente. Attenzione: questo NON dice nulla sull\'onestà di chi lo usa.', 0, 'info', ev));
    }
    return { raw: item.raw, normalized: n, country: known ? cc : null, validChecksum: valid, signals: signals };
  }

  /**
   * Analizza un indirizzo email (dominio del mittente o indirizzo nel testo).
   * @param {string} raw
   * @param {{brandMentioned?: boolean}} ctx il testo parla di un marchio/ente
   */
  function analyzeEmail(raw, ctx) {
    var addr = refang(raw).toLowerCase();
    var domain = addr.slice(addr.lastIndexOf('@') + 1);
    var signals = [];
    var off = FREEMAIL.indexOf(domain) >= 0 ? null : officialMatch(domain);
    var ev = raw;
    if (FREEMAIL.indexOf(domain) >= 0 && !(ctx && ctx.brandMentioned)) {
      signals.push(sig('email_freemail', 'Casella email personale', '@' + domain + ' è un servizio di posta gratuito: chiunque può creare un indirizzo così. Va bene per privati, non per banche, enti o aziende.', 0, 'info', ev));
    }
    if (off) {
      signals.push(sig('email_official', 'Dominio email ufficiale', '@' + domain + ' è un dominio ufficiale' + (off.brand ? ' di ' + off.brand.name : '') + '. Attenzione: il mittente di un\'email può essere falsificato, controlla sempre i link.', 10, 'info', ev));
    } else {
      var look = checkBrandLookalike(domain);
      if (look) {
        signals.push(sig('email_lookalike', 'Email che imita ' + look.brand.name, 'Il dominio @' + domain + ' imita ' + look.brand.name + ' ma non è ufficiale (il vero è ' + look.brand.domains[0] + ').', look.how === 'other_tld' ? -15 : -30, 'high', ev));
      }
      if (FREEMAIL.indexOf(domain) >= 0 && ctx && ctx.brandMentioned) {
        signals.push(sig('email_freemail_impersonation', 'Casella email personale', 'Il messaggio parla a nome di un\'azienda o di un ente ma usa un indirizzo gratuito (@' + domain + '): banche, enti e forze dell\'ordine non scrivono da caselle Gmail, Libero, Outlook e simili.', -15, 'medium', ev));
      }
      var tld = domain.split('.').pop();
      if (SUSPICIOUS_TLDS.indexOf(tld) >= 0) {
        signals.push(sig('email_suspicious_tld', 'Estensione del dominio a rischio', 'Il dominio email finisce in ".' + tld + '", molto usato per truffe.', -8, 'medium', ev));
      }
    }
    return { raw: raw, domain: domain, signals: signals };
  }

  /* =====================================================================
   * 6. INDIZI TESTUALI (CUE) E RILEVATORI DEI COPIONI DI TRUFFA
   *    Le regex lavorano sul testo normalizzato (minuscolo, senza accenti).
   *    Un singolo indizio non basta mai: i rilevatori combinano argomento,
   *    pressione (urgenza/minacce) e "canale" (link, numero, pagamento).
   * ===================================================================== */

  var G = '(?:\\S{1,40} )'; // una parola qualsiasi seguita da spazio (limitata: niente backtracking quadratico)
  function R(src) {
    // quantificatori limitati: evitano tempi quadratici su testi patologici (lunghe file di cifre o lettere)
    src = src.replace(/\\S\*/g, '\\S{0,30}').replace(/\\d\+/g, '\\d{1,12}').replace(/\\d\{(\d+),\}/g, '\\d{$1,12}');
    return new RegExp(src.replace(/~/g, G), 'g');
  }

  /**
   * Dizionario degli indizi. negatable: ignora se preceduto da "non"/"mai".
   * notAfter: ignora se seguito (entro 40 caratteri) da questo schema.
   */
  var CUES = {
    courier: { re: R('\\b(poste ?italiane|poste|brt|bartolini|gls|sda|dhl|inpost|ups|fedex|tnt|nexive|corriere|corrieri|amazon logistics|poste delivery|punto poste|locker)\\b') },
    parcel: { re: R('\\b(pacc(o|hi|hetto|ketto)|spedizion[ei]|consegn[ae]|consegnare|giacenza|collo|ritiro|tracking|tracciamento|spedit[oa]|recapit[oa]|ordine|parcel|package|delivery)\\b') },
    parcel_problem: { re: R('(\\bin giacenza|\\bgiacenza\\b|non (e )?(stat[oa] )?(possibile )?(consegnar|consegnat|recapitat|effettuare la consegna)|consegna ~{0,1}(non (riuscita|effettuata|andata a buon fine|completata)|fallita|sospesa|in sospeso|bloccata|annullata|rimandata)|mancata consegna|indirizzo ~{0,2}(incomplet|errat|non (corrett|valid|complet)|mancant|sbagliat|insufficient|inesatt)|tentativo di consegna|(spese|costi|cost[oi]|tass[ae]|dazi|diritti|commissione|contributo) ~{0,2}(di )?(sdoganamento|doganal|dogana|riconsegna|giacenza|svincolo|spedizione)|sdoganament|svincol|trattenut[oa] (in|alla|presso) (dogana|magazzino|deposito)|\\b(aggiorn|conferm|verific|complet|inseri|modific)(?!at[oaie]\\b|it[oaie]\\b)\\S* ~{0,3}(indirizzo|dati di (consegna|spedizione)|recapito)|riprogramma|nuova consegna|(pacco|spedizione|collo|ordine) ~{0,2}(bloccat|trattenut|sospes|fermo|in attesa di (pagamento|conferma)|non consegnat|in sospeso|rispedit|restituit))') },
    small_fee: { re: R('((^|[^\\d.,])[0-4][.,]\\d{2} ?(€|eur\\b|euro\\b)|(€|\\beur\\b) ?[0-4][.,]\\d{2}\\b|\\b[0-4] ?(€|euro\\b)|piccol[oa] (pagamento|importo|tassa|contributo|somma|commissione)|(paga|pagare|versare|costo di) (solo|soli|appena) \\d)') },
    bank: { re: R('\\b(banca|banche|bancari[oa]|bancoposta|banco ?posta|bancomat|poste ?pay|postepay|posteid|poste ?italiane|poste|intesa|sanpaolo|unicredit|bnl|mps|monte (dei )?paschi|bper|fineco|nexi|mediolanum|credem|banco ?bpm|bpm|credit agricole|ing direct|hype|n26|revolut|isybank|widiba|webank|paypal|satispay|american express|amex|visa|mastercard|carta (di credito|di debito|prepagata|bancomat)|home ?banking|internet banking|conto (corrente|online|bancoposta|deposito)|(tuo|vostro|suo|il|sul|del) conto|istituto (bancario|di credito)|ufficio (sicurezza|antifrode|frodi)|antifrode|servizio sicurezza|carta)\\b') },
    account_problem: { re: R('((conto|carta|account|utenza|accesso|profilo|app|applicazione|dispositivo|home ?banking|bancoposta|postepay|posteid|servizi[oi]?|identita|spid|credenziali) ~{0,3}(bloccat|sospes|limitat|disattivat|scadut|in scadenza|disabilitat|congelat|violat|compromess|sotto attacco|a rischio|non (e )?(stat[oa] )?verificat)|\\b(blocco|sospensione|limitazione|disattivazione|chiusura) ~{0,3}(conto|carta|account|utenza|servizi|accesso|app|profilo)|accesso ~{0,1}(anomal|sospett|non autorizzat|insolit|irregolar|da (un )?(nuovo )?dispositivo)|(operazion[ei]|transazion[ei]|pagament[oi]|moviment[oi]|bonific[oi]|addebit[oi]|tentativ[oi] di accesso|attivita|prelievo|acquisto) ~{0,3}(sospett|anomal|non autorizzat|insolit|irregolar|fraudolent|non riconosciut|in attesa di (conferma|autorizzazione|verifica))|nuovo dispositivo|\\bverific(?!at[oaie]\\b|it[oaie]\\b)\\S* ~{0,2}(identita|dati|account|profilo|credenziali)|\\b(verific|sblocc|riattiv|riabilit|certific)(?!at[oaie]\\b|it[oaie]\\b)\\S* ~{0,3}(profilo|account|conto|carta|identita|credenziali|app|posteid|spid)|adeguament[oi] ~{0,2}(sicurezza|normativ|psd2)|misure di sicurezza|\\bpsd2\\b|carta (in )?scadut|abbiamo (rilevato|registrato|riscontrato|notato)|(e stat[oa]|sono stat[ie]) (rilevat|registrat|riscontrat)|rilevat[oa] (un|una) )') },
    did_you_authorize: { re: R('(se non (sei stat[oa] tu|sei tu|e stat[oa] lei|e lei|hai (effettuato|autorizzato|richiesto|disposto|fatto)|ha (effettuato|autorizzato|richiesto|disposto))|non riconosc|non sei stat[oa] tu|in caso (contrario|di mancato riconoscimento)|per (annullare|bloccare|bloccarla|annullarla|disconoscere)|annulla(re)? (l\'|la |il )?(operazione|transazione|pagamento|richiesta)|disconosc)') },
    safe_account: { re: R('(conto ~{0,1}(sicur|protett|tecnic|di appoggio|temporane|blindat|di transito|dedicat|di sicurezza)|mett(ere|iamo|ete|i) ~{0,3}al sicuro|(spost|trasferi|mett|vers)\\S* ~{0,4}(soldi|risparmi|fondi|denaro|liquidita|saldo|somma) ~{0,3}(su|in|sul|nel|verso) (un |una )?(nuovo |altro |diverso )?conto|proteggere (i )?(tuoi )?(soldi|risparmi|fondi))') },
    operator: { re: R('(operatore|operatrice|funzionari[oa]|consulente|addett[oa]|ufficio (sicurezza|antifrode|frodi)|reparto (sicurezza|antifrode)|servizio clienti|assistenza clienti|centrale operativa|maresciallo|ispettore|agente)') },
    call_request: { re: R('((chiam|richiam|contatt|telefon|rivolg)\\S* ~{0,5}(numero|n\\.|nr|al|il|operatore|assistenza|servizio|ufficio|subito|\\d)|numero verde|chiamaci|contattaci|richiamaci|chiamami|richiamami|contattami)') },
    gov: { re: R('\\b(inps|agenzia (delle )?entrate|agenziaentrate|riscossione|equitalia|ministero|mef|governo|comune di|pagopa|pago ?pa|app io|spid|cassetto fiscale|fisco|erario|tesoreria|ufficio (tributi|imposte)|guardia di finanza|motorizzazione|aci|pra|asl|inail|irpef|modello 730|730|dichiarazione dei redditi|naspi|assegno unico|isee|cud|fascicolo sanitario|tessera sanitaria)\\b') },
    money_owed: { re: R('(rimbors|accredit|\\bbonus\\b|indennit|restituzion|credito (d\'imposta|fiscale)|aventi? diritto|hai diritto|ha diritto|beneficiari|somma ~{0,2}(favore|spettante|disposizione)|eccedenza|ti spett|le spett|spettant|naspi|assegno unico|arretrat|pagamento (in tuo favore|a tuo favore|a suo favore)|da riscuotere|riscuoter|incassa(re)?\\b)') },
    fine_due: { re: R('(\\bmult[ae]\\b|sanzion|contravvenzion|verbal[ei]|pedaggi|insolut|mancato pagamento|pagamento ~{0,2}(in sospeso|pendente|non (riuscito|effettuato|andato)|scadut|arretrat|mancante|omesso)|fattur[ae] ~{0,1}(scadut|non pagat|insolut)|cartell[ae] (esattorial|di pagamento)|avviso di pagamento|interessi di mora|\\bmora\\b|bollo auto|tassa (auto|automobilistica|rifiuti)|\\btari\\b|importo (dovuto|residuo|da (pagare|saldare|regolarizzare))|regolarizza|da saldare|saldare)') },
    toll: { re: R('(telepass|autostrad|free ?to ?x|pedaggi|casello|unipol ?move|movyon|viacard)') },
    police_local: { re: R('(polizia (municipale|locale|stradale)|vigili|\\bztl\\b|autovelox|tutor|codice della strada)') },
    data_update: { re: R('\\b(aggiorn|conferm|verific|inseri|compil|complet|regolarizz|fornisc|fornir|indic|certific|convalid|sincronizz|valid)(?!at[oaie]\\b|it[oaie]\\b)\\S* ~{0,4}(dati|iban|informazioni|posizione|pratica|modulo|documento|documenti|profilo|anagrafica|metodo di pagamento|carta|credenziali|coordinate)') },
    click: { re: R('(clicca|cliccare|clicchi|\\bacceda|\\bclick|\\bclic\\b|tocca|premi|accedi|accedere|segui il link|link ~{0,1}(qui )?sotto|al (seguente|questo) link|tramite (il )?link|vai (su|al link|sul sito)|visita|collegati|apri il link|link:|qui:|->)') },
    urgency: { re: R('(entro (le |i |e non oltre )?(\\d{1,2}|ventiquattro|quarantotto) ?(ore|h|minuti|min)\\b|entro (oggi|domani|stasera|stanotte|mezzanotte|fine giornata|24|48|72)|\\b(24|48|72) ?(ore|h)\\b|immediatamente|urgent|ultimo avviso|ultimo (giorno|richiamo|sollecito)|ultima (possibilita|occasione|chance|notifica|chiamata)|scade (oggi|domani|a breve|tra poco|stasera)|scadra (oggi|domani|a breve|tra)|tempo limitato|al piu presto|prima possibile|\\basap\\b|avviso finale|termine ultimo|(solo|ancora) (poche ore|oggi|pochi minuti)|ultimissim|in tempi brevi|senza ulteriore (preavviso|avviso)|fai presto|sbrigati|\\bsubito\\b)') },
    threat: { re: R('(sospension|\\bsospes[oa]\\b|bloccat|\\bblocco\\b|chiusura (del|dell|definitiva)|(verra|sara|saranno|verranno) ~{0,1}(chius|sospes|bloccat|disattivat|cancellat|eliminat|addebitat|restituit|rispedit|distrutt|applicat|avviat|trasmess|segnalat|inoltrat|pubblicat|inviat)|denunc|querel|procediment[oi] (penal|legal|giudiziar)|azion[ei] legal|sanzion|pignorament|fermo amministrativo|recupero crediti|ufficiale giudiziario|\\barrest|mandato di|indagin|indagat|perderai|perdita (definitiva|del)|definitivamente|rispedit[oa] al mittente|restituit[oa] al mittente|disattivazion|conseguenze (legali|penali)|segnalazione (alle autorita|alla polizia|al crif|in centrale rischi)|\\bcrif\\b|cattivi pagatori|maggiorazion|interessi di mora|riciclaggio|frode in corso)') },
    otp_request: {
      re: R('(\\b(invi|mand|gir[aio]|inoltr|dimmi|dammi|dic[ai]\\b|dir[eci]|dar[mec]|comunic|rimand|pass[ai]|legg|dett|rifer|condivid|fornisc|fornir|riport|ripet)\\S* ~{0,6}(otp\\b|pin\\b|password|passw|credenzial|codic[ei] ~{0,2}(verifica|sicurezza|conferma|accesso|otp|sms|whatsapp|attivazione|autorizzazione|cifre|ricevut|arrivat|appena)|codice (che )?(ti |le |vi )?(e |hai |ha |sono )?(arriv|ricev|appena)|codice ~{0,3}sms|codice (a|di) (\\d|sei|6) cifre)|\\bci (comunic|dic|legg|conferm|fornisc|fornir|dett|ripet|invi|mand|gir)\\S* ~{0,4}(otp\\b|pin\\b|password|passw|credenzial|codic[ei] ~{0,2}(verifica|sicurezza|conferma|accesso|otp|sms|whatsapp|attivazione|autorizzazione|cifre|ricevut|arrivat|appena)|codice (che )?(ti |le |vi )?(e |hai |ha |sono )?(arriv|ricev|appena)|codice ~{0,3}sms|codice (a|di) (\\d|sei|6) cifre)|\\b(mi|ci) (puoi |potresti |puo |potrebbe )?(conferm\\S*|ripet\\S*) ~{0,2}(otp\\b|pin\\b|password|passw|credenzial|codic[ei] ~{0,2}(verifica|sicurezza|conferma|accesso|otp|sms|whatsapp|attivazione|autorizzazione|cifre|ricevut|arrivat|appena)|codice (che )?(ti |le |vi )?(e |hai |ha |sono )?(arriv|ricev|appena)|codice ~{0,3}sms|codice (a|di) (\\d|sei|6) cifre)|\\bmi (puoi |potresti )?(giri|mandi|invii|dici|dai|passi|scrivi|inoltri|leggi|detti|comunichi|rimandi|riferisci|girare|mandare|inviare|dire|dare|passare|scrivere|inoltrare|leggere|dettare|comunicare) ~{0,4}(otp\\b|pin\\b|password|passw|credenzial|codic[ei] ~{0,2}(verifica|sicurezza|conferma|accesso|otp|sms|whatsapp|attivazione|autorizzazione|cifre|ricevut|arrivat|appena)|codice (che )?(ti |le |vi )?(e |hai |ha |sono )?(arriv|ricev|appena)|codice ~{0,3}sms|codice (a|di) (\\d|sei|6) cifre)|\\b(mi|ci) (serv(e|ono|irebbe|irebbero)|occorr(e|ono)) ~{0,3}(otp\\b|pin\\b|password|passw|credenzial|codic[ei]\\b)|\\bme lo (puoi |potresti )?(mandi|giri|invii|passi|dici|inoltri|rimandi|scrivi|detti|leggi|comunichi|mandare|girare|inviare|passare|dire|inoltrare|rimandare|scrivere|dettare|leggere|comunicare)|(per sbaglio|per errore) ~{0,8}(codice|sms)|(codice|sms) ~{0,8}(per sbaglio|per errore))'),
      negatable: true
    },
    otp_protective: { re: R('(non (comunicar|condivider|divulgar|dar|fornir|rivelar|ceder|inoltrar|girar)|(non|mai) ~{0,3}(chiederemo|chiediamo|chiede|chiedera|chiederanno|richiediamo|richiederemo|chiedono)|mai (comunicare|condividere|fornire|dare|a nessuno)|nessun (operatore|dipendente|addetto)|a nessuno)') },
    risky_method: { re: R('(ricaric(a|he|are) ~{0,2}(postepay|poste ?pay|paysafe|prepagata)|\\bpostepay\\b|poste ?pay|paysafe ?card|paysafe|gift ?card|carte? regalo|buon[oi] ~{0,1}(amazon|apple|itunes|google ?play|steam)|google ?play|itunes|\\bsteam\\b|bitcoin|\\bbtc\\b|\\bcrypto|\\bcripto|criptovalut|\\busdt\\b|tether|ethereum|binance|coinbase|western union|money ?gram|ria money|bonifico (istantaneo|immediato|urgente|veloce)|codic[ei] ~{0,1}(ricarica|gift ?card|carta regalo|voucher|paysafe)|\\bwallet\\b|portafoglio (digitale|crypto|bitcoin))') },
    risky_payment_request: {
      re: R('(\\b(paga|pagare|pagate|devi|dovrai|dovete|occorre|necessario|bisogna|effettua|effettuare|versa|versare|invia|inviare|inviaci|inviami|mandaci|mandami|manda|mandare|acquista|acquistare|compra|comprare|comprami|fammi|mi fai|puoi fare|puoi farmi|potresti fare|trasferisci|trasferire|deposita|depositare|ricaricare|ricaricami|caricare)(?!t[oaie]\\b|at[oaie]\\b)\\S* ~{0,6}(postepay|poste ?pay|ricarica|paysafe|gift ?card|carte? regalo|buon[oi] (amazon|apple|itunes|google|steam)|google ?play|itunes|\\bsteam\\b|bitcoin|\\bbtc\\b|crypto|cripto|usdt|western union|money ?gram|bonifico (istantaneo|immediato|urgente)|codic[ei] (della )?(ricarica|gift)))'),
      notAfter: /(effettuat|eseguit|ricevut|accreditat|completat|andat[ao] a buon fine)/
    },
    family: { re: R('(ciao (ma|pa)\\b|ciao sono io|\\b(mam+[aeiy]+|mammin[ae]|mom|mum|ma\'|pap+[aiy]+|papin[oe]|babbo|pa\'|nonn[aoi]|figli[oa]|zi[ao])\\b)') },
    relative: { re: R('\\b(nipote|nipoti|figli[oa]|marito|moglie|fratello|sorella|suocer[oa]|nonn[ao]|genero|nuora|cugin[oa]|zi[ao])\\b') },
    emergency: { re: R('(incidente|arrestat|in arresto|fermat[oa] dai|in caserma|in questura|in ospedale|ricoverat|pronto soccorso|cauzione|\\bavvocat|investit[oa] (un|una)|ha investito|risarciment|rischia (il carcere|la galera)|in carcere)') },
    collect: { re: R('((mand|invi)\\S* ~{0,3}(corriere|qualcuno|collega|incaricat|avvocat|persona) ~{0,3}(a |per )?ritir|passer\\S* ~{0,3}(a )?ritirar|ritirar(li|le|e) ~{0,4}(soldi|denaro|contanti|oro|gioielli|a casa)|\\bcontanti\\b|gioielli|\\boro\\b)') },
    new_number: { re: R('(nuovo numero|numero nuovo|cambiato ~{0,2}(numero|telefono|cellulare|cell|sim|smartphone|operatore)|(telefono|telefonino|cellulare|\\bcell\\b|\\btel\\b|smartphone|iphone|\\bsim\\b|schermo) ~{0,3}(rott|cadut|pers[oa]\\b|smarrit|guast|in riparazione|rubat|non funziona|bagnat|distrutt|danneggiat|in assistenza)|(rott|cadut|pers|smarrit|rubat)\\S* ~{0,2}(il |lo |la )?(mio )?(telefono|telefonino|cellulare|\\bcell\\b|\\btel\\b|smartphone|iphone|\\bsim\\b|schermo)|(scrivo|ti scrivo|uso) (dal |con il |col )?(telefono|cellulare|numero|cell) (di|del|della|dello) (un |una |mio |mia )?(amic|collega|compagn|fidanzat|ragazz|vicin)|(quest[oa]|\\bqst|\\bqsto|\\bsto) (e )?(il )?(mio )?(nuovo|numero (nuovo|temporaneo|provvisorio)|numero di un amic|numero della mia amic)|numero (temporaneo|provvisorio)|salva(lo|mi|re)? ~{0,2}(questo|nuovo|numero)|memorizza(lo|mi|re)? ~{0,2}(questo|nuovo|numero)|(cancella|elimina) ~{0,2}(vecchio|altro) numero|vecchio numero|non (ho|uso) piu (il )?(vecchio|mio|quel) numero)') },
    write_whatsapp: { re: R('(whats ?app|\\bwa\\b|\\bwapp\\b|\\bwup\\b|watsap|whatsap|telegram|scrivimi|scrivi(mi)? ~{0,3}(qui|questo|qst|numero|su)|contattami (qui|su|a questo)|mandami (un )?(messaggio|msg|vocale)|messaggiami|wa\\.me)') },
    money_ask: { re: R('(bonific|\\bpagare\\b|pagament|fattura|bolletta|\\bsoldi\\b|prestito|prest(i|ami|armi)\\b|anticipar|anticip(i|ami)\\b|ti (restituisco|ridaro|rido|rendo|ripago)|te li (ridaro|rido|rendo|restituisco)|\\biban\\b|ricarica|non riesco (a |ad )?(fare|pagare|accedere|entrare)|\\d+ ?(€|euro\\b)|(€|euro) ?\\d+|mi (serve|servono) ~{0,1}(soldi|euro|\\d)|urgente da pagare)') },
    prize: { re: R('(\\bvint[oai]\\b|vincit|\\bpremi[oi]?\\b|in regalo|omaggi|\\bgratis\\b|gratuit|buon[oi] (regalo|sconto|acquisto|amazon|da)|gift ?card|carta regalo|coupon|voucher|iphone|samsung|playstation|\\bps5\\b|airpods|dyson|macbook|estrazion|lotteri|fortunat|congratulazion|complimenti|sondaggi|questionari|ricompens|fedelta|cliente (fedele|selezionat)|selezionat[oa]|esclusiv|riservat[oa] (a te|per te))') },
    prize_strong: { re: R('(hai vinto|(ti|vi) regal(a|iamo)|regaliamo|in regalo per te|avete vinto|ha vinto un|sei (stat[oa] )?(selezionat|estratt|scelt)|sei (il|la|tra i) ~{0,1}(vincit|fortunat|selezionat)|vincitor|vincitric|(ti|le) (e stat[oa]|sono stat[ie]|abbiamo) (assegnat|riservat)|riscuot|ritira(re)? (il |l\')?(tuo )?(premio|regalo|omaggio)|(reclama|richiedi) (il |l\')?(tuo )?(premio|regalo|omaggio)|premio ~{0,1}(in attesa|non (ancora )?ritirat|ti aspetta)|(iphone|samsung|ps5|playstation|macbook|airpods|dyson|buono|gift ?card) ~{0,3}(gratis|omaggio|in regalo|a soli|a 1|per 1|vinto))') },
    subscription_brand: { re: R('\\b(netflix|disney|spotify|dazn|now ?tv|amazon ?prime|prime video|prime|apple|icloud|apple ?id|itunes|enel|eni|plenitude|edison|a2a|hera|acea|iren|sorgenia|tim|vodafone|windtre|wind|iliad|fastweb|kena|ho mobile|very mobile|sky|tiscali|aruba|microsoft|outlook|office ?365|google|gmail|dropbox|bolletta|bollette|abbonamento|fornitura|utenza|contatore|luce e gas|casella (email|di posta)|posta elettronica)\\b') },
    subscription_problem: { re: R('(pagamento ~{0,2}(non (riuscito|andato|autorizzato|accettato|completato|elaborato)|rifiutat|respint|fallit|declinat|sospes)|impossibile (elaborare|addebitare|completare|processare|rinnovare)|(abbonamento|account|iscrizione|membership|servizio|fornitura|utenza|linea|\\bsim\\b|casella|spazio|archiviazione|icloud) ~{0,4}(sospes|scadut|in scadenza|bloccat|disattivat|cancellat|annullat|limitat|eliminat|chius|pien[oa])|\\b(aggiorn|verific|conferm|inseri)(?!at[oaie]\\b|it[oaie]\\b)\\S* ~{0,3}(metodo di pagamento|dati di pagamento|carta|informazioni di (pagamento|fatturazione)|fatturazione)|rinnov[oa] ~{0,2}(fallit|non riuscit)|interruzione ~{0,2}(fornitura|servizio)|distacco|spazio ~{0,2}(esaurit|pieno)|casella ~{0,1}pien|eccedenza|doppio (pagamento|addebito)|pagato due volte|\\brimbors)') },
    invest: { re: R('(investi|investiment|trading|trader|broker|piattaforma ~{0,2}(trading|investiment|crypto|finanziari)|criptovalut|\\bcripto|bitcoin|\\bcrypto|forex|\\bazion[ei]\\b|\\bborsa\\b|portafoglio ~{0,1}(titoli|investiment|crypto)|consulente (finanziari|di investiment)|analista|esperto (finanziari|di trading)|segnali (di )?trading|rendiment|\\brendita|capitale|profitt|deposito iniziale)') },
    invest_promise: { re: R('((guadagn|rendiment|profitt|ricav|entrat|reddit|incass)\\S* ~{0,5}(garantit|sicur|certo|certi\\b|passiv|ogni (giorno|settimana|mese)|al (giorno|mese)|a settimana|settimanal|giornalier|mensil)|\\b\\d{2,3} ?% ~{0,3}(al (mese|giorno)|a settimana|garantit|settimanal|mensil|giornalier|in (pochi|\\d+) (giorni|settimane))|senza (alcun )?rischi|rischio zero|zero rischi|soldi facili|guadagn\\S* facil|facili guadagni|diventa(re)? ricc|liberta finanziaria|raddoppia|triplica|moltiplica|(con|da|investendo) (soli |solo |appena )?\\d+ ?(€|euro|eur)\\S* ~{0,6}(\\d{3,}|\\d+\\.\\d{3}) ?(€|euro|eur)|(investi|deposita|inizia con|versa|bastano) ~{0,2}(soli |solo |appena )?\\d{2,3} ?(€|euro))') },
    invest_context: { re: R('(elon musk|\\bmusk\\b|bill gates|warren buffett|mattarella|meloni|draghi|famos[oa]|\\bvip\\b|gruppo ~{0,1}(vip|telegram|whatsapp|segnali|investiment)|whatsapp|telegram|algoritmo|intelligenza artificiale|\\bia\\b|robot|\\bbot\\b|quantum|segreto|esclusiv)') },
    job: { re: R('(offert[ae] di lavoro|lavor[oi] ~{0,2}(da casa|part ?time|online|flessibil|semplic|remot|smart|extra)|lavora(re)? da casa|part ?time|opportunita ~{0,2}(lavor|guadagn)|posizion[ei] (aperta|disponibil|lavorativ)|stiamo (cercando|assumendo|selezionando)|\\bcerchiamo\\b|reclutator|recruiter|\\bhr\\b|risorse umane|selezion(e|iamo) ~{0,2}(personale|candidat)|assunzion|retribuzion|paga (giornaliera|oraria|settimanale)|guadagno (giornaliero|extra|settimanale)|compenso|commission|collaborator|agenzia (per il lavoro|di reclutamento)|freelance|guadagnare (da casa|online|extra)|nessuna esperienza (\\S+ )?(richiesta|necessaria)|senza esperienza)') },
    job_task: { re: R('(mett\\S* ~{0,2}(like|mi piace|cuore)|\\bmi piace\\b|\\blike\\b|\\bfollow|segui(re)? ~{0,2}(account|canal|profil|pagin)|iscriv\\S* ~{0,2}canal|recension|valutazion|(video|canali|profili) ~{0,2}(tiktok|youtube|instagram)|tiktok|youtube|compiti (semplici|online)|\\btask\\b|missioni|attivita semplic|ordin[ie] (da completare|simulat)|screenshot|schermat)') },
    job_pay: { re: R('(\\d+ ?(€|euro\\b|eur\\b) ~{0,2}(al giorno|a giorno|giornalier|al di\\b|ogni giorno|a settimana|settimanal|per (ogni |ciascun |ciascuno )?(mettere |fare |lasciare |scrivere |guardare )?(un |dei |qualche |\\d+ )?(like|mi piace|video|compit|recension|task|attivita))|\\d+ ?(-|a) ?\\d+ ?(€|euro\\b|eur\\b)|(guadagn|pag|retribu|compens|offr)\\S* ~{0,3}(\\d+ ?(€|euro\\b|eur\\b)|giornalier|settimanal|al giorno|subito|immediat))') },
    sex_crime: { re: R('(pedopornograf|pedofil|minorenni|minori\\b|pornograf|siti ~{0,1}(per adulti|pornografic|porno|a luci rosse)|contenuti ~{0,1}(per adulti|pornografic|sessual|espliciti|intimi)|esibizionism|cyberpornograf|materiale ~{0,1}(pedopornografic|sessual|intim|compromettent)|video ~{0,2}(intim|compromettent|osceni|espliciti|privat)|webcam|masturba|(ti|la|l\') (ho|abbiamo) ~{0,1}(registrat|filmat|ripres)|(ho|abbiamo) ~{0,1}(accesso|hackerato|violato|infettato|preso il controllo) ~{0,3}(dispositiv|computer|telefono|account|email|pc)|registrat\\S* ~{0,2}video|malware|trojan|spyware|\\bhacker\\b|\\bporno\\b|adescamento)') },
    extortion: { re: R('((paga|versa|trasferi|invia|manda|trasmett)\\S* ~{0,8}(bitcoin|\\bbtc\\b|crypto|cripto|euro\\b|€|\\d{3,})|(pubblic|invi|condivid|diffond|mand|inoltr)\\S* ~{0,6}(video|foto|immagini|registrazion)\\S* ~{0,6}(contatti|amici|famiglia|parenti|colleghi|social)|(a tutti i |ai )(tuoi )?contatti|portafoglio (bitcoin|btc|crypto)|\\bwallet\\b|indirizzo (bitcoin|btc))') },
    police: { re: R('(polizia|carabinier|guardia di finanza|\\bgdf\\b|interpol|europol|tribunal|procura|magistrat|\\bgiudic|cybercrime|cyber crime|ministero ~{0,1}interno|questura|commissariat|forze dell\'ordine|\\bcnaipic\\b|dipartimento ~{0,1}(pubblica sicurezza|polizia)|sostituto procuratore|capo della polizia)') },
    convocation: { re: R('(convocazion|citazione|\\bmandato\\b|avviso di garanzia|procediment\\S* (penal|giudiziar)|sei (stat[oa] )?(indagat|accusat|convocat|denunciat|segnalat)|e stat[oa] ~{0,1}(indagat|accusat|convocat|denunciat|apert[oa] (un|una) (procediment|indagin|fascicol))|a (suo|tuo) carico|giustificazion|giustificar|archiviazion|\\bpena\\b|\\breat[oi]\\b|fascicolo|sequestro|ingiunzion|notifica (giudiziaria|legale))') },
    romance_affection: { re: R('(\\bamore\\b|\\btesoro\\b|cara mia|mia cara|caro mio|mio caro|ti amo|mi manchi|anima gemella|mia regina|principessa|\\bspos(ar|iam|erem|ero)|sei (davvero |molto |cosi |proprio )?special|vederti|incontrarti|abbracciarti|\\bbaci\\b|\\bbacio\\b|cuore mio|dolcezza|mia dolce|vita mia)') },
    romance_context: { re: R('(militar|soldat|missione ~{0,1}(onu|nato|di pace|in|all\'estero)|piattaforma (petrolifera|offshore)|offshore|ingegnere ~{0,2}(navale|petrol|offshore|estero)|medico ~{0,2}(missione|senza frontiere|onu)|vedov|\\bsiria\\b|afghanistan|yemen|\\biraq\\b|conosciut\\S* ~{0,2}(online|su (facebook|instagram|tinder|meetic|badoo|internet))|\\b(tinder|meetic|badoo)\\b|app di incontri|non vedo l.ora di (incontrarti|conoscerti|vederti|abbracciarti)|appena (arrivo|torno) in italia|venire (da te|in italia)|eredita|lingotti|pacco (diplomatico|con (soldi|oro|regali))|diplomatic|bloccat[oa] (in|all\'|alla|a) )') },
    romance_money: { re: R('(bonifico|western union|money ?gram|ria money|gift ?card|carte? regalo|ricarica|bitcoin|crypto|spese ~{0,2}(mediche|ospedalier|doganal|legali|di spedizione|di viaggio|del visto)|biglietto (aereo|del volo)|\\bvisto\\b|tasse doganali|\\bdogana\\b|(sbloccare|svincolare) ~{0,3}(eredita|conto|pacco|fondi|soldi|bagaglio)|prestar(mi)? ~{0,2}\\d+|aiut\\S* ~{0,2}(economic|con (i )?soldi|a pagare)|mi servono ~{0,2}(\\d+|soldi)|\\d{3,} ?(€|euro|dollari|\\$)|(€|\\$) ?\\d{3,})') }
  };

  /**
   * Cerca tutti gli indizi nel testo normalizzato.
   * @returns {Object<string, {evidence: string, count: number, distinct: number}>}
   */
  function detectCues(N) {
    var hits = {};
    var s = N.s;
    Object.keys(CUES).forEach(function (id) {
      var cue = CUES[id];
      var re = cue.re;
      re.lastIndex = 0;
      var m;
      var found = null;
      var distinct = {};
      var guard = 0;
      while ((m = re.exec(s)) !== null && guard++ < 200) {
        if (m[0] === '') { re.lastIndex++; continue; }
        var start = m.index;
        var end = m.index + m[0].length;
        if (cue.negatable) {
          var pre = s.slice(Math.max(0, start - 22), start);
          if (/\b(non|mai|nessuno|ne)\b[^.!?]*$/.test(pre)) continue;
          var post = s.slice(end, end + 18);
          if (/^[^.!?]{0,6}\b(a nessuno|mai)\b/.test(post)) continue;
        }
        if (cue.notAfter && cue.notAfter.test(s.slice(end, end + 40))) continue;
        distinct[m[0].trim()] = 1;
        if (!found) {
          var ws = start;
          var we = end;
          while (ws > 0 && /[a-z0-9]/.test(s.charAt(ws - 1)) && /[a-z0-9]/.test(s.charAt(ws))) ws--;
          while (we < s.length && /[a-z0-9]/.test(s.charAt(we)) && /[a-z0-9]/.test(s.charAt(we - 1))) we++;
          found = { evidence: evidenceOf(N, ws, we), index: start, count: 0 };
        }
        found.count++;
      }
      if (found) {
        found.distinct = Object.keys(distinct).length;
        hits[id] = found;
      }
    });
    return hits;
  }

  /** Punti di un link nel copione: sconosciuto 0.75, rischio medio 2.25, alto 3.5. */
  function linkPoints(ctx) {
    if (!ctx.linkAny) return 0;
    if (ctx.linkRisk === 'alto') return 3.5;
    if (ctx.linkRisk === 'medio') return 2.25;
    return 0.75;
  }

  function P(cond, n) { return cond ? n : 0; }

  /**
   * Rilevatori dei copioni. Ognuno ritorna null oppure
   * { points, cues: [id indizi da usare come evidenza, in ordine di importanza] }.
   * Soglie: >= 6.5 alta, >= 4.5 media, >= 3 bassa.
   */
  var DETECTORS = [
    {
      id: 'finto_corriere',
      label: 'Finto corriere / pacco in giacenza',
      explanation: 'Il messaggio finge di arrivare da un corriere o da Poste e dice che un pacco è bloccato (indirizzo incompleto, consegna non riuscita, spese di spedizione o di sdoganamento da pagare). Il link porta a un sito falso che ruba i dati della carta o fa pagare piccole somme che poi diventano addebiti ben più alti.',
      run: function (H, ctx) {
        if (!H.parcel_problem || !(H.courier || H.parcel)) return null;
        var channel = ctx.linkAny || H.small_fee || (ctx.phoneCallable && H.call_request);
        if (!channel) return null;
        var pts = 2.5 + P(H.courier, 1) + P(H.parcel, 0.5) + P(H.small_fee, 1.5) + P(H.data_update, 1) +
          P(H.urgency, 1) + P(H.threat, 0.5) + linkPoints(ctx) + P(H.click && ctx.linkAny, 0.5) + P(ctx.phoneCallable && H.call_request, 1);
        return { points: pts, cues: ['parcel_problem', 'small_fee', 'courier'] };
      }
    },
    {
      id: 'finta_banca',
      label: 'Finta banca o Poste: conto bloccato o operazione sospetta',
      explanation: 'Il messaggio si presenta come la tua banca, Poste o il circuito della carta e parla di conto bloccato, accesso anomalo o operazione sospetta, per spaventarti. Lo scopo è farti inserire le credenziali su un sito falso o farti chiamare un finto operatore che ti convincerà a fare bonifici o a dargli i codici.',
      run: function (H, ctx) {
        if (!H.bank) return null;
        if (!(H.account_problem || (H.did_you_authorize && (ctx.linkAny || ctx.phoneCallable)))) return null;
        var channel = ctx.linkAny || (ctx.phoneCallable && (H.call_request || H.did_you_authorize)) || H.otp_request || ctx.emailBad;
        if (!channel) return null;
        var pts = 1.5 + P(H.account_problem, 2.5) + P(H.did_you_authorize, 1.5) + P(H.urgency, 1) + P(H.threat, 1) +
          P(H.data_update, 1) + linkPoints(ctx) + P(ctx.phoneCallable && (H.call_request || H.did_you_authorize), 1.5) +
          P(H.otp_request, 2) + P(H.click && ctx.linkAny, 0.5) + P(H.operator, 0.5);
        return { points: pts, cues: ['account_problem', 'did_you_authorize', 'bank'] };
      }
    },
    {
      id: 'conto_sicuro',
      label: 'Truffa del «conto sicuro»',
      explanation: 'Ti chiedono di spostare i tuoi soldi su un «conto sicuro», «protetto» o «tecnico» per difenderli da un attacco o da un\'indagine. È sempre una truffa: nessuna banca e nessuna forza dell\'ordine lo chiede mai. Il conto è dei truffatori e il bonifico è quasi impossibile da recuperare.',
      run: function (H, ctx) {
        if (!H.safe_account) return null;
        var pts = 3.5 + P(H.bank, 1) + P(H.operator || H.police, 0.75) + P(ctx.phoneCallable, 1) + P(ctx.ibanAny, 1) + P(ctx.ibanForeign, 1.5) +
          P(H.urgency, 1) + P(H.threat, 0.5) + P(H.money_ask, 0.75) + P(H.account_problem, 0.75);
        return { points: pts, cues: ['safe_account', 'operator', 'bank'] };
      }
    },
    {
      id: 'inps_ade',
      label: 'Falso INPS / Agenzia delle Entrate / rimborso',
      explanation: 'Il messaggio usa il nome di INPS, Agenzia delle Entrate o di un altro ente pubblico e promette un rimborso o chiede di aggiornare i dati per non perdere un pagamento. Gli enti pubblici non chiedono IBAN, dati della carta o documenti tramite link in SMS o email: il sito collegato serve a rubare dati e soldi.',
      run: function (H, ctx) {
        if (!H.gov) return null;
        if (!(H.money_owed || H.data_update || H.account_problem)) return null;
        var channel = ctx.linkAny || ctx.phoneCallable || ctx.emailBad;
        if (!channel) return null;
        var pts = 1.5 + P(H.money_owed, 2) + P(H.data_update, 1.5) + P(H.account_problem, 1) + P(H.urgency, 1) +
          P(H.threat, 1) + linkPoints(ctx) + P(H.click && ctx.linkAny, 0.5) + P(ctx.emailBad, 1.5);
        return { points: pts, cues: ['money_owed', 'data_update', 'gov'] };
      }
    },
    {
      id: 'multa_pedaggio',
      label: 'Falsa multa, pedaggio o avviso di pagamento',
      explanation: 'Ti avvisano di una multa, di un pedaggio non pagato o di un avviso PagoPA da saldare subito, spesso con un piccolo importo e la minaccia di sanzioni più alte. Il link porta a una falsa pagina di pagamento che ruba i dati della carta.',
      run: function (H, ctx) {
        if (!H.fine_due) return null;
        var entity = H.gov || H.toll || H.police_local || H.police;
        if (!entity) return null;
        if (!(ctx.linkAny || ctx.phoneCallable)) return null;
        var pts = 2.5 + P(entity, 1) + P(H.urgency, 1) + P(H.threat, 1) + P(H.small_fee, 0.5) + P(H.data_update, 0.5) +
          linkPoints(ctx) + P(H.click && ctx.linkAny, 0.5);
        return { points: pts, cues: ['fine_due', 'toll', 'gov', 'police_local'] };
      }
    },
    {
      id: 'finto_abbonamento',
      label: 'Falso problema con abbonamento, bolletta o account',
      explanation: 'Il messaggio imita un servizio che usi (streaming, telefonia, luce e gas, email, cloud) e dice che il pagamento non è andato a buon fine, che il servizio sarà sospeso o che hai diritto a un rimborso. Il link porta a una pagina falsa che chiede password e dati della carta.',
      run: function (H, ctx) {
        if (!H.subscription_brand || !H.subscription_problem) return null;
        if (!(ctx.linkAny || ctx.phoneCallable || ctx.emailBad)) return null;
        var pts = 1.5 + 2.5 + P(H.data_update, 1) + P(H.urgency, 1) + P(H.threat, 1) + linkPoints(ctx) + P(H.click && ctx.linkAny, 0.5);
        return { points: pts, cues: ['subscription_problem', 'subscription_brand'] };
      }
    },
    {
      id: 'ciao_mamma',
      label: 'Truffa «Ciao mamma, ho cambiato numero»',
      explanation: 'Qualcuno si finge tuo figlio, tua figlia o un parente: dice di aver rotto o perso il telefono e di scrivergli a un nuovo numero. Dopo qualche messaggio arriva la richiesta urgente di pagare una fattura o fare un bonifico «perché dal telefono nuovo non riesce». Il «nuovo numero» è del truffatore.',
      run: function (H, ctx) {
        if (!H.new_number) return null;
        if (!(H.family || (H.money_ask && H.write_whatsapp))) return null;
        var pts = P(H.family, 2) + 3 + P(H.write_whatsapp, 1.5) + P(H.money_ask, 2) + P(H.urgency, 1) + P(ctx.phoneAny, 0.5) + P(ctx.ibanAny, 1);
        return { points: pts, cues: ['new_number', 'family', 'money_ask'] };
      }
    },
    {
      id: 'finto_incidente',
      label: 'Finto parente in difficoltà (incidente, arresto, avvocato)',
      explanation: 'Qualcuno chiama o scrive fingendosi un parente, un avvocato o un carabiniere: dice che un tuo familiare ha avuto un incidente o è stato fermato e servono subito soldi (cauzione, avvocato, risarcimento). Spesso manda poi una persona a ritirare contanti o gioielli a casa. È una truffa che colpisce soprattutto gli anziani.',
      run: function (H, ctx) {
        if (!H.emergency || !(H.relative || H.family)) return null;
        if (!(H.money_ask || H.collect)) return null;
        var pts = 2 + 1.5 + P(H.money_ask, 1.5) + P(H.collect, 2) + P(H.urgency, 1) + P(H.police || H.operator, 0.5);
        return { points: pts, cues: ['emergency', 'collect', 'money_ask'] };
      }
    },
    {
      id: 'finto_premio',
      label: 'Finto premio, vincita o regalo',
      explanation: 'Ti annunciano una vincita, un regalo (iPhone, buono Amazon, gift card) o un premio per aver risposto a un sondaggio. Per riceverlo chiedono un piccolo pagamento o i tuoi dati: in realtà servono a rubare la carta o ad attivare abbonamenti a pagamento.',
      run: function (H, ctx) {
        if (!H.prize_strong && !(H.prize && H.small_fee)) return null;
        var channel = ctx.linkAny || ctx.phoneCallable || H.small_fee || H.data_update;
        if (!channel) return null;
        var pts = P(H.prize_strong, 2.5) + P(H.prize, 1) + P(H.small_fee, 1.5) + P(H.data_update, 1) + P(H.urgency, 1) +
          linkPoints(ctx) + P(H.click && ctx.linkAny, 0.5) + P(ctx.brandsMentioned.length > 0, 0.5);
        return { points: pts, cues: ['prize_strong', 'prize', 'small_fee'] };
      }
    },
    {
      id: 'richiesta_codici',
      label: 'Richiesta di codici OTP, PIN o password',
      explanation: 'Ti chiedono un codice che hai ricevuto per SMS, un PIN o una password. Quei codici servono ad autorizzare pagamenti o ad entrare nei tuoi account (WhatsApp, banca, SPID): chi li ottiene può svuotarti il conto o rubarti il profilo e usarlo per truffare i tuoi contatti. Nessuno ha bisogno del tuo codice.',
      run: function (H, ctx) {
        if (!H.otp_request) return null;
        var pts = 4.5 + P(H.write_whatsapp, 0.75) + P(H.bank || ctx.brandsMentioned.length > 0, 0.75) + P(H.urgency, 0.75) +
          P(H.operator, 0.75) + P(H.family, 0.5) + P(H.account_problem, 0.5);
        return { points: pts, cues: ['otp_request'] };
      }
    },
    {
      id: 'pagamento_anomalo',
      label: 'Pagamento con metodi non rimborsabili',
      explanation: 'Ti chiedono di pagare con ricariche PostePay, gift card, criptovalute, Western Union o bonifico istantaneo. Sono i metodi preferiti dai truffatori perché i soldi arrivano subito e non si possono recuperare.',
      run: function (H, ctx) {
        if (!H.risky_payment_request && !(H.risky_method && H.money_ask && (H.urgency || H.threat))) return null;
        var pts = 3 + P(H.risky_payment_request, 1) + P(H.urgency, 1) + P(H.threat, 1) + P(ctx.ibanAny, 0.5) + P(H.write_whatsapp, 0.5) + P(H.police || H.gov, 0.5);
        return { points: pts, cues: ['risky_payment_request', 'risky_method'] };
      }
    },
    {
      id: 'investimento_truffa',
      label: 'Falso investimento / trading facile',
      explanation: 'Promettono guadagni alti, sicuri e veloci con trading, criptovalute o piattaforme «automatiche», spesso usando nomi di personaggi famosi. Dopo il primo versamento ti mostrano guadagni finti e chiedono altri soldi; alla fine non puoi più ritirare nulla.',
      run: function (H, ctx) {
        if (!H.invest || !H.invest_promise) return null;
        var pts = 1.5 + 3 + P(H.invest_promise.distinct > 1, 1) + P(H.invest_context, 1) + P(H.write_whatsapp, 0.5) + linkPoints(ctx) * 0.5 + P(H.urgency, 0.5) + P(H.risky_method, 0.5);
        return { points: pts, cues: ['invest_promise', 'invest'] };
      }
    },
    {
      id: 'finto_lavoro',
      label: 'Finta offerta di lavoro «metti mi piace»',
      explanation: 'Ti offrono soldi facili per compiti semplici come mettere «mi piace» a video, seguire profili o scrivere recensioni. All\'inizio pagano pochi euro per conquistare la tua fiducia, poi chiedono di versare denaro per «sbloccare» compiti meglio pagati: quei soldi non tornano più.',
      run: function (H, ctx) {
        var ok = (H.job && H.job_task && (H.job_pay || H.write_whatsapp)) || (H.job_task && H.job_pay) || (H.job && H.job_pay && H.write_whatsapp);
        if (!ok) return null;
        var pts = P(H.job, 1.5) + P(H.job_task, 2) + P(H.job_pay, 2) + P(H.write_whatsapp, 1) + P(ctx.phoneForeign, 1) + P(H.urgency, 0.5);
        return { points: pts, cues: ['job_task', 'job_pay', 'job'] };
      }
    },
    {
      id: 'sextortion',
      label: 'Ricatto a sfondo sessuale (sextortion)',
      explanation: 'Il messaggio dice di avere video o foto intime registrate dalla tua webcam o dal telefono e minaccia di inviarle ai tuoi contatti se non paghi, di solito in criptovalute. Quasi sempre è un bluff inviato a migliaia di persone insieme.',
      run: function (H, ctx) {
        if (!H.sex_crime || !(H.extortion || H.risky_method)) return null;
        var pts = 2.5 + P(H.extortion, 2.5) + P(H.risky_method, 1.5) + P(H.urgency, 1) + P(H.threat, 1);
        return { points: pts, cues: ['sex_crime', 'extortion', 'risky_method'] };
      }
    },
    {
      id: 'finta_polizia',
      label: 'Falsa convocazione delle forze dell\'ordine',
      explanation: 'Usa il nome di Polizia, Carabinieri, Guardia di Finanza o di un tribunale per accusarti di un reato e chiederti di rispondere o pagare subito per evitare l\'arresto o la denuncia. Le forze dell\'ordine non mandano accuse per email o messaggio chiedendo soldi.',
      run: function (H, ctx) {
        if (!H.police || !H.convocation) return null;
        if (!(H.threat || H.urgency || ctx.emailAny || H.sex_crime || H.risky_method || ctx.linkAny)) return null;
        var pts = 2 + 2 + P(H.sex_crime, 1.5) + P(H.threat, 1) + P(H.urgency, 1) + P(ctx.emailFreemail, 1.5) +
          P(H.extortion || H.risky_method, 1.5) + linkPoints(ctx) * 0.5;
        return { points: pts, cues: ['convocation', 'police', 'sex_crime'] };
      }
    },
    {
      id: 'romance',
      label: 'Truffa sentimentale',
      explanation: 'Una persona conosciuta online costruisce un legame affettivo e poi chiede soldi per un\'emergenza (viaggio, dogana, spese mediche, conto bloccato). Spesso dice di essere un militare, un medico o un ingegnere all\'estero. Le richieste di denaro continuano finché si paga.',
      run: function (H, ctx) {
        if (!H.romance_affection || !H.romance_money) return null;
        if (!(H.romance_context || H.urgency || ctx.phoneForeign)) return null;
        var pts = 1.5 + 2 + P(H.romance_context, 2) + P(H.urgency, 0.5) + P(H.risky_method, 1) + P(H.romance_affection && H.romance_affection.distinct > 1, 0.5);
        return { points: pts, cues: ['romance_money', 'romance_context', 'romance_affection'] };
      }
    }
  ];

  /** Rilevatore di riserva: un problema/urgenza + un link, senza un copione preciso. */
  var GENERIC_PHISHING = {
    id: 'phishing_generico',
    label: 'Tentativo di phishing',
    explanation: 'Il messaggio crea un problema o un\'urgenza e ti spinge ad aprire un link per sistemarlo. È lo schema tipico del phishing: la pagina collegata imita un sito noto per rubare password, dati o soldi.',
    run: function (H, ctx) {
      if (!ctx.linkAny) return null;
      var problem = H.account_problem || H.subscription_problem || H.money_owed || H.prize_strong || H.fine_due || H.threat || H.data_update || H.parcel_problem;
      if (!problem && !(ctx.linkRisk === 'alto' && (H.click || H.urgency))) return null;
      var pts = P(problem, 1.5) + linkPoints(ctx) + P(H.urgency, 1) + P(H.click, 0.5) + P(H.data_update, 1) + P(ctx.brandMismatch, 1);
      return { points: pts, cues: ['account_problem', 'subscription_problem', 'threat', 'data_update', 'urgency'] };
    }
  };

  function confidenceOf(points) {
    if (points >= 6.5) return 'alta';
    if (points >= 4.5) return 'media';
    if (points >= 3) return 'bassa';
    return null;
  }

  var SCAM_IMPACT = { alta: -40, media: -28, bassa: -15 };

  /* =====================================================================
   * 7. PUNTEGGIO, TITOLO E CONSIGLI
   * ===================================================================== */

  function verdictOf(score) {
    if (score >= 70) return 'affidabile';
    if (score >= 45) return 'neutro';
    if (score >= 25) return 'sospetto';
    return 'pericoloso';
  }

  var VERDICT_LABELS = {
    affidabile: 'Probabilmente affidabile',
    neutro: 'Nessun allarme evidente, ma resta prudente',
    sospetto: 'Sospetto: ci sono segnali tipici delle truffe',
    pericoloso: 'Pericoloso: quasi certamente una truffa'
  };

  var SCAM_NAMES = {
    finto_corriere: 'del finto corriere',
    finta_banca: 'della finta banca',
    conto_sicuro: 'del «conto sicuro»',
    inps_ade: 'del falso rimborso INPS / Agenzia delle Entrate',
    multa_pedaggio: 'della falsa multa o del falso pedaggio',
    finto_abbonamento: 'del falso abbonamento o della falsa bolletta',
    ciao_mamma: '«Ciao mamma, ho cambiato numero»',
    finto_premio: 'del finto premio',
    finto_incidente: 'del finto parente in difficoltà',
    richiesta_codici: 'del furto di codici (OTP, PIN, password)',
    pagamento_anomalo: 'del pagamento con ricariche, gift card o criptovalute',
    investimento_truffa: 'del falso investimento',
    finto_lavoro: 'della finta offerta di lavoro «metti mi piace»',
    sextortion: 'del ricatto a sfondo sessuale',
    finta_polizia: 'della falsa convocazione delle forze dell\'ordine',
    romance: 'sentimentale',
    phishing_generico: 'del phishing'
  };

  function headlineFor(report) {
    if (report.kind === 'empty') return 'Incolla un messaggio, un link, un IBAN o un numero da controllare.';
    var top = report.scams[0];
    if (top) {
      var name = SCAM_NAMES[top.id] || top.label;
      if (top.confidence === 'alta') return 'Quasi certamente è una truffa: è il copione ' + name + '.';
      if (top.confidence === 'media') return 'Sembra la truffa ' + name + '.';
      return 'Potrebbe essere la truffa ' + name + ': ci sono alcuni segnali tipici.';
    }
    var urls = report.entities.urls;
    var bad = urls.filter(function (u) { return u.risk === 'alto'; })[0];
    var look = urls.filter(function (u) { return u.lookalike && u.lookalike.how !== 'other_tld'; })[0];
    if (look) return 'Il link imita ' + look.lookalike.brandName + ' ma porta a un altro sito: non aprirlo.';
    if (bad) return 'Il link ha caratteristiche tipiche dei siti truffa: non aprirlo.';
    if (report.kind === 'url') {
      var u = urls[0];
      if (u && u.official) return 'È un indirizzo ufficiale' + (u.official.brandName ? ' di ' + u.official.brandName : '') + '.';
      if (u && u.risk === 'medio') return 'Il link ha alcuni segnali di rischio: aprilo solo se sei sicuro di chi te l\'ha mandato.';
      return 'Non vedo segnali di rischio nel link, ma non posso verificare il contenuto del sito.';
    }
    if (report.kind === 'iban') {
      var ib = report.entities.ibans[0];
      if (!ib.validChecksum) return 'Questo IBAN non è valido: controlla di averlo copiato bene.';
      if (ib.country && ib.country !== 'IT') return 'IBAN valido di un conto in ' + (COUNTRY_NAMES[ib.country] || ib.country) + '.';
      return 'L\'IBAN è scritto correttamente, ma questo non dice nulla su chi lo usa.';
    }
    if (report.kind === 'email') {
      var e = report.entities.emails[0];
      if (e.signals.some(function (s) { return s.id === 'email_lookalike'; })) return 'L\'indirizzo email imita un\'azienda o un ente: è un mittente falso.';
      if (e.signals.some(function (s) { return s.id === 'email_official'; })) return 'Il dominio è ufficiale, ma il mittente di un\'email si può falsificare.';
      return 'Non vedo segnali di rischio nell\'indirizzo email, ma non posso verificarne il mittente.';
    }
    if (report.verdict === 'pericoloso') return 'Il messaggio contiene diversi segnali di truffa.';
    if (report.verdict === 'sospetto') return 'Il messaggio contiene alcuni segnali sospetti: verifica prima di fare qualsiasi cosa.';
    if (!report.signals.some(function (s) { return s.impact < 0; })) {
      return 'Non ho trovato segnali tipici di truffa, ma nessun controllo automatico può garantire che un messaggio sia sicuro.';
    }
    return 'Nessun allarme forte, ma c\'è qualche dettaglio da controllare.';
  }

  var ADVICE = {
    noClick: 'Non cliccare sui link e non rispondere al messaggio.',
    otp: 'Non comunicare mai a nessuno codici OTP, PIN, password o dati della carta: banche, Poste e forze dell\'ordine non li chiedono mai, né per SMS né per telefono.',
    official: 'Se hai un dubbio, contatta tu l\'azienda o la banca dall\'app ufficiale o dal numero scritto sul sito ufficiale (o sul retro della carta), mai dal link o dal numero indicato nel messaggio.',
    damage: 'Se hai già inserito dati o pagato, chiama subito la tua banca per bloccare la carta e le operazioni, cambia le password e sporgi denuncia alla Polizia Postale.',
    report: 'Puoi segnalare il tentativo di truffa alla Polizia Postale su commissariatodips.it.',
    block: 'Blocca il mittente ed elimina il messaggio.',
    neutral: 'Nessun controllo automatico può garantire che un messaggio sia sicuro: se ti chiede soldi, dati o codici, verifica sempre contattando tu il mittente con un canale ufficiale.',
    neutralLink: 'Prima di aprire un link controlla che l\'indirizzo sia esattamente quello del sito ufficiale: in caso di dubbio scrivi tu l\'indirizzo nel browser o usa l\'app.'
  };

  var SCAM_ADVICE = {
    finto_corriere: ['Per un pacco vero controlla lo stato solo sul sito o sull\'app ufficiale del corriere, inserendo tu il codice di spedizione. Diffida di chi chiede piccoli pagamenti tramite link per «sbloccare» una consegna.'],
    finta_banca: ['La banca non ti chiede di verificare i dati o sbloccare il conto tramite un link in un SMS o in un\'email: apri tu l\'app della banca o chiama il numero sul retro della carta.',
      'Se ti chiama qualcuno che dice di essere la banca, riattacca e richiama tu il numero ufficiale: il numero che compare sul telefono può essere falsificato.'],
    conto_sicuro: ['Nessuna banca e nessuna forza dell\'ordine ti chiederà mai di spostare i soldi su un «conto sicuro»: non fare il bonifico.',
      'Se l\'hai già fatto, chiama subito la tua banca e chiedi di bloccare o richiamare il bonifico, poi sporgi denuncia.'],
    inps_ade: ['INPS e Agenzia delle Entrate non ti chiedono IBAN o dati della carta tramite un link in un SMS o in un\'email: per controllare rimborsi e pratiche accedi tu con SPID o CIE ai siti ufficiali inps.it e agenziaentrate.gov.it.'],
    multa_pedaggio: ['Controlla multe e pedaggi solo sui canali ufficiali (sito del Comune o dell\'ente che ha emesso il verbale, autostrade.it, telepass.com), scrivendo tu l\'indirizzo. Le multe vere ti vengono notificate ufficialmente (ad esempio per raccomandata o PEC), non con un link in un SMS.'],
    finto_abbonamento: ['Controlla lo stato di abbonamenti, bollette e account solo dall\'app ufficiale o dal sito che digiti tu, non dal link nel messaggio.'],
    ciao_mamma: ['Prima di fare qualsiasi cosa chiama il vecchio numero di tuo figlio, tua figlia o della persona che dice di scriverti: spesso risponde subito e la truffa si scopre.',
      'Fai una domanda personale a cui solo la persona vera saprebbe rispondere (un ricordo, il nome di un animale, un dettaglio di famiglia).',
      'Non fare bonifici, ricariche o pagamenti di fatture per conto di qualcuno che ti scrive da un numero nuovo, anche se ti mette fretta.'],
    finto_incidente: ['Riattacca e chiama subito tu il familiare coinvolto o un altro parente al numero che conosci già. In caso di dubbio chiama il 112.',
      'Nessun avvocato, carabiniere o ospedale chiede soldi o gioielli da consegnare a domicilio: non aprire la porta a sconosciuti e non consegnare nulla.'],
    finto_premio: ['Nessuno regala iPhone, buoni o premi in cambio di un sondaggio o di un piccolo pagamento: è un modo per rubare i dati della carta o attivare abbonamenti a tua insaputa.'],
    richiesta_codici: ['Il codice che ricevi per SMS serve solo a te: chi te lo chiede, anche un amico su WhatsApp, sta cercando di rubarti l\'account o di autorizzare un pagamento. Non darlo a nessuno.',
      'Attiva la verifica in due passaggi su WhatsApp (Impostazioni > Account > Verifica in due passaggi) per proteggere il tuo profilo.'],
    pagamento_anomalo: ['Ricariche PostePay, gift card, criptovalute, Western Union e bonifici istantanei sono quasi impossibili da recuperare: nessun ente o azienda seria ti chiede di pagare così.'],
    investimento_truffa: ['Diffida di chi promette guadagni sicuri e veloci. Prima di investire verifica che l\'intermediario sia autorizzato sul sito della CONSOB (consob.it).'],
    finto_lavoro: ['Nessun lavoro vero ti paga per mettere «mi piace» ai video: dopo i primi piccoli pagamenti ti chiederanno di versare soldi per «sbloccare» i guadagni. Non versare nulla e non dare documenti.'],
    sextortion: ['Non pagare e non rispondere: quasi sempre il ricattatore non ha alcun video e manda lo stesso messaggio a migliaia di persone. Cambia la password della tua email e segnala il messaggio su commissariatodips.it.',
      'Se temi davvero la diffusione di immagini intime puoi chiedere aiuto anche al Garante per la protezione dei dati personali (garanteprivacy.it).'],
    finta_polizia: ['Le forze dell\'ordine non mandano accuse o convocazioni per email o messaggio chiedendo di rispondere o pagare: non rispondere e segnala il messaggio su commissariatodips.it.'],
    romance: ['Non mandare soldi, ricariche o gift card a persone conosciute solo online, per quanto la loro storia sia commovente. Prova a cercare le loro foto con una ricerca per immagini: spesso sono rubate.'],
    phishing_generico: []
  };

  function buildAdvice(report) {
    var a = [];
    var bad = report.verdict === 'sospetto' || report.verdict === 'pericoloso';
    report.scams.forEach(function (s) { (SCAM_ADVICE[s.id] || []).forEach(function (x) { a.push(x); }); });
    if (bad) {
      if (report.entities.urls.length || report.kind === 'message') a.unshift(ADVICE.noClick);
      a.push(ADVICE.official);
      a.push(ADVICE.otp);
      a.push(ADVICE.damage);
      a.push(ADVICE.block);
      a.push(ADVICE.report);
    } else {
      if (report.kind === 'url') a.push(ADVICE.neutralLink);
      else if (report.kind === 'iban') a.push('Prima di un bonifico verifica il destinatario con un canale che conosci già (telefono o di persona). Un IBAN corretto non garantisce che chi lo usa sia onesto.');
      else if (report.kind === 'email') a.push('Il mittente di un\'email può essere falsificato: non aprire allegati inattesi e controlla dove portano i link prima di cliccarli.');
      else a.push(ADVICE.neutral);
      if (report.entities.urls.length && report.kind !== 'url') a.push(ADVICE.neutralLink);
      a.push(ADVICE.otp);
    }
    return uniq(a);
  }

  /* =====================================================================
   * 8. API PUBBLICA
   * ===================================================================== */

  var PHONE_WORDS = /^(anonimo|privato|sconosciuto|numero (privato|sconosciuto|nascosto)|nascosto|unknown|private|no caller id)$/i;

  /**
   * Capisce se l'input è SOLO un numero, un link, un IBAN, un'email o un messaggio.
   * @returns {"phone"|"url"|"iban"|"email"|"message"|"empty"}
   */
  function classifyInput(text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return 'empty';
    if (PHONE_WORDS.test(t)) return 'phone';
    var p = t.replace(/^(tel|callto|sms|whatsapp)\s*:\s*\/*/i, '');
    if (/^\+?[\d\s\u00a0().\-/]+$/.test(p) && /\d/.test(p)) {
      // non trattare come telefono una data o un importo isolato
      if (!/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(p)) return 'phone';
    }
    if (/\s/.test(t.replace(/\s+/g, ' ')) ) {
      // con spazi può essere solo un IBAN
      var ib = extractIbans(t).items;
      if (ib.length === 1 && t.replace(/[\s-]/g, '').length === ib[0].raw.replace(/[\s-]/g, '').length) return 'iban';
      return 'message';
    }
    var ibs = extractIbans(t).items;
    if (ibs.length === 1 && ibs[0].raw.replace(/[\s-]/g, '') === t.replace(/[\s-]/g, '')) return 'iban';
    var em = extractEmails(t).items;
    if (em.length === 1 && trimTrailing(t) === em[0].raw && !/^(https?|hxxps?):/i.test(t)) return 'email';
    var u = extractUrls(t).items;
    if (u.length === 1 && u[0].raw === trimTrailing(t)) return 'url';
    return 'message';
  }

  function baseReport(input) {
    return {
      input: input, kind: 'message', error: null, score: 50, verdict: 'neutro', verdictLabel: VERDICT_LABELS.neutro,
      headline: '', scams: [], signals: [], advice: [],
      entities: { phones: [], urls: [], ibans: [], emails: [] },
      layers: [{ id: 'regole', label: 'Regole locali (nel tuo browser)', status: 'ok' }]
    };
  }

  /** Report per un input che è solo un numero: stesso punteggio, verdetto e consigli di WhoAreYou. */
  function phoneReport(report, text, opts) {
    var W = getW();
    report.kind = 'phone';
    if (!W) {
      report.error = 'Il motore dei numeri (WhoAreYou) non è disponibile.';
      report.headline = report.error;
      return report;
    }
    var r = W.analyze(text, { defaultCountry: opts.defaultCountry });
    report.entities.phones.push({ raw: String(text).trim(), result: r });
    report.error = r.error;
    report.score = r.score;
    report.verdict = r.verdict;
    report.verdictLabel = r.verdictLabel;
    report.signals = r.signals.slice();
    report.advice = r.advice.slice();
    if (r.error) report.headline = r.error;
    else {
      var where = r.country ? (r.country.code === 'IT' ? 'italiano' : 'di ' + r.country.name) : '';
      var what = (r.lineTypeLabel || 'Numero') + (where ? ' ' + where : '');
      var tail = { affidabile: 'nessun segnale di rischio.', neutro: 'nessun allarme evidente, ma resta prudente.', sospetto: 'ci sono segnali sospetti, meglio non richiamare.', pericoloso: 'attenzione, è potenzialmente pericoloso.' };
      report.headline = what + ': ' + tail[r.verdict];
    }
    return report;
  }

  /**
   * Analisi completa con le sole regole locali (sincrona).
   * @param {string} text messaggio, link, IBAN, email o numero
   * @param {{defaultCountry?: string, now?: Date}} [opts] now è accettato per compatibilità (non usato dalle regole)
   * @returns {object} Report (vedi CONTRACT-SCAM.md)
   */
  function analyzeText(text, opts) {
    opts = opts || {};
    var input = text == null ? '' : String(text);
    var defaultCountry = (opts.defaultCountry ? String(opts.defaultCountry) : 'IT').toUpperCase();
    var report = baseReport(input);
    // Testi lunghissimi: si analizzano i primi MAX_INPUT caratteri (un messaggio o un'email bastano e avanzano)
    if (input.length > MAX_INPUT) input = input.slice(0, MAX_INPUT);
    var kind = classifyInput(input);
    report.kind = kind;

    if (kind === 'empty') {
      report.error = 'Incolla un messaggio, un link, un IBAN, un\'email o un numero di telefono da controllare.';
      report.score = 50;
      report.verdict = 'neutro';
      report.verdictLabel = 'Impossibile valutare';
      report.headline = headlineFor(report);
      report.layers[0].status = 'skipped';
      return report;
    }
    if (kind === 'phone') return phoneReport(report, input, { defaultCountry: defaultCountry });

    // ---------- Estrazione delle entità (ordine: link, email, IBAN, telefoni) ----------
    var U = extractUrls(input);
    var E = extractEmails(U.masked);
    var I = extractIbans(E.masked);
    var phones = kind === 'message' ? extractPhones(I.masked, defaultCountry) : [];

    var N = normalizeText(input);
    var H = detectCues(N);

    // Marchi citati nel testo (esclusi quelli che compaiono solo dentro link ed email)
    var NM = normalizeText(I.masked);
    var brandsMentioned = [];
    BRANDS.forEach(function (b) {
      if (!b.text) return;
      b.text.lastIndex = 0;
      var m = b.text.exec(NM.s);
      if (m) brandsMentioned.push({ brand: b, evidence: evidenceOf(NM, m.index, m.index + m[0].length) });
    });
    var claimsItalian = brandsMentioned.length > 0 || !!(H.bank || H.gov || H.police || H.safe_account || H.toll);

    var urls = U.items.map(function (it) { return analyzeUrl(it.raw); });
    var emails = E.items.map(function (it) { return analyzeEmail(it.raw, { brandMentioned: claimsItalian }); });
    var ibans = I.items.map(function (it) { return analyzeIban(it, { claimsItalian: claimsItalian }); });

    report.entities.urls = urls;
    report.entities.emails = emails;
    report.entities.ibans = ibans;
    report.entities.phones = phones.map(function (p) { return { raw: p.raw, result: p.result }; });

    var riskRank = { basso: 1, medio: 2, alto: 3 };
    var nonOfficial = urls.filter(function (u) { return !u.official; });
    var worst = null;
    nonOfficial.forEach(function (u) { if (!worst || riskRank[u.risk] > riskRank[worst.risk]) worst = u; });

    var ctx = {
      linkAny: nonOfficial.length > 0,
      linkRisk: worst ? worst.risk : null,
      linkOfficialOnly: urls.length > 0 && nonOfficial.length === 0,
      phoneAny: phones.length > 0,
      phoneCallable: phones.some(function (p) { return p.result && ['mobile', 'landline', 'voip', 'unknown', 'premium'].indexOf(p.result.lineType) >= 0; }),
      phoneForeign: phones.some(function (p) { return p.result && p.result.country && p.result.country.code !== 'IT'; }),
      ibanAny: ibans.length > 0,
      ibanForeign: ibans.some(function (i) { return i.country && ['IT', 'SM', 'VA'].indexOf(i.country) < 0; }),
      emailAny: emails.length > 0,
      emailFreemail: emails.some(function (e) { return e.signals.some(function (s) { return s.id === 'email_freemail_impersonation'; }); }),
      emailBad: emails.some(function (e) { return e.signals.some(function (s) { return s.id === 'email_lookalike' || s.id === 'email_freemail_impersonation'; }); }),
      brandsMentioned: brandsMentioned,
      brandMismatch: false
    };

    var signals = [];

    // ---------- Segnali delle entità ----------
    if (kind === 'url') {
      signals = signals.concat(urls[0].signals);
    } else if (kind === 'email') {
      signals = signals.concat(emails[0].signals);
    } else if (kind === 'iban') {
      signals = signals.concat(ibans[0].signals);
    } else {
      // Link: un segnale riassuntivo per link a rischio; il peggiore conta per intero.
      var linkSignals = [];
      nonOfficial.forEach(function (u) {
        var reasons = u.signals.filter(function (s) { return s.impact < 0; }).map(function (s) { return s.label.toLowerCase(); });
        if (u.risk === 'alto') {
          linkSignals.push(sig('link_dangerous', 'Link pericoloso', 'Il link ' + (u.host || u.raw) + ' è ad alto rischio: ' + reasons.join(', ') + '.', -30, 'high', u.raw));
        } else if (u.risk === 'medio') {
          linkSignals.push(sig('link_suspicious', 'Link sospetto', 'Il link ' + (u.host || u.raw) + ' ha segnali di rischio: ' + reasons.join(', ') + '.', -15, 'medium', u.raw));
        } else {
          var mild = u.signals.reduce(function (acc, s) { return acc + (s.impact < 0 ? s.impact : 0); }, 0);
          if (mild < 0) linkSignals.push(sig('link_note', 'Dettagli del link da controllare', 'Il link ' + (u.host || u.raw) + ': ' + reasons.join(', ') + '.', Math.max(mild, -6), 'low', u.raw));
        }
      });
      linkSignals.sort(function (a, b) { return a.impact - b.impact; });
      linkSignals.forEach(function (s, i) { if (i > 0) s.impact = Math.round(s.impact / 3); });
      signals = signals.concat(linkSignals);
      if (urls.length && !nonOfficial.length) {
        signals.push(sig('links_official', 'Link verso siti ufficiali', 'Tutti i link del messaggio portano a domini ufficiali (' + uniq(urls.map(function (u) { return u.host; })).join(', ') + ').', 5, 'info', urls[0].raw));
      }
      // Il messaggio parla di un marchio ma il link porta altrove
      if (brandsMentioned.length && nonOfficial.length) {
        var mentioned = brandsMentioned.filter(function (bm) {
          return !urls.some(function (u) { return u.official && u.official.brand === bm.brand.id; });
        })[0];
        if (mentioned) {
          ctx.brandMismatch = true;
          signals.push(sig('brand_link_mismatch', 'Il link non è del mittente dichiarato', 'Il messaggio parla di ' + mentioned.brand.name + ' ma il link porta a ' + (nonOfficial[0].host || nonOfficial[0].raw) + ', che non è un sito di ' + mentioned.brand.name + ' (il sito vero è ' + mentioned.brand.domains[0] + ').', -8, 'medium', mentioned.evidence));
        }
      }
      // Telefoni a rischio
      var phoneImpact = 0;
      phones.forEach(function (p) {
        if (!p.result) return;
        if (p.result.verdict === 'pericoloso' || p.result.verdict === 'sospetto') {
          var imp = p.result.verdict === 'pericoloso' ? -15 : -8;
          if (phoneImpact + imp < -20) imp = Math.min(0, -20 - phoneImpact);
          phoneImpact += imp;
          var why = p.result.signals.filter(function (s) { return s.impact < 0; }).map(function (s) { return s.label.toLowerCase(); }).join(', ');
          signals.push(sig('phone_risky', 'Numero a rischio', 'Il numero ' + (p.result.international || p.raw) + ' risulta ' + p.result.verdict + (why ? ' (' + why + ')' : '') + '.', imp, p.result.verdict === 'pericoloso' ? 'high' : 'medium', p.raw));
        }
      });
      // IBAN
      ibans.forEach(function (ib) {
        ib.signals.forEach(function (s) { if (s.impact !== 0 || s.id === 'iban_valid_it') signals.push(s); });
      });
      // Email
      emails.forEach(function (em) {
        em.signals.forEach(function (s) { signals.push(s); });
      });
    }

    // ---------- Copioni di truffa ----------
    var scams = [];
    if (kind === 'message' || kind === 'email') {
      DETECTORS.forEach(function (d) {
        var r = d.run(H, ctx);
        if (!r) return;
        var conf = confidenceOf(r.points);
        if (!conf) return;
        var ev = null;
        for (var i = 0; i < r.cues.length && !ev; i++) if (H[r.cues[i]]) ev = H[r.cues[i]].evidence;
        scams.push({ id: d.id, label: d.label, confidence: conf, explanation: d.explanation, points: r.points, evidence: ev });
      });
      if (!scams.length) {
        var g = GENERIC_PHISHING.run(H, ctx);
        if (g && confidenceOf(g.points)) {
          var gev = null;
          for (var gi = 0; gi < g.cues.length && !gev; gi++) if (H[g.cues[gi]]) gev = H[g.cues[gi]].evidence;
          scams.push({ id: GENERIC_PHISHING.id, label: GENERIC_PHISHING.label, confidence: confidenceOf(g.points), explanation: GENERIC_PHISHING.explanation, points: g.points, evidence: gev });
        }
      }
      scams.sort(function (a, b) { return b.points - a.points; });
      scams.forEach(function (s, i) {
        var imp = SCAM_IMPACT[s.confidence];
        if (i > 0) imp = Math.round(imp / 3);
        signals.push(sig('scam_' + s.id, 'Copione: ' + s.label, s.explanation, imp, s.confidence === 'bassa' ? 'medium' : 'high', s.evidence || undefined));
      });

      // ---------- Indizi generici (pressione, codici, pagamenti) ----------
      var generic = [];
      if (H.otp_request) generic.push(sig('asks_secret_code', 'Chiede un codice segreto', 'Il messaggio chiede di comunicare un codice (OTP, PIN, password o codice ricevuto per SMS): chi lo ottiene può entrare nei tuoi account o autorizzare pagamenti.', -12, 'high', H.otp_request.evidence));
      if (H.risky_payment_request || (H.risky_method && H.money_ask)) {
        var rp = H.risky_payment_request || H.risky_method;
        generic.push(sig('risky_payment', 'Pagamento non rimborsabile', 'Chiede di pagare con un metodo difficile da recuperare (ricarica, gift card, criptovalute, bonifico istantaneo...).', -10, 'high', rp.evidence));
      }
      if (H.urgency) generic.push(sig('urgency', 'Ti mette fretta', 'Scadenze strette e toni urgenti servono a non farti ragionare: chi è onesto ti lascia il tempo di verificare.', -4, 'low', H.urgency.evidence));
      if (H.threat) generic.push(sig('threat', 'Minacce di blocco o sanzioni', 'Minacciare blocchi, sanzioni o denunce è un modo per spaventarti e farti agire subito.', -5, 'medium', H.threat.evidence));
      if (H.click && ctx.linkAny) generic.push(sig('asks_click', 'Ti invita ad aprire un link', 'Il messaggio insiste perché tu apra il link.', -2, 'low', H.click.evidence));
      if (H.otp_protective && !H.otp_request && !scams.length) generic.push(sig('protective_wording', 'Avvertenza sui codici', 'Il messaggio ricorda di non comunicare i codici: è tipico delle notifiche vere (ma da solo non garantisce nulla).', 0, 'info', H.otp_protective.evidence));
      var cap = scams.length ? -15 : -8;
      var gsum = generic.reduce(function (acc, s) { return acc + s.impact; }, 0);
      if (gsum < cap) {
        var factor = cap / gsum;
        var running = 0;
        generic.forEach(function (s, i) {
          if (s.impact >= 0) return;
          var v = i === generic.length - 1 ? cap - running : Math.round(s.impact * factor);
          if (running + v < cap) v = cap - running;
          s.impact = Math.min(0, v);
          running += s.impact;
        });
      }
      signals = signals.concat(generic);
    }

    // ---------- Punteggio ----------
    var base = kind === 'url' ? BASE_URL : kind === 'email' ? BASE_EMAIL : kind === 'iban' ? BASE_IBAN : BASE_MESSAGE;
    var score = base;
    signals.forEach(function (s) { score += s.impact; });
    if (kind === 'message') score = Math.min(score, MESSAGE_MAX);
    if (kind === 'email') score = Math.min(score, MESSAGE_MAX);
    report.score = Math.round(clamp(score, 0, 100));
    report.verdict = verdictOf(report.score);
    report.verdictLabel = VERDICT_LABELS[report.verdict];
    report.signals = signals;
    report.scams = scams.map(function (s) { return { id: s.id, label: s.label, confidence: s.confidence, explanation: s.explanation }; });
    report.headline = headlineFor(report);
    report.advice = buildAdvice(report);
    return report;
  }

  /* ---------- Livelli aggiuntivi (fase 3) ---------- */

  var LAYERS = [];

  /**
   * Registra un livello di analisi extra (es. un modello remoto). Un livello
   * con lo stesso id sostituisce il precedente.
   * @param {{id: string, label: string, run: function(string, object): Promise<object|null>}} layer
   */
  function registerLayer(layer) {
    if (!layer || typeof layer.id !== 'string' || typeof layer.run !== 'function') {
      throw new Error('registerLayer: servono almeno id (stringa) e run (funzione).');
    }
    var entry = { id: layer.id, label: layer.label || layer.id, run: layer.run, timeoutMs: layer.timeoutMs };
    for (var i = 0; i < LAYERS.length; i++) {
      if (LAYERS[i].id === layer.id) { LAYERS[i] = entry; return; }
    }
    LAYERS.push(entry);
  }

  /** Rimuove un livello registrato (utile nei test). */
  function unregisterLayer(id) {
    LAYERS = LAYERS.filter(function (l) { return l.id !== id; });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('Tempo scaduto (' + Math.round(ms / 1000) + ' s)')); } }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  /**
   * Analisi completa: regole locali + livelli registrati, in parallelo.
   * Gli errori o i timeout di un livello non interrompono l'analisi: il
   * livello compare in report.layers con status "error".
   * Le segnalazioni dei livelli vengono aggiunte a report.signals (con
   * `layer` = id del livello) ma il punteggio cambia SOLO con scoreAdjust
   * (limitato a ±40 per livello).
   * @param {string} text
   * @param {{defaultCountry?: string, now?: Date, layerTimeoutMs?: number, skipLayers?: boolean}} [opts]
   * @returns {Promise<object>} Report
   */
  function analyze(text, opts) {
    opts = opts || {};
    var report;
    try {
      report = analyzeText(text, opts);
    } catch (e) {
      return Promise.reject(e);
    }
    var layers = opts.skipLayers ? [] : LAYERS.slice();
    if (!layers.length) return Promise.resolve(report);
    if (report.kind === 'empty') {
      layers.forEach(function (l) { report.layers.push({ id: l.id, label: l.label, status: 'skipped', summary: 'Nessun testo da analizzare.' }); });
      return Promise.resolve(report);
    }
    var timeout = opts.layerTimeoutMs || DEFAULT_LAYER_TIMEOUT;
    var snapshot = JSON.parse(JSON.stringify(report));
    var runs = layers.map(function (l) {
      var p;
      try {
        p = Promise.resolve(l.run(String(text), snapshot));
      } catch (e) {
        p = Promise.reject(e);
      }
      return withTimeout(p, l.timeoutMs || timeout).then(function (v) { return { ok: true, value: v }; },
        function (e) { return { ok: false, error: e }; });
    });
    return Promise.all(runs).then(function (results) {
      var adjust = 0;
      results.forEach(function (r, i) {
        var l = layers[i];
        if (!r.ok) {
          report.layers.push({ id: l.id, label: l.label, status: 'error', summary: 'Livello non disponibile: ' + ((r.error && r.error.message) || 'errore sconosciuto') + '.' });
          return;
        }
        var v = r.value;
        if (v == null) {
          report.layers.push({ id: l.id, label: l.label, status: 'skipped' });
          return;
        }
        var entry = { id: l.id, label: l.label, status: 'ok' };
        if (typeof v.summary === 'string' && v.summary) entry.summary = v.summary;
        report.layers.push(entry);
        if (Array.isArray(v.signals)) {
          v.signals.forEach(function (s) {
            if (!s || !s.id) return;
            var copy = sig(String(s.id), String(s.label || s.id), String(s.detail || ''), typeof s.impact === 'number' ? s.impact : 0,
              ['info', 'low', 'medium', 'high'].indexOf(s.severity) >= 0 ? s.severity : 'info', s.evidence);
            copy.layer = l.id;
            report.signals.push(copy);
          });
        }
        if (typeof v.scoreAdjust === 'number' && isFinite(v.scoreAdjust)) adjust += clamp(v.scoreAdjust, -40, 40);
      });
      if (adjust) {
        var prevVerdict = report.verdict;
        var s = report.score + adjust;
        if (report.kind === 'message' || report.kind === 'email') s = Math.min(s, MESSAGE_MAX);
        report.score = Math.round(clamp(s, 0, 100));
        report.verdict = verdictOf(report.score);
        if (report.verdict !== prevVerdict) {
          report.verdictLabel = VERDICT_LABELS[report.verdict];
          if (report.kind !== 'phone') report.headline = headlineFor(report);
          report.advice = buildAdvice(report);
        }
      }
      return report;
    });
  }

  return {
    version: VERSION,
    analyzeText: analyzeText,
    analyze: analyze,
    registerLayer: registerLayer,
    unregisterLayer: unregisterLayer,
    _internals: {
      normalizeText: normalizeText,
      classifyInput: classifyInput,
      extractUrls: extractUrls,
      extractEmails: extractEmails,
      extractIbans: extractIbans,
      extractPhones: extractPhones,
      parseUrl: parseUrl,
      refang: refang,
      analyzeUrl: analyzeUrl,
      analyzeIban: analyzeIban,
      analyzeEmail: analyzeEmail,
      ibanChecksumOk: ibanChecksumOk,
      checkBrandLookalike: checkBrandLookalike,
      officialMatch: officialMatch,
      registrableDomain: registrableDomain,
      editDistance: editDistance,
      skeleton: skeleton,
      punycodeDecode: punycodeDecode,
      detectCues: detectCues,
      verdictOf: verdictOf,
      CUES: CUES,
      DETECTORS: DETECTORS,
      BRANDS: BRANDS,
      clearLayers: function () { LAYERS = []; },
      listLayers: function () { return LAYERS.map(function (l) { return l.id; }); }
    }
  };
});
