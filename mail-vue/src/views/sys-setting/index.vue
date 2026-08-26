<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading/>
    </div>
    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body">
        <div class="card-grid">
          <!-- Website Settings Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('websiteSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('websiteReg') }}</span></div>
                <div>
                  <el-switch @change="(val) => changeField('register', val)" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.register"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('publicProfile') }}</span>
                  <el-tooltip effect="dark" :content="$t('publicProfileDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="(val) => changeField('publicProfile', val)" :before-change="beforeChange" :active-value="1" :inactive-value="0"
                             v-model="setting.publicProfile"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('allMailMode') }}</span>
                  <el-tooltip effect="dark" :content="$t('allMailModeDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="(val) => changeField('allMailMode', val)" :before-change="beforeChange" :active-value="1" :inactive-value="0"
                             v-model="setting.allMailMode"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('loginDomain') }}</span></div>
                <div>
                  <el-switch @change="(val) => changeField('loginDomain', val)" :before-change="beforeChange" :active-value="1" :inactive-value="0"
                             v-model="setting.loginDomain"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('regKey') }}</span></div>
                <div>
                  <el-select
                      @change="(val) => changeField('regKey', val)"
                      :style="`width: ${ locale === 'en' ?  100 : 80 }px;`"
                      v-model="setting.regKey"
                      placeholder="Select"
                  >
                    <el-option
                        v-for="item in regKeyOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('addAccount') }}</span></div>
                <div>
                  <el-switch @change="(val) => changeField('addEmail', val)" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.addEmail"/>
                </div>
              </div>

              <div class="setting-item">
                <div class="title-item">
                  <span>{{ $t('emailPrefix') }}</span>
                  <el-tooltip effect="dark" :content="$t('emailPrefixDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openEmailPrefix">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Personalization Settings Card -->
          <div class="settings-card customization-card">
            <div class="card-title">
              {{ $t('customization') }}
            </div>
            <div class="card-content">
              <!-- UI Type Switcher Tab -->
              <div class="custom-ui-tabs">
                <div 
                  class="ui-tab-item" 
                  :class="{ active: activeUiTab === 'dynamic' }"
                  @click="activeUiTab = 'dynamic'"
                >
                  <Icon icon="fluent:sparkle-20-filled" width="16" height="16" />
                  <span>{{ $t('dynamicUi') }}</span>
                </div>
                <div 
                  class="ui-tab-item" 
                  :class="{ active: activeUiTab === 'static' }"
                  @click="activeUiTab = 'static'"
                >
                  <Icon icon="fluent:image-20-filled" width="16" height="16" />
                  <span>{{ $t('staticUi') }}</span>
                </div>
              </div>

              <!-- Website Title (Common to both) -->
              <div class="setting-item">
                <div class="title-item">
                  <span>{{ $t('websiteTitle') }}</span>
                  <el-tooltip effect="dark" :content="$t('websiteTitleTooltip')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="email-title">
                  <span>{{ setting.title }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="editTitleShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>

              <!-- Dynamic UI Section -->
              <template v-if="activeUiTab === 'dynamic'">
                <div class="setting-item">
                  <div>
                    <span>{{ $t('authCustomization') }}</span>
                    <el-tooltip effect="dark" :content="$t('authI18nNoticeAuto')">
                      <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                    </el-tooltip>
                  </div>
                  <div class="forward">
                    <el-button class="opt-button" size="small" type="primary" @click="editAuthI18nShow = true">
                      <Icon icon="fluent:text-grammar-settings-20-regular" width="16" height="16"/>
                    </el-button>
                  </div>
                </div>
              </template>

              <!-- Static UI Section -->
              <template v-else>
                <div class="setting-item">
                  <div class="title-item">
                    <span>{{ $t('loginBoxOpacity') }}</span>
                    <el-tooltip effect="dark" :content="$t('loginBoxOpacityTooltip')">
                      <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                    </el-tooltip>
                  </div>
                  <div>
                    <el-input-number size="small" v-model="loginOpacity" @change="opacityChange" :precision="2"
                                     :step="0.01" :max="1" :min="0"/>
                  </div>
                </div>
                <div class="setting-item personalized">
                  <div>
                    <span>{{ $t('loginBackground') }}</span>
                    <el-tooltip effect="dark" :content="$t('loginBackgroundTooltip')">
                      <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                    </el-tooltip>
                  </div>
                  <div>
                    <el-image
                        class="background"
                        :src="cvtR2Url(setting.background)"
                        :preview-src-list="[cvtR2Url(setting.background)]"
                        show-progress
                        fit="cover"
                    >
                      <template #error>
                        <div class="error-image">
                          <Icon icon="ph:image" width="24" height="24"/>
                        </div>
                      </template>
                    </el-image>
                    <div class="background-btn">
                      <el-button class="opt-button" size="small" type="primary" @click="openSetBackground">
                        <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                      </el-button>
                      <el-button class="opt-button" size="small" type="primary" @click="delBackground">
                        <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16"/>
                      </el-button>
                    </div>
                  </div>
                </div>
                <div class="static-ui-tip">
                  <Icon icon="fe:warning" width="14" height="14" />
                  <span>{{ $t('staticUiTip') }}</span>
                </div>
              </template>
            </div>
          </div>


          <!-- Object Storage Card -->
          <div class="settings-card">
            <div class="card-title">{{ $t('oss') }}</div>
            <div class="card-content">
              <div class="r2domain-item">
                <div>
                  <span>{{ $t('osDomain') }}</span>
                  <el-tooltip effect="dark" :content="$t('ossDomainDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="r2domain">
                  <span>{{ setting.r2Domain || '' }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="r2DomainShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('s3Configuration') }}</span>
                </div>
                <div class="r2domain">
                  <el-button class="opt-button" size="small" type="primary" @click="addS3Show = true">
                    <Icon icon="fluent:settings-48-regular" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('storageType') }}</span>
                </div>
                <div class="r2domain">
                  <div class="storage-type">
                    <el-tag>{{ setting.storageType }}</el-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card">
            <div class="card-title">{{ $t('emailPush') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('tgBot') }}</span></div>
                <div class="forward">
                  <span>{{ setting.tgBotStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openTgSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('otherEmail') }}</span></div>
                <div class="forward">
                  <span>{{ setting.forwardStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openThirdEmailSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('forwardingRules') }}</span></div>
                <div class="forward">
                  <span>{{ setting.ruleType === 0 ? $t('forwardAll') : $t('rules') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openForwardRules">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Turnstile Verification Card -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('turnstileSetting') }}
              <el-tooltip effect="dark" :content="$t('turnstileCardTooltip')">
                <Icon class="warning" icon="fe:warning" width="18" height="18"/>
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div class="title-item">
                  <span>{{ $t('signUpVerification') }}</span>
                  <el-tooltip effect="dark" :content="$t('signUpVerificationTooltip')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openRegVerifyCount">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.registerVerify"
                      placeholder="Select"
                      class="bot-verify-select"
                  >
                    <el-option key="1" :value="0" :label="$t('enable')"/>
                    <el-option key="1" :value="1" :label="$t('disable')"/>
                    <el-option key="1" :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div class="title-item">
                  <span>{{ $t('addEmailVerification') }}</span>
                  <el-tooltip effect="dark" :content="$t('addEmailVerificationTooltip')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openAddVerifyCount">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.addEmailVerify"
                      placeholder="Select"
                      class="bot-verify-select"
                  >
                    <el-option key="1" :value="0" :label="$t('enable')"/>
                    <el-option key="1" :value="1" :label="$t('disable')"/>
                    <el-option key="1" :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div class="title-item">
                  <span>Site Key</span>
                  <el-tooltip effect="dark" :content="$t('turnstileKeyTooltip')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="bot-verify">
                  <span>{{ setting.siteKey }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div class="title-item">
                  <span>Secret Key</span>
                  <el-tooltip effect="dark" :content="$t('turnstileKeyTooltip')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="bot-verify">
                  <span> {{ setting.secretKey }} </span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card">
            <div class="card-title">{{ $t('noticeTitle') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div>
                  <span>{{ $t('noticePopup') }}</span>
                  <el-tooltip effect="dark" :content="$t('noticePopupDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <span>{{ setting.notice === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openNoticePopupSetting">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('popUp') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openNoticePopup">
                    <Icon icon="mynaui:click-solid" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div class="title-item">
                  <span>{{ $t('welcomeEmail') }}</span>
                  <el-tooltip effect="dark" :content="$t('welcomeEmailTooltip')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="forward">
                  <span>{{ setting.welcomeAutoSend === 1 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" :title="$t('welcomeEmailTitle')" @click="openWelcomeEmailSetting">
                    <Icon icon="hugeicons:quill-write-01" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>


          <div class="settings-card about">
            <div class="card-title">{{ $t('about') }}</div>
            <div class="card-content">
              <div class="concerning-item">
                <span>{{ $t('version') }} :</span>
                <el-badge is-dot :hidden="!hasUpdate">
                  <el-button @click="jump('https://github.com/your-username/epocanvas-mail/releases')">
                    {{ currentVersion }}
                    <template #icon>
                      <Icon icon="qlementine-icons:version-control-16" style="font-size: 20px" color="#1890FF"/>
                    </template>
                  </el-button>
                </el-badge>
              </div>
              <div class="concerning-item">
                <span>{{ $t('community') }} : </span>
                <div class="community">
                  <el-button @click="jump('https://github.com/your-username/epocanvas-mail')">
                    Github
                    <template #icon>
                      <Icon icon="codicon:github-inverted" width="22" height="22"/>
                    </template>
                  </el-button>
                  <el-button @click="jump('https://t.me/cloud_mail_tg')">
                    Telegram
                    <template #icon>
                      <Icon icon="logos:telegram" width="30" height="30"/>
                    </template>
                  </el-button>
                </div>
              </div>
              <div class="concerning-item">
                <span>{{ $t('support') }} : </span>
                <el-button @click="jump('https://doc.skymail.ink/support.html')">
                  {{ t('supportDesc') }}
                  <template #icon>
                    <Icon color="#79D6B5" icon="simple-icons:buymeacoffee" width="20" height="20"/>
                  </template>
                </el-button>
              </div>
              <div class="concerning-item">
                <span>{{ $t('help') }} : </span>
                <el-button @click="jump('https://doc.skymail.ink')">
                  {{ t('document') }}
                  <template #icon>
                    <Icon color="#79D6B5" icon="fluent-color:document-32" width="18" height="18"/>
                  </template>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dialogs remain the same -->
      <el-dialog v-model="editTitleShow" :title="$t('changeTitle')" width="340" @closed="editTitle = setting.title">
        <form>
          <el-input type="text" :placeholder="$t('websiteTitle')" v-model="editTitle"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTitle">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>

      <el-dialog 
        v-model="editAuthI18nShow" 
        :title="$t('authCustomization')" 
        width="860px" 
        top="5vh"
        class="auth-prompt-dialog"
        @open="resetAuthI18nForm"
      >
        <div class="auth-prompt-container">
          <!-- Color Identifier & Scenario Object Step Hierarchy -->
          <div class="step-selection-section">
            <!-- Step 1: Color Identifier -->
            <div class="selection-row">
              <div class="selection-label">
                <span class="step-num">1</span>
                <span>{{ $t('colorCategory') }}</span>
              </div>
              <div class="color-badge-group">
                <div 
                  class="color-badge-item green" 
                  :class="{ active: alertColorTab === 'green' }"
                  @click="onSelectColor('green')"
                >
                  <span class="dot green"></span>
                  <span>{{ $t('greenColorName') }}</span>
                </div>
                <div 
                  class="color-badge-item yellow" 
                  :class="{ active: alertColorTab === 'yellow' }"
                  @click="onSelectColor('yellow')"
                >
                  <span class="dot yellow"></span>
                  <span>{{ $t('yellowColorName') }}</span>
                </div>
                <div 
                  class="color-badge-item red" 
                  :class="{ active: alertColorTab === 'red' }"
                  @click="onSelectColor('red')"
                >
                  <span class="dot red"></span>
                  <span>{{ $t('redColorName') }}</span>
                </div>
              </div>
            </div>

            <!-- Step 2: Target Scenario Object -->
            <div class="selection-row mt-2">
              <div class="selection-label">
                <span class="step-num">2</span>
                <span>{{ $t('targetScenario') }}</span>
              </div>
              <div class="scenario-pill-group">
                <template v-if="alertColorTab === 'green'">
                  <div 
                    class="scenario-pill" 
                    :class="{ active: selectedScenario === 'loginSuccess' }"
                    @click="selectedScenario = 'loginSuccess'"
                  >
                    {{ $t('loginSuccess') }}
                  </div>
                  <div 
                    class="scenario-pill" 
                    :class="{ active: selectedScenario === 'registerSuccess' }"
                    @click="selectedScenario = 'registerSuccess'"
                  >
                    {{ $t('registerSuccess') }}
                  </div>
                </template>

                <template v-if="alertColorTab === 'yellow'">
                  <div 
                    class="scenario-pill" 
                    :class="{ active: selectedScenario === 'invalidCredentials' }"
                    @click="selectedScenario = 'invalidCredentials'"
                  >
                    {{ $t('invalidCredentials') }}
                  </div>
                  <div 
                    class="scenario-pill" 
                    :class="{ active: selectedScenario === 'passwordMismatch' }"
                    @click="selectedScenario = 'passwordMismatch'"
                  >
                    {{ $t('passwordMismatch') }}
                  </div>
                  <div 
                    class="scenario-pill" 
                    :class="{ active: selectedScenario === 'noLandingNodes' }"
                    @click="selectedScenario = 'noLandingNodes'"
                  >
                    {{ $t('noLandingNodes') }}
                  </div>
                </template>

                <template v-if="alertColorTab === 'red'">
                  <div 
                    class="scenario-pill" 
                    :class="{ active: selectedScenario === 'noNewNodes' }"
                    @click="selectedScenario = 'noNewNodes'"
                  >
                    {{ $t('noNewNodes') }}
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Position & Duration Parameter Row -->
          <div class="prompt-param-row">
            <el-select v-model="authI18nForm[currentEditingLang].alertPosition">
              <template #prefix>
                <span style="margin-right: 8px">{{ $t('alertPosition') }}</span>
              </template>
              <el-option key="top-right" :label="t('topRight')" value="top-right"/>
              <el-option key="top-left" :label="t('topLeft')" value="top-left"/>
              <el-option key="bottom-right" :label="t('bottomRight')" value="bottom-right"/>
              <el-option key="bottom-left" :label="t('bottomLeft')" value="bottom-left"/>
            </el-select>

            <el-input-number v-model="authI18nForm[currentEditingLang].alertOffset" :min="10" :max="200">
              <template #prefix>
                {{ $t('alertOffset') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>

            <el-input-number v-model="authI18nForm[currentEditingLang].alertDuration" :min="1000" :max="20000" :step="500">
              <template #prefix>
                {{ $t('alertDuration') }}
              </template>
              <template #suffix>
                ms
              </template>
            </el-input-number>
          </div>

          <!-- Prompt Text Input -->
          <div class="prompt-input-row">
            <div class="field-label-wrap">
              <span class="field-label-text">{{ $t('promptContent') }}</span>
            </div>
            <el-input 
              v-model="authI18nForm[currentEditingLang][selectedScenario]" 
              :placeholder="getScenarioPlaceholder()"
              clearable
            />
          </div>

          <!-- Large Atmosphere & Toast Preview Stage (Auto Dark/Light matching uiStore.dark) -->
          <div class="prompt-preview-container">
            <div class="preview-toolbar">
              <div class="preview-title">
                <Icon icon="solar:eye-bold-duotone" width="16" />
                <span>{{ $t('previewEffect') }}</span>
              </div>
            </div>

            <!-- Atmosphere Stage Box -->
            <div class="prompt-atmosphere-stage" :class="uiStore.dark ? 'dark' : 'light'">
              <!-- Green Mode Preview -->
              <div v-if="alertColorTab === 'green'" class="atmosphere-canvas green-mode">
                <div class="preview-toast-item toast-green" :style="getPreviewToastStyle()">
                  <Icon icon="lucide:check" width="18" />
                  <span>{{ getPreviewToastText() }}</span>
                </div>
              </div>

              <!-- Yellow Mode Preview -->
              <div v-if="alertColorTab === 'yellow'" class="atmosphere-canvas yellow-mode">
                <div class="hud-corner-bracket top-left"></div>
                <div class="hud-corner-bracket top-right"></div>
                <div class="hud-corner-bracket bottom-left"></div>
                <div class="hud-corner-bracket bottom-right"></div>
                <div class="preview-toast-item toast-yellow" :style="getPreviewToastStyle()">
                  <Icon icon="lucide:alert-circle" width="18" />
                  <span>{{ getPreviewToastText() }}</span>
                </div>
              </div>

              <!-- Red Mode Preview -->
              <div v-if="alertColorTab === 'red'" class="atmosphere-canvas red-mode">
                <div class="hazard-stripe-bar top"></div>
                <div class="hazard-stripe-bar bottom"></div>
                <div class="hud-corner-bracket red top-left"></div>
                <div class="hud-corner-bracket red top-right"></div>
                <div class="hud-corner-bracket red bottom-left"></div>
                <div class="hud-corner-bracket red bottom-right"></div>
                <div class="center-warning-banner">W A R N I N G</div>
                <div class="preview-toast-item toast-red" :style="getPreviewToastStyle()">
                  <Icon icon="lucide:alert-triangle" width="18" />
                  <span>{{ getPreviewToastText() }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="dialog-footer-split">
            <div class="footer-left">
              <el-tooltip :content="$t('syncToOtherLangTooltip')" placement="top">
                <el-button size="small" type="primary" plain @click="syncCurrentLangToOther">
                  <Icon icon="fluent:arrow-sync-20-regular" width="14" class="mr-1" />
                  {{ $t('syncToOtherLang') }}
                </el-button>
              </el-tooltip>
            </div>
            <div class="footer-right">
              <el-button @click="editAuthI18nShow = false">{{ $t('cancel') }}</el-button>
              <el-button type="primary" :loading="settingLoading" @click="saveAuthI18n">{{ $t('save') }}</el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="r2DomainShow" :title="$t('addOsDomain')" width="340"
                 @closed="r2DomainInput = setting.r2Domain">
        <form>
          <el-input type="text" :placeholder="$t('domainDesc')" v-model="r2DomainInput"/>
          <el-button type="primary" :loading="settingLoading" @click="saveR2domain">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="turnstileShow" :title="$t('addTurnstileSecret')" width="340"
                 @closed="turnstileForm.secretKey = '';turnstileForm.siteKey = ''">
        <form>
          <el-input type="text" placeholder="Site Key" v-model="turnstileForm.siteKey"/>
          <el-input type="text" style="margin-top: 15px" placeholder="Secret Key" v-model="turnstileForm.secretKey"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTurnstileKey">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog
          v-model="showSetBackground"
          class="cut-dialog"
          @closed="closedSetBackground"
      >
        <template #header>
          <span style="font-size: 18px">
            {{ $t('backgroundTitle') }}
            <el-tooltip>
              <template #content>
                <span>{{ $t('backgroundWarning') }}</span>
              </template>
              <Icon class="title-icon  warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </span>
        </template>
        <el-input :placeholder="$t('backgroundUrlDesc')" v-model="backgroundUrl" v-if="!localUpShow"
                  class="background-url"/>
        <el-image
            v-if="localUpShow"
            :preview-src-list="[backgroundImage]"
            show-progress
            class="cropper"
            fit="cover"
            :src="backgroundImage"
        ></el-image>
        <div class="cut-button">
          <el-button type="primary" link @click="openCut" v-if="!localUpShow">
            {{ $t('localUpload') }}
          </el-button>
          <el-button type="primary" link @click="localUpShow = false" v-if="localUpShow">
            {{ $t('imageLink') }}
          </el-button>
          <el-button type="primary" :loading="settingLoading" @click="saveBackground">{{ $t('save') }}</el-button>
        </div>
      </el-dialog>
      <el-dialog
          v-model="tgSettingShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('tgBot') }}</span>
            <el-tooltip effect="dark" :content="$t('tgBotDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input :placeholder="setting.tgBotToken || $t('tgBotToken')" v-model="tgBotToken"></el-input>
          <el-input-tag tag-type="warning" :placeholder="$t('toBotTokenDesc')" v-model="tgChatId"
                        @add-tag="addChatTag"></el-input-tag>
          <el-input tag-type="warning" :placeholder="$t('customDomainDesc')" v-model="customDomain" ></el-input>
          <div class="tg-msg-label">
            <span>{{t('from')}}</span>
            <el-select  v-model="tgMsgFrom" >
              <el-option
                  v-for="item in tgMsgFromOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('recipient')}}</span>
            <el-select  v-model="tgMsgTo" >
              <el-option
                  v-for="item in tgMsgToOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('emailText')}}</span>
            <el-select  v-model="tgMsgText" >
              <el-option
                  v-for="item in tgMsgTextOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="tgBotStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="tgBotSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="thirdEmailShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('otherEmail') }}</span>
            <el-tooltip effect="dark" :content="$t('otherEmailDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag tag-type="warning" :placeholder="$t('otherEmailInputDesc')" v-model="forwardEmail"
                        @add-tag="emailAddTag"></el-input-tag>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="forwardStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="forwardEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="forwardRulesShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('forwardingRules') }}</span>
            <el-tooltip effect="dark" :content="$t('forwardingRulesDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag :placeholder="$t('ruleEmailsInputDesc')" tag-type="success" v-model="ruleEmail"
                        @add-tag="ruleEmailAddTag"/>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-radio-group v-model="ruleType">
              <el-radio :value="0">{{ $t('forwardAll') }}</el-radio>
              <el-radio :value="1">{{ $t('rules') }}</el-radio>
            </el-radio-group>
            <el-button :loading="settingLoading" type="primary" @click="ruleEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>

      <!-- 注册验证规则 Unified Drawer -->
      <el-drawer
          v-model="regVerifyCountShow"
          :title="`${$t('signUpVerification')} · ${$t('rulesVerify')}`"
          direction="rtl"
          size="450px"
          @closed="regVerifyCount = setting.regVerifyCount"
          class="unified-drawer"
      >
        <div class="drawer-content">
          <div class="drawer-desc">
            <div class="desc-title">{{ $t('signUpVerification') }}频次阈值规则</div>
            <div class="desc-body">
              当单一客户端 IP 每日尝试注册账号的次数达到设定阈值后，系统将自动要求进行 Cloudflare Turnstile 人机验证，以防范脚本批量扫号与恶意注册。
            </div>
            <div class="desc-rule">
              <strong>规则说明：</strong>在面板下拉菜单中选择【规则】时此阈值生效。选择【启用】为每次注册均强制人机验证，选择【关闭】为不验证。
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--el-text-color-primary);">
              单 IP 每日注册触发阈值
            </div>
            <el-input-number v-model="regVerifyCount" :min="1" :max="9999" style="width: 100%;">
              <template #suffix>
                <span>{{ $t('timesPerDay') }}</span>
              </template>
            </el-input-number>
          </div>

          <div class="drawer-actions">
            <el-button @click="regVerifyCountShow = false" size="small">{{ $t('cancel') }}</el-button>
            <el-button type="primary" @click="saveRegVerifyCount" size="small" :loading="settingLoading">{{ $t('save') }}</el-button>
          </div>
        </div>
      </el-drawer>

      <!-- 添加验证规则 Unified Drawer -->
      <el-drawer
          v-model="addVerifyCountShow"
          :title="`${$t('addEmailVerification')} · ${$t('rulesVerify')}`"
          direction="rtl"
          size="450px"
          @closed="addVerifyCount = setting.addVerifyCount"
          class="unified-drawer"
      >
        <div class="drawer-content">
          <div class="drawer-desc">
            <div class="desc-title">{{ $t('addEmailVerification') }}频次阈值规则</div>
            <div class="desc-body">
              当单一客户端 IP 每日添加邮箱别名/子邮箱的次数达到设定阈值后，系统将自动要求进行 Cloudflare Turnstile 人机验证，以防范自动化高频批量生成邮箱。
            </div>
            <div class="desc-rule">
              <strong>规则说明：</strong>在面板下拉菜单中选择【规则】时此阈值生效。选择【启用】为每次添加均强制验证，选择【关闭】为不验证。
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--el-text-color-primary);">
              单 IP 每日添加邮箱触发阈值
            </div>
            <el-input-number v-model="addVerifyCount" :min="1" :max="9999" style="width: 100%;">
              <template #suffix>
                <span>{{ $t('timesPerDay') }}</span>
              </template>
            </el-input-number>
          </div>

          <div class="drawer-actions">
            <el-button @click="addVerifyCountShow = false" size="small">{{ $t('cancel') }}</el-button>
            <el-button type="primary" @click="saveAddVerifyCount" size="small" :loading="settingLoading">{{ $t('save') }}</el-button>
          </div>
        </div>
      </el-drawer>
      <el-dialog top="5vh" v-model="noticePopupShow" :title="$t('noticePopup')" class="notice-popup"
                 @closed="resetNoticeForm">
        <form>
          <el-input v-model="noticeForm.noticeTitle" :placeholder="t('titleDesc')"/>
          <div class="notice-line-item">
            <el-select v-model="noticeForm.noticeType">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('icon') }}</span>
              </template>
              <el-option key="none" label="None" value="none"/>
              <el-option key="primary" label="Primary" value="primary"/>
              <el-option key="success" label="Success" value="success"/>
              <el-option key="warning" label="Warning" value="warning"/>
              <el-option key="info" label="Info" value="info"/>
            </el-select>
            <el-select v-model="noticeForm.noticePosition">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('position') }}</span>
              </template>
              <el-option key="top-left" :label="t('topLeft')" value="top-left"/>
              <el-option key="top-right" :label="t('topRight')" value="top-right"/>
              <el-option key="bottom-left" :label="t('bottomLeft')" value="bottom-left"/>
              <el-option key="bottom-right" :label="t('bottomRight')" value="bottom-right"/>
            </el-select>
            <el-input-number v-model="noticeForm.noticeWidth">
              <template #prefix>
                {{ $t('width') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeOffset">
              <template #prefix>
                {{ $t('offset') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeDuration">
              <template #prefix>
                {{ $t('duration') }}
              </template>
              <template #suffix>
                ms
              </template>
            </el-input-number>
          </div>
          <div class="notice-popup-item">
            <el-input
                v-model="noticeForm.noticeContent"
                :autosize="{ minRows: 15, maxRows: 25 }"
                type="textarea"
                :placeholder="t('noticeContentDesc')"
            />
          </div>
        </form>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="noticeForm.notice" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <div>
              <el-button @click="previewNoticePopup">
                {{ $t('preview') }}
              </el-button>
              <el-button :loading="settingLoading" type="primary" @click="saveNoticePopup">
                {{ $t('save') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>

      <!-- Welcome Email Compose & Broadcast Dialog (Refactored System Architecture) -->
      <el-dialog
        top="3vh"
        width="980px"
        v-model="welcomeEmailShow"
        class="welcome-write-dialog"
        :close-on-click-modal="false"
        :show-close="false"
        @closed="closeWelcomeDialog"
      >
        <template #header>
          <div class="write-dialog-top">
            <!-- Left Group: Title & Official Sender Identity -->
            <div class="top-left">
              <div class="quill-badge">
                <Icon icon="hugeicons:quill-write-01" width="18" height="18" />
              </div>
              <span class="dialog-main-title">{{ $t('welcomeEmailTitle') }}</span>
              <div class="sender-identity-chip">
                <Icon icon="ri:verified-badge-fill" width="15" height="15" class="verified-icon" />
                <span class="sender-name">Epocanvas 官方团队</span>
                <span class="sender-email">&lt;admin@epocanvas.com&gt;</span>
              </div>
            </div>

            <!-- Middle Elastic Spacer -->
            <div class="top-spacer"></div>

            <!-- Right Group: Mode Switcher + Action Icon Buttons + Close -->
            <div class="top-right">
              <!-- Mode switcher capsule (Icon + Label) -->
              <div class="view-switch-capsule">
                <el-tooltip :content="$t('editMode')" effect="dark" placement="bottom">
                  <div
                    class="capsule-btn"
                    :class="{ active: !isWelcomePreview }"
                    @click="switchWelcomeView(false)"
                  >
                    <Icon icon="hugeicons:quill-write-01" width="15" height="15" />
                    <span>{{ $t('editMode') }}</span>
                  </div>
                </el-tooltip>
                <el-tooltip :content="$t('previewMode')" effect="dark" placement="bottom">
                  <div
                    class="capsule-btn"
                    :class="{ active: isWelcomePreview }"
                    @click="switchWelcomeView(true)"
                  >
                    <Icon icon="fluent:eye-24-regular" width="15" height="15" />
                    <span>{{ $t('previewMode') }}</span>
                  </div>
                </el-tooltip>
              </div>

              <!-- Quick action icon buttons (18-20px icons, 8px gap, 4px hover block) -->
              <div class="header-action-group">
                <template v-if="!isWelcomePreview">
                  <el-tooltip :content="welcomeEditorFormat === 'rich' ? $t('markdownSourceMode') : $t('richTextMode')" effect="dark" placement="bottom">
                    <div class="tool-icon-btn" @click="toggleEditorFormat">
                      <Icon :icon="welcomeEditorFormat === 'rich' ? 'fluent:code-24-regular' : 'fluent:text-grammar-settings-20-regular'" width="18" height="18" />
                    </div>
                  </el-tooltip>
                  <el-tooltip :content="$t('clearFormat')" effect="dark" placement="bottom">
                    <div class="tool-icon-btn" @click="clearWelcomeContent">
                      <Icon icon="icon-park-outline:clear-format" width="18" height="18" />
                    </div>
                  </el-tooltip>
                  <el-tooltip :content="$t('welcomeResetTemplate')" effect="dark" placement="bottom">
                    <div class="tool-icon-btn" @click="resetToDefaultWelcomeTemplate">
                      <Icon icon="fluent:arrow-reset-24-regular" width="18" height="18" />
                    </div>
                  </el-tooltip>
                </template>

                <template v-else>
                  <el-tooltip :content="previewDark ? $t('previewLightMode') : $t('previewDarkMode')" effect="dark" placement="bottom">
                    <div class="tool-icon-btn theme-toggle" @click="previewDark = !previewDark">
                      <Icon :icon="previewDark ? 'fluent:weather-sunny-24-regular' : 'fluent:weather-moon-24-regular'" width="18" height="18" />
                    </div>
                  </el-tooltip>
                  <el-tooltip :content="$t('welcomeResetTemplate')" effect="dark" placement="bottom">
                    <div class="tool-icon-btn" @click="resetToDefaultWelcomeTemplate">
                      <Icon icon="fluent:arrow-reset-24-regular" width="18" height="18" />
                    </div>
                  </el-tooltip>
                </template>

                <div class="close-icon-btn" @click="welcomeEmailShow = false">
                  <Icon icon="material-symbols-light:close-rounded" width="20" height="20" />
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="welcome-write-body">
          <!-- VIEW 1: 直接写邮件界面 -->
          <div v-show="!isWelcomePreview" class="write-flow-view">
            <!-- 2. Dual-Card Group: Audience Target vs Email Attributes -->
            <div class="meta-cards-row">
              <!-- Group 1: 发送对象 -->
              <div class="meta-group-card">
                <div class="group-header">
                  <Icon icon="solar:users-group-rounded-bold" width="15" height="15" />
                  <span>{{ $t('audienceTarget') }}</span>
                </div>
                <div class="group-content">
                  <div class="audience-chip">
                    <Icon icon="solar:user-check-rounded-bold" width="14" height="14" />
                    <span>{{ $t('welcomeAllUsers') }}</span>
                  </div>
                </div>
              </div>

              <!-- Group 2: 邮件属性 -->
              <div class="meta-group-card">
                <div class="group-header">
                  <Icon icon="fluent:tag-20-filled" width="15" height="15" />
                  <span>{{ $t('mailAttributes') }}</span>
                </div>
                <div class="group-content attributes-row">
                  <div class="attr-chip official">
                    <Icon icon="ri:verified-badge-fill" width="13" height="13" />
                    <span>{{ $t('officialVerified') }}</span>
                  </div>
                  <div class="attr-chip star">
                    <Icon icon="fluent-color:star-16" width="13" height="13" />
                    <span>⭐ 重要</span>
                  </div>
                  <div class="attr-chip todo">
                    <Icon icon="ic:outline-access-time" width="13" height="13" />
                    <span>⏰ 代办</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Subject Input Line -->
            <div class="compose-subject-bar">
              <el-input
                v-model="welcomeEmailForm.welcomeSubject"
                size="default"
                :placeholder="$t('welcomeSubject')"
                class="write-subject-input"
              >
                <template #prefix>
                  <Icon icon="fluent:text-bullet-list-square-sparkle-24-regular" width="18" height="18" style="color: #64748b;" />
                </template>
              </el-input>
            </div>

            <!-- Spacious Editor Area -->
            <div class="compose-editor-area">
              <template v-if="welcomeEditorFormat === 'rich'">
                <tinyEditor
                  editor-id="welcome-sys-editor"
                  :def-value="welcomeEmailForm.welcomeContent"
                  ref="welcomeEditorRef"
                  @change="onWelcomeContentChange"
                  class="custom-tiny-editor"
                />
              </template>
              <template v-else>
                <div class="source-editor-wrapper">
                  <el-input
                    type="textarea"
                    v-model="welcomeEmailForm.welcomeContent"
                    :rows="18"
                    placeholder="<!-- HTML / Markdown 正文源码 -->"
                    class="source-textarea"
                  />
                </div>
              </template>
            </div>

            <!-- 6. Dedicated Auxiliary Configuration Card -->
            <div class="auxiliary-config-card">
              <div class="config-card-header">
                <Icon icon="fluent:bot-24-regular" width="16" height="16" />
                <span>{{ $t('systemAutomationRules') }}</span>
              </div>
              <div class="config-card-body">
                <div class="config-item">
                  <span class="config-label">{{ $t('welcomeExpireDays') }}:</span>
                  <el-select v-model="welcomeEmailForm.welcomeExpireDays" size="small" style="width: 180px;">
                    <el-option :value="7" :label="$t('welcomeExpire7Days')" />
                    <el-option :value="14" :label="$t('welcomeExpire14Days')" />
                    <el-option :value="30" :label="$t('welcomeExpire30Days')" />
                    <el-option :value="90" :label="$t('welcomeExpire90Days')" />
                    <el-option :value="0" :label="$t('welcomeExpireNever')" />
                  </el-select>
                </div>

                <div class="config-item">
                  <span class="config-label">{{ $t('welcomeAutoSend') }}:</span>
                  <el-switch v-model="welcomeEmailForm.welcomeAutoSend" :active-value="1" :inactive-value="0" size="small" />
                  <el-tooltip effect="dark" :content="$t('welcomeAutoSendDesc')" placement="top">
                    <Icon class="warning" icon="fe:warning" width="16" height="16" style="margin-left: 4px; cursor: pointer;"/>
                  </el-tooltip>
                </div>

                <div class="config-item storage-tag-item">
                  <div class="storage-pill">
                    <Icon icon="fluent:database-link-20-regular" width="14" height="14" />
                    <span>单实例集中存储（仅占用 1 份正文空间）</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- VIEW 2: 预览新建实际情况的模式 (根据用户明/暗色调) -->
          <div v-if="isWelcomePreview" class="preview-flow-view" :class="{ 'dark-theme-preview': previewDark, 'light-theme-preview': !previewDark }">
            <div class="real-inbox-mock">
              <!-- Mock Email Detail Header -->
              <div class="mock-email-head">
                <div class="mock-head-main">
                  <el-avatar :size="44" class="mock-avatar-official">
                    <Icon icon="ri:verified-badge-fill" width="24" height="24" />
                  </el-avatar>
                  <div class="mock-meta-col">
                    <div class="mock-meta-line-1">
                      <span class="mock-sender-name">Epocanvas 官方团队</span>
                      <Icon icon="ri:verified-badge-fill" width="16" height="16" style="color: #0284c7;" />
                      <el-tag size="small" type="primary" effect="dark" class="mock-pill-official">{{ $t('officialTag') }}</el-tag>
                      <el-tag size="small" type="warning" effect="dark" class="mock-pill-star">⭐ 重要</el-tag>
                      <el-tag size="small" type="info" effect="dark" class="mock-pill-todo">⏰ 代办</el-tag>
                    </div>
                    <div class="mock-meta-line-2">
                      <span class="mock-sender-email">&lt;admin@epocanvas.com&gt;</span>
                      <span class="mock-to-email">至: 尊敬的用户 &lt;user@epocanvas.com&gt;</span>
                    </div>
                  </div>
                </div>
                <div class="mock-head-date">
                  <span>{{ formatDetailDate(new Date().toISOString()) }}</span>
                </div>
              </div>

              <!-- Mock Official Banner -->
              <div class="mock-official-banner">
                <div class="banner-left">
                  <Icon icon="ri:verified-badge-fill" width="20" height="20" style="color: #0284c7; flex-shrink: 0;" />
                  <div class="banner-text">
                    <div class="banner-heading">
                      <span>{{ $t('officialBannerTitle') }}</span>
                      <el-tag size="small" type="primary" effect="dark" class="official-mini-tag">{{ $t('officialTag') }}</el-tag>
                    </div>
                    <div class="banner-subtitle">{{ $t('officialBannerDesc') }}</div>
                  </div>
                </div>
                <div class="banner-right" v-if="welcomeEmailForm.welcomeExpireDays > 0">
                  <el-tag size="small" type="info" effect="plain" class="expire-pill">
                    <Icon icon="ic:outline-access-time" width="13" height="13" style="margin-right: 3px;" />
                    {{ $t('officialExpireNotice', { days: welcomeEmailForm.welcomeExpireDays }) }}
                  </el-tag>
                </div>
              </div>

              <!-- Sandboxed Email Render with ample padding -->
              <div class="mock-email-content-box">
                <el-scrollbar style="max-height: 420px; padding: 14px 18px;">
                  <ShadowHtml :html="welcomeEmailForm.welcomeContent" />
                </el-scrollbar>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <!-- 5. Redesigned Actions with Strong Visual Hierarchy & Separation -->
          <div class="welcome-write-footer">
            <div class="footer-left">
              <span class="broadcast-hint" v-if="setting.welcomeLastBroadcast">
                {{ $t('welcomeRecentBroadcast') }}: {{ formatDetailDate(setting.welcomeLastBroadcast) }}
              </span>
            </div>
            <div class="footer-right">
              <!-- Secondary Button: 保存模板配置 (Outline / Ghost / Low Saturation) -->
              <el-tooltip :content="$t('welcomeSaveConfig')" effect="dark" placement="top">
                <el-button
                  :loading="savingWelcome"
                  @click="saveWelcomeTemplate"
                  class="btn-save-secondary"
                >
                  <Icon icon="fluent:save-24-regular" width="16" height="16" style="margin-right: 6px;" />
                  {{ $t('welcomeSaveConfig') }}
                </el-button>
              </el-tooltip>

              <!-- Primary High-Risk Button: 发送全员欢迎邮件 (Strong Emphasis / Danger Confirmation) -->
              <el-tooltip :content="$t('welcomeBroadcastBtn')" effect="dark" placement="top">
                <el-button
                  type="primary"
                  :loading="sendingWelcome"
                  @click="confirmBroadcastWelcome"
                  class="btn-broadcast-primary"
                >
                  <Icon icon="fluent:send-24-filled" width="17" height="17" style="margin-right: 6px;" />
                  {{ $t('welcomeBroadcastBtn') }}
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </template>
      </el-dialog>

      <el-dialog v-model="addS3Show" :title="t('s3Configuration')" width="340" @closed="resetAddS3Form">
        <form>
          <el-input class="dialog-input" type="text" placeholder="Bucket" v-model="s3.bucket"/>
          <el-input class="dialog-input" type="text" placeholder="Endpoint" v-model="s3.endpoint"/>
          <el-input class="dialog-input" type="text" placeholder="Region" v-model="s3.region"/>
          <el-input class="dialog-input" type="text" :placeholder="setting.s3AccessKey || 'Access Key'"
                    v-model="s3.s3AccessKey"/>
          <el-input style="margin-bottom: 10px" type="text" :placeholder="setting.s3SecretKey || 'Secret Key'" v-model="s3.s3SecretKey"/>
          <div class="force-path-style">
            <div class="force-path-style-left">
              <span>ForcePathStyle</span>
              <el-tooltip effect="dark" :content="$t('forcePathStyleDesc')">
                <Icon class="warning" icon="fe:warning" width="18" height="18"/>
              </el-tooltip>
            </div>
            <el-switch :before-change="beforeChange" :active-value="0" :inactive-value="1"
                       v-model="s3.forcePathStyle"/>
          </div>
          <div class="s3-button">
            <el-button :loading="clearS3Loading" @click="clearS3">{{ t('clear') }}</el-button>
            <el-button type="primary" :loading="settingLoading && !clearS3Loading" @click="saveS3">{{ t('save') }}</el-button>
          </div>
        </form>
      </el-dialog>
      <!-- 邮箱前缀规则 Unified Drawer -->
      <el-drawer
          v-model="emailPrefixShow"
          :title="$t('emailPrefix')"
          direction="rtl"
          size="450px"
          @closed="resetEmailPrefix"
          class="unified-drawer"
      >
        <div class="drawer-content">
          <div class="drawer-desc">
            <div class="desc-title">{{ $t('emailPrefix') }}规则设置</div>
            <div class="desc-body">
              限制用户注册或添加邮箱时的前缀最小字符位数，并过滤禁止使用的敏感或保留关键词。
            </div>
            <div class="desc-rule">
              <strong>规则简述：</strong>支持限定字符最小长度；在下方输入禁止前缀词并按回车添加（支持逗号或空格批量粘贴），系统将自动去重排重。
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--el-text-color-primary);">
              {{ $t('emailPrefixMinLength') }}
            </div>
            <el-input-number v-model="minEmailPrefix" :min="1" :max="30" style="width: 100%;">
              <template #suffix>
                <span>{{ $t('character') }}</span>
              </template>
            </el-input-number>
          </div>

          <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--el-text-color-primary); display: flex; justify-content: space-between; align-items: center;">
            <span>{{ $t('emailPrefixProhibited') }} ({{ (emailPrefixFilter || []).length }})</span>
            <div class="drawer-actions" style="margin-bottom: 0;">
              <el-button @click="emailPrefixFilter = []" size="small">{{ $t('clear') }}</el-button>
              <el-button type="primary" @click="saveEmailPrefix" size="small" :loading="settingLoading">{{ $t('save') }}</el-button>
            </div>
          </div>

          <el-input-tag
              tag-type="danger"
              v-model="emailPrefixFilter"
              :placeholder="$t('mustNotContainDesc')"
              class="drawer-tag-input"
              @add-tag="emailPrefixAddTag"
          />
        </div>
      </el-drawer>
      <el-dialog v-model="blackFormShow" class="forward-dialog" @closed="resetBlackList">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('blackList') }}</span>
            <el-tooltip effect="dark" :content="$t('blackListDesc')">
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('blackFromDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackFrom" @add-tag="banEmailAddTag"  />
          </el-form-item>
          <el-form-item :label="t('blackSubjectDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackSubject"/>
          </el-form-item>
          <el-form-item :label="t('blackContentDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackContent"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveBlackList">{{ $t('save') }}</el-button>
      </el-dialog>

    </el-scrollbar>
  </div>
</template>

<script setup>
import {computed, defineOptions, nextTick, reactive, ref} from "vue";
import {deleteBackground, setBackground, setBlackList, settingQuery, settingSet, sendWelcomeEmail} from "@/request/setting.js";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useAccountStore} from "@/store/account.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {storeToRefs} from "pinia";
import {debounce} from 'lodash-es'
import {isDomain, isEmail} from "@/utils/verify-utils.js";
import loading from "@/components/loading/index.vue";
import tinyEditor from "@/components/tiny-editor/index.vue";
import ShadowHtml from "@/components/shadow-html/index.vue";
import {getTextWidth} from "@/utils/text.js";
import {fileToBase64} from "@/utils/file-utils.js";
import {formatDetailDate} from "@/utils/day.js";
import {useI18n} from 'vue-i18n';
import {ElMessageBox, ElMessage} from "element-plus";
import axios from "axios";

defineOptions({
  name: 'sys-setting'
})

const currentVersion = 'v3.0.0'
const hasUpdate = ref(false)
let getUpdateErrorCount = 1;
const {t, locale} = useI18n();
const firstLoading = ref(true)
const settingReady = ref(false)
const backgroundImage = ref('')
const localUpShow = ref(false)
const accountStore = useAccountStore();
const userStore = useUserStore();
const editTitleShow = ref(false)
const editAuthI18nShow = ref(false)
const alertColorTab = ref('green')
const selectedScenario = ref('loginSuccess')
const currentEditingLang = ref('zh')

const createDefaultAuthLangObj = () => ({
  loginSuccess: '',
  registerSuccess: '',
  invalidCredentials: '',
  passwordMismatch: '',
  noLandingNodes: '',
  noNewNodes: '',
  alertPosition: 'top-right',
  alertOffset: 40,
  alertDuration: 4000
})

const authI18nForm = reactive({
  zh: createDefaultAuthLangObj(),
  en: createDefaultAuthLangObj()
})
const resendTokenFormShow = ref(false)
const blackFormShow = ref(false)
const aiCodeFilterShow = ref(false)
const r2DomainShow = ref(false)
const turnstileShow = ref(false)
const tgSettingShow = ref(false)
const noticePopupShow = ref(false)
const thirdEmailShow = ref(false)
const forwardRulesShow = ref(false)
const emailPrefixShow = ref(false)
const showResendList = ref(false)
const settingStore = useSettingStore();
const uiStore = useUiStore();
const {settings: setting} = storeToRefs(settingStore);
const activeUiTab = ref('dynamic')
const editTitle = ref('')
const settingLoading = ref(false)
const clearS3Loading = ref(false)
const r2DomainInput = ref('')
const loginOpacity = ref(0)
const minEmailPrefix = ref(0)
const emailPrefixFilter = ref([])
const backgroundUrl = ref('')
let backgroundFile = {}
const showSetBackground = ref(false)
let regVerifyCount = ref(1)
let addVerifyCount = ref(1)
let backup = '{}'
const addS3Show = ref(false)
const addVerifyCountShow = ref(false)
const regVerifyCountShow = ref(false)
const resendTokenForm = reactive({
  domain: '',
  token: '',
})
const turnstileForm = reactive({
  siteKey: '',
  secretKey: ''
})

const s3 = reactive({
  bucket: '',
  endpoint: '',
  region: '',
  s3AccessKey: '',
  s3SecretKey: '',
  forcePathStyle: 1
})

const noticeForm = reactive({
  noticeTitle: '',
  noticeContent: '',
  noticeType: '',
  noticeDuration: '',
  noticePosition: '',
  noticeOffset: 0,
  notice: 0,
  noticeWidth: 0
})

const DEFAULT_WELCOME_SUBJECT = '🎉 欢迎加入 Epocanvas Mail - 开启您的私密、高效云端邮件体验'
const DEFAULT_WELCOME_CONTENT = `<div style="max-width: 640px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">
  <div style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%); padding: 36px 32px 30px; text-align: left; position: relative;">
    <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.18); padding: 4px 12px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 16px; backdrop-filter: blur(8px);">
      <span>✨ 官方系统引导</span>
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.02em;">欢迎加入 Epocanvas Mail</h1>
    <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">您的私密、纯净且极速的全球云端邮件工作中心已就绪。</p>
  </div>
  <div style="padding: 32px 32px 24px;">
    <p style="font-size: 15px; color: #334155; margin-top: 0;">尊敬的用户，您好：</p>
    <p style="font-size: 14px; color: #475569; line-height: 1.7;">很高兴与您相遇！Epocanvas Mail 致力于为您提供安全自主、零广告干扰且具备极致生产力的全新邮件交互体验。为了帮助您快速上手，我们为您准备了以下核心特性与快速指引：</p>
    <div style="margin: 24px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">🔒</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">端到端隐私保护</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">全方位的防跟踪与垃圾邮件拦截，守护每一封往来信件的安全。</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">⚡</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">稍后处理与代办流</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">支持随时推迟邮件至代办，让收件箱重归清爽，聚焦核心要务。</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">⭐</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">星标重要与极速检索</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">一键归档高优先级信件，毫秒级关键字与语法检索，触手可及。</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">🌐</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">多域别名无缝流转</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">自由收发多域名前缀，随时切换发送身份，打造多重工作场景。</div>
      </div>
    </div>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px; margin: 20px 0;">
      <div style="font-weight: 600; font-size: 14px; color: #1e40af; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
        <span>🚀 3 步开启高效邮件之旅</span>
      </div>
      <div style="font-size: 13px; color: #1e3a8a; line-height: 1.8;">
        <div><strong>1. 体验代办分类：</strong> 本邮件已自动放入您的【稍后处理 / 代办】与【星标 / 重要】中，体验快捷归档。</div>
        <div><strong>2. 探索个性化外观：</strong> 前往「系统设置」体验星空动态 UI、登录背景自定义与多语言自由切换。</div>
        <div><strong>3. 开启首封信件：</strong> 点击顶栏「写邮件」，即刻体验极速富文本撰写与全球极速投递。</div>
      </div>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #94a3b8; line-height: 1.6;">
      <div>📌 <strong>温馨提示：</strong> 此邮件由系统官方自动发送（admin@epocanvas.com）。站长设定了自动清理周期，到期后将自动从您的邮箱中安全移除，无需手动清理。</div>
      <div style="margin-top: 8px;">Epocanvas Mail 官方团队 · 敬上</div>
    </div>
  </div>
</div>`

const welcomeEmailShow = ref(false)
const isWelcomePreview = ref(false)
const welcomeEditorRef = ref(null)
const welcomeEditorFormat = ref('rich') // 'rich' | 'source'
const previewDark = ref(true)
const sendingWelcome = ref(false)
const savingWelcome = ref(false)
const welcomeEmailForm = reactive({
  welcomeSubject: '',
  welcomeContent: '',
  welcomeText: '',
  welcomeExpireDays: 7,
  welcomeAutoSend: 1
})

const regKeyOptions = computed(() => [
  {label: t('enable'), value: 0},
  {label: t('disable'), value: 1},
  {label: t('optional'), value: 2},
])

const blackListForm = ref({
  blackSubject: [],
  blackContent: [],
  blackFrom: []
})
const aiCodeFilter = ref([])

const authRefreshOptions = computed(() => [
  {label: t('disable'), value: 0},
  {label: '3s', value: 3},
  {label: '5s', value: 5},
  {label: '10s', value: 10},
  {label: '15s', value: 15},
  {label: '20s', value: 20},
])

const tgChatId = ref([])
const customDomain = ref('')
const tgBotStatus = ref(0)
const tgBotToken = ref('')
const forwardEmail = ref([])
const forwardStatus = ref(0)
const emailColumnWidth = ref(0)
const tokenColumnWidth = ref(0)
const ruleType = ref(0)
const ruleEmail = ref([])
const tgMsgFrom = ref('')
const tgMsgTo = ref('')
const tgMsgText = ref('')

const tgMsgFromOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}, {label: t('onlyName'), value:'only-name'}]
const tgMsgToOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgTextOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgLabelWidth = computed(() => locale.value === 'en' ? '120px' : '100px');

getSettings()
getUpdate()

function getSettings() {
  settingReady.value = false
  settingQuery().then(settingData => {
    settingData.allMailMode = Number(settingData.allMailMode) === 1 ? 1 : 0
    settingData.publicProfile = Number(settingData.publicProfile) === 1 ? 1 : 0
    settingData.register = Number(settingData.register) === 0 ? 0 : 1
    settingData.loginDomain = Number(settingData.loginDomain) === 1 ? 1 : 0
    settingData.addEmail = Number(settingData.addEmail) === 0 ? 0 : 1
    setting.value = settingData
    settingStore.domainList = settingData.domainList || []
    settingStore.settings = { ...settingStore.settings, ...settingData }
    resendTokenForm.domain = setting.value.domainList?.[0] || ''
    loginOpacity.value = setting.value.loginOpacity || 0.88
    minEmailPrefix.value = setting.value.minEmailPrefix || 0
    firstLoading.value = false
    backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
    editTitle.value = setting.value.title || ''
    resetAuthI18nForm()
    r2DomainInput.value = setting.value.r2Domain || ''
    addVerifyCount.value = setting.value.addVerifyCount || 1
    regVerifyCount.value = setting.value.regVerifyCount || 1
    resetNoticeForm()
    resetAddS3Form()
    resetEmailPrefix()
    resetBlackList()
    resetAiCodeFilter()
    nextTick(() => {
      settingReady.value = true
    })
  }).catch(e => {
    console.error('getSettings error:', e)
    firstLoading.value = false
    settingReady.value = true
  })
}


function openNoticePopup() {
  uiStore.showNotice()
}

function openAddVerifyCount() {
  if (settingLoading.value) return
  addVerifyCountShow.value = true
}

function openRegVerifyCount() {
  if (settingLoading.value) return
  regVerifyCountShow.value = true
}

function resetAddS3Form() {
  s3.bucket = setting.value.bucket
  s3.endpoint = setting.value.endpoint
  s3.region = setting.value.region
  s3.s3AccessKey = ''
  s3.s3SecretKey = ''
  s3.forcePathStyle = setting.value.forcePathStyle
}

const resendList = computed(() => {

  let list = Object.keys(setting.value.resendTokens).map(key => {
    return {
      key: key,
      value: setting.value.resendTokens[key]
    };
  })

  if (list.length > 0) {

    const key = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'key')).key;
    emailColumnWidth.value = getTextWidth(key) + 30;

    const value = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'value')).value;
    tokenColumnWidth.value = getTextWidth(value) + 30;

  }

  return list;
});

