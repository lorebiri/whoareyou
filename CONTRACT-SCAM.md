# Contratto fase 1 — "È una truffa?"

Tutto nel browser, nessuna dipendenza esterna, nessun build step, lingua italiana.
Il motore numeri esistente (assets/js/analyzer.js, window.WhoAreYou) NON va modificato nell'API.

## File e proprietari
- assets/js/scamcheck.js, tests/scamcheck.test.js, tests/fixtures/messages.js -> Agente "engine"
- index.html, assets/css/style.css, assets/js/app.js, sitemap.xml, README.md, site.webmanifest -> Agente "ui"
- Ordine script in index.html: analyzer.js, scamcheck.js, app.js (tutti defer).

## API di scamcheck.js
Script classico UMD: window.ScamCheck nel browser, module.exports in Node.
In Node fa `require('./analyzer.js')` (stesso percorso relativo assets/js/) per avere WhoAreYou; nel browser usa window.WhoAreYou.

    ScamCheck.version: string
    ScamCheck.analyzeText(text: string, opts?: { defaultCountry?: "IT", now?: Date }) -> Report      // sincrono, livello regole
    ScamCheck.analyze(text, opts) -> Promise<Report>   // esegue analyzeText poi i livelli extra registrati (fase 3)
    ScamCheck.registerLayer(layer: { id: string, label: string,
        run: (text: string, report: Report) => Promise<{ signals?: Signal[], scoreAdjust?: number, summary?: string } | null> })
      // fase 3: es. livello "claude" che chiama un piccolo server. Errori/timeout di un livello non rompono l'analisi
      // (il livello viene annotato in report.layers con status "error").

    Report = {
      input: string,
      kind: "phone" | "url" | "iban" | "email" | "message" | "empty",   // "phone" se l'input è solo un numero, ecc.
      error: string | null,              // es. input vuoto
      score: number,                     // 0..100, 100 = affidabile (stessa scala di WhoAreYou)
      verdict: "affidabile"|"neutro"|"sospetto"|"pericoloso",
      verdictLabel: string,
      headline: string,                  // una frase semplice, es. "Sembra la truffa del finto corriere."
      scams: Array<{ id: string, label: string, confidence: "bassa"|"media"|"alta",
                     explanation: string }>,     // copioni riconosciuti (finto_corriere, finta_banca, inps_ade, ciao_mamma, finto_premio, finto_acquirente, ...)
      signals: Array<{ id: string, label: string, detail: string, impact: number,
                       severity: "info"|"low"|"medium"|"high", evidence?: string }>,  // evidence = frammento del testo che ha fatto scattare il segnale
      advice: string[],
      entities: {
        phones: Array<{ raw: string, result: WhoAreYouResult }>,
        urls:   Array<{ raw: string, host: string|null, signals: Signal[], risk: "basso"|"medio"|"alto" }>,
        ibans:  Array<{ raw: string, normalized: string, country: string|null, validChecksum: boolean, signals: Signal[] }>,
        emails: Array<{ raw: string, domain: string, signals: Signal[] }>
      },
      layers: Array<{ id: string, label: string, status: "ok"|"error"|"skipped", summary?: string }>  // "regole" sempre presente
    }

Se l'input è SOLO un numero di telefono, kind="phone" e score/verdict/advice coincidono con quelli di WhoAreYou.analyze
(entities.phones[0].result contiene il risultato completo, così la UI può mostrare il fascicolo numero esistente).

## Deep link
index.html?q=<testo> (o #q=) avvia l'analisi; ?n= resta supportato per retrocompatibilità.
Per privacy l'URL viene aggiornato con ?n= SOLO quando kind="phone"; per i messaggi non si mette il testo nell'URL.
