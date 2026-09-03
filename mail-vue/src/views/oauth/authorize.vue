<template>
  <div class="oauth-auth-page">
    <div class="oauth-card-container">
      <!-- Loading State -->
      <div v-if="pageLoading" class="loading-state">
        <Icon icon="fluent:spinner-ios-20-regular" width="36" height="36" class="spin-icon" />
        <span>正在加载应用授权信息...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMessage" class="error-state">
        <div class="err-icon-wrap">
          <Icon icon="fluent:error-circle-24-filled" width="40" height="40" />
        </div>
        <div class="err-title">授权请求失败</div>
        <div class="err-desc">{{ errorMessage }}</div>
        <el-button type="primary" plain @click="goHome" style="margin-top: 16px; border-radius: 8px;">
          返回首页
        </el-button>
      </div>

      <!-- Not Logged In: Inline Fast Login -->
      <div v-else-if="!authInfo.isLoggedIn" class="login-prompt-state">
        <div class="brand-connection-bar">
          <div class="brand-chip epomail-chip">
            <img src="/logo.svg" alt="Epomail" width="28" height="28" />
          </div>
          <Icon icon="fluent:link-20-regular" width="20" height="20" class="conn-icon" />
          <div class="brand-chip app-chip" :style="{ background: getAvatarBg(authInfo.app?.name) }">
            <img v-if="authInfo.app?.logoUrl" :src="authInfo.app.logoUrl" :alt="authInfo.app.name" />
            <span v-else class="app-initial">{{ getInitialChar(authInfo.app?.name) }}</span>
          </div>
        </div>

        <div class="auth-headings">
          <div class="auth-title">登录并授权 {{ authInfo.app?.name }}</div>
          <div class="auth-subtitle">请先登录您的 Epomail 账号，以继续完成第三方授权流程。</div>
        </div>

        <div class="inline-login-form">
          <el-input 
            v-model="loginForm.email" 
            placeholder="邮箱地址 (例如: user@yourdomain.com)" 
            size="large"
            clearable
          >
            <template #prefix>
              <Icon icon="fluent:mail-20-regular" width="18" height="18" />
            </template>
          </el-input>

          <el-input 
            v-model="loginForm.password" 
            type="password" 
            show-password 
            placeholder="密码" 
            size="large"
            @keyup.enter="handleInlineLogin"
          >
            <template #prefix>
              <Icon icon="fluent:lock-closed-20-regular" width="18" height="18" />
            </template>
          </el-input>

          <el-input 
            v-if="requireTotp"
            v-model="loginForm.code" 
            placeholder="6 位数字 TOTP 动态验证码" 
            size="large"
            maxlength="6"
            @keyup.enter="handleInlineLogin"
          >
            <template #prefix>
              <Icon icon="fluent:shield-keyhole-20-regular" width="18" height="18" />
            </template>
          </el-input>

          <el-button 
            type="primary" 
            size="large" 
            :loading="loggingIn" 
            @click="handleInlineLogin" 
            class="submit-login-btn"
          >
            登录并接续授权
          </el-button>
        </div>

        <div class="auth-card-footer">
          <el-button link @click="handleCancel" class="cancel-auth-btn">
            取消并返回
          </el-button>
        </div>
      </div>

      <!-- Logged In: Standard Consent Card -->
      <div v-else class="consent-state">
        <!-- Brand Connection Graphic -->
        <div class="brand-connection-bar">
          <div class="brand-chip epomail-chip" title="Epomail Identity">
            <img src="/logo.svg" alt="Epomail" width="30" height="30" />
          </div>
          <div class="connection-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <div class="brand-chip app-chip" :style="{ background: getAvatarBg(authInfo.app?.name) }" :title="authInfo.app?.name">
            <img v-if="authInfo.app?.logoUrl" :src="authInfo.app.logoUrl" :alt="authInfo.app.name" />
            <span v-else class="app-initial">{{ getInitialChar(authInfo.app?.name) }}</span>
          </div>
        </div>

        <!-- Headings -->
        <div class="auth-headings">
          <div class="auth-title">
            <span class="highlight-app-name">{{ authInfo.app?.name }}</span>
            <span> {{ $t('oauthAuthorizeSub') || '申请访问您的 Epomail 账号' }}</span>
          </div>
          <div v-if="authInfo.app?.homepageUrl" class="app-origin-sub">
            <Icon icon="fluent:globe-16-regular" width="14" height="14" />
            <a :href="authInfo.app.homepageUrl" target="_blank">{{ getHostname(authInfo.app.homepageUrl) }}</a>
          </div>
        </div>

        <!-- Current User Account Chip -->
        <div class="current-user-chip">
          <div class="user-avatar-wrap">
            <div class="user-avatar-circle">{{ formatName(authInfo.user?.name || authInfo.user?.email) }}</div>
          </div>
          <div class="user-info-text">
            <div class="user-name">{{ authInfo.user?.name || authInfo.user?.email }}</div>
            <div class="user-email font-mono">{{ authInfo.user?.email }}</div>
          </div>
          <el-button link type="primary" size="small" @click="handleSwitchAccount" class="switch-act-btn">
            {{ $t('switchAccount') || '切换账号' }}
          </el-button>
        </div>

        <!-- Scopes Permission List -->
        <div class="scopes-section">
          <div class="scopes-title">{{ $t('oauthScopesRequested') || '此应用将获得以下授权：' }}</div>
          <div class="scopes-list">
            <div class="scope-item">
              <div class="scope-icon success">
                <Icon icon="fluent:checkmark-circle-16-filled" width="16" height="16" />
              </div>
              <div class="scope-text">
                <div class="s-name">OpenID 身份凭据 (openid)</div>
                <div class="s-desc">{{ $t('scopeOpenidDesc') || '验证您的唯一用户身份标识 (OpenID)' }}</div>
              </div>
            </div>

            <div class="scope-item">
              <div class="scope-icon success">
                <Icon icon="fluent:checkmark-circle-16-filled" width="16" height="16" />
              </div>
              <div class="scope-text">
                <div class="s-name">电子邮箱地址 (email)</div>
                <div class="s-desc">{{ $t('scopeEmailDesc') || '读取您的主要邮箱地址与验证状态' }}</div>
              </div>
            </div>

            <div class="scope-item">
              <div class="scope-icon success">
                <Icon icon="fluent:checkmark-circle-16-filled" width="16" height="16" />
              </div>
              <div class="scope-text">
                <div class="s-name">个人公开资料 (profile)</div>
                <div class="s-desc">{{ $t('scopeProfileDesc') || '读取您的昵称与头像基本资料' }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Security Disclaimer -->
        <div class="security-disclaimer">
          <Icon icon="fluent:shield-lock-16-regular" width="14" height="14" class="sec-ic" />
          <span>授权不会向此应用泄露您的密码或邮件正文。您随时可在安全设置中撤销授权。</span>
        </div>

        <!-- Action Buttons -->
        <div class="consent-actions-group">
          <el-button 
            type="primary" 
            size="large" 
            :loading="authorizing" 
            @click="handleConfirmAuthorize" 
            class="authorize-btn"
          >
            {{ $t('authorizeAndContinue') || `授权 ${authInfo.app?.name}` }}
          </el-button>
          
          <el-button 
            size="large" 
            @click="handleCancel" 
            class="cancel-btn"
          >
            {{ $t('cancelAuthorization') || '取消' }}
          </el-button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { getOAuthAuthorizeInfo, confirmOAuthAuthorize } from '@/request/oauth-app.js'
import { login } from '@/request/login.js'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const pageLoading = ref(true)
const errorMessage = ref('')
const authorizing = ref(false)
const loggingIn = ref(false)
const requireTotp = ref(false)

const authInfo = reactive({
  isLoggedIn: false,
  user: null,
  app: null,
  requestedScopes: [],
  redirectUri: '',
  state: ''
})

const loginForm = reactive({
  email: '',
  password: '',
  code: ''
})

onMounted(async () => {
  await fetchAuthorizeDetails()
})

async function fetchAuthorizeDetails() {
  pageLoading.value = true
  errorMessage.value = ''
  try {
    const query = {
      client_id: route.query.client_id || route.query.clientId,
      redirect_uri: route.query.redirect_uri || route.query.redirectUri,
      scope: route.query.scope,
      state: route.query.state
    }

    if (!query.client_id) {
      errorMessage.value = '缺少必要的 client_id 参数，请检查第三方应用的请求地址。'
      return
    }

    const res = await getOAuthAuthorizeInfo(query)
    if (res) {
      authInfo.isLoggedIn = !!res.isLoggedIn
      authInfo.user = res.user
      authInfo.app = res.app
      authInfo.requestedScopes = res.requestedScopes || []
      authInfo.redirectUri = res.redirectUri
      authInfo.state = res.state || route.query.state || ''
    }
  } catch (err) {
    errorMessage.value = err.message || '获取授权应用信息失败'
  } finally {
    pageLoading.value = false
  }
}

async function handleConfirmAuthorize() {
  authorizing.value = true
  try {
    const payload = {
      client_id: authInfo.app?.clientId || route.query.client_id,
      redirect_uri: authInfo.redirectUri || route.query.redirect_uri,
      scope: route.query.scope || 'openid profile email',
      state: authInfo.state || route.query.state || '',
      code_challenge: route.query.code_challenge || '',
      code_challenge_method: route.query.code_challenge_method || 'S256'
    }

    const res = await confirmOAuthAuthorize(payload)
    if (res && res.redirectUri) {
      // 1. Popup Window Flow
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({
            type: 'EPOMAIL_OAUTH_SUCCESS',
            code: res.code,
            state: res.state
          }, '*')
          window.close()
          return
        } catch (e) {
          // fallback to top redirect
        }
      }

      // 2. Direct Redirect Flow
      window.location.replace(res.redirectUri)
    }
  } catch (err) {
    ElMessage.error(err.message || '授权确认失败')
  } finally {
    authorizing.value = false
  }
}

