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

      <!-- Welcome Email Compose & Broadcast Fullscreen Dialog -->
      <el-dialog
        v-model="welcomeEmailShow"
        :class="['welcome-dialog-canvas', { 'is-fullscreen': isWelcomeFullscreen }]"
        :close-on-click-modal="false"
        :show-close="false"
        @closed="closeWelcomeDialog"
        width="1140px"
        top="4vh"
      >
        <template #header>
          <div class="write-dialog-top">
            <!-- Left Group: Title -->
            <div class="top-left">
              <div class="quill-badge">
                <Icon icon="hugeicons:quill-write-01" width="20" height="20" />
              </div>
              <span class="dialog-main-title">{{ $t('welcomeEmailTitle') }}</span>
            </div>

            <!-- Middle Elastic Spacer -->
            <div class="top-spacer"></div>

            <!-- Right Group: Fullscreen Toggle & Close -->
            <div class="top-right">
              <el-tooltip :content="isWelcomeFullscreen ? $t('exitFullscreen') : $t('toggleFullscreen')" effect="dark" placement="bottom">
                <div class="tool-icon-btn top-action-btn" @click="toggleFullscreen">
                  <Icon :icon="isWelcomeFullscreen ? 'fluent:full-screen-minimize-24-regular' : 'fluent:full-screen-maximize-24-regular'" width="20" height="20" />
                </div>
              </el-tooltip>
              <div class="tool-icon-btn close-icon-btn" :title="$t('close')" @click="welcomeEmailShow = false">
                <Icon icon="material-symbols-light:close-rounded" width="22" height="22" />
              </div>
            </div>
          </div>
        </template>

        <div class="welcome-dialog-body">
          <!-- 1. Single-Line Recipients Row -->
          <div class="welcome-recipients-row">
            <div class="recipients-label">
              <Icon icon="solar:users-group-rounded-bold" width="16" height="16" class="recipients-icon" />
              <span>{{ $t('welcomeRecipient') }}:</span>
            </div>
            <div class="recipients-content">
              <span class="audience-pill">{{ $t('welcomeAllUsers') }}</span>
              <span class="recipients-subtext">（系统官方自动欢迎通道）</span>
            </div>
          </div>

          <!-- 2. Email Subject Bar -->
          <div class="welcome-subject-bar">
            <el-input
              v-model="welcomeEmailForm.welcomeSubject"
              size="large"
              :placeholder="$t('welcomeSubject')"
              class="write-subject-input"
            >
              <template #prefix>
                <Icon icon="fluent:text-bullet-list-square-sparkle-24-regular" width="18" height="18" class="subject-icon" />
              </template>
            </el-input>
          </div>

          <!-- 3. Workspace Editor Card -->
          <div class="welcome-editor-card">
            <!-- Editor Toolbar attached to top of editing area -->
            <div class="editor-toolbar-header">
              <!-- Left Group: Formatting / Helper Tools -->
              <div class="editor-left-tools">
                <template v-if="welcomeEditorFormat === 'source'">
                  <!-- Group 1: Headings -->
                  <div class="tool-subgroup">
                    <el-tooltip content="H1 一级标题" effect="dark" placement="top">
                      <div class="tool-icon-btn text-icon-btn" @click="insertMarkdownSyntax('# ', '\n', '一级标题')">
                        <span class="btn-text-badge">H1</span>
                      </div>
                    </el-tooltip>
                    <el-tooltip content="H2 二级标题" effect="dark" placement="top">
                      <div class="tool-icon-btn text-icon-btn" @click="insertMarkdownSyntax('## ', '\n', '二级标题')">
                        <span class="btn-text-badge">H2</span>
                      </div>
                    </el-tooltip>
                    <el-tooltip content="H3 三级标题" effect="dark" placement="top">
                      <div class="tool-icon-btn text-icon-btn" @click="insertMarkdownSyntax('### ', '\n', '三级标题')">
                        <span class="btn-text-badge">H3</span>
                      </div>
                    </el-tooltip>
                  </div>

                  <div class="tool-divider"></div>

                  <!-- Group 2: Inline Styles -->
                  <div class="tool-subgroup">
                    <el-tooltip content="加粗 (Bold)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('**', '**', '加粗文本')">
                        <Icon icon="ri:bold" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="斜体 (Italic)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('*', '*', '斜体文本')">
                        <Icon icon="ri:italic" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="删除线 (Strikethrough)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('~~', '~~', '删除文本')">
                        <Icon icon="ri:strikethrough" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="下划线 (Underline)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('<u>', '</u>', '下划线文本')">
                        <Icon icon="ri:underline" width="15" height="15" />
                      </div>
                    </el-tooltip>
                  </div>

                  <div class="tool-divider"></div>

                  <!-- Group 3: Quotes & Code -->
                  <div class="tool-subgroup">
                    <el-tooltip content="引用块 (Quote)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('> ', '\n', '引用文字')">
                        <Icon icon="ri:double-quotes-l" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="行内代码 (Inline Code)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('`', '`', 'code')">
                        <Icon icon="ri:code-line" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="代码块 (Code Block)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('```html\n', '\n```\n', '<div>代码块内容</div>')">
                        <Icon icon="ri:code-box-line" width="15" height="15" />
                      </div>
                    </el-tooltip>
                  </div>

                  <div class="tool-divider"></div>

                  <!-- Group 4: Lists -->
                  <div class="tool-subgroup">
                    <el-tooltip content="无序列表 (Bullet List)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('- ', '\n', '列表项')">
                        <Icon icon="ri:list-unordered" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="有序列表 (Numbered List)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('1. ', '\n', '列表项')">
                        <Icon icon="ri:list-ordered" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="任务清单 (Task List)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('- [ ] ', '\n', '待办事项')">
                        <Icon icon="ri:checkbox-line" width="15" height="15" />
                      </div>
                    </el-tooltip>
                  </div>

                  <div class="tool-divider"></div>

                  <!-- Group 5: Inserts (Link, Image, Table, Divider) -->
                  <div class="tool-subgroup">
                    <el-tooltip content="插入链接 (Link)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('[链接文字](', ')', 'https://example.com')">
                        <Icon icon="ri:link" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="插入图片 (Image)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('![图片描述](', ')', 'https://example.com/image.png')">
                        <Icon icon="ri:image-line" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="插入表格 (Table)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('\n| 标题 1 | 标题 2 |\n| :--- | :--- |\n| 内容 1 | 内容 2 |\n', '', '')">
                        <Icon icon="ri:table-line" width="15" height="15" />
                      </div>
                    </el-tooltip>
                    <el-tooltip content="分割线 (Divider)" effect="dark" placement="top">
                      <div class="tool-icon-btn" @click="insertMarkdownSyntax('\n---\n', '', '')">
                        <Icon icon="ri:separator" width="15" height="15" />
                      </div>
                    </el-tooltip>
                  </div>
                </template>

                <template v-else>
                  <div class="rich-mode-indicator">
                    <Icon icon="fluent:text-edit-style-20-regular" width="15" height="15" />
                    <span>{{ $t('richTextMode') || '富文本可视化编辑' }}</span>
                  </div>
                </template>
              </div>

              <!-- Middle Elastic Spacer -->
              <div class="toolbar-spacer"></div>

              <!-- Right Group: Mode Segmented Switch + Special Actions (Pure Icons with Tooltip) -->
              <div class="editor-right-tools">
                <!-- Unified Mode Toggle Switch (Segmented Control - Pure Icon with Tooltips) -->
                <div class="editor-mode-switch">
                  <el-tooltip :content="$t('richTextMode') || '富文本模式'" effect="dark" placement="top">
                    <button
                      type="button"
                      class="mode-switch-btn"
                      :class="{ 'is-active': welcomeEditorFormat === 'rich' }"
                      @click="setEditorFormat('rich')"
                      aria-label="富文本模式"
                    >
                      <Icon icon="fluent:text-edit-style-20-regular" width="16" height="16" />
                    </button>
                  </el-tooltip>
                  <el-tooltip :content="$t('markdownSourceMode') || '源码 / Markdown 模式'" effect="dark" placement="top">
                    <button
                      type="button"
                      class="mode-switch-btn"
                      :class="{ 'is-active': welcomeEditorFormat === 'source' }"
                      @click="setEditorFormat('source')"
                      aria-label="源码 / Markdown 模式"
                    >
                      <Icon icon="fluent:code-20-regular" width="16" height="16" />
                    </button>
                  </el-tooltip>
                </div>

                <div class="tool-divider"></div>

                <!-- Clear content icon button -->
                <el-tooltip :content="$t('clearContent')" effect="dark" placement="top">
                  <div class="tool-icon-btn danger-hover" @click="clearWelcomeContent">
                    <Icon icon="solar:trash-bin-trash-bold" width="17" height="17" />
                  </div>
                </el-tooltip>

                <!-- Reset template icon button -->
                <el-tooltip :content="$t('welcomeResetTemplate')" effect="dark" placement="top">
                  <div class="tool-icon-btn" @click="resetToDefaultWelcomeTemplate">
                    <Icon icon="fluent:arrow-reset-24-regular" width="17" height="17" />
                  </div>
                </el-tooltip>

                <div class="tool-divider"></div>

                <!-- Fullscreen toggle icon button in editor toolbar -->
                <el-tooltip :content="isWelcomeFullscreen ? $t('exitFullscreen') : $t('toggleFullscreen')" effect="dark" placement="top">
                  <div class="tool-icon-btn" @click="toggleFullscreen">
                    <Icon :icon="isWelcomeFullscreen ? 'fluent:full-screen-minimize-24-regular' : 'fluent:full-screen-maximize-24-regular'" width="17" height="17" />
                  </div>
                </el-tooltip>
              </div>
            </div>

            <!-- Editor Mount Workspace -->
            <div class="editor-mount-area">
              <template v-if="welcomeEditorFormat === 'rich'">
                <tinyEditor
                  editor-id="welcome-sys-editor"
                  :def-value="welcomeEmailForm.welcomeContent"
                  ref="welcomeEditorRef"
                  @change="onWelcomeContentChange"
                  class="dialog-tiny-editor"
                />
              </template>
              <template v-else>
                <div class="source-editor-fullscreen">
                  <el-input
                    type="textarea"
                    v-model="welcomeEmailForm.welcomeContent"
                    placeholder="<!-- HTML / Markdown 正文内容 -->"
                    class="source-textarea-fullscreen"
                  />
                </div>
              </template>
            </div>
          </div>
        </div>

        <template #footer>
          <!-- Bottom Pinned Action & Rules Bar -->
          <div class="welcome-fullscreen-footer">
            <div class="footer-left-rules">
              <!-- Retention TTL -->
              <div class="rule-item">
                <span class="rule-label">{{ $t('welcomeExpireDays') }}:</span>
                <el-select v-model="welcomeEmailForm.welcomeExpireDays" size="small" style="width: 180px;">
                  <el-option :value="7" :label="$t('welcomeExpire7Days')" />
                  <el-option :value="14" :label="$t('welcomeExpire14Days')" />
                  <el-option :value="30" :label="$t('welcomeExpire30Days')" />
                  <el-option :value="90" :label="$t('welcomeExpire90Days')" />
                  <el-option :value="0" :label="$t('welcomeExpireNever')" />
                </el-select>
              </div>

              <!-- Auto-Send Switch -->
              <div class="rule-item">
                <span class="rule-label">{{ $t('welcomeAutoSend') }}:</span>
                <el-switch v-model="welcomeEmailForm.welcomeAutoSend" :active-value="1" :inactive-value="0" size="small" />
                <el-tooltip effect="dark" :content="$t('welcomeAutoSendDesc')" placement="top">
                  <Icon class="warning" icon="fe:warning" width="16" height="16" style="margin-left: 4px; cursor: pointer;"/>
                </el-tooltip>
              </div>

              <!-- Last Broadcast Hint -->
              <div class="rule-item last-broadcast-item" v-if="setting.welcomeLastBroadcast">
                <div class="broadcast-hint-pill">
                  <Icon icon="fluent:history-24-regular" width="14" height="14" />
                  <span>{{ $t('welcomeRecentBroadcast') }}: {{ formatDetailDate(setting.welcomeLastBroadcast) }}</span>
                </div>
              </div>
            </div>

            <div class="footer-right-actions">
              <!-- Secondary Button: 保存模板配置 -->
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

              <!-- Primary Action Button: 发送全员欢迎邮件 -->
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
const DEFAULT_WELCOME_SUBJECT = '🎉 欢迎来到 Epocanvas Mail · 开启你的专属独立域名邮箱体验'
const DEFAULT_WELCOME_CONTENT = `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ 你的专属独立域名邮箱已就绪</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">嗨 {{user_name}}，很高兴认识你！</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">零门槛免配置 · 纯净无广告 · 国内极速秒开 · 专属极客身份</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">嗨 {{user_name}}，欢迎加入 Epocanvas Mail！</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      很高兴能在这里与你相遇。这是一个由开发者精心搭建并免费开放给大家使用的专属独立域名邮箱。我们把底层复杂的域名购买、DNS 解析、MX/SPF 记录和云端服务器全部打包搞定——你不需要懂任何繁琐的技术，注册好就能直接拥有一张专属的高颜值域名名片。你的专属邮箱（{{user_email}}）已经准备好了！快来看看我们为你准备的贴心功能与上手指南吧：
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 专属极客名片 · 免买域名免配置
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">无需折腾 DNS 与 MX 解析，即刻拥有专属身份</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            告别繁琐复杂的域名购买与解析配置。在 Epocanvas Mail，直接拥有 <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@专属域名</code> 这样酷炫的邮箱地址，求职简历、技术交流或日常通讯，专业范与极客感瞬间拉满。
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ 零门槛即开即用</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ 多顶级域名随心选</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">专属极客域名名片</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS 激活</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF 权威验证</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM 密钥签发</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">隐私与数据安全监控台</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% 私密</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">商业广告扫描</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 追踪 / 0 广告</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">传输加密标准</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">绝不向第三方出售用户数据与信件画像</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">零开屏 · 零弹窗 · 纯粹邮箱通讯本位</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ 纯粹私密 · 零广告零商业变现
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">无开屏、不弹窗，绝不窥探你的邮件隐私</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            我们坚守邮箱通讯最纯粹的本质。没有令人烦躁的开屏广告、横幅推广和垃圾营销弹窗；后台绝不对你的信件做商业挖掘或行为画像分析，给你一个干净、清爽、安心的专属通讯空间。
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 纯净零弹窗</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 隐私绝不商用</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ 全球边缘网络 · 国内极速秒开
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Cloudflare 全球边缘 CDN 直连，无需代理毫秒响应</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            基于全球 300+ 边缘节点与国内高速 CDN 加速。无论你在哪里，无需开启任何代理工具，邮件毫秒级秒开加载、全球各大邮箱秒级送达，随时随地稳定顺畅不失联。
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 毫秒级秒开</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 全球边缘直达</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">全球边缘 CDN 网络直连</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">用户</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">国内直连</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ 节点</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">全球</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">秒级送达</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">智能收件箱代办流</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ 稍后代办</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">项目周报与架构评审</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ 明天 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">GitHub 安全警报通知</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星标</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒级全文即时检索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回车检索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 进阶工作流 · 极简轻快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍后处理 (Snooze)、星标代办与全文即时检索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            内置现代高效的工作流体验。重要的信件可以一键设为稍后提醒（Snooze），配合星标代办归档、自定义分类标签与全文即时检索，即使面对成百上千封邮件也能游刃有余、井井有条。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍后处理代办</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星标快捷归档</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 别名隔离 · 垃圾邮件一键熔断
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平台独立别名分发，外部泄露一键切断</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支持为 GitHub、Steam 或各类网站独立分配专属别名。一旦某个外部平台遭遇数据泄露或被垃圾营销骚扰，只需一键禁用该别名即可物理熔断，你的真实主邮箱永远安全隐身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一键物理熔断</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真实主号隐身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">多别名分发与单向熔断器</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ 保护主号</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">主</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">主邮箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 安全隐身</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● 通畅</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● 通畅</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ 已熔断</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 开启我的收件箱
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 设定个人资料与讯息
      </a>
    </div>

    <!-- 3-Step Quick Start Guide -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>新手 3 步快速上手指引</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. 体验星标与代办归档：</strong> 这封信已经自动放入你的【稍后代办】与【星标 / 重要】中，点击感受快捷归档。</div>
        <div><strong>2. 设定个人资料与外观：</strong> 前往「个人设置」上传属于你的专属头像、昵称，并切换喜欢的个性化主题。</div>
        <div><strong>3. 写下你的第一封信：</strong> 点击左上角「写邮件」，即刻体验流畅轻快的撰写与全球极速投递。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>贴心提示：</strong> 这是一封官方系统引导信件。站长设置了自动清理周期，到期后会自动安全清理，无需手动删除。</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">Epocanvas Mail 开发者团队 · 陪你开启高效每一天</div>
    </div>
  </div>
</div>`

