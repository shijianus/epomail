<template>
  <div class="box">
    <!-- 1. Header & Overview Card -->
    <div class="container header-container">
      <div class="header-top-row">
        <div class="main-title">{{ $t('oauthAppsTitle') }}</div>
        <div class="header-actions">
          <el-tooltip :content="$t('oauthBlogGuideTooltip')" placement="bottom">
            <el-button @click="openBlogTutorial" class="guide-btn">
              <Icon icon="fluent:book-open-20-regular" width="16" height="16" style="margin-right: 6px;" />
              <span>{{ $t('oauthBlogGuide') }}</span>
              <Icon icon="fluent:open-16-regular" width="12" height="12" style="margin-left: 4px; opacity: 0.7;" />
            </el-button>
          </el-tooltip>
          <el-button type="primary" @click="openCreateDialog" class="create-app-btn">
            <Icon icon="fluent:add-circle-20-regular" width="16" height="16" style="margin-right: 6px;" />
            {{ $t('registerNewApp') }}
          </el-button>
        </div>
      </div>
      <div class="section-intro">
        {{ $t('oauthAppsDesc') }}
      </div>

      <!-- OIDC Standard Endpoints Bar -->
      <div class="endpoints-strip">
        <div class="endpoint-chip" @click="copyEndpoint('/.well-known/openid-configuration')">
          <span class="ep-badge get">GET</span>
          <span class="ep-path font-mono">/.well-known/openid-configuration</span>
          <span class="ep-hint">{{ $t('discoveryMetadata') }}</span>
          <Icon icon="fluent:copy-16-regular" width="13" height="13" class="copy-ic" />
        </div>
        <div class="endpoint-chip" @click="copyEndpoint('/oauth/authorize')">
          <span class="ep-badge get">GET</span>
          <span class="ep-path font-mono">/oauth/authorize</span>
          <span class="ep-hint">{{ $t('userAuthEndpoint') }}</span>
          <Icon icon="fluent:copy-16-regular" width="13" height="13" class="copy-ic" />
        </div>
        <div class="endpoint-chip" @click="copyEndpoint('/api/oauth/token')">
          <span class="ep-badge post">POST</span>
          <span class="ep-path font-mono">/api/oauth/token</span>
          <span class="ep-hint">{{ $t('tokenExchangeEndpoint') }}</span>
          <Icon icon="fluent:copy-16-regular" width="13" height="13" class="copy-ic" />
        </div>
        <div class="endpoint-chip" @click="copyEndpoint('/api/oauth/userinfo')">
          <span class="ep-badge get">GET</span>
          <span class="ep-path font-mono">/api/oauth/userinfo</span>
          <span class="ep-hint">{{ $t('userProfileEndpoint') }}</span>
          <Icon icon="fluent:copy-16-regular" width="13" height="13" class="copy-ic" />
        </div>
      </div>
    </div>

    <!-- 2. OAuth Apps List Container -->
    <div class="container apps-container">
      <div class="apps-header-row">
        <div class="apps-count-title">
          <span>{{ $t('oauthApps') }}</span>
          <span class="count-bubble">{{ appsList.length }}</span>
        </div>
        <el-button link type="primary" size="small" @click="fetchApps" :loading="loading">
          <Icon icon="fluent:arrow-clockwise-16-regular" width="14" height="14" style="margin-right: 4px;" />
          {{ $t('refresh') }}
        </el-button>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && appsList.length === 0" class="empty-apps-box">
        <div class="empty-icon-wrap">
          <Icon icon="fluent:apps-24-regular" width="36" height="36" />
        </div>
        <div class="empty-title">{{ $t('noAppsCreated') }}</div>
        <div class="empty-desc">{{ $t('noAppsCreatedDesc') }}</div>
        <div class="empty-actions">
          <el-button type="primary" @click="openCreateDialog">
            <Icon icon="fluent:add-16-filled" width="15" height="15" style="margin-right: 4px;" />
            {{ $t('registerNewApp') }}
          </el-button>
          <el-button @click="openBlogTutorial">
            <Icon icon="fluent:book-open-16-regular" width="15" height="15" style="margin-right: 4px;" />
            {{ $t('oauthBlogGuide') }}
          </el-button>
        </div>
      </div>

      <!-- Apps Grid -->
      <div v-else class="apps-grid" v-loading="loading">
        <div v-for="app in appsList" :key="app.id" class="app-card">
          <!-- Card Header -->
          <div class="app-card-header">
            <div class="app-brand">
              <div class="app-logo-avatar" :style="{ background: getAvatarBg(app.name) }">
                <img v-if="app.logoUrl" :src="app.logoUrl" :alt="app.name" @error="handleLogoError($event, app)" />
                <span v-else class="app-avatar-char">{{ getInitialChar(app.name) }}</span>
              </div>
              <div class="app-meta">
                <div class="app-name-row">
                  <span class="app-name" :title="app.name">{{ app.name }}</span>
                  <a v-if="app.homepageUrl" :href="app.homepageUrl" target="_blank" class="app-link" :title="app.homepageUrl">
                    <Icon icon="fluent:open-16-regular" width="12" height="12" />
                  </a>
                </div>
                <div class="app-created-time">
                  {{ formatDate(app.createdAt) }}
                </div>
              </div>
            </div>
            <div class="app-status-switch">
              <el-switch
                v-model="app.status"
                :active-value="1"
                :inactive-value="0"
                size="small"
                @change="(val) => handleStatusChange(app, val)"
                :title="app.status === 1 ? ($t('appStatusActive')) : ($t('appStatusDisabled'))"
              />
            </div>
          </div>

          <!-- Card Description -->
          <div class="app-desc-text" :title="localizedAppDesc(app.description) || $t('noAppDesc')">
            {{ localizedAppDesc(app.description) || $t('noAppDesc') }}
          </div>

          <!-- Credentials Field -->
          <div class="app-credentials-box">
            <div class="cred-row">
              <span class="cred-label">Client ID</span>
              <div class="cred-val font-mono">
                <span class="cred-mono-text" :title="app.clientId">{{ app.clientId }}</span>
                <el-button link type="primary" size="small" class="cred-action-btn" @click="copyText(app.clientId, 'Client ID')" :title="$t('copy')">
                  <Icon icon="fluent:copy-16-regular" width="13" height="13" />
                </el-button>
              </div>
            </div>
            <div class="cred-row">
              <span class="cred-label">Client Secret</span>
              <div class="cred-val font-mono">
                <span class="masked-secret">{{ app.clientSecretMasked || '••••••••••••••••' }}</span>
                <el-button link type="primary" size="small" class="cred-action-btn" @click="handleResetSecret(app)" :title="$t('resetSecret')">
                  <Icon icon="fluent:arrow-sync-16-regular" width="13" height="13" />
                </el-button>
              </div>
            </div>
          </div>

          <!-- Card Footer Actions -->
          <div class="app-card-footer">
            <el-button size="small" @click="openQuickGuideWithApp(app)" class="action-btn">
              <Icon icon="fluent:code-16-regular" width="13" height="13" style="margin-right: 4px;" />
              {{ $t('integrationGuide') }}
            </el-button>
            <div class="footer-right-actions">
              <el-button size="small" @click="openEditDialog(app)" class="action-btn">
                <Icon icon="fluent:edit-16-regular" width="13" height="13" style="margin-right: 3px;" />
                {{ $t('edit') }}
              </el-button>
              <el-button size="small" type="danger" plain @click="handleDeleteApp(app)" class="action-btn danger">
                <Icon icon="fluent:delete-16-regular" width="13" height="13" style="margin-right: 3px;" />
                {{ $t('delete') }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- DIALOG 1: 注册/编辑应用 (Register / Edit Application Modal) -->
    <el-dialog
      v-model="appDialogShow"
      :title="editingAppId ? ($t('editApp')) : ($t('registerNewApp'))"
      width="560px"
      destroy-on-close
      class="oauth-dialog"
    >
      <div class="dialog-body-form">
        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-label">{{ $t('appName') }} <span class="required-star">*</span></span>
            <span class="d-sub-hint">{{ $t('appNameDisplayHint') }}</span>
          </div>
          <el-input 
            v-model="appForm.name" 
            :placeholder="$t('appNamePlaceholder')" 
            maxlength="60"
            clearable
          />
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-label">{{ $t('homepageUrl') }} <span class="required-star">*</span></span>
            <span class="d-sub-hint">{{ $t('homepageUrlHint') }}</span>
          </div>
          <el-input 
            v-model="appForm.homepageUrl" 
            :placeholder="$t('homepageUrlPlaceholder') || 'https://example.com'" 
            clearable
          />
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-label">{{ $t('appDesc') }}</span>
            <span class="d-sub-hint">{{ $t('appDescHint') }}</span>
          </div>
          <el-input 
            v-model="appForm.description" 
            type="textarea" 
            :rows="2" 
            :placeholder="$t('appDescPlaceholder')" 
            maxlength="200"
          />
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-label">{{ $t('callbackUrls') }} <span class="required-star">*</span></span>
            <span class="d-sub-hint">{{ $t('redirectUrisHint') }}</span>
          </div>
          <el-input 
            v-model="appForm.redirectUrisText" 
            type="textarea" 
            :rows="3" 
            :placeholder="$t('callbackUrlsPlaceholder') || 'https://example.com/api/auth/callback\nhttp://localhost:3000/api/auth/callback/epomail'"
          />
          <div class="input-bottom-tips">
            {{ $t('redirectUrisNote') }}
          </div>
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-label">{{ $t('appLogo') }}</span>
            <span class="d-sub-hint">{{ $t('logoUrlHint') }}</span>
          </div>
          <el-input 
            v-model="appForm.logoUrl" 
            :placeholder="$t('appLogoPlaceholder') || 'https://example.com/logo.png'" 
            clearable
          />
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer-actions">
          <el-button @click="appDialogShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="savingApp" @click="submitSaveApp">
            {{ editingAppId ? ($t('save')) : ($t('registerNewApp')) }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG 2: 密钥生成 / 重置成功提示 (GitHub-style Secret Generated Reveal Modal) -->
    <el-dialog
      v-model="secretModalShow"
      :title="$t('newSecretGenerated')"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      class="oauth-dialog secret-reveal-dialog"
    >
      <div class="secret-modal-content">
        <div class="secret-warning-banner">
          <Icon icon="fluent:warning-20-filled" width="20" height="20" class="warn-ic" />
          <div class="warn-text">
            <strong>{{ $t('importantNotice') }}</strong>
            <p>{{ $t('newSecretNotice') }}</p>
          </div>
        </div>

        <div class="credential-reveal-group">
          <div class="rev-row">
            <span class="rev-label">Client ID</span>
            <div class="rev-input-box">
              <span class="font-mono rev-value">{{ currentSecretData.clientId }}</span>
              <el-button link type="primary" @click="copyText(currentSecretData.clientId, 'Client ID')">
                <Icon icon="fluent:copy-16-regular" width="15" height="15" />
              </el-button>
            </div>
          </div>

          <div class="rev-row">
            <span class="rev-label">Client Secret</span>
            <div class="rev-input-box highlight-secret">
              <span class="font-mono rev-value secret-text">{{ currentSecretData.clientSecretPlain }}</span>
              <el-button link type="primary" @click="copyText(currentSecretData.clientSecretPlain, 'Client Secret')">
                <Icon icon="fluent:copy-16-regular" width="15" height="15" />
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="secret-modal-footer">
          <el-button type="primary" @click="secretModalShow = false" class="saved-confirm-btn">
            {{ $t('iHaveSavedSecret') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG 3: 快速集成指南与代码生成器 (Integration Playground Dialog) -->
    <el-dialog
      v-model="quickGuideDialogShow"
      :title="$t('oauthQuickGuide')"
      width="680px"
      class="oauth-dialog guide-dialog"
    >
      <div class="guide-dialog-content">
        <div class="guide-app-selector">
          <span class="sel-label">{{ $t('useCredsGenerateExample') }}</span>
          <el-select v-model="selectedGuideAppId" :placeholder="$t('selectAppPlaceholder')" style="width: 260px;" size="small">
            <el-option
              v-for="app in appsList"
              :key="app.id"
              :label="app.name"
              :value="app.id"
            />
          </el-select>
        </div>

        <el-tabs v-model="guideActiveTab" class="guide-tabs">
          <!-- NextAuth.js / Auth.js Tab -->
          <el-tab-pane label="NextAuth.js (Auth.js)" name="nextauth">
            <div class="code-block-wrapper">
              <div class="code-header">
                <span>pages/api/auth/[...nextauth].ts 或 auth.ts</span>
                <el-button link type="primary" size="small" @click="copyCode(nextAuthSnippet)">
                  <Icon icon="fluent:copy-16-regular" width="13" height="13" style="margin-right: 4px;" />
                  {{ $t('copyConfig') }}
                </el-button>
              </div>
              <pre class="code-body font-mono"><code>{{ nextAuthSnippet }}</code></pre>
            </div>
          </el-tab-pane>

          <!-- Node.js / Express Tab -->
          <el-tab-pane label="Node.js / Express" name="nodejs">
            <div class="code-block-wrapper">
              <div class="code-header">
                <span>{{ $t('nodejsSampleCaption') }}</span>
                <el-button link type="primary" size="small" @click="copyCode(nodeJsSnippet)">
                  <Icon icon="fluent:copy-16-regular" width="13" height="13" style="margin-right: 4px;" />
                  {{ $t('copyCodeSample') }}
                </el-button>
              </div>
              <pre class="code-body font-mono"><code>{{ nodeJsSnippet }}</code></pre>
            </div>
          </el-tab-pane>

          <!-- Python FastAPI / Authlib Tab -->
          <el-tab-pane label="Python (FastAPI / Authlib)" name="python">
            <div class="code-block-wrapper">
              <div class="code-header">
                <span>{{ $t('fastapiSampleCaption') }}</span>
                <el-button link type="primary" size="small" @click="copyCode(pythonSnippet)">
                  <Icon icon="fluent:copy-16-regular" width="13" height="13" style="margin-right: 4px;" />
                  {{ $t('copyConfig') }}
                </el-button>
              </div>
              <pre class="code-body font-mono"><code>{{ pythonSnippet }}</code></pre>
            </div>
          </el-tab-pane>

          <!-- Standard cURL / HTTP Tab -->
          <el-tab-pane label="cURL / REST API" name="curl">
            <div class="code-block-wrapper">
              <div class="code-header">
                <span>{{ $t('curlSampleCaption') }}</span>
                <el-button link type="primary" size="small" @click="copyCode(curlSnippet)">
                  <Icon icon="fluent:copy-16-regular" width="13" height="13" style="margin-right: 4px;" />
                  {{ $t('copyCommand') }}
                </el-button>
              </div>
              <pre class="code-body font-mono"><code>{{ curlSnippet }}</code></pre>
            </div>
          </el-tab-pane>

          <!-- General OIDC (Casdoor / Keycloak / Portainer) Tab -->
          <el-tab-pane :label="$t('generalOidcPanelTab')" name="general">
            <div class="general-oidc-table">
              <div class="oidc-param-row">
                <span class="p-name">{{ $t('issuerLabel') }}</span>
                <span class="p-val font-mono">{{ currentOrigin }}</span>
              </div>
              <div class="oidc-param-row">
                <span class="p-name">Discovery URL</span>
                <span class="p-val font-mono">{{ currentOrigin }}/.well-known/openid-configuration</span>
              </div>
              <div class="oidc-param-row">
                <span class="p-name">Authorize Endpoint</span>
                <span class="p-val font-mono">{{ currentOrigin }}/oauth/authorize</span>
              </div>
              <div class="oidc-param-row">
                <span class="p-name">Token Endpoint</span>
                <span class="p-val font-mono">{{ currentOrigin }}/api/oauth/token</span>
              </div>
              <div class="oidc-param-row">
                <span class="p-name">UserInfo Endpoint</span>
                <span class="p-val font-mono">{{ currentOrigin }}/api/oauth/userinfo</span>
              </div>
              <div class="oidc-param-row">
                <span class="p-name">Scopes</span>
                <span class="p-val font-mono">openid profile email</span>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import {
  getOAuthApps,
  createOAuthApp,
  updateOAuthApp,
  resetOAuthAppSecret,
  setOAuthAppStatus,
  deleteOAuthApp
} from '@/request/oauth-app.js'
import { useSettingStore } from '@/store/setting.js'
import { getOfficialLink } from '@/const/links-const.js'

defineOptions({
  name: 'oauth-app'
})

const settingStore = useSettingStore()

const { t } = useI18n()

const SAMPLE_APP_SEED_DESC = 'EpoCanvas / shijianus 博客原生集成示例应用（官方内置示例，站长可随时修改或直接删除）';
function localizedAppDesc(desc) {
  if (!desc) return '';
  return desc.trim() === SAMPLE_APP_SEED_DESC ? t('sampleAppDesc') : desc;
}
const loading = ref(false)
const appsList = ref([])

// App Create / Edit Dialog States
const appDialogShow = ref(false)
const editingAppId = ref(null)
const savingApp = ref(false)
const appForm = reactive({
  name: '',
  homepageUrl: '',
  description: '',
  redirectUrisText: '',
  logoUrl: '',
  scopes: 'openid profile email'
})

// Secret Reveal Modal States
const secretModalShow = ref(false)
const currentSecretData = reactive({
  id: null,
  name: '',
  clientId: '',
  clientSecretPlain: ''
})

// Quick Guide Dialog States
const quickGuideDialogShow = ref(false)
const guideActiveTab = ref('nextauth')
const selectedGuideAppId = ref(null)

const currentOrigin = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'https://mail.yourdomain.com'
})

const activeAppForGuide = computed(() => {
  if (selectedGuideAppId.value) {
    const found = appsList.value.find(a => a.id === selectedGuideAppId.value)
    if (found) return found
  }
  return appsList.value[0] || {
    name: 'My Application',
    clientId: 'epo_live_your_client_id',
    homepageUrl: 'https://example.com',
    redirectUris: ['https://example.com/api/auth/callback/epomail']
  }
})

// Code Snippets
const nextAuthSnippet = computed(() => {
  const origin = currentOrigin.value
  const app = activeAppForGuide.value
  return `import NextAuth from "next-auth";

export const authOptions = {
  providers: [
    {
      id: "epomail",
      name: "Epomail",
      type: "oauth",
      wellKnown: "${origin}/.well-known/openid-configuration",
      authorization: { params: { scope: "openid profile email" } },
      clientId: "${app.clientId || 'YOUR_CLIENT_ID'}",
      clientSecret: process.env.EPOMAIL_CLIENT_SECRET, // 填入生成的 Client Secret
      idToken: true,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    },
  ],
};

export default NextAuth(authOptions);`
})

const nodeJsSnippet = computed(() => {
  const origin = currentOrigin.value
  const app = activeAppForGuide.value
  const cb = (app.redirectUris && app.redirectUris[0]) || 'https://example.com/api/auth/callback'
  return `// 1. 发起授权跳转 (Redirect to Epomail)
const authUrl = "${origin}/oauth/authorize?" + new URLSearchParams({
  client_id: "${app.clientId || 'YOUR_CLIENT_ID'}",
  redirect_uri: "${cb}",
  response_type: "code",
  scope: "openid profile email",
  state: "custom_random_state_string"
});

// 2. 回调换取 Token 与 UserInfo (Handle Callback)
app.get("/api/auth/callback", async (req, res) => {
  const { code } = req.query;
  
  // 兑换 Token
  const tokenRes = await fetch("${origin}/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: "${app.clientId || 'YOUR_CLIENT_ID'}",
      client_secret: process.env.EPOMAIL_CLIENT_SECRET,
      redirect_uri: "${cb}"
    })
  });
  const tokenData = await tokenRes.json();
  
  // 获取用户资料
  const userRes = await fetch("${origin}/api/oauth/userinfo", {
    headers: { Authorization: \`Bearer \${tokenData.access_token}\` }
  });
  const user = await userRes.json();
  console.log("登录成功 Epomail 用户:", user);
  res.json({ success: true, user });
});`
})

const pythonSnippet = computed(() => {
  const origin = currentOrigin.value
  const app = activeAppForGuide.value
  return `from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI, Request

app = FastAPI()
oauth = OAuth()

oauth.register(
    name='epomail',
    client_id='${app.clientId || 'YOUR_CLIENT_ID'}',
    client_secret='YOUR_CLIENT_SECRET',
    server_metadata_url='${origin}/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid profile email'}
)

@app.get('/login')
async def login(request: Request):
    redirect_uri = request.url_for('auth_callback')
    return await oauth.epomail.authorize_redirect(request, redirect_uri)

@app.get('/auth/callback')
async def auth_callback(request: Request):
    token = await oauth.epomail.authorize_access_token(request)
    user = token.get('userinfo')
    return {"status": "success", "user": user}`
})

const curlSnippet = computed(() => {
  const origin = currentOrigin.value
  const app = activeAppForGuide.value
  const cb = (app.redirectUris && app.redirectUris[0]) || 'https://example.com/callback'
  return `# 1. 引导用户访问授权地址
${origin}/oauth/authorize?client_id=${app.clientId || 'YOUR_CLIENT_ID'}&redirect_uri=${encodeURIComponent(cb)}&response_type=code&scope=openid%20profile%20email&state=xyz123

# 2. 获取授权码后置换 Token
curl -X POST ${origin}/api/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "client_id": "${app.clientId || 'YOUR_CLIENT_ID'}",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code": "epo_code_xxxxxxxxxxxx",
    "redirect_uri": "${cb}"
  }'

# 3. 使用 Access Token 读取用户资料
curl -X GET ${origin}/api/oauth/userinfo \\
  -H "Authorization: Bearer epo_access_token_here"`
})

onMounted(() => {
  fetchApps()
})

async function fetchApps() {
  loading.value = true
  try {
    const res = await getOAuthApps()
    appsList.value = Array.isArray(res) ? res : []
    if (appsList.value.length > 0 && !selectedGuideAppId.value) {
      selectedGuideAppId.value = appsList.value[0].id
    }
  } catch (err) {
    ElMessage.error(err.message || t('getAppsFailed'))
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  editingAppId.value = null
  appForm.name = ''
  appForm.homepageUrl = ''
  appForm.description = ''
  appForm.redirectUrisText = ''
  appForm.logoUrl = ''
  appForm.scopes = 'openid profile email'
  appDialogShow.value = true
}

function openBlogTutorial() {
  const url = getOfficialLink('blog', settingStore)
  window.open(url, '_blank')
}

function openEditDialog(app) {
  editingAppId.value = app.id
  appForm.name = app.name || ''
  appForm.homepageUrl = app.homepageUrl || ''
  appForm.description = app.description || ''
  const uris = Array.isArray(app.redirectUris) ? app.redirectUris : []
  appForm.redirectUrisText = uris.join('\n')
  appForm.logoUrl = app.logoUrl || ''
  appForm.scopes = app.scopes || 'openid profile email'
  appDialogShow.value = true
}

function openQuickGuideWithApp(app) {
  if (app && app.id) {
    selectedGuideAppId.value = app.id
  }
  quickGuideDialogShow.value = true
}

async function submitSaveApp() {
  if (!appForm.name.trim()) {
    ElMessage.warning(t('appNameRequired'))
    return
  }
  if (!appForm.homepageUrl.trim()) {
    ElMessage.warning(t('appHomepageRequired'))
    return
  }
  const uris = appForm.redirectUrisText.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean)
  if (uris.length === 0) {
    ElMessage.warning(t('redirectUriRequired'))
    return
  }

  savingApp.value = true
  try {
    const payload = {
      name: appForm.name.trim(),
      homepageUrl: appForm.homepageUrl.trim(),
      description: appForm.description.trim(),
      redirectUris: uris,
      logoUrl: appForm.logoUrl.trim(),
      scopes: appForm.scopes.trim()
    }

    if (editingAppId.value) {
      payload.id = editingAppId.value
      await updateOAuthApp(payload)
      ElMessage.success(t('appConfigUpdated'))
      appDialogShow.value = false
      await fetchApps()
    } else {
      const created = await createOAuthApp(payload)
      appDialogShow.value = false
      await fetchApps()

      // Show GitHub-style Secret Generated Dialog
      if (created && created.clientSecretPlain) {
        currentSecretData.id = created.id
        currentSecretData.name = created.name
        currentSecretData.clientId = created.clientId
        currentSecretData.clientSecretPlain = created.clientSecretPlain
        secretModalShow.value = true
      }
    }
  } catch (err) {
    ElMessage.error(err.message || t('saveAppFailed'))
  } finally {
    savingApp.value = false
  }
}

async function handleResetSecret(app) {
  try {
    await ElMessageBox.confirm(
      t('resetSecretConfirm'),
      '重置密钥确认',
      {
        confirmButtonText: t('confirmReset'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }
    )

    const res = await resetOAuthAppSecret(app.id)
    if (res && res.clientSecretPlain) {
      currentSecretData.id = res.id
      currentSecretData.name = res.name
      currentSecretData.clientId = res.clientId
      currentSecretData.clientSecretPlain = res.clientSecretPlain
      secretModalShow.value = true
    }
    await fetchApps()
    ElMessage.success(t('clientSecretResetSuccess'))
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || t('resetSecretFailed'))
    }
  }
}

async function handleStatusChange(app, statusVal) {
  try {
    await setOAuthAppStatus(app.id, statusVal)
    ElMessage.success(statusVal === 1 ? t('appEnabled') : t('appDisabled'))
  } catch (err) {
    app.status = statusVal === 1 ? 0 : 1
    ElMessage.error(err.message || t('updateStatusFailed'))
  }
}

async function handleDeleteApp(app) {
  try {
    await ElMessageBox.confirm(
      t('deleteAppConfirm', { name: app.name }),
      t('deleteAppConfirmTitle'),
      {
        confirmButtonText: t('confirmDelete'),
        cancelButtonText: t('cancel'),
        type: 'error'
      }
    )

    await deleteOAuthApp(app.id)
    ElMessage.success(t('appDeletedSuccess'))
    await fetchApps()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || t('deleteAppFailed'))
    }
  }
}

