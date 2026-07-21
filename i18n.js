// UI strings for all pages. Replaces chrome.i18n from the extension: same
// $1-style substitution, so the ported report code works unchanged.
//
// The metering vocabulary is taken verbatim from the extension's
// _locales/{en,de}/messages.json; the legal bodies are taken verbatim from
// the V-Checker site.

const LANG_KEY = 'lufsly-lang';

const EN = {
  appName: 'LUFSly – Loudness Meter',
  tagline: 'Measure LUFS, True Peak and dynamic range of your audio files — right in your browser.',
  privacyNote: 'Your files never leave your device. No upload, no account, no tracking.',

  // ---- drop zone ----
  dropTitle: 'Drop audio files here',
  dropSub: 'or click to choose files',
  dropFormats: 'WAV, MP3, FLAC, M4A, OGG — whatever your browser can decode. Several files at once are fine.',
  dropOverlay: 'Drop the files to analyze them',
  analyzing: 'Analyzing $NAME$… $PCT$ %',
  decoding: 'Decoding $NAME$…',
  queueWaiting: '$N$ more waiting',
  decodeError: 'Could not decode this file.',

  // ---- targets ----
  targetsTitle: 'Targets',
  targetsHint: 'Your targets are saved in this browser and applied to every analysis. Changing them re-scores results instantly.',
  presetLabel: 'Target',
  presetPodcast: 'Podcast (−16 LUFS)',
  presetStreaming: 'Streaming (−14 LUFS)',
  presetBroadcast: 'Broadcast EBU R128 (−23 LUFS)',
  presetNone: 'None',
  presetCustom: 'Custom',
  customTarget: 'Loudness target',
  toleranceLabel: 'Tolerance',
  drTargetLabel: 'Dynamic range target',
  drTargetAuto: 'Automatic (from target)',
  drTargetCustom: 'Custom',
  drCustomValue: 'Target LRA',
  tpLimitLabel: 'True Peak limit',
  noTarget: 'No target set',
  resetTargets: 'Reset to defaults',

  // ---- queue ----
  queueTitle: 'Analyzed files',
  queueHint: 'Click a file to see its full report.',
  colFile: 'File',
  colIntegrated: 'Integrated',
  colTruePeak: 'True Peak',
  colLra: 'LRA',
  clearQueue: 'Clear all',
  removeFile: 'Remove',
  queueEmpty: 'No files analyzed yet.',

  // ---- metrics ----
  momentaryMax: 'Momentary (max)',
  shortTermMax: 'Short-term (max)',
  integrated: 'Integrated',
  truePeak: 'True Peak',
  truePeakMax: 'True Peak (max)',
  lra: 'Loudness Range (LRA)',
  plr: 'PLR (Peak to Loudness)',
  duration: 'Duration',
  sampleRate: 'Sample rate',
  channels: 'Channels',
  codec: 'Codec',
  encoder: 'Encoder',
  metaTitle: 'File metadata',
  metaTitleField: 'Title',
  metaArtist: 'Artist',
  metaAlbum: 'Album',
  metaDate: 'Date',
  metaGenre: 'Genre',
  metaComment: 'Comment',
  metaFileDate: 'File modified',

  infoIntegrated: 'Average loudness of the whole program (gated). This is the value to match your target.',
  infoTruePeak: 'Highest signal peak including inter-sample peaks (4× oversampled), in dBTP. Above −1 dBTP it risks clipping.',
  infoLra: 'Loudness Range: how much the loudness varies between the quiet and loud parts.',
  infoPlr: 'Peak minus integrated loudness – shows how much dynamic headroom is left / how compressed the audio is.',
  infoMomentaryMax: 'The loudest 400 ms anywhere in the file. Reveals brief loudness spikes that the integrated value averages away.',
  infoShortTermMax: 'The loudest 3-second stretch anywhere in the file – a good check for passages that jump well above your target.',
  infoCodec: 'The audio format read from the file itself, not from its extension. Lossy formats were already re-encoded once, so a peak above the limit may come from the encoder rather than the mix.',

  // ---- verdicts ----
  tooQuiet: 'Too quiet ($DIFF$ LU below target)',
  justRight: 'Just right for the target',
  tooLoud: 'Too loud ($DIFF$ LU above target)',
  drVeryLow: 'Very little dynamics',
  drLow: 'Little dynamics',
  drNormal: 'Normal',
  drMore: 'Rather high',
  drOk: 'Okay',
  drGood: 'Good dynamics',
  drVeryHigh: 'Very high',
  drOnTarget: 'On target',
  drBelowTarget: 'Below target',
  drAboveTarget: 'Above target',
  peakOkVerdict: 'OK ($VAL$ dBTP)',
  peakClippedVerdict: 'clipped ($VAL$ dBTP – reduce level!)',

  // ---- report ----
  reportTitle: 'Analysis report',
  reportVerdictLoudness: 'Loudness vs. target ($TARGET$ LUFS): $VERDICT$',
  reportVerdictPeak: 'Peak: $VERDICT$',
  reportVerdictDr: 'Dynamics: $VERDICT$',
  loudnessHistory: 'Short-term loudness over time',
  peakHistory: 'True Peak over time',
  drHistory: 'Dynamic range (LRA) over time',
  clipTimes: 'Over $LIMIT$ dBTP at $TIMES$',
  clipMore: '(+$N$ more)',
  dynamicsTitle: 'Dynamic range',
  copyReport: 'Copy',
  savePng: 'Save PNG',
  savePdf: 'Save PDF',
  copied: 'Copied!',
  saved: 'Saved!',
  closeReport: 'Close',

  // ---- how it works ----
  howTitle: 'How it works',
  howStep1: 'Drop one or more audio files onto the page, or click the box to pick them.',
  howStep2: 'Everything is decoded and measured locally in your browser — nothing is uploaded.',
  howStep3: 'Set your target above. Podcast is −16 LUFS, streaming −14 LUFS, EBU R128 broadcast −23 LUFS.',
  howStep4: 'Open a file from the list to see its full report, then copy it or save it as PNG or PDF.',
  standardsNote: 'Measurement follows ITU-R BS.1770-4 / EBU R128 — K-weighting, two-stage gating, and a 4× oversampled True Peak meter, the same engine as the <a href="https://github.com/Macusercom/lufsly-extension" target="_blank" rel="noopener">LUFSly Chrome extension</a>.',

  // ---- chrome ----
  footerSource: 'Source code',
  footerExtension: 'Chrome extension',
  footerPrivacy: 'Privacy Policy',
  footerImprint: 'Imprint',
  footerCopyright: '© 2026 Macusercom',
  backToApp: '← Back to the app',
  backToLUFSly: '← Back to LUFSly',
  imprintTitle: 'Legal Notice',
  privacyTitle: 'Privacy Policy',
  imprintPageTitle: 'Imprint – LUFSly',
  privacyPageTitle: 'Privacy – LUFSly',
  indexPageTitle: 'LUFSly – LUFS, True Peak & Dynamic Range Analyzer',
};