const welcomeEmailShow = ref(false)
const isWelcomeFullscreen = ref(false)
const welcomeEditorRef = ref(null)
const welcomeEditorFormat = ref('rich') // 'rich' | 'source'
const sendingWelcome = ref(false)
const savingWelcome = ref(false)
const welcomeEmailForm = reactive({
  welcomeSubject: '',
  welcomeContent: '',
  welcomeText: '',
  welcomeExpireDays: 7,
  welcomeAutoSend: 1
})

function compileMarkdownToHtml(src) {
  if (!src) return ''
  let text = src.trim()

  // If already HTML container or document, retain as-is
  if (text.startsWith('<div') || text.startsWith('<html') || text.startsWith('<!DOCTYPE') || text.startsWith('<table') || text.startsWith('<section')) {
    return text
  }

  // Extract and preserve code blocks
  const codeBlocks = []
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`
    const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    codeBlocks.push(`<pre style="background: #0f172a; color: #f8fafc; padding: 14px 18px; border-radius: 8px; font-family: 'JetBrains Mono', Consolas, Monaco, monospace; font-size: 13px; overflow-x: auto; margin: 14px 0; line-height: 1.5;"><code>${escapedCode}</code></pre>`)
    return placeholder
  })

  // Headers
  text = text.replace(/^######\s+(.*)$/gm, '<h6 style="font-size: 13px; font-weight: 700; color: #334155; margin: 12px 0 6px;">$1</h6>')
  text = text.replace(/^#####\s+(.*)$/gm, '<h5 style="font-size: 14px; font-weight: 700; color: #334155; margin: 14px 0 6px;">$1</h5>')
  text = text.replace(/^####\s+(.*)$/gm, '<h4 style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 16px 0 8px;">$1</h4>')
  text = text.replace(/^###\s+(.*)$/gm, '<h3 style="font-size: 17px; font-weight: 700; color: #1e293b; margin: 18px 0 8px;">$1</h3>')
  text = text.replace(/^##\s+(.*)$/gm, '<h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 22px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">$1</h2>')
  text = text.replace(/^#\s+(.*)$/gm, '<h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 24px 0 12px; letter-spacing: -0.02em;">$1</h1>')

  // Blockquotes
  text = text.replace(/^>\s+(.*)$/gm, '<blockquote style="border-left: 4px solid #0078D4; background: #f0f9ff; margin: 12px 0; padding: 10px 16px; color: #0369a1; border-radius: 0 8px 8px 0; font-size: 13.5px; line-height: 1.6;">$1</blockquote>')

  // Horizontal rules
  text = text.replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />')
  text = text.replace(/^\*\*\*$/gm, '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />')

  // Bold and Italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: #0f172a;">$1</strong>')
  text = text.replace(/__(.*?)__/g, '<strong style="font-weight: 700; color: #0f172a;">$1</strong>')
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>')
  text = text.replace(/_(.*?)_/g, '<em>$1</em>')

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 12.5px; font-family: monospace;">$1</code>')

  // Links
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: #0078D4; text-decoration: underline; font-weight: 500;">$1</a>')

  // Unordered list items
  text = text.replace(/^[\t ]*[-*+][\t ]+(.*)$/gm, '<li>$1</li>')
  text = text.replace(/(<li>[\s\S]*?<\/li>[\n\r]*)+/g, (match) => `<ul style="margin: 12px 0 12px 24px; padding: 0; color: #334155; font-size: 14px; line-height: 1.65;">\n${match.trim()}\n</ul>\n`)

  // Paragraphs
  const paragraphs = text.split(/\n{2,}/).map(p => {
    p = p.trim()
    if (!p) return ''
    if (p.startsWith('<h') || p.startsWith('<blockquote') || p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<hr') || p.startsWith('<div') || p.startsWith('%%CODE_BLOCK_')) {
      return p
    }
    return `<p style="margin: 10px 0; font-size: 14px; line-height: 1.7; color: #334155;">${p.replace(/\n/g, '<br/>')}</p>`
  }).filter(Boolean).join('\n')

  let result = paragraphs
  codeBlocks.forEach((block, idx) => {
    result = result.replace(`%%CODE_BLOCK_${idx}%%`, block)
  })

  // Wrap in a Microsoft Fluent styled card container if not already wrapped
  if (!result.includes('max-width:')) {
    result = `<div style="max-width: 680px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; padding: 28px 32px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">\n${result}\n</div>`
  }

  return result
}

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
  welcomeEditorFormat.value = 'rich'
  isWelcomeFullscreen.value = false
  welcomeEmailShow.value = true
}

function toggleFullscreen() {
  isWelcomeFullscreen.value = !isWelcomeFullscreen.value
}

function insertMarkdownSyntax(prefix, suffix = '', defaultText = '内容') {
  const textarea = document.querySelector('.source-textarea-fullscreen textarea')
  if (!textarea) return
  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  const text = welcomeEmailForm.welcomeContent || ''
  const selected = text.substring(start, end)
  const innerText = selected || defaultText
  const replacement = `${prefix}${innerText}${suffix}`
  welcomeEmailForm.welcomeContent = text.substring(0, start) + replacement + text.substring(end)
  nextTick(() => {
    textarea.focus()
    const selectStart = start + prefix.length
    const selectEnd = selectStart + innerText.length
    textarea.setSelectionRange(selectStart, selectEnd)
  })
}

function resetToDefaultWelcomeTemplate() {
  welcomeEmailForm.welcomeSubject = DEFAULT_WELCOME_SUBJECT
  welcomeEmailForm.welcomeContent = DEFAULT_WELCOME_CONTENT
  if (welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
    welcomeEditorRef.value.clearEditor()
    nextTick(() => {
      if (welcomeEditorRef.value) {
        welcomeEditorRef.value.setContent(DEFAULT_WELCOME_CONTENT)
      }
    })
  }
  ElMessage.success(t('welcomeResetTemplate') || '已恢复官方默认模板')
}

function setEditorFormat(format) {
  if (welcomeEditorFormat.value === format) return
  if (format === 'rich') {
    // Switching from source/markdown to rich text
    let content = welcomeEmailForm.welcomeContent || ''
    content = compileMarkdownToHtml(content)
    welcomeEmailForm.welcomeContent = content
    welcomeEditorFormat.value = 'rich'
    nextTick(() => {
      if (welcomeEditorRef.value && welcomeEditorRef.value.setContent) {
        welcomeEditorRef.value.setContent(content)
      }
    })
  } else {
    // Switching from rich text to source
    if (welcomeEditorRef.value && welcomeEditorRef.value.getContent) {
      try {
        const current = welcomeEditorRef.value.getContent()
        if (current && current.trim()) {
          welcomeEmailForm.welcomeContent = current
        }
      } catch (e) {}
    }
    if (!welcomeEmailForm.welcomeContent || !welcomeEmailForm.welcomeContent.trim()) {
      welcomeEmailForm.welcomeContent = DEFAULT_WELCOME_CONTENT
    }
    welcomeEditorFormat.value = 'source'
  }
}

function clearWelcomeContent() {
  welcomeEmailForm.welcomeContent = ''
  if (welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
    welcomeEditorRef.value.clearEditor()
  }
}

function onWelcomeContentChange(content) {
  welcomeEmailForm.welcomeContent = content
}

function closeWelcomeDialog() {
  welcomeEditorFormat.value = 'rich'
  isWelcomeFullscreen.value = false
}

function saveWelcomeTemplate() {
  if (savingWelcome.value) return
  let finalContent = welcomeEmailForm.welcomeContent || ''
  if (welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
    const current = welcomeEditorRef.value.getContent()
    if (current !== undefined) {
      finalContent = current
    }
  }
  finalContent = compileMarkdownToHtml(finalContent)
  welcomeEmailForm.welcomeContent = finalContent

  savingWelcome.value = true
  const payload = {
    welcomeSubject: welcomeEmailForm.welcomeSubject || DEFAULT_WELCOME_SUBJECT,
    welcomeContent: finalContent,
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
  let finalContent = welcomeEmailForm.welcomeContent || ''
  if (welcomeEditorFormat.value === 'rich' && welcomeEditorRef.value) {
    const current = welcomeEditorRef.value.getContent()
    if (current !== undefined) {
      finalContent = current
    }
  }
  finalContent = compileMarkdownToHtml(finalContent)
  welcomeEmailForm.welcomeContent = finalContent

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
      welcomeContent: finalContent,
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

:deep(.notice-popup.el-dialog), :deep(.auth-prompt-dialog.el-dialog) {
  min-height: 300px;
  width: 1160px !important;
  max-width: min(1160px, calc(100vw - 32px)) !important;
  @media (max-width: 1200px) {
    width: calc(100% - 32px) !important;
    margin-right: 16px !important;
    margin-left: 16px !important;
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
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 5px 12px !important;
  line-height: 1 !important;
  box-sizing: border-box !important;

  :deep(span) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1 !important;
    gap: 4px !important;
  }

  :deep(svg), svg {
    display: block !important;
    margin: 0 auto !important;
    flex-shrink: 0 !important;
    vertical-align: middle !important;
  }
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

/* Welcome Email Dialog Architecture (Spacious Modal Canvas + Fullscreen Mode) */
:deep(.welcome-dialog-canvas) {
  width: min(1140px, calc(100vw - 48px)) !important;
  max-width: min(1140px, calc(100vw - 48px)) !important;
  margin: 3.5vh auto !important;
  max-height: calc(100vh - 7vh) !important;
  border-radius: 16px !important;
  background: var(--el-bg-color);
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--el-border-color-lighter) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  z-index: 2000;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &.is-fullscreen {
    position: fixed !important;
    top: 50px !important; /* Retain global top header */
    bottom: 22px !important; /* Retain global bottom statusbar */
    left: 12px !important;
    right: 12px !important;
    width: calc(100vw - 24px) !important;
    max-width: calc(100vw - 24px) !important;
    height: calc(100vh - 72px) !important;
    max-height: calc(100vh - 72px) !important;
    margin: 0 !important;
    border-radius: 12px !important;

    .el-dialog__body {
      height: calc(100vh - 190px) !important;
      max-height: calc(100vh - 190px) !important;
    }
  }

  .el-dialog__header {
    margin-right: 0;
    padding: 14px 24px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
    flex-shrink: 0;
  }

  .el-dialog__body {
    padding: 16px 24px;
    background: var(--el-bg-color);
    overflow-y: auto;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: calc(100vh - 200px);
    max-height: calc(100vh - 200px);
  }

  .el-dialog__footer {
    padding: 12px 24px;
    border-top: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
    flex-shrink: 0;
  }
}

:deep(.el-overlay:has(.welcome-dialog-canvas.is-fullscreen)) {
  top: 50px !important;
  bottom: 22px !important;
  height: calc(100vh - 72px) !important;
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
    gap: 12px;
    min-width: 0;
    flex-shrink: 0;

    .quill-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      flex-shrink: 0;
      line-height: 1;

      :deep(svg), svg {
        display: block;
        margin: 0 auto;
        flex-shrink: 0;
      }
    }

    .dialog-main-title {
      font-size: 16.5px;
      font-weight: 700;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      flex-shrink: 0;
    }
  }

  .top-spacer {
    flex: 1 1 auto;
    min-width: 12px;
  }

  .top-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
}

/* Strictly centered Tool Icon Buttons */
.tool-icon-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 32px !important;
  height: 32px !important;
  border-radius: 8px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: var(--el-text-color-regular) !important;
  cursor: pointer !important;
  padding: 0 !important;
  margin: 0 !important;
  line-height: 1 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;

  .btn-text-badge {
    font-size: 13px !important;
    font-weight: 800 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    line-height: 1 !important;
    letter-spacing: -0.5px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 auto !important;
  }

  :deep(svg), :deep(.iconify), svg {
    display: block !important;
    margin: 0 auto !important;
    flex-shrink: 0 !important;
    vertical-align: middle !important;
    width: 17px !important;
    height: 17px !important;
  }

  &:hover {
    background: var(--el-fill-color) !important;
    color: var(--el-color-primary) !important;
  }

  &.active {
    background: rgba(0, 120, 212, 0.12) !important;
    color: #0078D4 !important;
    border-color: rgba(0, 120, 212, 0.3) !important;
    font-weight: 600 !important;
  }

  &.danger-hover:hover {
    background: rgba(239, 68, 68, 0.1) !important;
    color: #ef4444 !important;
  }
}

/* Unified Editor Mode Switch (Segmented Toggle Control) */
.editor-mode-switch {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  background: var(--el-fill-color-darker, #e2e8f0);
  border: 1px solid var(--el-border-color-lighter, #cbd5e1);
  border-radius: 8px;
  gap: 2px;

  .mode-switch-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--el-text-color-secondary, #64748b);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    .iconify, svg {
      display: block;
      width: 16px;
      height: 16px;
      margin: 0 auto;
    }

    &:hover {
      color: var(--el-text-color-primary, #0f172a);
    }

    &.is-active {
      background: var(--el-bg-color, #ffffff);
      color: #0078D4;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }
  }
}

.tool-divider {
  width: 1px;
  height: 18px;
  background: var(--el-border-color-lighter);
  margin: 0 4px;
  flex-shrink: 0;
}

.welcome-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;

  .welcome-recipients-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    flex-shrink: 0;

    .recipients-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      font-size: 13.5px;
      color: var(--el-text-color-regular);

      .recipients-icon {
        color: var(--el-color-primary);
        display: block;
      }
    }

    .recipients-content {
      display: flex;
      align-items: center;
      gap: 8px;

      .audience-pill {
        display: inline-flex;
        align-items: center;
        background: var(--el-bg-color);
        padding: 4px 14px;
        border-radius: 9999px;
        border: 1px solid var(--el-border-color-lighter);
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .recipients-subtext {
        font-size: 12.5px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .welcome-subject-bar {
    flex-shrink: 0;

    .write-subject-input :deep(.el-input__wrapper) {
      border-radius: 10px;
      font-weight: 600;
      padding: 8px 16px;
      font-size: 15px;
      height: 44px;
    }
  }

  .welcome-editor-card {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
    overflow: hidden;
    min-height: 380px;
    background: var(--el-bg-color);

    .editor-toolbar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--el-fill-color-light);
      border-bottom: 1px solid var(--el-border-color-lighter);
      flex-shrink: 0;

      .editor-left-tools {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-wrap: wrap;

        .tool-subgroup {
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }

        .rich-mode-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          background: var(--el-color-primary-light-9, rgba(0, 120, 212, 0.12));
          color: var(--el-color-primary, #0078D4);
          font-size: 12.5px;
          font-weight: 600;

          svg {
            display: block;
            width: 15px;
            height: 15px;
            margin: 0 auto;
          }
        }
      }

      .toolbar-spacer {
        flex: 1 1 auto;
        min-width: 12px;
      }

      .editor-right-tools {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
    }

    .editor-mount-area {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 340px;
      height: 100%;

      .dialog-tiny-editor {
        flex: 1 1 auto;
        height: 100% !important;
        min-height: 340px;
      }

      .source-editor-fullscreen {
        flex: 1 1 auto;
        height: 100%;
        display: flex;
        flex-direction: column;

        .source-textarea-fullscreen {
          flex: 1 1 auto;
          height: 100%;
          display: flex;

          :deep(.el-textarea__inner) {
            height: 100% !important;
            min-height: 340px;
            font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
            font-size: 13.5px;
            line-height: 1.65;
            border: none;
            border-radius: 0;
            padding: 16px 20px;
            background: var(--el-bg-color);
            color: var(--el-text-color-primary);
          }
        }
      }
    }
  }
}

.welcome-fullscreen-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;

  .footer-left-rules {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;

    .rule-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      color: var(--el-text-color-regular);

      .rule-label {
        font-weight: 600;
        white-space: nowrap;
      }
    }

    .broadcast-hint-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 14px;
      border-radius: 9999px;
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      font-size: 12.5px;
      color: var(--el-text-color-secondary);
    }
  }

  .footer-right-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;

    .btn-save-secondary {
      height: 40px;
      padding: 0 20px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 13.5px;
      background: transparent;
      border: 1.5px solid var(--el-border-color);
      color: var(--el-text-color-regular);
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--el-color-primary);
        color: var(--el-color-primary);
        background: var(--el-fill-color-light);
        transform: translateY(-1px);
      }
    }

    .btn-broadcast-primary {
      height: 40px;
      padding: 0 26px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 14px;
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%) !important;
      border: none !important;
      color: #ffffff !important;
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

      &:hover {
        box-shadow: 0 6px 22px rgba(37, 99, 235, 0.55);
        transform: translateY(-1.5px);
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
  border: none !important;
  border-radius: 0 !important;
  overflow: hidden;
  background: var(--el-bg-color) !important;

  .tox-editor-container {
    background: var(--el-bg-color) !important;
  }

  .tox-editor-header,
  [data-alloy-vertical-dir="toptobottom"] {
    background: var(--el-bg-color-overlay) !important;
    border-bottom: 1px solid var(--el-border-color-lighter) !important;
    padding: 4px 6px !important;
    margin: 0 !important;
    box-shadow: none !important;
  }

  .tox-toolbar-overlord {
    background: transparent !important;
  }

  .tox-toolbar, .tox-toolbar__primary {
    background: transparent !important;
    border-bottom: none !important;
    padding: 0 !important;
    gap: 2px !important;
    display: flex !important;
    align-items: center !important;
  }

  .tox-toolbar__group {
    display: inline-flex !important;
    align-items: center !important;
    gap: 2px !important;
    padding: 0 2px !important;
    margin: 0 !important;
    border: none !important;
  }

  /* Regular Icon Buttons */
  .tox-tbtn:not(.tox-tbtn--select) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 28px !important;
    height: 28px !important;
    min-width: 28px !important;
    max-width: 28px !important;
    margin: 0 1px !important;
    padding: 0 !important;
    border: 1px solid transparent !important;
    border-radius: 6px !important;
    background: transparent !important;
    color: var(--el-text-color-regular) !important;
    box-sizing: border-box !important;
    line-height: 1 !important;
    cursor: pointer !important;
    overflow: hidden !important;
    transition: all 0.15s ease !important;

    .tox-icon,
    .tox-tbtn__icon-custom {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 auto !important;
      padding: 0 !important;
      line-height: 1 !important;
    }

    svg {
      display: block !important;
      width: 15px !important;
      height: 15px !important;
      max-width: 15px !important;
      max-height: 15px !important;
      margin: 0 auto !important;
      padding: 0 !important;
      flex-shrink: 0 !important;
      vertical-align: middle !important;
      fill: currentColor !important;
    }

    &:hover {
      background: var(--el-fill-color) !important;
      color: var(--el-color-primary) !important;
    }

    &.tox-tbtn--enabled, &[aria-pressed="true"] {
      background: var(--el-color-primary-light-9, rgba(91, 110, 245, 0.12)) !important;
      color: var(--el-color-primary) !important;
      font-weight: 600 !important;
    }

    &.tox-tbtn--disabled, &[aria-disabled="true"] {
      opacity: 0.35 !important;
      cursor: not-allowed !important;
      background: transparent !important;
    }
  }

  /* Select Dropdowns (Blocks, Font Size, Tables) */
  .tox-tbtn.tox-tbtn--select {
    width: auto !important;
    min-width: 68px !important;
    max-width: 100px !important;
    height: 28px !important;
    padding: 0 8px !important;
    margin: 0 1px !important;
    border: 1px solid transparent !important;
    border-radius: 6px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 4px !important;
    color: var(--el-text-color-regular) !important;
    background: transparent !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;

    &:hover {
      background: var(--el-fill-color) !important;
      color: var(--el-color-primary) !important;
    }

    .tox-tbtn__select-label {
      display: inline-block !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      color: inherit !important;
      margin: 0 !important;
      padding: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      line-height: 28px !important;
      text-align: left !important;
    }

    .tox-tbtn__select-chevron {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 0 0 auto !important;
      padding: 0 !important;
      width: 12px !important;
      height: 12px !important;
      flex-shrink: 0 !important;

      svg {
        display: block !important;
        width: 10px !important;
        height: 10px !important;
        margin: 0 auto !important;
        fill: currentColor !important;
      }
    }
  }

  /* Split Buttons */
  .tox-split-button {
    height: 28px !important;
    margin: 0 1px !important;
    padding: 0 !important;
    border-radius: 6px !important;
    display: inline-flex !important;
    align-items: center !important;
    overflow: hidden !important;
    border: 1px solid transparent !important;
    transition: all 0.15s ease !important;

    &:hover {
      background: var(--el-fill-color) !important;
    }

    & > .tox-tbtn {
      width: 22px !important;
      min-width: 22px !important;
      max-width: 22px !important;
      height: 28px !important;
      border-radius: 6px 0 0 6px !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;

      svg {
        display: block !important;
        width: 14px !important;
        height: 14px !important;
        margin: 0 auto !important;
      }
    }

    & > .tox-split-button__chevron {
      width: 12px !important;
      min-width: 12px !important;
      max-width: 12px !important;
      height: 28px !important;
      border-radius: 0 6px 6px 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;

      &:hover {
        background: var(--el-fill-color-darker) !important;
      }

      svg {
        display: block !important;
        width: 8px !important;
        height: 8px !important;
        margin: 0 auto !important;
        fill: currentColor !important;
      }
    }
  }

  .tox-separator {
    height: 16px !important;
    width: 1px !important;
    margin: 0 4px !important;
    background: var(--el-border-color-lighter) !important;
    border: none !important;
    flex-shrink: 0 !important;
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
