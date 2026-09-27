---
title: Conditions d'utilisation (Terms of Service)
description: Conditions d'utilisation d'EpoCanvas Mail — les règles de compte, les limites d'usage acceptable, les droits sur le contenu, les avertissements et les notes sur la licence open source à connaître avant d'utiliser le service de messagerie.
---

**Date d'entrée en vigueur : 27 septembre 2026　|　Version : 1.0**

Bienvenue sur EpoCanvas Mail (le « Service »). Les présentes conditions constituent l'accord passé entre vous et l'opérateur du Service concernant son utilisation. Prenez quelques minutes pour les lire — nous avons gardé le langage aussi clair que possible et couvrons en un seul endroit ce que vous pouvez faire, ce qui est interdit, et ce qui se passe en cas de problème.

:::note[Résumé en 30 secondes]
- **Ce qu'est le Service** : un service de messagerie open source (sous licence MIT), auto-hébergeable, entièrement construit sur Cloudflare ; vous pouvez l'utiliser pour envoyer et recevoir des e-mails, gérer plusieurs boîtes et échanger des pièces jointes.
- **Votre compte, votre responsabilité** : conservez votre mot de passe et activez la double authentification ; 5 échecs de connexion consécutifs verrouillent le compte pendant 12 heures.
- **La ligne rouge** : pas de spam, pas de contenu illégal, pas d'attaques contre le service ou contre autrui. Toute violation peut entraîner un bannissement et la suppression du compte.
- **Vos e-mails vous appartiennent** : nous ne les traitons que pour les livrer et les stocker. La corbeille est purgée physiquement 7 jours après la suppression — exportez avant de dire au revoir.
- **Le Service est fourni « en l'état »** : logiciel open source, disponibilité au mieux, aucun accord de niveau de service (SLA).
- **Un mot vous échappe ?** Sautez à l'[Annexe : petit glossaire](#annexe--petit-glossaire) en fin de page pour des explications en langage simple.
:::

## Sur cette page