const DE = {
  appName: 'LUFSly – Loudness Meter',
  tagline: 'LUFS, True Peak und Dynamikumfang deiner Audiodateien messen — direkt im Browser.',
  privacyNote: 'Deine Dateien verlassen dein Gerät nicht. Kein Upload, kein Konto, kein Tracking.',

  dropTitle: 'Audiodateien hierher ziehen',
  dropSub: 'oder klicken, um Dateien auszuwählen',
  dropFormats: 'WAV, MP3, FLAC, M4A, OGG — alles, was dein Browser dekodieren kann. Mehrere Dateien gleichzeitig sind möglich.',
  dropOverlay: 'Dateien loslassen, um sie zu analysieren',
  analyzing: 'Analysiere $NAME$… $PCT$ %',
  decoding: 'Dekodiere $NAME$…',
  queueWaiting: 'noch $N$ in der Warteschlange',
  decodeError: 'Diese Datei konnte nicht dekodiert werden.',

  targetsTitle: 'Ziele',
  targetsHint: 'Deine Ziele werden in diesem Browser gespeichert und auf jede Analyse angewendet. Änderungen werden sofort neu bewertet.',
  presetLabel: 'Ziel',
  presetPodcast: 'Podcast (−16 LUFS)',
  presetStreaming: 'Streaming (−14 LUFS)',
  presetBroadcast: 'Broadcast EBU R128 (−23 LUFS)',
  presetNone: 'Keines',
  presetCustom: 'Eigenes',
  customTarget: 'Lautheitsziel',
  toleranceLabel: 'Toleranz',
  drTargetLabel: 'Dynamikziel',
  drTargetAuto: 'Automatisch (aus dem Ziel)',
  drTargetCustom: 'Eigenes',
  drCustomValue: 'Ziel-LRA',
  tpLimitLabel: 'True-Peak-Limit',
  noTarget: 'Kein Ziel gesetzt',
  resetTargets: 'Auf Standard zurücksetzen',

  queueTitle: 'Analysierte Dateien',
  queueHint: 'Auf eine Datei klicken, um den vollständigen Bericht zu sehen.',
  colFile: 'Datei',
  colIntegrated: 'Integrated',
  colTruePeak: 'True Peak',
  colLra: 'LRA',
  clearQueue: 'Alle entfernen',
  removeFile: 'Entfernen',
  queueEmpty: 'Noch keine Dateien analysiert.',

  momentaryMax: 'Momentary (max)',
  shortTermMax: 'Short-Term (max)',
  integrated: 'Integrated',
  truePeak: 'True Peak',
  truePeakMax: 'True Peak (max)',
  lra: 'Loudness Range (LRA)',
  plr: 'PLR (Peak zu Loudness)',
  duration: 'Dauer',
  sampleRate: 'Abtastrate',
  channels: 'Kanäle',
  codec: 'Codec',
  encoder: 'Encoder',
  metaTitle: 'Datei-Metadaten',
  metaTitleField: 'Titel',
  metaArtist: 'Interpret',
  metaAlbum: 'Album',
  metaDate: 'Datum',
  metaGenre: 'Genre',
  metaComment: 'Kommentar',
  metaFileDate: 'Datei geändert',

  infoIntegrated: 'Durchschnittliche Lautheit des gesamten Programms (gegated). Dieser Wert sollte deinem Ziel entsprechen.',
  infoTruePeak: 'Höchster Signalpegel inkl. Zwischenabtastwerten (4× oversampled), in dBTP. Über −1 dBTP droht Clipping.',
  infoLra: 'Loudness Range: wie stark die Lautheit zwischen leisen und lauten Stellen schwankt.',
  infoPlr: 'Peak minus integrierte Lautheit – zeigt, wie viel Dynamik-Reserve bleibt bzw. wie stark komprimiert wurde.',
  infoMomentaryMax: 'Die lautesten 400 ms der gesamten Datei. Zeigt kurze Lautheitsspitzen, die im integrierten Wert untergehen.',
  infoShortTermMax: 'Die lautesten 3 Sekunden der gesamten Datei – gut geeignet, um Passagen zu finden, die deutlich über dem Ziel liegen.',
  infoCodec: 'Das Audioformat, gelesen aus der Datei selbst, nicht aus der Dateiendung. Verlustbehaftete Formate wurden bereits einmal neu kodiert – ein Peak über dem Limit kann daher vom Encoder statt vom Mix stammen.',

  tooQuiet: 'Zu leise ($DIFF$ LU unter dem Ziel)',
  justRight: 'Genau richtig für das Ziel',
  tooLoud: 'Zu laut ($DIFF$ LU über dem Ziel)',
  drVeryLow: 'Sehr wenig Dynamik',
  drLow: 'Wenig Dynamik',
  drNormal: 'Normal',
  drMore: 'Eher viel',
  drOk: 'In Ordnung',
  drGood: 'Gute Dynamik',
  drVeryHigh: 'Sehr viel',
  drOnTarget: 'Am Ziel',
  drBelowTarget: 'Unter dem Ziel',
  drAboveTarget: 'Über dem Ziel',
  peakOkVerdict: 'OK ($VAL$ dBTP)',
  peakClippedVerdict: 'geclippt ($VAL$ dBTP – Pegel reduzieren!)',

  reportTitle: 'Analysebericht',
  reportVerdictLoudness: 'Lautheit vs. Ziel ($TARGET$ LUFS): $VERDICT$',
  reportVerdictPeak: 'Peak: $VERDICT$',
  reportVerdictDr: 'Dynamik: $VERDICT$',
  loudnessHistory: 'Short-Term-Lautheit über die Zeit',
  peakHistory: 'True Peak über die Zeit',
  drHistory: 'Dynamikumfang (LRA) über die Zeit',
  clipTimes: 'Über $LIMIT$ dBTP bei $TIMES$',
  clipMore: '(+$N$ weitere)',
  dynamicsTitle: 'Dynamikumfang',
  copyReport: 'Kopieren',
  savePng: 'Als PNG',
  savePdf: 'Als PDF',
  copied: 'Kopiert!',
  saved: 'Gespeichert!',
  closeReport: 'Schließen',

  howTitle: 'So funktioniert’s',
  howStep1: 'Ziehe eine oder mehrere Audiodateien auf die Seite oder klicke auf das Feld, um sie auszuwählen.',
  howStep2: 'Alles wird lokal im Browser dekodiert und gemessen — es wird nichts hochgeladen.',
  howStep3: 'Stelle oben dein Ziel ein. Podcast sind −16 LUFS, Streaming −14 LUFS, EBU-R128-Broadcast −23 LUFS.',
  howStep4: 'Öffne eine Datei aus der Liste, um den vollständigen Bericht zu sehen, und kopiere ihn oder speichere ihn als PNG oder PDF.',
  standardsNote: 'Die Messung folgt ITU-R BS.1770-4 / EBU R128 — K-Weighting, zweistufiges Gating und ein 4× oversampeltes True-Peak-Meter, dieselbe Engine wie in der <a href="https://github.com/Macusercom/lufsly-extension" target="_blank" rel="noopener">LUFSly-Chrome-Erweiterung</a>.',

  footerSource: 'Quellcode',
  footerExtension: 'Chrome-Erweiterung',
  footerPrivacy: 'Datenschutz',
  footerCopyright: '© 2026 Macusercom',
  footerImprint: 'Impressum',
  backToApp: '← Zurück zur App',
  backToLUFSly: '← Zurück zu LUFSly',
  imprintTitle: 'Impressum',
  privacyTitle: 'Datenschutzerklärung',
  imprintPageTitle: 'Impressum – LUFSly',
  privacyPageTitle: 'Datenschutz – LUFSly',
  indexPageTitle: 'LUFSly – LUFS-, True-Peak- & Dynamik-Analyse',
};