function handleCancel() {
  const targetUri = authInfo.redirectUri || route.query.redirect_uri
  if (targetUri) {
    const cancelUrl = new URL(targetUri)
    cancelUrl.searchParams.set('error', 'access_denied')
    cancelUrl.searchParams.set('error_description', 'The user cancelled the authorization request')
    if (authInfo.state || route.query.state) {
      cancelUrl.searchParams.set('state', authInfo.state || route.query.state)
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({
          type: 'EPOMAIL_OAUTH_CANCEL',
          error: 'access_denied'
        }, '*')
        window.close()
        return
      } catch (e) {
        // fallback
      }
    }

    window.location.replace(cancelUrl.toString())
  } else {
    goHome()
  }
}

async function handleInlineLogin() {
  if (!loginForm.email.trim() || !loginForm.password.trim()) {
    ElMessage.warning('请输入邮箱地址和密码')
    return
  }

  loggingIn.value = true
  try {
    const res = await login({
      email: loginForm.email.trim(),
      password: loginForm.password.trim(),
      code: loginForm.code.trim()
    })

    if (res && res.token) {
      localStorage.setItem('token', res.token)
      await fetchAuthorizeDetails()
    }
  } catch (err) {
    if (err.message && err.message.includes('TOTP')) {
      requireTotp.value = true
    }
    ElMessage.error(err.message || '登录失败，请检查账号密码')
  } finally {
    loggingIn.value = false
  }
}

