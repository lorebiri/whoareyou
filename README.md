# WhoAreYou – È una truffa?

**WhoAreYou** è un sito statico in italiano che ti aiuta a capire se un messaggio è una truffa. Incolli un SMS, un'email, un messaggio WhatsApp, un link, un IBAN o un numero di telefono e ottieni subito, direttamente nel browser, un'analisi in parole semplici: punteggio di affidabilità, verdetto, truffe riconosciute, parti sospette evidenziate e consigli pratici. Il testo non lascia il tuo dispositivo.

Sito pubblicato: <https://lorebiri.github.io/whoareyou/>

## Funzionalità

- **Analisi di messaggi** (SMS, email, WhatsApp): riconosce i copioni di truffa più diffusi in Italia (finto corriere, finta banca, falso INPS o Agenzia delle Entrate, "Ciao mamma", finti premi…) e i segnali di urgenza, minaccia e richiesta di codici OTP, PIN o password.
- **Parti sospette evidenziate** in una copia di sola lettura del testo.
- **Cosa c'è nel testo**: link (mostrati in forma sicura e non cliccabili, con rischio e motivi), IBAN (paese e codice di controllo), indirizzi email e numeri di telefono, ciascuno con il suo esito.
- **Fascicolo dei numeri di telefono** (il vecchio "Chi mi ha chiamato?"): paese, tipo di linea, operatore di origine, rischio wangiri e numeri a pagamento, ricerche sul web con un clic, segnalazioni personali.
- **Punteggio di affidabilità 0–100** con verdetto (affidabile, neutro, sospetto, pericoloso) e consigli pratici.
- **Esempi inventati** da provare con un clic.
- **Cronologia** dei soli numeri di telefono, salvata sul tuo dispositivo. Il testo dei messaggi non viene mai salvato.
- **Deep link**: `?q=<testo>` (o `#q=`) avvia l'analisi e poi ripulisce l'indirizzo; `?n=%2B393331234567` apre il fascicolo di un numero. Per privacy l'URL viene aggiornato con `?n=` solo per i numeri, mai con il testo di un messaggio.
- **Livelli di analisi**: oggi "Regole"; il motore prevede livelli aggiuntivi (es. analisi AI) tramite `ScamCheck.registerLayer`.
- **Guide** su truffa wangiri, blocco del telemarketing e prefissi internazionali a rischio.

## Come funziona (e i suoi limiti)

Tutto avviene **lato client**: il JavaScript della pagina analizza il testo o il numero nel browser e nessun dato viene inviato a un server nostro (non ne abbiamo uno). Nessun cookie, nessun tracker.

Limiti onesti:

- L'analisi dei messaggi si basa su **regole e copioni di truffa noti**: una truffa nuova o scritta bene può sfuggire, e un messaggio vero può avere qualche segnale sospetto. Nel dubbio verifica sempre con i canali ufficiali.
- Un sito statico **non può interrogare i database a pagamento di identificazione chiamante** né le banche dati degli operatori. WhoAreYou non conosce il nome dell'intestatario di un numero o di un IBAN, e i link non vengono mai aperti.
- L'analisi si basa sulla **struttura del numero** (prefisso, piano di numerazione, intervalli noti) e su regole euristiche; l'operatore indicato è quello di assegnazione originaria e può essere cambiato per portabilità.
- Per sapere cosa dicono gli altri utenti, lo strumento **prepara ricerche web mirate** che apri tu: i risultati dipendono dai siti esterni.
- Il punteggio è indicativo: un prefisso estero non è di per sé una prova di frode.

## Struttura del progetto

