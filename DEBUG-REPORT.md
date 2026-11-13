# Rapporto del debug completo – WhoAreYou «È una truffa?»

Data: 13 novembre 2026 · Branch: `claude/debug-completo` (partito da `claude/whoareyou-phone-verification-3cmj3r`, commit `04cfde0`).
Nessun merge su `main`, nessuna PR, nessuna pubblicazione.

## Come è stato fatto

- Letti README, i due contratti, i test e la CI (`.github/workflows/pages.yml`).
- Eseguiti tutti i test con node.
- Sito servito con `python3 -m http.server` e provato in Chromium (Playwright) come farebbe un utente:
  - larghezza 360 e 390 px (telefono) e 1280 px (desktop), tema chiaro e scuro;
  - deep link `?q=`, `#q=`, `?n=` e `#n=`;
  - esempi, cronologia, segnalazioni, «Torna all'analisi», input vuoto, emoji, testo arabo (RTL), a capo Windows, 5000 caratteri.
- Motore truffe provato con circa 150 messaggi italiani, tra truffe e messaggi veri di banche, Poste, corrieri, INPS, Agenzia delle Entrate e gestori.
- Provati anche link sosia, punycode, accorciatori, IP, IBAN e numeri esteri.
- Sicurezza: provato codice HTML e script dentro il testo (XSS), CSP e link resi inoffensivi.
- Privacy: controllato che il testo non finisca nell'URL, nel `localStorage` o nelle richieste di rete.
- Accessibilità: controllo automatico axe-core su tutte le pagine e sui due tipi di risultato, in tema chiaro e scuro.
- SEO: JSON-LD (validità), sitemap, robots e link interni rotti.
- Prestazioni: testi patologici fino a 30.000 caratteri, tutti analizzati in meno di 110 ms.

## Esito dei test

| | Prima | Dopo |
|---|---|---|
| `node tests/analyzer.test.js` | 40 superati, 0 falliti | 41 superati, 0 falliti |
| `node tests/scamcheck.test.js` | 199 superati, 0 falliti | 212 superati, 0 falliti |
| `node tests/browser.test.js` (nuovo, facoltativo) | – | 4 superati, 0 falliti |
| Fixture: falsi positivi / falsi negativi | 0 / 0 | 0 / 0 |

Ogni correzione ha il suo test, scritto prima della correzione e fallito prima di essa. Nessun test è stato disattivato o saltato.

## Bug corretti

