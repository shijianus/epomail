<template>
  <div class="box">
    
    <!-- Section 1: 基本信息 -->
    <div class="container">
      <div class="title">{{ $t('basicInfo') || '基本信息' }}</div>

      <!-- 个人资料照片 -->
      <div class="item media-item">
        <div>{{ $t('profilePhoto') || '个人资料照片' }}</div>
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
        <div>{{ $t('nickname') || '名称' }}</div>
        <div>
          <span class="user-name">
            <span>{{ userStore.user.nickname || userStore.user.name || $t('notSet') }}</span>
            <span class="edit-name" @click="openNameModal">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>

      <!-- 性别 -->
      <div class="item">
        <div>{{ $t('gender') || '性别' }}</div>
        <div>
          <span class="user-name">
            <span>{{ formatGenderDisplay(userStore.user.gender, userStore.user.genderCustom) }}</span>
            <span class="edit-name" @click="openGenderModal">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>

      <!-- 生日 -->
      <div class="item">
        <div>{{ $t('birthday') || '生日' }}</div>
        <div>
          <span class="user-name">
            <span>{{ formatBirthdayDisplay(userStore.user.birthday) }}</span>
            <span class="edit-name" @click="openBirthdayModal">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- Section 2: 联系信息 -->
    <div class="container">
      <div class="title">{{ $t('contactInfo') || '联系信息' }}</div>

      <!-- 电子邮件 (只读展示，不附带多余冗余提示) -->
      <div class="item">
        <div>{{ $t('profileEmail') || '电子邮件' }}</div>
        <div class="email-val-wrap">
          <span class="font-mono" style="font-weight: 500;">{{ userStore.user.email }}</span>
        </div>
      </div>

      <!-- 电话号码 -->
      <div class="item" style="align-items: flex-start;">
        <div>{{ $t('phones') || '电话' }}</div>
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
              {{ $t('addPhone') || '添加电话号码' }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: 常用地址 -->
    <div class="container">
      <div class="title">{{ $t('addresses') || '常用地址' }}</div>

      <!-- 住家地址 -->
      <div class="item">
        <div>{{ $t('homeAddress') || '住家地址' }}</div>
        <div>
          <span class="user-name">
            <span :class="{ 'text-muted': !addressObj.home }">{{ formatAddressDisplay(addressObj.home) || $t('notSet') }}</span>
            <span class="edit-name" @click="openAddressModal('home')">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>

      <!-- 公司地址 -->
      <div class="item">
        <div>{{ $t('workAddress') || '公司地址' }}</div>
        <div>
          <span class="user-name">
            <span :class="{ 'text-muted': !addressObj.work }">{{ formatAddressDisplay(addressObj.work) || $t('notSet') }}</span>
            <span class="edit-name" @click="openAddressModal('work')">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>

      <!-- 其他地址 -->
      <div class="item">
        <div>{{ $t('otherAddress') || '其他地址' }}</div>
        <div>
          <span class="user-name">
            <span :class="{ 'text-muted': !addressObj.other }">{{ formatAddressDisplay(addressObj.other) || $t('notSet') }}</span>
            <span class="edit-name" @click="openAddressModal('other')">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- Section 4: 关联设置与安全凭据 -->
    <div class="container">
      <div class="title">{{ $t('associatedSettings') || '关联设置与安全' }}</div>

      <!-- 系统语言 -->
      <div class="item">
        <div>{{ $t('systemLanguage') || '系统语言' }}</div>
        <div>
          <span class="user-name">
            <span>{{ currentLanguageDisplay }}</span>
            <span class="edit-name" @click="goToGeneralLanguage">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>

      <!-- EpoCanvas 密码 -->
      <div class="item">
        <div>EpoCanvas {{ $t('password') || '密码' }}</div>
        <div>
          <span class="user-name">
            <span class="font-mono" style="letter-spacing: 2px;">••••••••••••</span>
            <span v-if="passwordChangedText" style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">{{ passwordChangedText }}</span>
            <span class="edit-name" @click="goToSecurityPassword" style="margin-left: 12px;">
              {{ $t('change') || '修改' }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- MODAL 1: 头像上传/修改弹窗 -->
    <el-dialog v-model="avatarDialogShow" :title="$t('avatar') || '个人资料照片'" width="380px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 12px 0;">
        <el-avatar :size="96" :src="avatarPreviewUrl || userStore.user.avatarUrl">
          <Icon icon="lucide:user" width="48" height="48" />
        </el-avatar>
        <div style="color: var(--text-muted); font-size: 13px;">支持 JPG、PNG、GIF 格式图片，大小 25MB 以内</div>
        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <el-upload
            :show-file-list="false"
            :http-request="handleUploadAvatar"
            accept="image/*"
          >
            <el-button type="primary" :loading="avatarLoading">
              {{ $t('upload') || '上传新照片' }}
            </el-button>
          </el-upload>
          <el-button 
            v-if="userStore.user.avatarUrl" 
            type="danger" 
            plain 
            :loading="avatarLoading"
            @click="handleDeleteAvatar"
          >
            {{ $t('delete') || '移除照片' }}
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- MODAL 2: 名称修改弹窗 -->
    <el-dialog v-model="nameDialogShow" :title="$t('nickname') || '修改名称'" width="420px">
      <div style="padding: 10px 0;">
        <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">名称 / 昵称：</label>
        <el-input 
          v-model="editNickname" 
          :maxlength="50" 
          show-word-limit 
          placeholder="请输入您的名称或昵称"
          clearable
        />
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="nameDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="nameLoading" @click="saveNickname">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 3: 性别修改弹窗 -->
    <el-dialog v-model="genderDialogShow" :title="$t('gender') || '设置性别'" width="420px">
      <div style="padding: 10px 0;">
        <el-radio-group v-model="editGender" style="display: flex; flex-direction: column; align-items: flex-start; gap: 12px;">
          <el-radio value="male">{{ $t('genderMale') || '男' }}</el-radio>
          <el-radio value="female">{{ $t('genderFemale') || '女' }}</el-radio>
          <el-radio value="prefer_not_to_say">{{ $t('genderPreferNot') || '不愿透露' }}</el-radio>
          <el-radio value="custom">{{ $t('genderCustom') || '自订性别' }}</el-radio>
        </el-radio-group>
        <div v-if="editGender === 'custom'" style="margin-top: 14px;">
          <el-input 
            v-model="editGenderCustom" 
            :maxlength="50" 
            show-word-limit 
            placeholder="请输入自订性别（50字内）" 
          />
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="genderDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="genderLoading" @click="saveGender">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 4: 生日设置弹窗 -->
    <el-dialog v-model="birthdayDialogShow" :title="$t('birthday') || '设置生日'" width="380px">
      <div style="padding: 10px 0; display: flex; justify-content: center;">
        <el-date-picker
          v-model="editBirthday"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          placeholder="选择出生日期"
          :disabled-date="disableFutureDates"
          style="width: 100%;"
        />
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="birthdayDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="birthdayLoading" @click="saveBirthday">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- MODAL 5: 添加电话号码弹窗 (ISO 3166-1 标准国家与号段) -->
    <el-dialog v-model="phoneDialogShow" :title="$t('addPhone') || '添加电话号码'" width="460px">
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 10px 0;">
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ langSelect === 'zh' ? '国家 / 地区：' : 'Country / Region:' }}
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
              :label="`${langSelect === 'zh' ? item.nameZh : item.nameEn} (${item.dialCode || 'E.164'})`"
              :value="item.code"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span :class="['fi', getFlagClass(item.code), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; flex-shrink: 0;"></span>
                  <span>{{ langSelect === 'zh' ? item.nameZh : item.nameEn }}</span>
                </div>
                <span style="color: var(--el-text-color-secondary); font-size: 13px; font-family: monospace;">{{ item.dialCode }}</span>
              </div>
            </el-option>
          </el-select>
        </div>

        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ langSelect === 'zh' ? '电话号码：' : 'Phone Number:' }}
          </label>
          <el-input
            v-model="newPhoneNumber"
            :placeholder="selectedCountryMeta.placeholder ? (langSelect === 'zh' ? `如: ${selectedCountryMeta.placeholder}` : `e.g. ${selectedCountryMeta.placeholder}`) : ($t('phoneNumber') || '电话号码')"
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
            <span v-else-if="phoneValidationSuccess" style="color: #10b981;">✓ 格式正确</span>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ $t('phoneLabel') || '号码类型' }}：
          </label>
          <el-select v-model="newPhoneLabel" :fit-input-width="true" style="width: 100%;" class="custom-country-select">
            <el-option :label="$t('phoneLabelMobile') || '手机'" value="mobile" />
            <el-option :label="$t('phoneLabelWork') || '工作'" value="work" />
            <el-option :label="$t('phoneLabelHome') || '住宅'" value="home" />
            <el-option :label="$t('phoneLabelOther') || '其他'" value="other" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="phoneDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="phoneLoading" @click="saveNewPhone">{{ $t('add') || '添加' }}</el-button>
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
            {{ langSelect === 'zh' ? '国家 / 地区：' : 'Country / Region:' }}
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
              :label="langSelect === 'zh' ? item.nameZh : item.nameEn"
              :value="item.code"
            >
              <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <span :class="['fi', getFlagClass(item.code), 'fib']" style="width: 20px; height: 15px; border-radius: 2px; box-shadow: 0 0 1px rgba(0,0,0,0.3); display: inline-block; flex-shrink: 0;"></span>
                <span>{{ langSelect === 'zh' ? item.nameZh : item.nameEn }}</span>
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
            :placeholder="langSelect === 'zh' ? '请选择所属区域' : 'Please select area'"
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
            {{ langSelect === 'zh' ? '省份 / 州 / 区域：' : 'State / Province / Region:' }}
          </label>
          <el-input 
            v-model="addressForm.state" 
            :placeholder="langSelect === 'zh' ? '请输入省份或区域' : 'Enter state or region'" 
          />
        </div>

        <!-- 3. 城市 / 市区 -->
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ langSelect === 'zh' ? '城市 / 城区：' : 'City / Area:' }}
          </label>
          <el-input 
            v-model="addressForm.city" 
            :placeholder="getCityPlaceholder()" 
          />
        </div>

        <!-- 4. 详细街道与门牌地址 -->
        <div>
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
            {{ langSelect === 'zh' ? '详细地址 (街道、大厦、门牌)：' : 'Street & Building Address:' }}
          </label>
          <el-input 
            v-model="addressForm.street" 
            type="textarea"
            :rows="2"
            :placeholder="langSelect === 'zh' ? '街道名称、门牌号、大厦/小区、楼层、室号' : 'Street name, building, floor, unit'" 
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
            {{ langSelect === 'zh' ? '规范地址预览：' : 'Standard Address Preview:' }}
          </div>
          <div style="font-weight: 500;">{{ addressFormattedPreview }}</div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="addressDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="addressLoading" @click="saveAddress">{{ $t('save') || '保存' }}</el-button>
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
import { COUNTRY_OPTIONS, validatePhoneNumber, getDefaultCountryCode, formatPhoneNumber, formatPhoneInput, getMaxPhoneDigits } from '@/utils/phone-validator.js'
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
  return langSelect.value === 'en' ? 'English' : '中文 (简体)'
})