// ---------------------------------------------------------------------------
// Legal bodies. Text taken verbatim from the V-Checker site.
// ---------------------------------------------------------------------------

DE.imprintBody = `
<h4>Impressum</h4>
<p><b>Informationen und Offenlegung gemäß §5 (1) ECG, § 25 MedienG, § 63 GewO und § 14 UGB</b></p>
<p><b>Webseitenbetreiber:</b> Christoph Neuwirth</p>
<p><b>Anschrift:</b> Breitenfurterstraße 394/9, 1230 Wien</p>
<p><b>UID-Nr:</b> <br><b>Gewerbeaufsichtbehörde:</b> <br><b>Mitgliedschaften:</b></p>
<p><b>Kontaktdaten:</b><br>Telefon: +43 681 10784594<br>Email: hi2026 [at] christoph [strich] neuwirth [punkt] at<br>Fax:</p>
<p><b>Anwendbare Rechtsvorschrift:</b> www.ris.bka.gv.at <br><b>Berufsbezeichnung:</b></p>
<p><b>Online Streitbeilegung:</b> Verbraucher, welche in Österreich oder in einem sonstigen Vertragsstaat der ODR-VO niedergelassen sind, haben die Möglichkeit Probleme bezüglich dem entgeltlichen Kauf von Waren oder Dienstleistungen im Rahmen einer Online-Streitbeilegung (nach OS, AStG) zu lösen. Die Europäische Kommission stellt eine Plattform hierfür bereit: https://ec.europa.eu/consumers/odr</p>
<p><b>Urheberrecht:</b> Die Inhalte dieser Webseite unterliegen, soweit dies rechtlich möglich ist, diversen Schutzrechten (z.B dem Urheberrecht). Jegliche Verwendung/Verbreitung von bereitgestelltem Material, welche urheberrechtlich untersagt ist, bedarf schriftlicher Zustimmung des Webseitenbetreibers.</p>
<p><b>Haftungsausschluss:</b> Trotz sorgfältiger inhaltlicher Kontrolle übernimmt der Webseitenbetreiber dieser Webseite keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich. Sollten Sie dennoch auf ausgehende Links aufmerksam werden, welche auf eine Webseite mit rechtswidriger Tätigkeit/Information verweisen, ersuchen wir um dementsprechenden Hinweis, um diese nach § 17 Abs. 2 ECG umgehend zu entfernen.<br>Die Urheberrechte Dritter werden vom Betreiber dieser Webseite mit größter Sorgfalt beachtet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden derartiger Rechtsverletzungen werden wir den betroffenen Inhalt umgehend entfernen.</p>
<p><span>Rechtstext von </span>Quelle: fairesRecht.at in Kooperation mit <b><a href="https://kredit123.at/">Immobilienkredit Vergleich</a></b></p>`;

