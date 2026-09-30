/**
 * Epocanvas Mail - Built-in Security Notice Email Templates & Generator
 *
 * Provides hardcoded, multi-lingual (zh, zh-Hant, en, es, fr, nl) notification templates
 * across 4 risk levels (Level 1: Info ➡️ Level 4: Critical) for all account security events.
 *
 * Sender identity: announcement@epocanvas.com
 */

export const SECURITY_EVENT_TYPES = {
  // Level 1: Environmental Awareness (Low Risk / Info)
  NEW_DEVICE_LOGIN: 'NEW_DEVICE_LOGIN',
  NEW_LOCATION_LOGIN: 'NEW_LOCATION_LOGIN',
  NEW_NETWORK_LOGIN: 'NEW_NETWORK_LOGIN',

  // Level 2: Credentials & Forwarding (Medium Risk / Notice)
  PAT_CREATED: 'PAT_CREATED',
  FORWARDING_MODIFIED: 'FORWARDING_MODIFIED',
  TELEGRAM_MODIFIED: 'TELEGRAM_MODIFIED',
  OAUTH_AUTHORIZED: 'OAUTH_AUTHORIZED',

  // Level 3: Core Authentication Factors (High Risk / Alert)
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  TOTP_ENABLED: 'TOTP_ENABLED',
  PASSKEY_ADDED: 'PASSKEY_ADDED',
  BACKUP_CODES_REGENERATED: 'BACKUP_CODES_REGENERATED',

  // Level 4: Security Downgrade & Destruction (Critical / Emergency)
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOTP_DISABLED: 'TOTP_DISABLED',
  PASSKEY_DELETED: 'PASSKEY_DELETED',
  STORAGE_PURGED: 'STORAGE_PURGED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED'
};

export const SECURITY_LEVELS = {
  L1: {
    level: 'L1',
    name: 'INFO',
    primaryColor: '#0284c7',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: '#bae6fd',
    badgeColor: '#0369a1',
    isStarred: false,
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
  },
  L2: {
    level: 'L2',
    name: 'NOTICE',
    primaryColor: '#d97706',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: '#fde68a',
    badgeColor: '#b45309',
    isStarred: false,
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  },
  L3: {
    level: 'L3',
    name: 'ALERT',
    primaryColor: '#ea580c',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    badgeBg: 'rgba(234, 88, 12, 0.12)',
    badgeBorder: '#fed7aa',
    badgeColor: '#c2410c',
    isStarred: true,
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
  },
  L4: {
    level: 'L4',
    name: 'CRITICAL',
    primaryColor: '#dc2626',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: '#fecaca',
    badgeColor: '#b91c1c',
    isStarred: true,
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  }
};

/**
 * Event-to-Level mapping
 */
export const EVENT_LEVEL_MAP = {
  [SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN]: 'L1',
  [SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN]: 'L1',
  [SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN]: 'L1',

  [SECURITY_EVENT_TYPES.PAT_CREATED]: 'L2',
  [SECURITY_EVENT_TYPES.FORWARDING_MODIFIED]: 'L2',
  [SECURITY_EVENT_TYPES.TELEGRAM_MODIFIED]: 'L2',
  [SECURITY_EVENT_TYPES.OAUTH_AUTHORIZED]: 'L2',

  [SECURITY_EVENT_TYPES.PASSWORD_CHANGED]: 'L3',
  [SECURITY_EVENT_TYPES.TOTP_ENABLED]: 'L3',
  [SECURITY_EVENT_TYPES.PASSKEY_ADDED]: 'L3',
  [SECURITY_EVENT_TYPES.BACKUP_CODES_REGENERATED]: 'L3',

  [SECURITY_EVENT_TYPES.ACCOUNT_LOCKED]: 'L4',
  [SECURITY_EVENT_TYPES.TOTP_DISABLED]: 'L4',
  [SECURITY_EVENT_TYPES.PASSKEY_DELETED]: 'L4',
  [SECURITY_EVENT_TYPES.STORAGE_PURGED]: 'L4',
  [SECURITY_EVENT_TYPES.ACCOUNT_DELETED]: 'L4'
};

/**
 * Common i18n vocabulary for metadata labels & layout text
 */
const COMMON_I18N = {
  zh: {
    greeting: '嗨 {name}：',
    timeLabel: '触发时间',
    ipLabel: 'IP 地址',
    locationLabel: '地理位置',
    deviceLabel: '设备与操作系统',
    browserLabel: '客户端浏览器',
    networkLabel: '网络与运营商',
    detailLabel: '操作细节',
    actionBtnText: '前往安全中心管理账户',
    wasYouTitle: '如果是您本人执行的操作：',
    wasYouDesc: '无需采取任何进一步行动，此信件仅供您核对账户动态与安全备查。',
    wasNotYouTitle: '如果这并非您本人所为：',
    wasNotYouDesc: '您的账户可能已遭受安全威胁或未经授权的访问！请立即修改密码并联系系统管理员。',
    officialFooter: '此信件由 Epocanvas Mail 官方安全中心 (announcement@epocanvas.com) 自动发送。为保护您的账户安全，此重要安全通知无法取消订阅。'
  },
  'zh-Hant': {
    greeting: '嗨 {name}：',
    timeLabel: '觸發時間',
    ipLabel: 'IP 位址',
    locationLabel: '地理位置',
    deviceLabel: '裝置與作業系統',
    browserLabel: '用戶端瀏覽器',
    networkLabel: '網路與電信業者',
    detailLabel: '操作細節',
    actionBtnText: '前往安全中心管理帳戶',
    wasYouTitle: '如果是您本人執行的操作：',
    wasYouDesc: '無需採取任何進一步行動，此信件僅供您核對帳戶動態與安全備查。',
    wasNotYouTitle: '如果這並非您本人所為：',
    wasNotYouDesc: '您的帳戶可能已遭受安全威脅或未經授權的存取！請立即修改密碼並聯絡系統管理員。',
    officialFooter: '此信件由 Epocanvas Mail 官方安全中心 (announcement@epocanvas.com) 自動發送。為保護您的帳戶安全，此重要安全通知無法取消訂閱。'
  },
  en: {
    greeting: 'Hi {name},',
    timeLabel: 'Time',
    ipLabel: 'IP Address',
    locationLabel: 'Location',
    deviceLabel: 'Device & OS',
    browserLabel: 'Browser',
    networkLabel: 'Network / ISP',
    detailLabel: 'Details',
    actionBtnText: 'Manage Security Settings',
    wasYouTitle: 'If this was you:',
    wasYouDesc: 'No further action is required. You can safely keep this email for your security records.',
    wasNotYouTitle: 'If this was NOT you:',
    wasNotYouDesc: 'Your account credentials may have been compromised! Change your password immediately and contact support.',
    officialFooter: 'This is an automated security notice from Epocanvas Mail Security (announcement@epocanvas.com). For your protection, essential security alerts cannot be disabled.'
  },
  es: {
    greeting: 'Hola {name}:',
    timeLabel: 'Hora',
    ipLabel: 'Dirección IP',
    locationLabel: 'Ubicación',
    deviceLabel: 'Dispositivo y SO',
    browserLabel: 'Navegador',
    networkLabel: 'Red / ISP',
    detailLabel: 'Detalles',
    actionBtnText: 'Gestionar seguridad de la cuenta',
    wasYouTitle: 'Si fuiste tú:',
    wasYouDesc: 'No es necesario realizar ninguna acción. Puedes conservar este correo para tu registro de seguridad.',
    wasNotYouTitle: 'Si NO fuiste tú:',
    wasNotYouDesc: '¡Las credenciales de tu cuenta pueden haberse visto comprometidas! Cambia tu contraseña de inmediato.',
    officialFooter: 'Este es un aviso de seguridad automatizado de Epocanvas Mail (announcement@epocanvas.com). Por motivos de protección, estas alertas no se pueden desactivar.'
  },
  fr: {
    greeting: 'Bonjour {name},',
    timeLabel: 'Heure',
    ipLabel: 'Adresse IP',
    locationLabel: 'Localisation',
    deviceLabel: 'Appareil et système',
    browserLabel: 'Navigateur',
    networkLabel: 'Réseau / FAI',
    detailLabel: 'Détails',
    actionBtnText: 'Gérer la sécurité du compte',
    wasYouTitle: 'S\'il s\'agissait de vous :',
    wasYouDesc: 'Aucune action supplémentaire n\'est requise. Vous pouvez archiver cet e-mail pour vos dossiers.',
    wasNotYouTitle: 'Si ce n\'était PAS vous :',
    wasNotYouDesc: 'Les identifiants de votre compte ont peut-être été compromis ! Modifiez immédiatement votre mot de passe.',
    officialFooter: 'Ceci est une notification de sécurité automatique d\'Epocanvas Mail (announcement@epocanvas.com). Pour votre protection, ces alertes ne peuvent être désactivées.'
  },
  nl: {
    greeting: 'Hallo {name},',
    timeLabel: 'Tijd',
    ipLabel: 'IP-adres',
    locationLabel: 'Locatie',
    deviceLabel: 'Apparaat en OS',
    browserLabel: 'Browser',
    networkLabel: 'Netwerk / Provider',
    detailLabel: 'Details',
    actionBtnText: 'Beveiligingsinstellingen beheren',
    wasYouTitle: 'Als u dit zelf was:',
    wasYouDesc: 'Er is geen verdere actie vereist. U kunt deze e-mail bewaren voor uw beveiligingsarchief.',
    wasNotYouTitle: 'Als u dit NIET was:',
    wasNotYouDesc: 'Uw accountgegevens zijn mogelijk gecompromitteerd! Wijzig direct uw wachtwoord en meld het incident.',
    officialFooter: 'Dit is een geautomatiseerd beveiligingsbericht van Epocanvas Mail (announcement@epocanvas.com). Ter bescherming kunnen deze meldingen niet worden uitgeschakeld.'
  }
};

