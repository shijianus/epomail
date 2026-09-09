<template>
  <div class="oauth-auth-page">
    <div class="oauth-card-container">
      <!-- Loading State -->
      <div v-if="pageLoading" class="loading-state">
        <Icon icon="solar:restart-circle-bold-duotone" width="40" height="40" class="spin-icon" />
        <span class="loading-text">{{ $t('loading') || '正在加载授权信息...' }}</span>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMessage" class="error-state">
        <div class="err-icon-wrap">
          <Icon icon="solar:danger-circle-bold-duotone" width="44" height="44" />
        </div>
        <div class="err-title">{{ $t('oauthAuthorizeTitle') || '授权请求失败' }}</div>
        <div class="err-desc">{{ errorMessage }}</div>
        <el-button type="primary" plain @click="goHome" class="error-return-btn">
          {{ $t('back') || '返回首页' }}
        </el-button>
      </div>

      <!-- Not Logged In: Inline Fast Login -->
      <div v-else-if="!authInfo.isLoggedIn" class="login-prompt-state">
        <!-- Brand Connection Bar -->
        <div class="brand-connection-bar">
          <div class="brand-chip epomail-chip" title="Epomail Identity">
            <img src="/logo.svg" alt="Epomail" width="30" height="30" />
          </div>

          <div class="connection-track">
            <div class="track-line"></div>
            <div class="transfer-pill">
              <Icon icon="solar:round-transfer-diagonal-bold" width="14" height="14" class="transfer-ic" />
            </div>
            <div class="track-line"></div>
          </div>

          <!-- App Chip -->
          <div 
            class="brand-chip app-chip" 
            :class="{ 'is-shijianus': isShijianusBlog }" 
            :style="(!isShijianusBlog && (!authInfo.app?.logoUrl || logoLoadFailed)) ? { background: getAvatarBg(authInfo.app?.name) } : {}" 
            :title="authInfo.app?.name"
          >
            <!-- shijianus-blog Tab Icon -->
            <svg v-if="isShijianusBlog" class="shijianus-tab-icon" viewBox="0 0 128 128" fill="currentColor">
              <path d="M50.4 78.5a75.1 75.1 0 0 0-28.5 6.9l24.2-65.7c.7-2 1.9-3.2 3.4-3.2h29c1.5 0 2.7 1.2 3.4 3.2l24.2 65.7s-11.6-7-28.5-7L67 45.5c-.4-1.7-1.6-2.8-2.9-2.8-1.3 0-2.5 1.1-2.9 2.7L50.4 78.5Zm-1.1 28.2Zm-4.2-20.2c-2 6.6-.6 15.8 4.2 20.2a17.5 17.5 0 0 1 .2-.7 5.5 5.5 0 0 1 5.7-4.5c2.8.1 4.3 1.5 4.7 4.7.2 1.1.2 2.3.2 3.5v.4c0 2.7.7 5.2 2.2 7.4a13 13 0 0 0 5.7 4.9v-.3l-.2-.3c-1.8-5.6-.5-9.5 4.4-12.8l1.5-1a73 73 0 0 0 3.2-2.2 16 16 0 0 0 6.8-11.4c.3-2 .1-4-.6-6l-.8.6-1.6 1a37 37 0 0 1-22.4 2.7c-5-.7-9.7-2-13.2-6.2Z" />
            </svg>
            <img v-else-if="authInfo.app?.logoUrl && !logoLoadFailed" :src="authInfo.app.logoUrl" :alt="authInfo.app.name" @error="handleLogoError" />
            <span v-else class="app-initial">{{ getInitialChar(authInfo.app?.name) }}</span>
          </div>
        </div>

        <div class="auth-headings">
          <div class="auth-title">
            <span>登录并授权 </span>
            <span class="highlight-app-name">{{ authInfo.app?.name || '第三方应用' }}</span>
          </div>
          <div class="auth-subtitle">请先验证您的 Epomail 账号以继续完成受信应用授权。</div>
        </div>

        <div class="inline-login-form">
          <el-input 
            v-model="loginForm.email" 
            placeholder="邮箱地址 (例如: user@epomail.bond)" 
            size="large"
            clearable
          >
            <template #prefix>
              <Icon icon="solar:letter-bold-duotone" width="18" height="18" style="color: var(--accent-primary, #425aef);" />
            </template>
          </el-input>

          <el-input 
            v-model="loginForm.password" 
            type="password" 
            show-password 
            placeholder="账号登录密码" 
            size="large"
            @keyup.enter="handleInlineLogin"
          >
            <template #prefix>
              <Icon icon="solar:lock-password-bold-duotone" width="18" height="18" style="color: var(--accent-primary, #425aef);" />
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
              <Icon icon="solar:shield-keyhole-bold-duotone" width="18" height="18" style="color: var(--accent-primary, #425aef);" />
            </template>
          </el-input>

          <div class="consent-actions-group">
            <el-button 
              type="primary" 
              size="large" 
              :loading="loggingIn" 
              @click="handleInlineLogin" 
              class="authorize-btn"
            >
              登录并接续授权
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

      <!-- Logged In: Standard Consent Card -->
      <div v-else class="consent-state">
        <!-- Brand Connection Graphic -->
        <div class="brand-connection-bar">
          <div class="brand-chip epomail-chip" title="Epomail Identity">
            <img src="/logo.svg" alt="Epomail" width="32" height="32" />
          </div>

          <div class="connection-track">
            <div class="track-line"></div>
            <div class="transfer-pill">
              <Icon icon="solar:round-transfer-diagonal-bold" width="14" height="14" class="transfer-ic" />
            </div>
            <div class="track-line"></div>
          </div>

          <!-- App Chip -->
          <div 
            class="brand-chip app-chip" 
            :class="{ 'is-shijianus': isShijianusBlog }" 
            :style="(!isShijianusBlog && (!authInfo.app?.logoUrl || logoLoadFailed)) ? { background: getAvatarBg(authInfo.app?.name) } : {}" 
            :title="authInfo.app?.name"
          >
            <!-- shijianus-blog Tab Icon -->
            <svg v-if="isShijianusBlog" class="shijianus-tab-icon" viewBox="0 0 128 128" fill="currentColor">
              <path d="M50.4 78.5a75.1 75.1 0 0 0-28.5 6.9l24.2-65.7c.7-2 1.9-3.2 3.4-3.2h29c1.5 0 2.7 1.2 3.4 3.2l24.2 65.7s-11.6-7-28.5-7L67 45.5c-.4-1.7-1.6-2.8-2.9-2.8-1.3 0-2.5 1.1-2.9 2.7L50.4 78.5Zm-1.1 28.2Zm-4.2-20.2c-2 6.6-.6 15.8 4.2 20.2a17.5 17.5 0 0 1 .2-.7 5.5 5.5 0 0 1 5.7-4.5c2.8.1 4.3 1.5 4.7 4.7.2 1.1.2 2.3.2 3.5v.4c0 2.7.7 5.2 2.2 7.4a13 13 0 0 0 5.7 4.9v-.3l-.2-.3c-1.8-5.6-.5-9.5 4.4-12.8l1.5-1a73 73 0 0 0 3.2-2.2 16 16 0 0 0 6.8-11.4c.3-2 .1-4-.6-6l-.8.6-1.6 1a37 37 0 0 1-22.4 2.7c-5-.7-9.7-2-13.2-6.2Z" />
            </svg>
            <img v-else-if="authInfo.app?.logoUrl && !logoLoadFailed" :src="authInfo.app.logoUrl" :alt="authInfo.app.name" @error="handleLogoError" />
            <span v-else class="app-initial">{{ getInitialChar(authInfo.app?.name) }}</span>
          </div>
        </div>

        <!-- Headings -->
        <div class="auth-headings">
          <div class="auth-title">
            <span class="highlight-app-name">{{ authInfo.app?.name || '第三方应用' }}</span>
            <span class="title-tail"> {{ $t('oauthAuthorizeSub') || '申请访问您的 Epomail 账号' }}</span>
          </div>

          <!-- Verified Origin Capsule -->
          <div v-if="authInfo.app?.homepageUrl" class="app-origin-chip">
            <Icon icon="solar:shield-check-bold" width="13" height="13" class="verified-icon" />
            <span class="verified-label">官方已验证</span>
            <span class="chip-divider">·</span>
            <a :href="authInfo.app.homepageUrl" target="_blank" class="origin-host-link" title="前往应用官方网站">
              <span>{{ getHostname(authInfo.app.homepageUrl) }}</span>
              <Icon icon="solar:arrow-right-up-linear" width="11" height="11" class="ext-icon" />
            </a>
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
          <div class="scopes-title-row">
            <span class="scopes-title">{{ $t('oauthScopesRequested') || '此应用将申请以下权限：' }}</span>
            <span class="scopes-count-pill">{{ scopeList.length }} 项</span>
          </div>

          <div class="scopes-list">
            <div 
              v-for="item in scopeList" 
              :key="item.key" 
              class="scope-card-item"
            >
              <div class="scope-icon-wrap" :style="{ color: item.color, backgroundColor: item.bg }">
                <Icon :icon="item.icon" width="18" height="18" />
              </div>
              <div class="scope-text-wrap">
                <div class="scope-header-line">
                  <span class="s-name">{{ item.name }}</span>
                  <span class="s-key-chip">{{ item.key }}</span>
                  <span class="s-badge-tag" :class="{ 'is-action': item.isAction }">{{ item.badge }}</span>
                </div>
                <div class="s-desc">{{ item.desc }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Security Notice Box -->
        <div class="security-notice-card">
          <div class="sec-icon-wrap">
            <Icon icon="solar:shield-check-bold-duotone" width="18" height="18" />
          </div>
          <div class="sec-text-content">
            <div class="sec-notice-desc">
              {{ $t('securityNoticeDesc') || '授权过程严格受限，绝不会泄露您的账号密码或邮件正文。您随时可在安全中心撤销授权。' }}
            </div>
          </div>
        </div>

        <!-- Action Buttons Group (Strictly Aligned) -->
        <div class="consent-actions-group">
          <el-button 
            type="primary" 
            size="large" 
            :loading="authorizing" 
            @click="handleConfirmAuthorize" 
            class="authorize-btn"
          >
            {{ $t('authorizeAndContinue') || '授权并继续' }}
          </el-button>
          
          <el-button 
            size="large" 
            @click="handleCancel" 
            class="cancel-btn"
          >
            {{ $t('cancelAuthorization') || '取消授权' }}
          </el-button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
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
const logoLoadFailed = ref(false)

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

// 识别是否为 shijianus-blog 应用，以直接呈现官方 Tab 图标
const isShijianusBlog = computed(() => {
  const name = (authInfo.app?.name || '').toLowerCase()
  const clientId = (authInfo.app?.clientId || route.query.client_id || route.query.clientId || '').toLowerCase()
  const homepage = (authInfo.app?.homepageUrl || '').toLowerCase()
  return name.includes('shijianus') || clientId.includes('shijianus') || homepage.includes('blog.epocanvas.com') || homepage.includes('shijianus')
})

// 格式化与丰富化授权 Scope 列表
const scopeList = computed(() => {
  const req = (authInfo.requestedScopes && authInfo.requestedScopes.length > 0)
    ? authInfo.requestedScopes
    : ['openid', 'email', 'profile', 'comments']

  const dict = {
    openid: {
      key: 'openid',
      name: t('scopeOpenidName') || 'OpenID 身份标识',
      desc: t('scopeOpenidDesc') || '安全校验您的唯一用户凭证 (OpenID)，用于跨系统建立免密单点登录受信会话。',
      badge: t('scopeBadgeRead') || '只读凭据',
      isAction: false,
      icon: 'solar:key-minimalistic-square-3-bold-duotone',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.12)'
    },
    email: {
      key: 'email',
      name: t('scopeEmailName') || '主电子邮箱地址',
      desc: t('scopeEmailDesc') || '读取绑定的主要邮箱地址与验证状态，用于博客互动通知、作者回复提醒及找回访问凭证。',
      badge: t('scopeBadgeRead') || '只读凭据',
      isAction: false,
      icon: 'solar:letter-bold-duotone',
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.12)'
    },
    profile: {
      key: 'profile',
      name: t('scopeProfileName') || '公开个人资料',
      desc: t('scopeProfileDesc') || '读取您的公开显示昵称、账户头像与基本偏好，用于在博客评论区及个人中心展示专属身份卡片。',
      badge: t('scopeBadgeRead') || '只读凭据',
      isAction: false,
      icon: 'solar:user-circle-bold-duotone',
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.12)'
    },
    comments: {
      key: 'comments',
      name: t('scopeCommentsName') || '博客评论与互动管理',
      desc: t('scopeCommentsDesc') || '允许代表您在博客文章下方发表优质评论、点赞互动、编辑及管理名下发言，免除重复输入访客凭据。',
      badge: t('scopeBadgeAction') || '互动权限',
      isAction: true,
      icon: 'solar:chat-round-dots-bold-duotone',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)'
    },
    offline_access: {
      key: 'offline_access',
      name: t('scopeOfflineName') || '安全离线保持',
      desc: t('scopeOfflineDesc') || '保持您的长期安全登录状态，避免短期内频繁重复拉起授权。',
      badge: t('scopeBadgeRead') || '只读凭据',
      isAction: false,
      icon: 'solar:shield-check-bold-duotone',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)'
    }
  }

  const result = []
  for (const s of req) {
    if (dict[s]) {
      result.push(dict[s])
    } else {
      result.push({
        key: s,
        name: `${s} 访问凭据`,
        desc: `允许此应用安全访问所请求的「${s}」系统服务与关联数据。`,
        badge: '系统权限',
        isAction: false,
        icon: 'solar:shield-keyhole-bold-duotone',
        color: '#6366f1',
        bg: 'rgba(99, 102, 241, 0.12)'
      })
    }
  }
  return result
})

