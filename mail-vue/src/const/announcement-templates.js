// Frontend mirror of mail-worker GLOBAL_ANNOUNCEMENT_TEMPLATES — default global announcement email templates per language.
// Used by sys-setting global announcement dialog as editable starting point; delivery-side templates live in mail-worker.
// ===== Default global announcement email templates (6 languages) =====
export const GLOBAL_ANNOUNCEMENT_TEMPLATES = {
  zh: {
    lang: 'zh',
    subject: '📢 Epocanvas Mail 全域公告：系统服务更新通知',
    content: `<div style="max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, sans-serif; color: #1e293b; line-height: 1.7; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">系统全域通知</h2>
  <p style="color: #475569; font-size: 15px;">尊敬的 {{user_name}}：</p>
  <p style="color: #475569; font-size: 14.5px;">我们在此向您推送最新的全域服务公告，致力于为您提供更高效、纯净且智能的邮箱服务。</p>
  <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
    <strong style="color: #1e293b;">公告要点：</strong>
    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">1. 在此编辑您的公告内容<br>2. 支持多语言模板，按收件人语言自动分发<br>3. 支持 {{current_date}} 等动态变量占位符</p>
  </div>
  <p style="color: #94a3b8; font-size: 12.5px; margin-top: 28px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    此邮件由系统站长 (admin@epocanvas.com) 统一发布 · 祝您使用愉快！
  </p>
</div>`
  },
  'zh-Hant': {
    lang: 'zh-Hant',
    subject: '📢 Epocanvas Mail 全域公告：系統服務更新通知',
    content: `<div style="max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, sans-serif; color: #1e293b; line-height: 1.7; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">系統全域通知</h2>
  <p style="color: #475569; font-size: 15px;">尊敬的 {{user_name}}：</p>
  <p style="color: #475569; font-size: 14.5px;">我們在此向您推送最新的全域服務公告，致力於為您提供更高效、純淨且智能的郵箱服務。</p>
  <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
    <strong style="color: #1e293b;">公告要點：</strong>
    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">1. 在此編輯您的公告內容<br>2. 支援多語言模板，按收件人語言自動分發<br>3. 支援 {{current_date}} 等動態變數佔位符</p>
  </div>
  <p style="color: #94a3b8; font-size: 12.5px; margin-top: 28px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    此郵件由系統站長 (admin@epocanvas.com) 統一發佈 · 祝您使用愉快！
  </p>
</div>`
  },
  en: {
    lang: 'en',
    subject: '📢 Epocanvas Mail Global Announcement: Service Update Notice',
    content: `<div style="max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Global System Notice</h2>
  <p style="color: #475569; font-size: 15px;">Dear {{user_name}},</p>
  <p style="color: #475569; font-size: 14.5px;">We are publishing the latest global service announcement, committed to delivering a faster, cleaner and smarter mailbox experience.</p>
  <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
    <strong style="color: #1e293b;">Highlights:</strong>
    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">1. Edit your announcement content here<br>2. Multilingual templates are delivered per recipient language<br>3. Dynamic placeholders such as {{current_date}} are supported</p>
  </div>
  <p style="color: #94a3b8; font-size: 12.5px; margin-top: 28px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    Published by the site administrator (admin@epocanvas.com) · Enjoy your stay!
  </p>
</div>`
  },
  fr: {
    lang: 'fr',
    subject: '📢 Epocanvas Mail Annonce globale : avis de mise à jour du service',
    content: `<div style="max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Avis global du système</h2>
  <p style="color: #475569; font-size: 15px;">Cher(ère) {{user_name}},</p>
  <p style="color: #475569; font-size: 14.5px;">Nous publions la dernière annonce globale de service, engagés à vous offrir une messagerie plus rapide, plus propre et plus intelligente.</p>
  <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
    <strong style="color: #1e293b;">Points clés :</strong>
    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">1. Modifiez le contenu de votre annonce ici<br>2. Les modèles multilingues sont distribués selon la langue du destinataire<br>3. Les variables dynamiques comme {{current_date}} sont prises en charge</p>
  </div>
  <p style="color: #94a3b8; font-size: 12.5px; margin-top: 28px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    Publié par l'administrateur du site (admin@epocanvas.com) · Bonne continuation !
  </p>
</div>`
  },
  es: {
    lang: 'es',
    subject: '📢 Epocanvas Mail Anuncio global: aviso de actualización del servicio',
    content: `<div style="max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Aviso global del sistema</h2>
  <p style="color: #475569; font-size: 15px;">Estimado(a) {{user_name}}:</p>
  <p style="color: #475569; font-size: 14.5px;">Publicamos el último anuncio global del servicio, comprometidos a ofrecerte un buzón más rápido, limpio e inteligente.</p>
  <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
    <strong style="color: #1e293b;">Puntos destacados:</strong>
    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">1. Edita aquí el contenido de tu anuncio<br>2. Las plantillas multilingües se entregan según el idioma del destinatario<br>3. Se admiten marcadores dinámicos como {{current_date}}</p>
  </div>
  <p style="color: #94a3b8; font-size: 12.5px; margin-top: 28px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    Publicado por el administrador del sitio (admin@epocanvas.com) · ¡Que disfrutes el servicio!
  </p>
</div>`
  },
  nl: {
    lang: 'nl',
    subject: '📢 Epocanvas Mail Wereldwijde aankondiging: melding servicedienst update',
    content: `<div style="max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px;">
  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Wereldwijde systeemmelding</h2>
  <p style="color: #475569; font-size: 15px;">Beste {{user_name}},</p>
  <p style="color: #475569; font-size: 14.5px;">Wij publiceren de nieuwste wereldwijde serviceaankondiging, met de inzet om je een snellere, schonere en slimmere mailbox te bieden.</p>
  <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
    <strong style="color: #1e293b;">Kernpunten:</strong>
    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">1. Bewerk hier de inhoud van je aankondiging<br>2. Meertalige sjablonen worden per ontvangerstaal bezorgd<br>3. Dynamische variabelen zoals {{current_date}} worden ondersteund</p>
  </div>
  <p style="color: #94a3b8; font-size: 12.5px; margin-top: 28px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
    Gepubliceerd door de sitebeheerder (admin@epocanvas.com) · Veel plezier!
  </p>
</div>`
  }
};

export function getAnnouncementTemplate(lang = 'zh') {
  return GLOBAL_ANNOUNCEMENT_TEMPLATES[normalizeLangKey(lang)] || GLOBAL_ANNOUNCEMENT_TEMPLATES.zh;
}