function copyEndpoint(endpointPath) {
  const fullUrl = `${currentOrigin.value}${endpointPath}`
  copyText(fullUrl, endpointPath)
}

function copyText(text, label) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success(t('copySuccessMsg'))
  })
}

function copyCode(code) {
  if (!code) return
  navigator.clipboard.writeText(code).then(() => {
    ElMessage.success(t('copiedToClipboard'))
  })
}

function getInitialChar(name) {
  if (!name) return 'A'
  return name.trim().charAt(0).toUpperCase()
}

function getAvatarBg(name) {
  const gradients = [
    'linear-gradient(135deg, #3b82f6, #6366f1)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #3b82f6)'
  ]
  if (!name) return gradients[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
  }
  const idx = Math.abs(hash) % gradients.length
  return gradients[idx]
}

function handleLogoError(event, app) {
  app.logoUrl = ''
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return t('createdAtLabel', { date: d.toLocaleDateString() })
  } catch (e) {
    return isoStr
  }
}
</script>

<style lang="scss" scoped>
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 24px 16px;
  }
}

.container {
  padding: 24px;
  border-radius: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: 24px;
}

/* 1. Header Container */
.header-container {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .header-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;

    .main-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;

      .create-app-btn {
        font-weight: 600;
        border-radius: 8px;
      }

      .guide-btn {
        border-radius: 8px;
        font-weight: 500;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        display: inline-flex;
        align-items: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

        &:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-surface));
        }
      }
    }
  }

  .section-intro {
    font-size: 13.5px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .endpoints-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px;
    margin-top: 6px;
    padding-top: 14px;
    border-top: 1px dashed var(--border-subtle);

    .endpoint-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent-primary) 3%, var(--bg-surface));
      border: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--accent-primary);
        background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-surface));

        .copy-ic {
          opacity: 1;
          color: var(--accent-primary);
        }
      }

      .ep-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;

        &.get {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }
        &.post {
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
        }
      }

      .ep-path {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ep-hint {
        font-size: 11px;
        color: var(--text-muted);
        margin-left: auto;
        white-space: nowrap;
      }

      .copy-ic {
        opacity: 0.5;
        transition: opacity 0.2s;
        flex-shrink: 0;
      }
    }
  }
}

