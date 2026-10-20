<template>
  <div class="restricted-notice-container">
    <div class="notice-shell">
      <!-- 顶部系统标识 -->
      <header class="notice-header">
        <div class="brand-badge">
          <Icon icon="fluent:shield-badge-20-filled" width="22" height="22" class="shield-icon" />
          <span class="brand-title">EpoCanvas Mail {{ $t('auditComplianceTitle') || '安全与合规中心' }}</span>
        </div>
        <div class="security-status-pill">
          <span class="status-dot"></span>
          <span>{{ $t('auditRestrictedPill') || '账号管控处置' }}</span>
        </div>
      </header>

      <!-- 加载中状态 -->
      <div v-if="loading" class="notice-loading-state">
        <el-skeleton :rows="6" animated />
      </div>

      <!-- 凭证失效或无权限错误 -->
      <div v-else-if="error" class="notice-error-card">
        <Icon icon="fluent:warning-24-filled" width="40" height="40" class="text-danger" />
        <h2 class="error-title">{{ $t('auditRestrictedTokenInvalid') || '受限查阅凭证已失效' }}</h2>
        <p class="error-desc">{{ error }}</p>
        <el-button type="primary" class="mt-4" @click="handleBackToLogin">
          {{ $t('auditBackToLogin') || '返回登录页面' }}
        </el-button>
      </div>

      <!-- 核心处置通知内容展示 -->
      <main v-else-if="noticeData" class="notice-main-content">
        <!-- 核心裁决卡片 -->
        <section class="dossier-card decision-summary-card">
          <div class="summary-top-row">
            <div class="case-meta">
              <span class="case-number font-mono">{{ noticeData.ticketId || `#${noticeData.caseId}` }}</span>
              <span class="verdict-tag">{{ $t('auditFinalDecisionTag') || '最终处置决定' }}</span>
            </div>
            <span class="target-email font-mono">{{ noticeData.email }}</span>
          </div>

          <h1 class="notice-subject">{{ noticeData.subject }}</h1>

          <div class="capability-matrix">
            <div class="matrix-item suspended-item">
              <span class="matrix-label text-danger">
                <Icon icon="fluent:prohibited-16-regular" width="14" height="14" style="margin-right: 4px;" />
                {{ $t('auditRestrictedCapabilitiesLabel') || '当前暂停服务' }}:
              </span>
              <span class="matrix-val font-medium">{{ noticeData.affectedCapabilities }}</span>
            </div>
            <div class="matrix-item preserved-item">
              <span class="matrix-label text-success">
                <Icon icon="fluent:checkmark-shield-16-regular" width="14" height="14" style="margin-right: 4px;" />
                {{ $t('auditPreservedRightsLabel') || '依法保留权益' }}:
              </span>
              <span class="matrix-val font-medium">{{ $t('auditPreservedRightsVal') || '本通知受限查阅通道、独立合规申诉申请权' }}</span>
            </div>
          </div>
        </section>

        <!-- 详细处置文书与说明正文 -->
        <section class="dossier-card notice-body-card">
          <div class="section-heading">
            <Icon icon="fluent:document-bullet-list-20-regular" width="16" height="16" />
            <span>{{ $t('auditNoticeDocumentTitle') || '处置告知书正文' }}</span>
          </div>

          <div v-if="noticeData.htmlContent" class="notice-html-wrapper" v-html="noticeData.htmlContent"></div>
          <div v-else class="notice-text-content">
            <pre class="formatted-pre">{{ noticeData.textContent }}</pre>
          </div>
        </section>

        <!-- 申诉与复核通道 -->
        <section class="dossier-card appeal-section-card">
          <div class="section-heading">
            <Icon icon="fluent:chat-bubbles-question-20-regular" width="16" height="16" />
            <span>{{ $t('auditAppealChannelTitle') || '合规申诉与复核申请' }}</span>
          </div>

          <!-- 已提交申诉状态 -->
          <div v-if="noticeData.hasExistingAppeal" class="existing-appeal-box">
            <div class="appeal-status-badge text-warning">
              <Icon icon="fluent:clock-20-regular" width="16" height="16" />
              <span class="font-medium">{{ $t('auditAppealPendingReview') || '申诉已提交，合规团队正在复核中' }}</span>
            </div>
            <div class="existing-appeal-content">
              <span class="appeal-label text-muted">{{ $t('auditSubmittedAppealContent') || '已提交申诉说明' }}:</span>
              <p class="appeal-text">{{ noticeData.appealReason }}</p>
            </div>
          </div>

          <!-- 尚未申诉：提供申诉输入入口 -->
          <div v-else class="appeal-form-box">
            <p class="appeal-intro text-muted">
              {{ noticeData.appealInfo || $t('auditAppealInstructions') || '若您认为本次处置存在误判，可提交客观事实证明。合规中心将安排未参与初判的复核人员进行独立研判。' }}
            </p>
            <el-input
              v-model="appealText"
              type="textarea"
              :rows="4"
              maxlength="2000"
              show-word-limit
              :placeholder="$t('auditAppealPlaceholder') || '请在此详细说明申诉理由、业务背景或提供申诉证明...'"
              class="appeal-textarea"
            />
            <div class="appeal-action-row">
              <span class="char-hint text-muted">{{ $t('auditMinCharHint') || '至少输入 5 个字符' }}</span>
              <el-button
                type="primary"
                :disabled="!appealText || appealText.trim().length < 5 || submittingAppeal"
                :loading="submittingAppeal"
                @click="handleSubmitAppeal"
              >
                <Icon icon="fluent:send-16-regular" width="14" height="14" style="margin-right: 4px;" />
                {{ $t('auditBtnSubmitAppeal') || '提交解封申诉' }}
              </el-button>
            </div>
          </div>
        </section>

        <!-- 底部安全与退出导航 -->
        <footer class="notice-footer">
          <span class="audit-watermark font-mono text-muted">
            {{ $t('auditDisposalCenterStamp') || 'EpoCanvas Mail Security & Compliance · Authentic Audit Trail' }}
          </span>
          <el-button size="small" class="btn-exit" @click="handleBackToLogin">
            <Icon icon="fluent:arrow-left-16-regular" width="14" height="14" style="margin-right: 4px;" />
            {{ $t('auditBackToLogin') || '返回登录' }}
          </el-button>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Icon } from '@iconify/vue';