```
.
├── index.html                  # Strumento principale (UI)
├── assets/
│   ├── css/style.css           # Stile dello strumento
│   ├── css/pages.css           # Stile di guide, privacy e 404
│   ├── js/analyzer.js          # Motore numeri di telefono (window.WhoAreYou)
│   ├── js/scamcheck.js         # Motore messaggi, link, IBAN, email (window.ScamCheck)
│   ├── js/app.js               # Logica UI, cronologia, deep link
│   └── img/                    # favicon.svg, og-image.svg, og-image.png
├── guide/
│   ├── chiamate-truffa-wangiri.html
│   ├── come-bloccare-telemarketing.html
│   └── prefissi-internazionali-pericolosi.html
├── tests/analyzer.test.js      # Test del motore numeri (node)
├── tests/scamcheck.test.js     # Test del motore messaggi (node)
├── privacy.html
├── 404.html
├── robots.txt
├── sitemap.xml
├── site.webmanifest
├── .nojekyll                   # Pubblica i file così come sono, senza Jekyll
├── CONTRACT.md                 # Contratto del motore numeri
└── CONTRACT-SCAM.md            # Contratto del motore messaggi
```

## Eseguire in locale

Non c'è nessun build step. Basta un server statico qualunque:

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000/
```

Test dei motori di analisi:

```bash
node tests/analyzer.test.js
node tests/scamcheck.test.js
```

> Nota: in locale la pagina `404.html` usa percorsi assoluti `/whoareyou/…` pensati per GitHub Pages, quindi i suoi link funzionano solo una volta pubblicata.

## Pubblicare su GitHub Pages

1. Fai push del repository su GitHub (es. `lorebiri/whoareyou`).
2. Vai su **Settings → Pages**.
3. In *Build and deployment* scegli **Source: Deploy from a branch**, poi il branch (es. `main`) e la cartella **/ (root)**. Salva.
4. Dopo qualche minuto il sito è online su `https://<utente>.github.io/whoareyou/`.

Il file `.nojekyll` evita che GitHub Pages elabori il sito con Jekyll.

## Checklist SEO dopo la pubblicazione

1. Apri **Google Search Console** e aggiungi la proprietà con prefisso URL `https://lorebiri.github.io/whoareyou/`.
2. **Verifica la proprietà** (il metodo più semplice è il tag HTML `<meta name="google-site-verification" …>` da inserire nel `<head>` di `index.html`, oppure il file HTML di verifica da caricare nella root).
3. In **Sitemap** invia `sitemap.xml` (URL completo: `https://lorebiri.github.io/whoareyou/sitemap.xml`).
4. Con **Controllo URL** richiedi l'indicizzazione della home e delle tre guide.
5. Controlla i **dati strutturati** (Article, BreadcrumbList, FAQPage) con il Rich Results Test di Google.
6. Verifica l'anteprima social (`og-image.png`) con un debugger di Open Graph.
7. Quando aggiorni i contenuti, aggiorna anche `<lastmod>` in `sitemap.xml` e la data nelle pagine.

## Usare un dominio personalizzato

1. In **Settings → Pages → Custom domain** inserisci il dominio (es. `chimihachiamato.it`); GitHub crea un file `CNAME` nella root.
2. Configura il DNS presso il tuo registrar (record `CNAME` verso `<utente>.github.io` per un sottodominio, oppure record `A`/`AAAA` verso gli IP di GitHub Pages per il dominio principale) e attiva **Enforce HTTPS**.
3. Sostituisci `https://lorebiri.github.io/whoareyou/` con il nuovo dominio in:
   - tutti i `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image` e JSON-LD di `index.html`, `privacy.html` e `guide/*.html`;
   - tutte le voci `<loc>` di `sitemap.xml`;
   - la riga `Sitemap:` di `robots.txt`.
4. In `404.html` i link usano il percorso `/whoareyou/`: se il sito è servito dalla root del dominio, sostituiscilo con `/`.
5. Aggiungi il nuovo dominio come proprietà in Search Console e invia di nuovo la sitemap.

## Privacy

Vedi [privacy.html](privacy.html). In sintesi: l'analisi avviene nel browser e il testo dei messaggi non viene salvato né inviato; cronologia dei numeri (`whoareyou:history`) e segnalazioni (`whoareyou:reports`) restano nel `localStorage` del tuo dispositivo e puoi cancellarle quando vuoi.

## Avvertenze

Le informazioni fornite hanno valore indicativo. In caso di truffa o tentativo di frode rivolgiti alla Polizia Postale (<https://www.commissariatodips.it/>); per il telemarketing indesiderato iscriviti al Registro Pubblico delle Opposizioni (<https://www.registropubblicodelleopposizioni.it/>).
