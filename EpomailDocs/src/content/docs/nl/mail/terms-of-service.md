---
title: Servicevoorwaarden (Terms of Service)
description: Servicevoorwaarden van EpoCanvas Mail — accountregels, grenzen van acceptabel gebruik, rechten op inhoud, garantieuitsluitingen en toelichting op de open-sourcelicentie die u moet kennen voordat u de maildienst gebruikt.
---

# Servicevoorwaarden

**Ingangsdatum: 27 september 2026　|　Versie: 1.0**

Welkom bij EpoCanvas Mail (de "Dienst"). Deze voorwaarden vormen de overeenkomst tussen u en de beheerder van de Dienst over het gebruik ervan. Neem een paar minuten de tijd — we houden de taal zo eenvoudig mogelijk en zetten op één plek uiteen wat u mag doen, wat niet is toegestaan en wat er gebeurt als er iets misgaat.

:::note[Samenvatting in 30 seconden]
- **Wat de Dienst is**: een open-source (MIT-licentie), zelf te hosten maildienst volledig op Cloudflare; u kunt er e-mail mee versturen en ontvangen, meerdere mailboxen beheren en bijlagen uitwisselen.
- **Uw account, uw verantwoordelijkheid**: bewaar uw wachtwoord goed en zet tweestapsverificatie aan; 5 opeenvolgende mislukte aanmeldingen blokkeren het account 12 uur.
- **De rode lijn**: geen spam, geen illegale inhoud, geen aanvallen op de dienst of anderen. Overtredingen kunnen leiden tot blokkades en verwijdering van het account.
- **Uw mail is van u**: we verwerken haar alleen om te bezorgen en op te slaan. De prullenbak wordt 7 dagen na verwijdering fysiek geleegd — exporteer eerst voordat u vaarwel zegt.
- **De Dienst wordt "as is" geleverd**: open-sourcesoftware, beschikbaarheid naar beste vermogen, geen service-level agreement (SLA).
:::

## 1. Toepassingsgebied en definities

- **"De Dienst"**: alle functionaliteit die draait op een bepaalde EpoCanvas Mail-instantie, inclusief de webapp, de open API en verwante onderdelen.
- **"De beheerder / wij"**: de persoon of het team dat de instantie die u gebruikt heeft geïmplementeerd en beheert. Voor de gehoste instantie `mail.epocanvas.com` is dat het EpoCanvas-operationsteam; voor een zelfgehoste instantie is dat degene die haar heeft geïmplementeerd.
- **"U"**: iedere natuurlijke persoon of organisatie die zich registreert, inlogt of de Dienst anderszins gebruikt.
- **Dubbele toepasbaarheid**: EpoCanvas Mail is open-sourcesoftware en iedereen kan een eigen instantie draaien. Deze voorwaarden zijn een **algemene sjabloon**: gehoste instanties passen ze direct toe, en zelfhostende beheerders kunnen ze aanpassen als voorwaarden van hun site. Waar u ook registreert: u sluit de overeenkomst met de beheerder van die site.

## 2. Overzicht van de Dienst

![Diagram van verantwoordelijkheidsgrenzen van EpoCanvas Mail: het upstream open-sourceproject (MIT-licentie) levert de broncode; de instantie die u gebruikt wordt onafhankelijk beheerd en haar beheerder draagt de verantwoordelijkheid; uw account en mailgegevens staan in de Cloudflare-resources van die instantie](/images/mail/self-host-responsibilities.svg)

*Bijschrift: de upstream-auteurs van de open-sourcesoftware beheren geen enkele maildienst en zijn niet verantwoordelijk voor het gedrag van een instantie; er bestaat geen serviceovereenkomst tussen u en upstream.*

De Dienst omvat: beheer van meerdere mailboxen, interne en externe mail, bijlagen, labels en sterren, spamquarantaine, uitstellingen, zoeken, AI-vertaling (optioneel), herkenning van verificatiecodes (optioneel), Telegram-push (optioneel), tweestapsverificatie (TOTP/Passkey), een OAuth-platform en gegevensexport. Welke functies er echt zijn, hangt af van wat uw instantie heeft aangezet.

**De open-sourceidentiteit**: de Dienst is gebouwd op een open-sourceproject onder de MIT-licentie en gaat als open source verder. Dat betekent: de broncode is openbaar en controleerbaar; u kunt hem zelf implementeren voor dezelfde mogelijkheden; en de software wordt "as is" geleverd (zie sectie 10).