function getUpdate() {
  if (getUpdateErrorCount > 5 || !getUpdateErrorCount) return
  axios.get('https://api.github.com/repos/your-username/epocanvas-mail/releases/latest').then(({data}) => {
    hasUpdate.value = data.name !== currentVersion
    getUpdateErrorCount = 0
  }).catch(e => {
    getUpdateErrorCount++
    setTimeout(() => {
      getUpdate()
    }, 2000)
    console.error('检查更新失败：', e)
  })
}

function saveAddVerifyCount() {
  if (!addVerifyCount.value) {
    addVerifyCount.value = 1
  }
  editSetting({addVerifyCount: addVerifyCount.value})
}

function saveRegVerifyCount() {
  if (!regVerifyCount.value) {
    regVerifyCount.value = 1
  }
  editSetting({regVerifyCount: regVerifyCount.value})
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};


function closedSetBackground() {
  backgroundImage.value = ''
  localUpShow.value = false
  backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
}

function openTgSetting() {
  tgBotStatus.value = setting.value.tgBotStatus
  tgBotToken.value = ''
  customDomain.value = setting.value.customDomain
  tgMsgFrom.value = setting.value.tgMsgFrom
  tgMsgText.value = setting.value.tgMsgText
  tgMsgTo.value = setting.value.tgMsgTo
  tgChatId.value = []
  if (setting.value.tgChatId) {
    const list = setting.value.tgChatId.split(',')
    tgChatId.value.push(...list)
  }
  tgSettingShow.value = true
}

