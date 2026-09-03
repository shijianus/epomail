<template>
  <div class="box">
    <!-- Section 1: Account Security Information -->
    <div class="container">
      <div class="title">{{ $t('securitySetting') || '安全设置' }}</div>
      <div class="item">
        <div>{{ $t('username') }}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"></el-input>
            <span class="edit-name" @click="setName">
             {{ $t('save') }}
            </span>
          </span>
          <span v-else class="user-name">
            <span>{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{ $t('emailAccount') }}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{ $t('password') }}</div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <el-button type="primary" @click="pwdShow = true">{{ $t('changePwdBtn') }}</el-button>
          <span v-if="passwordChangedText" style="font-size: 12px; color: var(--text-muted);">{{ passwordChangedText }}</span>
        </div>
      </div>
    </div>

    <!-- Section 2: Google-Style 2-Step Verification Center -->
    <div class="container two-factor-center" v-if="totpStatus.globalEnabled">
      <div class="title">{{ $t('twoFactorCenter') || '两步验证中心' }}</div>

      <!-- Hero Status Banner -->
      <div class="two-factor-banner" :class="{ 'is-enabled': totpStatus.enabled }">
        <div class="banner-left">
          <div class="shield-badge" :class="{ 'active-shield': totpStatus.enabled }">
            <Icon v-if="totpStatus.enabled" icon="fluent:shield-checkmark-20-filled" width="28" height="28" />
            <Icon v-else icon="fluent:shield-20-regular" width="28" height="28" />
          </div>
          <div class="banner-texts">
            <div class="banner-status-row">
              <span class="banner-title">{{ $t('totpTitle') || '两步验证 (2FA)' }}</span>
              <el-tag
                :type="totpStatus.enabled ? 'success' : 'info'"
                effect="dark"
                round
                class="status-pill"
              >
                {{ totpStatus.enabled ? ($t('totpEnabled') || '已启用') : ($t('totpDisabled') || '未启用') }}
              </el-tag>
            </div>
            <div class="banner-desc">
              <span v-if="totpStatus.enabled">
                {{ totpStatus.createdAt ? $t('twoFactorProtectedSince', { date: formatDate(totpStatus.createdAt) }) : $t('totpEnabledDesc') }}
              </span>
              <span v-else>
                {{ $t('twoFactorBannerDisabledDesc') || '为您的账号添加一层额外安全防线。启用后，登录需要密码和第二步验证。' }}
              </span>
            </div>
          </div>
        </div>
        <div class="banner-right">
          <el-button
            v-if="totpStatus.enabled"
            type="danger"
            plain
            :loading="totpLoading"
            @click="openDisableTotpModal"
            class="action-pill-btn"
          >
            <Icon icon="fluent:power-20-regular" width="16" height="16" style="margin-right: 6px;" />
            {{ $t('turnOff2FA') || '停用两步验证' }}
          </el-button>
          <el-button
            v-else
            type="primary"
            :loading="totpLoading"
            @click="startTotpSetup"
            class="action-pill-btn primary-glow"
          >
            <Icon icon="fluent:shield-keyhole-20-filled" width="16" height="16" style="margin-right: 6px;" />
            {{ $t('turnOn2FA') || '设置两步验证' }}
          </el-button>
        </div>
      </div>

      <!-- Second-Step Verification Methods -->
      <div class="second-steps-card">
        <div class="card-header">
          <div class="sub-title">{{ $t('secondStepMethods') || '可用的第二步验证方式' }}</div>
          <div class="sub-desc">{{ $t('secondStepMethodsDesc') || '通过以下安全验证方式确认是您本人在登录：' }}</div>
        </div>

        <div class="methods-list">
          <!-- Method 1: Authenticator App (TOTP) -->
          <div class="method-item">
            <div class="method-icon-box app-icon-box">
              <Icon icon="fluent:phone-key-24-regular" width="22" height="22" />
            </div>
            <div class="method-content">
              <div class="method-headline">
                <span class="method-name">{{ $t('authenticatorApp') || '身份验证器应用' }}</span>
                <el-tag :type="totpStatus.totpConfigured ? 'success' : 'info'" size="small" effect="plain" round>
                  {{ totpStatus.totpConfigured ? ($t('configured') || '已配置') : ($t('notConfigured') || '未配置') }}
                </el-tag>
              </div>
              <div class="method-subtext">
                {{ $t('authenticatorAppDesc') || '使用 Google Authenticator、Microsoft Authenticator 或 1Password 等应用获取动态验证码。' }}
              </div>
            </div>
            <div class="method-action">
              <el-button
                size="default"
                :type="totpStatus.totpConfigured ? 'default' : 'primary'"
                :plain="!totpStatus.totpConfigured"
                :loading="totpLoading"
                @click="startTotpSetup"
              >
                {{ totpStatus.totpConfigured ? ($t('reconfigure') || '重新配置') : ($t('turnOn2FA') || '立即设置') }}
              </el-button>
            </div>
          </div>

          <!-- Method 2: Backup Recovery Codes -->
          <div class="method-item">
            <div class="method-icon-box backup-icon-box">
              <Icon icon="fluent:password-24-regular" width="22" height="22" />
            </div>
            <div class="method-content">
              <div class="method-headline">
                <span class="method-name">{{ $t('backupCodesTitle') || '备用恢复码' }}</span>
                <el-tag v-if="totpStatus.enabled" type="warning" size="small" effect="plain" round>
                  {{ $t('backupCodesRemainingCount', { count: totpStatus.backupCodesRemaining }) }}
                </el-tag>
                <el-tag v-else type="info" size="small" effect="plain" round>
                  {{ $t('notConfigured') || '未配置' }}
                </el-tag>
              </div>
              <div class="method-subtext">
                {{ $t('backupCodesDesc') || '10 组一次性安全代码，在您无法使用验证器或安全密钥时用于紧急登录。' }}
              </div>
            </div>
            <div class="method-action dual-actions">
              <template v-if="totpStatus.enabled">
                <el-button
                  size="default"
                  @click="openViewBackupCodesModal"
                >
                  {{ $t('viewBackupCodesBtn') || '查看代码' }}
                </el-button>
                <el-button
                  size="default"
                  @click="openRegenBackupModal"
                >
                  {{ $t('totpRegenBackupBtn') || '生成新代码' }}
                </el-button>
              </template>
              <el-button v-else size="default" disabled>
                {{ $t('viewBackupCodesBtn') || '查看代码' }}
              </el-button>
            </div>
          </div>

          <!-- Method 3: Passkeys & Security Keys (WebAuthn / FIDO2) -->
          <div class="method-item passkey-section-item">
            <div class="method-main-row">
              <div class="method-icon-box passkey-icon-box">
                <Icon icon="fluent:shield-keyhole-24-regular" width="22" height="22" />
              </div>
              <div class="method-content">
                <div class="method-headline">
                  <span class="method-name">{{ $t('passkeysAndSecurityKeys') || '通行密钥与安全密钥' }}</span>
                  <el-tag :type="passkeyList.length > 0 ? 'success' : 'info'" size="small" effect="plain" round>
                    {{ passkeyList.length > 0 ? `${passkeyList.length} 个密钥` : ($t('notConfigured') || '未配置') }}
                  </el-tag>
                </div>
                <div class="method-subtext">
                  {{ $t('passkeysDesc') || '使用硬件安全密钥 (如 YubiKey) 或设备生物识别 (Touch ID / Face ID / Windows Hello) 作为抗钓鱼的两步验证。' }}
                </div>
              </div>
              <div class="method-action">
                <el-button
                  type="primary"
                  size="default"
                  plain
                  @click="openAddPasskeyModal"
                >
                  <Icon icon="fluent:add-12-filled" width="14" height="14" style="margin-right: 4px;" />
                  {{ $t('addSecurityKeyBtn') || '添加安全密钥' }}
                </el-button>
              </div>
            </div>

            <!-- Registered Passkeys Sub-list -->
            <div v-if="passkeyList.length > 0" class="passkeys-sublist">
              <div
                v-for="key in passkeyList"
                :key="key.id"
                class="passkey-row"
              >
                <div class="passkey-info">
                  <Icon icon="fluent:usb-plug-20-regular" width="18" height="18" class="key-icon" />
                  <div class="passkey-details">
                    <span class="passkey-name">{{ key.name }}</span>
                    <span class="passkey-date">{{ $t('tabRegisteredAt') || '添加于' }}: {{ formatDate(key.createdAt) }}</span>
                  </div>
                </div>
                <div class="passkey-actions">
                  <el-button
                    type="danger"
                    text
                    size="small"
                    @click="confirmDeletePasskey(key)"
                  >
                    <Icon icon="lucide:trash-2" width="16" height="16" />
                  </el-button>
                </div>
              </div>
            </div>
            <div v-else class="empty-passkeys-hint">
              <span>{{ $t('noSecurityKeys') || '尚未添加任何安全密钥' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Account Deletion -->
    <div class="container del-email" v-perm="'my:delete'">
      <div class="title">{{ $t('deleteUser') || '注销账号' }}</div>
      <div class="del-msg">
        {{ $t('delAccountMsg') }}
      </div>
      <div class="del-action">
        <el-button type="danger" plain @click="deleteConfirm">{{ $t('deleteUserBtn') || '注销账号' }}</el-button>
      </div>
    </div>

    <!-- Change Password Dialog -->
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340px">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>

    <!-- 2FA Setup 3-Step Modal -->
    <el-dialog
      v-model="setupDialogVisible"
      :title="$t('totpSetupTitle')"
      width="460px"
      destroy-on-close
      :close-on-click-modal="false"
      class="totp-setup-dialog"
    >
      <div class="setup-steps-wrapper">
        <el-steps :active="setupStep - 1" finish-status="success" simple style="margin-bottom: 20px;">
          <el-step :title="$t('totpStepBind')" />
          <el-step :title="$t('totpStepVerify')" />
          <el-step :title="$t('totpStepBackup')" />
        </el-steps>

        <!-- Step 1: Scan QR or copy Secret -->
        <div v-if="setupStep === 1" class="step-content">
          <div class="step-desc">{{ $t('totpScanDesc') }}</div>
          <div class="qr-container">
            <div v-if="qrLoading" class="qr-loading">
              <el-icon class="is-loading"><Loading /></el-icon>
            </div>
            <img v-else-if="qrCodeUrl" :src="qrCodeUrl" alt="TOTP QR Code" class="totp-qr-image" />
          </div>
          <div class="secret-box">
            <span class="secret-label">{{ $t('totpManualKey') }}</span>
            <div class="secret-display">
              <span class="secret-code">{{ setupData.secret }}</span>
              <el-button size="small" type="primary" plain @click="copySecret">
                {{ $t('copy') }}
              </el-button>
            </div>
          </div>
          <div class="dialog-footer-actions">
            <el-button type="primary" class="w-full" @click="setupStep = 2">
              {{ $t('totpNextStep') }}
            </el-button>
          </div>
        </div>

        <!-- Step 2: Input 6-digit Code -->
        <div v-else-if="setupStep === 2" class="step-content">
          <div class="step-desc">{{ $t('totpVerifyDesc') }}</div>
          <div class="verify-input-box">
            <el-input
              v-model="setupCode"
              maxlength="6"
              :placeholder="$t('totpCodePlaceholder')"
              class="totp-code-input"
              autofocus
              @keyup.enter="submitEnableTotp"
            />
          </div>
          <div class="dialog-footer-actions dual-actions">
            <el-button @click="setupStep = 1">{{ $t('backBtn') || '返回' }}</el-button>
            <el-button type="primary" :loading="enableLoading" @click="submitEnableTotp">
              {{ $t('totpVerifyAndEnable') }}
            </el-button>
          </div>
        </div>

        <!-- Step 3: Backup Codes Presentation -->
        <div v-else-if="setupStep === 3" class="step-content">
          <el-alert
            :title="$t('totpBackupTitle')"
            type="success"
            :description="$t('totpBackupDesc')"
            show-icon
            :closable="false"
            style="margin-bottom: 16px;"
          />
          <div class="backup-codes-grid">
            <div
              v-for="(code, idx) in backupCodesList"
              :key="idx"
              class="backup-code-item"
            >
              {{ code }}
            </div>
          </div>
          <div class="backup-actions-toolbar">
            <el-button size="small" @click="copyAllBackupCodes">{{ $t('totpCopyAll') }}</el-button>
            <el-button size="small" @click="downloadBackupCodesTxt">{{ $t('totpDownloadTxt') }}</el-button>
            <el-button size="small" @click="printBackupCodes">{{ $t('totpPrint') }}</el-button>
          </div>
          <div class="dialog-footer-actions">
            <el-button type="primary" class="w-full" @click="finishSetup">
              {{ $t('totpDone') }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- View Backup Codes Modal -->
    <el-dialog
      v-model="viewBackupDialogVisible"
      :title="$t('viewBackupCodesBtn') || '查看备用恢复码'"
      width="460px"
      destroy-on-close
    >
      <div v-if="viewBackupCodesList.length === 0 && !viewBackupVerified" class="password-verify-box">
        <div class="dialog-sub-desc">
          {{ $t('verifyPasswordToViewDesc') || '出于安全考虑，查看备用恢复码需要验证您的登录密码：' }}
        </div>
        <el-input
          type="password"
          :placeholder="$t('totpPasswordPlaceholder')"
          v-model="viewBackupPassword"
          autocomplete="off"
          @keyup.enter="submitViewBackupCodes"
        />
      </div>
      <div v-else class="codes-display-box">
        <div v-if="viewBackupCodesList.length > 0">
          <div class="backup-codes-grid">
            <div
              v-for="(code, idx) in viewBackupCodesList"
              :key="idx"
              class="backup-code-item"
            >
              {{ code }}
            </div>
          </div>
          <div class="backup-actions-toolbar">
            <el-button size="small" @click="copyViewBackupCodes">{{ $t('totpCopyAll') }}</el-button>
            <el-button size="small" @click="downloadViewBackupCodesTxt">{{ $t('totpDownloadTxt') }}</el-button>
            <el-button size="small" @click="printViewBackupCodes">{{ $t('totpPrint') }}</el-button>
          </div>
        </div>
        <div v-else class="no-codes-hint">
          <el-alert
            :title="$t('backupCodesDesc')"
            type="info"
            :closable="false"
            show-icon
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <template v-if="!viewBackupVerified">
            <el-button @click="viewBackupDialogVisible = false">{{ $t('cancel') || '取消' }}</el-button>
            <el-button type="primary" :loading="viewBackupLoading" @click="submitViewBackupCodes">
              {{ $t('confirm') || '确认验证' }}
            </el-button>
          </template>
          <template v-else>
            <el-button type="primary" class="w-full" @click="viewBackupDialogVisible = false">
              {{ $t('totpDone') || '完成' }}
            </el-button>
          </template>
        </div>
      </template>
    </el-dialog>

    <!-- Regenerate Backup Codes Modal -->
    <el-dialog
      v-model="regenDialogVisible"
      :title="$t('totpRegenTitle')"
      width="460px"
      destroy-on-close
    >
      <div v-if="regenResultCodes.length === 0" class="regen-modal-content">
        <div class="dialog-sub-desc">
          {{ $t('totpRegenDesc') }}
        </div>
        <el-input
          type="password"
          :placeholder="$t('totpPasswordPlaceholder')"
          v-model="regenPassword"
          autocomplete="off"
          @keyup.enter="submitRegenBackupCodes"
        />
      </div>
      <div v-else class="regen-result-content">
        <el-alert
          :title="$t('totpBackupTitle')"
          type="success"
          :description="$t('totpBackupDesc')"
          show-icon
          :closable="false"
          style="margin-bottom: 16px;"
        />
        <div class="backup-codes-grid">
          <div
            v-for="(code, idx) in regenResultCodes"
            :key="idx"
            class="backup-code-item"
          >
            {{ code }}
          </div>
        </div>
        <div class="backup-actions-toolbar">
          <el-button size="small" @click="copyRegenBackupCodes">{{ $t('totpCopyAll') }}</el-button>
          <el-button size="small" @click="downloadRegenBackupCodesTxt">{{ $t('totpDownloadTxt') }}</el-button>
          <el-button size="small" @click="printRegenBackupCodes">{{ $t('totpPrint') }}</el-button>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <template v-if="regenResultCodes.length === 0">
            <el-button @click="regenDialogVisible = false">{{ $t('cancel') || '取消' }}</el-button>
            <el-button type="primary" :loading="regenLoading" @click="submitRegenBackupCodes">
              {{ $t('totpConfirmRegen') }}
            </el-button>
          </template>
          <template v-else>
            <el-button type="primary" class="w-full" @click="regenDialogVisible = false">
              {{ $t('totpDone') || '完成' }}
            </el-button>
          </template>
        </div>
      </template>
    </el-dialog>

    <!-- Add Passkey / Security Key Modal -->
    <el-dialog
      v-model="addPasskeyDialogVisible"
      :title="$t('addSecurityKeyBtn') || '添加安全密钥'"
      width="440px"
      destroy-on-close
    >
      <div class="add-passkey-content">
        <div class="dialog-sub-desc">
          {{ $t('passkeysDesc') }}
        </div>
        <div class="key-name-field">
          <span class="field-label">{{ $t('securityKeyName') || '密钥名称' }}</span>
          <el-input
            v-model="newPasskeyName"
            :placeholder="$t('securityKeyNamePlaceholder') || '例如：MacBook Touch ID、YubiKey 5C'"
            maxlength="40"
            @keyup.enter="handleCreatePasskey"
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="addPasskeyDialogVisible = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="passkeyLoading" @click="handleCreatePasskey">
            {{ $t('continue') || '开始注册验证' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Disable 2FA Modal -->
    <el-dialog
      v-model="disableDialogVisible"
      :title="$t('totpDisableTitle')"
      width="400px"
      destroy-on-close
    >
      <div class="disable-modal-content">
        <div class="dialog-sub-desc">
          {{ $t('totpDisableDesc') }}
        </div>
        <div class="form-group" style="display: flex; flex-direction: column; gap: 14px;">
          <el-input
            type="password"
            :placeholder="$t('totpPasswordPlaceholder')"
            v-model="disableForm.password"
            autocomplete="off"
          />
          <el-input
            :placeholder="$t('totpCodeOrBackupPlaceholder')"
            v-model="disableForm.code"
            autocomplete="off"
            @keyup.enter="submitDisableTotp"
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="disableDialogVisible = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="danger" :loading="disableLoading" @click="submitDisableTotp">
            {{ $t('totpConfirmDisable') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, defineOptions } from 'vue'
import { useRoute } from 'vue-router'
import {
  resetPassword,
  userDelete,
  getTotpStatus,
  getTotpSetup,
  enableTotp,
  disableTotp,
  regenerateBackupCodes,
  viewBackupCodes,
  getPasskeySetup,
  registerPasskey,
  getPasskeyList,
  deletePasskey
} from "@/request/my.js";
import { useUserStore } from "@/store/user.js";
import { useSettingStore } from "@/store/setting.js";
import router from "@/router/index.js";
import { accountSetName } from "@/request/account.js";
import { useAccountStore } from "@/store/account.js";
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from "@iconify/vue";
import QRCode from 'qrcode';

const { t } = useI18n()
const route = useRoute()
const accountStore = useAccountStore()
const userStore = useUserStore();
const settingStore = useSettingStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)

const passwordChangedText = computed(() => {
  const ts = userStore.user.passwordUpdatedAt || userStore.user.createTime
  if (!ts) return ''
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return `上次变更时间：${ts}`
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    return settingStore.lang === 'en'
      ? `Last changed: ${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`
      : `上次变更时间：${year}年${month}月${day}日`
  } catch (e) {
    return `上次变更时间：${ts}`
  }
})

defineOptions({
  name: 'setting'
})

// ==========================================
// 2FA Reactive State & Methods
// ==========================================
function isGlobal2FAEnabled() {
  const settings = settingStore.settings;
  if (!settings) return false;
  const mode = Number(settings.allMailMode);
  if (mode === 0 || mode === 2) return true;
  if (mode === 1) return Number(settings.totp) !== 0;
  return false;
}

const totpLoading = ref(false)
const totpStatus = reactive({
  globalEnabled: isGlobal2FAEnabled(),
  enabled: false,
  totpConfigured: false,
  backupCodesRemaining: 0,
  securityKeysCount: 0,
  createdAt: null
})

const passkeyList = ref([])
const addPasskeyDialogVisible = ref(false)
const newPasskeyName = ref('')
const passkeyLoading = ref(false)

const setupDialogVisible = ref(false)
const setupStep = ref(1)
const setupData = reactive({
  secret: '',
  otpauthUri: ''
})
const qrLoading = ref(false)
const qrCodeUrl = ref('')
const setupCode = ref('')
const enableLoading = ref(false)
const backupCodesList = ref([])

const viewBackupDialogVisible = ref(false)
const viewBackupPassword = ref('')
const viewBackupLoading = ref(false)
const viewBackupVerified = ref(false)
const viewBackupCodesList = ref([])

const disableDialogVisible = ref(false)
const disableLoading = ref(false)
const disableForm = reactive({
  password: '',
  code: ''
})

const regenDialogVisible = ref(false)
const regenLoading = ref(false)
const regenPassword = ref('')
const regenResultCodes = ref([])

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

const fetchTotpStatus = async () => {
  try {
    const res = await getTotpStatus();
    if (res) {
      totpStatus.globalEnabled = res.globalEnabled ?? isGlobal2FAEnabled();
      totpStatus.enabled = !!res.enabled;
      totpStatus.totpConfigured = res.totpConfigured ?? (res.enabled && (res.backupCodesRemaining > 0 || res.createdAt));
      totpStatus.backupCodesRemaining = res.backupCodesRemaining || 0;
      totpStatus.securityKeysCount = res.securityKeysCount || 0;
      totpStatus.createdAt = res.createdAt || null;
    }
  } catch (err) {
    console.error('Failed to load TOTP status:', err);
  }
}

const fetchPasskeys = async () => {
  try {
    const res = await getPasskeyList();
    passkeyList.value = Array.isArray(res) ? res : [];
  } catch (err) {
    console.error('Failed to load passkeys:', err);
  }
}

onMounted(() => {
  if (route.query && route.query.action === 'change-password') {
    pwdShow.value = true;
  }
  fetchTotpStatus();
  fetchPasskeys();
})

const startTotpSetup = async () => {
  totpLoading.value = true;
  setupStep.value = 1;
  setupCode.value = '';
  backupCodesList.value = [];
  qrLoading.value = true;
  setupDialogVisible.value = true;

  try {
    const data = await getTotpSetup();
    if (data) {
      setupData.secret = data.secret;
      setupData.otpauthUri = data.otpauthUri;

      qrCodeUrl.value = await QRCode.toDataURL(data.otpauthUri, {
        width: 180,
        margin: 1,
        color: {
          dark: '#1e293b',
          light: '#ffffff'
        }
      });
    }
  } catch (err) {
    ElMessage({
      message: err.message || 'Failed to initialize TOTP setup',
      type: 'error',
      plain: true
    });
    setupDialogVisible.value = false;
  } finally {
    totpLoading.value = false;
    qrLoading.value = false;
  }
}

const copySecret = () => {
  if (setupData.secret) {
    navigator.clipboard.writeText(setupData.secret).then(() => {
      ElMessage({
        message: t('totpKeyCopySuccess') || 'Secret key copied',
        type: 'success',
        plain: true
      });
    });
  }
}

const submitEnableTotp = async () => {
  if (!setupCode.value || setupCode.value.trim().length !== 6) {
    ElMessage({
      message: t('totpCodePlaceholder'),
      type: 'error',
      plain: true
    });
    return;
  }

  enableLoading.value = true;
  try {
    const res = await enableTotp(setupCode.value.trim());
    backupCodesList.value = res.backupCodes || [];
    setupStep.value = 3;
    await fetchTotpStatus();
  } catch (err) {
    ElMessage({
      message: err.message || t('totpCodeInvalid'),
      type: 'error',
      plain: true
    });
  } finally {
    enableLoading.value = false;
  }
}

const copyAllBackupCodes = () => {
  const text = backupCodesList.value.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    ElMessage({
      message: t('totpCopySuccess'),
      type: 'success',
      plain: true
    });
  });
}

const downloadBackupCodesTxt = () => {
  const text = `EpoCanvas Mail 2FA Recovery Backup Codes\nGenerated at: ${new Date().toISOString()}\n\n` +
    backupCodesList.value.map((c, i) => `${i + 1}. ${c}`).join('\n') +
    '\n\n* Each code can be used only once.';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `epomail-backup-codes-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const printBackupCodes = () => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>EpoCanvas Mail 2FA Backup Codes</title>
        <style>
          body { font-family: monospace; padding: 40px; }
          h2 { color: #333; }
          .code-item { font-size: 16px; padding: 6px 0; }
        </style>
      </head>
      <body>
        <h2>🛡️ EpoCanvas Mail 2FA Recovery Backup Codes</h2>
        <p>Keep these codes safe. Each code can be used only once.</p>
        <hr/>
        <ol>
          ${backupCodesList.value.map(c => `<li class="code-item"><strong>${c}</strong></li>`).join('')}
        </ol>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

const finishSetup = () => {
  setupDialogVisible.value = false;
  fetchTotpStatus();
}

// ==========================================
// View Backup Codes
// ==========================================
const openViewBackupCodesModal = () => {
  viewBackupPassword.value = '';
  viewBackupCodesList.value = [];
  viewBackupVerified.value = false;
  viewBackupDialogVisible.value = true;
}

const submitViewBackupCodes = async () => {
  if (!viewBackupPassword.value) {
    ElMessage({
      message: t('emptyPwdMsg') || 'Please enter password',
      type: 'error',
      plain: true
    });
    return;
  }

  viewBackupLoading.value = true;
  try {
    const res = await viewBackupCodes(viewBackupPassword.value);
    viewBackupVerified.value = true;
    if (res && Array.isArray(res.backupCodes) && res.backupCodes.length > 0) {
      viewBackupCodesList.value = res.backupCodes;
    } else {
      viewBackupCodesList.value = [];
    }
  } catch (err) {
    ElMessage({
      message: err.message || 'Verification failed',
      type: 'error',
      plain: true
    });
  } finally {
    viewBackupLoading.value = false;
  }
}

const copyViewBackupCodes = () => {
  const text = viewBackupCodesList.value.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    ElMessage({
      message: t('totpCopySuccess'),
      type: 'success',
      plain: true
    });
  });
}

const downloadViewBackupCodesTxt = () => {
  const text = `EpoCanvas Mail 2FA Recovery Backup Codes\nExported at: ${new Date().toISOString()}\n\n` +
    viewBackupCodesList.value.map((c, i) => `${i + 1}. ${c}`).join('\n') +
    '\n\n* Each code can be used only once.';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `epomail-backup-codes-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const printViewBackupCodes = () => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>EpoCanvas Mail 2FA Backup Codes</title>
        <style>
          body { font-family: monospace; padding: 40px; }
          h2 { color: #333; }
          .code-item { font-size: 16px; padding: 6px 0; }
        </style>
      </head>
      <body>
        <h2>🛡️ EpoCanvas Mail 2FA Recovery Backup Codes</h2>
        <p>Keep these codes safe. Each code can be used only once.</p>
        <hr/>
        <ol>
          ${viewBackupCodesList.value.map(c => `<li class="code-item"><strong>${c}</strong></li>`).join('')}
        </ol>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

// ==========================================
// Passkeys & Security Keys (WebAuthn)
// ==========================================
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const openAddPasskeyModal = () => {
  newPasskeyName.value = '';
  addPasskeyDialogVisible.value = true;
}

const handleCreatePasskey = async () => {
  if (!window.PublicKeyCredential) {
    ElMessage({
      message: t('passkeyUnsupported') || 'WebAuthn is not supported in this browser',
      type: 'warning',
      plain: true
    });
    return;
  }

  passkeyLoading.value = true;
  try {
    const setupData = await getPasskeySetup();
    if (!setupData || !setupData.challenge) {
      throw new Error('Failed to obtain challenge');
    }

    const challengeBytes = base64UrlToBuffer(setupData.challenge);
    const userIdBytes = new TextEncoder().encode(setupData.user.id);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challengeBytes,
        rp: setupData.rp,
        user: {
          id: userIdBytes,
          name: setupData.user.name,
          displayName: setupData.user.displayName
        },
        pubKeyCredParams: setupData.pubKeyCredParams || [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: setupData.authenticatorSelection || {
          userVerification: 'preferred',
          residentKey: 'preferred'
        },
        timeout: setupData.timeout || 60000,
        attestation: 'none'
      }
    });

    if (!credential) {
      throw new Error('Passkey creation cancelled');
    }

    const clientDataJSON = bufferToBase64Url(credential.response.clientDataJSON);
    const attestationObject = bufferToBase64Url(credential.response.attestationObject);
    const credentialId = bufferToBase64Url(credential.rawId);
    const transports = credential.response.getTransports ? credential.response.getTransports() : [];

    await registerPasskey({
      name: newPasskeyName.value || 'Security Key',
      credentialId,
      clientDataJSON,
      attestationObject,
      transports
    });

    ElMessage({
      message: t('passkeyRegisterSuccess') || 'Security key added successfully!',
      type: 'success',
      plain: true
    });

    addPasskeyDialogVisible.value = false;
    await fetchTotpStatus();
    await fetchPasskeys();
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      ElMessage({
        message: err.message || 'Failed to register security key',
        type: 'error',
        plain: true
      });
    }
  } finally {
    passkeyLoading.value = false;
  }
}

const confirmDeletePasskey = (key) => {
  ElMessageBox.confirm(
    t('deleteSecurityKeyConfirm', { name: key.name }) || `Are you sure you want to remove security key "${key.name}"?`,
    t('deleteSecurityKey') || '删除密钥',
    {
      confirmButtonText: t('confirm') || '确认',
      cancelButtonText: t('cancel') || '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await deletePasskey(key.id);
      ElMessage({
        message: t('passkeyDeleteSuccess') || 'Security key removed',
        type: 'success',
        plain: true
      });
      await fetchTotpStatus();
      await fetchPasskeys();
    } catch (err) {
      ElMessage({
        message: err.message || 'Failed to delete security key',
        type: 'error',
        plain: true
      });
    }
  });
}