EN.imprintBody = `
<h4>Legal Notice</h4>
<p><b>Information and disclosure pursuant to §5 (1) ECG, §25 Media Act, §63 Trade Regulation Act and §14 UGB</b></p>
<p><b>Website operator:</b> Christoph Neuwirth</p>
<p><b>Address:</b> Breitenfurterstraße 394/9, 1230 Vienna, Austria</p>
<p><b>VAT ID No.:</b> <br><b>Trade supervisory authority:</b> <br><b>Memberships:</b></p>
<p><b>Contact details:</b><br>Telephone: +43 681 10784594<br>Email: hi2026 [at] christoph [strich] neuwirth [punkt] at<br>Fax:</p>
<p><b>Applicable legal provision:</b> www.ris.bka.gv.at <br><b>Professional title:</b></p>
<p><b>Online dispute resolution:</b> Consumers established in Austria or in another contracting state of the ODR Regulation have the option of resolving problems concerning the paid purchase of goods or services through online dispute resolution (under OS, AStG). The European Commission provides a platform for this: https://ec.europa.eu/consumers/odr</p>
<p><b>Copyright:</b> The contents of this website are subject, insofar as legally possible, to various protective rights (e.g. copyright). Any use/distribution of provided material that is prohibited by copyright requires the written consent of the website operator.</p>
<p><b>Disclaimer:</b> Despite careful content control, the website operator of this website assumes no liability for the content of external links. The operators of the linked pages are solely responsible for their content. Should you nevertheless become aware of outgoing links that refer to a website with unlawful activity/information, we request an appropriate notice so that these can be removed immediately in accordance with § 17 para. 2 ECG.<br>The copyrights of third parties are observed with the greatest care by the operator of this website. Should you nevertheless become aware of a copyright infringement, we ask for an appropriate notice. If such legal infringements become known, we will remove the affected content immediately.</p>
<p><span>Legal text from source: </span>fairesRecht.at in cooperation with <b><a href="https://kredit123.at/">Immobilienkredit Vergleich</a></b></p>`;