function openNoticePopupSetting() {
  noticePopupShow.value = true
}

function openResendList() {
  showResendList.value = true
}

function resetNoticeForm() {
  noticeForm.notice = setting.value.notice
  noticeForm.noticeContent = setting.value.noticeContent
  noticeForm.noticeDuration = setting.value.noticeDuration
  noticeForm.noticeTitle = setting.value.noticeTitle
  noticeForm.noticePosition = setting.value.noticePosition
  noticeForm.noticeType = setting.value.noticeType
  noticeForm.noticeOffset = setting.value.noticeOffset
  noticeForm.noticeWidth = setting.value.noticeWidth
}

function saveNoticePopup() {
  noticeForm.noticeOffset = noticeForm.noticeOffset || 0
  noticeForm.noticeWidth = noticeForm.noticeWidth || 0
  noticeForm.noticeDuration = noticeForm.noticeDuration || 0
  editSetting({...noticeForm})
}

function previewNoticePopup() {
  uiStore.previewNotice({...noticeForm})
}

function openWelcomeEmailSetting() {
  welcomeEmailForm.welcomeSubject = setting.value.welcomeSubject || DEFAULT_WELCOME_SUBJECT
  welcomeEmailForm.welcomeContent = setting.value.welcomeContent || DEFAULT_WELCOME_CONTENT
  welcomeEmailForm.welcomeText = setting.value.welcomeText || ''
  welcomeEmailForm.welcomeExpireDays = setting.value.welcomeExpireDays !== undefined ? Number(setting.value.welcomeExpireDays) : 7
  welcomeEmailForm.welcomeAutoSend = setting.value.welcomeAutoSend !== undefined ? Number(setting.value.welcomeAutoSend) : 1
  isWelcomePreview.value = false
  welcomeEditorFormat.value = 'rich'
  previewDark.value = uiStore.dark
  welcomeEmailShow.value = true
}