/**
 * 16 Event-specific Content Dictionaries across 6 languages
 */
export const EVENT_I18N = {
  [SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN]: {
    zh: {
      badge: '🟢 安全提示',
      subject: '🔔 [安全提示] 检测到新设备登录您的邮箱',
      headline: '检测到新设备登录',
      summary: '您的 Epocanvas Mail 账号刚刚在一个此前未曾记录的新设备上成功登录。',
      detailDesc: '新设备初次会话建立'
    },
    'zh-Hant': {
      badge: '🟢 安全提示',
      subject: '🔔 [安全提示] 偵測到新裝置登入您的信箱',
      headline: '偵測到新裝置登入',
      summary: '您的 Epocanvas Mail 帳號剛剛在一個此前未曾記錄的新裝置上成功登入。',
      detailDesc: '新裝置首次工作階段建立'
    },
    en: {
      badge: '🟢 Security Notice',
      subject: '🔔 [Security Notice] New sign-in from a new device',
      headline: 'New Device Sign-in Detected',
      summary: 'Your Epocanvas Mail account was recently signed in to from a device we haven\'t seen before.',
      detailDesc: 'First session on a new device'
    },
    es: {
      badge: '🟢 Aviso de seguridad',
      subject: '🔔 [Seguridad] Nuevo inicio de sesión desde un nuevo dispositivo',
      headline: 'Nuevo dispositivo detectado',
      summary: 'Se inició sesión en tu cuenta de Epocanvas Mail desde un dispositivo no reconocido anteriormente.',
      detailDesc: 'Primera sesión en nuevo dispositivo'
    },
    fr: {
      badge: '🟢 Avis de sécurité',
      subject: '🔔 [Sécurité] Nouvelle connexion depuis un nouvel appareil',
      headline: 'Nouvel appareil détecté',
      summary: 'Une connexion à votre compte Epocanvas Mail a été effectuée depuis un appareil inconnu.',
      detailDesc: 'Première session sur un nouvel appareil'
    },
    nl: {
      badge: '🟢 Beveiligingsbericht',
      subject: '🔔 [Beveiliging] Nieuwe aanmelding vanaf een nieuw apparaat',
      headline: 'Aanmelding vanaf nieuw apparaat',
      summary: 'Er is zojuist ingelogd op uw Epocanvas Mail-account vanaf een niet eerder herkend apparaat.',
      detailDesc: 'Eerste sessie op nieuw apparaat'
    }
  },

  [SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN]: {
    zh: {
      badge: '🟢 安全提示',
      subject: '🌍 [安全提示] 检测到来自新地点的登录活动',
      headline: '检测到新地理位置登录',
      summary: '您的 Epocanvas Mail 账号刚刚在一个新的城市或国家登录。',
      detailDesc: '异常地理跨度登录'
    },
    'zh-Hant': {
      badge: '🟢 安全提示',
      subject: '🌍 [安全提示] 偵測到來自新地點的登入活動',
      headline: '偵測到新地理位置登入',
      summary: '您的 Epocanvas Mail 帳號剛剛在一個新的城市或國家登入。',
      detailDesc: '異常地理跨度登入'
    },
    en: {
      badge: '🟢 Security Notice',
      subject: '🌍 [Security Notice] New sign-in from a new location',
      headline: 'New Location Sign-in Detected',
      summary: 'Your Epocanvas Mail account was accessed from a new city or country.',
      detailDesc: 'Sign-in from a distinct geographical location'
    },
    es: {
      badge: '🟢 Aviso de seguridad',
      subject: '🌍 [Seguridad] Nuevo inicio de sesión desde una nueva ubicación',
      headline: 'Nueva ubicación detectada',
      summary: 'Se detectó un inicio de sesión en tu cuenta desde una nueva ciudad o país.',
      detailDesc: 'Inicio de sesión en ubicación distante'
    },
    fr: {
      badge: '🟢 Avis de sécurité',
      subject: '🌍 [Sécurité] Nouvelle connexion depuis un nouvel emplacement',
      headline: 'Nouvel emplacement détecté',
      summary: 'Votre compte Epocanvas Mail a été accédé depuis une nouvelle ville ou un nouveau pays.',
      detailDesc: 'Connexion depuis un emplacement géographique inhabituel'
    },
    nl: {
      badge: '🟢 Beveiligingsbericht',
      subject: '🌍 [Beveiliging] Nieuwe aanmelding vanaf een nieuwe locatie',
      headline: 'Aanmelding vanaf nieuwe locatie',
      summary: 'Uw Epocanvas Mail-account is aangemeld vanuit een nieuwe stad of land.',
      detailDesc: 'Aanmelding vanuit een nieuwe geografische locatie'
    }
  },

  [SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN]: {
    zh: {
      badge: '🟡 操作提醒',
      subject: '🌐 [安全提醒] 检测到来自新网络环境的登录',
      headline: '检测到新网络与运营商登录',
      summary: '您的账户登录 IP 来源于新的网络提供商 (ASN) 或代理/VPN 环境。',
      detailDesc: '网络提供商 (ISP/ASN) 切换'
    },
    'zh-Hant': {
      badge: '🟡 操作提醒',
      subject: '🌐 [安全提醒] 偵測到來自新網路環境的登入',
      headline: '偵測到新網路與電信業者登入',
      summary: '您的帳戶登入 IP 來源於新的網路提供商 (ASN) 或代理/VPN 環境。',
      detailDesc: '網路提供商 (ISP/ASN) 切換'
    },
    en: {
      badge: '🟡 Activity Notice',
      subject: '🌐 [Security Alert] New sign-in from an unusual network',
      headline: 'Unusual Network Environment Sign-in',
      summary: 'Your account was accessed via a new Internet Service Provider (ASN) or VPN/proxy network.',
      detailDesc: 'Network carrier (ISP/ASN) change'
    },
    es: {
      badge: '🟡 Aviso de actividad',
      subject: '🌐 [Seguridad] Nuevo inicio de sesión desde una nueva red',
      headline: 'Inicio de sesión en red inusual',
      summary: 'Se accedió a tu cuenta desde un nuevo proveedor de internet (ASN) o red VPN.',
      detailDesc: 'Cambio de operador de red (ISP/ASN)'
    },
    fr: {
      badge: '🟡 Avis d\'activité',
      subject: '🌐 [Sécurité] Nouvelle connexion depuis un nouveau réseau',
      headline: 'Connexion via un réseau inhabituel',
      summary: 'Votre compte a été accédé via un nouveau fournisseur d\'accès (ASN) ou réseau VPN.',
      detailDesc: 'Changement de réseau (FAI/ASN)'
    },
    nl: {
      badge: '🟡 Activiteitsbericht',
      subject: '🌐 [Beveiliging] Nieuwe aanmelding vanaf een nieuw netwerk',
      headline: 'Aanmelding via onbekend netwerk',
      summary: 'Uw account is geopend via een nieuwe internetaanbieder (ASN) of VPN/proxy-netwerk.',
      detailDesc: 'Verandering van netwerkprovider (ISP/ASN)'
    }
  },

  [SECURITY_EVENT_TYPES.PAT_CREATED]: {
    zh: {
      badge: '🟡 操作提醒',
      subject: '🔑 [操作确认] 您已成功创建个人访问令牌 (PAT)',
      headline: '个人访问令牌已创建',
      summary: '您的账号刚刚生成了一个新的个人访问令牌 (PAT)。持有此令牌的应用可通过 API 访问您的邮箱。',
      detailDesc: '生成新 API 令牌'
    },
    'zh-Hant': {
      badge: '🟡 操作提醒',
      subject: '🔑 [操作確認] 您已成功建立個人存取權杖 (PAT)',
      headline: '個人存取權杖已建立',
      summary: '您的帳號剛剛產生了一個新的個人存取權杖 (PAT)。持有此權杖的應用程式可透過 API 存取您的信箱。',
      detailDesc: '產生新 API 權杖'
    },
    en: {
      badge: '🟡 Activity Notice',
      subject: '🔑 [Notice] A new Personal Access Token was generated',
      headline: 'Personal Access Token Created',
      summary: 'A new Personal Access Token (PAT) was just created for your account. Applications with this token can access your mailbox via API.',
      detailDesc: 'New API token generation'
    },
    es: {
      badge: '🟡 Aviso de actividad',
      subject: '🔑 [Aviso] Se generó un nuevo token de acceso personal (PAT)',
      headline: 'Token de acceso personal creado',
      summary: 'Se ha creado un nuevo token de acceso personal (PAT) en tu cuenta. Las aplicaciones con este token pueden acceder a tu correo vía API.',
      detailDesc: 'Generación de token API'
    },
    fr: {
      badge: '🟡 Avis d\'activité',
      subject: '🔑 [Notification] Un nouveau jeton d\'accès personnel (PAT) a été créé',
      headline: 'Jeton d\'accès personnel créé',
      summary: 'Un nouveau jeton d\'accès personnel (PAT) a été généré pour votre compte.',
      detailDesc: 'Génération d\'un jeton API'
    },
    nl: {
      badge: '🟡 Activiteitsbericht',
      subject: '🔑 [Melding] Nieuw persoonlijk toegangstoken (PAT) aangemaakt',
      headline: 'Persoonlijk toegangstoken aangemaakt',
      summary: 'Er is zojuist een nieuw persoonlijk toegangstoken (PAT) gegenereerd voor uw account.',
      detailDesc: 'Aanmaken van API-token'
    }
  },

  [SECURITY_EVENT_TYPES.FORWARDING_MODIFIED]: {
    zh: {
      badge: '🟡 操作提醒',
      subject: '📬 [重要操作] 您的账号已开启/更新邮件自动转发',
      headline: '邮件自动转发规则已变动',
      summary: '您的账号更新了外部邮件自动转发设置。所有到达您独立域名的信件可能会被自动转递至外部邮箱。',
      detailDesc: '自动转发目标邮箱变更'
    },
    'zh-Hant': {
      badge: '🟡 操作提醒',
      subject: '📬 [重要操作] 您的帳號已開啟/更新郵件自動轉發',
      headline: '郵件自動轉發規則已變動',
      summary: '您的帳號更新了外部郵件自動轉發設定。所有到達您獨立網域的信件可能會被自動轉遞至外部信箱。',
      detailDesc: '自動轉發目標信箱變更'
    },
    en: {
      badge: '🟡 Activity Notice',
      subject: '📬 [Important] Email auto-forwarding rule modified',
      headline: 'Email Forwarding Rules Changed',
      summary: 'Your account\'s auto-forwarding settings have been updated. Incoming messages may now be routed to an external email address.',
      detailDesc: 'Forwarding destination update'
    },
    es: {
      badge: '🟡 Aviso de actividad',
      subject: '📬 [Importante] Regla de reenvío automático de correo modificada',
      headline: 'Reglas de reenvío modificadas',
      summary: 'Se han actualizado las reglas de reenvío automático de correo en tu cuenta.',
      detailDesc: 'Actualización de buzón de reenvío'
    },
    fr: {
      badge: '🟡 Avis d\'activité',
      subject: '📬 [Important] Règle de transfert automatique modifiée',
      headline: 'Transfert automatique mis à jour',
      summary: 'Les paramètres de transfert automatique de votre compte ont été modifiés.',
      detailDesc: 'Mise à jour de la destination de transfert'
    },
    nl: {
      badge: '🟡 Activiteitsbericht',
      subject: '📬 [Belangrijk] Regel voor automatisch doorsturen gewijzigd',
      headline: 'Regels voor doorsturen gewijzigd',
      summary: 'De instellingen voor automatisch doorsturen van e-mail in uw account zijn bijgewerkt.',
      detailDesc: 'Doorstuuradres bijgewerkt'
    }
  },

  [SECURITY_EVENT_TYPES.TELEGRAM_MODIFIED]: {
    zh: {
      badge: '🟡 操作提醒',
      subject: '🤖 [服务变动] 个人 Telegram 通知机器人配置已更新',
      headline: 'Telegram 机器人推送已变动',
      summary: '您的账号绑定或修改了私人 Telegram 机器人，实时来信与验证码将推送到新的 Telegram 会话。',
      detailDesc: 'Telegram Bot 配置更新'
    },
    'zh-Hant': {
      badge: '🟡 操作提醒',
      subject: '🤖 [服務變動] 個人 Telegram 通知機器人設定已更新',
      headline: 'Telegram 機器人推播已變動',
      summary: '您的帳號繫結或修改了私人 Telegram 機器人，即時來信與驗證碼將推播到新的 Telegram 工作階段。',
      detailDesc: 'Telegram Bot 設定更新'
    },
    en: {
      badge: '🟡 Activity Notice',
      subject: '🤖 [Notice] Personal Telegram Bot settings updated',
      headline: 'Telegram Bot Integration Updated',
      summary: 'Your account was configured with or switched to a new Telegram Bot for instant message notifications.',
      detailDesc: 'Telegram Bot binding update'
    },
    es: {
      badge: '🟡 Aviso de actividad',
      subject: '🤖 [Aviso] Configuración de bot de Telegram actualizada',
      headline: 'Notificaciones de Telegram actualizadas',
      summary: 'Se han modificado las credenciales del bot de Telegram en tu cuenta.',
      detailDesc: 'Actualización de bot de Telegram'
    },
    fr: {
      badge: '🟡 Avis d\'activité',
      subject: '🤖 [Notification] Paramètres du bot Telegram mis à jour',
      headline: 'Intégration du bot Telegram mise à jour',
      summary: 'Votre compte a été associé à un nouveau bot Telegram pour les alertes.',
      detailDesc: 'Configuration du bot Telegram'
    },
    nl: {
      badge: '🟡 Activiteitsbericht',
      subject: '🤖 [Melding] Instellingen voor Telegram-bot bijgewerkt',
      headline: 'Telegram-botintegratie bijgewerkt',
      summary: 'Uw account is gekoppeld aan of gewijzigd naar een nieuwe Telegram-bot.',
      detailDesc: 'Telegram-bot bijwerking'
    }
  },

  [SECURITY_EVENT_TYPES.OAUTH_AUTHORIZED]: {
    zh: {
      badge: '🟡 操作提醒',
      subject: '🔗 [授权提醒] 您已授权新第三方应用访问您的邮箱',
      headline: '第三方应用授权成功',
      summary: '您刚刚通过 OAuth 2.0 授权了一个外部第三方应用访问您的 Epocanvas Mail 资源。',
      detailDesc: '新增 OAuth 客户端授权'
    },
    'zh-Hant': {
      badge: '🟡 操作提醒',
      subject: '🔗 [授權提醒] 您已授權新第三方應用存取您的信箱',
      headline: '第三方應用授權成功',
      summary: '您剛剛透過 OAuth 2.0 授權了一個外部第三方應用存取您的 Epocanvas Mail 資源。',
      detailDesc: '新增 OAuth 用戶端授權'
    },
    en: {
      badge: '🟡 Activity Notice',
      subject: '🔗 [Notice] New third-party app authorized',
      headline: 'Third-Party App Authorized',
      summary: 'You recently granted an external application access to your Epocanvas Mail account via OAuth 2.0.',
      detailDesc: 'New OAuth grant issued'
    },
    es: {
      badge: '🟡 Aviso de actividad',
      subject: '🔗 [Aviso] Nueva aplicación de terceros autorizada',
      headline: 'Aplicación externa autorizada',
      summary: 'Concediste acceso a una aplicación externa a través de OAuth 2.0.',
      detailDesc: 'Nueva concesión OAuth'
    },
    fr: {
      badge: '🟡 Avis d\'activité',
      subject: '🔗 [Notification] Nouvelle application tierce autorisée',
      headline: 'Application tierce autorisée',
      summary: 'Vous avez accordé à une application externe l\'accès à votre compte via OAuth 2.0.',
      detailDesc: 'Nouvelle autorisation OAuth'
    },
    nl: {
      badge: '🟡 Activiteitsbericht',
      subject: '🔗 [Melding] Nieuwe externe app geautoriseerd',
      headline: 'Externe app geautoriseerd',
      summary: 'U heeft zojuist een externe applicatie toegang verleend tot uw account via OAuth 2.0.',
      detailDesc: 'Nieuwe OAuth-autorisatie'
    }
  },

  [SECURITY_EVENT_TYPES.PASSWORD_CHANGED]: {
    zh: {
      badge: '🟠 重要安全告警',
      subject: '🔒 [安全告警] 您的账户密码已成功修改',
      headline: '登录密码已被修改',
      summary: '您的 Epocanvas Mail 账户密码刚刚已成功更新。为保障安全，系统已自动吊销其他设备上的历史登录会话。',
      detailDesc: '用户登录密码重置'
    },
    'zh-Hant': {
      badge: '🟠 重要安全告警',
      subject: '🔒 [安全告警] 您的帳戶密碼已成功修改',
      headline: '登入密碼已被修改',
      summary: '您的 Epocanvas Mail 帳戶密碼剛剛已成功更新。為保障安全，系統已自動吊銷其他裝置上的歷史登入工作階段。',
      detailDesc: '使用者登入密碼重設'
    },
    en: {
      badge: '🟠 Security Alert',
      subject: '🔒 [Security Alert] Your account password has been changed',
      headline: 'Account Password Changed',
      summary: 'The password for your Epocanvas Mail account was recently changed. For your security, other active sessions have been revoked.',
      detailDesc: 'Password change / reset'
    },
    es: {
      badge: '🟠 Alerta de seguridad',
      subject: '🔒 [Alerta] La contraseña de su cuenta ha sido modificada',
      headline: 'Contraseña de cuenta modificada',
      summary: 'Se ha cambiado la contraseña de tu cuenta. Por seguridad, se han revocado las sesiones activas en otros dispositivos.',
      detailDesc: 'Cambio de contraseña'
    },
    fr: {
      badge: '🟠 Alerte de sécurité',
      subject: '🔒 [Alerte] Le mot de passe de votre compte a été modifié',
      headline: 'Mot de passe modifié',
      summary: 'Le mot de passe de votre compte Epocanvas Mail a été modifié. Les autres sessions ont été invalidées.',
      detailDesc: 'Changement de mot de passe'
    },
    nl: {
      badge: '🟠 Beveiligingswaarschuwing',
      subject: '🔒 [Waarschuwing] Uw accountwachtwoord is gewijzigd',
      headline: 'Accountwachtwoord gewijzigd',
      summary: 'Het wachtwoord van uw Epocanvas Mail-account is gewijzigd. Andere actieve sessies zijn beëindigd.',
      detailDesc: 'Wachtwoordwijziging'
    }
  },

  [SECURITY_EVENT_TYPES.TOTP_ENABLED]: {
    zh: {
      badge: '🟠 重要安全通知',
      subject: '🛡️ [安全通知] 您的账号已成功开启两步验证 (2FA)',
      headline: '两步验证 (2FA) 已成功激活',
      summary: '您的账号已启用 TOTP 双因子身份验证。后续登录时将需要提供身份验证器动态口令，大幅提升账户抗盗号能力。',
      detailDesc: '启用 TOTP / 2FA 认证'
    },
    'zh-Hant': {
      badge: '🟠 重要安全通知',
      subject: '🛡️ [安全通知] 您的帳號已成功開啟兩步驟驗證 (2FA)',
      headline: '兩步驟驗證 (2FA) 已成功啟用',
      summary: '您的帳號已啟用 TOTP 雙因子身分驗證。後續登入時將需要提供驗證器動態口令，大幅提升帳戶抗盜號能力。',
      detailDesc: '啟用 TOTP / 2FA 認證'
    },
    en: {
      badge: '🟠 Security Notice',
      subject: '🛡️ [Security] Two-Factor Authentication (2FA) is now enabled',
      headline: 'Two-Factor Authentication Activated',
      summary: 'Two-Factor Authentication (TOTP) has been successfully activated on your account. Future logins will require a 6-digit authenticator code.',
      detailDesc: 'TOTP / 2FA activation'
    },
    es: {
      badge: '🟠 Aviso de seguridad',
      subject: '🛡️ [Seguridad] Autenticación de dos factores (2FA) activada',
      headline: 'Autenticación en dos pasos activada',
      summary: 'Se ha activado con éxito la autenticación de dos factores en tu cuenta.',
      detailDesc: 'Activación de TOTP / 2FA'
    },
    fr: {
      badge: '🟠 Avis de sécurité',
      subject: '🛡️ [Sécurité] Authentification à deux facteurs (2FA) activée',
      headline: 'Authentification à deux facteurs activée',
      summary: 'L\'authentification à deux facteurs (2FA) est désormais activée sur votre compte.',
      detailDesc: 'Activation de TOTP / 2FA'
    },
    nl: {
      badge: '🟠 Beveiligingsbericht',
      subject: '🛡️ [Beveiliging] Tweestapsverificatie (2FA) is nu ingeschakeld',
      headline: 'Tweestapsverificatie geactiveerd',
      summary: 'Tweestapsverificatie (2FA) is succesvol geactiveerd op uw account.',
      detailDesc: 'Activering van TOTP / 2FA'
    }
  },

  [SECURITY_EVENT_TYPES.PASSKEY_ADDED]: {
    zh: {
      badge: '🟠 重要安全通知',
      subject: '🛡️ [安全通知] 您的账号已成功添加通行密钥 (Passkey)',
      headline: '新增通行密钥 / 安全密钥',
      summary: '您的账号绑定了一个新的硬件安全密钥或设备生物识别密钥 (WebAuthn / Passkey)，提供抗钓鱼级最高等级保护。',
      detailDesc: '注册 Passkey 硬件密钥'
    },
    'zh-Hant': {
      badge: '🟠 重要安全通知',
      subject: '🛡️ [安全通知] 您的帳號已成功新增通行金鑰 (Passkey)',
      headline: '新增通行金鑰 / 安全金鑰',
      summary: '您的帳號繫結了一個新的硬體安全金鑰或裝置生物識別金鑰 (WebAuthn / Passkey)，提供抗釣魚級最高等級保護。',
      detailDesc: '註冊 Passkey 硬體金鑰'
    },
    en: {
      badge: '🟠 Security Notice',
      subject: '🛡️ [Security] New Security Key (Passkey) added',
      headline: 'New Security Key Registered',
      summary: 'A new hardware security key or biometric passkey (WebAuthn) has been added to your account for phishing-resistant protection.',
      detailDesc: 'Passkey / FIDO2 key registration'
    },
    es: {
      badge: '🟠 Aviso de seguridad',
      subject: '🛡️ [Seguridad] Nueva clave de seguridad (Passkey) agregada',
      headline: 'Clave de seguridad añadida',
      summary: 'Se ha vinculado una nueva clave de seguridad biométrica o de hardware a tu cuenta.',
      detailDesc: 'Registro de Passkey / WebAuthn'
    },
    fr: {
      badge: '🟠 Avis de sécurité',
      subject: '🛡️ [Sécurité] Nouvelle clé de sécurité (Passkey) ajoutée',
      headline: 'Nouvelle clé de sécurité ajoutée',
      summary: 'Une nouvelle clé de sécurité physique ou biométrique a été associée à votre compte.',
      detailDesc: 'Enregistrement de Passkey'
    },
    nl: {
      badge: '🟠 Beveiligingsbericht',
      subject: '🛡️ [Beveiliging] Nieuwe beveiligingssleutel (Passkey) toegevoegd',
      headline: 'Nieuwe beveiligingssleutel geregistreerd',
      summary: 'Er is een nieuwe hardware- of biometrische beveiligingssleutel (Passkey) aan uw account gekoppeld.',
      detailDesc: 'Passkey-registratie'
    }
  },

  [SECURITY_EVENT_TYPES.BACKUP_CODES_REGENERATED]: {
    zh: {
      badge: '🟠 重要安全提醒',
      subject: '⚠️ [重要安全提醒] 您的两步验证备用恢复码已更新',
      headline: '备用恢复码已重新生成',
      summary: '您的 2FA 备用恢复码已全量重新生成。此前的旧恢复码已全部失效，请妥善保管新生成的 10 个恢复码。',
      detailDesc: '重置 2FA 备用恢复码'
    },
    'zh-Hant': {
      badge: '🟠 重要安全提醒',
      subject: '⚠️ [重要安全提醒] 您的兩步驟驗證備用復原碼已更新',
      headline: '備用復原碼已重新產生',
      summary: '您的 2FA 備用復原碼已全量重新產生。此前的舊復原碼已全部失效，請妥善保管新產生的 10 個復原碼。',
      detailDesc: '重設 2FA 備用復原碼'
    },
    en: {
      badge: '🟠 Security Alert',
      subject: '⚠️ [Alert] New 2FA backup recovery codes generated',
      headline: 'Backup Recovery Codes Regenerated',
      summary: 'Your two-factor authentication backup codes were regenerated. All previous backup codes are now permanently invalid.',
      detailDesc: '2FA backup codes regeneration'
    },
    es: {
      badge: '🟠 Alerta de seguridad',
      subject: '⚠️ [Alerta] Nuevos códigos de recuperación 2FA generados',
      headline: 'Códigos de recuperación actualizados',
      summary: 'Se generaron nuevos códigos de recuperación para tu 2FA. Los códigos anteriores han quedado invalidados.',
      detailDesc: 'Regeneración de códigos 2FA'
    },
    fr: {
      badge: '🟠 Alerte de sécurité',
      subject: '⚠️ [Alerte] Nouveaux codes de secours 2FA générés',
      headline: 'Codes de secours régénérés',
      summary: 'Vos codes de secours 2FA ont été régénérés. Tous les anciens codes sont désormais invalides.',
      detailDesc: 'Régénération des codes de secours'
    },
    nl: {
      badge: '🟠 Beveiligingswaarschuwing',
      subject: '⚠️ [Waarschuwing] Nieuwe 2FA-back-upcodes gegenereerd',
      headline: 'Back-upcodes opnieuw gegenereerd',
      summary: 'Uw tweestapsverificatie back-upcodes zijn opnieuw gegenereerd. Alle eerdere codes zijn nu ongeldig.',
      detailDesc: 'Nieuwe 2FA-back-upcodes'
    }
  },

  [SECURITY_EVENT_TYPES.ACCOUNT_LOCKED]: {
    zh: {
      badge: '🚨 紧急安全预警',
      subject: '🚨 [紧急安全预警] 您的账户因多次密码错误已被临时保护',
      headline: '账户连续输错密码已临时锁定',
      summary: '系统检测到您的账户连续发生 5 次密码错误尝试。为防止针对您账户的暴力破解，系统已启动 12 小时风控防护锁定。',
      detailDesc: '暴力破解防御触发锁定 (12 小时)'
    },
    'zh-Hant': {
      badge: '🚨 緊急安全預警',
      subject: '🚨 [緊急安全預警] 您的帳戶因多次密碼錯誤已被臨時保護',
      headline: '帳戶連續輸錯密碼已臨時鎖定',
      summary: '系統偵測到您的帳戶連續發生 5 次密碼錯誤嘗試。為防止針對您帳戶的暴力破解，系統已啟動 12 小時風控防護鎖定。',
      detailDesc: '暴力破解防禦觸發鎖定 (12 小時)'
    },
    en: {
      badge: '🚨 Critical Security Alert',
      subject: '🚨 [CRITICAL] Account locked due to repeated failed sign-in attempts',
      headline: 'Account Temporarily Protected & Locked',
      summary: 'We detected 5 consecutive incorrect password attempts on your account. To prevent brute-force attacks, your account is temporarily locked for 12 hours.',
      detailDesc: 'Rate-limit brute force lockdown (12 hours)'
    },
    es: {
      badge: '🚨 Alerta crítica',
      subject: '🚨 [CRÍTICO] Cuenta bloqueada por intentos fallidos de inicio de sesión',
      headline: 'Cuenta bloqueada temporalmente',
      summary: 'Se detectaron 5 intentos fallidos consecutivos de contraseña. Para evitar ataques de fuerza bruta, la cuenta se ha bloqueado por 12 horas.',
      detailDesc: 'Bloqueo por intentos fallidos (12 horas)'
    },
    fr: {
      badge: '🚨 Alerte critique',
      subject: '🚨 [CRITIQUE] Compte verrouillé suite à plusieurs tentatives infructueuses',
      headline: 'Compte temporairement verrouillé',
      summary: '5 tentatives de mot de passe incorrectes consécutives ont été détectées. Votre compte est verrouillé pour 12 heures.',
      detailDesc: 'Verrouillage anti-brute force (12 heures)'
    },
    nl: {
      badge: '🚨 Kritieke waarschuwing',
      subject: '🚨 [KRITIEK] Account tijdelijk vergrendeld na mislukte inlogpogingen',
      headline: 'Account tijdelijk vergrendeld',
      summary: 'Er zijn 5 opeenvolgende mislukte inlogpogingen gedetecteerd. Uw account is voor 12 uur vergrendeld.',
      detailDesc: 'Vergrendeling wegens brute force (12 uur)'
    }
  },

  [SECURITY_EVENT_TYPES.TOTP_DISABLED]: {
    zh: {
      badge: '🚨 致命风险警告',
      subject: '🚨 [致命警告] 您的账号已关闭两步验证保护体系',
      headline: '两步验证 (2FA) 已被关闭',
      summary: '您的账号已停用两步验证防护。账户现退化为单一密码保护状态，极易遭受密码撞库与钓鱼威胁。',
      detailDesc: '主动关闭 2FA / TOTP 防护'
    },
    'zh-Hant': {
      badge: '🚨 致命風險警告',
      subject: '🚨 [致命警告] 您的帳號已關閉兩步驟驗證保護體系',
      headline: '兩步驟驗證 (2FA) 已被關閉',
      summary: '您的帳號已停用兩步驟驗證防護。帳戶現退化為單一密碼保護狀態，極易遭受密碼撞庫與釣魚威脅。',
      detailDesc: '主動關閉 2FA / TOTP 防護'
    },
    en: {
      badge: '🚨 Critical Warning',
      subject: '🚨 [CRITICAL] Two-Factor Authentication has been disabled',
      headline: 'Two-Factor Authentication Disabled',
      summary: 'Two-Factor Authentication was disabled on your account. Your account is now protected only by a password, significantly increasing risk.',
      detailDesc: 'Deactivation of 2FA protection'
    },
    es: {
      badge: '🚨 Advertencia crítica',
      subject: '🚨 [CRÍTICO] Autenticación de dos factores deshabilitada',
      headline: 'Autenticación en dos pasos desactivada',
      summary: 'Se desactivó la autenticación en dos pasos en tu cuenta. Tu cuenta ahora solo está protegida por contraseña.',
      detailDesc: 'Desactivación de 2FA'
    },
    fr: {
      badge: '🚨 Avertissement critique',
      subject: '🚨 [CRITIQUE] Authentification à deux facteurs désactivée',
      headline: 'Authentification 2FA désactivée',
      summary: 'L\'authentification à deux facteurs a été désactivée. Votre compte n\'est désormais protégé que par un mot de passe.',
      detailDesc: 'Désactivation de la 2FA'
    },
    nl: {
      badge: '🚨 Kritieke waarschuwing',
      subject: '🚨 [KRITIEK] Tweestapsverificatie is uitgeschakeld',
      headline: 'Tweestapsverificatie uitgeschakeld',
      summary: 'Tweestapsverificatie is uitgeschakeld op uw account. Uw account is nu alleen beschermd met een wachtwoord.',
      detailDesc: 'Deactivering van 2FA'
    }
  },

  [SECURITY_EVENT_TYPES.PASSKEY_DELETED]: {
    zh: {
      badge: '🚨 紧急安全预警',
      subject: '⚠️ [安全通知] 通行密钥已从您的账户中移除',
      headline: '通行密钥 / 安全密钥已被删除',
      summary: '您账号绑定的硬件安全密钥已被移除。如果这不是您的操作，攻击者可能正在剥离您的抗钓鱼硬件凭证。',
      detailDesc: '删除 Passkey 安全密钥'
    },
    'zh-Hant': {
      badge: '🚨 緊急安全預警',
      subject: '⚠️ [安全通知] 通行金鑰已從您的帳戶中移除',
      headline: '通行金鑰 / 安全金鑰已被刪除',
      summary: '您帳號繫結的硬體安全金鑰已被移除。如果這不是您的操作，攻擊者可能正在剝離您的抗釣魚硬體憑證。',
      detailDesc: '刪除 Passkey 安全金鑰'
    },
    en: {
      badge: '🚨 Critical Warning',
      subject: '⚠️ [Notice] Security key (Passkey) removed from account',
      headline: 'Security Key Removed',
      summary: 'A registered hardware security key was removed from your account. If you didn\'t do this, an attacker may be modifying your credentials.',
      detailDesc: 'Passkey removal'
    },
    es: {
      badge: '🚨 Advertencia crítica',
      subject: '⚠️ [Aviso] Clave de seguridad eliminada de la cuenta',
      headline: 'Clave de seguridad eliminada',
      summary: 'Se eliminó una clave de seguridad de tu cuenta. Si no fuiste tú, revisa tu cuenta inmediatamente.',
      detailDesc: 'Eliminación de Passkey'
    },
    fr: {
      badge: '🚨 Avertissement critique',
      subject: '⚠️ [Avis] Clé de sécurité supprimée du compte',
      headline: 'Clé de sécurité supprimée',
      summary: 'Une clé de sécurité a été supprimée de votre compte. Si vous n\'en êtes pas l\'auteur, vérifiez votre compte sans délai.',
      detailDesc: 'Suppression de Passkey'
    },
    nl: {
      badge: '🚨 Kritieke waarschuwing',
      subject: '⚠️ [Melding] Beveiligingssleutel verwijderd van account',
      headline: 'Beveiligingssleutel verwijderd',
      summary: 'Er is een beveiligingssleutel verwijderd van uw account. Als u dit niet was, controleer dan direct uw account.',
      detailDesc: 'Passkey verwijdering'
    }
  },

  [SECURITY_EVENT_TYPES.STORAGE_PURGED]: {
    zh: {
      badge: '🚨 紧急数据通知',
      subject: '🗑️ [数据警报] 您的邮箱存储空间与历史配置已重置',
      headline: '邮箱存储配置变动',
      summary: '您的账户解绑或重置了自定义对象存储 (BYO Storage)，已恢复为系统默认统一边缘存储。',
      detailDesc: '存储绑定解绑与重置'
    },
    'zh-Hant': {
      badge: '🚨 緊急資料通知',
      subject: '🗑️ [資料警報] 您的信箱儲存空間與歷史設定已重設',
      headline: '信箱儲存設定變動',
      summary: '您的帳戶解除繫結或重設了自訂物件儲存 (BYO Storage)，已恢復為系統預設統一邊緣儲存。',
      detailDesc: '儲存繫結解綁與重設'
    },
    en: {
      badge: '🚨 Data Notice',
      subject: '🗑️ [Notice] Mailbox storage configuration reset',
      headline: 'Storage Configuration Updated',
      summary: 'Your account\'s custom storage backend (BYO Storage) was unlinked or reset to system default storage.',
      detailDesc: 'Storage backend unbinding'
    },
    es: {
      badge: '🚨 Aviso de datos',
      subject: '🗑️ [Aviso] Configuración de almacenamiento restablecida',
      headline: 'Almacenamiento actualizado',
      summary: 'Se desvinculó el almacenamiento personalizado de tu cuenta.',
      detailDesc: 'Restablecimiento de almacenamiento'
    },
    fr: {
      badge: '🚨 Avis de données',
      subject: '🗑️ [Avis] Configuration de stockage réinitialisée',
      headline: 'Stockage réinitialisé',
      summary: 'Votre stockage personnalisé a été dissocié de votre compte.',
      detailDesc: 'Réinitialisation du stockage'
    },
    nl: {
      badge: '🚨 Gegevensbericht',
      subject: '🗑️ [Melding] Opslagconfiguratie opnieuw ingesteld',
      headline: 'Opslagconfiguratie gewijzigd',
      summary: 'Uw aangepaste opslagruimte is ontkoppeld van uw account.',
      detailDesc: 'Opslagontkoppeling'
    }
  },

  [SECURITY_EVENT_TYPES.ACCOUNT_DELETED]: {
    zh: {
      badge: '🚨 账户注销确认',
      subject: '⚠️ [账户终止] 您的 EpoCanvas Mail 账户已申请注销',
      headline: '账户注销流程启动',
      summary: '系统已收到并处理了您账户的注销申请。您的登录凭证与会话已即刻失效。',
      detailDesc: '账户永久注销流程'
    },
    'zh-Hant': {
      badge: '🚨 帳戶註銷確認',
      subject: '⚠️ [帳戶終止] 您的 EpoCanvas Mail 帳戶已申請註銷',
      headline: '帳戶註銷流程啟動',
      summary: '系統已收到並處理了您帳戶的註銷申請。您的登入憑證與工作階段已即刻失效。',
      detailDesc: '帳戶永久註銷流程'
    },
    en: {
      badge: '🚨 Account Termination',
      subject: '⚠️ [Notice] Your EpoCanvas Mail account deletion requested',
      headline: 'Account Scheduled for Deletion',
      summary: 'A deletion request was submitted for your EpoCanvas Mail account. Your active sessions and credentials have been revoked.',
      detailDesc: 'Account deletion process initiated'
    },
    es: {
      badge: '🚨 Cierre de cuenta',
      subject: '⚠️ [Aviso] Eliminación de cuenta solicitada',
      headline: 'Cuenta en proceso de eliminación',
      summary: 'Se ha procesado una solicitud de eliminación para tu cuenta de EpoCanvas Mail.',
      detailDesc: 'Proceso de eliminación de cuenta'
    },
    fr: {
      badge: '🚨 Clôture de compte',
      subject: '⚠️ [Avis] Suppression de compte demandée',
      headline: 'Compte programmé pour suppression',
      summary: 'Une demande de suppression a été effectuée pour votre compte EpoCanvas Mail.',
      detailDesc: 'Suppression du compte initiée'
    },
    nl: {
      badge: '🚨 Accountbeëindiging',
      subject: '⚠️ [Melding] Verwijdering van account aangevraagd',
      headline: 'Account gepland voor verwijdering',
      summary: 'Er is een verzoek ingediend om uw EpoCanvas Mail-account te verwijderen.',
      detailDesc: 'Accountverwijderingsproces gestart'
    }
  }
};