// ==========================================
// Disable TOTP
// ==========================================
const openDisableTotpModal = () => {
  disableForm.password = '';
  disableForm.code = '';
  disableDialogVisible.value = true;
}

const submitDisableTotp = async () => {
  if (!disableForm.password || !disableForm.code) {
    ElMessage({
      message: t('totpDisableParamsEmpty') || 'Please enter password and verification code',
      type: 'error',
      plain: true
    });
    return;
  }

  disableLoading.value = true;
  try {
    await disableTotp(disableForm.password, disableForm.code.trim());
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    });
    disableDialogVisible.value = false;
    await fetchTotpStatus();
    await fetchPasskeys();
  } catch (err) {
    ElMessage({
      message: err.message || 'Failed to disable 2FA',
      type: 'error',
      plain: true
    });
  } finally {
    disableLoading.value = false;
  }
}

// ==========================================
// Regenerate Backup Codes
// ==========================================
const openRegenBackupModal = () => {
  regenPassword.value = '';
  regenResultCodes.value = [];
  regenDialogVisible.value = true;
}

const submitRegenBackupCodes = async () => {
  if (!regenPassword.value) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true
    });
    return;
  }

  regenLoading.value = true;
  try {
    const res = await regenerateBackupCodes(regenPassword.value);
    regenResultCodes.value = res.backupCodes || [];
    await fetchTotpStatus();
  } catch (err) {
    ElMessage({
      message: err.message || 'Failed to regenerate backup codes',
      type: 'error',
      plain: true
    });
  } finally {
    regenLoading.value = false;
  }
}