const passwordChangedText = computed(() => {
  const ts = userStore.user.passwordUpdatedAt || userStore.user.createTime
  if (!ts) return ''
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return `上次变更时间：${ts}`
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    return langSelect.value === 'en'
      ? `Last changed: ${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`
      : `上次变更时间：${year}年${month}月${day}日`
  } catch (e) {
    return `上次变更时间：${ts}`
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
  if (!gender) return t('notSet') || '未设置'
  if (gender === 'male') return t('genderMale') || '男'
  if (gender === 'female') return t('genderFemale') || '女'
  if (gender === 'prefer_not_to_say') return t('genderPreferNot') || '不愿透露'
  if (gender === 'custom') return `${t('genderCustom') || '自订'}: ${custom || ''}`
  return gender
}

function formatBirthdayDisplay(bday) {
  if (!bday) return t('notSet') || '未设置'
  try {
    const parts = bday.split('-')
    if (parts.length === 3) {
      return langSelect.value === 'en'
        ? `${parts[0]}-${parts[1]}-${parts[2]}`
        : `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
    }
  } catch (e) {}
  return bday
}

function formatPhoneLabel(label) {
  if (label === 'mobile') return t('phoneLabelMobile') || '手机'
  if (label === 'work') return t('phoneLabelWork') || '工作'
  if (label === 'home') return t('phoneLabelHome') || '住宅'
  return t('phoneLabelOther') || '其他'
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
    ElMessage.warning(t('phoneExistsError') || '该电话号码已存在')
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
    ElMessage.success(t('saveSuccessMsg') || '电话号码添加成功')
  } catch (e) {
    ElMessage.error(e.message || '添加失败')
  } finally {
    phoneLoading.value = false
  }
}

async function deletePhone(index) {
  const target = phoneList.value[index]
  if (!target) return

  ElMessageBox.confirm(
    t('delPhoneConfirm', { number: target.formatted || target.number }) || `确定要移除电话号码 “${target.formatted || target.number}” 吗？`,
    t('delete') || '删除确认',
    {
      confirmButtonText: t('confirm') || '确定',
      cancelButtonText: t('cancel') || '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const updatedPhones = phoneList.value.filter((_, idx) => idx !== index)
      await updateProfile({ phones: updatedPhones })
      userStore.user.phones = updatedPhones
      ElMessage.success('电话号码已移除')
    } catch (e) {
      ElMessage.error(e.message || '移除失败')
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
  if (c === 'HK') return langSelect.value === 'zh' ? '如: 中环 / 铜锣湾 / 尖沙咀 / 旺角等' : 'e.g. Central, Causeway Bay, Tsim Sha Tsui'
  if (c === 'MO') return langSelect.value === 'zh' ? '如: 新口岸 / 氹仔市区 / 黑沙环等' : 'e.g. NAPE, Taipa Central, Areia Preta'
  if (c === 'TW') return langSelect.value === 'zh' ? '如: 信义区 / 大安区 / 板桥区等' : 'e.g. Xinyi Dist., Da-an Dist.'
  if (c === 'CN') return langSelect.value === 'zh' ? '如: 朝阳区 / 海淀区 / 天河区等' : 'e.g. Chaoyang Dist., Haidian Dist.'
  return langSelect.value === 'zh' ? '城市或地区名称' : 'City or local area'
}

function getSubdivisionLabel() {
  const c = addressForm.value.country
  if (c === 'HK') return langSelect.value === 'zh' ? '区议会分区 (18区)' : 'District (18 Districts)'
  if (c === 'MO') return langSelect.value === 'zh' ? '堂区 (8堂区)' : 'Parish'
  if (c === 'TW') return langSelect.value === 'zh' ? '县市 (22县市)' : 'City / County'
  if (c === 'CN') return langSelect.value === 'zh' ? '省份 / 直辖市 / 自治区' : 'Province / Municipality'
  if (c === 'JP') return langSelect.value === 'zh' ? '都道府县' : 'Prefecture'
  if (c === 'US') return langSelect.value === 'zh' ? '州 (State)' : 'State'
  if (c === 'GB') return langSelect.value === 'zh' ? '大区 / 郡 (Region / County)' : 'Region / County'
  if (c === 'SG') return langSelect.value === 'zh' ? '规划分区' : 'Planning Region'
  return langSelect.value === 'zh' ? '省份 / 州 / 区域' : 'State / Province / Region'
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
  if (currentAddressType.value === 'home') return t('homeAddress') || '住家地址'
  if (currentAddressType.value === 'work') return t('workAddress') || '公司地址'
  return t('otherAddress') || '其他地址'
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
    ElMessage.success(t('saveSuccessMsg') || '地址保存成功')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    addressLoading.value = false
  }
}

async function handleUploadAvatar(options) {
  const file = options.file
  if (file.size > 25 * 1024 * 1024) {
    ElMessage.error(t('imageSizeLimitMsg') || '图片大小不能超过 25MB')
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
      ElMessage.success(t('saveSuccessMsg') || '头像更新成功')
    }
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
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
    ElMessage.success('头像已移除')
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    avatarLoading.value = false
  }
}

async function saveNickname() {
  const val = editNickname.value.trim()
  if (!val) {
    ElMessage.warning('名称不能为空')
    return
  }
  nameLoading.value = true
  try {
    await updateProfile({ nickname: val })
    userStore.user.nickname = val
    nameDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg') || '保存成功')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
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
    ElMessage.success(t('saveSuccessMsg') || '保存成功')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
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
    ElMessage.success(t('saveSuccessMsg') || '保存成功')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
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