function handleSwitchAccount() {
  localStorage.removeItem('token')
  authInfo.isLoggedIn = false
  authInfo.user = null
}

function goHome() {
  router.push('/')
}

function formatName(str) {
  if (!str) return 'U'
  return str.trim().charAt(0).toUpperCase()
}

function getInitialChar(name) {
  if (!name) return 'A'
  return name.trim().charAt(0).toUpperCase()
}

function getHostname(urlStr) {
  try {
    const u = new URL(urlStr)
    return u.hostname
  } catch (e) {
    return urlStr
  }
}

function getAvatarBg(name) {
  const gradients = [
    'linear-gradient(135deg, #3b82f6, #6366f1)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)'
  ]
  if (!name) return gradients[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
  }
  return gradients[Math.abs(hash) % gradients.length]
}
</script>

<style lang="scss" scoped>
.oauth-auth-page {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base, #f4f7fc);
  padding: 24px 16px;
  box-sizing: border-box;
}

.oauth-card-container {
  width: 100%;
  max-width: 460px;
  background: var(--bg-surface, #ffffff);
  border-radius: 16px;
  border: 1px solid var(--border-subtle, #e5e7eb);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
  padding: 32px 28px;
  box-sizing: border-box;
}

/* Loading & Error States */
.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 30px 10px;
  gap: 12px;
  font-size: 14px;
  color: var(--text-secondary);

  .spin-icon {
    animation: spin 1s linear infinite;
    color: var(--accent-primary);
  }

  .err-icon-wrap {
    color: var(--el-color-danger);
  }

  .err-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .err-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Brand Connection Bar */
.brand-connection-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 22px;

  .brand-chip {
    width: 54px;
    height: 54px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    overflow: hidden;

    &.epomail-chip {
      background: #ffffff;
      border: 1px solid var(--border-subtle);
    }

    &.app-chip {
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .app-initial {
        color: #ffffff;
        font-weight: 700;
        font-size: 22px;
      }
    }
  }

  .conn-icon {
    color: var(--text-muted);
  }

  .connection-dots {
    display: flex;
    gap: 5px;

    .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--border-mid, #cbd5e1);
    }
  }
}