/* 2. Apps Container & Grid */
.apps-container {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .apps-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .apps-count-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;

      .count-bubble {
        background: var(--accent-muted);
        color: var(--accent-primary);
        font-size: 12px;
        font-weight: 700;
        padding: 1px 8px;
        border-radius: 12px;
      }
    }
  }
}

.empty-apps-box {
  padding: 44px 24px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px dashed var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  .empty-icon-wrap {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
    color: var(--accent-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .empty-title {
    font-size: 15.5px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .empty-desc {
    font-size: 13px;
    color: var(--text-secondary);
    max-width: 480px;
    line-height: 1.5;
    margin-bottom: 14px;
  }

  .empty-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;

  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}

.app-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
  }

  .app-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;

    .app-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;

      .app-logo-avatar {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .app-avatar-char {
          color: #ffffff;
          font-weight: 700;
          font-size: 16px;
        }
      }

      .app-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;

        .app-name-row {
          display: flex;
          align-items: center;
          gap: 5px;

          .app-name {
            font-size: 14.5px;
            font-weight: 600;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .app-link {
            color: var(--text-muted);
            transition: color 0.2s;
            display: flex;
            align-items: center;

            &:hover {
              color: var(--accent-primary);
            }
          }
        }

        .app-created-time {
          font-size: 11px;
          color: var(--text-muted);
        }
      }
    }

    .app-status-switch {
      flex-shrink: 0;
    }
  }

  .app-desc-text {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: auto;
    margin: 0;
  }

  .app-credentials-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 10px;
    border-radius: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);

    .cred-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11.5px;

      .cred-label {
        font-weight: 600;
        color: var(--text-muted);
        font-size: 11px;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .cred-val {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        font-weight: 600;
        color: var(--text-primary);
        min-width: 0;
        flex: 1;

        .cred-mono-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: right;
        }

        .masked-secret {
          color: var(--text-muted);
          letter-spacing: 1px;
        }

        .cred-action-btn {
          padding: 2px 4px;
          height: auto;
          line-height: 1;
          flex-shrink: 0;
        }
      }
    }
  }

  .app-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px dashed var(--border-subtle);
    margin-top: auto;

    .action-btn {
      border-radius: 6px;
      font-size: 11.5px;
      height: 26px;
      padding: 0 8px;
      display: inline-flex;
      align-items: center;

      &.danger {
        color: var(--el-color-danger);

        &:hover {
          color: #ffffff;
          background: var(--el-color-danger);
          border-color: var(--el-color-danger);
        }
      }
    }

    .footer-right-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }
}