DE.privacyBody = `
<h3>Erklärung zur Informationspflicht</h3>
<p><strong>Datenschutzerklärung</strong></p>
<p>In folgender Datenschutzerklärung informieren wir Sie über die wichtigsten Aspekte der Datenverarbeitung im Rahmen unserer Webseite. Wir erheben und verarbeiten personenbezogene Daten nur auf Grundlage der gesetzlichen Bestimmungen (Datenschutzgrundverordnung, Telekommunikationsgesetz 2003).</p>
<p>Sobald Sie als Benutzer auf unsere Webseite zugreifen oder diese besuchen wird Ihre IP-Adresse, Beginn sowie Beginn und Ende der Sitzung erfasst. Dies ist technisch bedingt und stellt somit ein berechtigtes Interesse iSv Art 6 Abs 1 lit f DSGVO.</p>
<h5>Kontakt mit uns</h5>
<p>Wenn Sie uns, entweder über unser Kontaktformular auf unserer Webseite, oder per Email kontaktieren, dann werden die von Ihnen an uns übermittelten Daten zwecks Bearbeitung Ihrer Anfrage oder für den Fall von weiteren Anschlussfragen für sechs Monate bei uns gespeichert. Es erfolgt, ohne Ihre Einwilligung, keine Weitergabe Ihrer übermittelten Daten.</p>
<h5>Cookies</h5>
<p>Unsere Website verwendet so genannte Cookies. Dabei handelt es sich um kleine Textdateien, die mit Hilfe des Browsers auf Ihrem Endgerät abgelegt werden. Sie richten keinen Schaden an. Wir nutzen Cookies dazu, unser Angebot nutzerfreundlich zu gestalten. Einige Cookies bleiben auf Ihrem Endgerät gespeichert, bis Sie diese löschen. Sie ermöglichen es uns, Ihren Browser beim nächsten Besuch wiederzuerkennen. Wenn Sie dies nicht wünschen, so können Sie Ihren Browser so einrichten, dass er Sie über das Setzen von Cookies informiert und Sie dies nur im Einzelfall erlauben. Bei der Deaktivierung von Cookies kann die Funktionalität unserer Website eingeschränkt sein.</p>
<h5>Google Fonts</h5>
<p>Unsere Website verwendet Schriftarten von „Google Fonts". Der Dienstanbieter dieser Funktion ist:</p>
<ul><li>Google Ireland Limited Gordon House, Barrow Street Dublin 4. Ireland</li></ul>
<p>Tel: +353 1 543 1000</p>
<p>Beim Aufrufen dieser Webseite lädt Ihr Browser Schriftarten und speichert diese in den Cache. Da Sie, als Besucher der Webseite, Daten des Dienstanbieters empfangen kann Google unter Umständen Cookies auf Ihrem Rechner setzen oder analysieren.</p>
<p>Die Nutzung von „Google-Fonts" dient der Optimierung unserer Dienstleistung und der einheitlichen Darstellung von Inhalten. Dies stellt ein berechtigtes Interesse im Sinne von Art. 6 Abs. 1 lit. f DSGVO dar.</p>
<p>Weitere Informationen zu Google Fonts erhalten Sie unter folgendem Link:</p>
<ul><li><a href="https://developers.google.com/fonts/faq">https://developers.google.com/fonts/faq</a></li></ul>
<p>Weitere Informationen über den Umgang mit Nutzerdaten von Google können Sie der Datenschutzerklärung entnehmen:</p>
<ul><li><a href="https://policies.google.com/privacy?hl=de">https://policies.google.com/privacy?hl=de</a></li></ul>
<p>Google verarbeitet die Daten auch in den USA, hat sich jedoch dem<br>EU-US Privacy-Shield unterworfen.</p>
<p><a href="https://www.privacyshield.gov/EU-US-Framework">https://www.privacyshield.gov/EU-US-Framework</a></p>
<h5>Server-Log Files</h5>
<p>Diese Webseite und der damit verbundene Provider erhebt im Zuge der Webseitennutzung automatisch Informationen im Rahmen sogenannter „Server-Log Files". Dies betrifft insbesondere:</p>
<ul>
  <li>IP-Adresse oder Hostname</li>
  <li>den verwendeten Browser</li>
  <li>Aufenthaltsdauer auf der Webseite sowie Datum und Uhrzeit</li>
  <li>aufgerufene Seiten der Webseite</li>
  <li>Spracheinstellungen und Betriebssystem</li>
  <li>„Leaving-Page" (auf welcher URL hat der Benutzer die Webseite verlassen)</li>
  <li>ISP (Internet Service Provider)</li>
</ul>
<p>Diese erhobenen Informationen werden nicht personenbezogen verarbeitet oder mit personenbezogenen Daten in Verbindung gebracht.</p>
<p>Der Webseitenbetreiber behält es sich vor, im Falle von Bekanntwerden rechtswidriger Tätigkeiten, diese Daten auszuwerten oder zu überprüfen.</p>
<h5>Ihre Rechte als Betroffener</h5>
<p>Sie als Betroffener haben bezüglich Ihrer Daten, welche bei uns gespeichert sind grundsätzlich ein Recht auf:</p>
<ul>
  <li>Auskunft</li>
  <li>Löschung der Daten</li>
  <li>Berichtigung der Daten</li>
  <li>Übertragbarkeit der Daten</li>
  <li>Wiederruf und Widerspruch zur Datenverarbeitung</li>
  <li>Einschränkung</li>
</ul>
<p>Wenn sie vermuten, dass im Zuge der Verarbeitung Ihrer Daten Verstöße gegen das Datenschutzrecht passiert sind, so haben Sie die Möglichkeit sich bei uns (hi2026 [at] christoph [strich] neuwirth [punkt] at) oder der Datenschutzbehörde zu beschweren.</p>
<h5>Sie erreichen uns unter folgenden Kontaktdaten:</h5>
<p><b>Webseitenbetreiber:</b> Christoph Neuwirth<br><b>Telefonnummer:</b> +43 681 10784594<br><b>Email:</b> hi2026 [at] christoph [strich] neuwirth [punkt] at</p>
<p><span>Rechtstext von </span>Quelle: fairesRecht.at in Kooperation mit <b><a href="https://kredit123.at/immobilienkredit-finanzierung-vergleich-rechner">Immobilienkredit Rechner</a></b></p>`;

