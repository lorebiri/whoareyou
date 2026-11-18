/*!
 * WhoAreYou – motore di analisi dei numeri di telefono.
 *
 * Script classico, nessuna dipendenza, nessuna chiamata di rete.
 * Espone `window.WhoAreYou` nel browser e `module.exports` in Node.
 * API documentata in CONTRACT.md:
 *
 *   WhoAreYou.analyze(rawInput, { defaultCountry: "IT" }) -> Result
 *   WhoAreYou.version
 *
 * Tutta l'analisi è euristica e basata su dati pubblici del piano di
 * numerazione: non sa CHI è il chiamante, ma che TIPO di numero è e quali
 * segnali di rischio presenta.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WhoAreYou = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var VERSION = '1.0.0';
  var BASE_SCORE = 60;

  /* =====================================================================
   * 1. UTILITÀ
   * ===================================================================== */

  /** Converte un codice ISO 3166-1 alpha-2 nella bandiera emoji. */
  function flagOf(iso) {
    if (!iso || !/^[A-Z]{2}$/.test(iso)) return '🌐';
    return String.fromCodePoint(0x1F1E6 + iso.charCodeAt(0) - 65, 0x1F1E6 + iso.charCodeAt(1) - 65);
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function startsWithAny(s, list) {
    for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) === 0) return true;
    return false;
  }

  /** Raggruppa le cifre in blocchi leggibili (6 -> 3 3, 7 -> 3 4, 8 -> 4 4, 9 -> 3 3 3, 10 -> 3 3 4). */
  function groupDigits(d) {
    var n = d.length;
    if (n <= 5) return d;
    if (n === 6) return d.slice(0, 3) + ' ' + d.slice(3);
    if (n === 7) return d.slice(0, 3) + ' ' + d.slice(3);
    if (n === 8) return d.slice(0, 4) + ' ' + d.slice(4);
    if (n === 9) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
    if (n === 10) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
    // Oltre 10 cifre: blocchi da 3, l'ultimo da 4 se avanzerebbe una cifra sola.
    var out = [];
    var i = 0;
    while (n - i > 4) { out.push(d.slice(i, i + 3)); i += 3; }
    out.push(d.slice(i));
    return out.join(' ');
  }

  /* =====================================================================
   * 2. TABELLA DEI PREFISSI INTERNAZIONALI
   *    Formato: "prefisso|ISO|Nome italiano"  (prefisso = cifre dopo il +)
   *    La ricerca è per prefisso più lungo, quindi le voci NANP "1876"
   *    (Giamaica) prevalgono su "1" (Stati Uniti).
   * ===================================================================== */

  var COUNTRY_DATA = [
    // --- Zona 1: NANP (piano di numerazione nordamericano) ---
    '1|US|Stati Uniti',
    '1242|BS|Bahamas', '1246|BB|Barbados', '1264|AI|Anguilla', '1268|AG|Antigua e Barbuda',
    '1284|VG|Isole Vergini britanniche', '1340|VI|Isole Vergini americane', '1345|KY|Isole Cayman',
    '1441|BM|Bermuda', '1473|GD|Grenada', '1649|TC|Turks e Caicos', '1658|JM|Giamaica',
    '1664|MS|Montserrat', '1670|MP|Isole Marianne Settentrionali', '1671|GU|Guam',
    '1684|AS|Samoa Americane', '1721|SX|Sint Maarten', '1758|LC|Saint Lucia', '1767|DM|Dominica',
    '1784|VC|Saint Vincent e Grenadine', '1787|PR|Porto Rico', '1939|PR|Porto Rico',
    '1809|DO|Repubblica Dominicana', '1829|DO|Repubblica Dominicana', '1849|DO|Repubblica Dominicana',
    '1868|TT|Trinidad e Tobago', '1869|KN|Saint Kitts e Nevis', '1876|JM|Giamaica',
    // --- Zona 2: Africa e territori ---
    '20|EG|Egitto', '211|SS|Sud Sudan', '212|MA|Marocco', '213|DZ|Algeria', '216|TN|Tunisia',
    '218|LY|Libia', '220|GM|Gambia', '221|SN|Senegal', '222|MR|Mauritania', '223|ML|Mali',
    '224|GN|Guinea', '225|CI|Costa d\'Avorio', '226|BF|Burkina Faso', '227|NE|Niger', '228|TG|Togo',
    '229|BJ|Benin', '230|MU|Mauritius', '231|LR|Liberia', '232|SL|Sierra Leone', '233|GH|Ghana',
    '234|NG|Nigeria', '235|TD|Ciad', '236|CF|Repubblica Centrafricana', '237|CM|Camerun',
    '238|CV|Capo Verde', '239|ST|São Tomé e Príncipe', '240|GQ|Guinea Equatoriale', '241|GA|Gabon',
    '242|CG|Repubblica del Congo', '243|CD|Repubblica Democratica del Congo', '244|AO|Angola',
    '245|GW|Guinea-Bissau', '246|IO|Territorio britannico dell\'Oceano Indiano', '247|AC|Isola di Ascensione',
    '248|SC|Seychelles', '249|SD|Sudan', '250|RW|Ruanda', '251|ET|Etiopia', '252|SO|Somalia',
    '253|DJ|Gibuti', '254|KE|Kenya', '255|TZ|Tanzania', '256|UG|Uganda', '257|BI|Burundi',
    '258|MZ|Mozambico', '260|ZM|Zambia', '261|MG|Madagascar', '262|RE|Riunione',
    '262269|YT|Mayotte', '262639|YT|Mayotte', '263|ZW|Zimbabwe', '264|NA|Namibia', '265|MW|Malawi',
    '266|LS|Lesotho', '267|BW|Botswana', '268|SZ|Eswatini', '269|KM|Comore', '27|ZA|Sudafrica',
    '290|SH|Sant\'Elena', '291|ER|Eritrea', '297|AW|Aruba', '298|FO|Isole Fær Øer', '299|GL|Groenlandia',
    // --- Zone 3 e 4: Europa ---
    '30|GR|Grecia', '31|NL|Paesi Bassi', '32|BE|Belgio', '33|FR|Francia', '34|ES|Spagna',
    '350|GI|Gibilterra', '351|PT|Portogallo', '352|LU|Lussemburgo', '353|IE|Irlanda', '354|IS|Islanda',
    '355|AL|Albania', '356|MT|Malta', '357|CY|Cipro', '358|FI|Finlandia', '35818|AX|Isole Åland',
    '359|BG|Bulgaria', '36|HU|Ungheria', '370|LT|Lituania', '371|LV|Lettonia', '372|EE|Estonia',
    '373|MD|Moldavia', '374|AM|Armenia', '375|BY|Bielorussia', '376|AD|Andorra', '377|MC|Monaco',
    '378|SM|San Marino', '379|VA|Città del Vaticano', '380|UA|Ucraina', '381|RS|Serbia',
    '382|ME|Montenegro', '383|XK|Kosovo', '385|HR|Croazia', '386|SI|Slovenia',
    '387|BA|Bosnia ed Erzegovina', '389|MK|Macedonia del Nord', '39|IT|Italia', '40|RO|Romania',
    '41|CH|Svizzera', '420|CZ|Repubblica Ceca', '421|SK|Slovacchia', '423|LI|Liechtenstein',
    '43|AT|Austria', '44|GB|Regno Unito', '441481|GG|Guernsey', '441534|JE|Jersey',
    '441624|IM|Isola di Man', '45|DK|Danimarca', '46|SE|Svezia', '47|NO|Norvegia', '48|PL|Polonia',
    '49|DE|Germania',
    // --- Zona 5: America centrale e meridionale ---
    '500|FK|Isole Falkland', '501|BZ|Belize', '502|GT|Guatemala', '503|SV|El Salvador',
    '504|HN|Honduras', '505|NI|Nicaragua', '506|CR|Costa Rica', '507|PA|Panama',
    '508|PM|Saint-Pierre e Miquelon', '509|HT|Haiti', '51|PE|Perù', '52|MX|Messico', '53|CU|Cuba',
    '54|AR|Argentina', '55|BR|Brasile', '56|CL|Cile', '57|CO|Colombia', '58|VE|Venezuela',
    '590|GP|Guadalupa', '591|BO|Bolivia', '592|GY|Guyana', '593|EC|Ecuador', '594|GF|Guyana francese',
    '595|PY|Paraguay', '596|MQ|Martinica', '597|SR|Suriname', '598|UY|Uruguay', '599|CW|Curaçao',
    // --- Zona 6: Sud-est asiatico e Oceania ---
    '60|MY|Malesia', '61|AU|Australia', '62|ID|Indonesia', '63|PH|Filippine', '64|NZ|Nuova Zelanda',
    '65|SG|Singapore', '66|TH|Thailandia', '670|TL|Timor Est', '672|NF|Isola Norfolk', '673|BN|Brunei',
    '674|NR|Nauru', '675|PG|Papua Nuova Guinea', '676|TO|Tonga', '677|SB|Isole Salomone',
    '678|VU|Vanuatu', '679|FJ|Figi', '680|PW|Palau', '681|WF|Wallis e Futuna', '682|CK|Isole Cook',
    '683|NU|Niue', '685|WS|Samoa', '686|KI|Kiribati', '687|NC|Nuova Caledonia', '688|TV|Tuvalu',
    '689|PF|Polinesia francese', '690|TK|Tokelau', '691|FM|Micronesia', '692|MH|Isole Marshall',
    // --- Zona 7: Russia e Kazakistan ---
    '7|RU|Russia', '76|KZ|Kazakistan', '77|KZ|Kazakistan',
    // --- Zona 8: Asia orientale ---
    '81|JP|Giappone', '82|KR|Corea del Sud', '84|VN|Vietnam', '850|KP|Corea del Nord',
    '852|HK|Hong Kong', '853|MO|Macao', '855|KH|Cambogia', '856|LA|Laos', '86|CN|Cina',
    '880|BD|Bangladesh', '886|TW|Taiwan',
    // --- Zona 9: Asia occidentale e meridionale ---
    '90|TR|Turchia', '91|IN|India', '92|PK|Pakistan', '93|AF|Afghanistan', '94|LK|Sri Lanka',
    '95|MM|Myanmar', '960|MV|Maldive', '961|LB|Libano', '962|JO|Giordania', '963|SY|Siria',
    '964|IQ|Iraq', '965|KW|Kuwait', '966|SA|Arabia Saudita', '967|YE|Yemen', '968|OM|Oman',
    '970|PS|Palestina', '971|AE|Emirati Arabi Uniti', '972|IL|Israele', '973|BH|Bahrein',
    '974|QA|Qatar', '975|BT|Bhutan', '976|MN|Mongolia', '977|NP|Nepal', '98|IR|Iran',
    '992|TJ|Tagikistan', '993|TM|Turkmenistan', '994|AZ|Azerbaigian', '995|GE|Georgia',
    '996|KG|Kirghizistan', '998|UZ|Uzbekistan'
  ];

  /** Prefissi canadesi (area code NANP) — tutti gli altri +1 non elencati sono considerati USA. */
  var CANADA_AREA_CODES = ('204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 403 416 418 ' +
    '428 431 437 438 450 460 468 474 506 514 519 548 579 581 584 587 600 604 613 639 647 672 683 705 ' +
    '709 742 753 778 780 782 807 819 825 867 873 879 902 905').split(' ');

  /**
   * Codici non geografici assegnati dall'ITU a servizi globali.
   * kind: tipo di rischio associato (vedi sezione punteggio).
   */
  var GLOBAL_CODES = {
    '800': { name: 'Numero verde internazionale (UIFN)', kind: 'intl_freephone' },
    '808': { name: 'Numero a costo ripartito internazionale', kind: 'intl_shared' },
    '870': { name: 'Rete satellitare Inmarsat', kind: 'satellite' },
    '878': { name: 'Servizio di telecomunicazione personale universale', kind: 'satellite' },
    '881': { name: 'Rete satellitare mobile globale (es. Iridium, Globalstar)', kind: 'satellite' },
    '882': { name: 'Rete internazionale (operatori senza paese)', kind: 'satellite' },
    '883': { name: 'Rete internazionale (operatori senza paese)', kind: 'satellite' },
    '888': { name: 'Servizi umanitari ONU (OCHA)', kind: 'satellite' },
    '979': { name: 'Numero a tariffa maggiorata internazionale', kind: 'intl_premium' }
  };

  var COUNTRY_BY_PREFIX = {};
  var COUNTRY_BY_ISO = {};
  var MAX_PREFIX_LEN = 0;

  (function buildCountryIndex() {
    for (var i = 0; i < COUNTRY_DATA.length; i++) {
      var p = COUNTRY_DATA[i].split('|');
      // Le voci con prefisso più lungo del codice paese (es. 1876, 441481, 35818, 262269, 77)
      // condividono il codice internazionale "padre".
      var key = p[0];
      var dial = key.charAt(0) === '1' ? '1'
        : key.charAt(0) === '7' ? '7'
        : key.indexOf('44') === 0 ? '44'
        : key.length > 3 ? key.slice(0, 3)
        : key;
      var c = { code: p[1], name: p[2], flag: flagOf(p[1]), dialCode: dial };
      COUNTRY_BY_PREFIX[p[0]] = c;
      if (!COUNTRY_BY_ISO[p[1]]) COUNTRY_BY_ISO[p[1]] = c;
      if (p[0].length > MAX_PREFIX_LEN) MAX_PREFIX_LEN = p[0].length;
    }
    for (var j = 0; j < CANADA_AREA_CODES.length; j++) {
      COUNTRY_BY_PREFIX['1' + CANADA_AREA_CODES[j]] = { code: 'CA', name: 'Canada', flag: flagOf('CA'), dialCode: '1' };
    }
    COUNTRY_BY_ISO.CA = COUNTRY_BY_PREFIX['1416'];
    Object.keys(GLOBAL_CODES).forEach(function (k) {
      COUNTRY_BY_PREFIX[k] = { code: 'INTL', name: GLOBAL_CODES[k].name, flag: k.charAt(0) === '8' && k !== '800' && k !== '808' ? '🛰️' : '🌐', dialCode: k, global: GLOBAL_CODES[k].kind };
    });
  })();

  /** Trova il paese col prefisso più lungo. Ritorna { country, prefix } o null. */
  function findCountry(intlDigits) {
    for (var len = Math.min(MAX_PREFIX_LEN, intlDigits.length); len >= 1; len--) {
      var key = intlDigits.slice(0, len);
      if (COUNTRY_BY_PREFIX[key]) return { country: COUNTRY_BY_PREFIX[key], prefix: key };
    }
    return null;
  }

  /* =====================================================================
   * 3. PROFILI DI RISCHIO PER PAESE
   * ===================================================================== */

  /**
   * Paesi/territori spesso usati per truffe "wangiri" (squillo singolo per
   * indurre a richiamare un numero internazionale costoso) secondo le
   * segnalazioni ricorrenti di operatori e autorità europee.
   */
  var WANGIRI = {
    TN: 1, XK: 1, MD: 1, BY: 1, SL: 1, GN: 1, ML: 1, CI: 1, MR: 1, KM: 1, ST: 1, CK: 1, LV: 1, LT: 1,
    BA: 1, ME: 1, RS: 1, SO: 1, LR: 1, GM: 1, CU: 1, NR: 1, TV: 1, PG: 1, IO: 1, AC: 1, SH: 1, BI: 1,
    // Caraibi nel piano NANP: sembrano numeri "+1" ma sono internazionali a tariffa elevata
    JM: 1, DO: 1, VG: 1, GD: 1, TC: 1, AG: 1, MS: 1, DM: 1, KN: 1, LC: 1, VC: 1, AI: 1, BS: 1,
    BB: 1, KY: 1, BM: 1, TT: 1, SX: 1
  };

  /** Paesi da cui operano molti call center che chiamano in italiano (telemarketing). */
  // Valore = impatto sul punteggio (0 dove il paese è già penalizzato come prefisso wangiri).
  var CALLCENTER_COUNTRIES = { AL: -10, RO: -3, TN: 0, MD: 0 };

  /* =====================================================================
   * 4. ITALIA – PIANO DI NUMERAZIONE
   * ===================================================================== */

  /** Prefissi distrettuali italiani -> località principale. */
  var IT_AREA_CODES = {
    '010': 'Genova', '011': 'Torino', '0121': 'Pinerolo', '0122': 'Susa', '0123': 'Lanzo Torinese',
    '0124': 'Rivarolo Canavese', '0125': 'Ivrea', '0131': 'Alessandria', '0141': 'Asti',
    '0142': 'Casale Monferrato', '0143': 'Novi Ligure', '0144': 'Acqui Terme', '015': 'Biella',
    '0161': 'Vercelli', '0163': 'Borgosesia', '0165': 'Aosta', '0166': 'Saint-Vincent', '0171': 'Cuneo',
    '0172': 'Savigliano', '0173': 'Alba', '0174': 'Mondovì', '0175': 'Saluzzo', '0182': 'Albenga',
    '0183': 'Imperia', '0184': 'Sanremo', '0185': 'Rapallo', '0187': 'La Spezia', '019': 'Savona',
    '02': 'Milano', '030': 'Brescia', '031': 'Como', '0321': 'Novara', '0322': 'Arona',
    '0323': 'Verbania', '0324': 'Domodossola', '0331': 'Busto Arsizio', '0332': 'Varese',
    '0341': 'Lecco', '0342': 'Sondrio', '0343': 'Chiavenna', '0344': 'Menaggio',
    '0345': 'San Pellegrino Terme', '0346': 'Clusone', '035': 'Bergamo', '0362': 'Seregno',
    '0363': 'Treviglio', '0364': 'Breno', '0365': 'Salò', '0371': 'Lodi', '0372': 'Cremona',
    '0373': 'Crema', '0374': 'Soresina', '0375': 'Casalmaggiore', '0376': 'Mantova', '0377': 'Codogno',
    '0381': 'Vigevano', '0382': 'Pavia', '0383': 'Voghera', '0384': 'Mortara', '0385': 'Stradella',
    '0386': 'Ostiglia', '039': 'Monza', '040': 'Trieste', '041': 'Venezia', '0421': 'San Donà di Piave',
    '0422': 'Treviso', '0423': 'Montebelluna', '0424': 'Bassano del Grappa', '0425': 'Rovigo',
    '0426': 'Adria', '0427': 'Spilimbergo', '0428': 'Tarvisio', '0429': 'Este',
    '0431': 'Cervignano del Friuli', '0432': 'Udine', '0433': 'Tolmezzo', '0434': 'Pordenone',
    '0435': 'Pieve di Cadore', '0436': 'Cortina d\'Ampezzo', '0437': 'Belluno', '0438': 'Conegliano',
    '0439': 'Feltre', '0442': 'Legnago', '0444': 'Vicenza', '0445': 'Schio', '045': 'Verona',
    '0461': 'Trento', '0462': 'Cavalese', '0463': 'Cles', '0464': 'Rovereto', '0465': 'Tione di Trento',
    '0471': 'Bolzano', '0472': 'Bressanone', '0473': 'Merano', '0474': 'Brunico', '0481': 'Gorizia',
    '049': 'Padova', '050': 'Pisa', '051': 'Bologna', '0521': 'Parma', '0522': 'Reggio Emilia',
    '0523': 'Piacenza', '0524': 'Fidenza', '0525': 'Fornovo di Taro', '0532': 'Ferrara',
    '0533': 'Comacchio', '0534': 'Porretta Terme', '0535': 'Mirandola', '0536': 'Sassuolo',
    '0541': 'Rimini', '0542': 'Imola', '0543': 'Forlì', '0544': 'Ravenna', '0545': 'Lugo',
    '0546': 'Faenza', '0547': 'Cesena', '0549': 'San Marino', '055': 'Firenze', '0564': 'Grosseto',
    '0565': 'Piombino', '0566': 'Follonica', '0571': 'Empoli', '0572': 'Montecatini Terme',
    '0573': 'Pistoia', '0574': 'Prato', '0575': 'Arezzo', '0577': 'Siena', '0578': 'Chianciano Terme',
    '0583': 'Lucca', '0584': 'Viareggio', '0585': 'Massa', '0586': 'Livorno', '0587': 'Pontedera',
    '0588': 'Volterra', '059': 'Modena', '06': 'Roma', '06698': 'Città del Vaticano', '070': 'Cagliari',
    '071': 'Ancona', '0721': 'Pesaro', '0722': 'Urbino', '0731': 'Jesi', '0732': 'Fabriano',
    '0733': 'Macerata', '0734': 'Fermo', '0735': 'San Benedetto del Tronto', '0736': 'Ascoli Piceno',
    '0737': 'Camerino', '0742': 'Foligno', '0743': 'Spoleto', '0744': 'Terni', '0746': 'Rieti',
    '075': 'Perugia', '0761': 'Viterbo', '0763': 'Orvieto', '0765': 'Poggio Mirteto',
    '0766': 'Civitavecchia', '0771': 'Formia', '0773': 'Latina', '0774': 'Tivoli', '0775': 'Frosinone',
    '0776': 'Cassino', '0781': 'Iglesias', '0782': 'Lanusei', '0783': 'Oristano', '0784': 'Nuoro',
    '0785': 'Macomer', '0789': 'Olbia', '079': 'Sassari', '080': 'Bari', '081': 'Napoli',
    '0823': 'Caserta', '0824': 'Benevento', '0825': 'Avellino', '0827': 'Sant\'Angelo dei Lombardi',
    '0828': 'Battipaglia', '0831': 'Brindisi', '0832': 'Lecce', '0833': 'Gallipoli', '0835': 'Matera',
    '0836': 'Maglie', '085': 'Pescara', '0861': 'Teramo', '0862': 'L\'Aquila', '0863': 'Avezzano',
    '0864': 'Sulmona', '0865': 'Isernia', '0871': 'Chieti', '0872': 'Lanciano', '0873': 'Vasto',
    '0874': 'Campobasso', '0875': 'Termoli', '0881': 'Foggia', '0882': 'San Severo',
    '0883': 'Andria / Barletta', '0884': 'Manfredonia', '0885': 'Cerignola', '089': 'Salerno',
    '090': 'Messina', '091': 'Palermo', '0921': 'Cefalù', '0922': 'Agrigento', '0923': 'Trapani',
    '0924': 'Alcamo', '0925': 'Sciacca', '0931': 'Siracusa', '0932': 'Ragusa', '0933': 'Caltagirone',
    '0934': 'Caltanissetta', '0935': 'Enna', '0941': 'Patti', '0942': 'Taormina', '095': 'Catania',
    '0961': 'Catanzaro', '0962': 'Crotone', '0963': 'Vibo Valentia', '0964': 'Locri',
    '0965': 'Reggio Calabria', '0966': 'Palmi', '0967': 'Soverato', '0968': 'Lamezia Terme',
    '0971': 'Potenza', '0972': 'Melfi', '0973': 'Lagonegro', '0974': 'Vallo della Lucania',
    '0975': 'Sala Consilina', '0981': 'Castrovillari', '0982': 'Paola', '0983': 'Rossano',
    '0984': 'Cosenza', '0985': 'Scalea', '099': 'Taranto'
  };

  /** Macro-aree per i prefissi non presenti in tabella (in base alla seconda cifra). */
  var IT_AREA_ZONES = {
    '01': 'Piemonte, Liguria o Valle d\'Aosta', '03': 'Lombardia o Piemonte orientale',
    '04': 'Triveneto', '05': 'Emilia-Romagna o Toscana', '07': 'Italia centrale o Sardegna',
    '08': 'Italia meridionale (Campania, Puglia, Abruzzo, Molise, Basilicata)',
    '09': 'Sicilia, Calabria o Basilicata'
  };

  /**
   * Prefissi mobili -> operatore che li ha avuti in assegnazione originaria.
   * Con la portabilità del numero il cliente può aver cambiato operatore:
   * l'indicazione è solo orientativa.
   */
  var IT_MOBILE_OPERATORS = {
    '330': 'TIM', '331': 'TIM', '333': 'TIM', '334': 'TIM', '335': 'TIM', '336': 'TIM', '337': 'TIM',
    '338': 'TIM', '339': 'TIM', '360': 'TIM', '361': 'TIM', '362': 'TIM', '363': 'TIM', '366': 'TIM',
    '368': 'TIM',
    '340': 'Vodafone', '341': 'Vodafone', '342': 'Vodafone', '343': 'Vodafone', '344': 'Vodafone',
    '345': 'Vodafone', '346': 'Vodafone', '347': 'Vodafone', '348': 'Vodafone', '349': 'Vodafone',
    '320': 'WindTre (ex Wind)', '322': 'WindTre (ex Wind)', '323': 'WindTre (ex Wind)',
    '324': 'WindTre (ex Wind)', '327': 'WindTre (ex Wind)', '328': 'WindTre (ex Wind)',
    '329': 'WindTre (ex Wind)', '380': 'WindTre (ex Wind)', '388': 'WindTre (ex Wind)',
    '389': 'WindTre (ex Wind)',
    '390': 'WindTre (ex 3 Italia)', '391': 'WindTre (ex 3 Italia)', '392': 'WindTre (ex 3 Italia)',
    '393': 'WindTre (ex 3 Italia)', '397': 'WindTre (ex 3 Italia)',
    '351': 'Iliad', '352': 'Iliad'
  };
  /** Serie assegnate in blocchi a più operatori virtuali/nuovi entranti. */
  var IT_MOBILE_MVNO_PREFIXES = ['350', '353', '370', '371', '373', '375', '377', '379'];

  /**
   * Numeri istituzionali e di servizio italiani noti (cifre nazionali).
   * kind: emergency | institution | operator
   */
  var IT_KNOWN_NUMBERS = {
    '112': { name: 'Numero Unico di Emergenza (112 NUE)', kind: 'emergency' },
    '113': { name: 'Polizia di Stato – Soccorso pubblico di emergenza', kind: 'emergency' },
    '115': { name: 'Vigili del Fuoco', kind: 'emergency' },
    '118': { name: 'Emergenza sanitaria', kind: 'emergency' },
    '1530': { name: 'Guardia Costiera – Emergenze in mare', kind: 'emergency' },
    '117': { name: 'Guardia di Finanza', kind: 'institution' },
    '114': { name: 'Emergenza Infanzia', kind: 'institution' },
    '1522': { name: 'Numero antiviolenza e stalking', kind: 'institution' },
    '1500': { name: 'Ministero della Salute – Numero di pubblica utilità', kind: 'institution' },
    '1518': { name: 'CCISS Viaggiare Informati', kind: 'institution' },
    '19696': { name: 'Telefono Azzurro', kind: 'institution' },
    '116000': { name: 'Linea diretta per i minori scomparsi', kind: 'institution' },
    '116117': { name: 'Guardia medica (continuità assistenziale, dove attivo)', kind: 'institution' },
    '803164': { name: 'INPS – Contact center (da rete fissa)', kind: 'institution' },
    '06164164': { name: 'INPS – Contact center (da cellulare)', kind: 'institution' },
    '800909696': { name: 'Agenzia delle Entrate – Assistenza (da rete fissa)', kind: 'institution' },
    '0696668907': { name: 'Agenzia delle Entrate – Assistenza (da cellulare)', kind: 'institution' },
    '060101': { name: 'Agenzia delle Entrate-Riscossione – Contact center', kind: 'institution' },
    '066001': { name: 'INAIL – Contact center', kind: 'institution' },
    '800003322': { name: 'Poste Italiane – Assistenza clienti (da rete fissa)', kind: 'institution' },
    '0645263322': { name: 'Poste Italiane – Assistenza clienti (da cellulare)', kind: 'institution' },
    '803116': { name: 'ACI – Soccorso stradale', kind: 'institution' },
    '187': { name: 'TIM – Servizio clienti rete fissa', kind: 'operator' },
    '119': { name: 'TIM – Servizio clienti mobile', kind: 'operator' },
    '190': { name: 'Vodafone – Servizio clienti', kind: 'operator' },
    '159': { name: 'WindTre – Servizio clienti', kind: 'operator' },
    '177': { name: 'Iliad – Servizio clienti', kind: 'operator' },
    '192193': { name: 'Fastweb – Servizio clienti', kind: 'operator' }
  };

  /**
   * Classifica un numero nazionale italiano (cifre senza +39).
   * Ritorna un oggetto parziale con tipo linea, area, operatore, validità,
   * formato nazionale e segnali specifici.
   */
  function classifyItaly(n) {
    var r = {
      lineType: 'unknown', lineTypeLabel: 'Tipo di numero non riconosciuto', area: null,
      operatorHint: null, valid: false, national: groupDigits(n), signals: [], short: false,
      known: IT_KNOWN_NUMBERS[n] || null, invalidReason: null
    };
    var len = n.length;
    var c0 = n.charAt(0);

    // --- Fissi: 0 + prefisso distrettuale, da 6 a 11 cifre in tutto ---
    if (c0 === '0') {
      r.lineType = 'landline';
      r.lineTypeLabel = 'Telefono fisso';
      var code = null;
      for (var l = 5; l >= 2; l--) {
        if (IT_AREA_CODES[n.slice(0, l)]) { code = n.slice(0, l); break; }
      }
      if (code) {
        // Il Vaticano usa il distretto di Roma: mostriamo "06" come prefisso.
        var shownCode = code === '06698' ? '06' : code;
        r.area = IT_AREA_CODES[code] + ' (' + shownCode + ')';
        r.national = shownCode + ' ' + groupDigits(n.slice(shownCode.length));
      } else {
        var zone = IT_AREA_ZONES[n.slice(0, 2)];
        r.area = zone ? 'Distretto ' + n.slice(0, 4) + ' – ' + zone : null;
        r.national = n.slice(0, 4) + ' ' + groupDigits(n.slice(4));
      }
      r.valid = len >= 6 && len <= 11;
      if (!r.valid) r.invalidReason = 'Un numero fisso italiano ha tra 6 e 11 cifre (prefisso compreso).';
      return r;
    }

    // --- Cellulari: 3xx, 10 cifre (alcune vecchie numerazioni 9) ---
    if (c0 === '3') {
      var p3 = n.slice(0, 3);
      if (len >= 11 && len <= 13) {
        r.lineType = 'm2m';
        r.lineTypeLabel = 'SIM dati / M2M (dispositivi, allarmi, IoT)';
        r.national = p3 + ' ' + groupDigits(n.slice(3));
        r.valid = true;
        return r;
      }
      r.lineType = 'mobile';
      r.lineTypeLabel = 'Cellulare';
      r.national = groupDigits(n);
      if (IT_MOBILE_OPERATORS[p3]) {
        r.operatorHint = IT_MOBILE_OPERATORS[p3] + ' (assegnazione originaria: con la portabilità il numero può essere passato ad altro operatore)';
      } else if (startsWithAny(n, IT_MOBILE_MVNO_PREFIXES)) {
        r.operatorHint = 'Operatore virtuale o nuovo entrante (es. PosteMobile, Fastweb, Kena, ho., Very, CoopVoce, Lycamobile…): serie assegnata a più operatori, indicazione non certa';
      }
      r.valid = len === 9 || len === 10;
      if (!r.valid) r.invalidReason = 'Un cellulare italiano ha 10 cifre (raramente 9).';
      return r;
    }

    // --- Numeri non geografici 8xx ---
    if (c0 === '8') {
      var p = n.slice(0, 3);
      if (p === '800') {
        r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde (gratuito)';
        r.valid = len === 9;
      } else if (p === '803') {
        r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde (gratuito, numerazione breve 803)';
        r.valid = len === 6;
      } else if (p === '840' || p === '848') {
        r.lineType = 'shared_cost'; r.lineTypeLabel = 'Numero a costo ripartito (' + p + ')';
        r.valid = len >= 6 && len <= 10;
      } else if (p === '899' || p === '892' || p === '893' || p === '894' || p === '895') {
        r.lineType = 'premium';
        r.lineTypeLabel = p === '895' ? 'Numero a pagamento (servizi per adulti, 895)'
          : p === '892' || p === '893' || p === '894' ? 'Numero a pagamento / servizi di informazione (' + p + ')'
          : 'Numero a pagamento (tariffa maggiorata, 899)';
        r.valid = len >= 6 && len <= 10;
      } else {
        r.lineTypeLabel = 'Numerazione non geografica 8xx';
        r.valid = len >= 6 && len <= 10;
      }
      if (len === 9) r.national = groupDigits(n);
      if (!r.valid) r.invalidReason = 'Lunghezza non compatibile con la numerazione ' + p + '.';
      return r;
    }

    // --- Servizi e numeri brevi 1xx ---
    if (c0 === '1') {
      var p1 = n.slice(0, 3);
      if (p1 === '199') {
        // Numero unico nazionale a tariffa specifica: 199 + 6 cifre, costa più di una chiamata normale
        r.lineType = 'shared_cost';
        r.lineTypeLabel = 'Numero a tariffa specifica (199)';
        r.valid = len === 9;
        if (len === 9) r.national = groupDigits(n);
        if (!r.valid) r.invalidReason = 'I numeri 199 hanno 9 cifre.';
        return r;
      }
      if (p1 === '144' || p1 === '166' || p1 === '178') {
        r.lineType = 'premium';
        r.lineTypeLabel = 'Numerazione a sovrapprezzo storica (' + p1 + ')';
        r.valid = len >= 6 && len <= 10;
        if (!r.valid) r.invalidReason = 'Lunghezza non compatibile con la numerazione ' + p1 + '.';
        return r;
      }
      r.short = true;
      r.lineType = 'short';
      r.national = n;
      if (r.known && r.known.kind === 'emergency') r.lineTypeLabel = 'Numero di emergenza';
      else if (r.known) r.lineTypeLabel = 'Numero breve di pubblica utilità / servizio';
      else if (n.slice(0, 2) === '12') r.lineTypeLabel = 'Servizio informazioni elenco abbonati (a pagamento)';
      else r.lineTypeLabel = 'Numero breve (servizio)';
      r.valid = len >= 3 && len <= 6;
      if (!r.valid) r.invalidReason = 'I numeri brevi italiani hanno da 3 a 6 cifre.';
      return r;
    }

    // --- 4xx: servizi interni di rete e servizi SMS/MMS ---
    if (c0 === '4') {
      r.short = true;
      r.lineType = 'short';
      r.lineTypeLabel = 'Numerazione per servizi di rete o SMS/MMS (4xx)';
      r.national = n;
      r.valid = len >= 3 && len <= 9;
      if (!r.valid) r.invalidReason = 'Lunghezza non compatibile con la numerazione 4xx.';
      return r;
    }

    // --- 5x: 55 VoIP nomadico, altre serie speciali ---
    if (c0 === '5') {
      if (n.slice(0, 2) === '55') {
        r.lineType = 'voip';
        r.lineTypeLabel = 'VoIP nomadico (55)';
        r.national = '55 ' + groupDigits(n.slice(2));
        r.valid = len >= 8 && len <= 11;
      } else {
        r.lineTypeLabel = 'Numerazione speciale non geografica (5x)';
        r.valid = len >= 6 && len <= 13;
      }
      if (!r.valid) r.invalidReason = 'Lunghezza non compatibile con la numerazione 5x.';
      return r;
    }

    // --- 7x: accesso a Internet ---
    if (c0 === '7') {
      r.lineTypeLabel = 'Numerazione per accesso a Internet (7x)';
      r.valid = len >= 6 && len <= 10;
      if (!r.valid) r.invalidReason = 'Lunghezza non compatibile con la numerazione 7x.';
      return r;
    }

    // --- 2, 6, 9: non esistono come prime cifre nazionali ---
    r.valid = false;
    r.invalidReason = (c0 === '2' || c0 === '6')
      ? 'Nessun numero italiano inizia per ' + c0 + ': forse manca lo 0 del prefisso (es. 0' + n.slice(0, 1) + ' per ' + (c0 === '2' ? 'Milano' : 'Roma') + ')?'
      : 'Nessun numero italiano inizia per ' + c0 + '.';
    return r;
  }

  /* =====================================================================
   * 5. ALTRI PAESI – CLASSIFICAZIONE ESSENZIALE
   * ===================================================================== */

  /** Lunghezze del numero nazionale significativo (senza prefisso internazionale né 0). */
  var NSN_LENGTHS = {
    US: [10, 10], CA: [10, 10], GB: [9, 10], FR: [9, 9], DE: [6, 13], ES: [9, 9], CH: [9, 9],
    AT: [4, 13], BE: [8, 9], NL: [9, 9], PT: [9, 9], IE: [7, 10], PL: [9, 9], RO: [9, 9], GR: [10, 10],
    SE: [7, 13], NO: [8, 8], DK: [8, 8], FI: [5, 12], TN: [8, 8], AL: [8, 9], MA: [9, 9], AU: [9, 9],
    BR: [10, 11], IN: [10, 10], CN: [7, 12], RU: [10, 10], KZ: [10, 10], JP: [9, 10], MX: [10, 10],
    SM: [6, 10], VA: [6, 10]
  };

  /** Paesi che usano lo 0 come prefisso nazionale (trunk) nella forma nazionale. */
  var TRUNK_ZERO = {
    GB: 1, FR: 1, DE: 1, CH: 1, AT: 1, BE: 1, NL: 1, IE: 1, RO: 1, AL: 1, SE: 1, FI: 1, TR: 1, AU: 1,
    NZ: 1, JP: 1, CN: 1, HR: 1, SI: 1, RS: 1, BA: 1, ME: 1, MK: 1, UA: 1
  };

  var NANP_TOLL_FREE = ['800', '833', '844', '855', '866', '877', '888'];

  function classifyForeign(iso, nsn) {
    var r = { lineType: 'unknown', lineTypeLabel: 'Tipo di linea non determinabile', area: null, valid: false, invalidReason: null };
    var lens = NSN_LENGTHS[iso];
    var nanp = COUNTRY_BY_ISO[iso] && COUNTRY_BY_ISO[iso].dialCode === '1';
    if (nanp) lens = [10, 10];
    if (lens) {
      r.valid = nsn.length >= lens[0] && nsn.length <= lens[1];
      if (!r.valid) r.invalidReason = 'Lunghezza non tipica per ' + COUNTRY_BY_ISO[iso].name + ' (attese ' + (lens[0] === lens[1] ? lens[0] : lens[0] + '–' + lens[1]) + ' cifre dopo il prefisso).';
    } else {
      r.valid = nsn.length >= 4 && nsn.length <= 14;
      if (!r.valid) r.invalidReason = 'Lunghezza non plausibile per un numero internazionale.';
    }

    if (nanp) {
      if (!/^[2-9]\d{2}[2-9]/.test(nsn)) {
        r.valid = false;
        r.invalidReason = 'Nel piano nordamericano prefisso e centrale non possono iniziare per 0 o 1.';
      }
      var ac = nsn.slice(0, 3);
      if (NANP_TOLL_FREE.indexOf(ac) >= 0) { r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde nordamericano'; }
      else if (ac === '900') { r.lineType = 'premium'; r.lineTypeLabel = 'Numero a pagamento (900)'; }
      else { r.lineTypeLabel = 'Fisso o cellulare (non distinguibile nel piano nordamericano)'; r.area = 'Prefisso ' + ac; }
      return r;
    }

    switch (iso) {
      case 'GB':
        if (/^7[1-57-9]/.test(nsn)) { r.lineType = 'mobile'; r.lineTypeLabel = 'Cellulare'; }
        else if (/^[12]/.test(nsn)) { r.lineType = 'landline'; r.lineTypeLabel = 'Telefono fisso'; }
        else if (/^80/.test(nsn)) { r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde'; }
        else if (/^8[47]/.test(nsn)) { r.lineType = 'shared_cost'; r.lineTypeLabel = 'Numero a costo ripartito'; }
        else if (/^9/.test(nsn)) { r.lineType = 'premium'; r.lineTypeLabel = 'Numero a pagamento'; }
        break;
      case 'FR':
        if (/^[67]/.test(nsn)) { r.lineType = 'mobile'; r.lineTypeLabel = 'Cellulare'; }
        else if (/^[1-5]/.test(nsn)) { r.lineType = 'landline'; r.lineTypeLabel = 'Telefono fisso'; }
        else if (/^9/.test(nsn)) { r.lineType = 'voip'; r.lineTypeLabel = 'Fisso VoIP / box Internet'; }
        else if (/^80/.test(nsn)) { r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde'; }
        else if (/^8[12]/.test(nsn)) { r.lineType = 'shared_cost'; r.lineTypeLabel = 'Numero a costo ripartito'; }
        else if (/^89/.test(nsn)) { r.lineType = 'premium'; r.lineTypeLabel = 'Numero a pagamento'; }
        break;
      case 'DE':
        if (/^1[5-7]/.test(nsn)) { r.lineType = 'mobile'; r.lineTypeLabel = 'Cellulare'; }
        else if (/^800/.test(nsn)) { r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde'; }
        else if (/^900/.test(nsn)) { r.lineType = 'premium'; r.lineTypeLabel = 'Numero a pagamento'; }
        else if (/^180/.test(nsn)) { r.lineType = 'shared_cost'; r.lineTypeLabel = 'Numero a costo ripartito'; }
        else if (/^[2-9]/.test(nsn)) { r.lineType = 'landline'; r.lineTypeLabel = 'Telefono fisso'; }
        break;
      case 'ES':
        if (/^[67]/.test(nsn)) { r.lineType = 'mobile'; r.lineTypeLabel = 'Cellulare'; }
        else if (/^900/.test(nsn)) { r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde'; }
        else if (/^80[3-7]/.test(nsn)) { r.lineType = 'premium'; r.lineTypeLabel = 'Numero a pagamento'; }
        else if (/^90[12]/.test(nsn)) { r.lineType = 'shared_cost'; r.lineTypeLabel = 'Numero a costo ripartito'; }
        else if (/^[89]/.test(nsn)) { r.lineType = 'landline'; r.lineTypeLabel = 'Telefono fisso'; }
        break;
      case 'CH':
        if (/^7[5-9]/.test(nsn)) { r.lineType = 'mobile'; r.lineTypeLabel = 'Cellulare'; }
        else if (/^800/.test(nsn)) { r.lineType = 'toll_free'; r.lineTypeLabel = 'Numero verde'; }
        else if (/^90/.test(nsn)) { r.lineType = 'premium'; r.lineTypeLabel = 'Numero a pagamento'; }
        else if (/^84/.test(nsn)) { r.lineType = 'shared_cost'; r.lineTypeLabel = 'Numero a costo ripartito'; }
        else if (/^[2-6]|^9[1]/.test(nsn)) { r.lineType = 'landline'; r.lineTypeLabel = 'Telefono fisso'; }
        break;
    }
    return r;
  }

  /** Formati nazionale/internazionale per numeri esteri. */
  function formatForeign(country, nsn) {
    if (country.dialCode === '1' && nsn.length === 10) {
      return {
        national: '(' + nsn.slice(0, 3) + ') ' + nsn.slice(3, 6) + '-' + nsn.slice(6),
        international: '+1 ' + nsn.slice(0, 3) + ' ' + nsn.slice(3, 6) + ' ' + nsn.slice(6)
      };
    }
    var grouped = groupDigits(nsn);
    if (country.code === 'FR' && nsn.length === 9) {
      grouped = nsn.charAt(0) + ' ' + nsn.slice(1).replace(/(\d{2})(?=\d)/g, '$1 ');
    } else if (country.code === 'GB' && nsn.length === 10) {
      grouped = nsn.slice(0, 4) + ' ' + nsn.slice(4);
    }
    return {
      national: (TRUNK_ZERO[country.code] ? '0' : '') + grouped,
      international: '+' + country.dialCode + ' ' + grouped
    };
  }

  /* =====================================================================
   * 6. NORMALIZZAZIONE DELL'INPUT
   * ===================================================================== */

  /**
   * Pulisce l'input grezzo e determina se è internazionale.
   * Ritorna { error } oppure { intl: "393331234567" } oppure { national: "3331234567" }.
   */
  function parseInput(raw, defaultCountry) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { error: 'Inserisci un numero di telefono da analizzare.' };

    if (/^(anonimo|privato|sconosciuto|numero (privato|sconosciuto|nascosto)|nascosto|unknown|private|no caller id)$/i.test(s)) {
      return { error: 'Le chiamate con numero nascosto non mostrano alcun numero da analizzare: non è possibile identificarle. Puoi bloccarle dalle impostazioni del telefono.' };
    }

    s = s.replace(/^(tel|callto|sms|whatsapp)\s*:\s*\/*/i, '');
    // Estensioni/interni finali: "02 1234567 int. 21", "x123"
    s = s.replace(/\s*(ext\.?|x|int\.?|interno)\s*\d{1,5}\s*$/i, '');

    if (/[a-z]/i.test(s)) {
      return { error: 'Il testo inserito contiene lettere: inserisci solo il numero (cifre, spazi, +, trattini o parentesi).' };
    }
    var cleaned = s.replace(/[^\d+]/g, '');
    var digits = cleaned.replace(/\D/g, '');
    if (!digits) return { error: 'Non ho trovato cifre: inserisci un numero di telefono.' };
    if (digits.length > 17) return { error: 'Il numero è troppo lungo per essere un numero di telefono (massimo 15 cifre).' };

    var TOO_SHORT = 'Il numero è troppo corto: inserisci il numero completo, prefisso compreso.';
    if (cleaned.charAt(0) === '+') return digits.length < 3 ? { error: TOO_SHORT } : { intl: digits };
    if (digits.slice(0, 2) === '00') return digits.length < 5 ? { error: TOO_SHORT } : { intl: digits.slice(2), viaDoubleZero: true };
    if (digits.length < 3) return { error: TOO_SHORT };

    if (defaultCountry === 'IT') {
      // Prefisso 39 scritto senza + né 00 (es. copiato da WhatsApp): "393331234567", "390612345678"
      if ((digits.length === 12 && /^393/.test(digits)) || (digits.length >= 11 && digits.length <= 13 && /^390/.test(digits))) {
        return { intl: digits, assumedPrefix: true };
      }
      return { national: digits };
    }
    var dc = COUNTRY_BY_ISO[defaultCountry];
    if (dc) {
      // Per gli altri paesi si toglie lo 0 nazionale iniziale
      var nsn = TRUNK_ZERO[defaultCountry] ? digits.replace(/^0/, '') : digits;
      return { intl: dc.dialCode + nsn };
    }
    return { national: digits };
  }

  /* =====================================================================
   * 7. SEGNALI E PUNTEGGIO
   * ===================================================================== */

  function signal(id, label, detail, impact, severity) {
    return { id: id, label: label, detail: detail, impact: impact, severity: severity };
  }

  /** Cerca schemi di cifre sospetti nella parte "abbonato" del numero. */
  function patternSignals(subscriber) {
    var out = [];
    if (subscriber.length < 6) return out;
    var tail = subscriber.slice(-7);
    if (/^(\d)\1+$/.test(tail)) {
      out.push(signal('pattern_same_digits', 'Cifre tutte uguali',
        'Il numero termina con una lunga sequenza della stessa cifra: è insolito per un utente reale e tipico di numeri falsificati (spoofing) o di prova.', -20, 'medium'));
    } else if (/0123456|1234567|2345678|3456789|9876543|8765432|7654321|6543210/.test(subscriber)) {
      out.push(signal('pattern_sequence', 'Sequenza di cifre consecutive',
        'Il numero contiene una sequenza crescente o decrescente (es. 1234567): può essere un numero inventato o falsificato.', -10, 'medium'));
    } else if (/(\d{2,3})\1{2,}/.test(subscriber.slice(-6)) || /(\d)\1{5,}/.test(subscriber)) {
      out.push(signal('pattern_repetitive', 'Schema di cifre ripetitivo',
        'Le ultime cifre seguono uno schema ripetuto. Può essere un numero "di prestigio" aziendale, ma anche un numero falsificato.', -6, 'low'));
    }
    return out;
  }

  function verdictOf(score) {
    if (score >= 70) return 'affidabile';
    if (score >= 45) return 'neutro';
    if (score >= 25) return 'sospetto';
    return 'pericoloso';
  }

  var VERDICT_LABELS = {
    affidabile: 'Probabilmente affidabile',
    neutro: 'Nessun allarme evidente, ma resta prudente',
    sospetto: 'Sospetto: meglio non richiamare',
    pericoloso: 'Potenzialmente pericoloso'
  };

  /* =====================================================================
   * 8. CONSIGLI
   * ===================================================================== */

  function buildAdvice(res, ctx) {
    var a = [];
    var has = function (id) { return res.signals.some(function (s) { return s.id === id; }); };

    if (ctx.known && (ctx.known.kind === 'emergency')) {
      a.push('È un numero di emergenza: se ti ha chiamato, probabilmente stanno cercando di ricontattarti per una tua chiamata. Se hai dubbi, chiama tu direttamente il ' + res.normalized.replace(/^\+39/, '') + '.');
    }
    if (ctx.known) {
      a.push('Il numero chiamante può essere falsificato (spoofing): se qualcuno si presenta come "' + ctx.known.name + '" e ti chiede dati, pagamenti o codici, riattacca e richiama tu il numero ufficiale indicato sul sito dell\'ente.');
    }
    if (res.lineType === 'premium' || has('intl_premium')) {
      a.push('Non richiamare: i numeri a tariffa maggiorata possono costare diversi euro al minuto. Puoi chiedere al tuo operatore di bloccare le chiamate verso numerazioni a sovrapprezzo.');
    }
    if (has('wangiri_country') || has('satellite_network')) {
      a.push('Se hai ricevuto solo uno squillo, è la tipica truffa "wangiri": non richiamare, chi ti cerca davvero ti richiamerà o ti scriverà. Le chiamate verso questi prefissi possono costare molto.');
    }
    if (res.country && res.country.code !== 'IT' && !has('wangiri_country')) {
      a.push('È un numero estero: richiamarlo può avere costi internazionali. Se non conosci nessuno in ' + res.country.name + ', lascia che sia l\'interlocutore a ricontattarti o a scriverti.');
    }
    if (has('callcenter_country') || has('telemarketing_landline') || res.lineType === 'toll_free' || res.lineType === 'shared_cost') {
      a.push('Contro il telemarketing indesiderato iscrivi i tuoi numeri (fissi e cellulari) al Registro Pubblico delle Opposizioni: registropubblicodelleopposizioni.it. È gratuito.');
      a.push('Se un operatore ti chiama nonostante l\'opposizione o senza consenso, puoi segnalarlo al Garante per la protezione dei dati personali (garanteprivacy.it).');
    }
    if (res.lineType === 'shared_cost') {
      a.push('Richiamare un numero a costo ripartito (840/848) non è gratuito: verifica prima sul sito ufficiale dell\'azienda se esiste un numero verde.');
    }
    if (res.lineType === 'mobile' && res.verdict !== 'sospetto' && res.verdict !== 'pericoloso') {
      a.push('Se non aspettavi la chiamata, non richiamare subito: se è importante, ti lasceranno un messaggio o ti scriveranno. Puoi controllare se il numero ha un profilo WhatsApp o Telegram.');
    }
    if (res.verdict === 'sospetto' || res.verdict === 'pericoloso') {
      a.push('Blocca il numero dalle impostazioni del telefono (Telefono > Recenti > Blocca contatto) per non ricevere altre chiamate.');
      a.push('Se hai subito un tentativo di truffa, segnalalo alla Polizia Postale tramite commissariatodips.it. Per addebiti non richiesti o servizi a sovrapprezzo puoi rivolgerti al tuo operatore e all\'AGCOM (agcom.it).');
    }
    if (has('invalid_length') || has('spoofing_hint')) {
      a.push('Il numero non sembra valido: potrebbe essere stato falsificato (spoofing). Non richiamarlo e diffida di chi chiama da numeri impossibili.');
    }
    a.push('Non comunicare mai al telefono codici OTP, PIN, password o dati della carta: banche, Poste e forze dell\'ordine non li chiedono mai.');
    a.push('Cerca il numero online con i link qui sotto: altre persone potrebbero averlo già segnalato.');
    // Rimuove duplicati mantenendo l'ordine
    return a.filter(function (x, i) { return a.indexOf(x) === i; });
  }

  /* =====================================================================
   * 9. LINK PER INDAGARE SUL WEB
   * ===================================================================== */

  function q(v) { return '"' + v + '"'; }

  function buildLookups(res, nationalDigits, intlDigits, isoLower) {
    var L = [];
    var enc = encodeURIComponent;
    var isIT = !res.country || res.country.code === 'IT';
    var e164 = res.e164;

    // Varianti di formato del numero, senza duplicati
    var variants = [nationalDigits, res.national, e164, res.international];
    if (intlDigits && !isIT) variants.push('00' + intlDigits);
    variants = variants.filter(function (v, i) { return v && variants.indexOf(v) === i; });
    var orQuery = variants.map(q).join(' OR ');
    var shortOr = variants.slice(0, 3).map(q).join(' OR ');

    function add(id, label, url, category, description) {
      L.push({ id: id, label: label, url: url, category: category, description: description });
    }

    // --- Motori di ricerca ---
    add('google', 'Google (tutti i formati)', 'https://www.google.com/search?q=' + enc(orQuery), 'motori',
      'Cerca il numero su Google in tutti i formati in cui può comparire (con e senza prefisso, con e senza spazi).');
    add('google_spam', 'Google: truffa o spam?', 'https://www.google.com/search?q=' + enc('(' + shortOr + ') (truffa OR spam OR molesto OR "chi chiama" OR "chi è")'), 'motori',
      'Cerca su Google pagine che associano il numero a truffe, spam o chiamate moleste.');
    add('bing', 'Bing', 'https://www.bing.com/search?q=' + enc(orQuery), 'motori',
      'Ripeti la ricerca su Bing: a volte indicizza forum e siti di segnalazione diversi da Google.');
    add('duckduckgo', 'DuckDuckGo', 'https://duckduckgo.com/?q=' + enc(orQuery), 'motori',
      'Ricerca anonima su DuckDuckGo, senza tracciamento.');

    // --- Database di segnalazioni spam ---
    if (e164) {
      add('tellows', 'Tellows', 'https://www.tellows.it/num/' + enc(isIT ? nationalDigits : '00' + intlDigits), 'spam',
        'Punteggio di affidabilità e commenti degli utenti su Tellows, uno dei più grandi archivi di numeri molesti.');
      add('chistachiamando', 'Chi sta chiamando', 'https://www.google.com/search?q=' + enc('site:chistachiamando.it ' + nationalDigits), 'spam',
        'Cerca le segnalazioni degli utenti su chistachiamando.it, sito italiano di commenti sui numeri sconosciuti.');
      add('truecaller', 'Truecaller', 'https://www.truecaller.com/search/' + enc(isoLower || 'it') + '/' + enc(nationalDigits), 'spam',
        'Mostra il nome con cui il numero è registrato dagli utenti Truecaller (richiede l\'accesso).');
      add('syncme', 'Sync.me', 'https://sync.me/search/?number=' + enc(intlDigits), 'spam',
        'Identificazione del chiamante e segnalazioni spam su Sync.me.');
      add('spam_forum', 'Segnalazioni nei forum', 'https://www.google.com/search?q=' + enc('(' + shortOr + ') (site:tellows.it OR site:chistachiamando.it OR forum OR segnalazioni)'), 'spam',
        'Raccoglie in una sola ricerca le pagine di segnalazione e le discussioni nei forum.');
    }

    // --- Social ---
    add('facebook', 'Facebook', 'https://www.facebook.com/search/top/?q=' + enc(e164 || nationalDigits), 'social',
      'Cerca su Facebook profili o pagine che pubblicano questo numero (serve l\'accesso).');
    add('linkedin', 'LinkedIn (via Google)', 'https://www.google.com/search?q=' + enc('site:linkedin.com (' + shortOr + ')'), 'social',
      'Trova aziende o professionisti su LinkedIn che indicano questo numero.');
    add('instagram', 'Instagram (via Google)', 'https://www.google.com/search?q=' + enc('site:instagram.com (' + shortOr + ')'), 'social',
      'Trova profili Instagram (spesso attività commerciali) che indicano questo numero.');

    // --- Messaggistica (solo numeri completi) ---
    if (e164 && res.lineType !== 'short') {
      add('whatsapp', 'WhatsApp', 'https://wa.me/' + intlDigits, 'messaggistica',
        'Apre una chat con il numero: senza scrivere nulla puoi vedere se ha un account, la foto e il nome del profilo (o dell\'azienda, se è WhatsApp Business).');
      add('telegram', 'Telegram', 'https://t.me/+' + intlDigits, 'messaggistica',
        'Verifica se il numero ha un account Telegram visibile pubblicamente.');
    }

    // --- Fonti ufficiali ---
    add('registro_opposizioni', 'Registro Pubblico delle Opposizioni', 'https://www.registropubblicodelleopposizioni.it/', 'ufficiali',
      'Iscrivi gratuitamente i tuoi numeri (fissi e cellulari) per opporti alle chiamate di telemarketing.');
    add('polizia_postale', 'Polizia Postale – Segnalazioni', 'https://www.commissariatodips.it/', 'ufficiali',
      'Commissariato di P.S. online: segnala truffe telefoniche e tentativi di frode.');
    add('agcom', 'AGCOM', 'https://www.agcom.it/', 'ufficiali',
      'Autorità per le Garanzie nelle Comunicazioni: tutele per addebiti non richiesti e servizi a sovrapprezzo.');
    add('garante_privacy', 'Garante Privacy', 'https://www.garanteprivacy.it/', 'ufficiali',
      'Segnala chiamate di telemarketing aggressivo o effettuate senza il tuo consenso.');
    return L;
  }

  /* =====================================================================
   * 10. ANALISI PRINCIPALE
   * ===================================================================== */

  function emptyResult(input) {
    return {
      input: input, normalized: '', valid: false, error: null, e164: null, national: null,
      international: null, country: null, lineType: 'unknown', lineTypeLabel: 'Non determinato',
      area: null, operatorHint: null, score: 50, verdict: 'neutro', verdictLabel: 'Impossibile valutare',
      signals: [], advice: [], lookups: []
    };
  }

  /**
   * Analizza un numero di telefono e ne stima tipo, provenienza e affidabilità.
   *
   * @param {string} rawInput  Numero così come incollato dall'utente
   *                           (es. "333 123 4567", "+39 06 1234567", "0039…", "tel:+44…").
   * @param {{defaultCountry?: string}} [opts]  Paese per i numeri senza prefisso (default "IT").
   * @returns {object} Result come da CONTRACT.md: formati (e164/national/international),
   *   paese, tipo di linea, area, operatore, punteggio 0..100 (100 = molto affidabile),
   *   verdetto, segnali, consigli e link di ricerca. Con input inutilizzabile `error`
   *   è valorizzato, `valid` è false e punteggio/verdetto sono neutri (50, "neutro").
   */
  function analyze(rawInput, opts) {
    var input = rawInput == null ? '' : String(rawInput);
    var defaultCountry = (opts && opts.defaultCountry ? String(opts.defaultCountry) : 'IT').toUpperCase();
    var res = emptyResult(input);

    var parsed = parseInput(input, defaultCountry);
    if (parsed.error) {
      res.error = parsed.error;
      return res;
    }

    var signals = [];
    var ctx = { known: null };
    var nationalDigits; // cifre nella forma nazionale (con lo 0 per i fissi italiani)
    var intlDigits = null; // cifre E.164 senza "+"
    var isoLower = null;

    if (parsed.assumedPrefix) {
      signals.push(signal('assumed_prefix', 'Prefisso +39 dedotto',
        'Il numero inizia con 39 senza "+" o "00": è stato interpretato come numero italiano con prefisso internazionale.', 0, 'info'));
    }

    // ---------- Determinazione del paese ----------
    var country = null;
    var nsn;
    if (parsed.national != null) {
      country = COUNTRY_BY_ISO.IT;
      nsn = parsed.national;
    } else {
      var intl = parsed.intl;
      if (!intl || intl.charAt(0) === '0') {
        res.normalized = '+' + intl;
        res.valid = false;
        signals.push(signal('spoofing_hint', 'Prefisso internazionale impossibile',
          'Nessun prefisso internazionale inizia per 0: il numero è malformato o falsificato (spoofing).', -35, 'high'));
        return finalize(res, signals, ctx, intl || '', null, null);
      }
      var found = findCountry(intl);
      if (!found) {
        res.normalized = '+' + intl;
        signals.push(signal('unknown_country', 'Prefisso internazionale sconosciuto',
          'Il prefisso non corrisponde a nessun paese: il numero potrebbe essere errato o falsificato.', -30, 'high'));
        return finalize(res, signals, ctx, intl, null, null);
      }
      country = found.country;
      nsn = intl.slice(country.dialCode.length);
      if (nsn.length < 3) {
        res.error = 'Dopo il prefisso +' + country.dialCode + ' mancano le cifre del numero.';
        return res;
      }
    }

    res.country = { code: country.code, name: country.name, flag: country.flag, dialCode: country.dialCode };

    // ---------- Italia (anche San Marino/Vaticano via +39 restano Italia) ----------
    if (country.code === 'IT') {
      var it = classifyItaly(nsn);
      ctx.known = it.known;
      nationalDigits = nsn;
      res.lineType = it.lineType;
      res.lineTypeLabel = it.lineTypeLabel;
      res.area = it.area;
      res.operatorHint = it.operatorHint;
      res.valid = it.valid;
      res.normalized = it.short ? nsn : '+39' + nsn;
      res.national = it.national;
      if (!it.short) {
        res.e164 = '+39' + nsn;
        res.international = '+39 ' + it.national;
        intlDigits = '39' + nsn;
      }
      isoLower = 'it';

      if (!it.valid) {
        signals.push(signal('invalid_length', 'Numero non valido o incompleto',
          (it.invalidReason || 'Il numero non rispetta il piano di numerazione italiano.') + ' Potrebbe essere digitato male o falsificato.', -35, 'high'));
      }

      // Numeri istituzionali/di emergenza noti
      if (it.known && it.valid) {
        if (it.known.kind === 'emergency') {
          signals.push(signal('emergency', 'Numero di emergenza', it.known.name + ': numero ufficiale di emergenza.', 35, 'info'));
        } else if (it.known.kind === 'institution') {
          signals.push(signal('institutional', 'Numero istituzionale noto', it.known.name + '. Attenzione: i truffatori possono falsificare anche questi numeri.', 30, 'info'));
        } else {
          signals.push(signal('operator_service', 'Servizio clienti di un operatore', it.known.name + '.', 20, 'info'));
        }
      }

      if (it.valid) {
        switch (it.lineType) {
          case 'mobile':
            signals.push(signal('it_mobile', 'Cellulare italiano', 'Numero mobile italiano valido: di per sé non indica rischi, ma chiunque può attivare una SIM.', 6, 'info'));
            break;
          case 'landline':
            signals.push(signal('it_landline', 'Fisso italiano', 'Numero fisso italiano valido' + (it.area ? ' (' + it.area + ')' : '') + '.', 5, 'info'));
            if (!it.known) {
              signals.push(signal('telemarketing_landline', 'Possibile call center',
                'Molti call center e operatori di telemarketing chiamano da numeri fissi, soprattutto con prefissi di grandi città come 02 (Milano) e 06 (Roma).', -3, 'info'));
            }
            break;
          case 'toll_free':
            if (!it.known) {
              signals.push(signal('toll_free', 'Numero verde',
                'I numeri verdi appartengono ad aziende ed enti: di solito il chiamante è un\'impresa reale, ma può trattarsi di marketing o recupero crediti.', -5, 'low'));
            }
            break;
          case 'shared_cost':
            signals.push(signal('shared_cost', 'Numero a costo ripartito',
              nsn.slice(0, 3) === '199'
                ? 'Numerazione 199 a tariffa specifica: richiamare costa più di una normale chiamata, soprattutto dal cellulare.'
                : 'Numerazione aziendale 840/848: se richiami paghi una parte del costo della chiamata.', -10, 'medium'));
            break;
          case 'premium':
            signals.push(signal('premium_rate', 'Numero a tariffa maggiorata',
              'Le numerazioni ' + nsn.slice(0, 3) + ' addebitano costi elevati a chi chiama: un classico delle truffe che invitano a richiamare.', -45, 'high'));
            break;
          case 'voip':
            signals.push(signal('voip', 'Numero VoIP',
              'I numeri VoIP nomadici (55) si attivano facilmente via Internet e sono usati anche per chiamate di massa.', -10, 'medium'));
            break;
          case 'm2m':
            signals.push(signal('m2m', 'SIM per dispositivi',
              'Numerazione lunga tipica di SIM dati/M2M (allarmi, POS, dispositivi): è insolito che chiami una persona.', -10, 'medium'));
            break;
          case 'short':
            if (!it.known) {
              signals.push(signal('short_number', 'Numero breve',
                nsn.charAt(0) === '4' ? 'Numerazioni 4xx usate per servizi di rete e SMS (anche a pagamento): verifica eventuali abbonamenti attivati.'
                  : 'Numero breve di servizio: non può essere un privato. Se ti chiede dati o pagamenti, diffida.', -5, 'low'));
            }
            break;
          default:
            signals.push(signal('it_special', 'Numerazione speciale',
              'Numerazione non geografica poco comune per chiamate a privati.', -10, 'medium'));
        }
        if (!it.short && !it.known) {
          var subscriber = it.lineType === 'landline' && it.area ? nsn.slice((it.area.match(/\((0\d+)\)/) || ['', ''])[1].length) : nsn.slice(3);
          signals = signals.concat(patternSignals(subscriber));
        }
      }
    } else {
      // ---------- Estero ----------
      isoLower = country.code === 'INTL' ? null : country.code.toLowerCase();
      nationalDigits = (TRUNK_ZERO[country.code] ? '0' : '') + nsn;
      intlDigits = country.dialCode + nsn;
      res.normalized = '+' + intlDigits;
      res.e164 = res.normalized;

      if (country.global) {
        res.valid = nsn.length >= 4 && nsn.length <= 12;
        res.national = groupDigits(nsn);
        res.international = '+' + country.dialCode + ' ' + groupDigits(nsn);
        res.lineType = country.global === 'intl_freephone' ? 'toll_free' : country.global === 'intl_premium' ? 'premium' : country.global === 'intl_shared' ? 'shared_cost' : 'unknown';
        res.lineTypeLabel = country.name;
        if (country.global === 'satellite') {
          signals.push(signal('satellite_network', 'Rete satellitare o internazionale',
            'I prefissi +' + country.dialCode + ' non appartengono a nessun paese: richiamarli può costare diversi euro al minuto e sono spesso usati per truffe a squillo singolo.', -40, 'high'));
        } else if (country.global === 'intl_premium') {
          signals.push(signal('intl_premium', 'Tariffa maggiorata internazionale', 'Numerazione internazionale a pagamento (+979): non richiamare.', -45, 'high'));
        } else {
          signals.push(signal('intl_service', 'Numerazione internazionale di servizio', 'Numero non geografico internazionale: insolito per una chiamata a un privato.', -15, 'medium'));
        }
      } else {
        var fr = classifyForeign(country.code, nsn);
        var fmt = formatForeign(country, nsn);
        res.valid = fr.valid;
        res.lineType = fr.lineType;
        res.lineTypeLabel = fr.lineTypeLabel;
        res.area = fr.area;
        res.national = fmt.national;
        res.international = fmt.international;

        if (!fr.valid) {
          signals.push(signal('invalid_length', 'Numero non valido o incompleto',
            (fr.invalidReason || 'Lunghezza non plausibile.') + ' Potrebbe essere digitato male o falsificato.', -35, 'high'));
        }

        if (WANGIRI[country.code]) {
          signals.push(signal('wangiri_country', 'Prefisso a rischio truffa "wangiri"',
            country.name + ' (+' + (country.dialCode === '1' ? '1 ' + nsn.slice(0, 3) : country.dialCode) + ') è tra i prefissi più segnalati per le truffe a squillo singolo: ti chiamano per un secondo sperando che richiami un numero internazionale costoso.' +
            (country.dialCode === '1' ? ' Attenzione: anche se inizia con +1 non è un numero degli Stati Uniti.' : ''), -40, 'high'));
        } else if (CALLCENTER_COUNTRIES[country.code] <= -10) {
          signals.push(signal('foreign_number', 'Numero estero', 'Chiamata da ' + country.name + ': se non hai contatti lì, è insolita.', -15, 'medium'));
        } else {
          signals.push(signal('foreign_number', 'Numero estero',
            'Chiamata da ' + country.name + ': se non conosci nessuno in questo paese, è insolita. Richiamare ha costi internazionali.', -12, 'low'));
        }
        if (Object.prototype.hasOwnProperty.call(CALLCENTER_COUNTRIES, country.code)) {
          signals.push(signal('callcenter_country', 'Paese di call center in lingua italiana',
            'Da ' + country.name + ' operano molti call center che chiamano clienti italiani (offerte di luce, gas, telefonia), spesso con modalità aggressive.',
            CALLCENTER_COUNTRIES[country.code], CALLCENTER_COUNTRIES[country.code] <= -10 ? 'medium' : CALLCENTER_COUNTRIES[country.code] < 0 ? 'low' : 'info'));
        }
        if (fr.lineType === 'premium') {
          signals.push(signal('premium_rate', 'Numero a tariffa maggiorata', 'Numero estero a pagamento: non richiamare.', -40, 'high'));
        } else if (fr.lineType === 'mobile' && fr.valid && !WANGIRI[country.code]) {
          signals.push(signal('foreign_mobile', 'Cellulare estero', 'Numero mobile valido di ' + country.name + '.', 2, 'info'));
        }
        if (fr.valid) signals = signals.concat(patternSignals(nsn.slice(-7)));
      }
    }

    return finalize(res, signals, ctx, nationalDigits, intlDigits, isoLower);
  }

  /** Calcola punteggio e verdetto, aggiunge consigli e link. */
  function finalize(res, signals, ctx, nationalDigits, intlDigits, isoLower) {
    var score = BASE_SCORE;
    for (var i = 0; i < signals.length; i++) score += signals[i].impact;
    res.signals = signals;
    res.score = Math.round(clamp(score, 0, 100));
    res.verdict = verdictOf(res.score);
    res.verdictLabel = VERDICT_LABELS[res.verdict];
    if (!res.national && nationalDigits) res.national = nationalDigits;
    res.advice = buildAdvice(res, ctx);
    var nd = nationalDigits || res.normalized.replace(/\D/g, '');
    res.lookups = nd.length >= 3 ? buildLookups(res, nd, intlDigits, isoLower) : [];
    return res;
  }

  return {
    version: VERSION,
    analyze: analyze
  };
});
