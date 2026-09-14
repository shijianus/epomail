<template>
  <div class="box">
    
    <!-- Section 1: 基本信息 -->
    <div class="container">
      <div class="title">{{ $t('basicInfo') }}</div>

      <!-- 个人资料照片 -->
      <div class="item media-item">
        <div>{{ $t('profilePhoto') }}</div>
        <div class="image-preview-group">
          <el-avatar
            :size="72"
            :src="userStore.user.avatarUrl"
            class="avatar-preview"
          >
            <Icon icon="lucide:user" width="36" height="36" />
          </el-avatar>
          <div class="background-btn">
            <el-button class="opt-button" size="small" type="primary" @click="openAvatarModal">
              <Icon icon="lucide:upload" width="16" height="16" />
            </el-button>
            <el-button 
              v-if="userStore.user.avatarUrl" 
              class="opt-button" 
              size="small" 
              type="primary" 
              @click="handleDeleteAvatar"
            >
              <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16" />
            </el-button>
          </div>
        </div>
      </div>

      <!-- 名称 / 昵称 -->
      <div class="item">
        <div>{{ $t('nickname') }}</div>
        <div>
          <span class="user-name">
            <span>{{ userStore.user.nickname || userStore.user.name || $t('notSet') }}</span>
            <span class="edit-name" @click="openNameModal">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>

      <!-- 性别 -->
      <div class="item">
        <div>{{ $t('gender') }}</div>
        <div>
          <span class="user-name">
            <span>{{ formatGenderDisplay(userStore.user.gender, userStore.user.genderCustom) }}</span>
            <span class="edit-name" @click="openGenderModal">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>

      <!-- 生日 -->
      <div class="item">
        <div>{{ $t('birthday') }}</div>
        <div>
          <span class="user-name">
            <span>{{ formatBirthdayDisplay(userStore.user.birthday) }}</span>
            <span class="edit-name" @click="openBirthdayModal">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- Section 2: 联系信息 -->
    <div class="container">
      <div class="title">{{ $t('contactInfo') }}</div>

      <!-- 电子邮件 (只读展示，不附带多余冗余提示) -->
      <div class="item">
        <div>{{ $t('profileEmail') }}</div>
        <div class="email-val-wrap">
          <span class="font-mono" style="font-weight: 500;">{{ userStore.user.email }}</span>
        </div>
      </div>

      <!-- 电话号码 -->
      <div class="item" style="align-items: flex-start;">
        <div>{{ $t('phones') }}</div>
        <div class="phones-container">
          <div class="phone-list" v-if="phoneList.length > 0">
            <div v-for="(p, idx) in phoneList" :key="p.id || idx" class="phone-row">
              <span :class="['fi', getFlagClass(p.countryCode), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; flex-shrink: 0;"></span>
              <span class="phone-num font-mono">{{ p.formatted || formatPhoneNumber(p.number, p.countryCode) }}</span>
              <el-tag size="small" effect="plain" class="phone-tag">{{ formatPhoneLabel(p.label) }}</el-tag>
              <span class="del-btn" @click="deletePhone(idx)" :title="$t('delete')">
                <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16" />
              </span>
            </div>
          </div>
          <!-- 若未添加电话号码，不展示占位文案，直接呈现添加按钮 -->
          <div :style="{ marginTop: phoneList.length > 0 ? '10px' : '0' }">
            <el-button type="primary" size="small" @click="openPhoneModal">
              <Icon icon="lucide:plus" width="14" height="14" style="margin-right: 4px;" />
              {{ $t('addPhone') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: 常用地址 -->
    <div class="container">
      <div class="title">{{ $t('addresses') }}</div>

      <!-- 住家地址 -->
      <div class="item">
        <div>{{ $t('homeAddress') }}</div>
        <div>
          <span class="user-name">
            <span :class="{ 'text-muted': !addressObj.home }">{{ formatAddressDisplay(addressObj.home) || $t('notSet') }}</span>
            <span class="edit-name" @click="openAddressModal('home')">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>

      <!-- 公司地址 -->
      <div class="item">
        <div>{{ $t('workAddress') }}</div>
        <div>
          <span class="user-name">
            <span :class="{ 'text-muted': !addressObj.work }">{{ formatAddressDisplay(addressObj.work) || $t('notSet') }}</span>
            <span class="edit-name" @click="openAddressModal('work')">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>

      <!-- 其他地址 -->
      <div class="item">
        <div>{{ $t('otherAddress') }}</div>
        <div>
          <span class="user-name">
            <span :class="{ 'text-muted': !addressObj.other }">{{ formatAddressDisplay(addressObj.other) || $t('notSet') }}</span>
            <span class="edit-name" @click="openAddressModal('other')">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>
    </div>



    <!-- Section 4: 关联设置与安全凭据 -->
    <div class="container">
      <div class="title">{{ $t('associatedSettings') }}</div>

      <!-- 系统语言 -->
      <div class="item">
        <div>{{ $t('systemLanguage') }}</div>
        <div>
          <span class="user-name">
            <span>{{ currentLanguageDisplay }}</span>
            <span class="edit-name" @click="goToGeneralLanguage">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>

      <!-- EpoCanvas 密码 -->
      <div class="item">
        <div>EpoCanvas {{ $t('password') }}</div>
        <div>
          <span class="user-name">
            <span class="font-mono" style="letter-spacing: 2px;">••••••••••••</span>
            <span v-if="passwordChangedText" style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">{{ passwordChangedText }}</span>
            <span class="edit-name" @click="goToSecurityPassword" style="margin-left: 12px;">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- MODAL 1: 头像上传/修改弹窗 -->
    <el-dialog v-model="avatarDialogShow" :title="$t('avatar')" width="380px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 12px 0;">
        <el-avatar :size="96" :src="avatarPreviewUrl || userStore.user.avatarUrl">
          <Icon icon="lucide:user" width="48" height="48" />
        </el-avatar>
        <div style="color: var(--text-muted); font-size: 13px;">{{ $t('avatarUploadHint') }}</div>
        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <el-upload
            :show-file-list="false"
            :http-request="handleUploadAvatar"
            accept="image/*"
          >
            <el-button type="primary" :loading="avatarLoading">
              {{ $t('upload') }}
            </el-button>
          </el-upload>
          <el-button 
            v-if="userStore.user.avatarUrl" 
            type="danger" 
            plain 
            :loading="avatarLoading"
            @click="handleDeleteAvatar"
          >
            {{ $t('delete') }}
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- MODAL 2: 名称修改弹窗 -->
    <el-dialog v-model="nameDialogShow" :title="$t('nickname')" width="420px">
      <div style="padding: 10px 0;">
        <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">{{ $t('nameOrNickname') }}：</label>
        <el-input 
          v-model="editNickname" 
          :maxlength="50" 
          show-word-limit 
          :placeholder="$t('enterNameOrNicknamePlaceholder')"
          clearable
        />
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="nameDialogShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="nameLoading" @click="saveNickname">{{ $t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 3: 性别修改弹窗 -->
    <el-dialog v-model="genderDialogShow" :title="$t('gender')" width="420px">
      <div style="padding: 10px 0;">
        <el-radio-group v-model="editGender" style="display: flex; flex-direction: column; align-items: flex-start; gap: 12px;">
          <el-radio value="male">{{ $t('genderMale') }}</el-radio>
          <el-radio value="female">{{ $t('genderFemale') }}</el-radio>
          <el-radio value="prefer_not_to_say">{{ $t('genderPreferNot') }}</el-radio>
          <el-radio value="custom">{{ $t('genderCustom') }}</el-radio>
        </el-radio-group>
        <div v-if="editGender === 'custom'" style="margin-top: 14px;">
          <el-input 
            v-model="editGenderCustom" 
            :maxlength="50" 
            show-word-limit 
            :placeholder="$t('enterCustomGenderPlaceholder')" 
          />
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="genderDialogShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="genderLoading" @click="saveGender">{{ $t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 4: 生日设置弹窗 -->
    <el-dialog v-model="birthdayDialogShow" :title="$t('birthday')" width="380px">
      <div style="padding: 10px 0; display: flex; justify-content: center;">
        <el-date-picker
          v-model="editBirthday"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          :placeholder="$t('selectBirthDatePlaceholder')"
          :disabled-date="disableFutureDates"
          style="width: 100%;"
        />
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="birthdayDialogShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="birthdayLoading" @click="saveBirthday">{{ $t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 5: 添加电话号码弹窗 (ISO 3166-1 标准国家与号段) -->
    <el-dialog v-model="phoneDialogShow" :title="$t('addPhone')" width="460px">
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 10px 0;">
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('countryRegion') }}
          </label>
          <el-select 
            v-model="newPhoneCountry" 
            filterable 
            :fit-input-width="true"
            style="width: 100%;" 
            class="custom-country-select phone-country-select"
            @change="onCountryChange"
          >
            <template #prefix>
              <span v-if="newPhoneCountry" :class="['fi', getFlagClass(newPhoneCountry), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; margin-right: 4px;"></span>
            </template>
            <el-option
              v-for="item in COUNTRY_OPTIONS"
              :key="item.code"
              :label="`${getCountryDisplayName(item, langSelect)} (${item.dialCode || 'E.164'})`"
              :value="item.code"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span :class="['fi', getFlagClass(item.code), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; flex-shrink: 0;"></span>
                  <span>{{ getCountryDisplayName(item, langSelect) }}</span>
                </div>
                <span style="color: var(--el-text-color-secondary); font-size: 13px; font-family: monospace;">{{ item.dialCode }}</span>
              </div>
            </el-option>
          </el-select>
        </div>

        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('phoneNumberLabel') }}
          </label>
          <el-input
            v-model="newPhoneNumber"
            :placeholder="selectedCountryMeta.placeholder ? ((langSelect === 'zh' || langSelect === 'zh-Hant') ? `如: ${selectedCountryMeta.placeholder}` : `e.g. ${selectedCountryMeta.placeholder}`) : ($t('phoneNumber'))"
            clearable
            class="phone-number-input"
            @input="onPhoneInput"
            @keypress="onPhoneKeyPress"
          >
            <template #prepend>
              <span style="font-family: monospace; font-weight: 500;">{{ selectedCountryMeta.dialCode || '+' }}</span>
            </template>
          </el-input>

          <!-- 校验反馈：仅在有错误或验证成功时显示反馈，绝不暴露内部规则文本 -->
          <div class="phone-validation-feedback" :class="{ 'is-error': phoneValidationError, 'is-valid': phoneValidationSuccess }" v-if="phoneValidationError || phoneValidationSuccess">
            <span v-if="phoneValidationError">⚠️ {{ phoneValidationError }}</span>
            <span v-else-if="phoneValidationSuccess" style="color: #10b981;">{{ $t('formatCorrect') }}</span>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('phoneLabel') }}：
          </label>
          <el-select v-model="newPhoneLabel" :fit-input-width="true" style="width: 100%;" class="custom-country-select">
            <el-option :label="$t('phoneLabelMobile')" value="mobile" />
            <el-option :label="$t('phoneLabelWork')" value="work" />
            <el-option :label="$t('phoneLabelHome')" value="home" />
            <el-option :label="$t('phoneLabelOther')" value="other" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="phoneDialogShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="phoneLoading" @click="saveNewPhone">{{ $t('add') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 6: 地址修改弹窗 (ISO 3166-1 标准分级区划下拉与真实地址规范) -->
    <el-dialog 
      v-model="addressDialogShow" 
      :title="getAddressModalTitle()" 
      width="480px" 
    >
      <div style="display: flex; flex-direction: column; gap: 14px; padding: 10px 0;">
        <!-- 1. 国家 / 地区 下拉框 -->
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('countryRegion') }}
          </label>
          <el-select 
            v-model="addressForm.country" 
            filterable 
            :fit-input-width="true"
            style="width: 100%;" 
            class="custom-country-select"
            @change="onAddressCountryChange"
          >
            <template #prefix>
              <span v-if="addressForm.country" :class="['fi', getFlagClass(addressForm.country), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; margin-right: 4px;"></span>
            </template>
            <el-option
              v-for="item in ISO_COUNTRIES"
              :key="item.code"
              :label="getCountryDisplayName(item, langSelect)"
              :value="item.code"
            >
              <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <span :class="['fi', getFlagClass(item.code), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; flex-shrink: 0;"></span>
                <span>{{ getCountryDisplayName(item, langSelect) }}</span>
              </div>
            </el-option>
          </el-select>
        </div>

        <!-- 2. 行政区划 / 州 / 省份 / 分区 下拉框 -->
        <div v-if="subdivisionOptions.length > 0">
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ getSubdivisionLabel() }}：
          </label>
          <el-select 
            v-model="addressForm.state" 
            filterable 
            :fit-input-width="true"
            style="width: 100%;"
            class="custom-country-select"
            :placeholder="$t('selectAreaPlaceholder')"
          >
            <el-option
              v-for="sub in subdivisionOptions"
              :key="sub.value"
              :label="langSelect === 'zh' ? sub.labelZh : sub.labelEn"
              :value="sub.value"
            />
          </el-select>
        </div>
        <div v-else>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('stateProvinceRegion') }}
          </label>
          <el-input 
            v-model="addressForm.state" 
            :placeholder="$t('enterStateOrRegionPlaceholder')" 
          />
        </div>

        <!-- 3. 城市 / 市区 -->
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('cityArea') }}
          </label>
          <el-input 
            v-model="addressForm.city" 
            :placeholder="getCityPlaceholder()" 
          />
        </div>

        <!-- 4. 详细街道与门牌地址 -->
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('streetBuildingAddress') }}
          </label>
          <el-input 
            v-model="addressForm.street" 
            type="textarea"
            :rows="2"
            :placeholder="$t('streetAddressPlaceholder')" 
          />
        </div>

        <!-- 5. 邮政编码 (动态区分：仅对HKG/北韩等无邮编地区标选填，有邮编地区标标准字段) -->
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ getPostalCodeLabel(addressForm.country, langSelect) }}
          </label>
          <el-input 
            v-model="addressForm.postalCode" 
            :placeholder="getPostalCodePlaceholder(addressForm.country, langSelect)" 
            clearable
          />
        </div>

        <!-- 实时标准地址预览 -->
        <div v-if="addressFormattedPreview" style="background: var(--el-fill-color-light); border-radius: 6px; padding: 10px 12px; font-size: 13px; color: var(--el-text-color-regular);">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 2px;">
            {{ $t('standardAddressPreview') }}
          </div>
          <div style="font-weight: 500;">{{ addressFormattedPreview }}</div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="addressDialogShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="addressLoading" @click="saveAddress">{{ $t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/store/user.js'
