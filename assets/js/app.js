/* WhoAreYou – interfaccia di "È una truffa?". Vanilla JS, nessuna dipendenza.
 * Usa window.ScamCheck.analyze (assets/js/scamcheck.js, CONTRACT-SCAM.md) per messaggi, link, IBAN ed email
 * e window.WhoAreYou.analyze (assets/js/analyzer.js, CONTRACT.md) per il fascicolo dei numeri di telefono.
 * Il testo dei messaggi non viene mai salvato né messo nell'URL: in cronologia finiscono solo i numeri. */
(function () {
  'use strict';

  var REPORTS_KEY = 'whoareyou:reports';
  var HISTORY_KEY = 'whoareyou:history';
  var HISTORY_MAX = 20;
  var NOTE_MAX = 140;
  var TEXT_MAX = 5000;
  var SITE_URL = 'https://lorebiri.github.io/whoareyou/';
  var BASE_TITLE = document.title;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('cerca');
  var input = $('testo');
  var pasteBtn = $('incolla');
  var submitBtn = $('analizza');
  var counterEl = $('contatore');
  var examplesEl = $('esempi');
  var zone = $('esito');
  var scanEl = $('scan');
  var resultEl = $('result');
  var statusEl = $('annuncio');
  var toastEl = $('toast');
  var historySection = $('cronologia');
  var historyList = $('cronologia-lista');
  var historyClear = $('svuota-cronologia');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var runId = 0;
  var lastMessage = null; // { report, text } dell'ultimo messaggio analizzato, solo in memoria

  /* ---------- helpers ---------- */

  // Crea elementi senza mai usare innerHTML con testo: tutto passa da textContent.
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    if (children == null) return el;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, children) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { el.appendChild(c); });
    return el;
  }

  // Piccole icone disegnate in linea (nessuna risorsa esterna).
  var ICONS = {
    high: 'M12 3 2 20h20L12 3zm0 6v5m0 3v.5',
    medium: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v5m0 3v.5',
    low: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-4 9h8',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 8v6m0-9v.5',
    good: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-4 9 3 3 5-6',
    copy: 'M8 8h11v13H8zM5 16V3h11',
    share: 'M12 15V3m0 0L7 8m5-5 5 5M5 13v8h14v-8',
    external: 'M14 4h6v6m0-6-9 9M18 14v6H4V6h6',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    bank: 'M3 9 12 4l9 5M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 20h18',
    mail: 'M3 6h18v12H3zm0 0 9 7 9-7',
    phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
    back: 'M15 5l-7 7 7 7',
    again: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4'
  };
  function icon(name, cls) {
    return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'icon ' + (cls || '') }, [
      svg('path', { d: ICONS[name] || ICONS.info, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    ]);
  }

  function store(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = h('textarea', { readonly: true, 'aria-hidden': 'true', class: 'offscreen' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy'));
    });
  }

  var dateFmt;
  try { dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { dateFmt = null; }
  function fmtDate(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return '';
    return dateFmt ? dateFmt.format(d) : d.toLocaleString();
  }

  /* ---------- etichette ---------- */

  var VERDICTS = {
    affidabile: 'Probabilmente affidabile',
    neutro: 'Nessun segnale netto',
    sospetto: 'Sospetto',
    pericoloso: 'Pericoloso'
  };
  var SEVERITY_RANK = { high: 0, medium: 1, low: 2, info: 3 };
  var SEVERITY_LABEL = { high: 'Rischio alto', medium: 'Rischio medio', low: 'Rischio basso', info: 'Informazione' };
  var CATEGORIES = [
    { id: 'spam', label: 'Segnalazioni spam', note: 'Siti dove gli utenti commentano i numeri che li hanno chiamati.' },
    { id: 'motori', label: 'Motori di ricerca', note: 'Il numero cercato in tutti i formati in cui può comparire.' },
    { id: 'social', label: 'Social network', note: 'Profili e post pubblici che citano il numero.' },
    { id: 'messaggistica', label: 'App di messaggistica', note: 'Apri una chat per vedere nome e foto profilo, se pubblici.' },
    { id: 'ufficiali', label: 'Fonti ufficiali', note: 'Enti e registri per verificare o segnalare.' }
  ];
  var VOTES = [
    { id: 'safe', label: 'Affidabile', cls: 'vote-safe' },
    { id: 'spam', label: 'Spam', cls: 'vote-spam' },
    { id: 'scam', label: 'Truffa', cls: 'vote-scam' }
  ];

  /* ---------- analisi ---------- */

  function analyzerReady() {
    return !!(window.WhoAreYou && typeof window.WhoAreYou.analyze === 'function');
  }
  function scamReady() {
    return !!(window.ScamCheck && typeof window.ScamCheck.analyze === 'function');
  }

  // Euristica minima, usata solo se scamcheck.js non è caricato o per scegliere l'animazione.
  function looksLikePhone(s) {
    s = String(s || '').trim();
    if (!/^[+\d\s().\-\/]{5,30}$/.test(s)) return false;
    var digits = s.replace(/\D/g, '');
    return digits.length >= 6 && digits.length <= 16;
  }

  function setBusy(on) {
    submitBtn.disabled = !!on;
    resultEl.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function announce(msg) {
    statusEl.textContent = '';
    // piccolo ritardo: alcuni lettori di schermo ignorano un cambio immediato
    setTimeout(function () { statusEl.textContent = msg; }, 60);
  }

  // Punto d'ingresso: testo libero (messaggio, link, IBAN, email o numero).
  function runAnalysis(raw, opts) {
    opts = opts || {};
    raw = String(raw || '').replace(/\r\n?/g, '\n').trim().slice(0, TEXT_MAX);
    lastMessage = null;
    if (!raw) {
      renderError('Incolla prima qualcosa da controllare.', 'Va bene un SMS, un\'email, un messaggio WhatsApp, un link, un IBAN o un numero di telefono.');
      input.focus();
      return;
    }

    if (!scamReady()) {
      if (looksLikePhone(raw)) { runPhone(raw, opts); return; }
      renderError('Il motore di analisi dei messaggi non si è caricato.', 'Ricarica la pagina. Se il problema continua, controlla che il browser non blocchi gli script del sito. Puoi comunque verificare un numero di telefono incollandolo da solo.');
      return;
    }

    var id = ++runId;
    setBusy(true);
    var pending;
    try {
      pending = Promise.resolve(window.ScamCheck.analyze(raw, { defaultCountry: 'IT' }));
    } catch (e) {
      pending = Promise.reject(e);
    }
    var phoneGuess = looksLikePhone(raw);
    var steps = phoneGuess ? phoneSteps(analyzerReady() ? safePhone(raw) : null) : MESSAGE_STEPS;

    playScan(steps, phoneGuess ? raw : null, pending, function (err, report) {
      if (id !== runId) return;
      setBusy(false);
      if (err || !report) {
        renderError('Non siamo riusciti ad analizzare questo testo.', 'Riprova. Se il problema continua, ricarica la pagina.');
        return;
      }
      if (report.kind === 'empty' || (report.error && report.kind !== 'phone')) {
        renderError(report.error || 'Non c\'è niente da analizzare.', 'Incolla il testo completo del messaggio, il link, l\'IBAN o il numero.');
        return;
      }
      var phone = report.kind === 'phone' && report.entities && report.entities.phones && report.entities.phones[0];
      if (report.kind === 'phone') {
        if (!phone || !phone.result) {
          renderError(report.error || 'Questo non sembra un numero di telefono valido.', PHONE_HINT);
          return;
        }
        showPhone(phone.result, opts);
        return;
      }
      clearUrl();
      lastMessage = { report: report, text: raw };
      renderMessage(report, raw);
      afterRender(opts, 'Analisi completata. ' + verdictText(report) + '. ' + (report.headline || ''));
    });
  }

  var PHONE_HINT = 'Controlla le cifre: un cellulare italiano ha di solito 10 cifre (es. 333 123 4567), un fisso inizia con 0.';

  function safePhone(raw) {
    try { return window.WhoAreYou.analyze(raw, { defaultCountry: 'IT' }); } catch (e) { return null; }
  }

  // Analisi diretta di un numero con WhoAreYou (cronologia, fallback, numeri trovati in un messaggio).
  function runPhone(raw, opts) {
    opts = opts || {};
    if (!analyzerReady()) {
      renderError('Il motore di analisi non si è caricato.', 'Ricarica la pagina. Se il problema continua, controlla che il browser non blocchi gli script del sito.');
      return;
    }
    var result = safePhone(raw);
    if (!result || result.error || (!result.e164 && !result.valid)) {
      renderError((result && result.error) || 'Questo non sembra un numero di telefono valido.', PHONE_HINT);
      return;
    }
    var id = ++runId;
    setBusy(true);
    playScan(phoneSteps(result), result.international || result.e164, Promise.resolve(result), function () {
      if (id !== runId) return;
      setBusy(false);
      showPhone(result, opts);
    });
  }

  function showPhone(result, opts) {
    if (!result || result.error || (!result.e164 && !result.valid)) {
      renderError((result && result.error) || 'Questo non sembra un numero di telefono valido.', PHONE_HINT);
      return;
    }
    renderResult(result, opts.back || null);
    remember(result);
    updateUrl(result);
    afterRender(opts, 'Fascicolo pronto per ' + (result.international || result.e164) + '. ' + (result.verdictLabel || VERDICTS[result.verdict] || ''));
  }

  function afterRender(opts, msg) {
    announce(msg);
    var target = resultEl.querySelector('[data-focus]') || zone;
    if (opts.focus !== false) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
    if (opts.scroll !== false) scrollToResult();
  }

  function verdictText(r) {
    return r.verdictLabel || VERDICTS[r.verdict] || VERDICTS.neutro;
  }

  function scrollToResult() {
    var top = zone.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // Controlli realmente eseguiti dai motori (scamcheck.js e analyzer.js).
  var MESSAGE_STEPS = [
    'Leggo il testo',
    'Confronto con i copioni di truffa noti',
    'Controllo i link',
    'Verifico IBAN, email e numeri di telefono',
    'Cerco urgenza, minacce e richieste di codici'
  ];
  function phoneSteps(r) {
    return [
      'Normalizzo il formato del numero',
      r && r.country ? 'Riconosco il prefisso +' + r.country.dialCode : 'Cerco il prefisso internazionale',
      'Classifico il tipo di linea',
      'Confronto con gli schemi di truffa noti',
      'Preparo le ricerche sul web'
    ];
  }

  // Mostra i passi dell'analisi e chiama done(err, valore) quando sia l'animazione sia la promessa sono finite.
  function playScan(steps, label, pending, done) {
    var animDone = false, settled = false, err = null, value = null, finished = false;
    var items = [];
    function finish() {
      if (finished || !animDone || !settled) return;
      finished = true;
      scanEl.hidden = true;
      document.body.classList.remove('scanning');
      done(err, value);
    }
    pending.then(function (v) { value = v; settled = true; finish(); },
      function (e) { err = e || new Error('analisi'); settled = true; finish(); });

    resultEl.textContent = '';
    scanEl.textContent = '';
    var list = h('ol', { class: 'scan-steps' });
    items = steps.map(function (s) { return h('li', null, s); });
    append(list, items);
    append(scanEl, [
      h('p', { class: 'scan-number' + (label ? '' : ' scan-title'), text: label || 'Analisi in corso' }),
      list
    ]);

    if (reduceMotion) {
      // Nessuna animazione: mostriamo la lista solo se la risposta tarda.
      items.forEach(function (li) { li.classList.add('done'); });
      animDone = true;
      setTimeout(function () { if (!finished) scanEl.hidden = false; }, 250);
      finish();
      return;
    }

    scanEl.hidden = false;
    document.body.classList.add('scanning');
    var i = 0;
    var per = 190;
    (function tick() {
      if (i > 0) items[i - 1].classList.add('done');
      if (i < items.length) {
        items[i].classList.add('active');
        i++;
        setTimeout(tick, per);
      } else {
        // l'ultimo passo resta "attivo" finché la risposta non arriva
        items[items.length - 1].classList.remove('done');
        items[items.length - 1].classList.add('active');
        setTimeout(function () { animDone = true; finish(); }, 140);
      }
    })();
  }

  /* ---------- rendering ---------- */

  function renderError(title, detail) {
    runId++;
    submitBtn.disabled = false;
    scanEl.hidden = true;
    document.body.classList.remove('scanning');
    resultEl.textContent = '';
    append(resultEl, h('div', { class: 'error-card', role: 'alert' }, [
      icon('medium', 'error-icon'),
      h('div', null, [h('p', { class: 'error-title', text: title }), detail ? h('p', { text: detail }) : null])
    ]));
  }

  // back: { report, text } se il numero arriva da un messaggio appena analizzato.
  function renderResult(r, back) {
    resultEl.textContent = '';
    var verdict = VERDICTS[r.verdict] ? r.verdict : 'neutro';
    var score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    var e164 = r.e164 || r.normalized;
    var shown = r.international || r.e164 || r.normalized;

    var dossier = h('article', { class: 'dossier v-' + verdict, 'aria-labelledby': 'dossier-num' });

    // Intestazione
    var head = h('header', { class: 'dossier-head' }, [
      back ? h('button', { type: 'button', class: 'btn-link back-link', onclick: function () {
        lastMessage = back;
        renderMessage(back.report, back.text);
        clearUrl();
        afterRender({}, 'Di nuovo l\'analisi del messaggio. ' + verdictText(back.report) + '.');
      } }, [icon('back'), h('span', { text: 'Torna all\'analisi del messaggio' })]) : null,
      h('p', { class: 'dossier-kicker', text: 'Fascicolo del numero' }),
      h('div', { class: 'dossier-actions' }, [
        h('button', { type: 'button', class: 'btn-ghost sm', onclick: function () {
          copyText(e164).then(function () { toast('Numero copiato: ' + e164); }, function () { toast('Copia non riuscita: seleziona il numero a mano.'); });
        } }, [icon('copy'), h('span', { text: 'Copia numero' })]),
        h('button', { type: 'button', class: 'btn-ghost sm', onclick: function () { share(r); } }, [icon('share'), h('span', { text: 'Condividi' })])
      ])
    ]);

    // Identità: anello + numero + timbro
    var gauge = buildGauge(score, verdict);
    var identity = h('div', { class: 'identity' }, [
      gauge.el,
      h('div', { class: 'identity-main' }, [
        h('h2', { id: 'dossier-num', class: 'number', tabindex: '-1', 'data-focus': '' }, shown),
        r.national && r.national !== shown ? h('p', { class: 'national muted' }, 'Formato nazionale: ' + r.national) : null,
        h('p', { class: 'stamp', 'data-verdict': verdict }, r.verdictLabel || VERDICTS[verdict])
      ])
    ]);

    // Dati
    var facts = h('dl', { class: 'facts' });
    addFact(facts, 'Paese', r.country ? [h('span', { class: 'flag', 'aria-hidden': 'true', text: r.country.flag || '' }), ' ' + r.country.name + ' (+' + r.country.dialCode + ')'] : 'Non determinato');
    addFact(facts, 'Tipo di linea', r.lineTypeLabel || 'Non determinato');
    if (r.area) addFact(facts, 'Area', r.area);
    if (r.operatorHint) addFact(facts, 'Operatore di origine', r.operatorHint);
    if (!r.valid) addFact(facts, 'Formato', 'Non del tutto plausibile: verifica di averlo copiato bene');

    append(dossier, [head, identity, facts]);
    append(dossier, h('div', { class: 'dossier-cols' }, [buildSignals(r.signals || []), buildAdvice(r.advice || [])]));
    append(dossier, buildLookups(r.lookups || []));
    append(dossier, buildReports(e164));

    append(resultEl, dossier);
    gauge.start();
    document.title = shown + ' – chi è? Verifica numero | WhoAreYou';
  }

  function addFact(dl, label, value) {
    append(dl, h('div', null, [h('dt', { text: label }), append(h('dd'), value)]));
  }

  function buildGauge(score, verdict) {
    var R = 52, C = 2 * Math.PI * R;
    var arc = svg('circle', { cx: '60', cy: '60', r: String(R), class: 'gauge-arc', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2) });
    var ticks = [];
    for (var i = 0; i < 40; i++) {
      var a = (i / 40) * Math.PI * 2;
      var r1 = 58, r2 = i % 10 === 0 ? 63 : 61;
      ticks.push(svg('line', { x1: (60 + r1 * Math.sin(a)).toFixed(2), y1: (60 - r1 * Math.cos(a)).toFixed(2), x2: (60 + r2 * Math.sin(a)).toFixed(2), y2: (60 - r2 * Math.cos(a)).toFixed(2), class: 'gauge-tick' }));
    }
    var ring = svg('svg', { viewBox: '-4 -4 128 128', class: 'gauge-svg', 'aria-hidden': 'true', focusable: 'false' },
      ticks.concat([svg('circle', { cx: '60', cy: '60', r: String(R), class: 'gauge-track' }), arc]));
    var num = h('span', { class: 'gauge-num', text: reduceMotion ? String(score) : '0' });
    var el = h('div', { class: 'gauge', role: 'img', 'aria-label': 'Affidabilità ' + score + ' su 100' }, [
      ring, h('div', { class: 'gauge-label' }, [num, h('span', { class: 'gauge-of', text: 'su 100' })])
    ]);
    return {
      el: el,
      start: function () {
        var target = C * (1 - score / 100);
        if (reduceMotion) { arc.setAttribute('stroke-dashoffset', target.toFixed(2)); return; }
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { arc.style.strokeDashoffset = target.toFixed(2); });
        });
        var t0 = performance.now(), dur = 900;
        (function step(t) {
          var p = Math.min(1, (t - t0) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          num.textContent = String(Math.round(score * eased));
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      }
    };
  }

  function buildSignals(signals) {
    var sorted = signals.slice().sort(function (a, b) {
      var ra = SEVERITY_RANK[a.severity] != null ? SEVERITY_RANK[a.severity] : 3;
      var rb = SEVERITY_RANK[b.severity] != null ? SEVERITY_RANK[b.severity] : 3;
      if (ra !== rb) return ra - rb;
      return (Number(a.impact) || 0) - (Number(b.impact) || 0);
    });
    var sec = h('section', { class: 'panel signals', 'aria-labelledby': 'h-signals' }, [h('h3', { id: 'h-signals', text: 'Segnali rilevati' })]);
    if (!sorted.length) {
      append(sec, h('p', { class: 'muted', text: 'Nessun segnale particolare: la struttura del numero è nella norma.' }));
      return sec;
    }
    var ul = h('ul', { class: 'signal-list' });
    sorted.forEach(function (s) {
      var positive = (Number(s.impact) || 0) > 0;
      var sev = SEVERITY_RANK[s.severity] != null ? s.severity : 'info';
      var kind = positive ? 'good' : sev;
      append(ul, h('li', { class: 'signal s-' + kind }, [
        icon(kind),
        h('div', null, [
          h('p', { class: 'signal-label' }, [
            h('span', { text: s.label }),
            h('span', { class: 'sr-only', text: ' (' + (positive ? 'rassicurante' : SEVERITY_LABEL[sev]) + ')' })
          ]),
          s.detail ? h('p', { class: 'signal-detail', text: s.detail }) : null
        ])
      ]));
    });
    append(sec, ul);
    return sec;
  }

  function buildAdvice(advice, emptyText) {
    var sec = h('section', { class: 'panel advice', 'aria-labelledby': 'h-advice' }, [h('h3', { id: 'h-advice', text: 'Cosa ti consigliamo' })]);
    if (!advice.length) {
      append(sec, h('p', { class: 'muted', text: emptyText || 'Se non aspettavi la chiamata, cerca il numero sul web prima di richiamare.' }));
      return sec;
    }
    append(sec, append(h('ul', { class: 'advice-list' }), advice.map(function (a) { return h('li', { text: a }); })));
    return sec;
  }

  function lookupLink(l) {
    return h('a', { class: 'lookup', href: safeUrl(l.url), target: '_blank', rel: 'noopener noreferrer nofollow' }, [
      h('span', { class: 'lookup-name' }, [h('span', { text: l.label }), icon('external', 'ext')]),
      l.description ? h('span', { class: 'lookup-desc', text: l.description }) : null,
      h('span', { class: 'sr-only', text: ' (si apre in una nuova scheda)' })
    ]);
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || '')) ? String(u) : '#';
  }

  function topLookups(lookups) {
    var picked = [];
    var order = ['motori', 'spam', 'spam', 'social', 'messaggistica', 'ufficiali'];
    var used = {};
    order.forEach(function (cat) {
      if (picked.length >= 4) return;
      for (var i = 0; i < lookups.length; i++) {
        if (!used[i] && lookups[i].category === cat && safeUrl(lookups[i].url) !== '#') { used[i] = 1; picked.push(lookups[i]); return; }
      }
    });
    for (var j = 0; j < lookups.length && picked.length < 4; j++) {
      if (!used[j] && safeUrl(lookups[j].url) !== '#') { used[j] = 1; picked.push(lookups[j]); }
    }
    return picked;
  }

  function buildLookups(lookups) {
    lookups = lookups.filter(function (l) { return l && safeUrl(l.url) !== '#'; });
    var sec = h('section', { class: 'investigate', 'aria-labelledby': 'h-web' });
    var top = topLookups(lookups);
    var note = h('p', { class: 'popup-note small', hidden: true });
    append(sec, h('div', { class: 'investigate-head' }, [
      h('div', null, [
        h('h3', { id: 'h-web', text: 'Indaga sul web' }),
        h('p', { class: 'muted small', text: 'Ogni ricerca si apre in una nuova scheda sul sito scelto. Il numero viene inviato solo a quel sito.' })
      ]),
      top.length ? h('button', { type: 'button', class: 'btn-primary', onclick: function () {
        var blocked = 0;
        top.forEach(function (l) {
          var w = null;
          try { w = window.open(l.url, '_blank'); } catch (e) { w = null; }
          if (w) { try { w.opener = null; } catch (e) { /* ignora */ } } else blocked++;
        });
        note.hidden = false;
        note.textContent = blocked
          ? 'Il browser ha bloccato ' + blocked + ' schede su ' + top.length + ': consenti i popup per questo sito oppure apri le ricerche qui sotto una per una.'
          : 'Aperte ' + top.length + ' ricerche in nuove schede.';
      } }, 'Apri le ricerche principali (' + top.length + ')') : null
    ]));
    append(sec, note);

    if (!lookups.length) {
      append(sec, h('p', { class: 'muted', text: 'Nessuna ricerca disponibile per questo numero.' }));
      return sec;
    }
    var grid = h('div', { class: 'lookup-groups' });
    var known = {};
    CATEGORIES.forEach(function (c) { known[c.id] = 1; });
    var cats = CATEGORIES.concat([{ id: '__altro', label: 'Altre ricerche', note: '' }]);
    cats.forEach(function (cat) {
      var items = lookups.filter(function (l) { return cat.id === '__altro' ? !known[l.category] : l.category === cat.id; });
      if (!items.length) return;
      append(grid, h('div', { class: 'lookup-group' }, [
        h('h4', { text: cat.label }),
        cat.note ? h('p', { class: 'small muted', text: cat.note }) : null,
        append(h('ul', { class: 'lookup-list' }), items.map(function (l) { return h('li', null, lookupLink(l)); }))
      ]));
    });
    append(sec, grid);
    return sec;
  }

  /* ---------- esito di un messaggio (ScamCheck) ---------- */

  var KIND_LABEL = {
    message: 'Analisi del messaggio',
    url: 'Analisi del link',
    iban: 'Analisi dell\'IBAN',
    email: 'Analisi dell\'indirizzo email'
  };
  var CONFIDENCE_LABEL = { alta: 'Somiglianza alta', media: 'Somiglianza media', bassa: 'Somiglianza bassa' };
  var RISK = {
    alto: { label: 'Rischio alto', v: 'pericoloso' },
    medio: { label: 'Rischio medio', v: 'sospetto' },
    basso: { label: 'Rischio basso', v: 'neutro' }
  };
  var LAYER_STATUS = { ok: 'Completata', error: 'Non disponibile', skipped: 'Non eseguita' };

  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return x == null ? '' : String(x); }

  function sortSignals(signals) {
    return arr(signals).filter(Boolean).slice().sort(function (a, b) {
      var ra = SEVERITY_RANK[a.severity] != null ? SEVERITY_RANK[a.severity] : 3;
      var rb = SEVERITY_RANK[b.severity] != null ? SEVERITY_RANK[b.severity] : 3;
      if (ra !== rb) return ra - rb;
      return (Number(a.impact) || 0) - (Number(b.impact) || 0);
    });
  }

  // Rende un link inoffensivo da leggere: niente schema cliccabile, punti tra parentesi.
  function defang(s) {
    return str(s)
      .replace(/^(h)(t)(tps?)(:\/\/)/i, function (m, a, b, c) { return a + 'xx' + c.slice(1) + '[://]'; })
      .replace(/\./g, '[.]');
  }
  function shorten(s, max) {
    s = str(s);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
  function groupIban(s) {
    return str(s).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
  }

  function renderMessage(rep, text) {
    resultEl.textContent = '';
    var verdict = VERDICTS[rep.verdict] ? rep.verdict : 'neutro';
    var score = Math.max(0, Math.min(100, Math.round(Number(rep.score) || 0)));
    var ent = rep.entities || {};

    var card = h('article', { class: 'dossier msg-report v-' + verdict, 'aria-labelledby': 'msg-headline' });

    var head = h('header', { class: 'dossier-head' }, [
      h('p', { class: 'dossier-kicker', text: KIND_LABEL[rep.kind] || KIND_LABEL.message }),
      h('div', { class: 'dossier-actions' }, [
        h('button', { type: 'button', class: 'btn-ghost sm', onclick: function () {
          copyText(summaryText(rep)).then(function () { toast('Esito copiato negli appunti (senza il testo del messaggio).'); },
            function () { toast('Copia non riuscita.'); });
        } }, [icon('copy'), h('span', { text: 'Copia esito' })]),
        h('button', { type: 'button', class: 'btn-ghost sm', onclick: newCheck }, [icon('again'), h('span', { text: 'Controlla un altro testo' })])
      ])
    ]);

    var gauge = buildGauge(score, verdict);
    var identity = h('div', { class: 'identity' }, [
      gauge.el,
      h('div', { class: 'identity-main' }, [
        h('p', { class: 'stamp', 'data-verdict': verdict }, verdictText(rep)),
        h('h2', { id: 'msg-headline', class: 'headline', tabindex: '-1', 'data-focus': '' }, rep.headline || verdictText(rep))
      ])
    ]);

    append(card, [head, identity]);
    append(card, buildScams(arr(rep.scams)));
    append(card, h('div', { class: 'dossier-cols' }, [buildMsgSignals(rep.signals), buildAdvice(arr(rep.advice), 'Se il messaggio ti mette fretta o chiede soldi o codici, fermati e verifica con il mittente usando un contatto ufficiale.')]));
    append(card, buildHighlighted(text, rep));
    append(card, buildEntities(ent));
    append(card, buildLayers(arr(rep.layers)));
    append(card, h('p', { class: 'disclaimer small muted', text: 'L\'esito è indicativo: si basa su regole e copioni di truffa noti. Nel dubbio non cliccare, non pagare e chiedi conferma a una persona di fiducia o al servizio clienti ufficiale.' }));

    append(resultEl, card);
    gauge.start();
    document.title = verdictText(rep) + ' – esito del controllo | WhoAreYou';
  }

  function buildScams(scams) {
    if (!scams.length) return null;
    var sec = h('section', { class: 'scam-found', 'aria-labelledby': 'h-scams' }, [
      h('h3', { id: 'h-scams', text: scams.length > 1 ? 'Truffe riconosciute' : 'Truffa riconosciuta' })
    ]);
    var order = { alta: 0, media: 1, bassa: 2 };
    var list = h('ul', { class: 'scam-cards' });
    scams.slice().sort(function (a, b) { return (order[a.confidence] != null ? order[a.confidence] : 3) - (order[b.confidence] != null ? order[b.confidence] : 3); })
      .forEach(function (s) {
        var c = CONFIDENCE_LABEL[s.confidence] ? s.confidence : 'bassa';
        append(list, h('li', { class: 'scam-card conf-' + c }, [
          h('div', { class: 'scam-card-head' }, [
            h('h4', { text: str(s.label) || 'Copione di truffa' }),
            h('span', { class: 'badge conf-' + c, text: CONFIDENCE_LABEL[c] })
          ]),
          s.explanation ? h('p', { text: s.explanation }) : null
        ]));
      });
    append(sec, list);
    return sec;
  }

  function signalItem(s) {
    var positive = (Number(s.impact) || 0) > 0;
    var sev = SEVERITY_RANK[s.severity] != null ? s.severity : 'info';
    var kind = positive ? 'good' : sev;
    return h('li', { class: 'signal s-' + kind }, [
      icon(kind),
      h('div', null, [
        h('p', { class: 'signal-label' }, [
          h('span', { text: str(s.label) }),
          h('span', { class: 'sr-only', text: ' (' + (positive ? 'rassicurante' : SEVERITY_LABEL[sev]) + ')' })
        ]),
        s.detail ? h('p', { class: 'signal-detail', text: s.detail }) : null,
        s.evidence ? h('p', { class: 'evidence' }, [
          h('span', { class: 'sr-only', text: 'Nel testo: ' }),
          h('q', { text: shorten(s.evidence, 160) })
        ]) : null
      ])
    ]);
  }

  function buildMsgSignals(signals) {
    var sorted = sortSignals(signals);
    var sec = h('section', { class: 'panel signals', 'aria-labelledby': 'h-signals' }, [h('h3', { id: 'h-signals', text: 'Perché lo pensiamo' })]);
    if (!sorted.length) {
      append(sec, h('p', { class: 'muted', text: 'Nessun segnale particolare trovato nel testo.' }));
      return sec;
    }
    append(sec, append(h('ul', { class: 'signal-list' }), sorted.map(signalItem)));
    return sec;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Copia di sola lettura del testo con le parti sospette evidenziate. Solo nodi di testo e <mark>.
  function buildHighlighted(text, rep) {
    var ent = rep.entities || {};
    var needles = [];
    sortSignals(rep.signals).forEach(function (s) {
      if (s.evidence && (Number(s.impact) || 0) <= 0) needles.push({ t: str(s.evidence), sev: SEVERITY_RANK[s.severity] != null ? s.severity : 'low', label: str(s.label) });
    });
    arr(ent.urls).forEach(function (u) { if (u && u.raw) needles.push({ t: str(u.raw), sev: u.risk === 'alto' ? 'high' : u.risk === 'medio' ? 'medium' : 'low', label: 'Link' }); });
    arr(ent.ibans).forEach(function (b) { if (b && b.raw) needles.push({ t: str(b.raw), sev: 'medium', label: 'IBAN' }); });
    arr(ent.emails).forEach(function (m) { if (m && m.raw) needles.push({ t: str(m.raw), sev: 'low', label: 'Email' }); });
    arr(ent.phones).forEach(function (p) { if (p && p.raw) needles.push({ t: str(p.raw), sev: 'low', label: 'Numero' }); });

    // intervalli [inizio, fine) con la gravità più alta
    var ranges = [];
    needles.forEach(function (n) {
      var t = n.t.trim();
      if (t.length < 2 || t.length > 600) return;
      var re;
      try { re = new RegExp(t.split(/\s+/).map(escapeRe).join('\\s+'), 'gi'); } catch (e) { return; }
      var m, guard = 0;
      while ((m = re.exec(text)) && guard++ < 50) {
        if (!m[0].length) { re.lastIndex++; continue; }
        ranges.push({ s: m.index, e: m.index + m[0].length, sev: n.sev, label: n.label });
      }
    });
    if (!ranges.length) return null;
    ranges.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r.s <= last.e) {
        last.e = Math.max(last.e, r.e);
        if (SEVERITY_RANK[r.sev] < SEVERITY_RANK[last.sev]) { last.sev = r.sev; last.label = r.label; }
      } else merged.push({ s: r.s, e: r.e, sev: r.sev, label: r.label });
    });

    var box = h('div', { class: 'msg-copy', role: 'region', 'aria-label': 'Il tuo testo con le parti sospette evidenziate', tabindex: '0' });
    var pos = 0;
    merged.forEach(function (r) {
      if (r.s > pos) box.appendChild(document.createTextNode(text.slice(pos, r.s)));
      var mark = h('mark', { class: 'hl hl-' + r.sev, title: r.label });
      mark.textContent = text.slice(r.s, r.e);
      box.appendChild(mark);
      pos = r.e;
    });
    if (pos < text.length) box.appendChild(document.createTextNode(text.slice(pos)));

    return h('details', { class: 'msg-text', open: true }, [
      h('summary', null, [h('span', { class: 'h3like', text: 'Il tuo testo, con le parti sospette evidenziate' })]),
      h('p', { class: 'small muted', text: 'Copia di sola lettura: i link qui dentro non sono cliccabili. Il testo resta sul tuo dispositivo.' }),
      box,
      h('ul', { class: 'hl-legend small', 'aria-label': 'Legenda' }, [
        h('li', null, [h('mark', { class: 'hl hl-high', text: 'rosso' }), ' rischio alto']),
        h('li', null, [h('mark', { class: 'hl hl-medium', text: 'arancio' }), ' rischio medio']),
        h('li', null, [h('mark', { class: 'hl hl-low', text: 'grigio' }), ' da controllare'])
      ])
    ]);
  }

  function reasonsList(signals) {
    var s = sortSignals(signals);
    if (!s.length) return null;
    return append(h('ul', { class: 'reasons' }), s.map(function (x) {
      var positive = (Number(x.impact) || 0) > 0;
      var sev = SEVERITY_RANK[x.severity] != null ? x.severity : 'info';
      return h('li', { class: 'reason s-' + (positive ? 'good' : sev) }, [
        h('strong', { text: str(x.label) }),
        x.detail ? h('span', { text: ' – ' + x.detail }) : null
      ]);
    }));
  }

  function entityGroup(id, iconName, title, note, items) {
    return h('section', { class: 'entity-group', 'aria-labelledby': id }, [
      h('h4', { id: id }, [icon(iconName), h('span', { text: title })]),
      note ? h('p', { class: 'small muted', text: note }) : null,
      append(h('ul', { class: 'entity-list' }), items)
    ]);
  }

  function buildEntities(ent) {
    var urls = arr(ent.urls).filter(Boolean);
    var ibans = arr(ent.ibans).filter(Boolean);
    var emails = arr(ent.emails).filter(Boolean);
    var phones = arr(ent.phones).filter(function (p) { return p && p.result; });
    if (!urls.length && !ibans.length && !emails.length && !phones.length) return null;

    var sec = h('section', { class: 'found', 'aria-labelledby': 'h-found' }, [
      h('h3', { id: 'h-found', text: 'Cosa abbiamo trovato nel testo' })
    ]);
    var groups = h('div', { class: 'entity-groups' });

    if (urls.length) {
      append(groups, entityGroup('h-f-urls', 'link', urls.length > 1 ? 'Link (' + urls.length + ')' : 'Link',
        'Mostrati in forma sicura e non cliccabili. Non aprirli: se devi controllare qualcosa, vai tu sul sito ufficiale scrivendo l\'indirizzo a mano.',
        urls.map(function (u) {
          var risk = RISK[u.risk] || RISK.basso;
          return h('li', { class: 'entity v-' + risk.v }, [
            h('div', { class: 'entity-head' }, [
              h('p', { class: 'entity-main defanged', text: u.host ? defang(u.host) : 'Indirizzo non leggibile' }),
              h('span', { class: 'badge risk', text: risk.label })
            ]),
            h('p', { class: 'entity-sub small muted' }, [h('span', { class: 'sr-only', text: 'Link completo: ' }), h('span', { class: 'defanged', text: shorten(defang(u.raw), 140) })]),
            reasonsList(u.signals)
          ]);
        })));
    }

    if (ibans.length) {
      append(groups, entityGroup('h-f-ibans', 'bank', 'IBAN',
        'Un IBAN corretto non garantisce chi lo possiede: prima di un bonifico verifica sempre con il destinatario usando un contatto che conosci già.',
        ibans.map(function (b) {
          var ok = !!b.validChecksum;
          return h('li', { class: 'entity v-' + (ok ? 'neutro' : 'pericoloso') }, [
            h('div', { class: 'entity-head' }, [
              h('p', { class: 'entity-main mono', text: groupIban(b.normalized || b.raw) }),
              h('span', { class: 'badge ' + (ok ? 'ok' : 'ko'), text: ok ? 'Codice di controllo corretto' : 'Codice di controllo errato' })
            ]),
            h('p', { class: 'entity-sub small muted', text: 'Paese: ' + (b.country || 'non riconosciuto') }),
            reasonsList(b.signals)
          ]);
        })));
    }

    if (emails.length) {
      append(groups, entityGroup('h-f-emails', 'mail', 'Indirizzi email', null,
        emails.map(function (m) {
          var bad = sortSignals(m.signals).filter(function (s) { return (Number(s.impact) || 0) < 0; });
          var worst = bad.length ? bad[0].severity : null;
          var v = worst === 'high' ? 'pericoloso' : worst === 'medium' ? 'sospetto' : 'neutro';
          return h('li', { class: 'entity v-' + v }, [
            h('div', { class: 'entity-head' }, [
              h('p', { class: 'entity-main mono', text: str(m.raw) }),
              bad.length ? h('span', { class: 'badge risk', text: SEVERITY_LABEL[worst] || 'Da controllare' }) : null
            ]),
            m.domain ? h('p', { class: 'entity-sub small muted', text: 'Dominio: ' + defang(m.domain) }) : null,
            reasonsList(m.signals)
          ]);
        })));
    }

    if (phones.length) {
      append(groups, entityGroup('h-f-phones', 'phone', 'Numeri di telefono',
        'Non richiamare un numero solo perché è scritto nel messaggio: usa quello sul sito ufficiale o sulla tua carta.',
        phones.map(function (p) {
          var r = p.result;
          var v = VERDICTS[r.verdict] ? r.verdict : 'neutro';
          var shown = r.international || r.e164 || str(p.raw);
          return h('li', { class: 'entity phone-row v-' + v }, [
            h('div', { class: 'phone-row-main' }, [
              h('span', { class: 'dot', 'aria-hidden': 'true' }),
              h('div', null, [
                h('p', { class: 'entity-main mono', text: shown }),
                h('p', { class: 'entity-sub small muted', text: [r.verdictLabel || VERDICTS[v], r.lineTypeLabel, r.country && r.country.name].filter(Boolean).join(' · ') })
              ])
            ]),
            h('button', { type: 'button', class: 'btn-ghost sm', onclick: function () {
              var back = lastMessage;
              renderResult(r, back);
              remember(r);
              updateUrl(r);
              afterRender({}, 'Fascicolo pronto per ' + shown + '. ' + (r.verdictLabel || VERDICTS[v]));
            } }, [h('span', { text: 'Analizza questo numero' }), h('span', { class: 'sr-only', text: ' ' + shown })])
          ]);
        })));
    }

    append(sec, groups);
    return sec;
  }

  // Livelli di analisi: oggi solo "Regole"; pronto per livelli futuri (es. analisi AI).
  function buildLayers(layers) {
    if (!layers.length) layers = [{ id: 'regole', label: 'Regole', status: 'ok' }];
    return h('section', { class: 'layers', 'aria-labelledby': 'h-layers' }, [
      h('h3', { id: 'h-layers', class: 'small-head', text: 'Livelli di analisi' }),
      append(h('ul', { class: 'layer-list' }), layers.map(function (l) {
        var st = LAYER_STATUS[l.status] ? l.status : 'skipped';
        return h('li', { class: 'layer st-' + st }, [
          h('span', { class: 'layer-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'layer-name', text: str(l.label || l.id) }),
          h('span', { class: 'layer-status', text: LAYER_STATUS[st] }),
          l.summary ? h('span', { class: 'layer-summary', text: str(l.summary) }) : null
        ]);
      }))
    ]);
  }

  function summaryText(rep) {
    var lines = ['WhoAreYou – È una truffa?', 'Esito: ' + verdictText(rep) + ' (affidabilità ' + Math.round(Number(rep.score) || 0) + '/100)'];
    if (rep.headline) lines.push(rep.headline);
    arr(rep.scams).forEach(function (s) { lines.push('Truffa riconosciuta: ' + s.label + ' (' + (CONFIDENCE_LABEL[s.confidence] || '').toLowerCase() + ')'); });
    var sig = sortSignals(rep.signals).filter(function (s) { return (Number(s.impact) || 0) < 0; }).slice(0, 6);
    if (sig.length) { lines.push('', 'Segnali:'); sig.forEach(function (s) { lines.push('- ' + s.label); }); }
    if (arr(rep.advice).length) { lines.push('', 'Consigli:'); rep.advice.forEach(function (a) { lines.push('- ' + a); }); }
    lines.push('', SITE_URL);
    return lines.join('\n');
  }

  function newCheck() {
    input.value = '';
    lastMessage = null;
    autoGrow();
    resultEl.textContent = '';
    document.title = BASE_TITLE;
    clearUrl();
    var top = form.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    input.focus({ preventScroll: true });
  }

  /* ---------- segnalazioni locali ---------- */

  function getReports() {
    var r = store(REPORTS_KEY, {});
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  }
  function getEntry(all, e164) {
    var e = all[e164];
    if (!e || typeof e !== 'object') e = {};
    var v = e.votes && typeof e.votes === 'object' ? e.votes : {};
    return {
      votes: { safe: +v.safe || 0, spam: +v.spam || 0, scam: +v.scam || 0 },
      notes: Array.isArray(e.notes) ? e.notes.filter(function (n) { return n && typeof n.text === 'string'; }) : []
    };
  }

  function buildReports(e164) {
    var sec = h('section', { class: 'reports', 'aria-labelledby': 'h-reports' });
    var counts = h('ul', { class: 'vote-counts' });
    var notesList = h('ul', { class: 'notes' });
    var noteInput = h('input', { id: 'nota', type: 'text', maxlength: String(NOTE_MAX), placeholder: 'es. "dice di essere il gestore della luce"', autocomplete: 'off' });
    var status = h('p', { class: 'small muted', 'aria-live': 'polite' });

    function refresh() {
      var entry = getEntry(getReports(), e164);
      counts.textContent = '';
      VOTES.forEach(function (v) {
        append(counts, h('li', { class: 'count-' + v.id }, [h('strong', { text: String(entry.votes[v.id]) }), ' ' + v.label]));
      });
      notesList.textContent = '';
      entry.notes.slice(-5).reverse().forEach(function (n) {
        append(notesList, h('li', null, [h('span', { text: n.text }), h('time', { class: 'small muted', datetime: safeIso(n.ts), text: fmtDate(n.ts) })]));
      });
      notesList.hidden = !entry.notes.length;
    }

    function vote(kind) {
      var all = getReports();
      var entry = getEntry(all, e164);
      entry.votes[kind] += 1;
      var text = noteInput.value.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
      if (text) entry.notes.push({ text: text, ts: Date.now() });
      if (entry.notes.length > 50) entry.notes = entry.notes.slice(-50);
      all[e164] = entry;
      if (save(REPORTS_KEY, all)) {
        noteInput.value = '';
        status.textContent = 'Segnalazione salvata su questo dispositivo.';
      } else {
        status.textContent = 'Non è stato possibile salvare: il browser blocca la memoria locale (navigazione privata?).';
      }
      refresh();
    }

    append(sec, [
      h('h3', { id: 'h-reports', text: 'Le tue segnalazioni' }),
      h('p', { class: 'small muted', text: 'Segnalazioni salvate su questo dispositivo: restano nel tuo browser e nessun altro le vede.' }),
      counts,
      h('div', { class: 'vote-form' }, [
        h('label', { for: 'nota', class: 'small', text: 'Nota facoltativa (max ' + NOTE_MAX + ' caratteri)' }),
        noteInput,
        h('div', { class: 'vote-buttons', role: 'group', 'aria-label': 'Segna questo numero come' }, VOTES.map(function (v) {
          return h('button', { type: 'button', class: 'vote ' + v.cls, onclick: function () { vote(v.id); } }, v.label);
        }))
      ]),
      status,
      notesList
    ]);
    refresh();
    return sec;
  }

  function safeIso(ts) {
    try { return new Date(ts).toISOString(); } catch (e) { return ''; }
  }

  /* ---------- cronologia ---------- */

  function getHistory() {
    var hst = store(HISTORY_KEY, []);
    return Array.isArray(hst) ? hst.filter(function (x) { return x && typeof x.e164 === 'string'; }) : [];
  }

  function remember(r) {
    if (!r.e164) return;
    var hst = getHistory().filter(function (x) { return x.e164 !== r.e164; });
    hst.unshift({ e164: r.e164, ts: Date.now(), verdict: r.verdict });
    save(HISTORY_KEY, hst.slice(0, HISTORY_MAX));
    renderHistory();
  }

  function renderHistory() {
    var hst = getHistory();
    historyList.textContent = '';
    historySection.hidden = !hst.length;
    hst.forEach(function (item) {
      var v = VERDICTS[item.verdict] ? item.verdict : 'neutro';
      append(historyList, h('li', null, h('button', { type: 'button', class: 'history-item v-' + v, onclick: function () {
        input.value = item.e164;
        autoGrow();
        lastMessage = null;
        runPhone(item.e164);
      } }, [
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', { class: 'history-num', text: item.e164 }),
        h('span', { class: 'history-meta small muted', text: VERDICTS[v] + ', ' + fmtDate(item.ts) })
      ])));
    });
  }

  historyClear.addEventListener('click', function () {
    try { window.localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignora */ }
    renderHistory();
    toast('Cronologia cancellata.');
    input.focus();
  });

  /* ---------- URL, condivisione ---------- */

  function shareUrl(r) {
    var u = new URL(window.location.href);
    u.hash = '';
    u.search = '?n=' + encodeURIComponent(r.e164 || r.normalized);
    return u.toString();
  }

  function updateUrl(r) {
    if (!r.e164 || !window.history || !history.replaceState) return;
    try { history.replaceState(null, '', shareUrl(r)); } catch (e) { /* file:// o simili */ }
  }

  function share(r) {
    var url = shareUrl(r);
    var num = r.international || r.e164;
    var data = { title: 'Chi è ' + num + '? | WhoAreYou', text: 'Ho verificato il numero ' + num + ' su WhoAreYou: ' + (r.verdictLabel || ''), url: url };
    if (navigator.share) {
      navigator.share(data).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        fallback();
      });
    } else fallback();
    function fallback() {
      copyText(url).then(function () { toast('Link copiato negli appunti.'); }, function () { window.prompt('Copia questo link:', url); });
    }
  }

  function clearUrl() {
    if (!window.history || !history.replaceState) return;
    if (!window.location.search && !window.location.hash) return;
    try {
      var u = new URL(window.location.href);
      u.search = '';
      u.hash = '';
      history.replaceState(null, '', u.toString());
    } catch (e) { /* file:// o simili */ }
  }

  // ?q= / #q= (testo libero) e ?n= / #n= (numero, retrocompatibile).
  function readDeepLink() {
    var params = [];
    try { params.push(new URLSearchParams(window.location.search)); } catch (e) { /* ignora */ }
    if (window.location.hash) {
      try { params.push(new URLSearchParams(window.location.hash.slice(1))); } catch (e) { /* ignora */ }
    }
    for (var i = 0; i < params.length; i++) {
      var q = params[i].get('q');
      if (q && q.trim()) return { type: 'q', value: q.slice(0, TEXT_MAX) };
      var n = params[i].get('n');
      if (n && n.trim()) return { type: 'n', value: n.slice(0, 40) };
    }
    return null;
  }

  /* ---------- campo di testo ---------- */

  function autoGrow() {
    input.style.height = 'auto';
    var max = Math.max(220, Math.round(window.innerHeight * 0.6));
    input.style.height = Math.min(input.scrollHeight + 4, max) + 'px';
    input.style.overflowY = input.scrollHeight + 4 > max ? 'auto' : 'hidden';
    var len = input.value.length;
    counterEl.textContent = len ? len + ' / ' + TEXT_MAX + ' caratteri' : '';
    counterEl.classList.toggle('near', len > TEXT_MAX * 0.9);
  }

  function fillAndRun(text) {
    input.value = String(text || '').slice(0, TEXT_MAX);
    autoGrow();
    runAnalysis(input.value);
  }

  // Esempi volutamente finti (indirizzi e IBAN di prova) per provare lo strumento.
  var EXAMPLES = [
    { label: 'Finto pacco', text: 'Poste: il tuo pacco è in giacenza per indirizzo incompleto. Conferma i dati e paga 1,99 euro di spese entro 24 ore, altrimenti verrà restituito al mittente: https://poste-giacenza-esempio.xyz/pacco' },
    { label: 'Ciao mamma', text: 'Ciao mamma, mi si è rotto il telefono e questo è il mio nuovo numero, salvalo. Ho bisogno di un favore urgente: devo pagare una fattura oggi ma non riesco con la mia app. Ti mando l\'IBAN, fai un bonifico istantaneo e poi ti ridò tutto. IBAN IT60X0542811101000000123456' },
    { label: 'Banca bloccata', text: 'AVVISO SICUREZZA: abbiamo rilevato un accesso anomalo al tuo conto. Il conto è stato temporaneamente sospeso. Per riattivarlo verifica subito i tuoi dati qui: http://banca-verifica-esempio.top/login e inserisci il codice OTP che riceverai via SMS.' },
    { label: 'Un numero', text: '+1 876 555 0123' }
  ];

  function buildExamples() {
    if (!examplesEl) return;
    examplesEl.textContent = '';
    EXAMPLES.forEach(function (ex) {
      append(examplesEl, h('li', null, h('button', { type: 'button', class: 'chip', onclick: function () { fillAndRun(ex.text); } }, [
        h('span', { text: ex.label }),
        h('span', { class: 'sr-only', text: ' (esempio inventato)' })
      ])));
    });
  }

  /* ---------- eventi ---------- */

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    runAnalysis(input.value);
  });

  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      runAnalysis(input.value);
    }
  });

  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function' && window.isSecureContext) {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (t) {
        t = String(t || '').trim();
        if (!t) { toast('Gli appunti sono vuoti.'); input.focus(); return; }
        if (t.length > TEXT_MAX) toast('Testo lungo: analizziamo i primi ' + TEXT_MAX + ' caratteri.');
        fillAndRun(t);
      }, function () {
        toast('Il browser non permette di leggere gli appunti: incolla con Ctrl+V o tieni premuto sul campo.');
        input.focus();
      });
    });
  }

  buildExamples();
  renderHistory();
  autoGrow();

  var deep = readDeepLink();
  if (deep) {
    // Privacy: il testo non resta nella barra degli indirizzi né nella cronologia del browser.
    if (deep.type === 'q') clearUrl();
    input.value = deep.value;
    autoGrow();
    var start = function () {
      if (deep.type === 'n' && !scamReady()) runPhone(deep.value, { focus: false });
      else runAnalysis(deep.value, { focus: false });
    };
    // Gli script sono defer e in ordine, ma restiamo prudenti se i motori arrivano dopo.
    if (scamReady() || analyzerReady()) start();
    else window.addEventListener('load', start, { once: true });
  }
})();
