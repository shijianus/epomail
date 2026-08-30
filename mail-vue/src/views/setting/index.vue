<template>
  <div class="box">
    <!-- Account Information -->
    <div class="container">
      <div class="title">{{$t('securitySetting') || 'Security Settings'}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span>{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>

    <!-- 2FA Section -->
    <div class="totp-section">
      <div class="title">{{ $t('totpTitle') }}</div>
      <div class="totp-card">
        <div class="totp-info">
          <div class="totp-status-row">
            <span class="totp-label">{{ $t('totpStatus') }}:</span>
            <el-tag :type="totpStatus.enabled ? 'success' : 'info'" effect="light" round>
              {{ totpStatus.enabled ? $t('totpEnabled') : $t('totpDisabled') }}
            </el-tag>
            <el-tag v-if="totpStatus.enabled" type="warning" effect="plain" round class="backup-remain-tag">
              {{ $t('totpBackupRemaining', { count: totpStatus.backupCodesRemaining }) }}
            </el-tag>
          </div>
          <div class="totp-desc">
            {{ totpStatus.enabled ? $t('totpEnabledDesc') : $t('totpDisabledDesc') }}
          </div>
        </div>
        <div class="totp-actions">
          <template v-if="!totpStatus.enabled">
            <el-button type="primary" :loading="totpLoading" @click="startTotpSetup">
              {{ $t('totpEnableBtn') }}
            </el-button>
          </template>
          <template v-else>
            <el-button type="default" :loading="totpLoading" @click="openRegenBackupModal">
              {{ $t('totpRegenBackupBtn') }}
            </el-button>
            <el-button type="danger" plain :loading="totpLoading" @click="openDisableTotpModal">
              {{ $t('totpDisableBtn') }}
            </el-button>
          </template>
        </div>
      </div>
    </div>

    <!-- Language Selection -->
    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
    </div>

    <!-- Account Deletion -->
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>

    <!-- Change Password Dialog -->
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
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
            <el-button @click="setupStep = 1">{{ $t('backBtn') || $t('back') || '返回' }}</el-button>
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

    <!-- Disable 2FA Modal -->
    <el-dialog
      v-model="disableDialogVisible"
      :title="$t('totpDisableTitle')"
      width="400px"
      destroy-on-close
    >
      <div class="disable-modal-content">
        <div class="disable-desc" style="color: var(--regular-text-color); margin-bottom: 15px; font-size: 13px;">
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

    <!-- Regenerate Backup Codes Modal -->
    <el-dialog
      v-model="regenDialogVisible"
      :title="$t('totpRegenTitle')"
      width="460px"
      destroy-on-close
    >
      <div v-if="regenResultCodes.length === 0" class="regen-modal-content">
        <div style="color: var(--regular-text-color); margin-bottom: 15px; font-size: 13px;">
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
              {{ $t('totpDone') }}
            </el-button>
          </template>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, defineOptions } from 'vue'
import {
  resetPassword,
  userDelete,
  getTotpStatus,
  getTotpSetup,
  enableTotp,
  disableTotp,
  regenerateBackupCodes
} from "@/request/my.js";
import { useUserStore } from "@/store/user.js";
import router from "@/router/index.js";
import { accountSetName } from "@/request/account.js";
import { useAccountStore } from "@/store/account.js";
import { useI18n } from "vue-i18n";
import { useSettingStore } from "@/store/setting.js";
import QRCode from 'qrcode';

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)

defineOptions({
  name: 'setting'
})

// ==========================================
// 2FA Reactive State & Methods
// ==========================================
const totpLoading = ref(false)
const totpStatus = reactive({
  enabled: false,
  backupCodesRemaining: 0,
  createdAt: null
})

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

const fetchTotpStatus = async () => {
  try {
    const res = await getTotpStatus();
    if (res) {
      totpStatus.enabled = !!res.enabled;
      totpStatus.backupCodesRemaining = res.backupCodesRemaining || 0;
      totpStatus.createdAt = res.createdAt || null;
    }
  } catch (err) {
    console.error('Failed to load TOTP status:', err);
  }
}

onMounted(() => {
  fetchTotpStatus();
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
        message: t('totpKeyCopySuccess'),
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
  const text = `EpoMail 2FA Recovery Backup Codes\nGenerated at: ${new Date().toISOString()}\n\n` +
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
        <title>EpoMail 2FA Backup Codes</title>
        <style>
          body { font-family: monospace; padding: 40px; }
          h2 { color: #333; }
          .code-item { font-size: 16px; padding: 6px 0; }
        </style>
      </head>
      <body>
        <h2>🛡️ EpoMail 2FA Recovery Backup Codes</h2>
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

// Disable TOTP
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

// Regenerate Backup Codes
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
  const text = `EpoMail 2FA Recovery Backup Codes (Regenerated)\nGenerated at: ${new Date().toISOString()}\n\n` +
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
        <title>EpoMail 2FA Backup Codes</title>
        <style>
          body { font-family: monospace; padding: 40px; }
          h2 { color: #333; }
          .code-item { font-size: 16px; padding: 6px 0; }
        </style>
      </head>
      <body>
        <h2>🛡️ EpoMail 2FA Recovery Backup Codes (Regenerated)</h2>
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

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
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
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
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
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  /* 2FA Section Styles */
  .totp-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 40px;

    .totp-card {
      padding: 20px 24px;
      border-radius: 12px;
      border: 1px solid var(--el-border-color-light);
      background-color: var(--el-fill-color-blank);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;

      @media (max-width: 767px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }

      .totp-info {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .totp-status-row {
          display: flex;
          align-items: center;
          gap: 10px;

          .totp-label {
            font-size: 14px;
            font-weight: bold;
          }

          .backup-remain-tag {
            font-size: 12px;
          }
        }

        .totp-desc {
          font-size: 13px;
          color: var(--regular-text-color);
          max-width: 540px;
          line-height: 1.5;
        }
      }

      .totp-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
    }
  }

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}

/* 2FA Setup Dialog Elements */
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
      margin: 4px 0;
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

.w-full {
  width: 100%;
}
</style>