import { useSettingStore } from '@/store/setting.js'
import { updateProfile, uploadImage, getGeo } from '@/request/my.js'
import { COUNTRY_OPTIONS, getCountryDisplayName, validatePhoneNumber, getDefaultCountryCode, formatPhoneNumber, formatPhoneInput, getMaxPhoneDigits } from '@/utils/phone-validator.js'
import { ISO_COUNTRIES, getSubdivisionsByCountry, formatStructuredAddress, hasPostalCode, getPostalCodeLabel, getPostalCodePlaceholder, getFlagClass } from '@/utils/geo-data.js'

defineOptions({
  name: 'user-profile'
})

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const settingStore = useSettingStore()

const langSelect = computed(() => settingStore.lang || 'zh')

// Modals State
const avatarDialogShow = ref(false)
const avatarPreviewUrl = ref('')
const avatarLoading = ref(false)

const nameDialogShow = ref(false)
const editNickname = ref('')
const nameLoading = ref(false)

const genderDialogShow = ref(false)
const editGender = ref('prefer_not_to_say')
const editGenderCustom = ref('')
const genderLoading = ref(false)

const birthdayDialogShow = ref(false)
const editBirthday = ref('')
const birthdayLoading = ref(false)

const phoneDialogShow = ref(false)
const newPhoneCountry = ref('HK')
const newPhoneNumber = ref('')
const newPhoneLabel = ref('mobile')
const phoneValidationError = ref('')
const phoneValidationSuccess = ref(false)
const phoneLoading = ref(false)
let lastPhoneValue = ''

