# Verifica dei domini ufficiali (lista BRANDS)

Data della verifica: **18 novembre 2026** · Branch `claude/verifica-domini` · File: `assets/js/scamcheck.js` (lista `BRANDS`).

## Riepilogo

| Esito | Domini |
|---|---|
| Confermati (già in lista) | 146 |
| Aggiunti | 24 |
| Rimossi | 1 |
| Dubbi (non aggiunti) | 7 |
| Candidati scartati (di terzi, sosia o inutili) | 9 |

Altre correzioni fatte con la verifica:

- **Email `@pec.it`**: il sito `www.pec.it` è di Aruba PEC S.p.A., ma le caselle `qualcuno@pec.it` sono dei clienti. Prima un'email da `@pec.it` risultava «dominio email ufficiale di Aruba»; ora è trattata come casella personale (come Gmail o Libero).
- **Dominio più specifico**: `gdf.gov.it` e `interno.gov.it` venivano attribuiti a «Pubblica Amministrazione» (per via di `gov.it`) invece che alle forze dell'ordine. Ora vince il dominio ufficiale più lungo che combacia.
- **Parole chiave nuove per i sosia**: `postevita`, `posteassicura` (Poste), `aexp` (American Express), `lefrecce` (Trenitalia).

## Metodo e fonti

Per ogni dominio sono state raccolte, il 18/11/2026, queste prove da fonti primarie (mai siti di terzi come unica prova):

1. **Certificato HTTPS dai log Certificate Transparency** (API Cert Spotter di SSLMate, certificato scaricato e letto con `openssl`): per i certificati OV/EV il campo *O* riporta la società intestataria (es. `O = POSTE ITALIANE S.p.A.`). I certificati DV non riportano la società: in quel caso contano le altre prove.
2. **Sito e redirect**: richiesta HTTPS a `https://dominio/` (e `www.`), seguendo i redirect fino alla pagina finale; dalla pagina si legge la **partita IVA** quando c'è.
3. **DNS** (DNS-over-HTTPS di Google): server NS, MX e SPF. Server DNS propri del marchio (es. `dns4.poste.it`, `bdns.enel.it`) o condivisi con il dominio principale sono un forte indizio.
4. **RDAP** per i domini non `.it` (bootstrap IANA → registro del TLD): data di registrazione, registrar (MarkMonitor, CSC, Com Laude, RegistrarSafe sono registrar per grandi aziende) e intestatario quando non oscurato.

Limiti:

- **WHOIS `.it` non consultabile da qui**: la porta 43 di `whois.nic.it` è chiusa da questo ambiente e il web-whois del Registro richiede un captcha. Per i `.it` valgono certificato, redirect, P.IVA in pagina e DNS. Se serve la prova dell'intestatario si può controllare a mano su https://www.nic.it/it/trova-il-tuo-it/web-whois.
- Il proxy di rete di questo ambiente ritermina il TLS, quindi il certificato è stato letto dai log CT e non dalla connessione diretta.
- Alcuni siti bloccano i client automatici (403, «Access Denied», pagine anti-bot): per questi conta il certificato dai log CT.

## Tabella