## 3. Accounts en beveiliging

1. **Eerlijke registratie**: registreren vereist alleen een geldig ontvangend e-mailadres en een wachtwoord. Imponeer niemand en gebruik geen domeinen waarop u geen recht heeft.
2. **Bewaken van inloggegevens**: u bent verantwoordelijk voor uw wachtwoord, uw tweestapsgegevens en uw API-tokens. Handelingen die met uw inloggegevens worden verricht, gelden als de uwe.
3. **Tweestapsverificatie**: TOTP of passkeys worden sterk aangeraden. Op instanties in de "versleutelde mailmodus" kan de beheerder tweestapsverificatie verplicht stellen op grond van zijn beveiligingsbeleid.
4. **Bescherming van het inloggen**: 5 opeenvolgende wachtwoordfouten blokkeren het inloggen 12 uur; een account houdt maximaal 10 actieve sessies, en u kunt op elk apparaat uitloggen om het token direct in te trekken.
5. **Gereserveerde namen**: identificatoren als `admin` zijn door het systeem gereserveerd en kunnen niet door gewone gebruikers worden geregistreerd.
6. **Registratiesleutels**: beheerders kunnen de instantie instellen op registratie met een sleutel of registratie sluiten — dat is een eigen beheersrecht van de instantie.

## 4. Beleid voor acceptabel gebruik

### 4.1 U verplicht zich de Dienst niet te gebruiken voor

**Onwettig en schadelijk gedrag**

- Versturen, opslaan of verspreiden van inhoud die de wet van uw of de jurdictie van de beheerder overtreedt, waaronder maar niet beperkt tot: seksueel misbruikmateriaal van kinderen (nultolerantie — gevonden betekent verwijderd en wettelijke medewerking), gewelddadig extremisme, drugshandel en wapenhandel, fraude en phishingspagina's;
- Verspreiden van malware, virussen of ransomware, of versturen van mail die erop gericht is inloggegevens te stelen.

**Spam en misbruik**

- Versturen van ongevraagde bulkcommerciele mail (spam / UBE / UCE), marketing aan ontvangers die niet hebben ingestemd, of gebruik van de Dienst voor mailboxopwarming of massale adresverificatiebombardementen;
- Programmatisch massaal accounts registreren, menselijke verificatie (Turnstile) omzeilen, registratiesleutels of quotumlimieten omzeilen;
- De Dienst gebruiken als anonieme doorstuursprong of kortstondige wegwerpverzendpool, of herhaaldelijk herregistreren om handhaving te ontlopen.

**Aanvallen en verstoring**

- Scannen, verkennen of met brute kracht aanvallen van deze Dienst of systemen van derden; proberen onbevoegd toegang te krijgen tot mailboxen van anderen, beheerinterfaces of gegevens van andere gebruikers;
- AI-vertaling, bijlagen, de API of andere gedeelde bronnen zodanig verbruiken dat het normale gebruik van andere gebruikers wordt geschaad;
- Cloudflare of de upstream open-sourcegemeenschap lastigvallen, belasteren of met juridische procedures belagen.

**Aantasting van rechten**

- Inbreuk maken op auteursrechten, privacy of beeltenis van anderen; de afzenderidentiteit vervalsen om u voor te doen als personen of organisaties;
- De servicevoorwaarden van derden schenden (Cloudflare, Resend, Mailjet, Telegram, enz.).

### 4.2 Gevolgen

Afhankelijk van de aard en ernst van de overtreding kan de beheerder: waarschuwen → functies beperken → in spamquarantaine plaatsen → het account opschorten → het account en alle gegevens fysiek verwijderen. Bij onwettig gedrag kan de beheerder noodzakelijk bewijs bewaren en met bevoegde autoriteiten meewerken. Als uw gedrag de beheerder een sanctie van Cloudflare of een upstream-provider oplevert, behoudt de beheerder zich het recht voor u daarop aan te spreken (zie sectie 12).

### 4.3 Bezwaar