function resetToDefaultWelcomeTemplate() {
  welcomeEmailForm.welcomeSubject = DEFAULT_WELCOME_SUBJECT
  welcomeEmailForm.welcomeContent = DEFAULT_WELCOME_CONTENT
  if (welcomeEditorRef.value) {
    welcomeEditorRef.value.clearEditor()
    nextTick(() => {
      if (welcomeEditorRef.value) {
        welcomeEmailForm.welcomeContent = DEFAULT_WELCOME_CONTENT
      }
    })
  }
  ElMessage.success(t('welcomeResetTemplate') || '已恢复官方默认模板')
}

function toggleEditorFormat() {
  if (welcomeEditorFormat.value === 'rich') {
    if (welcomeEditorRef.value) {
      const current = welcomeEditorRef.value.getContent()
      if (current !== undefined && current !== '') {
        welcomeEmailForm.welcomeContent = current
      }
    }
    welcomeEditorFormat.value = 'source'
  } else {
    welcomeEditorFormat.value = 'rich'
    nextTick(() => {
      if (welcomeEditorRef.value) {
        welcomeEditorRef.value.setContent(welcomeEmailForm.welcomeContent)
      }
    })
  }
}

function clearWelcomeContent() {
  welcomeEmailForm.welcomeContent = ''
  if (welcomeEditorRef.value) {
    welcomeEditorRef.value.clearEditor()
  }
}