EN.privacyBody = `
<h3>Declaration on the Duty to Provide Information</h3>
<p><strong>Privacy Policy</strong></p>
<p>In the following privacy policy, we inform you about the most important aspects of data processing within the scope of our website. We collect and process personal data only on the basis of the statutory provisions (General Data Protection Regulation, Telecommunications Act 2003).</p>
<p>As soon as you, as a user, access or visit our website, your IP address, start time, as well as the beginning and end of the session are recorded. This is technically necessary and therefore constitutes a legitimate interest within the meaning of Art. 6 para. 1 lit. f GDPR.</p>
<h5>Contacting us</h5>
<p>If you contact us, either via our contact form on our website or by email, the data you transmit to us will be stored by us for six months for the purpose of processing your inquiry or in case of further follow-up questions. Your transmitted data will not be passed on without your consent.</p>
<h5>Cookies</h5>
<p>Our website uses so-called cookies. These are small text files that are stored on your device with the help of the browser. They do not cause any damage. We use cookies to make our offer user-friendly. Some cookies remain stored on your device until you delete them. They enable us to recognize your browser on your next visit. If you do not want this, you can set your browser so that it informs you about the setting of cookies and you only allow this in individual cases. If cookies are disabled, the functionality of our website may be limited.</p>
<h5>Google Fonts</h5>
<p>Our website uses fonts from "Google Fonts". The service provider of this function is:</p>
<ul><li>Google Ireland Limited Gordon House, Barrow Street Dublin 4. Ireland</li></ul>
<p>Tel: +353 1 543 1000</p>
<p>When this website is accessed, your browser loads fonts and stores them in the cache. Since you, as a visitor to the website, receive data from the service provider, Google may, under certain circumstances, set or analyze cookies on your computer.</p>
<p>The use of "Google Fonts" serves to optimize our service and to present content uniformly. This constitutes a legitimate interest within the meaning of Art. 6 para. 1 lit. f GDPR.</p>
<p>Further information about Google Fonts can be found at the following link:</p>
<ul><li><a href="https://developers.google.com/fonts/faq">https://developers.google.com/fonts/faq</a></li></ul>
<p>Further information about Google's handling of user data can be found in the privacy policy:</p>
<ul><li><a href="https://policies.google.com/privacy?hl=de">https://policies.google.com/privacy?hl=de</a></li></ul>
<p>Google also processes data in the USA, but has submitted to the<br>EU-US Privacy Shield.</p>
<p><a href="https://www.privacyshield.gov/EU-US-Framework">https://www.privacyshield.gov/EU-US-Framework</a></p>
<h5>Server Log Files</h5>
<p>This website and the associated provider automatically collect information in the course of website use within the scope of so-called "server log files". This particularly concerns:</p>
<ul>
  <li>IP address or hostname</li>
  <li>the browser used</li>
  <li>duration of stay on the website as well as date and time</li>
  <li>pages of the website accessed</li>
  <li>language settings and operating system</li>
  <li>"Leaving page" (the URL on which the user left the website)</li>
  <li>ISP (Internet Service Provider)</li>
</ul>
<p>This collected information is not processed in a personal manner or linked to personal data.</p>
<p>The website operator reserves the right, in the event that unlawful activities become known, to evaluate or check this data.</p>
<h5>Your rights as a data subject</h5>
<p>As a data subject, you generally have the following rights regarding your data stored by us:</p>
<ul>
  <li>Information</li>
  <li>Deletion of the data</li>
  <li>Correction of the data</li>
  <li>Data portability</li>
  <li>Withdrawal and objection to data processing</li>
  <li>Restriction</li>
</ul>
<p>If you suspect that violations of data protection law have occurred in the course of processing your data, you have the option to complain to us (hi2026 [at] christoph [strich] neuwirth [punkt] at) or to the data protection authority.</p>
<h5>You can reach us at the following contact details:</h5>
<p><b>Website operator:</b> Christoph Neuwirth<br><b>Telephone number:</b> +43 681 10784594<br><b>Email:</b> hi2026 [at] christoph [strich] neuwirth [punkt] at</p>
<p><span>Legal text from source: </span>fairesRecht.at in cooperation with <b><a href="https://kredit123.at/">Immobilienkredit Vergleich</a></b></p>`;