const addressDialogShow = ref(false)
const currentAddressType = ref('home')
const addressLoading = ref(false)
const addressForm = ref({
  country: 'HK',
  state: '',
  city: '',
  street: '',
  postalCode: ''
})

// Computed
const phoneList = computed(() => {
  if (Array.isArray(userStore.user.phones)) {
    return userStore.user.phones
  }
  return []
})

const addressObj = computed(() => {
  return userStore.user.addresses || { home: '', work: '', other: '' }
})

const currentLanguageDisplay = computed(() => {
  const map = {
    'zh': '中文 (简体)',
    'zh-Hant': '正體中文 (繁體)',
    'en': 'English',
    'fr': 'Français',
    'es': 'Español',
    'nl': 'Nederlands'
  }
  return map[langSelect.value] || 'English'
})

const passwordChangedText = computed(() => {
  const ts = userStore.user.passwordUpdatedAt || userStore.user.createTime
  if (!ts) return ''
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return t('lastChangeTime', { time: ts })
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    const formatted = (langSelect.value === 'zh' || langSelect.value === 'zh-Hant')
      ? `${year}年${month}月${day}日`
      : `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`
    return t('lastChangeTime', { time: formatted })
  } catch (e) {
    return t('lastChangeTime', { time: ts })
  }
})