function switchWelcomeView(preview) {
  if (preview) {
    if (welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
      const current = welcomeEditorRef.value.getContent()
      if (current !== undefined) {
        welcomeEmailForm.welcomeContent = current
      }
    }
    previewDark.value = uiStore.dark
  } else {
    nextTick(() => {
      if (welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
        welcomeEditorRef.value.setContent(welcomeEmailForm.welcomeContent)
      }
    })
  }
  isWelcomePreview.value = preview
}

function onWelcomeContentChange(content) {
  welcomeEmailForm.welcomeContent = content
}

function closeWelcomeDialog() {
  isWelcomePreview.value = false
  welcomeEditorFormat.value = 'rich'
}

function saveWelcomeTemplate() {
  if (savingWelcome.value) return
  if (!isWelcomePreview.value && welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
    const current = welcomeEditorRef.value.getContent()
    if (current !== undefined) {
      welcomeEmailForm.welcomeContent = current
    }
  }

  savingWelcome.value = true
  const payload = {
    welcomeSubject: welcomeEmailForm.welcomeSubject || DEFAULT_WELCOME_SUBJECT,
    welcomeContent: welcomeEmailForm.welcomeContent,
    welcomeExpireDays: Number(welcomeEmailForm.welcomeExpireDays),
    welcomeAutoSend: Number(welcomeEmailForm.welcomeAutoSend)
  }

  settingSet(payload).then(() => {
    setting.value = { ...setting.value, ...payload }
    settingStore.settings = { ...settingStore.settings, ...payload }
    ElMessage.success(t('welcomeSaveSuccess') || '欢迎邮件模板配置已保存')
    welcomeEmailShow.value = false
  }).catch(e => {
    console.error('saveWelcomeTemplate error:', e)
    ElMessage.error(t('operationFailed') || '保存失败')
  }).finally(() => {
    savingWelcome.value = false
  })
}

function confirmBroadcastWelcome() {
  if (sendingWelcome.value) return
  if (!isWelcomePreview.value && welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
    const current = welcomeEditorRef.value.getContent()
    if (current !== undefined) {
      welcomeEmailForm.welcomeContent = current
    }
  }

  ElMessageBox.confirm(
    t('broadcastConfirmHighRiskMsg') || t('welcomeBroadcastConfirmMsg'),
    t('broadcastConfirmHighRiskTitle') || t('welcomeBroadcastConfirmTitle'),
    {
      confirmButtonText: t('broadcastConfirmBtnText') || t('welcomeBroadcastBtn'),
      cancelButtonText: t('cancel'),
      type: 'warning',
      customClass: 'welcome-confirm-box high-risk-modal',
      confirmButtonClass: 'el-button--primary btn-danger-confirm'
    }
  ).then(() => {
    sendingWelcome.value = true
    const payload = {
      welcomeSubject: welcomeEmailForm.welcomeSubject || DEFAULT_WELCOME_SUBJECT,
      welcomeContent: welcomeEmailForm.welcomeContent,
      welcomeExpireDays: Number(welcomeEmailForm.welcomeExpireDays),
      welcomeAutoSend: Number(welcomeEmailForm.welcomeAutoSend)
    }

    sendWelcomeEmail(payload).then(res => {
      const count = res.deliverCount ?? res.totalUsers ?? 0
      ElMessage.success(t('welcomeBroadcastSuccess', { count }) || `已成功向全员 ${count} 位用户投递官方欢迎邮件！`)
      getSettings()
      welcomeEmailShow.value = false
    }).catch(e => {
      console.error('sendWelcomeEmail error:', e)
      ElMessage.error(t('operationFailed') || '投递失败')
    }).finally(() => {
      sendingWelcome.value = false
    })
  }).catch(() => {})
}

function openThirdEmailSetting() {
  forwardEmail.value = []
  forwardStatus.value = setting.value.forwardStatus
  if (setting.value.forwardEmail) {
    const list = setting.value.forwardEmail.split(',')
    forwardEmail.value.push(...list)
  }
  thirdEmailShow.value = true
}

function openEmailPrefix() {
  emailPrefixShow.value = true
}

function openForwardRules() {
  ruleType.value = setting.value.ruleType
  ruleEmail.value = []
  if (setting.value.ruleEmail) {
    const list = setting.value.ruleEmail.split(',')
    ruleEmail.value.push(...list)
  }
  forwardRulesShow.value = true
}

function emailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  forwardEmail.value.splice(forwardEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !forwardEmail.value.includes(email)) {
      forwardEmail.value.push(email)
    }
  })
}

function ruleEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  ruleEmail.value.splice(ruleEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !ruleEmail.value.includes(email)) {
      ruleEmail.value.push(email)
    }
  })
}

function addChatTag(val) {

  const chatIds = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  tgChatId.value.splice(tgChatId.value.length - 1, 1)

  chatIds.forEach(id => {
    if (!isNaN(Number(id))) {
      tgChatId.value.push(id)
    }
  })
}

function clearS3() {

  const form = {
    bucket: '',
    endpoint: '',
    region: '',
    s3AccessKey: '',
    s3SecretKey: '',
    forcePathStyle: 1
  }
  clearS3Loading.value = true
  editSetting(form)
}

function saveS3() {

  const form = {
    bucket: s3.bucket,
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: s3.forcePathStyle
  }

  if (s3.s3AccessKey) form.s3AccessKey = s3.s3AccessKey
  if (s3.s3SecretKey) form.s3SecretKey = s3.s3SecretKey

  editSetting(form)
}

function tgBotSave() {
  const form = {
    customDomain: customDomain.value,
    tgBotStatus: tgBotStatus.value,
    tgChatId: tgChatId.value + '',
    tgMsgFrom: tgMsgFrom.value,
    tgMsgText: tgMsgText.value,
    tgMsgTo: tgMsgTo.value
  }
  if (tgBotToken.value) form.tgBotToken = tgBotToken.value
  editSetting(form)
}

function forwardEmailSave() {
  const form = {
    forwardStatus: forwardStatus.value,
    forwardEmail: forwardEmail.value + ''
  }
  editSetting(form)
}


function ruleEmailSave() {
  const form = {
    ruleEmail: ruleEmail.value + '',
    ruleType: ruleType.value
  }
  editSetting(form)
}

function doOpacityChange() {
  if (!settingReady.value) return
  const form = {}
  form.loginOpacity = loginOpacity.value
  editSetting(form, true)
}

function resetEmailPrefix() {
  minEmailPrefix.value = setting.value.minEmailPrefix || 1
  if (Array.isArray(setting.value.emailPrefixFilter)) {
    emailPrefixFilter.value = Array.from(new Set(setting.value.emailPrefixFilter.map(s => (typeof s === 'string' ? s.trim() : s)))).filter(Boolean)
  } else if (typeof setting.value.emailPrefixFilter === 'string' && setting.value.emailPrefixFilter.trim()) {
    emailPrefixFilter.value = Array.from(new Set(setting.value.emailPrefixFilter.split(/[,，]/).map(s => s.trim()))).filter(Boolean)
  } else {
    emailPrefixFilter.value = []
  }
}

function emailPrefixAddTag(val) {
  if (!val) return
  const rawList = Array.isArray(val) ? val : [val]
  const newItems = []
  rawList.forEach(item => {
    if (typeof item === 'string') {
      item.split(/[,，\s]/).map(s => s.trim()).filter(Boolean).forEach(s => newItems.push(s))
    }
  })

  // Remove the duplicate tag pushed at the end by el-input-tag
  emailPrefixFilter.value.splice(emailPrefixFilter.value.length - 1, 1)

  newItems.forEach(tag => {
    const exists = emailPrefixFilter.value.some(p => p.toLowerCase() === tag.toLowerCase())
    if (!exists) {
      emailPrefixFilter.value.push(tag)
    }
  })
}

function resetBlackList() {
  blackListForm.value.blackFrom = setting.value.blackFrom ? setting.value.blackFrom.split(',') : []
  blackListForm.value.blackContent = setting.value.blackContent ? setting.value.blackContent.split(',') : []
  blackListForm.value.blackSubject = setting.value.blackSubject ? setting.value.blackSubject.split(',') : []
}

function resetAiCodeFilter() {
  aiCodeFilter.value = setting.value.aiCodeFilter ? setting.value.aiCodeFilter.split(',') : []
}

function saveEmailPrefix() {
  const cleanList = Array.from(new Set(
    (emailPrefixFilter.value || []).map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
  ))
  emailPrefixFilter.value = cleanList
  const form = {}
  form.minEmailPrefix = minEmailPrefix.value
  form.emailPrefixFilter = cleanList
  editSetting(form, true)
}

function saveAiCodeFilter() {
  editSetting({aiCodeFilter: aiCodeFilter.value + ''})
}

const opacityChange = debounce(doOpacityChange, 1000, {
  leading: false,
  trailing: true
})

function saveBlackList() {

  let form = {
    blackContent: blackListForm.value.blackContent + '',
    blackSubject: blackListForm.value.blackSubject + '',
    blackFrom: blackListForm.value.blackFrom + ''
  }

  settingLoading.value = true

  setBlackList(form).then(() => {
    getSettings()
    ElMessage({
      message: t('setSuccess'),
      type: "success",
      plain: true
    })
    blackFormShow.value = false;
  }).finally(() => {
    settingLoading.value = false;
  })
}

function banEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  blackListForm.value.blackFrom.splice(blackListForm.value.blackFrom.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !blackListForm.value.blackFrom.includes(email)) {
      blackListForm.value.blackFrom.push(email)
    }
  })
}

function aiCodeFilterAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  aiCodeFilter.value.splice(aiCodeFilter.value.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !aiCodeFilter.value.includes(email)) {
      aiCodeFilter.value.push(email)
    }
  })
}


function delBackground() {
  ElMessageBox.confirm(t('delBackgroundConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    deleteBackground().then(() => {
      backgroundUrl.value = ''
      setting.value.background = null
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  })
}

function saveTurnstileKey() {
  const settingForm = {}
  settingForm.siteKey = turnstileForm.siteKey
  settingForm.secretKey = turnstileForm.secretKey
  editSetting(settingForm)
}

async function saveBackground() {

  let image = ''

  if (localUpShow.value) {
    image = await fileToBase64(backgroundFile, true);
  } else {
    if (backgroundUrl.value && !backgroundUrl.value.startsWith('http')) {
      ElMessage({
        message: t('imageLinkErrorMsg'),
        type: "error",
        plain: true
      })
      return
    }
    image = backgroundUrl.value
  }
  settingLoading.value = true

  setBackground(image).then(key => {
    setting.value.background = key
    showSetBackground.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    localUpShow.value = false
    backgroundImage.value = ''
  }).finally(() => {
    settingLoading.value = false
  })

}

function openSetBackground() {
  showSetBackground.value = true
}

function openCut() {
  const doc = document.createElement('input')
  doc.setAttribute('type', 'file')
  doc.setAttribute('accept', 'image/*')
  doc.click()
  doc.onchange = async (e) => {
    backgroundFile = e.target.files[0]
    backgroundImage.value = URL.createObjectURL(e.target.files[0])
    localUpShow.value = true
  }
}

function saveR2domain() {
  const settingForm = {r2Domain: r2DomainInput.value}
  editSetting(settingForm)
}

function openResendForm() {
  resendTokenFormShow.value = true
}

function openBlackListForm() {
  blackFormShow.value = true
}

function openAiCodeFilter() {
  aiCodeFilterShow.value = true
}

function saveResendToken() {
  const settingForm = {
    resendTokens: {}
  }
  const domain = resendTokenForm.domain.slice(1)
  settingForm.resendTokens[domain] = resendTokenForm.token
  editSetting(settingForm)
}

function backupSetting() {
  const settingForm = {...setting.value}
  delete settingForm.resendTokens
  delete settingForm.siteKey
  delete settingForm.secretKey
  backup = JSON.stringify(setting.value)
}

function cleanResendTokenForm() {
  resendTokenForm.token = ''
}

function beforeChange() {
  if (!settingReady.value) return false
  backupSetting()
  return true
}

function change(e) {
  if (!settingReady.value) return
  settingStore.settings = { ...settingStore.settings, ...setting.value }
  const settingForm = {...setting.value}
  delete settingForm.siteKey
  delete settingForm.secretKey
  delete settingForm.s3AccessKey
  delete settingForm.s3SecretKey
  delete settingForm.tgBotToken
  delete settingForm.resendTokens
  editSetting(settingForm, false)
}

function changeField(key, value) {
  if (!settingReady.value) return
  setting.value[key] = value
  settingStore.settings = { ...settingStore.settings, [key]: value }
  editSetting({[key]: value}, false)
}

function saveTitle() {
  editSetting({title: editTitle.value})
}

function onSelectColor(color) {
  alertColorTab.value = color
  if (color === 'green') {
    selectedScenario.value = 'loginSuccess'
  } else if (color === 'yellow') {
    selectedScenario.value = 'invalidCredentials'
  } else if (color === 'red') {
    selectedScenario.value = 'noNewNodes'
  }
}

function getScenarioLabel() {
  const map = {
    loginSuccess: t('loginSuccessText'),
    registerSuccess: t('registerSuccessText'),
    invalidCredentials: t('invalidCredText'),
    passwordMismatch: t('passwordMismatchText'),
    noLandingNodes: t('noLandingNodesText'),
    noNewNodes: t('noNewNodesText')
  }
  return map[selectedScenario.value] || ''
}

function getScenarioPlaceholder() {
  const lang = currentEditingLang.value || 'zh'
  const placeholders = {
    zh: {
      loginSuccess: '成功连结节点',
      registerSuccess: '节点创建成功',
      invalidCredentials: '填写的坐标不存在',
      passwordMismatch: '请确认前后坐标一致',
      noLandingNodes: '当前没有可着陆的节点',
      noNewNodes: '当前没有可以探索的新节点，请联系舰长改变航道'
    },
    en: {
      loginSuccess: 'Node Link Established',
      registerSuccess: 'Node Successfully Created',
      invalidCredentials: 'Specified coordinates do not exist',
      passwordMismatch: 'Please ensure coordinates match',
      noLandingNodes: 'No landing nodes available',
      noNewNodes: 'No new nodes to explore, please contact the captain'
    }
  }
  return placeholders[lang]?.[selectedScenario.value] || ''
}

function getPreviewToastText() {
  const lang = currentEditingLang.value || 'zh'
  const val = authI18nForm[lang]?.[selectedScenario.value]
  if (val && val.trim()) return val
  return getScenarioPlaceholder()
}