onMounted(async () => {
  await fetchAuthorizeDetails()
})

async function fetchAuthorizeDetails() {
  pageLoading.value = true
  errorMessage.value = ''
  logoLoadFailed.value = false
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

function handleLogoError() {
  logoLoadFailed.value = true
}

async function handleConfirmAuthorize() {
  authorizing.value = true
  try {
    const payload = {
      client_id: authInfo.app?.clientId || route.query.client_id,
      redirect_uri: authInfo.redirectUri || route.query.redirect_uri,
      scope: route.query.scope || 'openid profile email comments',
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
  background: radial-gradient(ellipse at 50% 0%, rgba(66, 90, 239, 0.08) 0%, var(--bg-base, #f8fafc) 70%);
  padding: 32px 16px;
  box-sizing: border-box;
}

.oauth-card-container {
  width: 100%;
  max-width: 450px;
  background: var(--bg-surface, #ffffff);
  border-radius: 18px;
  border: 1px solid var(--border-subtle, #e2e8f0);
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.03);
  padding: 32px 26px;
  box-sizing: border-box;
  transition: all 0.25s ease;
}

/* Loading & Error States */
.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 12px;
  gap: 12px;
  font-size: 14px;
  color: var(--text-secondary);

  .spin-icon {
    animation: spin 1s linear infinite;
    color: var(--accent-primary, #425aef);
  }

  .err-icon-wrap {
    color: var(--el-color-danger, #ef4444);
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
    max-width: 320px;
  }

  .error-return-btn {
    margin-top: 16px;
    border-radius: 8px;
    padding: 8px 20px;
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
  gap: 14px;
  margin-bottom: 22px;

  .brand-chip {
    width: 54px;
    height: 54px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    border: 1px solid var(--border-subtle, #e2e8f0);
    background: var(--bg-surface, #ffffff);
    overflow: hidden;
    position: relative;
    flex-shrink: 0;

    &.epomail-chip {
      background: var(--bg-surface, #ffffff);
    }

    &.app-chip {
      background: var(--bg-surface, #ffffff);

      &.is-shijianus {
        color: var(--text-primary, #18181b);

        .shijianus-tab-icon {
          width: 32px;
          height: 32px;
        }
      }

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

  .connection-track {
    display: flex;
    align-items: center;
    gap: 2px;
    width: 68px;

    .track-line {
      flex: 1;
      height: 2px;
      background: linear-gradient(90deg, var(--border-mid, #cbd5e1), color-mix(in srgb, var(--accent-primary, #425aef) 40%, transparent));
    }

    .transfer-pill {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent-primary, #425aef) 10%, var(--bg-surface, #ffffff));
      border: 1px solid color-mix(in srgb, var(--accent-primary, #425aef) 25%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-primary, #425aef);
      box-shadow: 0 2px 6px rgba(66, 90, 239, 0.12);
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
    line-height: 1.45;

    .highlight-app-name {
      color: var(--accent-primary, #425aef);
    }

    .title-tail {
      color: var(--text-primary);
    }
  }

  .auth-subtitle {
    font-size: 12.5px;
    color: var(--text-secondary);
    margin-top: 6px;
    line-height: 1.45;
  }

  .app-origin-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 12px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--accent-primary, #425aef) 8%, var(--bg-surface, #ffffff));
    border: 1px solid color-mix(in srgb, var(--accent-primary, #425aef) 18%, transparent);
    font-size: 11.5px;
    color: var(--text-secondary);
    margin-top: 8px;

    .verified-icon {
      color: var(--accent-primary, #425aef);
      flex-shrink: 0;
    }

    .verified-label {
      font-weight: 600;
      color: var(--accent-primary, #425aef);
    }

    .chip-divider {
      opacity: 0.4;
    }

    .origin-host-link {
      color: var(--text-primary);
      text-decoration: none;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: color 0.15s ease;

      &:hover {
        color: var(--accent-primary, #425aef);
        text-decoration: underline;
      }

      .ext-icon {
        opacity: 0.7;
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
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent-primary, #425aef) 6%, var(--bg-surface, #ffffff));
  border: 1px solid var(--border-subtle, #e2e8f0);
  margin-bottom: 20px;

  .user-avatar-wrap {
    .user-avatar-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-primary, #425aef) 0%, #6366f1 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(66, 90, 239, 0.25);
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
  margin-bottom: 14px;

  .scopes-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;

    .scopes-title {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .scopes-count-pill {
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 10px;
      background: var(--border-subtle, #f1f5f9);
      color: var(--text-muted, #64748b);
      font-weight: 500;
    }
  }

  .scopes-list {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .scope-card-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-subtle, #e2e8f0);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;

      &:hover {
        border-color: var(--border-mid, #cbd5e1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
      }

      .scope-icon-wrap {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .scope-text-wrap {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;

        .scope-header-line {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;

          .s-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
          }

          .s-key-chip {
            font-size: 10.5px;
            font-family: var(--font-mono, monospace);
            padding: 1px 5px;
            border-radius: 4px;
            background: color-mix(in srgb, var(--text-muted, #94a3b8) 12%, transparent);
            color: var(--text-secondary, #475569);
          }

          .s-badge-tag {
            font-size: 10px;
            margin-left: auto;
            padding: 1px 6px;
            border-radius: 4px;
            background: color-mix(in srgb, var(--accent-primary, #425aef) 8%, transparent);
            color: var(--accent-primary, #425aef);
            font-weight: 500;

            &.is-action {
              background: rgba(16, 185, 129, 0.1);
              color: #10b981;
            }
          }
        }

        .s-desc {
          font-size: 11.5px;
          color: var(--text-secondary);
          line-height: 1.45;
        }
      }
    }
  }
}

/* Security Notice Box */
.security-notice-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent-primary, #425aef) 5%, var(--bg-surface, #ffffff));
  border: 1px dashed color-mix(in srgb, var(--accent-primary, #425aef) 25%, transparent);
  margin-top: 10px;
  margin-bottom: 20px;

  .sec-icon-wrap {
    color: var(--accent-primary, #425aef);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .sec-text-content {
    flex: 1;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-secondary);
  }
}

/* Action Buttons Group (Strictly Aligned) */
.consent-actions-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;

  :deep(.el-button),
  .el-button {
    margin: 0 !important;
    margin-left: 0 !important;
    width: 100% !important;
    height: 44px !important;
    border-radius: 10px !important;
    font-size: 14.5px !important;
    font-weight: 600 !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    letter-spacing: 0.2px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }

  .authorize-btn {
    background: linear-gradient(135deg, var(--accent-primary, #425aef) 0%, color-mix(in srgb, var(--accent-primary, #425aef) 85%, #6366f1) 100%) !important;
    border: none !important;
    color: #ffffff !important;
    box-shadow: 0 4px 14px rgba(66, 90, 239, 0.28) !important;

    &:hover {
      opacity: 0.95;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(66, 90, 239, 0.38) !important;
    }

    &:active {
      transform: translateY(0);
      box-shadow: 0 2px 8px rgba(66, 90, 239, 0.25) !important;
    }
  }

  .cancel-btn {
    background: var(--bg-surface, #ffffff) !important;
    border: 1px solid var(--border-subtle, #e2e8f0) !important;
    color: var(--text-secondary, #64748b) !important;

    &:hover {
      background: var(--bg-base, #f8fafc) !important;
      border-color: var(--border-mid, #cbd5e1) !important;
      color: var(--text-primary, #0f172a) !important;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

/* Inline Login Form */
.inline-login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 6px;
}
</style>