/* Headings */
.auth-headings {
  text-align: center;
  margin-bottom: 20px;

  .auth-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.4;

    .highlight-app-name {
      color: var(--accent-primary);
    }
  }

  .auth-subtitle {
    font-size: 12.5px;
    color: var(--text-secondary);
    margin-top: 6px;
    line-height: 1.45;
  }

  .app-origin-sub {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 6px;

    a {
      color: var(--text-secondary);
      text-decoration: none;

      &:hover {
        color: var(--accent-primary);
        text-decoration: underline;
      }
    }
  }
}

/* Current User Chip */
.current-user-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent-muted) 6%, var(--bg-surface));
  border: 1px solid var(--border-subtle);
  margin-bottom: 20px;

  .user-avatar-wrap {
    .user-avatar-circle {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--accent-primary);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
  }

  .user-info-text {
    flex: 1;
    min-width: 0;

    .user-name {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .switch-act-btn {
    font-size: 12px;
    flex-shrink: 0;
  }
}

/* Scopes Section */
.scopes-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;

  .scopes-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .scopes-list {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .scope-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);

      .scope-icon {
        margin-top: 1px;
        flex-shrink: 0;

        &.success {
          color: #10b981;
        }
      }

      .scope-text {
        display: flex;
        flex-direction: column;
        gap: 1px;

        .s-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .s-desc {
          font-size: 11.5px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
      }
    }
  }
}

/* Security Disclaimer */
.security-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
  margin-bottom: 22px;
  padding: 0 4px;

  .sec-ic {
    color: var(--accent-primary);
    flex-shrink: 0;
    margin-top: 2px;
  }
}

/* Actions Group */
.consent-actions-group {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .authorize-btn {
    width: 100%;
    font-weight: 600;
    border-radius: 10px;
    height: 44px;
    font-size: 14.5px;
  }

  .cancel-btn {
    width: 100%;
    border-radius: 10px;
    height: 40px;
  }
}

/* Inline Login Form */
.inline-login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 16px;

  .submit-login-btn {
    width: 100%;
    font-weight: 600;
    border-radius: 10px;
    height: 44px;
    margin-top: 4px;
  }
}

.auth-card-footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;

  .cancel-auth-btn {
    font-size: 13px;
    color: var(--text-muted);
  }
}
</style>