const STRINGS = { en: EN, de: DE };

let lang = 'en';
const listeners = [];

// Same substitution contract as chrome.i18n.getMessage: $NAME$ placeholders
// are filled positionally from `subs`.
export function msg(key, subs) {
  const raw = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!subs) return raw;
  const list = Array.isArray(subs) ? subs : [subs];
  let i = 0;
  return raw.replace(/\$[A-Z_]+\$/g, () => (i < list.length ? String(list[i++]) : ''));
}

export function getLang() {
  return lang;
}

export function onLangChange(cb) {
  listeners.push(cb);
}

export function applyLang(next) {
  lang = next === 'de' ? 'de' : 'en';
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  document.documentElement.lang = lang;

  const titleKey = document.body.dataset.titleKey;
  if (titleKey) document.title = msg(titleKey);

  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = msg(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = msg(el.dataset.i18nHtml);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = msg(el.dataset.i18nPlaceholder);
  }
  // Inline inputs sit under their select's label, so they carry their own name.
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    const text = msg(el.dataset.i18nAria);
    el.setAttribute('aria-label', text);
    el.title = text;
  }
  // Info icons: native tooltip via title, plus a11y labelling.
  for (const el of document.querySelectorAll('[data-info]')) {
    const text = msg(el.dataset.info);
    el.title = text;
    el.setAttribute('aria-label', text);
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'img');
  }
  for (const btn of document.querySelectorAll('[data-lang]')) {
    btn.classList.toggle('active', btn.dataset.lang === lang);
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  }
  for (const cb of listeners) cb(lang);
}

// Wires the DE/EN buttons and restores the stored choice, defaulting to the
// browser language.
export function initLang() {
  let stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch {}
  const initial = stored === 'de' || stored === 'en'
    ? stored
    : (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
  for (const btn of document.querySelectorAll('[data-lang]')) {
    btn.addEventListener('click', () => applyLang(btn.dataset.lang));
  }
  applyLang(initial);
}