| Marchio | Dominio | Esito | Fonte (prove) | Data |
|---|---|---|---|---|
| Poste Italiane | `poste.it` | confermato | Cert. O=POSTE ITALIANE S.p.A.; sito attivo (200); P.IVA 01114601006 in pagina; NS dns4.poste.it | 18/11/2026 |
| Poste Italiane | `posteitaliane.it` | confermato | Cert. O=POSTE ITALIANE S.p.A.; sito attivo (200); P.IVA 01114601006 in pagina; NS dns6.poste.it | 18/11/2026 |
| Poste Italiane | `postepay.it` | confermato | Cert. O=POSTE ITALIANE S.p.A.; reindirizza a postepay.poste.it; P.IVA 01114601006 in pagina; NS dns5.poste.it | 18/11/2026 |
| Poste Italiane | `postemobile.it` | confermato | Cert. O=POSTE ITALIANE S.p.A.; sito attivo (200); NS dns6.poste.it | 18/11/2026 |
| Poste Italiane | `postevita.it` | aggiunto | Cert. O=POSTE ITALIANE S.p.A.; reindirizza a postevita.poste.it; P.IVA 01114601006 in pagina; NS dns4.poste.it | 18/11/2026 |
| Poste Italiane | `poste-assicura.it` | aggiunto | Cert. solo DV; reindirizza a posteassicura.poste.it; P.IVA 01114601006 in pagina; NS dns4.poste.it | 18/11/2026 |
| Intesa Sanpaolo | `intesasanpaolo.com` | confermato | Cert. O=INTESA SANPAOLO SPA; sito attivo (200); P.IVA 11991500015 in pagina; RDAP: Tucows Domains Inc., dal 2006; NS a7-64.akam.net | 18/11/2026 |
| Intesa Sanpaolo | `intesasanpaolo.it` | confermato | Cert. EV INTESA SANPAOLO (n. 00799960158); MX protetto.intesasanpaolo.com; SPF intesasanpaolo.com | 18/11/2026 |
| Intesa Sanpaolo | `isybank.com` | confermato | Cert. O=INTESA SANPAOLO SPA; sito attivo (200); P.IVA 11991500015 in pagina; RDAP: Tucows Domains Inc., dal 2021; NS a9-64.akam.net | 18/11/2026 |
| Intesa Sanpaolo | `isybank.it` | aggiunto | Cert. O=INTESA SANPAOLO SPA; SPF include intesasanpaolo.com | 18/11/2026 |
| UniCredit | `unicredit.it` | confermato | Cert. O=UniCredit S.p.A.; sito attivo (200); P.IVA 00348170101 in pagina; NS a11-66.akam.net | 18/11/2026 |
| UniCredit | `unicredit.eu` | confermato | Cert. O=UniCredit S.p.A.; reindirizza a www.unicreditgroup.eu; P.IVA 00348170101 in pagina; NS a22-64.akam.net | 18/11/2026 |
| UniCredit | `unicreditgroup.eu` | confermato | Cert. O=UniCredit S.p.A.; sito attivo (200); P.IVA 00348170101 in pagina; NS a22-64.akam.net | 18/11/2026 |
| BNL | `bnl.it` | confermato | Cert. O=BNP PARIBAS SA; sito attivo (200); NS ns5.bnpparibas.com | 18/11/2026 |
| Monte dei Paschi | `mps.it` | confermato | Cert. O=Banca Monte dei Paschi di Siena SPA; sito attivo (200); P.IVA 01483500524 in pagina; NS ns2.mps.it | 18/11/2026 |
| Monte dei Paschi | `gruppomps.it` | confermato | Cert. O=Banca Monte dei Paschi di Siena SPA; sito attivo (200); P.IVA 01483500524 in pagina; NS ns1.mps.it | 18/11/2026 |
| BPER Banca | `bper.it` | confermato | Cert. O=BPER BANCA S.P.A.; sito attivo (200); NS dns.widhost.net | 18/11/2026 |
| Fineco | `finecobank.com` | confermato | Cert. O=FINECOBANK S.P.A.; reindirizza a it.finecobank.com; P.IVA 12962340159 in pagina; RDAP: Register SPA, dal 2002; NS a1-118.akam.net | 18/11/2026 |
| Fineco | `fineco.it` | confermato | Cert. O=FINECOBANK S.P.A.; reindirizza a it.finecobank.com; P.IVA 12962340159 in pagina; NS a22-67.akam.net | 18/11/2026 |
| Nexi | `nexi.it` | confermato | Cert. O=NEXI PAYMENTS S.P.A.; sito attivo (200); P.IVA 10542790968 in pagina; NS a1-166.akam.net | 18/11/2026 |
| Nexi | `nexigroup.com` | confermato | Cert. O=NEXI PAYMENTS S.P.A.; sito attivo (200); P.IVA 10542790968 in pagina; RDAP: Register SPA, dal 2012; NS a28-65.akam.net | 18/11/2026 |
| Banca Mediolanum | `bancamediolanum.it` | confermato | Cert. O=Banca Mediolanum SpA; sito attivo (403); NS ns4a.idcservices.it | 18/11/2026 |
| Banca Mediolanum | `mediolanum.it` | aggiunto | Cert. O=Banca Mediolanum SpA; reindirizza a www.bancamediolanum.it; P.IVA 10540610960 in pagina; NS ns2a.idcservices.it | 18/11/2026 |
| Banco BPM | `bancobpm.it` | confermato | Cert. O=BANCO BPM SOCIETA' PER AZIONI; sito attivo (200); P.IVA 10537050964 in pagina; NS ns2.crebergallery.it | 18/11/2026 |
| Banco BPM | `webank.it` | confermato | Cert. O=Banco BPM S.p.A.; sito attivo (200); NS ns3.crebergallery.it | 18/11/2026 |
| Credem | `credem.it` | confermato | Cert. O=CREDITO EMILIANO S.P.A.; sito attivo (200); P.IVA 00766790356/02823390352 in pagina; NS a10-65.akam.net | 18/11/2026 |
| Crédit Agricole | `credit-agricole.it` | confermato | Cert. O=Credit Agricole Italia S.p.A.; sito attivo (200); NS a18-64.akam.net | 18/11/2026 |
| Crédit Agricole | `credit-agricole.com` | confermato | Cert. O=Credit Agricole SA; sito attivo (200); RDAP: Nameshield SAS, dal 1999; NS a1-241.akam.net | 18/11/2026 |
| ING | `ing.it` | confermato | Cert. O=ING Bank NV; sito attivo (200); NS a8-65.akam.net | 18/11/2026 |
| ING | `ing.com` | confermato | Cert. O=ING Groep N.V.; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 1999; NS a12-67.akam.net | 18/11/2026 |
| Hype | `hype.it` | confermato | Cert. O=Banca Sella - S.P.A.; sito attivo (200); P.IVA 02675650028/15376371009 in pagina; NS ns4-09.azure-dns.info | 18/11/2026 |
| N26 | `n26.com` | confermato | Cert. O=N26 Bank SE; sito attivo (200); RDAP: Amazon Registrar, Inc., dal 2005; NS ns-309.awsdns-38.com | 18/11/2026 |
| N26 | `n26.it` | aggiunto | Reindirizza a n26.com/it-it; cert. DV Amazon (stessa infrastruttura AWS di n26.com) | 18/11/2026 |
| Revolut | `revolut.com` | confermato | Cert. O=Revolut Bank UAB; sito attivo (403); RDAP: INWX GmbH, dal 2006; NS ns-cloud-d4.googledomains.com | 18/11/2026 |
| PayPal | `paypal.com` | confermato | Cert. O=PayPal, Inc.; sito attivo (200); RDAP: MarkMonitor Inc., dal 1999; NS pdns100.ultradns.com | 18/11/2026 |
| PayPal | `paypal.it` | confermato | Cert. O=PayPal, Inc.; reindirizza a www.paypal.com; NS pdns100.ultradns.com | 18/11/2026 |
| PayPal | `paypal.me` | confermato | Cert. O=PayPal, Inc. Ufficiale, ma i link paypal.me/nome portano a un privato: trattato come «link verso un privato» (PERSONAL_LINKS) | 18/11/2026 |
| PayPal | `paypalobjects.com` | confermato | Cert. O=PayPal, Inc.; sito attivo (403); RDAP: MarkMonitor Inc., dal 2005; NS pdns100.ultradns.net | 18/11/2026 |
| Satispay | `satispay.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: Amazon Registrar, Inc., dal 2012; NS ns-2025.awsdns-61.co.uk | 18/11/2026 |
| American Express | `americanexpress.com` | confermato | Cert. O=American Express Company; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 1995; NS a13-65.akam.net | 18/11/2026 |
| American Express | `americanexpress.it` | confermato | Cert. O=American Express Company; reindirizza a www.americanexpress.com; NS a8-64.akam.net | 18/11/2026 |
| American Express | `aexp.com` | aggiunto | Cert. EV O=American Express (n. 188055, lo stesso di americanexpress.it) sui sottodomini; RDAP: CSC Corporate Domains, dal 1995; NS Akamai come americanexpress.com; MX Proofpoint | 18/11/2026 |
| INPS | `inps.it` | confermato | Cert. O=ISTITUTO NAZIONALE DELLA PREVIDENZA SOCIALE; sito attivo (200); NS dns1.fweds-spc.it | 18/11/2026 |
| Agenzia delle Entrate | `agenziaentrate.gov.it` | confermato | Cert. O=SOGEI; sito attivo (200); NS ammi7.finanze.it | 18/11/2026 |
| Agenzia delle Entrate | `agenziaentrateriscossione.gov.it` | confermato | Cert. O=SOGEI; sito attivo (200); NS ammi2.finanze.it | 18/11/2026 |
| Agenzia delle Entrate | `agenziaentrate.it` | confermato | Cert. O=SOGEI; reindirizza a www.agenziaentrate.gov.it; NS ammi4.finanze.it | 18/11/2026 |
| PagoPA | `pagopa.gov.it` | confermato | Cert. solo DV; sito attivo (200); P.IVA 15376371009 in pagina; NS ns4-09.azure-dns.info | 18/11/2026 |
| PagoPA | `pagopa.it` | confermato | Cert. solo DV; sito attivo (200); NS ns3-04.azure-dns.org | 18/11/2026 |
| PagoPA | `notifichedigitali.it` | confermato | Cert. solo DV; sito attivo (200); P.IVA 15376371009 in pagina; NS ns-1334.awsdns-38.org | 18/11/2026 |
| PagoPA | `ioapp.it` | aggiunto | Cert. solo DV; sito attivo (200); P.IVA 15376371009 in pagina; NS ns3-07.azure-dns.org | 18/11/2026 |
| Pubblica Amministrazione | `gov.it` | confermato | Zona del Registro .it riservata alla Pubblica Amministrazione (NS del Registro: r.dns.it, m.dns.it) | 18/11/2026 |
| Pubblica Amministrazione | `italia.it` | confermato | Cert. O=Ministero del Turismo; sito attivo (200); NS ammi4.finanze.it | 18/11/2026 |
| Pubblica Amministrazione | `europa.eu` | confermato | Cert. O=European Commission; reindirizza a european-union.europa.eu; NS ns1bru.europa.eu | 18/11/2026 |
| Telepass | `telepass.com` | confermato | Cert. O=TELEPASS SPA; sito attivo (200); RDAP: Register SPA, dal 2000; NS ns-cloud-d2.googledomains.com | 18/11/2026 |
| Telepass | `telepass.it` | confermato | Cert. O=Telepass S.p.A.; reindirizza a www.telepass.com; NS ns-cloud-a2.googledomains.com | 18/11/2026 |
| Autostrade per l'Italia | `autostrade.it` | confermato | P.IVA 07516911000 (Autostrade per l'Italia) in pagina; NS propri ns1/ns2.autostrade.it; cert. DV | 18/11/2026 |
| Autostrade per l'Italia | `movyon.com` | confermato | Cert. O=Autostrade per l'Italia Spa; NS autostrade.it. Società tecnologica del gruppo: non usato per i pedaggi, ma è del marchio | 18/11/2026 |
| Amazon | `amazon.it` | confermato | Cert. solo DV; sito attivo (200); NS ns2.amzndns.co.uk | 18/11/2026 |
| Amazon | `amazon.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: MarkMonitor Inc., dal 1994; NS ns-1447.awsdns-52.org | 18/11/2026 |
| Amazon | `amazon.de` | confermato | Cert. solo DV; sito attivo (200); NS ns-1343.awsdns-39.org | 18/11/2026 |
| Amazon | `amazon.fr` | confermato | Cert. solo DV; sito attivo (202); NS ns2.amzndns.co.uk | 18/11/2026 |
| Amazon | `amazon.es` | confermato | Cert. solo DV; sito attivo (200); NS ns2.amzndns.co.uk | 18/11/2026 |
| Amazon | `amazon.co.uk` | confermato | Cert. solo DV; sito attivo (200); RDAP: Amazon.com, Inc., dal 1994; NS ns-430.awsdns-53.com | 18/11/2026 |
| Amazon | `amazon.nl` | confermato | Cert. solo DV; sito attivo (202); RDAP intestatario: REDACTED FOR PRIVACY; NS ns-586.awsdns-09.net | 18/11/2026 |
| Amazon | `amazon.eu` | confermato | Cert. solo DV; reindirizza a www.aboutamazon.eu; NS ns-599.awsdns-10.net | 18/11/2026 |
| Amazon | `amzn.to` | confermato | Cert. solo DV; reindirizza a www.amazon.com; RDAP: MarkMonitor Inc., dal 2010; NS ns-1561.awsdns-03.co.uk | 18/11/2026 |
| Amazon | `amzn.eu` | confermato | Cert. solo DV; reindirizza a www.amazon.co.uk; NS ns-119.awsdns-14.com | 18/11/2026 |
| Amazon | `a.co` | aggiunto | Link breve Amazon: reindirizza a amazon.com; NS AWS; cert. CN www.amz.onl (Amazon) | 18/11/2026 |
| Amazon | `primevideo.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: MarkMonitor Inc., dal 2000; NS ns-1172.awsdns-18.org | 18/11/2026 |
| Amazon | `media-amazon.com` | confermato | Incluso nei certificati Amazon delle immagini (f.media-amazon.com); RDAP MarkMonitor; NS AWS | 18/11/2026 |
| Apple | `apple.com` | confermato | Cert. O=Apple Inc.; sito attivo (200); RDAP: Nom-iq Ltd. dba COM LAUDE, dal 1987; NS a.ns.apple.com | 18/11/2026 |
| Apple | `apple.it` | aggiunto | Cert. O=Apple Inc.; reindirizza a www.apple.com; NS b.ns.apple.com | 18/11/2026 |
| Apple | `apple.co` | aggiunto | Cert. O=Apple Inc.; reindirizza a www.apple.com; NS a.ns.apple.com | 18/11/2026 |
| Apple | `icloud.com` | confermato | Cert. O=Apple Inc.; sito attivo (200); RDAP: Nom-iq Ltd. dba COM LAUDE, dal 1999; NS d.ns.apple.com | 18/11/2026 |
| Apple | `itunes.com` | confermato | Cert. O=Apple Inc.; reindirizza a www.apple.com; RDAP: Nom-iq Ltd. dba COM LAUDE, dal 1998; NS a.ns.apple.com | 18/11/2026 |
| Microsoft | `microsoft.com` | confermato | Cert. O=Microsoft Corporation; sito attivo (200); RDAP: MarkMonitor Inc., dal 1991; NS ns2-39.azure-dns.net | 18/11/2026 |
| Microsoft | `live.com` | confermato | Cert. O=Microsoft Corporation; reindirizza a outlook.live.com; RDAP: CSC Corporate Domains, Inc., dal 1994; NS ns3-37.azure-dns.org | 18/11/2026 |
| Microsoft | `outlook.com` | confermato | Cert. O=Microsoft Corporation; sito attivo (417); RDAP: MarkMonitor Inc., dal 1994; NS ns4-05.azure-dns.info | 18/11/2026 |
| Microsoft | `office.com` | confermato | Cert. O=Microsoft Corporation; reindirizza a m365.cloud.microsoft; RDAP: MarkMonitor Inc., dal 1999; NS ns3-05.azure-dns.org | 18/11/2026 |
| Microsoft | `hotmail.com` | confermato | Cert. O=Microsoft Corporation; reindirizza a outlook.live.com; RDAP: MarkMonitor Inc., dal 1996; NS ns2-205.azure-dns.net | 18/11/2026 |
| Microsoft | `hotmail.it` | confermato | Cert. O=Microsoft Corporation; reindirizza a outlook.live.com; NS ns1-06.azure-dns.com | 18/11/2026 |
| Microsoft | `onedrive.com` | confermato | Cert. O=Microsoft Corporation; reindirizza a www.microsoft.com; RDAP: MarkMonitor Inc., dal 1998; NS ns2-36.azure-dns.net | 18/11/2026 |
| Microsoft | `microsoftonline.com` | confermato | RDAP: MarkMonitor, dal 2002; NS Azure DNS come microsoft.com (login.microsoftonline.com è il login Microsoft 365) | 18/11/2026 |
| Microsoft | `office365.com` | confermato | Cert. O=Microsoft Corporation; sito attivo (403); RDAP: MarkMonitor Inc., dal 2005; NS ns3-07.azure-dns.org | 18/11/2026 |
| Microsoft | `microsoft365.com` | aggiunto | Cert. O=Microsoft Corporation; reindirizza a m365.cloud.microsoft; RDAP: MarkMonitor Inc., dal 2010; NS ns4-33.azure-dns.info | 18/11/2026 |
| Microsoft | `cloud.microsoft` | aggiunto | Dominio sul TLD .microsoft (riservato a Microsoft); cert. O=Microsoft Corporation; m365.cloud.microsoft è la nuova casa di Microsoft 365 | 18/11/2026 |
| Microsoft | `aka.ms` | aggiunto | Link breve Microsoft: cert. O=Microsoft Corporation; RDAP intestatario Microsoft Corporation (registrar CSC), dal 2011 | 18/11/2026 |
| Google | `google.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: MarkMonitor Inc., dal 1997; NS ns4.google.com | 18/11/2026 |
| Google | `google.it` | confermato | Cert. solo DV; reindirizza a www.google.com; NS ns4.google.com | 18/11/2026 |
| Google | `gmail.com` | confermato | Cert. solo DV; reindirizza a accounts.google.com; RDAP: MarkMonitor Inc., dal 1995; NS ns3.google.com | 18/11/2026 |
| Google | `youtube.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: MarkMonitor Inc., dal 2005; NS ns1.google.com | 18/11/2026 |
| Google | `youtu.be` | confermato | Cert. solo DV; reindirizza a www.youtube.com; NS ns3.google.com | 18/11/2026 |
| Google | `g.co` | confermato | Cert. solo DV; sito attivo (200); NS ns1.google.com | 18/11/2026 |
| Google | `goo.gle` | aggiunto | Cert. solo DV; reindirizza a www.google.com; RDAP: MarkMonitor Inc., dal 2019; NS ns2.googledomains.com | 18/11/2026 |
| Netflix | `netflix.com` | confermato | Cert. O=Netflix; sito attivo (200); RDAP: MarkMonitor Inc., dal 1997; NS ns-81.awsdns-10.com | 18/11/2026 |
| Disney+ | `disneyplus.com` | confermato | Cert. O=The Walt Disney Company; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 2000; NS sdns110.ultradns.com | 18/11/2026 |
| Disney+ | `disney.it` | confermato | Cert. O=The Walt Disney Company; sito attivo (200); NS ns2.disneyinternational.net | 18/11/2026 |
| Disney+ | `disney.com` | confermato | Cert. O=The Walt Disney Company; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 1990; NS ns1.twdcns.com | 18/11/2026 |
| Spotify | `spotify.com` | confermato | Cert. O=Spotify AB; reindirizza a open.spotify.com; RDAP: Abion AB, dal 2006; NS ns-cloud-a3.googledomains.com | 18/11/2026 |
| Spotify | `spoti.fi` | aggiunto | Cert. solo DV; reindirizza a open.spotify.com; RDAP intestatario: Spotify Finland Oy; NS ns-843.awsdns-41.net | 18/11/2026 |
| Spotify | `spotify.link` | aggiunto | Cert. solo DV; reindirizza a open.spotify.com; RDAP: Ports Group AB, dal 2018; NS ns-400.awsdns-50.com | 18/11/2026 |
| DAZN | `dazn.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: SafeNames Ltd., dal 2002; NS ns-476.awsdns-59.com | 18/11/2026 |
| Sky | `sky.it` | confermato | Cert. O=Sky UK Limited; sito attivo (200); P.IVA 04619241005 in pagina; NS ns2.sky.it | 18/11/2026 |
| Sky | `sky.com` | confermato | Cert. O=Sky UK Limited, la stessa società del certificato di sky.it: stesso gruppo Sky | 18/11/2026 |
| WhatsApp | `whatsapp.com` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (400); RDAP: RegistrarSafe, LLC, dal 2008; NS b.ns.whatsapp.net | 18/11/2026 |
| WhatsApp | `whatsapp.net` | confermato | Cert. O=Meta Platforms, Inc.; reindirizza a www.whatsapp.com; RDAP: RegistrarSafe, LLC, dal 2009; NS c.ns.whatsapp.net | 18/11/2026 |
| WhatsApp | `wa.me` | confermato | Cert. O=Meta Platforms, Inc. Ufficiale, ma wa.me/numero porta a un privato: trattato come «link verso un privato» | 18/11/2026 |
| Facebook/Instagram | `facebook.com` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (400); RDAP: RegistrarSafe, LLC, dal 1997; NS b.ns.facebook.com | 18/11/2026 |
| Facebook/Instagram | `fb.com` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (400); RDAP: RegistrarSafe, LLC, dal 1990; NS d.ns.facebook.com | 18/11/2026 |
| Facebook/Instagram | `fb.me` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (400); NS a.ns.facebook.com | 18/11/2026 |
| Facebook/Instagram | `instagram.com` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (200); RDAP: RegistrarSafe, LLC, dal 2004; NS a.ns.instagram.com | 18/11/2026 |
| Facebook/Instagram | `instagr.am` | aggiunto | Cert. O=Meta Platforms, Inc.; NS c.ns.instagram.com | 18/11/2026 |
| Facebook/Instagram | `meta.com` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (400); RDAP: RegistrarSafe, LLC, dal 1991; NS a.ns.facebook.com | 18/11/2026 |
| Facebook/Instagram | `messenger.com` | confermato | Cert. O=Meta Platforms, Inc.; sito attivo (200); RDAP: RegistrarSafe, LLC, dal 1998; NS b.ns.facebook.com | 18/11/2026 |
| Facebook/Instagram | `facebookmail.com` | aggiunto | Cert. O=Meta Platforms, Inc.; reindirizza a www.facebook.com; RDAP: RegistrarSafe, LLC, dal 2006; NS c.ns.facebook.com | 18/11/2026 |
| DHL | `dhl.com` | confermato | Cert. O=Deutsche Post AG; RDAP: Key-Systems GmbH, dal 1989; NS ns2.f5clouddns.com | 18/11/2026 |
| DHL | `dhl.it` | confermato | Incluso nel certificato O=Deutsche Post AG di www.dhl.com; NS F5 come dhl.com; SPF -all (nessuna posta) | 18/11/2026 |
| DHL | `dhl.de` | confermato | Cert. O=Deutsche Post AG; sito attivo (200); NS a12-66.akam.net | 18/11/2026 |
| BRT | `brt.it` | confermato | Cert. O=BRT S.P.A.; sito attivo (200); P.IVA 04507990150 in pagina; NS dns1.inrete.it | 18/11/2026 |
| BRT | `mybrt.it` | confermato | Cert. O=BRT S.P.A.; sito attivo (403); NS dns2.inrete.it | 18/11/2026 |
| GLS | `gls-italy.com` | confermato | Cert. O=GLS italy Spa; reindirizza a gls-group.com; RDAP: Register SPA, dal 2001; NS ns-1749.awsdns-26.co.uk | 18/11/2026 |
| GLS | `gls-group.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: Deutsche Telekom AG, dal 2010; NS secondary006.dtag.net | 18/11/2026 |
| GLS | `gls-group.eu` | confermato | Cert. solo DV; sito attivo (200); NS pns.dtag.de | 18/11/2026 |
| SDA | `sda.it` | confermato | Cert. O=POSTE ITALIANE S.p.A.; sito attivo (200); P.IVA 05714511002 in pagina; NS dr-dns.sda.it | 18/11/2026 |
| InPost | `inpost.it` | confermato | Cert. solo DV; sito attivo (403); NS dns-ns2-ext.easypack24.net | 18/11/2026 |
| InPost | `inpost.eu` | confermato | Cert. solo DV; sito attivo (200); NS dns-ns2-ext.easypack24.net | 18/11/2026 |
| InPost | `inpost.pl` | confermato | Cert. O=INPOST SP Z O O; sito attivo (403); RDAP intestatario: INPOST SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ; NS dns-ns4-ext.easypack24.net | 18/11/2026 |
| UPS | `ups.com` | confermato | Cert. O=United Parcel Service, Inc.; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 1992; NS cmtu.mt.ns.els-gms.att.net | 18/11/2026 |
| UPS | `ups.it` | aggiunto | Cert. O=United Parcel Service, Inc.; reindirizza a www.ups.com; NS nsa.ups.com | 18/11/2026 |
| FedEx | `fedex.com` | confermato | Cert. O=FedEx Corporation; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 1991; NS a5.dns.fedex.com | 18/11/2026 |
| FedEx | `fedex.it` | aggiunto | Cert. O=FedEx Corporation; reindirizza a www.fedex.com; NS a6.dns.fedex.com | 18/11/2026 |
| TNT | `tnt.it` | confermato | Pagina «FedEx Italia» (P.IVA 09399880153); TNT è ora FedEx. Cert. solo DV | 18/11/2026 |
| TNT | `tnt.com` | confermato | Cert. O=FedEx Corporation; sito attivo (200); RDAP: CSC Corporate Domains, Inc., dal 1996; NS a6.dns.fedex.com | 18/11/2026 |
| Enel | `enel.it` | confermato | Cert. O=Enel Global Services; sito attivo (200); P.IVA 06655971007 in pagina; NS bdns.enel.it | 18/11/2026 |
| Enel | `enel.com` | confermato | Cert. O=Enel Global Services; sito attivo (200); P.IVA 15844561009 in pagina; RDAP: Tucows Domains Inc., dal 1996; NS cdns.enel.it | 18/11/2026 |
| Enel | `enelx.com` | confermato | Cert. O=Enel Global Services; sito attivo (200); P.IVA 15844561009 in pagina; RDAP: Tucows Domains Inc., dal 2017; NS bdns.enel.it | 18/11/2026 |
| Eni Plenitude | `eniplenitude.com` | confermato | Cert. O=Eni S.P.A.; sito attivo (200); RDAP: Register SPA, dal 2021; NS a13-67.akam.net | 18/11/2026 |
| Eni Plenitude | `eni.com` | confermato | Cert. O=Eni S.p.A.; sito attivo (200); RDAP: Register SPA, dal 1994; NS ns1-160.akam.net | 18/11/2026 |
| TIM | `tim.it` | confermato | Cert. O=TELECOM ITALIA SPA; sito attivo (200); P.IVA 00488410010 in pagina; NS dns.tim.it | 18/11/2026 |
| TIM | `telecomitalia.it` | confermato | Cert. O=TELECOM ITALIA SPA; reindirizza a www.tim.it; P.IVA 00488410010 in pagina; NS ns.telecomitalia.it | 18/11/2026 |
| TIM | `gruppotim.it` | confermato | Cert. O=TELECOM ITALIA SPA; sito attivo (200); P.IVA 00488410010 in pagina; NS dns10.interbusiness.it | 18/11/2026 |
| TIM | `timvision.it` | confermato | Cert. O=TELECOM ITALIA SPA; sito attivo (403); NS dns9.interbusiness.it | 18/11/2026 |
| Vodafone | `vodafone.it` | confermato | Cert. O=Vodafone Group Services Limited; reindirizza a privati.vodafone.it; P.IVA 12878470157 in pagina; NS ns5.vodafone.com | 18/11/2026 |
| Vodafone | `vodafone.com` | confermato | Cert. O=Vodafone Group Services Limited; sito attivo (200); RDAP: Nom-iq Ltd. dba COM LAUDE, dal 1997; NS ns1.vodafone.com | 18/11/2026 |
| WindTre | `windtre.it` | confermato | Cert. O=WIND TRE SPA; NS propri dns.wind.it; il sito risponde con una pagina anti-bot (Radware) ai client automatici | 18/11/2026 |
| WindTre | `wind.it` | confermato | Cert. O=WIND TRE SPA; reindirizza a www.windtre.it; P.IVA 13378520152 in pagina; NS dns.wind.it | 18/11/2026 |
| WindTre | `tre.it` | confermato | Cert. O=WIND TRE SPA; reindirizza a www.windtre.it; P.IVA 13378520152 in pagina; NS dns.wind.it | 18/11/2026 |
| WindTre | `verymobile.it` | aggiunto | Cert. O=Wind Tre S.p.A.; sito attivo (200); NS dns.wind.it | 18/11/2026 |
| Iliad | `iliad.it` | confermato | Cert. O=Iliad Italia Spa; sito attivo (200); P.IVA 13970161009 in pagina; NS dns2.iliad.it | 18/11/2026 |
| Fastweb | `fastweb.it` | confermato | Cert. O=FastWeb S.p.A.; sito attivo (200); P.IVA 12878470157 in pagina; NS dns4.fastweb.it | 18/11/2026 |
| Trenitalia | `trenitalia.com` | confermato | Cert. O=FERROVIE DELLO STATO ITALIANE S.P.A.; sito attivo (200); RDAP: Key-Systems GmbH, dal 2000; NS a16-67.akam.net | 18/11/2026 |
| Trenitalia | `trenitalia.it` | aggiunto | Cert. O=FERROVIE DELLO STATO ITALIANE S.P.A.; reindirizza a www.trenitalia.com; NS a16-67.akam.net | 18/11/2026 |
| Trenitalia | `lefrecce.it` | aggiunto | Cert. O=FERROVIE DELLO STATO ITALIANE S.P.A.; sito attivo (200); NS a18-65.akam.net | 18/11/2026 |
| Italo | `italotreno.it` | confermato | Cert. O=Italo - Nuovo Trasporto Viaggiatori S.P.A.; reindirizza a www.italotreno.com; NS a24-64.akam.net | 18/11/2026 |
| Italo | `italotreno.com` | confermato | Cert. O=Italo - Nuovo Trasporto Viaggiatori S.P.A.; sito attivo (200); RDAP: Tucows Domains Inc., dal 2010; NS a24-64.akam.net | 18/11/2026 |
| eBay | `ebay.it` | confermato | Cert. O=eBay, Inc.; sito attivo (403); NS dns1.p06.nsone.net | 18/11/2026 |
| eBay | `ebay.com` | confermato | Cert. O=eBay, Inc.; sito attivo (403); RDAP: MarkMonitor Inc., dal 1995; NS ns03.ebaydns.com | 18/11/2026 |
| Subito | `subito.it` | confermato | Cert. O=Subito.it S.R.L.; sito attivo (403); NS a7-65.akam.net | 18/11/2026 |
| Vinted | `vinted.it` | confermato | Cert. solo DV; sito attivo (200); NS ns-1070.awsdns-05.org | 18/11/2026 |
| Vinted | `vinted.com` | confermato | Cert. solo DV; sito attivo (200); RDAP: INWX GmbH, dal 1999; NS ns-1550.awsdns-01.co.uk | 18/11/2026 |
| Booking.com | `booking.com` | confermato | Cert. O=Booking.com BV; sito attivo (202); RDAP: MarkMonitor Inc., dal 1998; NS ns-508.awsdns-63.com | 18/11/2026 |
| Aruba | `aruba.it` | confermato | Cert. O=Aruba S.p.A.; sito attivo (200); P.IVA 01573850516 in pagina; NS arudns1.aruba.it | 18/11/2026 |
| Aruba | `pec.it` | confermato | Cert. O=Aruba PEC S.p.A.; P.IVA 01879020517 in pagina. CORRETTO: il sito è di Aruba, ma un'email @pec.it è la casella di un cliente qualsiasi, ora trattata come casella personale | 18/11/2026 |
| Aruba | `arubapec.it` | aggiunto | Cert. O=Aruba PEC S.p.A.; reindirizza a www.pec.it; P.IVA 01573850516/01879020517 in pagina; NS arudns1.aruba.it | 18/11/2026 |
| Findomestic | `findomestic.it` | confermato | Cert. O=BNP PARIBAS SA; sito attivo (200); P.IVA 03562770481 in pagina; NS ns4.domivesta.com | 18/11/2026 |
| Polizia di Stato | `poliziadistato.it` | confermato | Sito attivo (www), «Ministero dell'Interno» in pagina e link ai servizi del Ministero (crimnet.dcpc.interno.gov.it, commissariatodips.it); cert. DV; NS Akamai | 18/11/2026 |
| Polizia di Stato | `commissariatodips.it` | confermato | Cert. O=Ministero dell'Interno; sito attivo (200); NS a9-65.akam.net | 18/11/2026 |
| Polizia di Stato | `carabinieri.it` | confermato | Cert. O=ARMA DEI CARABINIERI; sito attivo (200); NS dns2.fastweb.it | 18/11/2026 |
| Polizia di Stato | `gdf.gov.it` | confermato | Cert. O=Guardia di Finanza (credential.gdf.gov.it); dominio .gov.it riservato alla PA | 18/11/2026 |
| Polizia di Stato | `interno.gov.it` | confermato | Cert. solo DV; sito attivo (200); NS a1-78.akam.net | 18/11/2026 |
| Autostrade per l'Italia | `freetox.it` | rimosso | Nessun sito né posta (niente record A/MX, HTTPS non risponde); NS autostrade.it ma dominio inattivo: inutile come destinazione ufficiale | 18/11/2026 |
| UniCredit | `unicreditbank.it` | dubbio | Nessun sito, nessun certificato nei log CT; solo MX verso unicredit.it e NS Akamai come unicredit.it. Probabilmente di UniCredit ma non usato: non aggiunto | 18/11/2026 |
| Satispay | `satispay.it` | dubbio | HTTPS non risponde, nessun legame verificabile con satispay.com (WHOIS .it non consultabile da qui): non aggiunto | 18/11/2026 |
| Booking.com | `booking.it` | dubbio | Certificato non valido per booking.it, nessun sito: non aggiunto | 18/11/2026 |
| Microsoft | `microsoftstore.it` | dubbio | HTTPS non risponde, IP non Microsoft: non aggiunto | 18/11/2026 |
| Monte dei Paschi | `bancamps.it` | dubbio | NS mps.it ma nessun sito né posta: non aggiunto (resta la parola chiave «bancamps» per i sosia) | 18/11/2026 |
| Nexi | `nexipayments.it` | dubbio | Certificato non valido, nessun sito: non aggiunto | 18/11/2026 |
| Eni Plenitude | `plenitude.com` | dubbio | Registrar Nameshield, nessun sito raggiungibile, nessun legame con Eni verificato: non aggiunto | 18/11/2026 |
| Fineco | `fineco.com` | scartato | Registrato con joker.com, DNS spagnoli (sarenet.es), sito vuoto (404): NON è di Fineco | 18/11/2026 |
| BPER Banca | `bper.com` | scartato | Sito di un'azienda francese di acqua potabile («Boisson potable et renouvelable»): NON è di BPER | 18/11/2026 |
| American Express | `amex.it` | scartato | Sito di terzi con numero di cellulare, DNS Aruba: NON è di American Express | 18/11/2026 |
| BNL | `bnlpositivity.it` | scartato | Reindirizza a worldlineitalia.it (Worldline): non è un dominio BNL per i clienti | 18/11/2026 |
| GLS | `gls-info.com` | scartato | Registrato il 20/07/2026 con un registrar diverso da GLS, stato «client hold» (sospeso dal registrar): non è di GLS. Usato nei test come sosia | 18/11/2026 |
| SDA | `sda-it.com` | scartato | Non registrato (RDAP 404). Usato nei test come sosia | 18/11/2026 |
| Telepass | `telepassbiz.com` | scartato | Non registrato (RDAP 404) | 18/11/2026 |
| Amazon | `amazon-adsystem.com` | scartato | Di Amazon (MarkMonitor) ma serve solo per la pubblicità: non compare nei messaggi, non aggiunto | 18/11/2026 |
| INPS | `inps.gov.it` | scartato | Reindirizza a inps.it; già coperto dalla regola che rende ufficiali i domini .gov.it | 18/11/2026 |
