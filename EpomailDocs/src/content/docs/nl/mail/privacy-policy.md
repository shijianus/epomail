---
title: Privacybeleid (Privacy Policy)
description: Privacybeleid van EpoCanvas Mail — welke informatie we verzamelen, hoe we deze gebruiken en beschermen, wanneer en met welke derden deze wordt gedeeld, en welke controle u over uw gegevens heeft.
---

**Ingangsdatum: 27 september 2026　|　Versie: 1.0**

EpoCanvas Mail (de "Dienst" of de "Software") is een **e-maildienst met open broncode**, gebouwd op de Cloudflare-stack (Workers, D1, KV, R2) en gepubliceerd onder de MIT-licentie. Het kan draaien als een openbare gehoste mailbox-site (bijvoorbeeld `mail.epocanvas.com`) of door iedereen zelf worden gehost als een privé-e-maildienst.

Het doel van dit beleid is eenvoudig: **in gewone taal uitleggen waar uw gegevens naartoe gaan, wie ze kan zien en wat u er zelf mee kunt.** Wij plaatsen geen advertenties, volgen gebruikers niet en verkopen geen gegevens — elke sectie hieronder legt concreet uit wat die zin betekent.

:::note[Samenvatting in 30 seconden]
- **Wat we verzamelen**: uw e-mailadres, uw wachtwoord (alleen opgeslagen als gezouten hash — niemand, ook de beheerder niet, kan uw oorspronkelijke wachtwoord terughalen), de inhoud en bijlagen van e-mails die u verstuurt en ontvangt, en uw inlog-IP en apparaatinformatie.
- **Wat we er nooit mee doen**: geen advertentieprofielen, geen verkoop aan derden, geen enkele statistiek- of tracking-SDK.
- **Wie verantwoordelijk is**: de beheerder van de instantie die u gebruikt is de "verwerkingsverantwoordelijke" van uw gegevens. EpoCanvas Mail als open-sourcesoftware verzamelt en uploadt zelf niets.
- **Dat kan altijd**: alle e-mails exporteren (JSON), berichten en uw account verwijderen, tweestapsverificatie inschakelen en machtigingen van apps van derden intrekken.
- **Derden om te kennen**: wanneer u op "Vertalen" klikt, wordt de e-mailtekst verzonden naar de AI-vertaaldienst die op uw instantie is ingesteld; wanneer de beheerder uitgaande bezorging aanzet, gaat externe mail via Resend of Mailjet. Zie [sectie 6](#6-diensten-van-derden-en-het-delen-van-gegevens).
- **Onbekend woord?** Sla door naar [Bijlage B: Sleutelbegrippen](#bijlage-b-sleutelbegrippen) onderaan de pagina: elk begrip komt met een uitleg in één gewone zin.
:::

## Op deze pagina

1. [Op wie is dit beleid van toepassing?](#1-op-wie-is-dit-beleid-van-toepassing)
2. [Informatie die we verzamelen](#2-informatie-die-we-verzamelen)
3. [Waar uw gegevens heengaan: één diagram](#3-waar-uw-gegevens-heengaan-één-diagram)
4. [Hoe we informatie gebruiken](#4-hoe-we-informatie-gebruiken)
5. [Opslag, versleuteling en beveiliging](#5-opslag-versleuteling-en-beveiliging)
6. [Diensten van derden en het delen van gegevens](#6-diensten-van-derden-en-het-delen-van-gegevens)
7. [AI-functies](#7-ai-functies)
8. [Bewaartermijnen en verwijdering](#8-bewaartermijnen-en-verwijdering)
9. [Uw regelmogelijkheden en rechten](#9-uw-regelmogelijkheden-en-rechten)
10. [Communicatie en notificaties](#10-communicatie-en-notificaties)
11. [Kinderen en minderjarigen](#11-kinderen-en-minderjarigen)
12. [Internationale gegevensoverdrachten](#12-internationale-gegevensoverdrachten)
13. [Gids voor de zelfhostende beheerder](#13-gids-voor-de-zelfhostende-beheerder)
14. [Wijzigingen in dit beleid](#14-wijzigingen-in-dit-beleid)
15. [Neem contact op](#15-neem-contact-op)

- [Bijlage A: verhouding tot het open-sourceproject](#bijlage-a-verhouding-tot-het-open-sourceproject)
- [Bijlage B: Sleutelbegrippen](#bijlage-b-sleutelbegrippen)
- [Bijlage C: Verwante bronnen](#bijlage-c-verwante-bronnen)

## 1. Op wie is dit beleid van toepassing?

"EpoCanvas Mail" heeft twee identiteiten — bepaal eerst met welke u te maken heeft:

| Identiteit | Wie | Rol qua privacy |
| --- | --- | --- |
| **De open-sourcesoftware** | De broncodebibliotheek gepubliceerd onder de MIT-licentie op GitHub | De software zelf **verzamelt en rapporteert niets** — nul telemetrie, nul statistieken, nul advertentie-SDK ingebouwd |
| **De instantie die u gebruikt** | De persoon of het team dat een bepaalde EpoCanvas Mail-site beheert (bijvoorbeeld de beheerder van de gehoste site `mail.epocanvas.com`, of een site die uw bedrijf of gemeenschap zelf host) | De **verwerkingsverantwoordelijke** van uw gegevens, juridisch verantwoordelijk voor verzameldoeleinden, bewaartermijnen en reacties op verwijderverzoeken |

:::tip[In één zin]
De software is een instrument; de beheerder is "wij". Op welke site u ook registreert: de beheerder van die site is op grond van dit beleid (of zijn aangepaste versie ervan) verantwoordelijk voor uw gegevens.
:::

Zelfhosters kunnen dit beleid direct overnemen als privacyverklaring van hun site, met vervanging van contactgegevens en operationele details volgens [sectie 13](#13-gids-voor-de-zelfhostende-beheerder).

## 2. Informatie die we verzamelen

Anders dan de meeste internetdiensten willen we dat u eerst het grote plaatje ziet: deze dienst **verzamelt alleen wat strikt noodzakelijk is om uw post te bezorgen**, en blijft bewust alles vermijden waar het advertentie-ecosysteem van afhankelijk is. Ingedeeld naar de manier waarop de informatie het systeem binnenkomt.

### 2.1 Informatie die u zelf verstrekt

- **E-mailadres**: uw accountidentificatie (bijv. `u@voorbeeld.com`). De gebruikersnaam is standaard het lokale deel van het adres en valt, als die al bezet is op de site, terug op het volledige e-mailadres.
- **Wachtwoord**: uitsluitend opgeslagen als **PBKDF2-HMAC-SHA256-hash (100.000 iteraties + een unieke willekeurige salt per gebruiker)**. Dat is een eenrichtingstransformatie — zelfs de beheerder kan uw oorspronkelijke wachtwoord niet uit de database terughalen.
- **Tweestapsverificatiegegevens (optioneel)**: schakelt u TOTP in, dan wordt het geheim versleuteld opgeslagen met AES-256-GCM; herstelcodes worden alleen als SHA-256-hash bewaard; registreert u een passkey, dan wordt alleen de publieke sleutel bewaard.
- **Profielgegevens (optioneel)**: weergavenaam, avatar, bio en dergelijke. Avatarafbeeldingen worden geüpload naar de afbeeldingenopslag die de beheerder heeft ingesteld.

### 2.2 De inhoud van uw e-mail

De berichten die u via de Dienst verstuurt en ontvangt — afzender, ontvangers, onderwerp, berichttekst, tijdstempels en andere metadata, samen met de labels, sterren, gelezenstatussen en uitstellingen die u toepast — worden bewaard in de database en objectopslag van de instantie. Bijlagen worden bewaard in Cloudflare R2, een door de beheerder ingestelde S3-compatibele opslag (zoals Backblaze B2) of, als terugval, in KV.

### 2.3 Automatisch verzamelde technische informatie

- **Registratie- en inloglogboeken**: bij elke registratie en aanmelding worden uw IP-adres en de User-Agent van uw browser vastgelegd, waaruit het besturingssysteem, de browser en het apparaattype worden afgeleid. Deze worden gebruikt voor beveiligingsaudits (bijv. ongebruikelijke aanmeldingen opsporen) en quotumbeheer.
- **Sessietokens**: na aanmelding wordt een JWT (30 dagen geldig) in de localStorage van uw browser bewaard. De Dienst **gebruikt geen cookies** en er bestaan geen cross-site trackingcookies.
- **Verzoekmetadata**: de onderliggende infrastructuur (Cloudflare) verwerkt verzoeken op zijn edgenetwerk en kan verbindingsmetadata en runtime-logboeken bijhouden volgens eigen beleid.

### 2.4 Wat we bewust níét verzamelen

Deze lijst is even belangrijk als de vorige:

- ❌ **Geen advertentietracking**: geen advertentie-SDK's, geen gedragsprofilering, geen cross-sitecookies.
- ❌ **Geen statistiek van derden**: geen Google Analytics, geen Plausible, geen enkele event-tracking.
- ❌ **Geen gegevensverkoop**: uw gegevens worden under geen enkele omstandigheid verkocht, verhuurd of geruild voor reclamedoeleinden.
- ❌ **Niets terugmelden**: de open-sourcesoftware "rapporteert" instantiegegevens nooit terug naar de oorspronkelijke auteurs of wie dan ook. Gegevens van een eigen implementatie blijven volledig binnen uw eigen Cloudflare-account.
- ❌ **Geen verzameling buiten de grenzen**: het systeem leest nooit de contacten, fotobibliotheek, locatie of app-gegevens van uw apparaat; "technische informatie" beperkt zich tot de hierboven genoemde velden rond verzoeken en sessies.

## 3. Waar uw gegevens heengaan: één diagram

![Diagram van de gegevensstroom van EpoCanvas Mail: uw browser bereikt de Cloudflare Worker via HTTPS; e-mailinhoud wordt bewaard in de D1-database, KV en R2-objectopslag; uitgaande mail wordt bezorgd via Resend of Mailjet; Telegram-pushberichten en AI-vertaling gebeuren alleen wanneer ingeschakeld of door u getriggerd](/images/mail/data-flow.svg)

*Bijschrift: uw e-mailgegevens rusten binnen het Cloudflare-account van u (of uw beheerder). Alleen de drie geschakelde kanalen rechts — uitgaande bezorging, pushnotificaties en AI-vertaling — sturen gegevens de instantie uit, elk met een duidelijke trigger; zie secties 6 en 7.*

## 4. Hoe we informatie gebruiken

Elk doel heeft een duidelijke grens: buiten de kernlevering, de beveiliging en de functies die u zelf start, is er niets anders.

| Doel | Gebruikte informatie | Toelichting |
| --- | --- | --- |
| De e-maildienst leveren | E-mailadres, berichtinhoud, bijlagen | De kernfunctie; zonder kan de dienst niet werken |
| Bescherming van account en beveiliging | Wachtwoordhash, inlog-IP/UA, TOTP/Passkey | Detectie van ongebruikelijke aanmeldingen en blokkering (5 opeenvolgende mislukkingen blokkeren het inloggen 12 uur) |
| Automatische extractie van verificatiecodes (optioneel) | Onderwerp en tekstfragment van nieuwe berichten | Door de beheerder aangezet extraheert Workers AI verificatiecodes zodat u ze met één tik kopieert |
| Systeemmededelingen | E-mailadres, taalvoorkeur | Officiële welkomstmail en aankondigingen worden in de taal van uw interface bezorgd |
| Spambescherming | Adres van de afzender, berichtinhoud | Beheerders kunnen blacklists en filterregels instellen; de spamquarantaine wordt na 7 dagen automatisch geleegd |
| Beheer van opslagquota | Grootte van bijlagen, mailboxgebruik | Voorkomt dat één gebruiker de gedeelde bronnen uitput |
| Geaggregeerde gebruiksstatistieken | Geaggregeerde verzend-/ontvangsttellingen | Alleen een totaaldashboard voor de beheerder (dagelijkse volumes, blokkeringspercentages) — nooit om individuen te profileren |

We gebruiken uw informatie **niet** voor geautomatiseerde besluitvorming, profilering of enig commercieel doel dat niets met de Dienst te maken heeft.

## 5. Opslag, versleuteling en beveiliging

### 5.1 Waar gegevens staan

Alle gegevens staan binnen het eigen Cloudflare-account van de instantiebeheerder: gestructureerde gegevens (gebruikers, berichten, instellingen) in de D1-database (SQLite), caches en sessies in KV, en bijlagen in R2 of een S3-compatibele opslag. De oorspronkelijke auteurs van EpoCanvas Mail **houden geen gegevens bij en hebben er geen toegang toe**.

### 5.2 Versleuteling in de drie e-mailmodi

De Dienst biedt drie opslagmodi, gekozen door de beheerder:

| Modus | Hoe berichten worden opgeslagen | Wie kan uw e-mail lezen |
| --- | --- | --- |
| **Alle-mailmodus** | Ongecodeerd opgeslagen | De beheerder (administrators) kan de e-mail van alle gebruikers lezen |
| **Privacymodus** (standaard) | Gewone e-mail in rust versleuteld met AES-256-GCM | Beheerders komen alleen bij spam, verwijderde en koppelloze berichten — ze kunnen uw gewone inbox niet doorbladeren |
| **Versleutelde modus** | Alles is versleuteld, inclusief de prullenbak | De beheerinterfaces voor mail geven helemaal geen gebruikersmail terug |

:::caution[Eerlijke kanttekening bij de grenzen van de versleuteling]
Het bovenstaande is **versleuteling in rust aan de serverkant**: de sleutels worden afgeleid uit omgevingsvariabelen op de server van de instantie plus uw gebruikers-ID. Dat betekent dat **een beheerder die de server en de sleutels beheerst, technisch in staat is te ontsleutelen**: het beschermt tegen scenario's zoals diefstal van het databasebestand of het lekken van een snapshot, maar het is **geen** end-to-endversleuteling (E2EE); de beheerder is niet absoluut uitgesloten van het lezen van uw mail. Wilt u privacy waar zelfs de beheerder niet omheen kan, vertrouw dan niet op de versleutelingsmodus van een mailbox, maar versleutel de berichttekst zelf vooraf met een speciale E2EE-tool (zoals GPG).
:::

### 5.3 Beveiliging van transport en toegang

- De hele site draait over HTTPS/TLS; gevoelige eindpunten zoals aanmelden hebben snelheidsbeperking en blokkering bij mislukking.
- Tweestapsverificatie: TOTP (RFC 6238) en FIDO2-passkeys (vingerafdruk / gezicht) worden ondersteund en sterk aangeraden.
- Sessiebeheer: maximaal 10 gelijktijdige sessies per account; u kunt op elk apparaat uitloggen en het token wordt direct ingetrokken.
- Bevoegdheden van beheerders (eerlijk onthuld): afhankelijk van rolrechten kunnen instantiebeheerders wachtwoorden resetten, tweestapsverificatie geforceerd resetten, accounts blokkeren of verwijderen, registratie-IP's en apparaatlijsten van gebruikers inzien en — in de "alle-mailmodus" — gebruikersmail lezen. **Een instantie kiezen is haar beheerder vertrouwen**: neem dat even serieus als het kiezen van een e-mailprovider.

## 6. Diensten van derden en het delen van gegevens

Naar het voorbeeld van de grote aanbieders groeperen we de situaties waarin gegevens de instantie verlaten in vier categorieën, zodat u snel de aard van elke deling kunt beoordelen:

1. **Infrastructuurverwerkers** (altijd, op de achtergrond): Cloudflare levert de runtime, opslag en het netwerk — het fundament van alles;
2. **Door de beheerder ingestelde functies** (getriggerd bij verzending): uitgaande bezorgproviders dragen uw mail naar de buitenwereld;
3. **Functies die u zelf start** (alleen op uw klik): vertaling, uploaden van afbeeldingen, Telegram-koppeling, Linux DO-aanmelding;
4. **Wettelijke vorderingen**: alleen volgens de wettelijke procedure (zie het einde van deze sectie).

Ons principe: **gegevens die niet naar buiten hoeven, gaan nooit weg; en voor gegevens die moeten, staat in de tabel hieronder precies via welke deur ze gaan en wat ze meenemen.**

| Derde | Rol | Wanneer getriggerd | Wat wordt gedeeld |
| --- | --- | --- | --- |
| **Cloudflare** | Infrastructuur (runtime, D1/KV/R2-opslag, e-mailroutering, menselijke verificatie, Workers AI, logboeken) | Altijd | Verzoekmetadata, opgeslagen inhoud, verificatieverzoeken |
| **Resend / Mailjet** | Aanbieders van uitgaande bezorging | Alleen wanneer u mail verstuurt naar ontvangers buiten de instantie én de beheerder een bezorgkanaal heeft ingesteld | Het volledige bericht (ontvangers, onderwerp, tekst, bijlagen) |
| **Telegram** | Directe pushnotificaties | Alleen wanneer u (of de beheerder) een Telegram-bot heeft gekoppeld en push heeft aangezet | Instelbaar: onderwerp, afzender (verbergbaar), tekst (verbergbaar), verificatiecodes, een leeslink (7 dagen geldig) |
| **AI-vertaaldiensten** (relay-eindpunt ingesteld op de instantie, Cloudflare Workers AI, MyMemory, het openbare Google Translate-eindpunt) | Vertaalverwerking | **Alleen wanneer u op "Vertalen" klikt** | De te vertalen mailtekst (liefst het hele passage; ingekorte fragmenten bij terugval); afbeeldingen voor OCR-vertaling |
| **Afbeeldingenuploaddienst** | Opslag van avatars en afbeeldingen | Alleen wanneer u een avatar of dergelijke uploadt | Het afbeeldingsbestand zelf |
| **Linux DO** | Inlogidentiteit van derden | Alleen wanneer u inlogt met een Linux DO-account | De OAuth-uitwisseling levert uw gebruikers-ID, naam, avatar en vertrouwensniveau op |
| **Google Fonts** | Laden van interfacelettertypen | Wanneer uw browser de pagina laadt | Lettertypeverzoeken (uw IP verschijnt in de verzoeklogboeken van Google) |
| **Door u/de beheerder ingestelde S3, Turso e.d.** | Externe opslag | Alleen wanneer externe opslag/database is ingesteld | Bijlagen of kopieën van gegevens |

:::tip[Wat "we verkopen geen gegevens" concreet betekent]
Geen van de derden hierboven ontvangt uw gegevens voor advertentiedoeleinden, en met geen van hen hebben wij een afspraak over gegevensverkoop of advertentie-inkomsten. Sommigen (zoals Cloudflare en Resend) verwerken gegevens als "verwerker" in opdracht van de beheerder, elk gebonden aan hun eigen privacybeleid (te raadplegen op hun websites).
:::

:::note[Wettelijke vorderingen en samenwerking met toezichthouders]
Tenzij de wet het afdwingt of er een verzoek volgens de wettelijke procedure komt, geeft de beheerder uw gegevens niet uit eigen beweging aan derden vrij. Bij zo'n verzoek toetst de beheerder de rechtmatigheid, maakt alleen het minimum dat de wet vereist vrij en stelt u op de hoogte voor zover de wet dat toestaat. Zelfhostende beheerders vullen hun eigen toezeggingen over samenwerking met autoriteiten aan volgens hun jurisdictie.
:::

## 7. AI-functies

De Dienst bevat drie AI-capaciteiten; hun triggers en gegevensgrenzen zijn:

1. **Extractie van verificatiecodes** (optioneel door de beheerder aan te zetten): wanneer een nieuw bericht binnenkomt, stuurt het systeem het onderwerp en de eerste 6000 tekens van de tekst naar Cloudflare Workers AI om de verificatiecode te extraheren, zodat u die uit de lijst of een Telegram-notificatie kunt kopiëren. Dit is de enige AI-verwerking die **zonder handmatige trigger** plaatsvindt — wilt u dat niet, vraag dan de beheerder het uit te zetten of kies een instantie zonder deze functie.
2. **AI-vertaling van mail** (door u getriggerd): na klikken op "Vertalen" wordt de mailtekst in fragmenten gestuurd naar het op de instantie ingestelde grote-model-eindpunt (standaard OpenAI-compatibel) met multi-model failover; zijn de modellen onbeschikbaar, dan valt het systeem terug op MyMemory of het openbare Google Translate-eindpunt. **Geen klik, geen overdracht.**
3. **OCR-vertaling van afbeeldingen** (door u getriggerd): afbeeldingen met tekst worden herkend en vertaald; de afbeelding gaat naar de bovengenoemde AI-diensten. Decoratieve afbeeldingen, logo's en pictogrammen worden automatisch overgeslagen en verlaten de instantie nooit.

De AI-functies zijn niet gekoppeld aan modeltraining: het systeem gebruikt uw mail niet om een model te trainen en stuurt de AI-diensten geen gebruikersidentiteit mee verder dan de tekst die voor de vertaling nodig is.

## 8. Bewaartermijnen en verwijdering

| Gegevens | Bewaarbeleid |
| --- | --- |
| E-mail in de gewone inbox | Bewaard tot u het verwijdert of tot een op quotum gebaseerde opruiming |
| Spam | **7 dagen** in quarantaine, daarna naar de prullenbak |
| Mail in de prullenbak | **Fysiek verwijderd** (inclusief binaire bijlagen en index) door de dagelijkse routine **7 dagen na ontvangst** |
| Mail van een verwijderd account | Zelfservice-deactivering is een **zachte verwijdering**: mail blijft in de database (technisch herstelbaar) tot een beheerder fysiek verwijdert; na fysieke verwijdering zijn profiel, mailboxen, berichten, bijlagen, OAuth-machtigingen en sessies voorgoed weg |
| Inloglogboeken (IP/UA) | Bewaard in het gebruikersprofiel tot het account fysiek wordt verwijderd |
| Sessietokens | Bij serverzijde ingetrokken bij uitloggen; verlopen vanzelf na 30 dagen inactiviteit |
| Bij stopzetting van de instantie | De beheerder moet vooraf melden en een exportvenster bieden; na de stop wordt de data samen met de Cloudflare-resources van de instantie (D1/KV/R2) vernietigd en niet aan vreemde derden overgedragen |

:::caution[Exporteer vóór het verwijderen]
Fysieke verwijdering is onomkeerbaar. Om uw gegevens mee te nemen, gebruikt u eerst "Instellingen → Gegevensexport" om een JSON-kopie te downloaden (uw volledige profiel en de volledige tekst van alle niet-verwijderde berichten).
:::

## 9. Uw regelmogelijkheden en rechten

Welke jurisdictie u ook heeft, de Dienst biedt deze zelfbedieningsgereedschappen:

- **Overdraagbaarheid van gegevens**: export met één klik van uw volledige profiel en alle berichten (JSON, leesbaar) via de instellingenpagina.
- **Wissen**: verwijder berichten een voor een (na 7 dagen fysiek gewist), deactiveer zelf uw account of vraag de beheerder om onmiddellijke fysieke verwijdering.
- **Inzage en correctie**: bekijk en wijzig op elk moment uw weergavenaam, avatar, taalvoorkeur en mailvoorkeuren in de instellingen.
- **Schakelaar voor het openbare profiel**: uw openbare profielpagina is standaard alleen zichtbaar voor u en de beheerders. Zet u hem aan, dan worden uw e-mailadres, weergavenaam, avatar, registratiedatum en verzend-/ontvangststatistieken openbaar zichtbaar — **geheel uw keuze**.
- **Beheer van machtigingen van derden**: bekijk elke OAuth-machtiging onder "Apps van derden" en trek ze met één klik in; het bijbehorende toegangstoken vervalt direct.
- **Sessiebeheer**: log uit op elk apparaat om het token van dat apparaat in te trekken.
- **Bezwaar en afmelden**: zet Telegram-push uit, voorkom AI-overdrachten door nooit op Vertalen te klikken, of kies een instantie zonder extractie van verificatiecodes.

Als uw jurisdictie (EU/EER, VK, Californië, enz.) u extra wettelijke rechten geeft (klacht, beperking van verwerking, enz.), neem dan contact op met de instantiebeheerder om ze uit te oefenen; de beheerder moet binnen de wettelijke termijnen reageren. Over de reactietermijnen: onze belofte is dat **zelfbedieningsacties in de interface (exporteren, verwijderen, machtigingen intrekken, uitloggen) direct werken**; verzoeken die menselijke afhandeling nodig hebben (zoals fysieke verwijdering) worden binnen **30 dagen** beantwoord en afgehandeld. Bent u niet tevreden met de uitkomst, dan kunt u ook een klacht indienen bij de gegevensbeschermingsautoriteit van uw land.

## 10. Communicatie en notificaties

De Dienst zelf stuurt u geen marketingmail. De enige officiële berichten die u in het product kunt zien, zijn de welkomstmail en de aankondigingen van de beheerder (beide in het product afgeleverd door het officiële account `admin@epocanvas.com`, nooit via een externe dienst), plus gewone mail van externe afzenders aan u. Telegram-push en doorsturen naar andere mailboxen staan standaard uit en kunnen op elk moment worden uitgezet.

## 11. Kinderen en minderjarigen

De Dienst is niet gericht op kinderen jonger dan 14 jaar en beheerders verzamelen bewust geen persoonlijke gegevens van kinderen. Bent u wettelijk vertegenwoordiger en denkt u dat uw kind ons persoonlijke gegevens heeft verstrekt, neem dan contact op met de instantiebeheerder; na verificatie worden die gegevens onmiddellijk verwijderd. Zelfhostende beheerders dienen een hogere minimumleeftijd vast te stellen volgens hun jurisdictie en publiek.

## 12. Internationale gegevensoverdrachten

De Dienst is gebouwd op het wereldwijde edgenetwerk van Cloudflare. Gegevens kunnen worden opgeslagen in de door de beheerder gekozen Cloudflare-regio (D1/KV/R2 ondersteunen locatiekeuze) en via elke edgelocatie ter wereld transiteren — gegevens kunnen dus buiten het land van de beheerder worden verwerkt. Cloudflare biedt overdrachtsgaranties binnen haar compliancekaders (zoals de standaardcontractbepalingen onder de GDPR); zie de officiële compliance-documentatie van Cloudflare. Gebruik van een gehoste instantie betekent dat u deze infrastructuurkenmerking begrijpt en accepteert.

## 13. Gids voor de zelfhostende beheerder

Heeft u EpoCanvas Mail onder uw eigen domein geïmplementeerd, dan bent u juridisch en feitelijk **de "wij" voor uw gebruikers**. Doe het volgende:

1. **Vervang de plaatshouders in dit bestand**: contacte-mail, instantienaam, ingangsdatum — en loopte de tabel met derden in sectie 6 na (heeft u Telegram of Resend niet ingesteld, verwijder dan die rijen).
2. **Kies en openbaar uw mailmodus eerlijk**: de modus "alles/privacy/versleuteld" die u kiest bepaalt direct of de formulering in sectie 5.2 klopt.
3. **Voldoe aan uw jurisdictieplichten**: vallen uw gebruikers onder de GDPR (EU), het VK, de LGPD (Brazilië), de CCPA/CPRA (Californië) of vergelijkbare regels, dan moet u mogelijk wettelijke grondslagen, een DPA, wettelijke bewaartermijnen en lokale klachtkanalen toevoegen. Dit bestand is een stevig vertrekpunt door engineers geschreven, **geen juridisch advies** — raadpleeg een gekwalificeerd advocaat vóór de productie.
4. **Houd de nul-telemetrie-belofte**: uw implementatie erft standaard de basis "geen statistieken, niets terugmelden"; voegt u zelf statistiek van derden toe, maak dat dan eerlijk bekend in uw privacybeleid.

## 14. Wijzigingen in dit beleid

Dit beleid kan worden bijgewerkt als functies zich ontwikkelen. Wezenlijke wijzigingen (een nieuwe derde, gewijzigde bewaartermijn, een andere versleutelingsmodus, enz.) worden vooraf aangekondigd via een aankondiging op de site of systeemmail, met bijwerking van de "ingangsdatum" en het versienummer bovenaan deze pagina. Blijvend gebruik na een update geldt als acceptatie; bent u het na een wezenlijke wijziging oneens, dan kunt u de Dienst stoppen en uw gegevens exporteren of verwijderen.

Naar sectorgewoonte **verdwijnt de geschiedenis niet**: elke grote herziening van dit beleid wordt gearchiveerd in de versiegeschiedenis van de open-sourcerepository, waar u elke oudere volledige tekst op elk moment kunt teruglezen en vergelijken; zelfhostende beheerders wordt aangeraden dezelfde archiefgewoonte op hun eigen site te houden.

## 15. Neem contact op

- **Gehoste instantie (`mail.epocanvas.com`)**: neem via de mail in het product of per e-mail contact op met de beheerder: `admin@epocanvas.com`.
- **De open-sourcesoftware zelf**: maak een issue aan in de GitHub-repository van het project.
- **Zelfhostende sites**: neem contact op met de beheerder van de site die u gebruikt (de contactgegevens horen op die site te staan).

## Bijlage A: verhouding tot het open-sourceproject

EpoCanvas Mail is gebouwd op en gaat verder als een open-sourceproject onder de MIT-licentie. Het oorspronkelijke upstream-project is gemaakt door **eoao** (Copyright (c) 2025 eoao) — dank aan upstream en alle bijdragers. Dit beleid is geschreven door de EpoCanvas-gemeenschap en wordt in dezelfde open geest gepubliceerd: **elke beheerder van een EpoCanvas Mail-instantie mag deze tekst vrij overnemen en aanpassen** (MIT-geest, naamsvermelding niet vereist), al raden we aan de zelfhostverklaring in sectie 13 te behouden om dezelfde transparantie jegens uw gebruikers te waarborgen.

## Bijlage B: Sleutelbegrippen

We vermijden jargon zoveel mogelijk; is een technische term onvermijdelijk, lees hem dan met de gewone-taal-uitleg hieronder.

| Begrip | Uitleg in één zin |
| --- | --- |
| **Account** | Uw identiteit op een instantie, geïdentificeerd door uw e-mailadres; het wachtwoord wordt alleen als eenrichtingshash bewaard die niemand kan omkeren |
| **Instantie (site)** | Eén implementatie van EpoCanvas Mail binnen het Cloudflare-account van een persoon of team — bijvoorbeeld `mail.epocanvas.com` of een site van uw bedrijf |
| **Beheerder** | Wie de instantie implementeert en beheert; de "verwerkingsverantwoordelijke" van uw gegevens, dus het "wij" van dit beleid |
| **Verwerkingsverantwoordelijke / verwerker** | Wie bepaalt "waarom verzamelen en hoe gebruiken" is de verwerkingsverantwoordelijke (de beheerder); wie de gegevens in opdracht verwerkt is de verwerker (bijv. Cloudflare, Resend) |
| **Inhoudsgegevens** | De teksten, onderwerpen en bijlagen van uw mail, plus de labels, sterren en leesstatussen die u toepast |
| **Technische gegevens** | IP-adres, User-Agent van de browser, apparaattype, inlogtijden en vergelijkbare velden, automatisch vastgelegd voor beheer en beveiliging |
| **localStorage (webopslag)** | Een browsermechanisme dat webgegevens op uw apparaat bewaart over sessies heen; het inlogtoken van deze dienst woont daar, niet in cookies |
| **Sessietoken (JWT)** | Het "pasje" dat na aanmelding wordt uitgegeven — 30 dagen geldig, maximaal 10 gelijktijdige sessies per account, ingetrokken bij uitloggen |
| **PBKDF2** | Een wachtwoordhashalgoritme; deze dienst past 100.000 gezouten iteraties toe zodat het oorspronkelijke wachtwoord niet uit de database is af te leiden |
| **Versleuteling in rust** | Versleuteling bij het wegschrijven naar schijf; de sleutels van deze dienst zijn afgeleid van omgevingsvariabelen van de server, dus een beheerder die server en sleutels beheerst kan technisch ontsleutelen |
| **End-to-endversleuteling (E2EE)** | Versleuteling waarbij alleen afzender en ontvanger kunnen ontsleutelen; deze dienst **biedt dat niet** — heeft u die sterkte nodig, versleutel de tekst dan zelf met GPG of vergelijkbaar vóór het verzenden |
| **Telemetrie** | Gedrag van software dat automatisch gebruiksgegevens terugmeldt aan de makers; EpoCanvas Mail heeft nul telemetrie en meldt geen instantiegegevens upstream |

## Bijlage C: Verwante bronnen

- **De Servicevoorwaarden**: samen met dit beleid vormen ze de volledige overeenkomst tussen u en de beheerder (zie de sitenavigatie of de [Servicevoorwaarden](/nl/mail/terms-of-service/)).
- **De open-sourcerepository**: `github.com/shijianus/epomail` — broncode-audits, issue-feedback en de volledige versiegeschiedenis van de tekst van dit beleid.
- **De productsite**: `mail.epocanvas.com` — inloggen, registreren en de Dienst gebruiken.
- **Verder lezen**: de officiële Cloudflare-documentatie over [D1](https://developers.cloudflare.com/d1/), [KV](https://developers.cloudflare.com/kv/), [R2](https://developers.cloudflare.com/r2/) en [Workers AI](https://developers.cloudflare.com/workers-ai/) legt uit hoe de infrastructuur gegevens verwerkt.