function syncCurrentLangToOther() {
  const fromLang = currentEditingLang.value || 'zh'
  const toLang = fromLang === 'zh' ? 'en' : 'zh'

  ElMessageBox.confirm(
    t('syncToOtherLangConfirm'),
    t('warning'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(() => {
    Object.keys(authI18nForm[fromLang]).forEach(key => {
      authI18nForm[toLang][key] = authI18nForm[fromLang][key]
    })
    ElMessage.success(t('syncSuccess'))
  }).catch(() => {})
}

function getPreviewToastStyle() {
  const current = authI18nForm[currentEditingLang.value] || {}
  const pos = current.alertPosition || 'top-right'
  const offset = Number(current.alertOffset) || 40
  const style = {}
  if (pos === 'top-left') {
    style.top = `${offset}px`
    style.left = `${offset}px`
  } else if (pos === 'bottom-left') {
    style.bottom = `${offset}px`
    style.left = `${offset}px`
  } else if (pos === 'bottom-right') {
    style.bottom = `${offset}px`
    style.right = `${offset}px`
  } else {
    style.top = `${offset}px`
    style.right = `${offset}px`
  }
  return style
}

function resetAuthI18nForm() {
  currentEditingLang.value = (settingStore.lang || locale.value || 'zh').startsWith('en') ? 'en' : 'zh'
  alertColorTab.value = 'green'
  selectedScenario.value = 'loginSuccess'
  const rawI18n = (setting.value && setting.value.authI18n) || {}
  
  // Support both legacy flat format and new { zh: {}, en: {} } format
  const isLanguagePartitioned = Boolean(rawI18n && (rawI18n.zh || rawI18n.en))
  
  ['zh', 'en'].forEach(lang => {
    if (!authI18nForm[lang]) {
      authI18nForm[lang] = createDefaultAuthLangObj()
    }
    const langSource = isLanguagePartitioned ? (rawI18n[lang] || {}) : (lang === 'zh' ? rawI18n : {})
    Object.keys(authI18nForm[lang]).forEach(key => {
      if (langSource && langSource[key] !== undefined && langSource[key] !== null) {
        authI18nForm[lang][key] = langSource[key]
      }
    })
  })

  // Backward compatibility with legacy noLandingNodes / noNewNodes
  if (setting.value && !authI18nForm.zh.noLandingNodes && setting.value.noLandingNodes) {
    authI18nForm.zh.noLandingNodes = setting.value.noLandingNodes
  }
  if (setting.value && !authI18nForm.zh.noNewNodes && setting.value.noNewNodes) {
    authI18nForm.zh.noNewNodes = setting.value.noNewNodes
  }
}

function saveAuthI18n() {
  editSetting({
    authI18n: {
      zh: { ...authI18nForm.zh },
      en: { ...authI18nForm.en }
    },
    noLandingNodes: authI18nForm.zh.noLandingNodes || '',
    noNewNodes: authI18nForm.zh.noNewNodes || ''
  })
}

function syncToOtherLang() {
  const fromLang = currentEditingLang.value
  const toLang = fromLang === 'zh' ? 'en' : 'zh'
  if (authI18nForm[fromLang] && authI18nForm[toLang]) {
    Object.keys(authI18nForm[fromLang]).forEach(key => {
      authI18nForm[toLang][key] = authI18nForm[fromLang][key]
    })
  }
  saveAuthI18n()
  ElMessage.success(t('syncSuccess') || '同步成功')
}

function jump(href) {
  const doc = document.createElement('a')
  doc.href = href
  doc.target = '_blank'
  doc.click()
}

function editSetting(settingForm, refreshStatus = true) {
  if (settingLoading.value) return
  settingLoading.value = true

  settingSet(settingForm).then(() => {
    settingLoading.value = false
    settingStore.settings = { ...settingStore.settings, ...setting.value, ...settingForm }
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    if (setting.value.manyEmail === 1) {
      accountStore.currentAccountId = userStore.user.account.accountId;
    }
    if (refreshStatus) {
      getSettings()
    }
    editTitleShow.value = false
    editAuthI18nShow.value = false
    r2DomainShow.value = false
    resendTokenFormShow.value = false
    turnstileShow.value = false
    tgSettingShow.value = false
    thirdEmailShow.value = false
    forwardRulesShow.value = false
    addVerifyCountShow.value = false
    regVerifyCountShow.value = false
    noticePopupShow.value = false
    addS3Show.value = false
    emailPrefixShow.value = false
    aiCodeFilterShow.value = false
  }).catch((e) => {
    console.error('editSetting error:', e)
    loginOpacity.value = setting.value.loginOpacity
    setting.value = {...setting.value, ...JSON.parse(backup || '{}')}
    settingStore.settings = { ...settingStore.settings, ...setting.value }
    ElMessage.error(t('operationFailed') || '保存失败')
  }).finally(() => {
    settingLoading.value = false
    clearS3Loading.value = false
  })
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
  overflow: hidden;
  background: var(--extra-light-fill) !important;
  position: relative;

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    z-index: 2;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    transition: var(--loading-hide-transition);
    pointer-events: none;
    opacity: 0;
  }
}

.scroll {
  width: 100%;
  min-height: 100%;

  :deep(.el-scrollbar__view) {
    height: 100%;
  }

  .scroll-body {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
}

.card-grid {

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
  padding: 20px;
  gap: 20px;
  @media (max-width: 500px) {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  @media (max-width: 1023px) {
    gap: 15px;
    padding: 15px;
  }
}

.background {
  width: 249px;
  height: 140px;
  border-radius: 4px;
  border: 1px solid var(--light-border);
  @media (max-width: 500px) {
    width: 160px;
    height: 90px;
  }
}

.background-btn {
  display: flex;
  gap: 10px;
  flex-direction: column;
}

.bot-verify-select {
  margin-left: 10px;
}

.settings-card {
  background-color: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  transition: all 300ms;
  overflow: hidden;
}


.card-title {
  font-size: 15px;
  font-weight: bold;
  padding: 10px 20px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  color: var(--text-muted);
  cursor: help;
}

.customization-card {
  min-height: 386px;
}

.static-ui-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;

  .iconify {
    color: #e6a23c;
    flex-shrink: 0;
  }
}

.card-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-ui-tabs {
  display: flex;
  background: var(--el-fill-color-darker, rgba(0, 0, 0, 0.2));
  padding: 4px;
  border-radius: 8px;
  gap: 4px;
  margin-bottom: 6px;
  border: 1px solid var(--el-border-color-lighter);

  .ui-tab-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: var(--el-text-color-secondary);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    user-select: none;

    &:hover {
      color: var(--el-text-color-primary);
    }

    &.active {
      background: var(--el-color-primary);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(var(--el-color-primary-rgb), 0.35);
    }
  }
}

.setting-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  font-weight: normal;

  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    display: grid;
    grid-template-columns: 1fr auto;
    justify-items: flex-end;
    font-weight: normal;
  }
}

.r2domain-item {
  display: flex;
  gap: 10px;
  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    flex: 1;
    text-align: right;
  }
}

.title-icon.warning {
  position: relative;
  top: 2px;
  cursor: pointer;
  margin-left: 2px;
}

.warning {
  margin-left: 2px;
  color: grey;
  cursor: pointer;
}

.cropper {
  border-radius: 4px;
  border: 1px solid #D4D7DE;
  height: 397px;
  width: 705px;
  @media (max-width: 767px) {
    width: calc(100vw - 60px);
    height: calc((100vw - 60px) * 9 / 16);
  }
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
}

.notice-popup-item {
  margin-top: 15px;
}

.notice-line-item {
  margin-top: 15px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;

  > * {
    width: 100%;
  }

  @media (max-width: 840px) {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
}

.background-url {
  width: min(calc(100vw - 70px), 500px);
}


:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.notice-popup.el-dialog), :deep(.auth-prompt-dialog.el-dialog), :deep(.welcome-write-dialog.el-dialog) {
  min-height: 300px;
  width: 980px !important;
  max-width: min(980px, calc(100vw - 40px)) !important;
  @media (max-width: 1040px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

:deep(.cut-dialog.el-dialog) {
  width: fit-content !important;
  height: fit-content !important;
}


:deep(.forward-dialog.el-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.forward-dialog {
  .forward-head {
    display: flex;
    align-items: center;

    .forward-set-title {
      top: 1px;
      padding-right: 5px;
      position: relative;
      font-size: 16px;
      font-weight: bold;
    }
  }

  .rule-threshold-tip {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
    margin-bottom: 12px;
  }

  .rule-field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    margin-bottom: 6px;
  }
}

/* Unified Drawer styles */
:deep(.unified-drawer.el-drawer) {
  .el-drawer__header {
    margin-bottom: 0;
    padding: 16px 20px;
    font-weight: 600;
    font-size: 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .el-drawer__body {
    padding: 0;
  }
}

.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
}

.drawer-desc {
  margin-bottom: 16px;
  background: var(--bg-surface, rgba(255, 255, 255, 0.03));
  padding: 14px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle, var(--el-border-color-lighter));

  .desc-title {
    font-weight: bold;
    color: var(--text-primary, var(--el-text-color-primary));
    margin-bottom: 6px;
    font-size: 14px;
  }
  .desc-body {
    color: var(--text-regular, var(--el-text-color-regular));
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 8px;
  }
  .desc-rule {
    color: var(--text-muted, var(--el-text-color-secondary));
    font-size: 12px;
    padding-top: 8px;
    border-top: 1px dashed var(--border-subtle, var(--el-border-color-lighter));
    code {
      background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
      padding: 2px 4px;
      border-radius: 4px;
      font-family: monospace;
    }
  }
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}

.drawer-tag-input {
  flex: 1;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--border-subtle, var(--el-border-color-lighter));
  border-radius: 4px;
  padding: 8px;
  align-items: flex-start;
  :deep(.el-input-tag__inner) {
    min-height: 180px;
    align-items: flex-start;
    align-content: flex-start;
  }
}

.error-image {
  background: var(--light-ill);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cut-button {
  padding-top: 15px;
  width: 100%;
  display: flex;
  justify-content: space-between;

  .el-button {
    width: fit-content;
  }
}

.bot-verify {
  display: grid;
  grid-template-columns: 1fr auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  span {
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.forward-set-body {
  display: flex;
  flex-direction: column;

  .el-switch {
    align-self: end;
  }

  > *:nth-child(-n+2) {
    margin-bottom: 15px;
  }

  .tg-msg-label {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-select {
      width: v-bind(tgMsgLabelWidth);
    }
  }
}

.forward {
  display: flex;
  justify-content: flex-end;
  align-items: center;

  span {
    display: flex;
    align-items: center;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.opt-button {
  width: fit-content !important;
}

.email-prefix {
  display: flex;
  justify-content: space-between;
}

.prefix-filter {
  display: flex;
  flex-direction: column;
}

.s3-button {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 15px;

  .el-button {
    margin-left: 0;
  }
}

.r2domain {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;

  .storage-type {
    margin-right: 3px;
  }

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.personalized {
  align-items: start;

  > div:last-child {
    display: flex;
    justify-content: end;

    .el-button {
      margin-left: 10px;
      margin-top: 0;
    }
  }
}

.dialog-input {
  margin-bottom: 15px;
}

.force-path-style {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  .force-path-style-left {
    padding-left: 2px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
  }
}

.concerning-item {
  display: flex;
  align-items: center;

  .community {
    display: flex;
    row-gap: 10px;
    flex-wrap: wrap;
  }

  :deep(.el-button) {
    padding: 0 10px;
    font-weight: normal;

    i {
      font-size: 22px;
    }
  }

  > span:first-child {
    font-weight: normal;
    padding-right: 20px;
    white-space: nowrap;
  }
}

.email-title {
  font-weight: normal !important;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto;
  align-items: center;

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    margin-top: 0;
  }
}

.token-item {
  padding-top: 0;

  div:last-child {
    font-weight: normal;
  }
}

form .el-button {
  margin-top: 10px;
  width: 100%;
}

.el-switch {
  height: 28px;
}


:deep(.el-button--small) {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  height: 24px;
}

:deep(.el-select__wrapper) {
  min-height: 28px;
}

/* Prompt Popup Messages Dialog Styling & Large Atmosphere Preview Stage */
.auth-prompt-dialog {
  :deep(.el-dialog__body) {
    padding: 16px 20px;
    max-height: 80vh;
    overflow-y: auto;
  }
}

.auth-prompt-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-notice-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--el-color-primary-rgb), 0.08);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  .notice-icon {
    color: var(--el-color-primary);
    flex-shrink: 0;
  }
}

.step-selection-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);

  .selection-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    .selection-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      min-width: 100px;

      .step-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--el-color-primary);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
      }
    }
  }

  .color-badge-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .color-badge-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--el-border-color);
      background: var(--el-bg-color);
      transition: all 0.2s ease;

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;

        &.green {
          background: #22c55e;
          box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
        }

        &.yellow {
          background: #eab308;
          box-shadow: 0 0 6px rgba(234, 179, 8, 0.6);
        }

        &.red {
          background: #ef4444;
          box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
        }
      }

      &:hover {
        border-color: var(--el-color-primary);
      }

      &.active {
        &.green {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        &.yellow {
          border-color: #eab308;
          background: rgba(234, 179, 8, 0.1);
          color: #eab308;
        }

        &.red {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
      }
    }
  }

  .scenario-pill-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .scenario-pill {
      display: inline-flex;
      align-items: center;
      padding: 5px 12px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid var(--el-border-color);
      background: var(--el-bg-color);
      color: var(--el-text-color-regular);
      transition: all 0.2s ease;

      &:hover {
        color: var(--el-color-primary);
        border-color: var(--el-color-primary);
      }

      &.active {
        background: var(--el-color-primary);
        border-color: var(--el-color-primary);
        color: #ffffff;
        font-weight: 500;
      }
    }
  }
}

.dialog-header-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  .dialog-header-info-icon {
    color: var(--el-text-color-secondary);
    cursor: pointer;
    transition: color 0.2s ease;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}

.prompt-param-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
  padding: 10px 14px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-extra-light);

  > * {
    width: 100% !important;
  }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
}