/**
 * Normalizes user language code to supported 6-language key
 */
export function normalizeNoticeLang(lang) {
  if (!lang || typeof lang !== 'string') return 'zh';
  const l = lang.toLowerCase().trim();
  if (l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-mo') || l.startsWith('zh-hant')) {
    return 'zh-Hant';
  }
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('nl')) return 'nl';
  return 'en';
}

export const EVENT_DEFINITIONS = Object.fromEntries(
  Object.values(SECURITY_EVENT_TYPES).map(code => [
    code,
    {
      code,
      level: parseInt(EVENT_LEVEL_MAP[code]?.replace('L', '') || '1', 10),
      levelKey: EVENT_LEVEL_MAP[code],
      templates: EVENT_I18N[code]
    }
  ])
);

/**
 * Renders complete, responsive, self-contained HTML email for a security notification
 */
export function renderSecurityNoticeEmail(firstArg, secondArg, thirdArg) {
  let eventCode, lang, params;
  if (typeof firstArg === 'object' && firstArg !== null && firstArg.eventCode) {
    eventCode = firstArg.eventCode;
    lang = firstArg.lang;
    params = firstArg.params || {};
  } else {
    eventCode = firstArg;
    if (typeof secondArg === 'object' && secondArg !== null) {
      lang = secondArg.lang;
      const { lang: _l, ...rest } = secondArg;
      params = Object.keys(rest).length > 0 ? rest : (thirdArg || {});
    } else {
      lang = secondArg;
      params = thirdArg || {};
    }
  }
  params = params || {};
  const normLang = normalizeNoticeLang(lang);
  const common = COMMON_I18N[normLang] || COMMON_I18N.zh;
  const eventTexts = EVENT_I18N[eventCode]?.[normLang] || EVENT_I18N[eventCode]?.zh || EVENT_I18N[SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN].zh;
  const levelKey = EVENT_LEVEL_MAP[eventCode] || 'L1';
  const levelConfig = SECURITY_LEVELS[levelKey];

  const userName = params.userName || params.name || params.userEmail?.split('@')[0] || 'User';
  const userEmail = params.userEmail || '';
  const timeStr = params.time || new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const ip = params.ip || 'Unknown';
  const location = params.location || (params.city && params.country ? `${params.city}, ${params.country}` : (params.country || 'Unknown'));
  const device = params.device || 'Desktop / Web Browser';
  const browser = params.browser || '';
  const network = params.network || params.asnOrg || '';
  const detail = params.detail || eventTexts.detailDesc || '';

  const greeting = common.greeting.replace('{name}', userName);

  // Metadata Table Rows
  const rows = [
    { label: common.timeLabel, value: timeStr, icon: '⏱️' },
    { label: common.ipLabel, value: ip, icon: '🌐' },
    { label: common.locationLabel, value: location, icon: '📍' },
    { label: common.deviceLabel, value: device, icon: '💻' }
  ];

  if (browser) {
    rows.push({ label: common.browserLabel, value: browser, icon: '🧭' });
  }
  if (network) {
    rows.push({ label: common.networkLabel, value: network, icon: '🏢' });
  }
  if (detail) {
    rows.push({ label: common.detailLabel, value: detail, icon: '📋' });
  }
  if (params.keyName) {
    const keyLabel = normLang === 'zh-Hant' ? '通行密鑰' : (normLang === 'zh' ? '通行密钥' : 'Passkey Name');
    rows.push({ label: keyLabel, value: params.keyName, icon: '🔑' });
  }
  if (params.appName) {
    const appLabel = normLang === 'zh-Hant' ? '授權應用' : (normLang === 'zh' ? '授权应用' : 'Application');
    rows.push({ label: appLabel, value: params.appName, icon: '📦' });
  }
  if (params.forwardTarget) {
    const fwdLabel = normLang === 'zh-Hant' ? '轉發目標' : (normLang === 'zh' ? '转发目标' : 'Forward Target');
    rows.push({ label: fwdLabel, value: params.forwardTarget, icon: '📮' });
  }

  const rowsHtml = rows.map((r, idx) => `
    <tr style="border-bottom: ${idx === rows.length - 1 ? 'none' : '1px solid #f1f5f9'};">
      <td style="padding: 11px 16px; font-size: 13.5px; color: #64748b; font-weight: 600; width: 140px; white-space: nowrap; vertical-align: top;">
        <span style="margin-right: 6px;">${r.icon}</span>${r.label}
      </td>
      <td style="padding: 11px 16px; font-size: 13.5px; color: #0f172a; font-weight: 500; word-break: break-all; vertical-align: top;">
        ${escapeHtml(r.value)}
      </td>
    </tr>
  `).join('');

  // Primary Action Button URL
  const actionUrl = 'https://mail.epocanvas.com/mail/u/0/#settings/security';

  const html = `<!DOCTYPE html>
<html lang="${normLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(eventTexts.subject)}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.05);">
    
    <!-- Top Gradient Header Banner -->
    <div style="background: ${levelConfig.gradient}; padding: 32px 36px 28px; text-align: left; position: relative;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
        <div>
          <div style="display: inline-flex; align-items: center; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 4px 12px; border-radius: 20px; color: #ffffff; font-size: 12.5px; font-weight: 700; margin-bottom: 10px; backdrop-filter: blur(6px);">
            <span>${eventTexts.badge}</span>
          </div>
          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; line-height: 1.35; letter-spacing: -0.01em;">
            ${escapeHtml(eventTexts.headline)}
          </h1>
        </div>
        <div style="width: 52px; height: 52px; background: rgba(255, 255, 255, 0.18); border-radius: 14px; border: 1.5px solid rgba(255, 255, 255, 0.35); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${levelConfig.iconSvg}
        </div>
      </div>
    </div>

    <!-- Main Body Container -->
    <div style="padding: 32px 36px 28px;">
      
      <p style="font-size: 15.5px; color: #0f172a; margin-top: 0; font-weight: 700;">
        ${escapeHtml(greeting)}
      </p>

      <p style="font-size: 14px; color: #334155; line-height: 1.65; margin: 0 0 20px;">
        ${escapeHtml(eventTexts.summary)}
      </p>

      <!-- Operation Metadata Card -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 20px 0 24px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          ${rowsHtml}
        </table>
      </div>

      <!-- Was this you? Decision Blocks -->
      <div style="margin: 24px 0; display: flex; flex-direction: column; gap: 12px;">
        <!-- Legitimate Operation -->
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px;">
          <div style="font-size: 13.5px; font-weight: 700; color: #166534; margin-bottom: 4px;">
            ✓ ${escapeHtml(common.wasYouTitle)}
          </div>
          <div style="font-size: 13px; color: #15803d; line-height: 1.5;">
            ${escapeHtml(common.wasYouDesc)}
          </div>
        </div>

        <!-- Suspicious / Unauthorized Operation -->
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px 18px;">
          <div style="font-size: 13.5px; font-weight: 700; color: #991b1b; margin-bottom: 4px;">
            ⚠️ ${escapeHtml(common.wasNotYouTitle)}
          </div>
          <div style="font-size: 13px; color: #b91c1c; line-height: 1.5;">
            ${escapeHtml(common.wasNotYouDesc)}
          </div>
        </div>
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin: 28px 0 16px;">
        <a href="${actionUrl}" style="display: inline-block; background: ${levelConfig.primaryColor}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 9999px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);">
          ${escapeHtml(common.actionBtnText)} →
        </a>
      </div>

      <!-- Micro Divider -->
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 20px;">

      <!-- Footer Disclaimer -->
      <p style="font-size: 11.5px; color: #94a3b8; line-height: 1.6; margin: 0; text-align: center;">
        ${escapeHtml(common.officialFooter)}
      </p>

    </div>
  </div>
</body>
</html>`;

  const plainText = `${eventTexts.headline}
${greeting}

${eventTexts.summary}

[${common.timeLabel}]: ${timeStr}
[${common.ipLabel}]: ${ip}
[${common.locationLabel}]: ${location}
[${common.deviceLabel}]: ${device}
${browser ? `[${common.browserLabel}]: ${browser}\n` : ''}${network ? `[${common.networkLabel}]: ${network}\n` : ''}

${common.wasYouTitle} ${common.wasYouDesc}
${common.wasNotYouTitle} ${common.wasNotYouDesc}

${common.actionBtnText}: ${actionUrl}

--
${common.officialFooter}`;

  return {
    subject: eventTexts.subject,
    content: html,
    html: html,
    text: plainText,
    isStarred: levelConfig.isStarred
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