const route = useRoute();
const { t } = useI18n();

const loading = ref(true);
const error = ref('');
const noticeData = ref(null);
const appealText = ref('');
const submittingAppeal = ref(false);

const getRestrictedToken = () => {
  const queryToken = route.query.token;
  if (queryToken && typeof queryToken === 'string') {
    try {
      sessionStorage.setItem('epomail_restricted_token', queryToken);
    } catch (_) {}
    return queryToken;
  }
  try {
    return sessionStorage.getItem('epomail_restricted_token') || '';
  } catch (_) {
    return '';
  }
};

const fetchNotice = async () => {
  const token = getRestrictedToken();
  if (!token) {
    error.value = t('auditRestrictedNoToken');
    loading.value = false;
    return;
  }

  try {
    const res = await fetch(`/api/notice/restricted/view?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const body = await res.json();
    if (body.code === 200 && body.data) {
      if (!body.data.hasCase) {
        error.value = body.data.message || t('auditRestrictedNoCase');
      } else {
        noticeData.value = body.data;
      }
    } else {
      error.value = body.message || t('auditRestrictedTokenInvalid');
    }
  } catch (err) {
    error.value = t('auditRestrictedFetchError');
  } finally {
    loading.value = false;
  }
};

const handleSubmitAppeal = async () => {
  const token = getRestrictedToken();
  if (!token || !appealText.value.trim()) return;

  submittingAppeal.value = true;
  try {
    const res = await fetch(`/api/notice/restricted/appeal?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        appealReason: appealText.value.trim()
      })
    });

    const body = await res.json();
    if (body.code === 200) {
      ElMessage.success(body.data?.message || t('auditAppealPendingReview'));
      if (noticeData.value) {
        noticeData.value.hasExistingAppeal = true;
        noticeData.value.appealReason = appealText.value.trim();
      }
      appealText.value = '';
    } else {
      ElMessage.error(body.message || '申诉提交失败');
    }
  } catch (err) {
    ElMessage.error(t('auditRestrictedNetworkError'));
  } finally {
    submittingAppeal.value = false;
  }
};