/* Modal and Form Styles */
.dialog-body-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .d-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .d-label {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);

      .required-star {
        color: var(--el-color-danger);
      }
    }

    .d-sub-hint {
      font-size: 12px;
      color: var(--text-muted);
    }
  }

  .input-bottom-tips {
    font-size: 11.5px;
    color: var(--text-muted);
    line-height: 1.4;
  }
}

.dialog-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Secret Reveal Modal */
.secret-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .secret-warning-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);

    .warn-ic {
      color: #f59e0b;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .warn-text {
      font-size: 12.5px;
      color: var(--text-primary);
      line-height: 1.45;

      strong {
        color: #d97706;
      }

      p {
        margin-top: 4px;
        color: var(--text-secondary);
      }
    }
  }

  .credential-reveal-group {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .rev-row {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .rev-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-muted);
      }

      .rev-input-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-radius: 8px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);

        &.highlight-secret {
          background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-surface));
          border-color: var(--accent-primary);

          .secret-text {
            color: var(--accent-primary);
            font-weight: 700;
          }
        }

        .rev-value {
          font-size: 13.5px;
          user-select: all;
          word-break: break-all;
        }
      }
    }
  }
}

.secret-modal-footer {
  display: flex;
  justify-content: flex-end;

  .saved-confirm-btn {
    border-radius: 8px;
    font-weight: 600;
    width: 100%;
  }
}

/* Quick Guide Modal */
.guide-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .guide-app-selector {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-subtle);

    .sel-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
    }
  }

  .code-block-wrapper {
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    overflow: hidden;

    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: color-mix(in srgb, var(--text-primary) 4%, var(--bg-surface));
      border-bottom: 1px solid var(--border-subtle);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .code-body {
      padding: 14px;
      margin: 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--text-primary);
      overflow-x: auto;
      max-height: 360px;
    }
  }

  .general-oidc-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);

    .oidc-param-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-bottom: 1px dashed var(--border-subtle);
      font-size: 12.5px;

      &:last-child {
        border-bottom: none;
      }

      .p-name {
        font-weight: 600;
        color: var(--text-muted);
      }

      .p-val {
        color: var(--accent-primary);
        font-weight: 600;
      }
    }
  }
}
</style>
