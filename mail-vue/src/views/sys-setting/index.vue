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
                <div>
                  <span>{{ $t('emailPrefix') }}</span>
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
          <div class="settings-card">
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
            <div class="card-title">{{ $t('turnstileSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('signUpVerification') }}</span></div>
                <div>
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
                <div><span>{{ $t('addEmailVerification') }}</span></div>
                <div>
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
                <div><span>Site Key</span></div>
                <div class="bot-verify">
                  <span>{{ setting.siteKey }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>Secret Key</span></div>
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

      <el-dialog v-model="regVerifyCountShow" :title="$t('rulesVerifyTitle',{count: regVerifyCount})"
                 @closed="regVerifyCount = setting.regVerifyCount">
        <form>
          <el-input-number type="text" v-model="regVerifyCount" :min="1">
          </el-input-number>
          <el-button type="primary" :loading="settingLoading" @click="saveRegVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="addVerifyCountShow" :title="$t('rulesVerifyTitle',{count: addVerifyCount})"
                 @closed="addVerifyCount = setting.addVerifyCount">
        <form>
          <el-input-number type="text" v-model="addVerifyCount" :min="1"/>
          <el-button type="primary" :loading="settingLoading" @click="saveAddVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
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
      <el-dialog v-model="emailPrefixShow" :title="t('emailPrefix')"  @closed="resetEmailPrefix"  >
        <div class="email-prefix">
          <div>{{ t('atLeast') }}</div>
          <el-input-number v-model="minEmailPrefix" :min="1" :max="20" style="width: 150px" >
            <template #suffix>
              <span>{{ t('character') }}</span>
            </template>
          </el-input-number>
        </div>
        <div class="prefix-filter">
          <div style="margin-bottom: 10px;">{{ t('mustNotContain') }}</div>
          <el-input-tag style="margin-bottom: 10px;" v-model="emailPrefixFilter"  />
        </div>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveEmailPrefix">{{ $t('save') }}</el-button>
      </el-dialog>
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
import {deleteBackground, setBackground, setBlackList, settingQuery, settingSet} from "@/request/setting.js";
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
import {getTextWidth} from "@/utils/text.js";
import {fileToBase64} from "@/utils/file-utils.js"
import {useI18n} from 'vue-i18n';
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
  minEmailPrefix.value = setting.value.minEmailPrefix
  emailPrefixFilter.value = setting.value.emailPrefixFilter
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
  const form = {}
  form.minEmailPrefix = minEmailPrefix.value
  form.emailPrefixFilter = emailPrefixFilter.value
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
  width: 860px !important;
  @media (max-width: 900px) {
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
      font-weight: bold;;
    }
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

</style>

<style>
.el-popper.is-dark {
}
</style>