const selectedCountryMeta = computed(() => {
  return COUNTRY_OPTIONS.find(c => c.code === newPhoneCountry.value) || COUNTRY_OPTIONS[0]
})

const subdivisionOptions = computed(() => {
  return getSubdivisionsByCountry(addressForm.value.country)
})

const addressFormattedPreview = computed(() => {
  return formatStructuredAddress(addressForm.value, langSelect.value)
})

function formatGenderDisplay(gender, custom) {
  if (!gender) return t('notSet')
  if (gender === 'male') return t('genderMale')
  if (gender === 'female') return t('genderFemale')
  if (gender === 'prefer_not_to_say') return t('genderPreferNot')
  if (gender === 'custom') return `${t('genderCustom')}: ${custom || ''}`
  return gender
}

function formatBirthdayDisplay(bday) {
  if (!bday) return t('notSet')
  try {
    const parts = bday.split('-')
    if (parts.length === 3) {
      return (langSelect.value === 'zh' || langSelect.value === 'zh-Hant')
        ? `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
        : `${parts[0]}-${parts[1]}-${parts[2]}`
    }
  } catch (e) {}
  return bday
}

function formatPhoneLabel(label) {
  if (label === 'mobile') return t('phoneLabelMobile')
  if (label === 'work') return t('phoneLabelWork')
  if (label === 'home') return t('phoneLabelHome')
  return t('phoneLabelOther')
}

function getCountryFlag(code) {
  const c = COUNTRY_OPTIONS.find(item => item.code === code)
  return c ? c.flag : '📞'
}

function disableFutureDates(date) {
  return date.getTime() > Date.now()
}

function goToGeneralLanguage() {
  router.push({ name: 'general-setting', hash: '#language-section' })
}

function goToSecurityPassword() {
  router.push({ name: 'setting', query: { action: 'change-password' } })
}

function openAvatarModal() {
  avatarPreviewUrl.value = userStore.user.avatarUrl || ''
  avatarDialogShow.value = true
}

function openNameModal() {
  editNickname.value = userStore.user.nickname || userStore.user.name || ''
  nameDialogShow.value = true
}

function openGenderModal() {
  editGender.value = userStore.user.gender || 'prefer_not_to_say'
  editGenderCustom.value = userStore.user.genderCustom || ''
  genderDialogShow.value = true
}

function openBirthdayModal() {
  editBirthday.value = userStore.user.birthday || ''
  birthdayDialogShow.value = true
}

function openPhoneModal() {
  newPhoneNumber.value = ''
  lastPhoneValue = ''
  phoneValidationError.value = ''
  phoneValidationSuccess.value = false
  newPhoneLabel.value = 'mobile'

  const detected = userStore.user.clientCountry
  if (detected) {
    newPhoneCountry.value = getDefaultCountryCode(detected)
  }
  phoneDialogShow.value = true

  if (!detected) {
    getGeo().then(res => {
      if (res?.data?.country) {
        userStore.user.clientCountry = res.data.country
        if (!newPhoneNumber.value) {
          newPhoneCountry.value = getDefaultCountryCode(res.data.country)
        }
      }
    }).catch(() => {})
  }
}

function onPhoneKeyPress(e) {
  // 只允许数字键入（0-9），禁止包括 ( ) - 空格等任何符号
  if (!/^\d$/.test(e.key) && e.key !== 'Enter') {
    e.preventDefault()
  }
}

function onCountryChange() {
  lastPhoneValue = ''
  onPhoneInput(newPhoneNumber.value)
}

function onPhoneInput(val) {
  let digits = (val || '').replace(/\D/g, '')
  const prevDigits = (lastPhoneValue || '').replace(/\D/g, '')

  // 只有当用户在末尾退格（新值为上一状态的前缀），且删去的是非数字符号导致 digits 未减少时，才向前联动删掉一位数字
  if (lastPhoneValue && lastPhoneValue.startsWith(val) && digits.length === prevDigits.length && digits.length > 0) {
    digits = digits.slice(0, -1)
  }

  if (!digits) {
    newPhoneNumber.value = ''
    lastPhoneValue = ''
    phoneValidationError.value = ''
    phoneValidationSuccess.value = false
    return
  }

  // 限制最大位长，防止无限输入
  const maxDigits = getMaxPhoneDigits(newPhoneCountry.value)
  if (digits.length > maxDigits) {
    digits = digits.slice(0, maxDigits)
  }

  // 直接在 el-input__inner 中转换展示 (2) -> (20) -> (209) -> (209)-6 -> (209)-678 -> (209)-678-9 -> (209)-678-9490
  const formatted = formatPhoneInput(digits, newPhoneCountry.value)
  newPhoneNumber.value = formatted
  lastPhoneValue = formatted

  const res = validatePhoneNumber(newPhoneCountry.value, digits)
  if (!res.valid) {
    phoneValidationError.value = langSelect.value === 'en' ? res.msgEn : res.msgZh
    phoneValidationSuccess.value = false
  } else {
    phoneValidationError.value = ''
    phoneValidationSuccess.value = true
  }
}

async function saveNewPhone() {
  const cleanNum = (newPhoneNumber.value || '').replace(/\D/g, '')
  const res = validatePhoneNumber(newPhoneCountry.value, cleanNum)
  if (!res.valid) {
    phoneValidationError.value = langSelect.value === 'en' ? res.msgEn : res.msgZh
    ElMessage.error(phoneValidationError.value)
    return
  }

  const existing = phoneList.value.find(p => p.number === res.cleanNum && p.countryCode === newPhoneCountry.value)
  if (existing) {
    ElMessage.warning(t('phoneExistsError'))
    return
  }

  phoneLoading.value = true
  try {
    const formatted = formatPhoneInput(res.cleanNum, newPhoneCountry.value)
    const newEntry = {
      id: 'phone_' + Date.now(),
      countryCode: newPhoneCountry.value,
      dialCode: selectedCountryMeta.value.dialCode,
      number: res.cleanNum,
      formatted: formatted,
      label: newPhoneLabel.value,
      createdAt: new Date().toISOString()
    }
    const updatedPhones = [...phoneList.value, newEntry]
    await updateProfile({ phones: updatedPhones })
    userStore.user.phones = updatedPhones
    phoneDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg'))
  } catch (e) {
    ElMessage.error(e.message || t('addFailed'))
  } finally {
    phoneLoading.value = false
  }
}

async function deletePhone(index) {
  const target = phoneList.value[index]
  if (!target) return

  ElMessageBox.confirm(
    t('delPhoneConfirm', { number: target.formatted || target.number }),
    t('delete'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(async () => {
    try {
      const updatedPhones = phoneList.value.filter((_, idx) => idx !== index)
      await updateProfile({ phones: updatedPhones })
      userStore.user.phones = updatedPhones
      ElMessage.success(t('phoneRemoved'))
    } catch (e) {
      ElMessage.error(e.message || t('removeFailed'))
    }
  }).catch(() => {})
}

// Address handlers
function onAddressCountryChange() {
  addressForm.value.state = ''
  addressForm.value.city = ''
}

function formatAddressDisplay(addr) {
  if (!addr) return ''
  return formatStructuredAddress(addr, langSelect.value)
}

function getCityPlaceholder() {
  const c = addressForm.value.country
  if (langSelect.value === 'zh-Hant') {
    if (c === 'HK') return '如: 中環 / 銅鑼灣 / 尖沙咀 / 旺角等'
    if (c === 'MO') return '如: 新口岸 / 氹仔市區 / 黑沙環等'
    if (c === 'TW') return '如: 信義區 / 大安區 / 板橋區等'
    if (c === 'CN') return '如: 朝陽區 / 海淀區 / 天河區等'
    return '城市或地區名稱'
  }
  if (langSelect.value === 'zh') {
    if (c === 'HK') return '如: 中环 / 铜锣湾 / 尖沙咀 / 旺角等'
    if (c === 'MO') return '如: 新口岸 / 氹仔市区 / 黑沙环等'
    if (c === 'TW') return '如: 信义区 / 大安区 / 板桥区等'
    if (c === 'CN') return '如: 朝阳区 / 海淀区 / 天河区等'
    return '城市或地区名称'
  }
  if (c === 'HK') return 'e.g. Central, Causeway Bay, Tsim Sha Tsui'
  if (c === 'MO') return 'e.g. NAPE, Taipa Central, Areia Preta'
  if (c === 'TW') return 'e.g. Xinyi Dist., Da-an Dist.'
  if (c === 'CN') return 'e.g. Chaoyang Dist., Haidian Dist.'
  return 'City or local area'
}

function getSubdivisionLabel() {
  const c = addressForm.value.country
  if (langSelect.value === 'zh-Hant') {
    if (c === 'HK') return '區議會分區 (18區)'
    if (c === 'MO') return '堂區 (8堂區)'
    if (c === 'TW') return '縣市 (22縣市)'
    if (c === 'CN') return '省份 / 直轄市 / 自治區'
    if (c === 'JP') return '都道府縣'
    if (c === 'US') return '州 (State)'
    if (c === 'GB') return '大區 / 郡 (Region / County)'
    if (c === 'SG') return '規劃分區'
    return '省份 / 州 / 區域'
  }
  if (langSelect.value === 'zh') {
    if (c === 'HK') return '区议会分区 (18区)'
    if (c === 'MO') return '堂区 (8堂区)'
    if (c === 'TW') return '县市 (22县市)'
    if (c === 'CN') return '省份 / 直辖市 / 自治区'
    if (c === 'JP') return '都道府县'
    if (c === 'US') return '州 (State)'
    if (c === 'GB') return '大区 / 郡 (Region / County)'
    if (c === 'SG') return '规划分区'
    return '省份 / 州 / 区域'
  }
  if (c === 'HK') return 'District (18 Districts)'
  if (c === 'MO') return 'Parish'
  if (c === 'TW') return 'City / County'
  if (c === 'CN') return 'Province / Municipality'
  if (c === 'JP') return 'Prefecture'
  if (c === 'US') return 'State'
  if (c === 'GB') return 'Region / County'
  if (c === 'SG') return 'Planning Region'
  return 'State / Province / Region'
}

function openAddressModal(type) {
  currentAddressType.value = type
  const currentVal = addressObj.value[type]
  
  const detectedCountry = userStore.user.clientCountry || 'HK'
  const defaultCountry = getDefaultCountryCode(detectedCountry)

  if (currentVal && typeof currentVal === 'object') {
    addressForm.value = {
      country: currentVal.country || defaultCountry,
      state: currentVal.state || '',
      city: currentVal.city || '',
      street: currentVal.street || '',
      postalCode: currentVal.postalCode || ''
    }
  } else if (currentVal && typeof currentVal === 'string') {
    const parts = currentVal.split(' · ').map(s => s.trim())
    let countryMatch = ISO_COUNTRIES.find(c => parts[0] === c.nameZh || parts[0] === c.nameEn)
    if (countryMatch) {
      const countryCode = countryMatch.code
      const stateMatch = getSubdivisionsByCountry(countryCode).find(s => s.value === parts[1] || s.labelZh === parts[1] || s.labelEn === parts[1])
      addressForm.value = {
        country: countryCode,
        state: stateMatch ? stateMatch.value : (parts[1] || ''),
        city: parts[2] || '',
        street: parts.slice(3).join(' · ') || '',
        postalCode: ''
      }
    } else {
      addressForm.value = {
        country: defaultCountry,
        state: '',
        city: '',
        street: currentVal,
        postalCode: ''
      }
    }
  } else {
    addressForm.value = {
      country: defaultCountry,
      state: '',
      city: '',
      street: '',
      postalCode: ''
    }
  }
  addressDialogShow.value = true
}

function getAddressModalTitle() {
  if (currentAddressType.value === 'home') return t('homeAddress')
  if (currentAddressType.value === 'work') return t('workAddress')
  return t('otherAddress')
}

async function saveAddress() {
  const fullStr = formatStructuredAddress(addressForm.value, langSelect.value)
  addressLoading.value = true
  try {
    const updated = { 
      ...addressObj.value, 
      [currentAddressType.value]: fullStr 
    }
    await updateProfile({ addresses: updated })
    userStore.user.addresses = updated
    addressDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg'))
  } catch (e) {
    ElMessage.error(e.message || t('saveFailed'))
  } finally {
    addressLoading.value = false
  }
}

async function handleUploadAvatar(options) {
  const file = options.file
  if (file.size > 25 * 1024 * 1024) {
    ElMessage.error(t('imageSizeLimitMsg'))
    return
  }
  avatarLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await uploadImage(formData)
    const url = res.data || res.url || res
    if (url) {
      await updateProfile({ avatarUrl: url })
      userStore.user.avatarUrl = url
      avatarPreviewUrl.value = url
      avatarDialogShow.value = false
      ElMessage.success(t('saveSuccessMsg'))
    }
  } catch (e) {
    ElMessage.error(e.message || t('uploadFailed'))
  } finally {
    avatarLoading.value = false
  }
}

async function handleDeleteAvatar() {
  avatarLoading.value = true
  try {
    await updateProfile({ avatarUrl: '' })
    userStore.user.avatarUrl = ''
    avatarPreviewUrl.value = ''
    avatarDialogShow.value = false
    ElMessage.success(t('avatarRemoved'))
  } catch (e) {
    ElMessage.error(e.message || t('operateFailed'))
  } finally {
    avatarLoading.value = false
  }
}

async function saveNickname() {
  const val = editNickname.value.trim()
  if (!val) {
    ElMessage.warning(t('nameCannotBeEmpty'))
    return
  }
  nameLoading.value = true
  try {
    await updateProfile({ nickname: val })
    userStore.user.nickname = val
    nameDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg'))
  } catch (e) {
    ElMessage.error(e.message || t('saveFailed'))
  } finally {
    nameLoading.value = false
  }
}

async function saveGender() {
  genderLoading.value = true
  try {
    await updateProfile({
      gender: editGender.value,
      genderCustom: editGender.value === 'custom' ? editGenderCustom.value.trim() : ''
    })
    userStore.user.gender = editGender.value
    userStore.user.genderCustom = editGender.value === 'custom' ? editGenderCustom.value.trim() : ''
    genderDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg'))
  } catch (e) {
    ElMessage.error(e.message || t('saveFailed'))
  } finally {
    genderLoading.value = false
  }
}

async function saveBirthday() {
  birthdayLoading.value = true
  try {
    await updateProfile({ birthday: editBirthday.value || '' })
    userStore.user.birthday = editBirthday.value || ''
    birthdayDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg'))
  } catch (e) {
    ElMessage.error(e.message || t('saveFailed'))
  } finally {
    birthdayLoading.value = false
  }
}

onMounted(async () => {
  if (!userStore.user.clientCountry) {
    try {
      const res = await getGeo()
      if (res?.data?.country) {
        userStore.user.clientCountry = res.data.country
      }
    } catch (e) {}
  }
})
</script>

<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 20px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
    color: var(--text-primary);
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 22px;
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

      @media (max-width: 767px) {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      > div:first-child {
        font-weight: bold;
        color: var(--text-primary);
      }

      .user-name {
        display: inline-flex;
        align-items: center;
        gap: 12px;

        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name {
        color: var(--accent-primary);
        cursor: pointer;
        font-weight: 500;
        font-size: 13px;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  }

  .media-item {
    align-items: flex-start;
  }

  .image-preview-group {
    display: flex;
    align-items: flex-end;
    gap: 16px;

    .avatar-preview {
      border: 1px solid var(--border-subtle, var(--light-border, #e4e4e7));
      background: var(--bg-hover, #f4f4f5);
      color: var(--text-muted);
    }

    .background-btn {
      display: flex;
      gap: 8px;

      .opt-button {
        margin: 0;
        padding: 8px;
      }
    }
  }

  .email-val-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .phones-container {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .phone-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .phone-row {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 12px;
      background: var(--bg-hover, rgba(0, 0, 0, 0.02));
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: 8px;
      width: fit-content;

      .flag-icon {
        font-size: 16px;
      }

      .phone-num {
        font-size: 14px;
        font-weight: 500;
      }

      .phone-tag {
        font-size: 11px;
      }

      .del-btn {
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;

        &:hover {
          color: #ef4444;
        }
      }
    }
  }

  .phone-validation-feedback {
    margin-top: 6px;
    font-size: 12px;
    min-height: 18px;

    &.is-error {
      color: #ef4444;
      font-weight: 500;
    }

    &.is-valid {
      color: #10b981;
      font-weight: 500;
    }
  }

  .text-muted {
    color: var(--text-muted);
  }

  :deep(.custom-country-select) {
    width: 100%;

    .el-select__wrapper {
      min-height: 40px;
      border-radius: 8px;
      padding: 4px 12px;
      display: flex;
      align-items: center;
    }

    .el-select__prefix {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
      flex-shrink: 0;
    }

    .el-select__suffix {
      display: inline-flex;
      align-items: center;
      color: var(--el-text-color-secondary, #909399);
      flex-shrink: 0;
    }
  }
}
</style>