.prompt-input-row {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .field-label-wrap {
    display: flex;
    align-items: center;

    .field-label-text {
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }
}

.dialog-footer-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

/* Large Atmosphere & Toast Preview Stage */
.prompt-preview-container {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 12px 16px 16px;

  .preview-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;

    .preview-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .prompt-atmosphere-stage {
    min-height: 240px;
    height: 240px;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
    transition: background 0.3s ease;

    &.dark {
      background: #050713;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    &.light {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
    }
  }

  .atmosphere-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;

    &.green-mode {
      background: radial-gradient(circle at 80% 20%, rgba(34, 197, 94, 0.12), transparent 60%);
    }

    &.yellow-mode {
      background: radial-gradient(circle at 80% 20%, rgba(234, 179, 8, 0.12), transparent 60%);
    }

    &.red-mode {
      background: radial-gradient(circle at 80% 20%, rgba(239, 68, 68, 0.15), transparent 60%);
    }
  }

  /* Toast Box */
  .preview-toast-item {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    backdrop-filter: blur(8px);
    z-index: 10;
    max-width: 80%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &.toast-green {
      background: rgba(6, 78, 59, 0.7);
      border: 1px solid rgba(34, 197, 94, 0.6);
      color: #86efac;
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.25);
    }

    &.toast-yellow {
      background: rgba(113, 63, 18, 0.7);
      border: 1px solid rgba(234, 179, 8, 0.6);
      color: #fef08a;
      box-shadow: 0 0 20px rgba(234, 179, 8, 0.25);
    }

    &.toast-red {
      background: rgba(127, 29, 29, 0.8);
      border: 1px solid rgba(239, 68, 68, 0.7);
      color: #fecaca;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
    }
  }

  /* HUD Atmosphere Elements */
  .hud-corner-bracket {
    position: absolute;
    width: 28px;
    height: 28px;
    border-color: #eab308;
    border-style: solid;
    opacity: 0.85;

    &.red {
      border-color: #ef4444;
    }

    &.top-left {
      top: 10px;
      left: 10px;
      border-width: 2px 0 0 2px;
    }

    &.top-right {
      top: 10px;
      right: 10px;
      border-width: 2px 2px 0 0;
    }

    &.bottom-left {
      bottom: 10px;
      left: 10px;
      border-width: 0 0 2px 2px;
    }

    &.bottom-right {
      bottom: 10px;
      right: 10px;
      border-width: 0 2px 2px 0;
    }
  }

  .hazard-stripe-bar {
    position: absolute;
    left: 0;
    right: 0;
    height: 8px;
    background: repeating-linear-gradient(-45deg, #ef4444, #ef4444 8px, #7f1d1d 8px, #7f1d1d 16px);
    opacity: 0.9;

    &.top {
      top: 0;
    }

    &.bottom {
      bottom: 0;
    }
  }

  .center-warning-banner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.35em;
    color: #ef4444;
    background: rgba(127, 29, 29, 0.4);
    padding: 6px 28px;
    border-top: 1px solid #ef4444;
    border-bottom: 1px solid #ef4444;
    opacity: 0.85;
    pointer-events: none;
    white-space: nowrap;
  }
}

/* Welcome Write Dialog (Refactored System Architecture) */
:deep(.welcome-write-dialog) {
  width: 980px !important;
  max-width: min(980px, calc(100vw - 40px)) !important;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.45);
  background: var(--el-bg-color);

  .el-dialog__header {
    margin-right: 0;
    padding: 16px 24px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
  }

  .el-dialog__body {
    padding: 20px 24px 16px;
    background: var(--el-bg-color);
  }

  .el-dialog__footer {
    padding: 16px 24px 18px;
    border-top: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
  }
}

.write-dialog-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 38px;

  .top-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex-shrink: 0;

    .quill-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      flex-shrink: 0;
    }

    .dialog-main-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .sender-identity-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;

      .verified-icon {
        color: #0284c7;
        flex-shrink: 0;
      }

      .sender-name {
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .sender-email {
        color: var(--el-text-color-secondary);
      }

      @media (max-width: 860px) {
        .sender-email {
          display: none;
        }
      }
    }
  }

  .top-spacer {
    flex: 1 1 auto;
    min-width: 8px;
  }

  .top-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;

    .view-switch-capsule {
      display: flex;
      align-items: center;
      background: var(--el-fill-color);
      border-radius: 8px;
      padding: 3px;
      gap: 3px;

      .capsule-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        color: var(--el-text-color-secondary);
        transition: all 0.2s ease;

        &:hover {
          color: var(--el-text-color-primary);
        }

        &.active {
          background: var(--el-bg-color);
          color: var(--el-color-primary);
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
      }
    }

    .header-action-group {
      display: flex;
      align-items: center;
      gap: 8px;

      .tool-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        background: var(--el-fill-color);
        color: var(--el-text-color-regular);
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--el-fill-color-darker);
          color: var(--el-color-primary);
        }

        &.theme-toggle {
          color: #eab308;
        }
      }

      .close-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--el-fill-color);
          color: var(--el-text-color-primary);
        }
      }
    }
  }
}

.welcome-write-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.write-flow-view {
  display: flex;
  flex-direction: column;
  gap: 14px;

  /* Dual-Card Group: Audience vs Attributes */
  .meta-cards-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;

    .meta-group-card {
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      .group-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        color: var(--el-text-color-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .group-content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;

        .audience-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--el-bg-color);
          padding: 6px 12px;
          border-radius: 9999px;
          border: 1px solid var(--el-border-color-lighter);
          font-size: 13px;
          font-weight: 500;
          color: var(--el-text-color-primary);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .attr-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;

          &.official {
            background: rgba(2, 132, 199, 0.12);
            color: #0284c7;
            border: 1px solid rgba(2, 132, 199, 0.3);
          }

          &.star {
            background: rgba(234, 179, 8, 0.12);
            color: #d97706;
            border: 1px solid rgba(234, 179, 8, 0.3);
          }

          &.todo {
            background: rgba(99, 102, 241, 0.12);
            color: #6366f1;
            border: 1px solid rgba(99, 102, 241, 0.3);
          }
        }
      }
    }
  }

  .compose-subject-bar {
    .write-subject-input :deep(.el-input__wrapper) {
      border-radius: 8px;
      font-weight: 600;
      padding: 6px 14px;
      font-size: 14px;
    }
  }

  .compose-editor-area {
    min-height: 380px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    overflow: hidden;

    .custom-tiny-editor {
      height: 380px;
    }

    .source-editor-wrapper {
      height: 380px;

      .source-textarea :deep(.el-textarea__inner) {
        height: 380px !important;
        font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
        font-size: 13px;
        line-height: 1.6;
        border-radius: 0;
        border: none;
      }
    }
  }

  /* Dedicated Auxiliary Configuration Card */
  .auxiliary-config-card {
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .config-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .config-card-body {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;

      .config-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--el-text-color-regular);

        .config-label {
          font-weight: 600;
          white-space: nowrap;
        }
      }

      .storage-tag-item {
        margin-left: auto;

        .storage-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--el-text-color-secondary);
          background: var(--el-bg-color);
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--el-border-color-lighter);
        }
      }
    }
  }
}

.preview-flow-view {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  min-height: 520px;
  transition: all 0.3s ease;

  &.light-theme-preview {
    background: #f8fafc;
    color: #1e293b;

    .real-inbox-mock {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }

    .mock-email-head {
      border-bottom: 1px solid #f1f5f9;

      .mock-sender-name {
        color: #0f172a;
      }

      .mock-sender-email, .mock-to-email, .mock-head-date {
        color: #64748b;
      }
    }

    .mock-official-banner {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.08);

      .banner-heading span {
        color: #1e40af;
      }

      .banner-subtitle {
        color: #2563eb;
      }
    }
  }

  &.dark-theme-preview {
    background: #09090b;
    color: #f4f4f5;

    .real-inbox-mock {
      background: #18181b;
      border: 1px solid #27272a;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
    }

    .mock-email-head {
      border-bottom: 1px solid #27272a;

      .mock-sender-name {
        color: #fafafa;
      }

      .mock-sender-email, .mock-to-email, .mock-head-date {
        color: #a1a1aa;
      }
    }

    .mock-official-banner {
      background: rgba(30, 58, 138, 0.28);
      border: 1px solid rgba(59, 130, 246, 0.4);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

      .banner-heading span {
        color: #93c5fd;
      }

      .banner-subtitle {
        color: #bfdbfe;
      }
    }
  }

  .real-inbox-mock {
    margin: 16px 20px;
    border-radius: 12px;
    overflow: hidden;
  }

  .mock-email-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;

    .mock-head-main {
      display: flex;
      align-items: center;
      gap: 12px;

      .mock-avatar-official {
        background: linear-gradient(135deg, #0284c7, #2563eb);
        color: #ffffff;
        flex-shrink: 0;
      }

      .mock-meta-col {
        display: flex;
        flex-direction: column;
        gap: 3px;

        .mock-meta-line-1 {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          font-size: 14px;
        }

        .mock-meta-line-2 {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
        }
      }
    }

    .mock-head-date {
      font-size: 12px;
    }
  }

  .mock-official-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    margin: 16px 22px;
    border-radius: 10px;

    .banner-left {
      display: flex;
      align-items: center;
      gap: 8px;

      .banner-heading {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 13px;
      }

      .banner-subtitle {
        font-size: 12px;
        margin-top: 1px;
      }
    }
  }

  .mock-email-content-box {
    padding: 0 22px 22px;
  }
}

.welcome-write-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .footer-left {
    .broadcast-hint {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: 18px;

    .btn-save-secondary {
      height: 38px;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 13px;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color);
      color: var(--el-text-color-regular);
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--el-color-primary);
        color: var(--el-color-primary);
        background: var(--el-fill-color-light);
      }
    }

    .btn-broadcast-primary {
      height: 38px;
      padding: 8px 24px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%) !important;
      border: none !important;
      color: #ffffff !important;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

      &:hover {
        box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
        transform: translateY(-1px);
        opacity: 0.95;
      }

      &:active {
        transform: translateY(0);
      }
    }
  }
}

/* TinyMCE Dark & Light Theme Harmonization Tokens */
:deep(.tox.tox-tinymce) {
  border: 1px solid var(--el-border-color-lighter) !important;
  border-radius: 8px !important;
  overflow: hidden;
  background: var(--el-bg-color) !important;

  .tox-editor-container {
    background: var(--el-bg-color) !important;
  }

  .tox-toolbar-overlord {
    background: var(--el-bg-color-overlay) !important;
  }

  .tox-toolbar, .tox-toolbar__primary {
    background: var(--el-bg-color-overlay) !important;
    border-bottom: 1px solid var(--el-border-color-lighter) !important;
    padding: 6px 8px !important;
    gap: 4px !important;
    display: flex !important;
    align-items: center !important;
  }

  .tox-toolbar__group {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 0 4px !important;
    margin: 0 !important;
    border: none !important;
  }

  .tox-tbtn {
    height: 30px !important;
    min-width: 30px !important;
    margin: 0 !important;
    padding: 4px !important;
    border-radius: 4px !important;
    color: var(--el-text-color-regular) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: background 0.2s ease, color 0.2s ease !important;

    &:hover {
      background: var(--el-fill-color) !important;
      color: var(--el-color-primary) !important;
    }

    &.tox-tbtn--enabled, &[aria-pressed="true"] {
      background: var(--el-color-primary-light-9) !important;
      color: var(--el-color-primary) !important;
      font-weight: 600 !important;
    }

    &.tox-tbtn--disabled, &[aria-disabled="true"] {
      opacity: 0.4 !important;
      cursor: not-allowed !important;
      background: transparent !important;
    }

    svg {
      width: 18px !important;
      height: 18px !important;
      fill: currentColor !important;
    }
  }

  .tox-tbtn--select {
    height: 30px !important;
    line-height: 30px !important;
    border-radius: 4px !important;
    padding: 0 8px !important;
    margin: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    color: var(--el-text-color-regular) !important;
    background: transparent !important;

    &:hover {
      background: var(--el-fill-color) !important;
      color: var(--el-color-primary) !important;
    }

    .tox-tbtn__select-label {
      font-size: 12px !important;
      font-weight: 500 !important;
      color: inherit !important;
    }

    .tox-tbtn__select-chevron svg {
      width: 12px !important;
      height: 12px !important;
      fill: currentColor !important;
    }
  }

  .tox-split-button {
    height: 30px !important;
    margin: 0 !important;
    border-radius: 4px !important;
    overflow: hidden !important;
    display: inline-flex !important;
    align-items: center !important;
    transition: background 0.2s ease !important;

    &:hover {
      background: var(--el-fill-color) !important;
    }

    .tox-tbtn {
      height: 30px !important;
      width: 26px !important;
      border-radius: 4px 0 0 4px !important;
      padding: 4px !important;
    }

    .tox-split-button__chevron {
      height: 30px !important;
      width: 14px !important;
      border-radius: 0 4px 4px 0 !important;
      padding: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;

      svg {
        width: 10px !important;
        height: 10px !important;
        fill: currentColor !important;
      }

      &:hover {
        background: var(--el-fill-color-darker) !important;
      }
    }
  }

  .tox-separator {
    height: 18px !important;
    width: 1px !important;
    margin: 0 6px !important;
    background: var(--el-border-color-lighter) !important;
    border: none !important;
  }

  .tox-edit-area {
    border-top: 1px solid var(--el-border-color-lighter) !important;
  }

  .tox-edit-area__iframe {
    background: var(--el-bg-color) !important;
  }
}

/* High-risk confirmation dialog */
:deep(.high-risk-modal) {
  .btn-danger-confirm {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
    border: none !important;
    color: #ffffff !important;
    font-weight: 700 !important;
    box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4) !important;
  }
}

</style>

<style>
.el-popper.is-dark {
}
</style>