1. [Champ d'application et définitions](#1-champ-dapplication-et-définitions)
2. [Présentation du Service](#2-présentation-du-service)
3. [Comptes et sécurité](#3-comptes-et-sécurité)
4. [Politique d'utilisation acceptable](#4-politique-dutilisation-acceptable)
5. [Votre contenu et licence](#5-votre-contenu-et-licence)
6. [Livraison sortante et services tiers](#6-livraison-sortante-et-services-tiers)
7. [Disponibilité et évolutions](#7-disponibilité-et-évolutions)
8. [Conservation et fin du compte](#8-conservation-et-fin-du-compte)
9. [Force majeure](#9-force-majeure)
10. [Exclusion de garanties (EN L'ÉTAT)](#10-exclusion-de-garanties-en-létat)
11. [Limitation de responsabilité](#11-limitation-de-responsabilité)
12. [Indemnisation](#12-indemnisation)
13. [Propriété intellectuelle et licence open source](#13-propriété-intellectuelle-et-licence-open-source)
14. [Conditions pour les opérateurs auto-hébergés](#14-conditions-pour-les-opérateurs-auto-hébergés)
15. [Modifications des conditions](#15-modifications-des-conditions)
16. [Nous contacter](#16-nous-contacter)

- [Annexe : petit glossaire](#annexe--petit-glossaire)

## 1. Champ d'application et définitions

- **« Le Service »** : l'ensemble des fonctionnalités exécutées sur une instance EpoCanvas Mail donnée, y compris l'application web, l'API ouverte et les composants associés.
- **« L'opérateur / nous »** : la personne ou l'équipe qui a déployé et exploite l'instance que vous utilisez. Pour l'instance hébergée `mail.epocanvas.com`, il s'agit de l'équipe d'exploitation EpoCanvas ; pour une instance auto-hébergée, de la personne qui l'a déployée.
- **« Vous »** : toute personne physique ou organisation qui s'inscrit, se connecte ou utilise autrement le Service.
- **Application à double voie** : EpoCanvas Mail est un logiciel open source et n'importe qui peut déployer sa propre instance. Les présentes conditions sont un **modèle général** : les instances hébergées les appliquent directement, et les opérateurs auto-hébergeurs peuvent les adapter comme conditions de leur site. Où que vous vous inscriviez, vous contractez avec l'opérateur de ce site.
- **Conditions additionnelles** : lorsque vous utilisez des fonctions tierces (livraison sortante, traduction IA, Telegram, connexion Linux DO, etc.), vous acceptez aussi les conditions du tiers concerné (voir la [section 6](#6-livraison-sortante-et-services-tiers)) ; les questions de confidentialité relèvent de la [Politique de confidentialité](/fr/mail/privacy-policy/).

## 2. Présentation du Service

![Schéma des responsabilités d'EpoCanvas Mail : le projet open source amont (licence MIT) fournit le code source ; l'instance que vous utilisez est exploitée de manière indépendante et son opérateur en porte la responsabilité ; votre compte et vos données de messagerie résident dans les ressources Cloudflare de cette instance](/images/mail/self-host-responsibilities.svg)

*Légende : les auteurs amont du logiciel open source n'exploitent aucun service de messagerie et ne répondent du comportement d'aucune instance ; il n'existe aucun contrat de service entre vous et l'amont.*

Le Service comprend : la gestion multi-boîtes, les e-mails internes et externes, les pièces jointes, les libellés et favoris, la quarantaine anti-spam, les reports (snooze), la recherche, la traduction IA (facultative), la reconnaissance des codes de vérification (facultative), la poussée Telegram (facultative), la double authentification (TOTP/Passkey), une plateforme OAuth et l'export des données. Les fonctionnalités réelles dépendent de ce que votre instance a activé.

**L'identité open source** : le Service est construit sur un projet open source publié sous licence MIT et en poursuit la voie. Concrètement : le code source est public et auditable ; vous pouvez le déployer vous-même pour obtenir les mêmes capacités ; et le logiciel est fourni « en l'état » (voir la section 10).

## 3. Comptes et sécurité

1. **Inscription sincère** : l'inscription ne requiert qu'une adresse e-mail de réception valide et un mot de passe. N'usurpez pas l'identité d'autrui et n'utilisez pas des domaines que vous n'avez pas le droit d'utiliser.
2. **Conservation des identifiants** : vous êtes responsable de votre mot de passe, de vos identifiants de double authentification et de vos jetons d'API. Les actions effectuées avec vos identifiants sont réputées être les vôtres.
3. **Double authentification** : TOTP ou clés d'accès sont fortement recommandés. Sur les instances en « mode de messagerie chiffré », l'opérateur peut exiger la double authentification au titre de sa politique de sécurité.
4. **Protection de la connexion** : 5 échecs de mot de passe consécutifs verrouillent la connexion pendant 12 heures ; un compte conserve au maximum 10 sessions actives, et vous pouvez vous déconnecter depuis n'importe quel appareil pour révoquer son jeton immédiatement.
5. **Noms réservés** : les identifiants tels que `admin` sont réservés par le système et ne peuvent pas être enregistrés par des utilisateurs ordinaires.
6. **Clés d'inscription** : les opérateurs peuvent configurer l'instance pour exiger une clé d'inscription ou fermer les inscriptions — c'est un droit de gestion propre à l'instance.
7. **Conditions d'éligibilité** : vous devez avoir l'âge minimum indiqué à la section 11 de la [Politique de confidentialité](/fr/mail/privacy-policy/) et vous assurer que votre inscription et votre usage respectent les lois qui vous concernent.

## 4. Politique d'utilisation acceptable

### 4.1 Vous vous engagez à ne pas utiliser le Service pour

**Agissements illégaux et nuisibles**

- Envoyer, stocker ou diffuser du contenu enfreignant les lois de votre ressort ou celui de l'opérateur, y compris mais sans s'y limiter : les contenus d'exploitation sexuelle infantile (tolérance zéro — tout contenu découvert est supprimé et signalé conformément à la loi), l'extrémisme violent, le trafic de drogues et d'armes, les fraudes et pages de hameçonnage ;
- Distribuer des logiciels malveillants, virus ou rançongiciels, ou envoyer des e-mails conçus pour voler des identifiants.

**Spam et abus**

- Envoyer des e-mails commerciaux en masse non sollicités (spam / UBE / UCE), du marketing à des destinataires n'ayant pas consenti, ou utiliser le Service pour l'échauffement de boîtes ou le bombardement massif de vérification d'adresses ;
- Créer des comptes en masse par programmation, contourner la vérification humaine (Turnstile), les clés d'inscription ou les quotas ;
- Utiliser le Service comme relais d'anonymisation ou réservoir d'envois jetables, ou se réinscrire à répétition pour échapper aux sanctions.

**Attaques et entraves**

- Scanner, sonder ou lancer des attaques par force brute contre ce Service ou des systèmes tiers ; tenter d'accéder sans autorisation aux boîtes d'autrui, aux interfaces d'administration ou aux données d'autres utilisateurs ;
- Consommer la traduction IA, les pièces jointes, l'API ou d'autres ressources partagées au point de dégrader l'usage normal des autres utilisateurs ;
- Harceler, diffamer ou exercer un harcèlement juridique contre Cloudflare ou la communauté open source amont.

**Atteintes aux droits**

- Porter atteinte à la propriété intellectuelle, à la vie privée ou à l'image d'autrui ; usurper l'identité d'un expéditeur pour se faire passer pour une personne ou une organisation ;
- Enfreindre les conditions d'utilisation de services tiers (Cloudflare, Resend, Mailjet, Telegram, etc.).

### 4.2 Conséquences

Selon la nature et la gravité de la violation, l'opérateur peut : avertir → limiter les fonctionnalités → mettre en quarantine anti-spam → suspendre le compte → supprimer physiquement le compte et toutes ses données. En cas d'agissements illégaux, l'opérateur peut conserver les preuves nécessaires et coopérer avec les autorités compétentes. Si votre comportement vaut à l'opérateur une sanction de Cloudflare ou d'un fournisseur amont, l'opérateur se réserve le droit d'en obtenir réparation auprès de vous (voir la section 12).

### 4.3 Recours et signalement

Si vous estimez que la mesure est erronée, contactez l'opérateur par les canaux indiqués à la [section 16](#16-nous-contacter) ; l'opérateur réexaminera et répondra dans un délai raisonnable. Nous vous encourageons également à signaler les violations d'autrui ou les problèmes de sécurité (sources de spam, pages de hameçonnage, tentatives d'accès non autorisé) — les signalements de bonne foi sont tous traités avec sérieux ; les contenus soupçonnés d'être illicites (surtout les contenus d'exploitation sexuelle infantile) seront signalés aux autorités compétentes conformément à la loi.

## 5. Votre contenu et licence

1. **La propriété est la vôtre** : les e-mails que vous envoyez et recevez, ainsi que leurs pièces jointes, vous appartiennent — et la responsabilité aussi. L'opérateur n'utilisera pas votre contenu à des fins publicitaires, d'entraînement de modèles ou de cession.
2. **Une licence de traitement limitée** : pour vous fournir stockage, livraison, recherche, notifications et (facultatifs) traduction, vous accordez à l'opérateur une licence de traitement technique **strictement limitée à l'exploitation du Service**. Lorsque vous cessez d'utiliser le Service et que vos données sont supprimées, la licence prend fin.
3. **Vous répondez de ce que vous envoyez** : chaque message que vous envoyez vous engage. Les litiges et responsabilités nés de votre contenu envoyé sont les vôtres.
4. **La frontière de la modération** : l'opérateur ne relit pas en principe vos e-mails normaux ; mais sur les instances en « mode tous les e-mails », les administrateurs peuvent techniquement lire l'ensemble du courrier (en mode privé, seuls les spams/messages supprimés/sans destinataire), et agiront sur signalement ou demande légale. Comprenez le mode d'une instance avant de la choisir.

## 6. Livraison sortante et services tiers

1. **La livraison sortante repose sur des tiers** : les e-mails adressés hors de l'instance passent par le canal configuré par l'opérateur (Cloudflare Email Workers, Resend ou Mailjet). La livraison tierce peut être retardée, rejetée ou bloquée par le fournisseur destinataire ; l'opérateur ne garantit pas le résultat de la livraison sortante.
2. **Les fonctions facultatives entraînent des conditions tierces** : la poussée Telegram, la traduction IA, la connexion Linux DO, le stockage S3 externe et fonctions similaires sont, lorsque vous les utilisez, également régies par les conditions des tiers correspondants.
3. **La plateforme OAuth** : si vous autorisez une application tierce via OAuth, les étendues (openid / profile / email) et les contrôles de révocation sont décrits à la section 9 de la Politique de confidentialité ; l'utilisation de vos données par l'application relève de ses propres conditions.

## 7. Disponibilité et évolutions

- **Au mieux, sans SLA** : le Service fonctionne sur l'infrastructure de périphérie gratuite ou facturée à l'usage de Cloudflare. L'opérateur déploie des efforts raisonnables pour la disponibilité, sans promettre 100 % de disponibilité, des délais de livraison ni des délais de rétablissement.
- **Fonctionnalités évolutives** : le projet open source itère rapidement ; des fonctionnalités peuvent être ajoutées, modifiées ou retirées. Les changements importants touchant à la suppression des données seront annoncés à l'avance.
- **Maintenance et interruptions** : l'opérateur peut suspendre tout ou partie du Service pour mises à niveau, corrections ou traitement des abus ; les indisponibilités causées par Cloudflare ou par des fournisseurs amont d'IA/de livraison ne constituent pas un manquement de l'opérateur.
- **Fonctions expérimentales** : les fonctions marquées « expérimental » ou en phase de test (comme la traduction OCR d'images) sont fournies « en l'état », peuvent être instables et peuvent changer ou disparaître à tout moment — le risque de les employer pour un usage critique est le vôtre.

## 8. Conservation et fin du compte

1. **Vous y mettez fin** : vous pouvez à tout moment désactiver votre compte dans les réglages ou demander la suppression à l'opérateur. La désactivation invalide immédiatement vos sessions ; le courrier entre dans un état de suppression logique récupérable jusqu'à ce qu'un administrateur effectue la suppression physique.
2. **Nettoyage de routine** : les spams mis en quarantaine 7 jours passent à la corbeille ; le courrier de la corbeille est physiquement supprimé (pièces jointes comprises) 7 jours après réception par la routine quotidienne. **La suppression est irréversible — exportez d'abord une copie JSON via « Export des données ».**
3. **L'opérateur y met fin** : si vous enfreignez la [section 4](#4-politique-dutilisation-acceptable), l'opérateur peut suspendre ou résilier votre accès et agir conformément à la section 4.2. La politique applicable aux comptes longtemps inactifs est publiée par l'opérateur.

## 9. Force majeure

Les interruptions de service et pertes de données causées par un cas de force majeure — catastrophes naturelles, guerre, actes gouvernementaux, pannes de réseau fédérateur, cyberattaques massives, ou arrêt ou changement de politique de fournisseurs tiers (Cloudflare, Resend, Mailjet, Telegram, services d'IA, etc.) — n'engagent pas la responsabilité de l'opérateur lorsque des efforts raisonnables ont été déployés.

## 10. Exclusion de garanties (EN L'ÉTAT)

Le Service (logiciel compris) est fourni **« en l'état » et « selon la disponibilité »**, sans garantie d'aucune sorte, expresse ou implicite, y compris les garanties de qualité marchande, d'adéquation à un usage particulier et de non-contrefaçon. Cela reflète le périmètre d'exclusion de la **licence MIT** du logiciel : **en aucun cas l'opérateur ni les auteurs open source amont ne seront responsables de toute réclamation, dommage ou autre responsabilité nés de ou en relation avec le Service ou son utilisation.**

## 11. Limitation de responsabilité

Dans toute la mesure permise par la loi, la responsabilité cumulée de l'opérateur envers vous n'excédera pas le plus élevé de : (a) ce que vous avez effectivement payé à l'opérateur au cours des 12 derniers mois (généralement zéro pour les instances gratuites) ; (b) 100 USD. L'opérateur n'est pas responsable des dommages indirects, pertes de données, pertes de profits ou atteintes à la réputation. **Sauvegardez vous-même vos e-mails importés ailleurs.**

## 12. Indemnisation

Si votre violation des présentes conditions, votre atteinte aux droits d'autrui ou votre comportement illégal expose l'opérateur, les auteurs open source amont ou leurs sociétés affiliées à des réclamations de tiers (y compris les sanctions et coûts de traitement des plaintes de Cloudflare ou d'autres fournisseurs), vous acceptez de les indemniser et de les tenir indemnes dans la mesure permise par la loi.

## 13. Propriété intellectuelle et licence open source

1. **Licence du code** : le code source du logiciel est concédé sous **licence MIT**, Copyright (c) 2025 eoao (amont) et les contributeurs de ce projet. La licence MIT régit le code lui-même ; les présentes conditions régissent l'utilisation du Service — aucune ne remplace l'autre.
2. **Remerciements** : le Service est construit sur le projet open source amont (auteur eoao) — merci à l'amont et à la communauté open source.
3. **Votre contenu** : les droits sur les avatars, noms et autres éléments que vous téléchargez restent les vôtres ou ceux de leurs ayants droit.
4. **Courtoisie de marque** : si vous conservez le nom et le logo « EpoCanvas Mail » sur votre instance auto-hébergée, signalez clairement qu'il s'agit d'une instance communautaire déployée indépendamment, afin d'éviter toute confusion.

## 14. Conditions pour les opérateurs auto-hébergés

Si vous êtes l'opérateur d'une instance auto-hébergée :

- Vous portez la pleine responsabilité d'opérateur de votre instance : application de l'usage acceptable, traitement des recettes utilisateurs, adaptation de la politique de confidentialité et des présentes conditions, obligations légales de conservation et de coopération ;
- Vous devez copier, adapter et publier ce document sur votre site, en remplaçant les coordonnées et le responsable ;
- Les auteurs open source amont et les mainteneurs de ce projet **n'assument aucune responsabilité solidaire de votre exploitation** ;
- Si vous facturez vos utilisateurs, assurez-vous vous-même de la conformité aux exigences locales d'exploitation, fiscales et de protection du consommateur.

## 15. Modifications des conditions

Les présentes conditions peuvent être révisées avec l'évolution du Service. Les changements importants seront annoncés par annonce sur le site ou courrier système, avec mise à jour de la date d'entrée en vigueur et de la version en haut de page. Continuer à utiliser le Service après l'entrée en vigueur d'un changement vaut acceptation ; si vous êtes en désaccord, cessez de l'utiliser et exportez ou supprimez vos données. Les révisions majeures passées sont archivées dans l'historique des versions du dépôt open source et peuvent être consultées à tout moment.

## 16. Nous contacter

- **Instance hébergée (`mail.epocanvas.com`)** : messagerie du produit ou e-mail à `admin@epocanvas.com` ;
- **Le projet open source** : issues sur le dépôt GitHub ;
- **Sites auto-hébergés** : le contact opérateur publié sur le site concerné.

---

## Annexe : petit glossaire

| Terme | Explication en une phrase |
| --- | --- |
| **Le Service / instance** | Toutes les fonctionnalités exécutées sur un déploiement EpoCanvas Mail (application web, API et composants) |
| **Opérateur** | Celui ou celle qui a déployé et exploite l'instance — le « nous » des présentes conditions et l'interlocuteur responsable de vos données et de votre usage |
| **Hébergé / auto-hébergé** | Hébergé = `mail.epocanvas.com`, exploité par l'équipe EpoCanvas ; auto-hébergé = une instance déployée par vous ou un tiers |
| **Votre contenu** | Les e-mails, pièces jointes et profil que vous envoyez, recevez et téléversez ; la propriété et la responsabilité sont les vôtres |
| **Licence de traitement** | L'autorisation technique limitée que vous accordez à l'opérateur pour que stockage, livraison, recherche, notifications et fonctions similaires fonctionnent (section 5) |
| **Politique d'utilisation acceptable** | Les limites des conduites permises et interdites de la section 4, avec les conséquences graduées de la section 4.2 |
| **Suppression logique / physique** | Logique = marquée comme supprimée, récupérable par les administrateurs ; physique = retirée du stockage avec pièces jointes et index, irrécupérable |
| **SLA** | Accord de niveau de service (engagements de disponibilité et de réponse) ; ce Service est fourni au mieux, sans SLA |

---

*Les présentes conditions, ensemble avec la [Politique de confidentialité](/fr/mail/privacy-policy/), forment l'accord complet entre vous et l'opérateur. Ce document est un modèle général rédigé par la communauté open source et ne constitue pas un avis juridique ; les opérateurs devraient consulter un avocat qualifié avant tout usage commercial.*