Meent u dat de maatregel onterecht is, neem dan via de kanalen in [sectie 16](#16-neem-contact-op) contact op met de beheerder; de beheerder heroordeert binnen een redelijke termijn en antwoordt.

## 5. Uw inhoud en licentie

1. **Eigendom is van u**: de mail die u verstuurt en ontvangt, en de bijlagen ervan, zijn van u — en de verantwoordelijkheid ook. De beheerder gebruikt uw inhoud niet voor advertenties, modeltraining of overdracht aan wie dan ook.
2. **Een beperkte verwerkingslicentie**: om u opslag, bezorging, zoeken, pushberichten en (optioneel) vertaling te bieden, verleent u de beheerder een technische verwerkingslicentie **strikt beperkt tot het exploiteren van de Dienst**. Stopt u met de Dienst en worden uw gegevens verwijderd, dan eindigt de licentie.
3. **U bent verantwoordelijk voor wat u verstuurt**: elke mail die u verstuurt spreekt namens u. Geschillen en aansprakelijkheid voortvloeiend uit uw verzonden inhoud zijn voor u.
4. **De grens van inhoudscontrole**: de beheerder leest in beginsel uw gewone mail niet mee; maar op instanties in de "alle-mailmodus" kunnen beheerders technisch alle mail lezen (in de privacymodus alleen spam/verwijderd/koppelloos) en treden zij op bij meldingen of wettelijke verzoeken. Begrijp de modus van een instantie voordat u haar kiest.

## 6. Uitgaande bezorging en diensten van derden

1. **Uitgaande bezorging leunt op derden**: mail naar buiten de instantie wordt bezorgd via het door de beheerder ingestelde kanaal (Cloudflare Email Workers, Resend of Mailjet). Bezorging via derden kan vertraging, terugsturen of blokkade door de ontvangende provider ondervinden; de beheerder garandeert het resultaat van uitgaande bezorging niet.
2. **Optionele functies brengen derdenvoorwaarden mee**: Telegram-push, AI-vertaling, Linux DO-aanmelding, externe S3-opslag en vergelijkbare functies zijn, wanneer u ze gebruikt, ook gebonden aan de voorwaarden van de betreffende derden.
3. **Het OAuth-platform**: als u een app van derden via OAuth autoriseert, worden de scopes (openid / profile / email) en intrekmogelijkheden beschreven in sectie 9 van het Privacybeleid; het gebruik van uw gegevens door de app valt onder haar eigen voorwaarden.

## 7. Beschikbaarheid en veranderingen

- **Beste inspanning, geen SLA**: de Dienst draait op de gratis of naar verbruik afgerekende edge-infrastructuur van Cloudflare. De beheerder doet redelijke moeite voor beschikbaarheid, maar belooft geen 100% uptime, bezorgtijden of hersteltermijnen.
- **Ontwikkelende functies**: het open-sourceproject itereert snel; functies kunnen worden toegevoegd, gewijzigd of verwijderd. Wezenlijke veranderingen die gegevensverwijdering raken, worden vooraf aangekondigd.
- **Onderhoud en onderbrekingen**: de beheerder kan deel of alles van de Dienst opschorten voor upgrades, fixes of misbruikhandhaving; onbeschikbaarheid veroorzaakt door Cloudflare of upstream AI-/bezorgproviders is geen tekortkoming van de beheerder.

## 8. Bewaartermijnen en beëindiging van het account

1. **U beëindigt**: u kunt uw account op elk moment in de instellingen deactiveren of verwijdering aan de beheerder vragen. Na deactivering vervallen uw sessies direct; mail komt in een herstelbare zacht-verwijderde staat tot een beheerder de fysieke verwijdering uitvoert.
2. **De routinematige opruiming**: spam staat 7 dagen in quarantaine en gaat dan naar de prullenbak; mail in de prullenbak wordt 7 dagen na ontvangst door de dagelijkse routine fysiek verwijderd (bijlagen incluis). **Verwijdering is onomkeerbaar — exporteer eerst een JSON-kopie via "Gegevensexport".**
3. **De beheerder beëindigt**: overtreedt u [sectie 4](#4-beleid-voor-acceptabel-gebruik), dan kan de beheerder uw toegang opschorten of beëindigen en handelen volgens sectie 4.2. Het beleid voor lang inactieve accounts wordt door de beheerder gepubliceerd.

## 9. Overmacht

Dienstonderbrekingen en gegevensverlies door overmacht — natuurrampen, oorlog, overheidsmaatregelen, storingen in kernnetwerken, grootschalige cyberaanvallen, of het stoppen of beleidswijzigen van derdenproviders (Cloudflare, Resend, Mailjet, Telegram, AI-diensten, enz.) — zijn geen aansprakelijkheid van de beheerder, mits redelijke inspanningen zijn geleverd.

## 10. Garantieuitsluiting (as-is)

De Dienst (inclusief de software) wordt geleverd **"as is" en "as available"**, zonder enige garantie, uitdrukkelijk of stilzwijgend, waaronder garanties van verkoopbaarheid, geschiktheid voor een bepaald doel en niet-inbreuk. Dit weerspiegelt de garantienuitsluiting van de **MIT-licentie** van de software: **in geen enkel geval zijn de beheerder of de upstream open-sourceauteurs aansprakelijk voor enige claim, schade of andere aansprakelijkheid die voortvloeit uit de Dienst of het gebruik ervan, of daarmee verband houdt.**

## 11. Beperking van aansprakelijkheid

Voor zover wettelijk toegestaan, is de cumulatieve aansprakelijkheid van de beheerder jegens u niet groter dan het hoogste van: (a) wat u in de afgelopen 12 maanden feitelijk aan de beheerder heeft betaald (meestal nul bij gratis instanties); (b) 100 USD. De beheerder is niet aansprakelijk voor indirecte schade, gegevensverlies, gederfde winst of verlies van goodwill. **Maak zelf back-ups van belangrijke mail elders.**

## 12. Schadeloosstelling

Als uw overtreding van deze voorwaarden, uw inbreuk op rechten van anderen of uw onwettige gedrag de beheerder, de upstream-auteurs of hun gelieerde partijen blootstelt aan claims van derden (waaronder sancties en klachtafhandelingskosten van Cloudflare of andere providers), gaat u ermee akkoord hen binnen de wettelijke grenzen schadeloos te stellen en te vrijwaren.

## 13. Intellectueel eigendom en de open-sourcelicentie

1. **Codelicentie**: de broncode van de software is in licentie gegeven onder de **MIT-licentie**, Copyright (c) 2025 eoao (upstream) en de bijdragers aan dit project. De MIT-licentie regelt de code zelf; deze voorwaarden regelen het gebruik als Dienst; geen van beide vervangt de ander.
2. **Dankbetuiging**: de Dienst is gebouwd op het upstream open-sourceproject (auteur eoao) — dank aan upstream en de open-sourcegemeenschap.
3. **Uw inhoud**: de rechten op avatars, namen en ander materiaal dat u uploadt, blijven van u of van de oorspronkelijke rechthebbenden.
4. **Merkenhofelijkheid**: als u de naam en het logo "EpoCanvas Mail" op uw zelfgehoste instantie behoudt, vermeld er dan duidelijk bij dat het een onafhankelijk ingezette community-instantie is, om verwarring te voorkomen.

## 14. Voorwaarden voor zelfhostende beheerders

Bent u de beheerder van een zelfgehoste instantie, dan geldt:

- U draagt de volledige beheerderverantwoordelijkheid voor uw instantie: handhaving van acceptabel gebruik, afhandeling van bezwaren van gebruikers, lokalisatie van het privacybeleid en deze voorwaarden, en wettelijke bewaar- en medewerkingsplichten;
- U hoort dit document te kopiëren, aan te passen en op uw site te publiceren, met vervanging van contactgegevens en verantwoordelijke partij;
- De upstream-auteurs en de beheerders van dit project **dragen geen enkele hoofdelijke aansprakelijkheid voor hoe u uw instantie exploiteert**;
- Als u gebruikers laat betalen, zorgt u zelf voor naleving van lokale eisen rond onderneming, belasting en consumentenbescherming.

## 15. Wijzigingen in deze voorwaarden

Deze voorwaarden kunnen worden herzien naarmate de Dienst zich ontwikkelt. Wezenlijke wijzigingen worden aangekondigd via een aankondiging op de site of systeemmail, met bijwerking van de ingangsdatum en versie bovenaan deze pagina. Blijvend gebruik van de Dienst na het ingaan van een wijziging geldt als acceptatie; bent u het oneens, stop dan met gebruik en exporteer of verwijder uw gegevens.

## 16. Neem contact op

- **Gehoste instantie (`mail.epocanvas.com`)**: mail in het product of e-mail aan `admin@epocanvas.com`;
- **Het open-sourceproject**: issues in de GitHub-repository;
- **Zelfhostende sites**: de beheerdercontactgegevens gepubliceerd op die site.

---

*Deze voorwaarden vormen samen met het [Privacybeleid](/nl/mail/privacy-policy/) de volledige overeenkomst tussen u en de beheerder. Dit document is een algemene sjabloon geschreven door de open-sourcegemeenschap en is geen juridisch advies; beheerders doen er verstandig aan een gekwalificeerd advocaat te raadplegen vóór commercieel gebruik.*