const handleBackToLogin = () => {
  try {
    sessionStorage.removeItem('epomail_restricted_token');
  } catch (_) {}
  window.location.href = '/login/';
};

onMounted(() => {
  fetchNotice();
});
</script>

<style scoped lang="scss">
.restricted-notice-container {
  min-height: 100vh;
  width: 100%;
  background: var(--el-bg-color-page, #f8fafc);
  color: var(--el-text-color-primary, #0f172a);
  display: flex;
  justify-content: center;
  padding: 32px 16px 48px;
  box-sizing: border-box;
}

.notice-shell {
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.notice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  .brand-badge {
    display: flex;
    align-items: center;
    gap: 8px;

    .shield-icon {
      color: var(--el-color-primary, #3b82f6);
    }

    .brand-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
  }

  .security-status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 9999px;
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    font-weight: 500;

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ef4444;
    }
  }
}

.dossier-card {
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.decision-summary-card {
  .summary-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .case-meta {
      display: flex;
      align-items: center;
      gap: 8px;

      .case-number {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--el-fill-color-light, #f1f5f9);
        color: var(--el-text-color-regular, #64748b);
      }

      .verdict-tag {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #ef4444;
      }
    }

    .target-email {
      font-size: 13px;
      color: var(--el-text-color-regular, #475569);
    }
  }

  .notice-subject {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 16px;
    line-height: 1.4;
  }

  .capability-matrix {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--el-fill-color-lighter, #f8fafc);
    border-radius: 6px;
    border: 1px solid var(--el-border-color-extra-light, #f1f5f9);

    .matrix-item {
      display: flex;
      font-size: 13px;
      line-height: 1.5;
      gap: 8px;

      .matrix-label {
        display: flex;
        align-items: center;
        white-space: nowrap;
      }
    }
  }
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 14px;
  color: var(--el-text-color-primary, #1e293b);
}

.notice-html-wrapper {
  font-size: 14px;
  line-height: 1.6;
  border-radius: 6px;
  overflow: hidden;
}

.notice-text-content .formatted-pre {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  white-space: pre-wrap;
  color: var(--el-text-color-regular, #334155);
}

.existing-appeal-box {
  padding: 14px;
  background: var(--el-fill-color-light, #fefce8);
  border: 1px solid #fef08a;
  border-radius: 6px;

  .appeal-status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .existing-appeal-content {
    font-size: 13px;

    .appeal-text {
      margin: 6px 0 0;
      line-height: 1.5;
      color: var(--el-text-color-primary, #1e293b);
    }
  }
}

.appeal-form-box {
  .appeal-intro {
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 12px;
  }

  .appeal-action-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;

    .char-hint {
      font-size: 12px;
    }
  }
}

.notice-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;

  .audit-watermark {
    font-size: 11px;
  }
}

.notice-error-card {
  text-align: center;
  padding: 48px 24px;
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  border-radius: 8px;

  .error-title {
    font-size: 18px;
    font-weight: 600;
    margin: 16px 0 8px;
  }

  .error-desc {
    font-size: 14px;
    color: var(--el-text-color-secondary, #64748b);
    max-width: 440px;
    margin: 0 auto;
  }
}
</style>