| # | Gravità | Problema | Causa | Correzione |
|---|---|---|---|---|
| 1 | **Alta** | Le pagine create da chiunque su `sites.google.com`, `docs.google.com` (moduli), `drive.google.com`, `forms.office.com` ecc. risultavano «Dominio ufficiale di Google/Microsoft». Un link di phishing lì dava «Probabilmente affidabile». Esempio: «Poste: conto sospeso, verifica su sites.google.com/…» risultava neutro. | `officialMatch` riconosceva tutto `google.com` e `office.com` come ufficiale, prima di controllare gli hosting gratuiti. | Nuovo elenco `USER_CONTENT`: questi indirizzi non sono più ufficiali e ricevono il segnale «hosting gratuito». Il messaggio di esempio ora è «pericoloso». |
| 2 | **Alta** | «Sono l'operatore della banca, **mi serve il codice** che ti è arrivato» risultava neutro. | L'indizio `otp_request` non conosceva «mi/ci serve…» e «mi occorre…». | Aggiunte queste forme. Le frasi «non serve comunicarlo» non scattano. |
| 3 | Media | `dhl-it.delivery` (dominio senza `http`) non veniva riconosciuto come link: il messaggio del finto pacco risultava neutro. | L'elenco delle estensioni per i domini «nudi» non aveva `.delivery`, `.express`, `.company` e simili. | Aggiunte 18 estensioni recenti; `.delivery` e `.express` contano anche come estensioni poco comuni. |
| 4 | Media | Un IBAN scritto all'italiana, «IT 60 X 05428 11101 000000123456», non veniva riconosciuto e un suo pezzo veniva preso per un numero di telefono. | La regex non ammetteva lo spazio tra paese e cifre di controllo. | Spazio ammesso, ma solo con il codice paese in maiuscolo, così parole come «se 12…» restano escluse. |
| 5 | Media | `https://www.poste.it@evil.com` era solo «rischio medio». | Al trucco della «@» veniva dato -25, sotto la soglia del rischio alto. | Se prima della «@» c'è un nome di sito, il segnale vale -35 e il link è «rischio alto». |
| 6 | Media (privacy) | La home caricava il font da Google Fonts: a ogni visita l'indirizzo IP finiva a Google, mentre la privacy diceva «nessun terzo». | `<link>` a `fonts.googleapis.com`. | Font Archivo ospitato in `assets/fonts` (licenza OFL inclusa) e nessuna richiesta esterna. |
| 7 | Media (sicurezza) | Nessuna Content-Security-Policy. | – | Aggiunta una CSP restrittiva in `index.html`: solo script, stili, font e immagini del sito; niente plugin, niente `base`. Verificato nel browser: nessuna violazione. |
| 8 | Media | `paypal.me/…`, `wa.me/…`, `t.me/…` e `revolut.me/…` erano «Dominio ufficiale», anche se portano a un privato qualsiasi. Nella «Ciao mamma» con `paypal.me` il messaggio prendeva perfino un bonus. | Erano negli elenchi dei domini ufficiali. | Ora sono «Link verso un privato» (segnale lieve) e non sono più né ufficiali né sosia. |
| 9 | Media | Falsi negativi: «Ciao amica, il mio numero vecchio non funziona, salva questo… bonifico urgente» e «il pacco non ha potuto essere consegnato». | Mancavano «numero vecchio» e «non ha potuto essere consegnato». La «Ciao mamma» richiedeva una parola di famiglia o WhatsApp. | Pattern estesi. «Ciao mamma» scatta anche con numero nuovo + richiesta di soldi + urgenza. |
| 10 | Media | Mancava la truffa del **finto acquirente** (Subito/Vinted: «ti mando il link per ricevere il pagamento»), che risultava neutra. | Nessun copione dedicato. | Nuovo copione `finto_acquirente` con spiegazione e consiglio; «annuncio ancora disponibile?» resta neutro. |
| 11 | Bassa | Domini veri segnalati come sosia: `enelx.com` (Enel X) e `notifichedigitali.it` (SEND, notifiche PagoPA). | Non erano nella lista BRANDS. | Aggiunti. |
| 12 | Bassa | Una Partita IVA o un codice fiscale numerico (es. «P.IVA 01114601006») diventavano un «numero di telefono». | Mancavano «P.IVA», «C.F.» e simili tra le parole che precedono un codice. | Aggiunte. |
| 13 | Bassa | IP scritti in decimale o esadecimale (`https://3232235777`, `0x7f000001`) non venivano riconosciuti. | `isIp` accettava solo la forma 1.2.3.4. | Riconosciute tutte le forme che il browser accetta. |
| 14 | Bassa | «Codice cliente IT12345678901234» risultava «sospetto» per un «IBAN non valido». | Qualsiasi «IT» + cifre era un IBAN incompleto. | Un IBAN incompleto conta solo se vicino ci sono parole come IBAN, conto o bonifico. |
| 15 | Bassa | Numeri 199 (es. «199 123 456») indicati come «non validi». | `analyzer.js` li trattava come numeri brevi da 3–6 cifre. | Ora sono validi e indicati come numeri a tariffa specifica (costosi). |
| 16 | Bassa (privacy) | Se il JavaScript non partiva, premere «Analizza» metteva il testo del messaggio nell'URL (`?q=…`) e nella cronologia del browser. | Il `<textarea>` aveva `name="q"`. | Tolto `name`: non serve al codice. |
| 17 | Bassa (grafica) | Un link lunghissimo faceva uscire il testo dalla scheda «Perché lo pensiamo» (tagliato su telefono). | Al riquadro del segnale mancavano `min-width: 0` e l'a capo forzato. | Corretto il CSS. Il test nel browser lo verifica a 360 px. |
| 18 | Bassa (accessibilità) | Nelle guide e nella privacy il logo «Are» aveva contrasto 3,7:1 (minimo 4,5:1). Le tabelle scorrevoli non si raggiungevano da tastiera. | Colore `--accent` troppo chiaro; mancava `tabindex`. | Usato `--accent-strong`; tabelle con `tabindex="0"` ed etichetta. Ora axe-core non segnala errori su nessuna pagina. |
| 19 | Bassa (contenuti) | L'informativa privacy parlava solo di numeri, non dei messaggi. | Non aggiornata dopo la fase 1. | Aggiornata: analisi dei messaggi, testo mai salvato né nell'URL, nessuna risorsa esterna. |

