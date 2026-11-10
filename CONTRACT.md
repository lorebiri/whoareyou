# Contratto interno tra moduli (whoareyou)

Sito 100% statico, nessuna dipendenza esterna, nessun build step. Lingua: italiano.
URL canonico: https://lorebiri.github.io/whoareyou/

## File e proprietari
- assets/js/analyzer.js  -> motore di analisi (Agente "engine")
- tests/analyzer.test.js -> test node (`node tests/analyzer.test.js`) (Agente "engine")
- index.html, assets/css/style.css, assets/js/app.js -> UI (Agente "ui")
- robots.txt, sitemap.xml, site.webmanifest, assets/img/favicon.svg, assets/img/og-image.svg,
  guide/*.html, privacy.html, 404.html, README.md -> SEO/contenuti (Agente "seo")

## API di analyzer.js
Script classico (no ES module). Espone `window.WhoAreYou` (e `module.exports` se in Node):

    WhoAreYou.analyze(rawInput: string, opts?: { defaultCountry?: "IT" }) -> Result

    Result = {
      input: string,
      normalized: string,            // solo cifre con + iniziale se internazionale, es "+393331234567"
      valid: boolean,                // plausibile come numero reale
      error: string|null,            // messaggio leggibile se input inutilizzabile
      e164: string|null,             // "+393331234567"
      national: string|null,         // "333 123 4567"
      international: string|null,    // "+39 333 123 4567"
      country: { code: "IT", name: "Italia", flag: "🇮🇹", dialCode: "39" } | null,
      lineType: "mobile"|"landline"|"toll_free"|"premium"|"shared_cost"|"voip"|"m2m"|"short"|"unknown",
      lineTypeLabel: string,         // "Cellulare", "Fisso", "Numero verde", "Numero a pagamento"...
      area: string|null,             // es. "Roma (06)" per i fissi italiani
      operatorHint: string|null,     // operatore di assegnazione originario (con nota portabilità)
      score: number,                 // 0..100, 100 = molto affidabile
      verdict: "affidabile"|"neutro"|"sospetto"|"pericoloso",
      verdictLabel: string,          // "Probabilmente affidabile", ...
      signals: Array<{ id: string, label: string, detail: string,
                       impact: number,   // negativo = aumenta rischio, positivo = rassicura
                       severity: "info"|"low"|"medium"|"high" }>,
      advice: string[],              // consigli pratici in italiano
      lookups: Array<{ id: string, label: string, url: string,
                       category: "motori"|"spam"|"social"|"messaggistica"|"ufficiali",
                       description: string }>
    }

    WhoAreYou.version: string

## Storage locale (app.js)
- localStorage key "whoareyou:reports" -> { [e164]: { votes: {safe:n, spam:n, scam:n}, notes: [{text, ts}] } }
- localStorage key "whoareyou:history" -> array di { e164, ts, verdict } (max 20)
- Deep link: index.html?n=%2B393331234567 avvia subito l'analisi (anche #n=...).
