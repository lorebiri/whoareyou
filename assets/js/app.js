/* WhoAreYou – interfaccia. Vanilla JS, nessuna dipendenza.
 * Usa window.WhoAreYou.analyze (assets/js/analyzer.js) secondo CONTRACT.md. */
(function () {
  'use strict';

  var REPORTS_KEY = 'whoareyou:reports';
  var HISTORY_KEY = 'whoareyou:history';
  var HISTORY_MAX = 20;
  var NOTE_MAX = 140;
  var BASE_TITLE = document.title;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('cerca');
  var input = $('numero');
  var pasteBtn = $('incolla');
  var submitBtn = $('indaga');
  var zone = $('esito');
  var scanEl = $('scan');
  var resultEl = $('result');
  var toastEl = $('toast');
  var historySection = $('cronologia');
  var historyList = $('cronologia-lista');
  var historyClear = $('svuota-cronologia');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var runId = 0;

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
    external: 'M14 4h6v6m0-6-9 9M18 14v6H4V6h6'
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
    return window.WhoAreYou && typeof window.WhoAreYou.analyze === 'function';
  }

  function runAnalysis(raw, opts) {
    opts = opts || {};
    raw = String(raw || '').trim();
    if (!raw) {
      renderError('Inserisci un numero di telefono da analizzare.', 'Puoi incollarlo dal registro chiamate: vanno bene spazi, trattini e prefisso +39 o 0039.');
      input.focus();
      return;
    }
    if (!analyzerReady()) {
      renderError('Il motore di analisi non si è caricato.', 'Ricarica la pagina. Se il problema continua, controlla che il browser non blocchi gli script del sito.');
      return;
    }

    var result;
    try {
      result = window.WhoAreYou.analyze(raw, { defaultCountry: 'IT' });
    } catch (e) {
      renderError('Non siamo riusciti ad analizzare questo numero.', 'Controlla di averlo copiato per intero e riprova.');
      return;
    }
    if (!result || result.error || (!result.e164 && !result.valid)) {
      renderError((result && result.error) || 'Questo non sembra un numero di telefono valido.',
        'Controlla le cifre: un cellulare italiano ha di solito 10 cifre (es. 333 123 4567), un fisso inizia con 0.');
      return;
    }

    var id = ++runId;
    submitBtn.disabled = true;
    playScan(result, function () {
      if (id !== runId) return;
      submitBtn.disabled = false;
      renderResult(result);
      remember(result);
      updateUrl(result);
      if (opts.focus !== false) zone.focus({ preventScroll: true });
      if (opts.scroll !== false) scrollToResult();
    });
  }

  function scrollToResult() {
    var top = zone.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // Breve sequenza che descrive i controlli realmente eseguiti dall'analizzatore.
  function playScan(r, done) {
    var steps = ['Normalizzo il formato del numero'];
    steps.push(r.country ? 'Riconosco il prefisso +' + r.country.dialCode : 'Cerco il prefisso internazionale');
    steps.push('Classifico il tipo di linea');
    steps.push('Confronto con gli schemi di truffa noti');
    steps.push('Preparo le ricerche sul web');

    if (reduceMotion) { done(); return; }

    resultEl.textContent = '';
    scanEl.textContent = '';
    var list = h('ol', { class: 'scan-steps' });
    var items = steps.map(function (s) { return h('li', null, s); });
    append(list, items);
    append(scanEl, [h('p', { class: 'scan-number', text: r.international || r.e164 || r.normalized }), list]);
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
        setTimeout(function () {
          scanEl.hidden = true;
          document.body.classList.remove('scanning');
          done();
        }, 140);
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

  function renderResult(r) {
    resultEl.textContent = '';
    var verdict = VERDICTS[r.verdict] ? r.verdict : 'neutro';
    var score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    var e164 = r.e164 || r.normalized;
    var shown = r.international || r.e164 || r.normalized;

    var dossier = h('article', { class: 'dossier v-' + verdict, 'aria-labelledby': 'dossier-num' });

    // Intestazione
    var head = h('header', { class: 'dossier-head' }, [
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
        h('h2', { id: 'dossier-num', class: 'number' }, shown),
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

  function buildAdvice(advice) {
    var sec = h('section', { class: 'panel advice', 'aria-labelledby': 'h-advice' }, [h('h3', { id: 'h-advice', text: 'Cosa ti consigliamo' })]);
    if (!advice.length) {
      append(sec, h('p', { class: 'muted', text: 'Se non aspettavi la chiamata, cerca il numero sul web prima di richiamare.' }));
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
        runAnalysis(item.e164);
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

  function readDeepLink() {
    var n = null;
    try { n = new URLSearchParams(window.location.search).get('n'); } catch (e) { n = null; }
    if (!n && window.location.hash) {
      var m = window.location.hash.slice(1);
      try { n = new URLSearchParams(m).get('n'); } catch (e) { n = null; }
    }
    return n ? n.slice(0, 40) : null;
  }

  /* ---------- eventi ---------- */

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    runAnalysis(input.value);
  });

  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function' && window.isSecureContext) {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (t) {
        t = String(t || '').trim().slice(0, 40);
        if (!t) { toast('Gli appunti sono vuoti.'); input.focus(); return; }
        input.value = t;
        runAnalysis(t);
      }, function () {
        toast('Il browser non permette di leggere gli appunti: incolla con Ctrl+V o tieni premuto sul campo.');
        input.focus();
      });
    });
  }

  renderHistory();

  var deep = readDeepLink();
  if (deep) {
    input.value = deep;
    var start = function () { runAnalysis(deep, { focus: false }); };
    // Gli script sono defer e in ordine, ma restiamo prudenti se analyzer.js arriva dopo.
    if (analyzerReady()) start();
    else window.addEventListener('load', start, { once: true });
  }
})();