Verificato e **senza problemi**:

- **XSS:** nessun HTML o script del testo viene eseguito, anche se messo nelle note o nel `localStorage`.
- **Privacy:** il testo non va mai nell'URL (`?q=` e `#q=` vengono ripuliti), nel `localStorage` o nelle richieste di rete.
- **Link:** nel risultato sono resi inoffensivi e non cliccabili.
- **Errori:** nessun errore JavaScript nella console.
- **Pagine:** JSON-LD valido in tutte le pagine e nessun link interno rotto.
- **Prestazioni:** buone su testi patologici.

## Problemi non corretti (e perché)

1. **Notifiche vere con «se non sei stato tu chiama il …» e un numero fisso**: una notifica UniCredit vera risulta «sospetto». I truffatori usano esattamente lo stesso testo, quindi il motore non può distinguerli. Se il numero è un numero verde (800), il messaggio resta neutro. Lo lascio così: meglio un avviso in più che uno in meno.
2. **«Papà mi fai una ricarica PostePay di 20 euro?»** risulta «sospetto». È anche lo schema della «Ciao mamma»; nel testo non c'è modo di sapere se il figlio è vero.
3. **Siti dei Comuni** (`www.comune.milano.it`): non sono nella lista ufficiale, quindi un avviso TARI vero con PagoPA risulta «sospetto» (copione multa, confidenza bassa). Riconoscerli tutti richiederebbe l'elenco di circa 8000 domini geografici. Da valutare.
4. **«Sono il nipote di tua sorella, mandami 2000 euro su questo IBAN lituano»** resta neutro: c'è solo un lieve segnale «IBAN estero». Manca un copione «parente che chiede soldi» senza incidente e senza numero nuovo. Aggiungerlo con regole semplici rischia falsi allarmi; meglio progettarlo con calma, o con il livello AI della fase 3.
5. **Link `http://poste.it:8080`**: la porta strana su un dominio ufficiale non viene segnalata, perché i domini ufficiali escono prima del controllo. È un caso quasi teorico.
6. **Il test nel browser non è nella CI**: GitHub Actions dovrebbe installare Chromium, il che allunga la CI. Si lancia a mano con `node tests/browser.test.js`.
7. **`404.html`** usa percorsi assoluti `/whoareyou/…`: è voluto ed è già scritto nel README.
8. **CSP solo su `index.html`**: le guide e la privacy non hanno script dinamici. Si può aggiungere anche lì in futuro.

## Dubbi sulla lista BRANDS (domini ufficiali)

Domini che non sono riuscito a confermare con certezza o che meritano attenzione. Prima di toccarli conviene verificarli a mano:

