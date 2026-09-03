<template>
  <div class="box general-settings-page">
    
    <!-- Section 1: 个人简介 (Bio) -->
    <div class="container">
      <div class="title">{{ $t('bio') || '个人简介' }}</div>
      <div class="item bio-item">
        <div>{{ $t('bio') || '个人签名' }}</div>
        <div class="bio-preview-group">
          <div class="bio-preview-box">
            <div class="bio-display" v-html="parseInlineMarkdown(userStore.user.bio) || ($t('notSet') || '未设置个人简介')"></div>
          </div>
          <el-button class="opt-button" size="small" type="primary" plain @click="showSetBio">
            <Icon icon="lsicon:edit-outline" width="16" height="16" />
          </el-button>
        </div>
      </div>
    </div>

    <!-- Section 2: 外观与主栏美化 (Appearance & Wallpaper) -->
    <div class="container">
      <div class="title">{{ $t('visualMedia') || '外观与美化' }}</div>

      <!-- 1. 外观色调 (长方形并排卡片，不霸占整行) -->
      <div class="item theme-item">
        <div>{{ $t('themeMode') || '外观色调' }}</div>
        <div class="theme-options-group">
          <!-- Dark Mode -->
          <div 
            class="theme-rect-card" 
            :class="{ active: uiStore.themeMode === 'dark' }"
            @click="setTheme('dark')"
          >
            <div class="theme-rect-preview theme-dark-preview">
              <div class="mini-sidebar"></div>
              <div class="mini-content">
                <div class="mini-line sm"></div>
                <div class="mini-line"></div>
              </div>
            </div>
            <div class="theme-rect-label">
              <Icon icon="fluent:weather-moon-20-filled" width="14" height="14" />
              <span>{{ $t('darkMode') || '暗色调' }}</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.themeMode === 'dark'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>

          <!-- Light Mode -->
          <div 
            class="theme-rect-card" 
            :class="{ active: uiStore.themeMode === 'light' }"
            @click="setTheme('light')"
          >
            <div class="theme-rect-preview theme-light-preview">
              <div class="mini-sidebar"></div>
              <div class="mini-content">
                <div class="mini-line sm"></div>
                <div class="mini-line"></div>
              </div>
            </div>
            <div class="theme-rect-label">
              <Icon icon="fluent:weather-sunny-20-filled" width="14" height="14" />
              <span>{{ $t('lightMode') || '亮色调' }}</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.themeMode === 'light'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>

          <!-- Follow System -->
          <div 
            class="theme-rect-card" 
            :class="{ active: uiStore.themeMode === 'auto' || uiStore.themeMode === 'system' }"
            @click="setTheme('auto')"
          >
            <div class="theme-rect-preview theme-auto-preview">
              <div class="half-side dark-side">
                <div class="mini-sidebar"></div>
              </div>
              <div class="half-side light-side">
                <div class="mini-content">
                  <div class="mini-line sm"></div>
                </div>
              </div>
            </div>
            <div class="theme-rect-label">
              <Icon icon="fluent:desktop-20-filled" width="14" height="14" />
              <span>{{ $t('systemMode') || '跟随系统' }}</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.themeMode === 'auto' || uiStore.themeMode === 'system'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 主栏底层图片设置 (仅作用于中央主栏，商业级质感) -->
      <!-- 2. 全局主题壁纸 (5x2 网格，尺寸与外观色调卡片统一) -->
      <div class="item wallpaper-item">
        <div>
          <div>{{ $t('mainPanelWallpaper') || '全局主题壁纸' }}</div>
          <div class="sub-hint">应用于全站整体背景</div>
        </div>
        <div class="wallpaper-control-wrap">
          <!-- 预设主题列表与自定义加号卡片 (5x2 范围) -->
          <div class="wallpaper-presets-grid">
            <div 
              v-for="preset in THEME_PRESETS" 
              :key="preset.id"
              class="wallpaper-card"
              :class="{ active: currentWallpaperId === preset.id }"
              @click="selectPresetWallpaper(preset)"
            >
              <div 
                class="wallpaper-thumb" 
                :style="getPresetThumbStyle(preset)"
              >
                <div class="active-check-badge" v-if="currentWallpaperId === preset.id">
                  <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
                </div>
              </div>
              <span class="wallpaper-name">{{ langSelect === 'en' ? preset.nameEn : preset.nameZh }}</span>
            </div>

            <!-- 自定义壁纸加号卡片 -->
            <div 
              class="wallpaper-card wallpaper-add-card"
              :class="{ active: isCustomWallpaperActive }"
              @click="customWallpaperDialogShow = true"
            >
              <div class="wallpaper-thumb add-thumb">
                <Icon icon="fluent:add-24-filled" width="22" height="22" />
                <div class="active-check-badge" v-if="isCustomWallpaperActive">
                  <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
                </div>
              </div>
              <span class="wallpaper-name">{{ $t('customWallpaper') || '自定义' }}</span>
            </div>
          </div>

          <!-- 透光度滑块 -->
          <div class="opacity-slider-row" v-if="uiStore.themeWallpaper && uiStore.themeWallpaper !== 'none'">
            <span class="opacity-label">{{ $t('wallpaperOpacity') || '界面透光度' }}：{{ uiStore.themeWallpaperOpacity || 85 }}%</span>
            <el-slider 
              v-model="sliderOpacity" 
              :min="50" 
              :max="100" 
              :step="5"
              style="width: 200px;"
              @change="onOpacityChange"
            />
          </div>
        </div>
      </div>

      <!-- 3. 个人背景封面设置 (主要针对账户详情界面的 cover-photo) -->
      <div class="item wallpaper-item">
        <div>
          <div>{{ $t('profileCoverPhoto') || '个人背景' }}</div>
          <div class="sub-hint">账户详情与公开主页封面</div>
        </div>
        <div class="wallpaper-control-wrap">
          <div class="wallpaper-presets-grid cover-presets-grid">
            <div 
              v-for="preset in COVER_PRESETS" 
              :key="preset.id"
              class="wallpaper-card"
              :class="{ active: currentCoverUrl === preset.url }"
              @click="selectPresetCover(preset)"
            >
              <div 
                class="wallpaper-thumb" 
                :style="getCoverThumbStyle(preset)"
              >
                <div class="active-check-badge" v-if="currentCoverUrl === preset.url">
                  <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
                </div>
              </div>
              <span class="wallpaper-name">{{ langSelect === 'en' ? preset.nameEn : preset.nameZh }}</span>
            </div>

            <!-- 自定义封面加号卡片 -->
            <div 
              class="wallpaper-card wallpaper-add-card"
              :class="{ active: isCustomCoverActive }"
              @click="customCoverDialogShow = true"
            >
              <div class="wallpaper-thumb add-thumb">
                <Icon icon="fluent:add-24-filled" width="22" height="22" />
                <div class="active-check-badge" v-if="isCustomCoverActive">
                  <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
                </div>
              </div>
              <span class="wallpaper-name">{{ $t('customCover') || '自定义' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: 偏好设置 (Preferences) -->
    <div class="container">
      <div class="title">{{ $t('preferences') || '偏好设置' }}</div>

      <!-- 1. 视图密度 (Density) -->
      <div class="item density-item">
        <div>{{ $t('density') || '视图密度' }}</div>
        <div class="density-group">
          <!-- 默认 (54px) -->
          <div 
            class="density-card" 
            :class="{ active: uiStore.density === 'default' }"
            @click="selectDensity('default')"
          >
            <div class="density-demo">
              <div class="demo-line def"><div class="demo-dot"></div><div class="demo-bar"></div></div>
              <div class="demo-line def"><div class="demo-dot"></div><div class="demo-bar"></div></div>
            </div>
            <div class="density-meta">
              <span class="d-name">{{ $t('densityDefault') || '默认' }}</span>
              <span class="d-sub">54px</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.density === 'default'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>

          <!-- 宽松 (48px) -->
          <div 
            class="density-card" 
            :class="{ active: uiStore.density === 'comfortable' }"
            @click="selectDensity('comfortable')"
          >
            <div class="density-demo">
              <div class="demo-line comf"><div class="demo-dot"></div><div class="demo-bar"></div></div>
              <div class="demo-line comf"><div class="demo-dot"></div><div class="demo-bar"></div></div>
              <div class="demo-line comf"><div class="demo-dot"></div><div class="demo-bar"></div></div>
            </div>
            <div class="density-meta">
              <span class="d-name">{{ $t('densityComfortable') || '宽松' }}</span>
              <span class="d-sub">48px</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.density === 'comfortable'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>

          <!-- 紧凑 (36px) -->
          <div 
            class="density-card" 
            :class="{ active: uiStore.density === 'compact' }"
            @click="selectDensity('compact')"
          >
            <div class="density-demo">
              <div class="demo-line comp"><div class="demo-bar full"></div></div>
              <div class="demo-line comp"><div class="demo-bar full"></div></div>
              <div class="demo-line comp"><div class="demo-bar full"></div></div>
              <div class="demo-line comp"><div class="demo-bar full"></div></div>
            </div>
            <div class="density-meta">
              <span class="d-name">{{ $t('densityCompact') || '紧凑' }}</span>
              <span class="d-sub">36px</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.density === 'compact'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 收件箱类型 (Inbox Type) -->
      <div class="item inbox-type-item">
        <div>{{ $t('inboxType') || '收件箱类型' }}</div>
        <div class="inbox-type-wrapper">
          <!-- 1. Default (Customize) -->
          <div class="inbox-type-row">
            <el-radio v-model="uiStore.inboxType" label="default" @change="onInboxTypeChange">
              <span class="type-name">{{ $t('inboxTypeDefault') || '默认收件箱' }}</span>
              <span class="type-desc">{{ $t('inboxTypeDefaultDesc') || '按主要、推广、社交、更新等分类标签组织' }}</span>
            </el-radio>
            <el-button 
              size="small" 
              type="primary" 
              plain 
              class="customize-btn"
              @click="openCustomizeModal('default')"
            >
              {{ $t('customize') || '自定义' }}
            </el-button>
          </div>

          <!-- 2. Important first -->
          <div class="inbox-type-row">
            <el-radio v-model="uiStore.inboxType" label="important" @change="onInboxTypeChange">
              <span class="type-name">{{ $t('inboxTypeImportant') || '重要邮件优先' }}</span>
              <span class="type-desc">{{ $t('inboxTypeImportantDesc') || '顶部展示重要邮件，下方展示其余邮件' }}</span>
            </el-radio>
          </div>

          <!-- 3. Unread first -->
          <div class="inbox-type-row">
            <el-radio v-model="uiStore.inboxType" label="unread" @change="onInboxTypeChange">
              <span class="type-name">{{ $t('inboxTypeUnread') || '未读邮件优先' }}</span>
              <span class="type-desc">{{ $t('inboxTypeUnreadDesc') || '顶部展示未读邮件，下方展示已读邮件' }}</span>
            </el-radio>
          </div>

          <!-- 4. Starred first -->
          <div class="inbox-type-row">
            <el-radio v-model="uiStore.inboxType" label="starred" @change="onInboxTypeChange">
              <span class="type-name">{{ $t('inboxTypeStarred') || '星标邮件优先' }}</span>
              <span class="type-desc">{{ $t('inboxTypeStarredDesc') || '顶部展示星标邮件，下方展示其余邮件' }}</span>
            </el-radio>
          </div>

          <!-- 5. Priority Inbox (Customize) -->
          <div class="inbox-type-row">
            <el-radio v-model="uiStore.inboxType" label="priority" @change="onInboxTypeChange">
              <span class="type-name">{{ $t('inboxTypePriority') || '优先收件箱' }}</span>
              <span class="type-desc">{{ $t('inboxTypePriorityDesc') || '自定义重要且未读、星标等多组智能分区' }}</span>
            </el-radio>
            <el-button 
              size="small" 
              type="primary" 
              plain 
              class="customize-btn"
              @click="openCustomizeModal('priority')"
            >
              {{ $t('customize') || '自定义' }}
            </el-button>
          </div>

          <!-- 6. Multiple Inboxes (Customize) -->
          <div class="inbox-type-row">
            <el-radio v-model="uiStore.inboxType" label="multiple" @change="onInboxTypeChange">
              <span class="type-name">{{ $t('inboxTypeMultiple') || '多收件箱' }}</span>
              <span class="type-desc">{{ $t('inboxTypeMultipleDesc') || '配置多组独立查询面板堆叠展示' }}</span>
            </el-radio>
            <el-button 
              size="small" 
              type="primary" 
              plain 
              class="customize-btn"
              @click="openCustomizeModal('multiple')"
            >
              {{ $t('customize') || '自定义' }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 3. 阅读窗格 (Reading Pane - 精简纯粹) -->
      <div class="item pane-item">
        <div>{{ $t('readingPane') || '阅读窗格' }}</div>
        <div class="pane-options-group">
          <!-- 1. No split -->
          <div 
            class="pane-card" 
            :class="{ active: uiStore.readingPane === 'no_split' }"
            @click="selectReadingPane('no_split')"
          >
            <div class="pane-preview no-split">
              <div class="pane-box full-list"></div>
            </div>
            <div class="pane-meta">
              <span class="p-name">{{ $t('readingPaneNoSplit') || '无拆分' }}</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.readingPane === 'no_split'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>

          <!-- 2. Right of inbox -->
          <div 
            class="pane-card" 
            :class="{ active: uiStore.readingPane === 'right' }"
            @click="selectReadingPane('right')"
          >
            <div class="pane-preview right-split">
              <div class="pane-box left-list"></div>
              <div class="pane-box right-read"></div>
            </div>
            <div class="pane-meta">
              <span class="p-name">{{ $t('readingPaneRight') || '收件箱右侧' }}</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.readingPane === 'right'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>

          <!-- 3. Below inbox -->
          <div 
            class="pane-card" 
            :class="{ active: uiStore.readingPane === 'below' }"
            @click="selectReadingPane('below')"
          >
            <div class="pane-preview below-split">
              <div class="pane-box top-list"></div>
              <div class="pane-box bottom-read"></div>
            </div>
            <div class="pane-meta">
              <span class="p-name">{{ $t('readingPaneBelow') || '收件箱下方' }}</span>
            </div>
            <div class="active-check-badge" v-if="uiStore.readingPane === 'below'">
              <Icon icon="fluent:checkmark-12-filled" width="10" height="10" />
            </div>
          </div>
        </div>
      </div>

      <!-- 4. 邮件会话模式 (Email Threading - 带问号提示) -->
      <div class="item">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>{{ $t('emailThreading') || '邮件会话模式' }}</span>
          <el-tooltip :content="$t('conversationViewDesc') || '将同一主题的相关邮件聚合成对话'" placement="top">
            <Icon icon="fluent:question-circle-16-regular" width="16" height="16" style="cursor: pointer; color: var(--text-muted); vertical-align: middle;" />
          </el-tooltip>
        </div>
        <div class="threading-control">
          <el-switch 
            :model-value="uiStore.conversationView ?? true" 
            @change="onConversationViewChange"
          />
        </div>
      </div>

      <!-- 5. 系统语言 (带锚点 #language-section) -->
      <div class="item" id="language-section">
        <div>{{ $t('systemLanguage') || '系统语言' }}</div>
        <div>
          <el-select
            :model-value="langSelect"
            class="language-select"
            placeholder="Select"
            style="width: 150px;"
            @change="changeLang"
          >
            <el-option label="中文 (简体)" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
            <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
          </el-select>
        </div>
      </div>
    </div>

    <!-- Section 4: 数据隐私 (Data Privacy) -->
    <div class="container">
      <div class="title">{{ $t('dataPrivacy') || '数据隐私' }}</div>
      <div class="privacy-group">
        <div class="privacy-item">
          <span>{{ $t('showStats') || '展示数据统计' }}</span>
          <el-switch :model-value="userStore.user.showStats ?? true" @change="val => savePrivacy('showStats', val)" />
        </div>
        <div class="privacy-item">
          <span>{{ $t('showTrend') || '展示态势分布' }}</span>
          <el-switch :model-value="userStore.user.showTrend ?? true" @change="val => savePrivacy('showTrend', val)" />
        </div>
        <div class="privacy-item">
          <span>{{ $t('showSources') || '展示来源分布' }}</span>
          <el-switch :model-value="userStore.user.showSources ?? true" @change="val => savePrivacy('showSources', val)" />
        </div>
      </div>
    </div>

    <!-- DIALOG: 个人简介编辑弹窗 -->
    <el-dialog v-model="bioDialogShow" :title="$t('bio') || '个人简介'" width="400px">
      <div style="padding: 10px 0;">
        <el-input 
          type="textarea" 
          :rows="5"
          :maxlength="150" 
          show-word-limit
          v-model="accountBio" 
          :placeholder="$t('bioPlaceholder') || '在这里输入个人简介...（支持 **加粗**、*斜体* 等 Markdown 语法）'"
        />
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="bioDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="bioLoading" @click="saveBio">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 默认收件箱标签自定义弹窗 -->
    <el-dialog 
      v-model="customizeDefaultShow" 
      :title="$t('customizeInbox') || '自定义收件箱设置'" 
      width="440px"
    >
      <div style="padding: 6px 0;">
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">选择要在收件箱中显示的分类标签页：</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <el-checkbox v-model="defaultCatConfig.primary" disabled>
            <span style="font-weight: bold;">主要 (Primary)</span> - 核心通信（必选）
          </el-checkbox>
          <el-checkbox v-model="defaultCatConfig.promotions">
            <span>推广 (Promotions)</span> - 商业促销与折扣简报
          </el-checkbox>
          <el-checkbox v-model="defaultCatConfig.social">
            <span>社交 (Social)</span> - 社交网络与媒体动态
          </el-checkbox>
          <el-checkbox v-model="defaultCatConfig.updates">
            <span>订阅与动态 (Updates)</span> - 账单、收据与系统通知
          </el-checkbox>
          <el-checkbox v-model="defaultCatConfig.forums">
            <span>论坛 (Forums)</span> - 讨论群组与邮件列表
          </el-checkbox>
        </div>
        <el-divider style="margin: 14px 0;" />
        <el-checkbox v-model="defaultCatConfig.includeStarredInPrimary">
          <span>{{ $t('includeStarredInPrimary') || '将星标邮件纳入主要标签' }}</span>
        </el-checkbox>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="customizeDefaultShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" @click="saveDefaultCustomize">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 优先收件箱自定义弹窗 -->
    <el-dialog 
      v-model="customizePriorityShow" 
      :title="$t('customizePriority') || '自定义优先收件箱分区'" 
      width="480px"
    >
      <div style="padding: 6px 0;">
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">配置4个独立分区与显示条数：</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div v-for="(sec, sIdx) in priorityConfig.sections" :key="sIdx" style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 55px; font-size: 13px; font-weight: 600;">分区 {{ sIdx + 1 }}:</span>
            <el-select v-model="sec.type" size="small" style="width: 170px;">
              <el-option label="重要且未读" value="important_unread" />
              <el-option label="重要邮件" value="important" />
              <el-option label="未读邮件" value="unread" />
              <el-option label="星标邮件" value="starred" />
              <el-option label="无 (隐藏分区)" value="none" />
              <el-option v-if="sIdx === 3" label="其余所有邮件" value="everything" />
            </el-select>
            <el-select v-model="sec.maxItems" size="small" style="width: 90px;">
              <el-option :label="'5 条'" :value="5" />
              <el-option :label="'10 条'" :value="10" />
              <el-option :label="'25 条'" :value="25" />
              <el-option :label="'50 条'" :value="50" />
            </el-select>
          </div>
        </div>
        <el-divider style="margin: 14px 0;" />
        <el-checkbox v-model="priorityConfig.hideEmpty">
          <span>{{ $t('hideSectionWhenEmpty') || '分区为空时自动隐藏' }}</span>
        </el-checkbox>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="customizePriorityShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" @click="savePriorityCustomize">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 多收件箱自定义弹窗 -->
    <el-dialog 
      v-model="customizeMultipleShow" 
      :title="$t('customizeMultiple') || '自定义多收件箱面板'" 
      width="500px"
    >
      <div style="padding: 6px 0;">
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">配置最多4组独立的搜索面板：</p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div v-for="(pane, pIdx) in multipleConfig.panels" :key="pIdx" style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 55px; font-size: 13px; font-weight: 600;">面板 {{ pIdx + 1 }}:</span>
            <el-input v-model="pane.query" size="small" placeholder="搜索条件 (如 is:starred)" style="width: 170px;" />
            <el-input v-model="pane.title" size="small" placeholder="面板标题" style="width: 150px;" />
          </div>
        </div>
        <div style="margin-top: 14px;">
          <label style="font-size: 13px; font-weight: bold; margin-right: 12px;">{{ $t('inboxPosition') || '布局位置' }}：</label>
          <el-radio-group v-model="multipleConfig.position" size="small">
            <el-radio label="right">{{ $t('posRight') || '收件箱右侧' }}</el-radio>
            <el-radio label="above">{{ $t('posAbove') || '收件箱上方' }}</el-radio>
            <el-radio label="below">{{ $t('posBelow') || '收件箱下方' }}</el-radio>
          </el-radio-group>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="customizeMultipleShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" @click="saveMultipleCustomize">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>
    <!-- DIALOG: 自定义壁纸弹窗 -->
    <el-dialog 
      v-model="customWallpaperDialogShow" 
      :title="$t('customWallpaper') || '自定义全局主题壁纸'" 
      width="450px"
    >
      <div style="padding: 10px 0; display: flex; flex-direction: column; gap: 16px;">
        <div style="font-size: 13px; color: var(--text-secondary);">
          您可以上传本地壁纸图片（最大 25MB）或输入在线高清图片直链：
        </div>
        
        <div style="display: flex; gap: 10px; align-items: center;">
          <el-upload
            :show-file-list="false"
            :http-request="handleUploadCustomWallpaper"
            accept="image/*"
          >
            <el-button type="primary" plain :loading="uploadingWallpaper">
              <Icon icon="lucide:upload" width="15" height="15" style="margin-right: 6px;" />
              {{ $t('uploadWallpaper') || '上传本地壁纸' }}
            </el-button>
          </el-upload>

          <el-button 
            v-if="uiStore.themeWallpaper && uiStore.themeWallpaper !== 'none'"
            type="danger" 
            link 
            @click="clearWallpaper"
          >
            {{ $t('clearWallpaper') || '恢复默认' }}
          </el-button>
        </div>

        <div style="display: flex; gap: 8px;">
          <el-input
            v-model="customWallpaperUrl"
            size="default"
            :placeholder="$t('wallpaperUrlPlaceholder') || '在线图片直链 (https://...)'"
            clearable
          />
          <el-button type="primary" @click="applyCustomUrlWallpaper">
            {{ $t('applyWallpaper') || '应用' }}
          </el-button>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end;">
          <el-button @click="customWallpaperDialogShow = false">{{ $t('cancel') || '关闭' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 自定义个人背景弹窗 -->
    <el-dialog 
      v-model="customCoverDialogShow" 
      :title="$t('customCover') || '自定义个人背景封面'" 
      width="450px"
    >
      <div style="padding: 10px 0; display: flex; flex-direction: column; gap: 16px;">
        <div style="font-size: 13px; color: var(--text-secondary);">
          自定义账户详情界面的封面横幅背景（Cover Photo）：
        </div>
        
        <div style="display: flex; gap: 10px; align-items: center;">
          <el-upload
            :show-file-list="false"
            :http-request="handleUploadCustomCover"
            accept="image/*"
          >
            <el-button type="primary" plain :loading="uploadingCover">
              <Icon icon="lucide:upload" width="15" height="15" style="margin-right: 6px;" />
              {{ $t('uploadCover') || '上传封面图片' }}
            </el-button>
          </el-upload>

          <el-button 
            v-if="userStore.user.backgroundUrl"
            type="danger" 
            link 
            @click="clearCover"
          >
            {{ $t('clearWallpaper') || '恢复默认' }}
          </el-button>
        </div>

        <div style="display: flex; gap: 8px;">
          <el-input
            v-model="customCoverUrl"
            size="default"
            :placeholder="$t('coverUrlPlaceholder') || '封面图片直链 (https://...)'"
            clearable
          />
          <el-button type="primary" @click="applyCustomUrlCover">
            {{ $t('applyWallpaper') || '应用' }}
          </el-button>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end;">
          <el-button @click="customCoverDialogShow = false">{{ $t('cancel') || '关闭' }}</el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/store/user.js'
import { useUiStore } from '@/store/ui.js'
import { useSettingStore } from '@/store/setting.js'
import { updateProfile, uploadImage } from '@/request/my.js'
import { parseInlineMarkdown } from '@/utils/md-parser.js'
import { THEME_PRESETS, COVER_PRESETS } from '@/utils/theme-presets.js'

defineOptions({
  name: 'general-setting'
})

const { t } = useI18n()
const userStore = useUserStore()
const uiStore = useUiStore()
const settingStore = useSettingStore()

const langSelect = ref(settingStore.lang || 'zh')

// Bio
const bioDialogShow = ref(false)
const accountBio = ref('')
const bioLoading = ref(false)

// Wallpaper & Cover
const customWallpaperDialogShow = ref(false)
const uploadingWallpaper = ref(false)
const customWallpaperUrl = ref('')
const sliderOpacity = ref(uiStore.themeWallpaperOpacity || 85)

const customCoverDialogShow = ref(false)
const uploadingCover = ref(false)
const customCoverUrl = ref('')

const currentWallpaperId = computed(() => {
  return uiStore.themeWallpaper || 'none'
})

const currentCoverUrl = computed(() => {
  return userStore.user.backgroundUrl || ''
})

const isCustomWallpaperActive = computed(() => {
  const wp = uiStore.themeWallpaper
  if (!wp || wp === 'none') return false
  return !THEME_PRESETS.some(p => p.id === wp)
})

const isCustomCoverActive = computed(() => {
  const cv = userStore.user.backgroundUrl
  if (!cv) return false
  return !COVER_PRESETS.some(p => p.url === cv)
})

// Customize Modals
const customizeDefaultShow = ref(false)
const defaultCatConfig = reactive({
  primary: true,
  promotions: true,
  social: true,
  updates: true,
  forums: false,
  includeStarredInPrimary: true
})

const customizePriorityShow = ref(false)
const priorityConfig = reactive({
  sections: [
    { type: 'important_unread', maxItems: 10 },
    { type: 'starred', maxItems: 10 },
    { type: 'none', maxItems: 10 },
    { type: 'everything', maxItems: 25 }
  ],
  hideEmpty: true
})

const customizeMultipleShow = ref(false)
const multipleConfig = reactive({
  panels: [
    { query: 'is:starred', title: '星标邮件' },
    { query: 'is:unread', title: '未读邮件' },
    { query: 'has:attachment', title: '含附件' },
    { query: 'label:work', title: '工作' }
  ],
  position: 'right'
})

function setTheme(mode) {
  uiStore.setThemeMode(mode)
}

function getPresetThumbStyle(preset) {
  if (preset.id === 'none') {
    return { background: 'var(--bg-surface)' }
  }
  if (preset.url && (preset.url.startsWith('linear-gradient') || preset.url.startsWith('radial-gradient'))) {
    return { background: preset.url }
  }
  if (preset.url && (preset.url.startsWith('http') || preset.url.startsWith('/'))) {
    return { backgroundImage: `url('${preset.url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { background: preset.preview || 'var(--bg-hover)' }
}

function getCoverThumbStyle(preset) {
  if (!preset.url) {
    return { background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #047857 100%)' }
  }
  if (preset.url.startsWith('linear-gradient') || preset.url.startsWith('radial-gradient')) {
    return { background: preset.url }
  }
  if (preset.url.startsWith('http') || preset.url.startsWith('/')) {
    return { backgroundImage: `url('${preset.url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { background: preset.preview || 'var(--bg-hover)' }
}

function selectPresetWallpaper(preset) {
  uiStore.setThemeWallpaper(preset.id)
  updateProfile({ themeWallpaper: preset.id }).catch(() => {})
  ElMessage.success(t('saveSuccessMsg') || '主题已应用')
}

function selectPresetCover(preset) {
  userStore.user.backgroundUrl = preset.url
  updateProfile({ backgroundUrl: preset.url }).catch(() => {})
  ElMessage.success('个人背景已更新')
}

async function handleUploadCustomWallpaper({ file }) {
  if (file.size > 25 * 1024 * 1024) {
    ElMessage.error(t('imageSizeLimitMsg') || '图片大小不能超过 25MB')
    return
  }
  uploadingWallpaper.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await uploadImage(formData)
    const url = res.data || res.url || res
    if (url) {
      uiStore.setThemeWallpaper(url)
      await updateProfile({ themeWallpaper: url })
      customWallpaperDialogShow.value = false
      ElMessage.success('自定义壁纸已应用')
    }
  } catch (e) {
    ElMessage.error(e.message || '上传壁纸失败')
  } finally {
    uploadingWallpaper.value = false
  }
}

async function handleUploadCustomCover({ file }) {
  if (file.size > 25 * 1024 * 1024) {
    ElMessage.error(t('imageSizeLimitMsg') || '图片大小不能超过 25MB')
    return
  }
  uploadingCover.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await uploadImage(formData)
    const url = res.data || res.url || res
    if (url) {
      userStore.user.backgroundUrl = url
      await updateProfile({ backgroundUrl: url })
      customCoverDialogShow.value = false
      ElMessage.success('个人背景封面已应用')
    }
  } catch (e) {
    ElMessage.error(e.message || '上传封面失败')
  } finally {
    uploadingCover.value = false
  }
}

function applyCustomUrlWallpaper() {
  const url = customWallpaperUrl.value.trim()
  if (!url) return
  uiStore.setThemeWallpaper(url)
  updateProfile({ themeWallpaper: url }).catch(() => {})
  customWallpaperDialogShow.value = false
  ElMessage.success('壁纸已应用')
}

function applyCustomUrlCover() {
  const url = customCoverUrl.value.trim()
  if (!url) return
  userStore.user.backgroundUrl = url
  updateProfile({ backgroundUrl: url }).catch(() => {})
  customCoverDialogShow.value = false
  ElMessage.success('个人背景封面已应用')
}

function clearWallpaper() {
  uiStore.setThemeWallpaper('none')
  customWallpaperUrl.value = ''
  updateProfile({ themeWallpaper: 'none' }).catch(() => {})
  customWallpaperDialogShow.value = false
  ElMessage.success('已恢复默认壁纸')
}

function clearCover() {
  userStore.user.backgroundUrl = ''
  customCoverUrl.value = ''
  updateProfile({ backgroundUrl: '' }).catch(() => {})
  customCoverDialogShow.value = false
  ElMessage.success('已恢复默认个人背景')
}

function onOpacityChange(val) {
  uiStore.setThemeWallpaperOpacity(val)
  updateProfile({ themeWallpaperOpacity: val }).catch(() => {})
}

function selectDensity(density) {
  uiStore.setDensity(density)
  updateProfile({ density }).catch(() => {})
  ElMessage.success(t('saveSuccessMsg') || '视图密度已调整')
}

function onInboxTypeChange(val) {
  uiStore.setInboxType(val)
  updateProfile({ inboxType: val }).catch(() => {})
  ElMessage.success(t('saveSuccessMsg') || '收件箱类型已更新')
}

function openCustomizeModal(type) {
  if (type === 'default') {
    if (uiStore.inboxConfig?.default) {
      Object.assign(defaultCatConfig, uiStore.inboxConfig.default)
    }
    customizeDefaultShow.value = true
  } else if (type === 'priority') {
    if (uiStore.inboxConfig?.priority) {
      Object.assign(priorityConfig, uiStore.inboxConfig.priority)
    }
    customizePriorityShow.value = true
  } else if (type === 'multiple') {
    if (uiStore.inboxConfig?.multiple) {
      Object.assign(multipleConfig, uiStore.inboxConfig.multiple)
    }
    customizeMultipleShow.value = true
  }
}

function saveDefaultCustomize() {
  uiStore.setInboxConfig('default', { ...defaultCatConfig })
  updateProfile({ inboxConfig: uiStore.inboxConfig }).catch(() => {})
  customizeDefaultShow.value = false
  ElMessage.success(t('saveSuccessMsg') || '设置已保存')
}

function savePriorityCustomize() {
  uiStore.setInboxConfig('priority', { ...priorityConfig })
  updateProfile({ inboxConfig: uiStore.inboxConfig }).catch(() => {})
  customizePriorityShow.value = false
  ElMessage.success(t('saveSuccessMsg') || '设置已保存')
}

function saveMultipleCustomize() {
  uiStore.setInboxConfig('multiple', { ...multipleConfig })
  updateProfile({ inboxConfig: uiStore.inboxConfig }).catch(() => {})
  customizeMultipleShow.value = false
  ElMessage.success(t('saveSuccessMsg') || '设置已保存')
}

function selectReadingPane(pane) {
  uiStore.setReadingPane(pane)
  updateProfile({ readingPane: pane }).catch(() => {})
  ElMessage.success(t('saveSuccessMsg') || '阅读窗格已更新')
}

function onConversationViewChange(val) {
  uiStore.setConversationView(val)
  updateProfile({ conversationView: val }).catch(() => {})
  ElMessage.success(t('saveSuccessMsg') || '会话模式已更新')
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({ ...setting, lang }))
  settingStore.lang = lang
  window.location.reload()
}

function showSetBio() {
  accountBio.value = userStore.user.bio || ''
  bioDialogShow.value = true
}

function saveBio() {
  bioLoading.value = true
  updateProfile({ bio: accountBio.value }).then(() => {
    userStore.user.bio = accountBio.value
    bioDialogShow.value = false
    ElMessage.success(t('saveSuccessMsg') || '个人简介已更新')
  }).finally(() => {
    bioLoading.value = false
  })
}

function savePrivacy(field, val) {
  updateProfile({ [field]: val }).then(() => {
    userStore.user[field] = val
    ElMessage.success(t('saveSuccessMsg') || '设置已保存')
  })
}
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

      .sub-hint {
        font-size: 11px;
        color: var(--text-muted);
        font-weight: normal;
        margin-top: 2px;
      }
    }
  }

  /* --- 个人简介 --- */
  .bio-item {
    align-items: flex-start !important;
  }

  .bio-preview-group {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: min(450px, calc(100vw - 222px));

    .bio-preview-box {
      flex: 1;
      padding: 10px 14px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle, #e4e4e7);
      border-radius: 8px;
      min-height: 70px;
      max-height: 140px;
      overflow-y: auto;

      .bio-display {
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
        white-space: pre-wrap;
        line-height: 1.6;
        font-size: 13px;
      }
    }

    .opt-button {
      margin: 0;
      padding: 8px;
    }
  }

  /* --- 外观色调 (长方形并排卡片，不霸占整行) --- */
  .theme-item {
    align-items: flex-start !important;
  }

  .theme-options-group {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .theme-rect-card {
    position: relative;
    width: 125px;
    border: 1.5px solid var(--border-subtle, #e2e8f0);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    background: var(--bg-surface);
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--accent-primary, #3b82f6);
    }

    &.active {
      border-color: var(--accent-primary, #3b82f6);
      box-shadow: 0 0 0 1px var(--accent-primary, #3b82f6);
    }
  }

  .theme-rect-preview {
    height: 48px;
    border-radius: 5px;
    display: flex;
    overflow: hidden;
    margin-bottom: 6px;
    border: 1px solid rgba(0, 0, 0, 0.06);

    .mini-sidebar {
      width: 18px;
      height: 100%;
    }

    .mini-content {
      flex: 1;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .mini-line {
      height: 4px;
      border-radius: 2px;
      width: 80%;

      &.sm { width: 45%; }
    }
  }

  .theme-dark-preview {
    background: #1e293b;
    .mini-sidebar { background: #0f172a; }
    .mini-line { background: #334155; }
  }

  .theme-light-preview {
    background: #f8fafc;
    .mini-sidebar { background: #e2e8f0; }
    .mini-line { background: #cbd5e1; }
  }

  .theme-auto-preview {
    display: flex;
    .half-side {
      flex: 1;
      height: 100%;
      display: flex;
    }
    .dark-side {
      background: #1e293b;
      .mini-sidebar { background: #0f172a; width: 100%; }
    }
    .light-side {
      background: #f8fafc;
      padding: 6px;
      .mini-line { background: #cbd5e1; }
    }
  }

  .theme-rect-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .active-check-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-primary, #3b82f6);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* --- 全局主题壁纸与个人背景封面 --- */
  .wallpaper-item {
    align-items: flex-start !important;
  }

  .wallpaper-control-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .wallpaper-presets-grid {
    display: grid;
    grid-template-columns: repeat(4, 125px);
    gap: 12px;
    max-width: 100%;
    box-sizing: border-box;

    @media (max-width: 768px) {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    }
  }

  .wallpaper-card {
    position: relative;
    width: 125px;
    border: 1.5px solid var(--border-subtle, #e2e8f0);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    background: var(--bg-surface);
    transition: all 0.15s ease;
    display: flex;
    flex-direction: column;
    align-items: center;

    &:hover {
      border-color: var(--accent-primary, #3b82f6);
    }

    &.active {
      border-color: var(--accent-primary, #3b82f6);
      box-shadow: 0 0 0 1px var(--accent-primary, #3b82f6);
    }
  }

  .wallpaper-thumb {
    width: 100%;
    height: 48px;
    border-radius: 5px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    position: relative;
    overflow: hidden;
    margin-bottom: 6px;

    &.add-thumb {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-hover, #f8fafc);
      color: var(--text-secondary);
      border: 1.5px dashed var(--border-subtle, #cbd5e1);
      transition: all 0.2s ease;
    }
  }

  .wallpaper-card:hover .add-thumb {
    border-color: var(--accent-primary, #3b82f6);
    color: var(--accent-primary, #3b82f6);
  }

  .wallpaper-name {
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 500;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .opacity-slider-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 4px;

    .opacity-label {
      font-size: 12px;
      color: var(--text-secondary);
      width: 130px;
    }
  }

  /* --- 视图密度 (Density) --- */
  .density-item {
    align-items: flex-start !important;
  }

  .density-group {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .density-card {
    position: relative;
    width: 125px;
    border: 1.5px solid var(--border-subtle, #e2e8f0);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    background: var(--bg-surface);
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--accent-primary, #3b82f6);
    }

    &.active {
      border-color: var(--accent-primary, #3b82f6);
      box-shadow: 0 0 0 1px var(--accent-primary, #3b82f6);
    }
  }

  .density-demo {
    height: 52px;
    background: var(--bg-hover, #f8fafc);
    border-radius: 5px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    margin-bottom: 6px;

    .demo-line {
      display: flex;
      align-items: center;
      gap: 5px;

      .demo-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent-primary, #3b82f6);
        opacity: 0.6;
      }

      .demo-bar {
        height: 3px;
        border-radius: 1.5px;
        background: var(--border-subtle, #cbd5e1);
        width: 70%;

        &.full { width: 90%; }
      }
    }
  }

  .density-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;

    .d-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .d-sub {
      font-size: 11px;
      color: var(--text-muted);
    }
  }

  /* --- 收件箱类型 --- */
  .inbox-type-item {
    align-items: flex-start !important;
  }

  .inbox-type-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 520px;
  }

  .inbox-type-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: 6px;

    &:hover {
      background: var(--bg-hover, rgba(0, 0, 0, 0.02));
    }

    .type-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin-left: 6px;
    }

    .type-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-left: 8px;
    }

    .customize-btn {
      font-size: 11px;
      padding: 4px 8px;
    }
  }

  /* --- 阅读窗格 (Reading Pane) --- */
  .pane-item {
    align-items: flex-start !important;
  }

  .pane-options-group {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .pane-card {
    position: relative;
    width: 125px;
    border: 1.5px solid var(--border-subtle, #e2e8f0);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    background: var(--bg-surface);
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--accent-primary, #3b82f6);
    }

    &.active {
      border-color: var(--accent-primary, #3b82f6);
      box-shadow: 0 0 0 1px var(--accent-primary, #3b82f6);
    }
  }

  .pane-preview {
    height: 48px;
    background: var(--bg-hover, #f1f5f9);
    border-radius: 5px;
    padding: 4px;
    margin-bottom: 6px;
    display: flex;
    gap: 4px;

    .pane-box {
      border-radius: 3px;
      background: var(--border-subtle, #cbd5e1);
    }

    &.no-split .full-list { width: 100%; height: 100%; }

    &.right-split {
      .left-list { width: 35%; height: 100%; }
      .right-read { flex: 1; height: 100%; background: var(--accent-primary, #3b82f6); opacity: 0.7; }
    }

    &.below-split {
      flex-direction: column;
      .top-list { width: 100%; height: 45%; }
      .bottom-read { width: 100%; flex: 1; background: var(--accent-primary, #3b82f6); opacity: 0.7; }
    }
  }

  .pane-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;

    .p-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .p-sub {
      font-size: 11px;
      color: var(--text-muted);
    }
  }

  /* --- 邮件会话模式 --- */
  .threading-control {
    display: flex;
    align-items: center;
    gap: 12px;

    .threading-hint {
      font-size: 13px;
      color: var(--text-secondary);
    }
  }

  /* --- 数据隐私 --- */
  .privacy-group {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: center;

    .privacy-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: bold;
    }
  }
}
</style>