const copyRegenBackupCodes = () => {
  const text = regenResultCodes.value.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    ElMessage({
      message: t('totpCopySuccess'),
      type: 'success',
      plain: true
    });
  });
}

const downloadRegenBackupCodesTxt = () => {
  const text = `EpoCanvas Mail 2FA Recovery Backup Codes (Regenerated)\nGenerated at: ${new Date().toISOString()}\n\n` +
    regenResultCodes.value.map((c, i) => `${i + 1}. ${c}`).join('\n') +
    '\n\n* Old backup codes are now void. Each new code can be used only once.';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `epomail-backup-codes-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const printRegenBackupCodes = () => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>EpoCanvas Mail 2FA Backup Codes</title>
        <style>
          body { font-family: monospace; padding: 40px; }
          h2 { color: #333; }
          .code-item { font-size: 16px; padding: 6px 0; }
        </style>
      </head>
      <body>
        <h2>🛡️ EpoCanvas Mail 2FA Recovery Backup Codes (Regenerated)</h2>
        <p>Old backup codes have been invalidated. Keep these codes safe.</p>
        <hr/>
        <ol>
          ${regenResultCodes.value.map(c => `<li class="code-item"><strong>${c}</strong></li>`).join('')}
        </ol>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

// ==========================================
// Account Settings
// ==========================================
function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {
  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId, name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    accountStore.changeUserAccountName = name
  }).catch(() => {
    userStore.user.name = name
  })
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}

function submitPwd() {
  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })
}
</script>

<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 24px 20px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
    color: var(--text-primary);
  }

  .container {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 30px;
    padding: 24px;
    border-radius: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);

    .item {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 80px;
      position: relative;
      align-items: center;

      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px, calc(100vw - 222px));
        }
      }

      .edit-name {
        color: var(--accent-primary);
        padding-left: 10px;
        cursor: pointer;
        font-weight: 500;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
        color: var(--text-primary);
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--text-secondary);
      }
    }
  }

  /* Two-Factor Center unified card */
  .two-factor-center {
    gap: 16px;

    /* Hero Banner */
    .two-factor-banner {
      padding: 20px 24px;
      border-radius: 12px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-hover);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      transition: all 0.25s ease;

      @media (max-width: 767px) {
        flex-direction: column;
        align-items: flex-start;
        padding: 16px;
        gap: 16px;
      }

      &.is-enabled {
        border-color: rgba(16, 185, 129, 0.3);
        background: rgba(16, 185, 129, 0.05);
      }

      .banner-left {
        display: flex;
        align-items: center;
        gap: 16px;

        .shield-badge {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.25s ease;

          &.active-shield {
            background: rgba(16, 185, 129, 0.12);
            border-color: rgba(16, 185, 129, 0.25);
            color: #10b981;
          }
        }

        .banner-texts {
          display: flex;
          flex-direction: column;
          gap: 4px;

          .banner-status-row {
            display: flex;
            align-items: center;
            gap: 10px;

            .banner-title {
              font-size: 15px;
              font-weight: 700;
              color: var(--text-primary);
            }

            .status-pill {
              font-weight: 600;
              font-size: 11px;
            }
          }

          .banner-desc {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.5;
            max-width: 580px;
          }
        }
      }

      .banner-right {
        flex-shrink: 0;

        @media (max-width: 767px) {
          width: 100%;
          .action-pill-btn {
            width: 100%;
          }
        }

        .action-pill-btn {
          border-radius: 8px;
          padding: 8px 18px;
          font-weight: 600;
        }

        .primary-glow {
          box-shadow: 0 2px 10px rgba(59, 130, 246, 0.2);
        }
      }
    }

    /* Second-steps card */
    .second-steps-card {
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-surface);
      overflow: hidden;

      .card-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-subtle);
        background: var(--bg-hover);

        .sub-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .sub-desc {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }

      .methods-list {
        display: flex;
        flex-direction: column;

        .method-item {
          padding: 18px 20px;
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          gap: 18px;
          transition: background 0.15s ease;

          &:last-child {
            border-bottom: none;
          }

          &:hover {
            background: var(--bg-hover);
          }

          @media (max-width: 767px) {
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
          }

          .method-icon-box {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;

            &.app-icon-box {
              background: rgba(59, 130, 246, 0.1);
              color: #3b82f6;
            }

            &.backup-icon-box {
              background: rgba(245, 158, 11, 0.1);
              color: #f59e0b;
            }

            &.passkey-icon-box {
              background: rgba(139, 92, 246, 0.1);
              color: #8b5cf6;
            }
          }

          .method-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;

            .method-headline {
              display: flex;
              align-items: center;
              gap: 8px;

              .method-name {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary);
              }
            }

            .method-subtext {
              font-size: 12px;
              color: var(--text-secondary);
              line-height: 1.45;
            }
          }

          .method-action {
            flex-shrink: 0;

            &.dual-actions {
              display: flex;
              gap: 10px;
            }

            @media (max-width: 767px) {
              width: 100%;
              display: flex;
              .el-button {
                flex: 1;
              }
            }
          }

          /* Passkey Special Layout */
          &.passkey-section-item {
            flex-direction: column;
            align-items: stretch;
            gap: 14px;

            .method-main-row {
              display: flex;
              align-items: center;
              gap: 18px;

              @media (max-width: 767px) {
                flex-direction: column;
                align-items: flex-start;
                gap: 14px;
              }
            }

            .passkeys-sublist {
              margin-left: 58px;
              display: flex;
              flex-direction: column;
              gap: 6px;
              background: var(--bg-hover);
              padding: 10px 14px;
              border-radius: 8px;
              border: 1px solid var(--border-subtle);

              @media (max-width: 767px) {
                margin-left: 0;
                width: 100%;
              }

              .passkey-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 4px 0;
                border-bottom: 1px solid var(--border-subtle);

                &:last-child {
                  border-bottom: none;
                }

                .passkey-info {
                  display: flex;
                  align-items: center;
                  gap: 10px;

                  .key-icon {
                    color: #8b5cf6;
                  }

                  .passkey-details {
                    display: flex;
                    flex-direction: column;

                    .passkey-name {
                      font-size: 13px;
                      font-weight: 600;
                      color: var(--text-primary);
                    }

                    .passkey-date {
                      font-size: 11px;
                      color: var(--text-muted);
                    }
                  }
                }
              }
            }

            .empty-passkeys-hint {
              margin-left: 58px;
              font-size: 12px;
              color: var(--text-muted);
              font-style: italic;

              @media (max-width: 767px) {
                margin-left: 0;
              }
            }
          }
        }
      }
    }
  }

  /* Account Deletion Section */
  .del-email {
    gap: 14px;

    .del-msg {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 680px;
    }

    .del-action {
      margin-top: 4px;
    }
  }
}

/* Modals & Dialog Elements */
.dialog-sub-desc {
  font-size: 13px;
  color: var(--regular-text-color, #71717a);
  line-height: 1.5;
  margin-bottom: 16px;
}

.add-passkey-content {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .key-name-field {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .field-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }
}

.setup-steps-wrapper {
  .step-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;

    .step-desc {
      font-size: 13px;
      color: var(--regular-text-color);
      line-height: 1.5;
      text-align: left;
      width: 100%;
    }

    .qr-container {
      padding: 12px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 190px;
      min-width: 190px;

      .totp-qr-image {
        width: 180px;
        height: 180px;
        display: block;
      }

      .qr-loading {
        font-size: 24px;
        color: #4dabff;
      }
    }

    .secret-box {
      width: 100%;
      background: var(--el-fill-color-light);
      padding: 12px 16px;
      border-radius: 8px;
      text-align: left;

      .secret-label {
        font-size: 12px;
        color: var(--regular-text-color);
        display: block;
        margin-bottom: 6px;
      }

      .secret-display {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;

        .secret-code {
          font-family: monospace;
          font-weight: bold;
          font-size: 14px;
          letter-spacing: 1px;
          color: var(--el-color-primary);
          word-break: break-all;
        }
      }
    }

    .verify-input-box {
      width: 100%;
      padding: 20px 0;

      .totp-code-input {
        :deep(input) {
          font-size: 22px;
          letter-spacing: 6px;
          text-align: center;
          font-family: monospace;
          font-weight: bold;
          height: 48px;
        }
      }
    }
  }
}

.backup-codes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  background: var(--el-fill-color-light);
  padding: 14px;
  border-radius: 8px;

  .backup-code-item {
    font-family: monospace;
    font-size: 15px;
    font-weight: bold;
    letter-spacing: 1px;
    padding: 8px 12px;
    background: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    text-align: center;
    color: var(--el-text-color-primary);
  }
}

.backup-actions-toolbar {
  display: flex;
  justify-content: center;
  gap: 12px;
  width: 100%;
  margin: 12px 0;
}

.dialog-footer-actions {
  width: 100%;
  margin-top: 10px;

  &.dual-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    .el-button {
      flex: 1;
    }
  }
}

.w-full {
  width: 100%;
}
</style>
