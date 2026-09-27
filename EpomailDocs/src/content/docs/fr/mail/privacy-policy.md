---
title: Politique de confidentialité (Privacy Policy)
description: Politique de confidentialité d'EpoCanvas Mail — les informations que nous collectons, la manière dont nous les utilisons et les protégeons, le moment et les tiers avec lesquels elles sont partagées, ainsi que les contrôles dont vous disposez.
---

# Politique de confidentialité

**Date d'entrée en vigueur : 27 septembre 2026　|　Version : 1.0**

EpoCanvas Mail (le « Service » ou le « Logiciel ») est un **service de messagerie open source** construit sur la pile Cloudflare (Workers, D1, KV, R2) et publié sous licence MIT. Il peut fonctionner comme un site de messagerie hébergé public (par exemple `mail.epocanvas.com`) ou être auto-hébergé par n'importe qui comme service de messagerie privé.

L'objectif de cette politique est simple : **expliquer en langage clair où vont vos données, qui peut les voir et ce que vous pouvez en faire.** Nous n'affichons aucune publicité, ne traçons aucun utilisateur et ne vendons aucune donnée — chaque section ci-dessous précise ce que cette phrase signifie concrètement.

:::note[Résumé en 30 secondes]
- **Ce que nous collectons** : votre adresse e-mail, votre mot de passe (uniquement sous forme de hachage salé — personne, y compris l'opérateur, ne peut retrouver votre mot de passe d'origine), le contenu et les pièces jointes des e-mails que vous envoyez et recevez, ainsi que votre IP de connexion et les informations sur votre appareil.
- **Ce que nous n'en faisons jamais** : aucun ciblage publicitaire, aucune vente à des tiers, aucun SDK de statistiques ou de traçage.
- **Qui est responsable** : l'opérateur de l'instance que vous utilisez est le « responsable du traitement » de vos données. EpoCanvas Mail, en tant que logiciel open source, ne collecte et ne transmet rien par lui-même.
- **Vous pouvez à tout moment** : exporter tous vos e-mails (JSON), supprimer des messages et votre compte, activer l'authentification à deux facteurs et révoquer les autorisations des applications tierces.
- **Les tiers à connaître** : lorsque vous cliquez sur « Traduire », le texte de l'e-mail est envoyé au service de traduction IA configuré sur votre instance ; lorsque l'opérateur active la livraison sortante, les e-mails externes transitent par Resend ou Mailjet. Voir la [section 6](#6-services-tiers-et-partage-des-données).
:::

## 1. À qui s'applique cette politique

« EpoCanvas Mail » a deux identités — commencez par déterminer laquelle vous concerne :

| Identité | Qui | Rôle en matière de confidentialité |
| --- | --- | --- |
| **Le logiciel open source** | Le dépôt de code source publié sous licence MIT sur GitHub | Le logiciel lui-même **ne collecte et ne transmet rien** — zéro télémétrie, zéro statistique, zéro SDK publicitaire intégré |
| **L'instance que vous utilisez** | La personne ou l'équipe qui exploite un site EpoCanvas Mail donné (par exemple, l'opérateur du site hébergé `mail.epocanvas.com`, ou un site auto-hébergé par votre entreprise ou votre communauté) | Le **responsable du traitement** de vos données, légalement responsable des finalités de collecte, de la conservation et des réponses aux demandes de suppression |

:::tip[En une phrase]
Le logiciel est un outil ; l'opérateur, c'est « nous ». Quel que soit le site sur lequel vous vous êtes inscrit, c'est l'opérateur de ce site qui est responsable de vos données au titre de cette politique (ou de sa version adaptée).
:::

Les auto-hébergeurs peuvent adopter directement cette politique comme déclaration de confidentialité de leur site, en remplaçant les coordonnées et les détails d'exploitation conformément à la [section 13](#13-guide-de-lopérateur-auto-hébergé).

## 2. Les informations que nous collectons

Classées selon la manière dont elles entrent dans le système.

### 2.1 Les informations que vous fournissez

- **Adresse e-mail** : votre identifiant de compte (par ex. `vous@exemple.com`). Le nom d'utilisateur correspond par défaut à la partie locale de l'adresse et, s'il est déjà pris sur le site, revient à l'adresse e-mail complète.
- **Mot de passe** : conservé uniquement sous forme de **hachage PBKDF2-HMAC-SHA256 (100 000 itérations + un sel aléatoire unique par utilisateur)**. Il s'agit d'une transformation à sens unique — même l'opérateur ne peut pas retrouver votre mot de passe d'origine depuis la base de données.
- **Identifiants de double authentification (facultatifs)** : si vous activez TOTP, le secret est stocké chiffré avec AES-256-GCM ; les codes de secours ne sont conservés que sous forme de hachages SHA-256 ; si vous enregistrez une clé d'accès (passkey), seule la clé publique est stockée.
- **Détails de profil (facultatifs)** : nom d'affichage, avatar, biographie, etc. Les images d'avatar sont téléversées vers le service de stockage d'images configuré par l'opérateur.

### 2.2 Le contenu de vos e-mails

Les messages que vous envoyez et recevez via le Service — expéditeur, destinataires, objet, corps, horodatages et autres métadonnées, ainsi que les libellés, favoris, états de lecture et reports que vous appliquez — sont stockés dans la base de données et le stockage d'objets de l'instance. Les pièces jointes sont stockées dans Cloudflare R2, un stockage compatible S3 configuré par l'opérateur (comme Backblaze B2), ou, en secours, dans KV.

### 2.3 Les informations techniques collectées automatiquement

- **Registres d'inscription et de connexion** : chaque inscription et connexion enregistre votre adresse IP et le User-Agent de votre navigateur, à partir desquels le système d'exploitation, le navigateur et le type d'appareil sont déduits. Ces informations servent à l'audit de sécurité (par ex. détecter des connexions inhabituelles) et au contrôle des quotas.
- **Jetons de session** : après connexion, un JWT (valable 30 jours) est stocké dans le localStorage de votre navigateur. Le Service **n'utilise pas de cookies** et il n'existe aucun cookie de suivi intersites.
- **Métadonnées de requêtes** : l'infrastructure sous-jacente (Cloudflare) traite les requêtes sur son réseau de périphérie et peut consigner des métadonnées de connexion et des journaux d'exécution selon ses propres politiques.

### 2.4 Ce que nous ne collectons délibérément pas

Cette liste compte autant que la précédente :

- ❌ **Pas de traçage publicitaire** : aucun SDK publicitaire, aucun profilage comportemental, aucun cookie intersites.
- ❌ **Pas de statistiques tierces** : ni Google Analytics, ni Plausible, ni aucun suivi d'événements.
- ❌ **Pas de vente de données** : vos données ne sont jamais vendues, louées ou échangées à des fins publicitaires — en aucune circonstance.
- ❌ **Aucune télémétrie** : le logiciel open source ne « rapporte » jamais les données d'une instance aux auteurs amont ou à qui que ce soit. Les données d'un déploiement que vous gérez restent entièrement dans votre propre compte Cloudflare.

## 3. Où vont vos données : un schéma

![Schéma du flux de données d'EpoCanvas Mail : votre navigateur atteint le Cloudflare Worker en HTTPS ; le contenu des e-mails est stocké dans la base D1, KV et le stockage d'objets R2 ; les e-mails sortants sont livrés via Resend ou Mailjet ; la poussée Telegram et la traduction IA n'ont lieu que si elles sont activées ou déclenchées par vous](/images/mail/data-flow.svg)

*Légende : vos données de messagerie reposent dans le compte Cloudflare de vous (ou de votre opérateur). Seuls les trois canaux à interrupteur à droite — livraison sortante, notifications poussées et traduction IA — font sortir des données de l'instance, chacun avec un déclencheur clair ; voir les sections 6 et 7.*

## 4. Comment nous utilisons les informations

| Finalité | Informations utilisées | Remarques |
| --- | --- | --- |
| Fournir le service de messagerie | Adresse e-mail, contenu des messages, pièces jointes | La fonction principale ; le service ne peut fonctionner sans |
| Protection du compte et de la sécurité | Hachage du mot de passe, IP/UA de connexion, TOTP/Passkey | Détection de connexions inhabituelles et verrouillage (5 échecs consécutifs verrouillent la connexion pendant 12 heures) |
| Extraction des codes de vérification (facultatif) | Objet et extrait du corps des nouveaux messages | Lorsqu'elle est activée par l'opérateur, Workers AI extrait les codes de vérification pour les copier en un geste |
| Annonces système | Adresse e-mail, préférence de langue | Le courrier de bienvenue officiel et les annonces du site sont délivrés dans la langue de votre interface |
| Protection anti-spam | Adresse de l'expéditeur, contenu des messages | Les opérateurs peuvent configurer des listes noires et des règles de filtrage ; la quarantaine anti-spam est purgée automatiquement après 7 jours |
| Gestion des quotas de stockage | Taille des pièces jointes, usage de la boîte | Empêche qu'un seul utilisateur n'épuise les ressources partagées |

Nous n'utilisons **pas** vos informations pour des décisions automatisées, du profilage ou toute finalité commerciale sans rapport avec le Service.

## 5. Stockage, chiffrement et sécurité

### 5.1 Où les données résident

Toutes les données sont stockées dans le compte Cloudflare propre de l'opérateur de l'instance : les données structurées (utilisateurs, messages, réglages) dans la base D1 (SQLite), les caches et sessions dans KV, et les pièces jointes dans R2 ou un stockage compatible S3. Les auteurs amont d'EpoCanvas Mail **ne détiennent aucune donnée et n'y ont aucun accès**.

### 5.2 Le chiffrement selon les trois modes de messagerie

Le Service propose trois modes de stockage, choisis par l'opérateur :

| Mode | État de stockage des messages | Qui peut lire vos e-mails |
| --- | --- | --- |
| **Mode « tous les e-mails »** | Stockage en clair | L'opérateur (les administrateurs) peut lire les e-mails de tous les utilisateurs |
| **Mode privé** (par défaut) | Les e-mails normaux sont chiffrés au repos avec AES-256-GCM | Les administrateurs ne touchent que les spams, les messages supprimés et les messages sans destinataire — ils ne peuvent pas parcourir votre boîte de réception normale |
| **Mode chiffré** | Tout est chiffré, y compris la corbeille | Les interfaces d'administration du courrier ne renvoient aucun e-mail utilisateur |

:::caution[Une note honnête sur les limites du chiffrement]
Il s'agit d'un **chiffrement au repos côté serveur** : les clés sont dérivées des variables d'environnement du serveur de l'instance et de votre identifiant utilisateur. Cela signifie qu'**un opérateur qui contrôle le serveur et les clés est techniquement capable de déchiffrer** — cela protège contre des scénarios comme le vol direct du fichier de base de données ou la fuite d'un instantané, mais ce n'est **pas** un chiffrement de bout en bout (E2EE) ; l'opérateur n'est pas absolument dans l'impossibilité de lire votre courrier. Si vous souhaitez une confidentialité que même l'opérateur ne peut pas contourner, ne vous fiez pas au mode de chiffrement d'une messagerie — chiffrez vous-même le corps du message avec un outil E2EE dédié (comme GPG) avant de l'envoyer.
:::

### 5.3 Sécurité des transports et des accès

- Tout le site est servi en HTTPS/TLS ; les points sensibles comme la connexion disposent d'une limitation de débit et d'un verrouillage en cas d'échec.
- Double authentification : TOTP (RFC 6238) et clés d'accès FIDO2 (empreinte / visage) sont pris en charge et vivement recommandés.
- Gestion des sessions : 10 sessions simultanées au maximum par compte ; vous pouvez vous déconnecter depuis n'importe quel appareil et le jeton est révoqué immédiatement.
- Pouvoirs des administrateurs (divulgués honnêtement) : selon les permissions de rôle, les administrateurs d'instance peuvent réinitialiser les mots de passe, forcer la réinitialisation de la double authentification, bannir ou supprimer des comptes, consulter les IP d'inscription et les listes d'appareils des utilisateurs et — en mode « tous les e-mails » — lire le courrier des utilisateurs. **Choisir une instance, c'est faire confiance à son opérateur** ; prenez cela aussi au sérieux que le choix d'un fournisseur de messagerie.

## 6. Services tiers et partage des données

Notre principe : **les données qui n'ont pas besoin de sortir ne sortent jamais ; et pour celles qui doivent sortir, le tableau ci-dessous indique exactement par quelle porte elles passent et ce qu'elles emportent.**

| Tiers | Rôle | Quand c'est déclenché | Ce qui est partagé |
| --- | --- | --- | --- |
| **Cloudflare** | Infrastructure (environnement d'exécution, stockage D1/KV/R2, routage e-mail, vérification humaine, Workers AI, journaux) | En permanence | Métadonnées de requêtes, contenu stocké, demandes de vérification |
| **Resend / Mailjet** | Fournisseurs de livraison sortante | Uniquement lorsque vous envoyez un e-mail à un destinataire hors de l'instance et que l'opérateur a configuré un canal de livraison | Le message complet (destinataires, objet, corps, pièces jointes) |
| **Telegram** | Notifications instantanées | Uniquement lorsque vous (ou l'opérateur) avez lié un bot Telegram et activé la poussée | Configurable : objet, expéditeur (masquable), corps (masquable), codes de vérification, lien de consultation (valable 7 jours) |
| **Fournisseurs de traduction IA** (point de relais configuré sur l'instance, Cloudflare Workers AI, MyMemory, endpoint public Google Translate) | Traitement de traduction | **Uniquement lorsque vous cliquez sur « Traduire »** | Le texte de l'e-mail à traduire (le passage complet dans la mesure du possible ; des fragments tronqués en repli) ; les images pour la traduction OCR |
| **Service de téléversement d'images** | Stockage des avatars et images | Uniquement lorsque vous téléversez un avatar ou similaire | Le fichier image lui-même |
| **Linux DO** | Identité de connexion tierce | Uniquement lorsque vous vous connectez avec un compte Linux DO | L'échange OAuth renvoie votre identifiant utilisateur, votre nom, votre avatar et votre niveau de confiance |
| **Google Fonts** | Chargement des polices de l'interface | Lorsque votre navigateur charge la page | Requêtes de polices (votre IP figure dans les journaux de requêtes de Google) |
| **S3, Turso, etc. configurés par vous/l'opérateur** | Stockage externe | Uniquement lorsqu'un stockage/base de données externe est configuré | Pièces jointes ou copies de données |

:::tip[Ce que signifie concrètement « nous ne vendons pas de données »]
Aucun des tiers ci-dessus ne reçoit vos données à des fins publicitaires, et nous n'entretenons avec aucun d'eux de relation de vente de données ou de partage de revenus publicitaires. Certains (comme Cloudflare et Resend) traitent les données en tant que « sous-traitants » sur instruction de l'opérateur, chacun étant régi par sa propre politique de confidentialité (consultable sur son site).
:::

## 7. Fonctionnalités d'IA

Le Service embarque trois capacités d'IA ; leurs déclencheurs et frontières de données sont les suivants :

1. **Extraction des codes de vérification** (activation facultative par l'opérateur) : à l'arrivée d'un nouveau message, le système envoie l'objet et les 6 000 premiers caractères du corps à Cloudflare Workers AI pour en extraire le code de vérification, que vous pouvez copier depuis la liste ou une notification Telegram. C'est le seul traitement d'IA qui se produit **sans déclenchement manuel** — si vous ne le souhaitez pas, demandez à l'opérateur de le désactiver ou choisissez une instance sans cette fonction.
2. **Traduction IA des e-mails** (déclenchée par vous) : cliquer sur « Traduire » envoie le texte du message, par segments, au point de terminaison de grand modèle configuré sur l'instance (compatible OpenAI par défaut) avec basculement multi-modèles ; lorsque les modèles sont indisponibles, l'endpoint MyMemory ou l'endpoint public Google Translate sert de repli. **Pas de clic, pas de transfert.**
3. **Traduction OCR des images** (déclenchée par vous) : les images contenant du texte sont reconnues et traduites ; l'image est envoyée aux fournisseurs d'IA ci-dessus. Les images décoratives, logos et icônes sont ignorés automatiquement et ne quittent jamais l'instance.

Les fonctions d'IA ne sont pas raccordées à l'entraînement de modèles : le système n'utilise pas votre courrier pour entraîner un modèle et n'envoie aux fournisseurs d'IA aucune identité d'utilisateur au-delà du texte nécessaire à la traduction.

## 8. Conservation et suppression

| Données | Conservation |
| --- | --- |
| E-mails de la boîte de réception normale | Conservés jusqu'à leur suppression manuelle ou un nettoyage lié au quota |
| Spams | Mis en quarantaine pendant **7 jours**, puis déplacés vers la corbeille |
| E-mails de la corbeille | **Supprimés physiquement** (binaires des pièces jointes et index compris) par la routine quotidienne **7 jours après réception** |
| E-mails d'un compte supprimé | La désactivation en libre-service est une **suppression logique** : le courrier reste en base (techniquement récupérable) jusqu'à ce qu'un administrateur le supprime physiquement ; après une suppression physique, profil, boîtes, messages, pièces jointes, autorisations OAuth et sessions sont définitivement éliminés |
| Registres de connexion (IP/UA) | Conservés dans le profil utilisateur jusqu'à la suppression physique du compte |
| Jetons de session | Révoqués côté serveur à la déconnexion ; expirent naturellement après 30 jours d'inactivité |

:::caution[Exportez avant de supprimer]
La suppression physique est irréversible. Pour emporter vos données, utilisez d'abord « Réglages → Export des données » afin de télécharger une copie JSON (votre profil complet et le corps intégral de tous les messages non supprimés).
:::

## 9. Vos contrôles et vos droits

Quel que soit votre ressort juridique, le Service intègre ces outils en libre-service :

- **Portabilité des données** : export en un clic de votre profil complet et de tous les messages (JSON, lisible) depuis la page des réglages.
- **Effacement** : supprimez des messages un à un (effacés physiquement après 7 jours), désactivez vous-même votre compte ou demandez à l'opérateur une suppression physique immédiate.
- **Accès et rectification** : consultez et modifiez à tout moment votre nom d'affichage, votre avatar, votre préférence de langue et vos préférences de messagerie dans les réglages.
- **Interrupteur de profil public** : votre page de profil public n'est visible par défaut que de vous et des administrateurs. Lorsqu'elle est activée, votre adresse e-mail, votre nom d'affichage, votre avatar, votre date d'inscription et vos statistiques d'envoi/réception deviennent visibles publiquement — **entièrement à votre choix**.
- **Gestion des autorisations tierces** : examinez chaque autorisation OAuth sous « Applications tierces » et révoquez-en n'importe laquelle en un clic ; le jeton d'accès correspondant expire immédiatement.
- **Gestion des sessions** : déconnectez-vous depuis n'importe quel appareil pour révoquer son jeton.
- **Opposition et retrait** : désactivez la poussée Telegram, évitez tout transfert IA en ne cliquant jamais sur Traduire, ou choisissez une instance sans extraction de codes de vérification.

Si votre ressort (UE/EEE, Royaume-Uni, Californie, etc.) vous confère des droits légaux supplémentaires (réclamation, limitation du traitement, etc.), contactez l'opérateur de l'instance pour les exercer ; l'opérateur est tenu de répondre dans les délais légaux.

## 10. Communications et notifications

Le Service lui-même ne vous envoie aucun courrier marketing. Les seuls messages officiels que vous pouvez voir dans le produit sont le message de bienvenue et les annonces du site de l'opérateur (délivrés dans le produit par le compte officiel `admin@epocanvas.com`, jamais via un service externe), ainsi que le courrier ordinaire qui vous est adressé par des expéditeurs externes. La poussée Telegram et le transfert vers d'autres boîtes sont désactivés par défaut et peuvent être coupés à tout moment.

## 11. Enfants et mineurs

Le Service ne s'adresse pas aux enfants de moins de 14 ans et les opérateurs ne collectent pas sciemment d'informations personnelles d'enfants. Si vous êtes tuteur légal et pensez que votre enfant nous a transmis des informations personnelles, contactez l'opérateur de l'instance ; après vérification, les données concernées seront supprimées sans délai. Les opérateurs auto-hébergeurs devraient fixer un âge minimum plus élevé selon leur ressort et leur public.

## 12. Transferts internationaux de données

Le Service est construit sur le réseau de périphérie mondial de Cloudflare. Les données peuvent être stockées dans la région Cloudflare choisie par l'opérateur (D1/KV/R2 permettent de choisir l'emplacement) et transiter par n'importe quel nœud de périphérie dans le monde — les données peuvent donc être traitées hors du pays de l'opérateur. Cloudflare offre des garanties de transfert dans le cadre de ses référentiels de conformité (comme les clauses contractuelles types du RGPD) ; voir la documentation de conformité officielle de Cloudflare. Utiliser une instance hébergée signifie que vous comprenez et acceptez cette caractéristique d'infrastructure.

## 13. Guide de l'opérateur auto-hébergé

Si vous avez déployé EpoCanvas Mail sous votre propre domaine, alors juridiquement et factuellement, **vous êtes le « nous » de vos utilisateurs**. Veuillez :

1. **Remplacer les espaces réservés de ce fichier** : e-mail de contact, nom de l'instance, date d'entrée en vigueur — et relire le tableau des tiers de la section 6 (si vous n'avez pas configuré Telegram ou Resend, supprimez les lignes correspondantes).
2. **Choisir et divulguer honnêtement votre mode de messagerie** : le mode « tous / privé / chiffré » que vous retenez détermine directement si la formulation de la section 5.2 est exacte.
3. **Remplir vos obligations de ressort** : si vos utilisateurs relèvent du RGPD (UE), du Royaume-Uni, de la LGPD (Brésil), du CCPA/CPRA (Californie) ou de textes similaires, vous devrez peut-être ajouter les bases légales, un DPA, des durées de conservation légales et des voies de réclamation locales. Ce fichier est un excellent point de départ rédigé par des ingénieurs, **ce n'est pas un avis juridique** — consultez un avocat qualifié avant la mise en production.
4. **Garder la promesse de zéro télémétrie** : votre déploiement hérite par défaut du socle « sans statistiques, sans transmission » ; si vous ajoutez vous-même des statistiques tierces, divulguez-les honnêtement dans votre politique de confidentialité.

## 14. Modifications de cette politique

Cette politique peut évoluer avec les fonctionnalités. Les changements importants (nouveau tiers, modification de la conservation, changement de mode de chiffrement, etc.) seront annoncés à l'avance par annonce sur le site ou courrier système, avec mise à jour de la « date d'entrée en vigueur » et du numéro de version en haut de page. Toute utilisation continue après mise à jour vaut acceptation ; en cas de désaccord après un changement important, vous pouvez cesser d'utiliser le Service et exporter ou supprimer vos données.

## 15. Nous contacter

- **Instance hébergée (`mail.epocanvas.com`)** : contactez l'opérateur via la messagerie du produit ou par e-mail : `admin@epocanvas.com`.
- **Le logiciel open source lui-même** : ouvrez une issue sur le dépôt GitHub du projet.
- **Sites auto-hébergés** : contactez l'opérateur du site que vous utilisez (ses coordonnées devraient être publiées sur ce site).

## Annexe A : relation avec le projet open source

EpoCanvas Mail est construit sur un projet open source sous licence MIT et le poursuit. Le projet amont d'origine a été créé par **eoao** (Copyright (c) 2025 eoao) — merci à l'amont et à tous les contributeurs. Cette politique a été rédigée par la communauté EpoCanvas et est publiée dans le même esprit d'ouverture : **tout opérateur d'une instance EpoCanvas Mail peut librement adopter et adapter ce texte** (esprit MIT, attribution non requise), mais nous vous recommandons de conserver la déclaration d'auto-hébergement de la section 13 afin de garder la même transparence envers vos utilisateurs.