- `agenziaentrate.it`: il sito vero è `agenziaentrate.gov.it`. Non so se il `.it` senza `gov` sia dell'Agenzia (forse un vecchio redirect). Se non lo è, è un rischio, perché oggi risulta «ufficiale».
- `fineco.it`: il dominio principale è `finecobank.com`. Da verificare.
- `freetox.it` (Free To X, gruppo Autostrade) e `movyon.com` (società tecnologica di Autostrade): probabilmente veri, ma non sono domini a cui i clienti vengono mandati per pagare pedaggi.
- `italotreno.com`: il sito principale è `italotreno.it`; il `.com` è probabilmente un redirect. Da verificare.
- `tnt.it`: TNT Italia è ora parte di FedEx; il dominio potrebbe non essere più attivo.
- `sky.com`: è Sky UK (stesso gruppo), non Sky Italia.
- `unicredit.eu`, `intesasanpaolo.it` e `posteitaliane.it`: probabilmente redirect ufficiali. Da confermare.
- `pec.it` (Aruba): ospita le caselle PEC dei clienti. Un'email da `qualcuno@pec.it` risulta «dominio email ufficiale di Aruba», ma il mittente può essere chiunque abbia una PEC Aruba.
- La regola che rende ufficiale ogni dominio `.gov.xx` di qualunque paese (es. `.gov.cn`) è ampia, ma questi domini sono riservati agli enti pubblici dei rispettivi paesi.
- Domini veri **non** in lista e quindi visti come sosia o sconosciuti: `fineco.com`, `booking.it`, `apple.it`, `satispay.it`, `n26.it`, `microsoftstore.it`, `unicreditbank.it`, `amazon-adsystem.com`. Non so se tutti appartengano ai marchi, quindi non li ho aggiunti. Se confermati, vanno inseriti.
- Corretti in questo debug: `enelx.com` e `notifichedigitali.it` (aggiunti); `paypal.me`, `wa.me`, `t.me` e `revolut.me` (ora «link verso un privato»).

## Funzionalità (per tutti)

WhoAreYou è un sito gratuito che ti aiuta a capire se un messaggio è una truffa.

- **Incolli e controlli.** Copi un SMS, un'email, un messaggio WhatsApp, un link, un IBAN o un numero di telefono e premi «Analizza». In un attimo vedi un punteggio da 0 a 100 e un verdetto: affidabile, nessun allarme, sospetto o pericoloso.
- **Riconosce le truffe più diffuse in Italia**:
  - finto pacco in giacenza e finta banca o Poste con conto bloccato;
  - «conto sicuro» e falso rimborso INPS o Agenzia delle Entrate;
  - false multe e pedaggi, finti abbonamenti e bollette;
  - «Ciao mamma, ho cambiato numero» e finto parente in difficoltà;
  - finti premi, richieste di codici OTP, pagamenti con ricariche o criptovalute;
  - falsi investimenti, finte offerte di lavoro «metti mi piace», ricatti a sfondo sessuale;
  - false convocazioni della polizia, truffe sentimentali e, da oggi, il finto acquirente su Subito e Vinted.
- **Ti spiega il perché.** Elenca i segnali trovati (fretta, minacce, richieste di codici, link strani) ed evidenzia nel tuo testo le parti sospette.
- **Controlla i link senza aprirli.** Riconosce i siti che imitano banche, Poste, corrieri e servizi famosi, gli indirizzi accorciati e le estensioni a rischio. Mostra i link in forma sicura, non cliccabile.
- **Controlla gli IBAN.** Verifica che il codice sia scritto correttamente e da che paese arriva, e ti avvisa se un messaggio «italiano» chiede un bonifico all'estero.
- **Controlla i numeri di telefono.** Paese, tipo di linea, numeri a pagamento (899, 199…), squilli dall'estero (wangiri) e ricerche sul web già pronte per vedere se altri li hanno segnalati.
- **Ti dice cosa fare.** Consigli pratici: non cliccare, chi chiamare, come verificare con i canali ufficiali, cosa fare se hai già pagato.
- **Rispetta la tua privacy.** Tutto avviene nel tuo telefono o computer: il testo non viene inviato a nessuno e non viene salvato. Il sito non usa cookie e non contatta altri siti. Restano sul tuo dispositivo solo i numeri che controlli e le tue note, e puoi cancellarli quando vuoi.
- **Funziona ovunque.** Su telefono e computer, in tema chiaro e scuro, ed è utilizzabile anche con lettori di schermo e tastiera.
