/*
 * Messaggi di prova per tests/scamcheck.test.js.
 *
 * Tutti i domini truffa sono inventati (sosia evidenti o TLD di comodo), i
 * numeri sono in serie fittizie (+39 3xx 000 xxxx, 06/02 0000 xxxx, UK
 * +44 7700 900xxx riservata alla fiction), gli IBAN sono quelli d'esempio
 * delle documentazioni bancarie. Nessun dato reale di persone.
 *
 * expect.verdictIn: verdetti accettati
 * expect.scams:     copioni che DEVONO essere riconosciuti
 * expect.notScams:  copioni che NON devono comparire
 */
'use strict';

var BAD = ['pericoloso', 'sospetto'];
var DANGER = ['pericoloso'];
var OK = ['neutro', 'affidabile'];

module.exports = [
  /* ------------------------------------------------------------------
   * TRUFFE: finto corriere
   * ------------------------------------------------------------------ */
  { id: 'corriere_poste_giacenza', text: 'Poste Italiane: il tuo pacco è in giacenza per indirizzo incompleto. Aggiorna i dati entro 24 ore: https://poste-consegne-it.top/track', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_brt_sdoganamento', text: 'BRT: la spedizione n. 0451238 è ferma in dogana. Per lo svincolo paga le spese di sdoganamento di 1,99€ qui: brt-svincolo.click/pay', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_dhl_defanged', text: 'DHL Express: consegna non riuscita, il tuo collo verrà restituito al mittente. Riprogramma la consegna: hxxps://dhl-redelivery[.]xyz/it', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_inpost_shortener', text: 'InPost: il tuo pacco non può essere consegnato al locker, indirizzo errato. Conferma l\'indirizzo: https://bit.ly/3xYz9Qp', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_gls_emoji', text: '📦 GLS 🚚 Gentile cliente, tentativo di consegna fallito. Costi di riconsegna 2,40 EUR. ➡️ gls-italia-consegne.com/r/8812', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_sda_telefono', text: 'SDA: il pacco è in giacenza per mancato pagamento delle spese di spedizione. Chiama subito il 351 000 4821 per sbloccare la consegna', expect: { verdictIn: BAD, scams: ['finto_corriere'] } },
  { id: 'corriere_amazon_typo', text: 'Pacco Bloccato!! il tuo ordine Amazon nn è stato consegnato x indirizzo incompleto, aggiorna qui www.amaz0n-consegna.shop', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_generico_fee', text: 'Il corriere ha tentato la consegna del tuo pacco ma nessuno era presente. Paga 1,50 € per la nuova consegna su https://ritiro-pacchi-online.top', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'corriere_poste_maiuscolo', text: 'POSTE: SPEDIZIONE SOSPESA. IL SUO PACCO È TRATTENUTO IN MAGAZZINO, CONFERMI L\'INDIRIZZO DI CONSEGNA: http://posteitaliane-delivery.info/c', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: finta banca / Poste / carte, conto sicuro
   * ------------------------------------------------------------------ */
  { id: 'banca_intesa_subdomain', text: 'Intesa Sanpaolo: abbiamo rilevato un accesso anomalo al tuo conto. Per evitare la sospensione verifica la tua identità: https://intesasanpaolo.sicurezza-clienti.com/login', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_bancoposta_bloccata', text: 'BancoPosta: la tua carta è stata bloccata per motivi di sicurezza. Riattiva subito su http://bancoposta-verifica.info', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_unicredit_vishing', text: 'UniCredit: tentativo di bonifico di 1.250,00 EUR verso IBAN non riconosciuto. Se non sei stato tu chiama subito l\'ufficio antifrode al 351 000 7788', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_nexi_operazione', text: 'NEXI: operazione sospetta di 489,00 € sulla tua carta. Se non la riconosci annulla entro 24h: nexi-annulla.top/a', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_posteid_scaduto', text: 'Gentile cliente, il suo PosteID è scaduto. Per non perdere l\'accesso ai servizi aggiorni il profilo entro oggi tramite il link: https://posteid-rinnovo.online', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_paypal_limitato', text: 'PayPal: il tuo account è stato limitato. Accedi per ripristinarlo: https://paypal.com-account-verify.cfd/it', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_defanged_intesa', text: 'Attenzione, nuova comunicazione dalla tua banca: accedi su hxxps://intesa-sanpaolo-sicurezza[.]com e verifica i tuoi dati', expect: { verdictIn: DANGER } },
  { id: 'banca_bnl_at_ip', text: 'Il tuo conto BNL è stato sospeso. Accedi: https://www.bnl.it@193.32.12.4/login', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'banca_homoglyph', text: 'Pоste Italiane: rilevato un nuovo dispositivo sul tuo conto BancoPosta. Se non sei tu blocca l\'accesso qui: https://xn--pste-55d.it/blocco', expect: { verdictIn: DANGER, scams: ['finta_banca'] } },
  { id: 'conto_sicuro_iban_lt', text: 'Buongiorno, sono l\'operatore dell\'ufficio antifrode della sua banca. Il suo conto è sotto attacco: per proteggere i risparmi deve trasferire il saldo su un conto sicuro. IBAN: LT12 1000 0111 0100 1000 intestato a Servizio Tutela Clienti. Faccia il bonifico istantaneo entro oggi.', expect: { verdictIn: DANGER, scams: ['conto_sicuro'] } },
  { id: 'conto_sicuro_carabinieri', text: 'Sono il maresciallo dei Carabinieri, la sua banca è coinvolta in una frode. Per sicurezza metta al sicuro i suoi soldi spostandoli sul conto protetto che le indichiamo: ES91 2100 0418 4502 0005 1332', expect: { verdictIn: DANGER, scams: ['conto_sicuro'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: INPS / Agenzia delle Entrate / SPID / multe / pedaggi
   * ------------------------------------------------------------------ */
  { id: 'inps_rimborso_iban', text: 'INPS: gentile utente, risulta a suo favore un rimborso di 312,50€. Per riceverlo aggiorna i dati del tuo IBAN entro 48 ore: https://inps-rimborsi.it-servizi.top', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'inps_naspi_pratica', text: 'INPS informa: la tua domanda NASpI è sospesa per documenti mancanti. Completa la pratica su inps-pratica-online.com per non perdere l\'indennità.', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'ade_rimborso_modulo', text: 'Agenzia delle Entrate - Avviso di rimborso fiscale. Dopo gli ultimi calcoli lei ha diritto a un rimborso di 268,40 €. Compili il modulo con i dati della carta: www.agenziaentrate-rimborso.net/modulo', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'ade_email_lookalike', text: 'Da: Agenzia delle Entrate <rimborsi@agenziaentrate-gov.com>\nOggetto: Rimborso IRPEF 2026\nGentile contribuente, ha diritto a un rimborso. Compili il modulo allegato con i dati della carta per ricevere l\'accredito.', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'spid_sospensione', text: 'SPID: la tua identità digitale verrà sospesa per adeguamento normativo. Conferma i tuoi dati entro 24 ore: spid-verifica.it-gov.info', expect: { verdictIn: DANGER } },
  { id: 'multa_pagopa', text: 'Avviso PagoPA: risulta una multa non pagata di 3,90 €. Regolarizza entro oggi per evitare la maggiorazione: https://pagopa-avvisi.click/pagamento', expect: { verdictIn: DANGER, scams: ['multa_pedaggio'] } },
  { id: 'telepass_pagamento', text: 'Telepass: il pagamento dei pedaggi di ottobre non è andato a buon fine. Aggiorna il metodo di pagamento per evitare la sospensione: telepass-it.support/area', expect: { verdictIn: DANGER, scams: ['multa_pedaggio'] } },
  { id: 'autostrade_insoluto', text: 'Autostrade per l\'Italia: hai un pedaggio insoluto di 6,80€. Paga ora per evitare sanzioni: https://autostrade-pedaggi.sbs', expect: { verdictIn: DANGER, scams: ['multa_pedaggio'] } },
  { id: 'multa_polizia_municipale', text: 'Polizia Municipale: ti è stata notificata una sanzione per violazione del codice della strada. Visualizza il verbale e paga entro 5 giorni con lo sconto: https://verbali-online-comune.top/v/8821', expect: { verdictIn: DANGER, scams: ['multa_pedaggio'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: abbonamenti, bollette, account
   * ------------------------------------------------------------------ */
  { id: 'netflix_sospeso', text: 'Netflix: il tuo abbonamento è stato sospeso perché non siamo riusciti ad addebitare il pagamento. Aggiorna i dati della carta: https://netflix-billing-it.com', expect: { verdictIn: DANGER, scams: ['finto_abbonamento'] } },
  { id: 'enel_rimborso', text: 'Enel Energia: hai diritto a un rimborso di 87,20€ per doppio pagamento della bolletta. Richiedilo qui: enel-rimborsi.online', expect: { verdictIn: DANGER, scams: ['finto_abbonamento'] } },
  { id: 'icloud_pieno', text: 'Apple: il tuo spazio iCloud è pieno, foto e video verranno eliminati. Aggiorna il metodo di pagamento entro 24 ore: https://icloud-storage.help/it', expect: { verdictIn: DANGER, scams: ['finto_abbonamento'] } },
  { id: 'windtre_sim', text: 'WINDTRE: la tua SIM verrà disattivata entro 24 ore per mancata verifica. Conferma i dati su windtre-verifica.top', expect: { verdictIn: DANGER } },
  { id: 'webmail_ip', text: 'Gentile utente, la sua casella di posta elettronica è piena e i nuovi messaggi verranno respinti. Clicca qui per aumentare lo spazio: http://185.244.31.7/webmail/login', expect: { verdictIn: DANGER } },

  /* ------------------------------------------------------------------
   * TRUFFE: "ciao mamma"
   * ------------------------------------------------------------------ */
  { id: 'ciao_mamma_whatsapp', text: 'Ciao mamma, il mio telefono è caduto e si è rotto. Questo è il mio nuovo numero, salvalo e scrivimi su WhatsApp appena puoi ❤️', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'ciao_papa_bonifico', text: 'Ciao pà sono io, ho cambiato numero perché il vecchio telefono non funziona più. Mi puoi fare un bonifico urgente di 980 € per una fattura? Te li ridò domani, ti mando l\'IBAN', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'mamy_perso_cellulare', text: 'Mamy ho perso il cellulare 😭 scrivimi a questo numero +39 333 000 6142 su whatsapp, è urgente devo pagare una cosa', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'ciao_sono_io_provvisorio', text: 'Ciao, sono io, ho il telefono in riparazione e uso un numero provvisorio, scrivimi qui. Mi serve un favore: devi pagare tu una bolletta oggi, ti restituisco tutto stasera', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'mamma_nuovo_numero_breve', text: 'Mamma questo è il mio nuovo numero, cancella quello vecchio. Mi scrivi qui?', expect: { verdictIn: BAD, scams: ['ciao_mamma'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: codici OTP
   * ------------------------------------------------------------------ */
  { id: 'otp_whatsapp_per_sbaglio', text: 'Ciao! Scusa, ti ho mandato per sbaglio un codice di 6 cifre via SMS, me lo puoi girare? Mi serve urgente 🙏', expect: { verdictIn: DANGER, scams: ['richiesta_codici'] } },
  { id: 'otp_finto_operatore', text: 'Sono Marco del servizio clienti della tua banca, per bloccare l\'operazione sospetta devo verificare la tua identità: comunicami il codice che ti è appena arrivato via SMS.', expect: { verdictIn: DANGER, scams: ['richiesta_codici'] } },
  { id: 'otp_vinted_acquirente', text: 'Ciao, sono interessata al tuo articolo su Vinted. Per confermare il pagamento ti arriverà un codice di verifica, dimmi il codice di verifica così sblocco la transazione', expect: { verdictIn: BAD, scams: ['richiesta_codici'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: premi, regali, sondaggi
   * ------------------------------------------------------------------ */
  { id: 'premio_buono_amazon', text: 'Congratulazioni! Sei stato selezionato per ricevere un buono Amazon da 500€. Rispondi al sondaggio e ritira il premio: https://amazon-premi.live/it', expect: { verdictIn: DANGER, scams: ['finto_premio'] } },
  { id: 'premio_iphone_spedizione', text: '🎁 Hai vinto un iPhone 15 Pro! Paga solo 1,95€ di spese di spedizione per riceverlo: iphone-omaggio.shop', expect: { verdictIn: DANGER, scams: ['finto_premio'] } },
  { id: 'premio_supermercato', text: 'Esselunga ti regala un buono da 250€ per il tuo compleanno! Compila il questionario: esselunga-buoni.xyz', expect: { verdictIn: BAD, scams: ['finto_premio'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: pagamenti anomali, investimenti, lavoro
   * ------------------------------------------------------------------ */
  { id: 'pagamento_ricarica_pratica', text: 'Per sbloccare la pratica deve effettuare una ricarica PostePay di 150 € e inviarci la foto della ricevuta entro oggi.', expect: { verdictIn: BAD, scams: ['pagamento_anomalo'] } },
  { id: 'gift_card_capo', text: 'Sono il tuo capo, sono in riunione e non posso parlare. Mi servono urgentemente 4 gift card Amazon da 100€, comprale e mandami i codici.', expect: { verdictIn: BAD, scams: ['pagamento_anomalo'] } },
  { id: 'trading_ia', text: 'Guadagna fino a 3.000€ al mese con il trading automatico basato sull\'intelligenza artificiale! Investi solo 250€ e il nostro esperto ti segue su WhatsApp. Rendimenti garantiti, zero rischi.', expect: { verdictIn: DANGER, scams: ['investimento_truffa'] } },
  { id: 'crypto_musk', text: 'Elon Musk lancia la nuova piattaforma di investimento in criptovalute: con soli 250 € puoi guadagnare 1.500 € a settimana. Iscriviti ora su quantum-ai-italia.top', expect: { verdictIn: DANGER, scams: ['investimento_truffa'] } },
  { id: 'lavoro_like_tiktok', text: 'Ciao! Sono Giulia, recruiter di un\'agenzia di marketing. Offriamo lavoro part-time da casa: basta mettere like ai video di TikTok e YouTube, guadagno 50-300€ al giorno. Contattami su WhatsApp +44 7700 900123', expect: { verdictIn: DANGER, scams: ['finto_lavoro'] } },
  { id: 'lavoro_recensioni', text: 'Offerta di lavoro flessibile: ti paghiamo 3 € per ogni recensione su Google Maps. Pagamento giornaliero. Scrivimi su Telegram per iniziare.', expect: { verdictIn: DANGER, scams: ['finto_lavoro'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: sextortion, finta polizia, romance
   * ------------------------------------------------------------------ */
  { id: 'sextortion_bitcoin', text: 'Ho preso il controllo del tuo dispositivo e ho registrato un video di te mentre guardavi siti per adulti. Se non mi invii 1500 euro in Bitcoin entro 48 ore, invierò il video a tutti i tuoi contatti. Wallet: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', expect: { verdictIn: DANGER, scams: ['sextortion'] } },
  { id: 'finta_polizia_convocazione', text: 'POLIZIA DI STATO - Dipartimento della Pubblica Sicurezza. Convocazione: a suo carico è stato aperto un procedimento penale per pedopornografia. Deve inviare le sue giustificazioni entro 72 ore all\'indirizzo polizia.cybercrime.it@gmail.com, altrimenti verrà emesso un mandato di arresto.', expect: { verdictIn: DANGER, scams: ['finta_polizia'] } },
  { id: 'romance_militare', text: 'Amore mio, non vedo l\'ora di incontrarti. Sono ancora in missione in Siria ma il mio pacco con i regali è bloccato in dogana: mi servono 2.300 € per le tasse doganali, puoi fare un bonifico? Ti amo', expect: { verdictIn: DANGER, scams: ['romance'] } },

  /* ------------------------------------------------------------------
   * TRUFFE: solo link / numeri / IBAN
   * ------------------------------------------------------------------ */
  { id: 'url_bare_lookalike', text: 'poste-verifica.com/x', expect: { verdictIn: DANGER } },
  { id: 'url_shortener_solo', text: 'https://bit.ly/3Qw8ZtA', expect: { verdictIn: BAD } },
  { id: 'url_punycode_paypal', text: 'https://xn--pypal-4ve.com/signin', expect: { verdictIn: DANGER } },
  { id: 'url_typo_unicredit', text: 'www.unicredlt.it/accesso', expect: { verdictIn: DANGER } },
  { id: 'iban_checksum_errato', text: 'IT60 X054 2811 1010 0000 0123 457', expect: { verdictIn: BAD } },
  { id: 'numero_premium_richiama', text: 'Hai una chiamata persa, richiama urgentemente il numero 899 000 123 per comunicazioni importanti', expect: { verdictIn: BAD } },

  /* ------------------------------------------------------------------
   * MESSAGGI LEGITTIMI: non devono risultare sospetti né pericolosi
   * ------------------------------------------------------------------ */
  { id: 'ok_otp_bonifico', text: 'Il codice OTP per confermare il bonifico di 120,00 EUR è 482913. Non comunicarlo a nessuno, nemmeno a operatori della banca.', expect: { verdictIn: OK, notScams: ['richiesta_codici', 'finta_banca'] } },
  { id: 'ok_otp_posteid', text: 'PosteID: il codice di conferma è 739104. Valido 5 minuti. Poste Italiane non ti chiederà mai questo codice.', expect: { verdictIn: OK, notScams: ['richiesta_codici'] } },
  { id: 'ok_codice_whatsapp', text: 'Il tuo codice WhatsApp: 381-552. Non condividerlo con nessuno.', expect: { verdictIn: OK, notScams: ['richiesta_codici'] } },
  { id: 'ok_otp_unicredit_app', text: 'UniCredit: per accedere all\'app inserisci il codice 552901. Se non hai richiesto tu l\'accesso, ignora questo messaggio.', expect: { verdictIn: OK, notScams: ['finta_banca', 'richiesta_codici'] } },
  { id: 'ok_amazon_consegna', text: 'Amazon: il tuo pacco con "Cuffie Bluetooth" sarà consegnato oggi entro le 21. Traccia la spedizione: https://www.amazon.it/progress-tracker/package?orderId=402-1234567-1234567', expect: { verdictIn: OK, notScams: ['finto_corriere'] } },
  { id: 'ok_brt_consegna', text: 'BRT: la spedizione 068123456789 sarà consegnata domani tra le 9:00 e le 13:00. Per modificare la consegna vai su https://www.mybrt.it', expect: { verdictIn: OK, notScams: ['finto_corriere'] } },
  { id: 'ok_poste_giacenza_vera', text: 'Poste Italiane: il tuo pacco è in giacenza presso l\'Ufficio Postale di Via Roma 12. Puoi ritirarlo entro 10 giorni lavorativi con un documento d\'identità. Info su poste.it', expect: { verdictIn: OK, notScams: ['finto_corriere'] } },
  { id: 'ok_gls_consegnato', text: 'GLS: il tuo pacco è stato consegnato e ritirato da MARIO alle 11:42. Grazie per aver scelto GLS.', expect: { verdictIn: OK } },
  { id: 'ok_visita_medica', text: 'Promemoria: visita dermatologica il 18/11/2026 alle 10:30 presso Poliambulatorio San Luca, via Verdi 3. Per disdire chiama lo 02 0000 4455.', expect: { verdictIn: OK } },
  { id: 'ok_dentista', text: 'Studio dentistico Rossi: le ricordiamo l\'appuntamento di domani alle 15:00. Risponda SI per confermare o chiami lo 06 0000 1188 per spostarlo.', expect: { verdictIn: OK } },
  { id: 'ok_mamma_pasta', text: 'Mamma arrivo alle 8, metti su la pasta 🍝', expect: { verdictIn: OK, notScams: ['ciao_mamma'] } },
  { id: 'ok_papa_pane', text: 'Papà ricordati di prendere il pane e il latte quando torni, grazie ❤️', expect: { verdictIn: OK, notScams: ['ciao_mamma'] } },
  { id: 'ok_amici_bar', text: 'Ci vediamo stasera alle 21 al solito bar? Porta anche Luca 😄', expect: { verdictIn: OK } },
  { id: 'ok_netflix_novita', text: 'Questo mese su Netflix arrivano nuove serie e film. Scopri tutte le novità su https://www.netflix.com/it/', expect: { verdictIn: OK } },
  { id: 'ok_bolletta_enel', text: 'Enel Energia: la bolletta di ottobre di 85,40 € scade il 20/11/2026. Puoi pagarla con domiciliazione o dall\'app Enel Energia. Dettagli su enel.it', expect: { verdictIn: OK, notScams: ['finto_abbonamento'] } },
  { id: 'ok_fattura_tim', text: 'TIM: la fattura di novembre è disponibile nell\'area MyTIM. Importo 29,90 €, addebito su conto corrente il 05/12.', expect: { verdictIn: OK } },
  { id: 'ok_avviso_carta_numero_verde', text: 'Intesa Sanpaolo: pagamento di 45,00 EUR con carta *1234 presso SUPERMERCATO. Se non riconosci l\'operazione chiama il numero verde 800 000 111.', expect: { verdictIn: OK, notScams: ['finta_banca'] } },
  { id: 'ok_inps_cedolino', text: 'INPS: è disponibile il cedolino della pensione di dicembre. Puoi consultarlo accedendo con SPID su www.inps.it o dall\'app INPS Mobile.', expect: { verdictIn: OK, notScams: ['inps_ade'] } },
  { id: 'ok_ade_precompilata', text: 'Agenzia delle Entrate: la dichiarazione precompilata 2026 è disponibile. Accedi con SPID, CIE o CNS su https://infoprecompilata.agenziaentrate.gov.it', expect: { verdictIn: OK, notScams: ['inps_ade'] } },
  { id: 'ok_telepass_fattura', text: 'Telepass: è disponibile la fattura di ottobre nella tua area riservata su telepass.com.', expect: { verdictIn: OK, notScams: ['multa_pedaggio'] } },
  { id: 'ok_farmacia', text: 'Farmacia Centrale: il farmaco che hai prenotato è disponibile. Puoi ritirarlo da domani dalle 9 alle 19.', expect: { verdictIn: OK } },
  { id: 'ok_condominio_acqua', text: 'Gentili condomini, giovedì 20 dalle 8 alle 12 verrà sospesa l\'erogazione dell\'acqua per lavori. L\'amministratore.', expect: { verdictIn: OK } },
  { id: 'ok_scuola_sciopero', text: 'Si comunica che venerdì 21 novembre la scuola resterà chiusa per sciopero. La Dirigente.', expect: { verdictIn: OK } },
  { id: 'ok_ordine_amazon', text: 'Grazie per il tuo ordine su Amazon.it! Ordine n. 402-7654321-7654321, totale 34,99 €. Consegna prevista: lunedì 17 novembre.', expect: { verdictIn: OK } },
  { id: 'ok_bonifico_ricevuto', text: 'Hai ricevuto un bonifico di 250,00 € da GIULIA BIANCHI con causale "regalo compleanno". BancoPosta', expect: { verdictIn: OK } },
  { id: 'ok_ricarica_effettuata', text: 'Ricarica PostePay di 50,00 € effettuata con successo. Saldo disponibile: 132,40 €.', expect: { verdictIn: OK, notScams: ['pagamento_anomalo'] } },
  { id: 'ok_colloquio_lavoro', text: 'Gentile candidato, la invitiamo a un colloquio per la posizione di magazziniere lunedì 24 alle 10:00 presso la nostra sede in via Milano 5. Cordiali saluti, Ufficio Risorse Umane', expect: { verdictIn: OK, notScams: ['finto_lavoro'] } },
  { id: 'ok_bonifico_cena', text: 'Ti ho fatto il bonifico per la cena di sabato, sono 35 €. Fammi sapere se ti arriva!', expect: { verdictIn: OK } },
  { id: 'ok_articolo_ilpost', text: 'Hai visto questo articolo? https://www.ilpost.it/2026/11/10/truffe-sms-poste/', expect: { verdictIn: OK } },
  { id: 'ok_ikea_black_friday', text: 'Black Friday IKEA: fino al 30% di sconto su divani e cucine fino a domenica. Scopri le offerte su https://www.ikea.com/it/it/', expect: { verdictIn: OK } },
  { id: 'ok_auguri_nonna', text: 'Auguri nonna! 🎂 Ti vogliamo bene, ci vediamo domenica a pranzo', expect: { verdictIn: OK } },
  { id: 'ok_vinted_venduto', text: 'Vinted: il tuo articolo è stato venduto! Spediscilo entro 5 giorni usando l\'etichetta prepagata che trovi nell\'app.', expect: { verdictIn: OK } },
  { id: 'ok_comune_carta_identita', text: 'Comune di Bologna: la sua prenotazione per il rinnovo della carta d\'identità è confermata per il 25/11/2026 alle 09:15.', expect: { verdictIn: OK } },
  { id: 'ok_gift_card_regalo', text: 'Ho comprato io le gift card per il regalo di Marta, poi facciamo a metà 😉', expect: { verdictIn: OK } },
  { id: 'ok_partita_calcetto', text: 'Ragazzi domani partita alle 18 al campo, chi porta il pallone? ⚽', expect: { verdictIn: OK } },
  { id: 'ok_hai_vinto_scommessa', text: 'Hai vinto tu la scommessa, stasera la pizza la offro io 🍕', expect: { verdictIn: OK, notScams: ['finto_premio'] } },
  { id: 'ok_url_poste_ufficiale', text: 'https://www.poste.it/cerca/index.html', expect: { verdictIn: ['affidabile', 'neutro'] } },
  { id: 'ok_iban_valido', text: 'IT60 X054 2811 1010 0000 0123 456', expect: { verdictIn: OK } },
  /* ------------------------------------------------------------------
   * MESSAGGI AGGIUNTIVI scritti dopo la prima taratura (verifica che le
   * regole generalizzino, non correzioni ad hoc)
   * ------------------------------------------------------------------ */
  { id: 'extra_bper_dispositivo', text: 'Gentile cliente BPER, la informiamo che il suo dispositivo non è più associato. Proceda alla riassociazione: bper-app-sicura.com', expect: { verdictIn: BAD } },
  { id: 'extra_poste_smistamento', text: '[Poste] Pacco fermo al centro di smistamento. Indirizzo non valido. Conferma ora: https://pst-it.cc/d/9921', expect: { verdictIn: BAD, scams: ['finto_corriere'] } },
  { id: 'extra_papa_cell_rotto', text: 'Ciao è il tuo papà, ho il cell rotto questo è il numero nuovo. Mi serve che mi paghi una fattura urgente, ti giro l iban', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'extra_zia_numero', text: 'Ciao zia, sono Marco, ho cambiato numero. Puoi aiutarmi? Mi servono 600 euro per una cosa urgente, te li rido sabato', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'extra_mamma_abbreviato', text: 'ciao mamma sn io ho rotto il tel scrivimi su wa a qst numero 3330007788', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'extra_mamma_telefono_amico', text: 'Mamma ciao, mi si è rotto lo schermo, scrivo dal telefono di un amico. Puoi farmi un bonifico istantaneo? Ti mando i dati', expect: { verdictIn: DANGER, scams: ['ciao_mamma'] } },
  { id: 'extra_ade_bitly', text: 'Agenzia Entrate: Il suo rimborso IRPEF di 489,90 euro è pronto. Inserisca i dati su https://bit.ly/rimb-ade', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'extra_homebanking_operatore', text: 'Gent.mo utente, rilevato accesso non autorizzato al suo Home Banking. Per info contatti il nostro operatore al 3510004412', expect: { verdictIn: BAD, scams: ['finta_banca'] } },
  { id: 'extra_bnl_landline', text: 'Gentile cliente BNL, la sua carta è stata utilizzata per un acquisto di 899€ su Amazon. Se non riconosce l\'operazione chiami subito il 0200009988', expect: { verdictIn: BAD, scams: ['finta_banca'] } },
  { id: 'extra_poste_operatore_codice', text: 'Salve, sono dell\'ufficio sicurezza di Poste. Stiamo bloccando un bonifico fraudolento sul suo conto, mi conferma il codice che le arriva adesso?', expect: { verdictIn: DANGER, scams: ['richiesta_codici'] } },
  { id: 'extra_pin_formale', text: 'Gentile cliente, per completare la procedura di sicurezza ci comunichi il PIN della sua carta e il codice ricevuto via SMS.', expect: { verdictIn: DANGER, scams: ['richiesta_codici'] } },
  { id: 'extra_otp_abbreviato', text: 'Ti è arrivato un sms con un codice? te l ho mandato x sbaglio, me lo mandi pls', expect: { verdictIn: DANGER, scams: ['richiesta_codici'] } },
  { id: 'extra_gdf_conto_sicurezza', text: 'Salve, sono un funzionario della Guardia di Finanza. Il suo conto è stato usato per riciclaggio, per tutelarla dobbiamo spostare i fondi su un conto di sicurezza. Mi richiami al 3330009911', expect: { verdictIn: DANGER, scams: ['conto_sicuro'] } },
  { id: 'extra_conto_protetto_operatore', text: 'Gentile cliente, il suo conto è stato oggetto di tentativi di frode. Un nostro operatore la contatterà per guidarla nello spostamento dei fondi su un conto protetto.', expect: { verdictIn: BAD, scams: ['conto_sicuro'] } },
  { id: 'extra_nipote_incidente', text: 'Sono il nipote della signora, la nonna ha avuto un incidente e servono 3000 euro urgenti per l\'avvocato, mandiamo un corriere a ritirarli a casa', expect: { verdictIn: DANGER, scams: ['finto_incidente'] } },
  { id: 'extra_lavoro_instagram', text: 'Ciao! Ho visto il tuo profilo, cerchiamo persone per un lavoro online semplice: segui account Instagram e guadagna 15€ per ogni compito. Interessato?', expect: { verdictIn: BAD, scams: ['finto_lavoro'] } },
  { id: 'extra_lavoro_settimana', text: 'Ciao, sono Sara di un\'agenzia per il lavoro. Abbiamo un lavoro part time da casa per te, guadagni fino a 800€ a settimana lavorando 1 ora al giorno. Scrivimi su WhatsApp per i dettagli', expect: { verdictIn: BAD, scams: ['finto_lavoro'] } },
  { id: 'extra_lavoro_youtube_si', text: 'Salve! Sono Anna di un\'azienda di marketing. Ti offriamo 30€ per mettere like a 3 video di YouTube. Rispondi SI per iniziare', expect: { verdictIn: BAD, scams: ['finto_lavoro'] } },
  { id: 'extra_samsung_estratto', text: 'Hai vinto! Sei uno dei 10 clienti estratti per il nuovo Samsung Galaxy. Per riceverlo conferma i dati di spedizione: samsung-promo-it.top', expect: { verdictIn: DANGER, scams: ['finto_premio'] } },
  { id: 'extra_premio_893', text: 'Il tuo numero è stato selezionato per un premio di 1000€! Chiama ora il 893 000 445 per riscuoterlo', expect: { verdictIn: BAD } },
  { id: 'extra_amazon_sospeso', text: 'Il tuo account Amazon è stato sospeso per attività insolita. Verifica le tue informazioni di pagamento entro 24 ore o il tuo ordine verrà annullato: amazon-verifica-account.com', expect: { verdictIn: DANGER } },
  { id: 'extra_dazn_1euro', text: 'ATTENZIONE: il tuo abbonamento DAZN è scaduto. Rinnova ora al prezzo speciale di 1€: https://dazn-promo.click', expect: { verdictIn: DANGER, scams: ['finto_abbonamento'] } },
  { id: 'extra_netflix_chiuso', text: 'A causa di un mancato pagamento il tuo account Netflix verrà chiuso entro 48 ore. Aggiorna il pagamento: netflix-it-account.com', expect: { verdictIn: DANGER, scams: ['finto_abbonamento'] } },
  { id: 'extra_enel_distacco', text: 'Enel: la fornitura verrà sospesa domani per bolletta non pagata. Paga subito su enel-pagamenti.net per evitare il distacco', expect: { verdictIn: DANGER, scams: ['finto_abbonamento'] } },
  { id: 'extra_paysafe_polizia', text: 'Polizia Postale: il suo computer è stato bloccato per aver visitato siti pornografici. Paghi la multa di 100€ con PaySafeCard per sbloccarlo.', expect: { verdictIn: DANGER } },
  { id: 'extra_romance_yemen', text: 'Ciao bella, sei davvero speciale. Sono un medico in missione ONU in Yemen, appena torno in Italia ci sposiamo. Ho bisogno di 500 euro per il visto, mi fai una ricarica?', expect: { verdictIn: DANGER, scams: ['romance'] } },
  { id: 'extra_romance_facebook', text: 'Ciao, sono Sofia 😘 ho visto il tuo profilo su Facebook e mi piaci tanto. Vivo in Inghilterra ma voglio venire in Italia da te, amore mi aiuti a pagare il biglietto aereo? Ti mando l IBAN', expect: { verdictIn: BAD, scams: ['romance'] } },
  { id: 'extra_bitcoin_40', text: 'Opportunità unica: investi 250€ in Bitcoin e ottieni un rendimento del 40% al mese garantito! Contatta il nostro analista su Telegram.', expect: { verdictIn: DANGER, scams: ['investimento_truffa'] } },
  { id: 'extra_riscossione_fermo', text: 'Agenzia delle Entrate Riscossione: risulta una cartella esattoriale non pagata. Per evitare il fermo amministrativo regolarizza entro 48 ore su riscossione-pagamenti.it', expect: { verdictIn: DANGER } },
  { id: 'extra_inps_bonus_sub', text: '📢 INPS 📢 Bonus 600€ in arrivo! Verifica se sei tra gli aventi diritto: https://bonus-inps.it.verifica-diritti.click', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'extra_instagram_accesso', text: 'Abbiamo registrato un accesso al tuo account Instagram da un nuovo dispositivo a Mosca. Se non sei stato tu, proteggi l\'account: instagram-help-center.site', expect: { verdictIn: DANGER } },
  { id: 'extra_vocale_xyz', text: 'Hai un nuovo messaggio vocale. Ascoltalo qui: http://voicemail-it.xyz/v?id=8812', expect: { verdictIn: BAD } },
  { id: 'extra_ok_banca_avviso_truffe', text: 'Intesa Sanpaolo ti ricorda: non comunicare mai i tuoi codici. Diffida da SMS che ti chiedono di cliccare su un link per sbloccare il conto.', expect: { verdictIn: OK } },
  { id: 'extra_ok_inps_avviso', text: 'Attenzione: circolano false email a nome dell\'INPS che promettono rimborsi. L\'INPS non invia link via SMS. Info su www.inps.it', expect: { verdictIn: OK } },
  { id: 'extra_ok_fineco_dispositivo', text: 'Fineco: hai effettuato un accesso da un nuovo dispositivo. Se non sei stato tu, contatta il Customer Care dall\'app.', expect: { verdictIn: OK } },
  { id: 'extra_ok_bonifico_eseguito', text: 'Unicredit: bonifico di 1.200,00 EUR a favore di MARIO ROSSI eseguito. Se non riconosci l\'operazione contatta il numero verde 800 000 222.', expect: { verdictIn: OK } },
  { id: 'extra_ok_spotify_rinnovo', text: 'Il tuo abbonamento Spotify Premium si rinnoverà il 25/11 al costo di 10,99 €. Gestisci l\'abbonamento su spotify.com/account', expect: { verdictIn: OK } },
  { id: 'extra_ok_inpost_ritiro', text: 'Il tuo pacco InPost è pronto per il ritiro al Locker di Via Garibaldi. Codice di ritiro: 482193. Hai tempo 48 ore.', expect: { verdictIn: OK } },
  { id: 'extra_ok_numero_lavoro', text: 'Ciao, questo è il mio numero di lavoro, salvalo pure: ci sentiamo lunedì per il preventivo. Giorgio', expect: { verdictIn: OK } },
  { id: 'extra_ok_reso_amazon', text: 'Abbiamo ricevuto il tuo reso. Il rimborso di 29,90 € sarà accreditato entro 5 giorni sul metodo di pagamento originale. Amazon.it', expect: { verdictIn: OK } },
  { id: 'extra_ok_codice_cancello', text: 'Ciao, puoi passarmi il codice del cancello? Sono arrivato e non riesco ad entrare', expect: { verdictIn: OK } },
  { id: 'extra_ok_raccomandata', text: 'Poste Italiane: la tua raccomandata è in giacenza presso l\'ufficio postale di Corso Italia. Ritirala entro 30 giorni con l\'avviso.', expect: { verdictIn: OK } },
  { id: 'extra_ok_iban_regalo', text: 'Ciao Paolo, ti mando l\'IBAN per la quota del regalo: IT60 X054 2811 1010 0000 0123 456. Sono 20 euro a testa', expect: { verdictIn: OK } },
  { id: 'extra_ok_stipendio', text: 'Banca: accredito stipendio di 1.650,00 EUR sul conto ****4421. Saldo disponibile 2.310,12 EUR', expect: { verdictIn: OK } },
  { id: 'extra_ok_mamma_chiavi', text: 'Mamma ho perso le chiavi di casa, sei a casa tra mezz\'ora?', expect: { verdictIn: OK } },
  { id: 'extra_ok_telefono_scarico', text: 'Il mio telefono si è scaricato, ti chiamo dal fisso di casa tra 10 minuti', expect: { verdictIn: OK } },
  { id: 'extra_ok_tecnico_enel', text: 'Domani alle 10 arriva il tecnico Enel per il contatore, ci sei tu a casa?', expect: { verdictIn: OK } },
  { id: 'extra_ok_gruppo_whatsapp', text: 'Ciao! Ti mando il link del gruppo WhatsApp della classe: https://chat.whatsapp.com/AbCdEf123', expect: { verdictIn: OK } },
  { id: 'extra_ok_codice_fiscale', text: 'Ciao, mi mandi il codice fiscale di tuo figlio per l\'iscrizione in palestra?', expect: { verdictIn: OK } },
  { id: 'extra_ok_codice_prenotazione', text: 'Mi dici il codice della prenotazione? Così controllo l\'orario del volo', expect: { verdictIn: OK } },
  { id: 'extra_ok_multa_ztl_famiglia', text: 'Ricordati di pagare la multa della ZTL, scade lunedì, l\'avviso è sul tavolo', expect: { verdictIn: OK } },
  { id: 'extra_ok_cambiato_operatore', text: 'Ehi ho cambiato operatore, sono passata a Iliad, il numero è lo stesso', expect: { verdictIn: OK } },
  { id: 'extra_ok_pagopa_app_io', text: 'Avviso di pagamento PagoPA per la mensa scolastica disponibile nell\'app IO. Scadenza 30/11.', expect: { verdictIn: OK } },
  { id: 'extra_ok_nonna_ricoverata', text: 'La nonna è stata ricoverata ma sta bene, domani la dimettono. Ti chiamo stasera', expect: { verdictIn: OK } },
  { id: 'extra_ok_parcheggio', text: 'Paga tu il parcheggio con l\'app che io non ho credito, ti ridò i soldi dopo', expect: { verdictIn: OK } },
  { id: 'extra_ok_cassetto_fiscale', text: 'Hai ricevuto un nuovo documento nel tuo cassetto fiscale. Accedi con SPID su agenziaentrate.gov.it per consultarlo.', expect: { verdictIn: OK } },
  { id: 'extra_ok_dhl_transito', text: 'DHL: la tua spedizione 1234567890 è in transito e sarà consegnata domani. Traccia su dhl.com', expect: { verdictIn: OK } },
  { id: 'extra_dogana_generico', text: 'Gentile cliente, il suo pacco è stato trattenuto in dogana. Per lo sdoganamento è richiesto un pagamento di 1,99 €. Paghi tramite il link: https://sdoganamento-pacchi.com/it', expect: { verdictIn: DANGER, scams: ['finto_corriere'] } },
  { id: 'extra_inps_pensione_sospesa', text: 'Avviso INPS: aggiornamento obbligatorio della posizione contributiva. Il mancato aggiornamento comporterà la sospensione della pensione. Procedi qui: inps-aggiornamento.com', expect: { verdictIn: DANGER, scams: ['inps_ade'] } },
  { id: 'extra_nonna_incidente_avvocato', text: 'Ciao nonna sono io Luca, sono nei guai, ho fatto un incidente con la macchina e serve un avvocato subito, mi presti 2000 euro? Non dirlo a mamma', expect: { verdictIn: DANGER, scams: ['finto_incidente'] } },
  { id: 'extra_poste_codice_annullo', text: 'Codice di sicurezza richiesto: un operatore Poste ti chiamerà a breve, comunica il codice che riceverai via SMS per annullare il bonifico.', expect: { verdictIn: DANGER, scams: ['richiesta_codici'] } },
  { id: 'extra_telepass_rimborso', text: 'Hai un rimborso Telepass di 47,60 €. Inserisci la carta su cui ricevere l\'accredito: telepass-rimborsi.com', expect: { verdictIn: DANGER } },
  { id: 'extra_guadagno_casa', text: '💰 Guadagna 500€ al giorno da casa con il nostro sistema automatico! Nessuna esperienza richiesta, risultati garantiti. Scrivi INFO su WhatsApp', expect: { verdictIn: BAD } },
  { id: 'extra_vinted_carta', text: 'Vinted: il compratore ha pagato l\'articolo. Per ricevere i soldi conferma i dati della tua carta su vinted-pagamenti.store', expect: { verdictIn: DANGER } }
];
