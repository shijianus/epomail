<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    direction="rtl"
    destroy-on-close
    class="audit-detail-drawer audit-drawer-container"
    :show-close="false"
    @opened="handleDrawerOpened"
  >
    <!-- 抽屉头部：变体自适应标题 + 定位副标题 + 章节锚点 Chips + 变体切换 + 关闭按钮 -->
    <template #header>
      <div class="drawer-header-shell">
        <div class="drawer-header-top">
          <div class="header-main-info">
            <div class="header-icon-wrap" :class="variantThemeClass">
              <Icon :icon="variantIcon" width="22" height="22" />
            </div>
            <div class="header-text-group">
              <div class="drawer-title-row">
                <span class="drawer-title">{{ currentVariantTitle }}</span>
                <el-tag size="small" :type="variantBadgeType" effect="plain" class="variant-mode-tag">
                  {{ currentVariantBadge }}
                </el-tag>
              </div>
              <div class="drawer-sub" :title="currentVariantSub">
                {{ currentVariantSub }}
              </div>
            </div>
          </div>

          <div class="header-tools-right">
            <!-- 变体视角切换器 (供安全主管与审计员无缝比对 4 种变体) -->
            <el-dropdown trigger="click" @command="handleSelectVariant">
              <el-button size="small" plain class="variant-switch-btn">
                <Icon icon="fluent:apps-list-detail-20-regular" width="14" height="14" style="margin-right: 4px;" />
                <span>{{ $t('auditVariantSwitchLabel') }} (V{{ activeVariant }})</span>
                <Icon icon="fluent:chevron-down-12-regular" width="12" height="12" style="margin-left: 3px;" />
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="1" :disabled="activeVariant === 1">
                    <span :class="{ 'font-semibold text-primary': activeVariant === 1 }">V1: {{ $t('auditVariant1Title') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item :command="2" :disabled="activeVariant === 2">
                    <span :class="{ 'font-semibold text-primary': activeVariant === 2 }">V2: {{ $t('auditVariant2Title') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item :command="3" :disabled="activeVariant === 3">
                    <span :class="{ 'font-semibold text-primary': activeVariant === 3 }">V3: {{ $t('auditVariant3Title') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item :command="4" :disabled="activeVariant === 4">
                    <span :class="{ 'font-semibold text-primary': activeVariant === 4 }">V4: {{ $t('auditVariant4Title') }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <!-- 纯图标关闭按钮 -->
            <el-tooltip effect="dark" :content="$t('close')" placement="top">
              <button class="drawer-close-btn" @click="handleClose">
                <Icon icon="fluent:dismiss-20-regular" width="18" height="18" />
              </button>
            </el-tooltip>
          </div>
        </div>

        <!-- 头部下方徽标行：案件编号、状态主徽标、状态副徽标、风险等级、原因码、证据保留天数、右侧负责人入口 -->
        <div v-if="selectedRow" class="drawer-badge-meta-bar">
          <div class="meta-badges-left">
            <!-- 案件编号 (等宽字，一键复制) -->
            <span class="meta-badge case-no font-mono" @click="copyCaseNo(caseNumber)">
              <Icon icon="fluent:tag-16-regular" width="14" height="14" />
              <span>{{ caseNumber }}</span>
              <Icon icon="fluent:copy-16-regular" width="12" height="12" class="copy-icon" />
            </span>

            <!-- 当前主状态徽标 -->
            <el-tag size="small" :type="getStatusTagType(selectedRow.status)" effect="dark" class="meta-tag">
              {{ getStatusLabel(selectedRow.status) }}
            </el-tag>

            <!-- 状态副徽标 (条件: 熔断 / 观察中 / 挑战中) -->
            <el-tag v-if="secondaryStatus" size="small" :type="secondaryStatus.type" effect="plain" class="meta-tag">
              <Icon :icon="secondaryStatus.icon" width="12" height="12" style="margin-right: 3px;" />
              {{ secondaryStatus.label }}
            </el-tag>

            <!-- 风险等级 LV0–LV3 / 威胁 (条件) -->
            <el-tag v-if="riskLevelTag" size="small" :type="riskLevelTag.type" effect="plain" class="meta-tag">
              {{ riskLevelTag.label }}
            </el-tag>

            <!-- 原因码 (条件) -->
            <span v-if="selectedRow.reasonCode" class="meta-badge reason-code font-mono text-danger">
              {{ selectedRow.reasonCode }}
            </span>

            <!-- 证据剩余保留天数 -->
            <span v-if="evidenceDaysText" class="meta-badge evidence-days">
              <Icon icon="fluent:clock-history-16-regular" width="13" height="13" />
              <span>{{ evidenceDaysText }}</span>
            </span>
          </div>

          <!-- 右侧负责人入口 (点开负责人账户详情弹窗) -->
          <div class="meta-operator-entry" @click="openOperatorDialog">
            <div class="operator-avatar-circle">
              {{ operatorInitials }}
            </div>
            <div class="operator-info-wrap">
              <span class="operator-name">{{ operatorDisplayName }}</span>
              <span class="operator-role-sub">{{ operatorRoleLabel }}</span>
            </div>
            <Icon icon="fluent:chevron-right-12-regular" width="12" height="12" class="entry-arrow" />
          </div>
        </div>

        <!-- 章节锚点 Chip 组 (平滑滚动到指定章节) -->
        <div class="chapter-chips-bar">
          <div
            v-for="chip in availableChapters"
            :key="chip.id"
            class="chapter-chip"
            :class="{ 'chip-active': activeChapter === chip.id }"
            @click="scrollToChapter(chip.id)"
          >
            <Icon :icon="chip.icon" width="13" height="13" class="chip-icon" />
            <span>{{ chip.label }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 可滚动主体正文：按办案心智顺序组装档案模块 -->
    <div v-if="selectedRow" ref="scrollContainerRef" class="drawer-scroll-body" @scroll="handleBodyScroll">
      
      <!-- 模块 A: 案件概要 / 案件信息 (两列网格 12 个字段位) -->
      <section id="chapter-summary" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:document-text-20-regular" width="18" height="18" />
            <span>{{ chapterLabels.summary }}</span>
          </div>
          <span class="section-badge font-mono">#01-OVERVIEW</span>
        </div>

        <div class="dossier-grid-12">
          <!-- 1. 案件编号 -->
          <div class="grid-field">
            <span class="field-k">{{ $t('auditCaseNoSubject') }}:</span>
            <div class="field-v-with-copy font-mono font-medium">
              <span>{{ caseNumber }}</span>
              <button class="inline-copy-btn" :title="$t('abuseCopiedSuccess')" @click="copyCaseNo(caseNumber)">
                <Icon icon="fluent:copy-16-regular" width="13" height="13" />
              </button>
            </div>
          </div>

          <!-- 2. 当前状态 -->
          <div class="grid-field">
            <span class="field-k">{{ $t('auditCurrentStatus') }}:</span>
            <div class="field-v">
              <el-tag size="small" :type="getStatusTagType(selectedRow.status)">
                {{ getStatusLabel(selectedRow.status) }}
              </el-tag>
            </div>
          </div>

          <!-- 3. 邮箱地址 (脱敏掩码 + 一键复制完整真实邮箱) -->
          <div class="grid-field">
            <span class="field-k">{{ $t('tabEmailAddress') }}:</span>
            <div class="field-v-with-copy font-mono">
              <span class="masked-text" :title="maskedEmail">{{ maskedEmail }}</span>
              <button
                v-if="!selectedRow.cleared"
                class="inline-copy-btn"
                :title="$t('abuseCopyEmail')"
                @click="copyEmail(selectedRow.email)"
              >
                <Icon icon="fluent:copy-16-regular" width="13" height="13" />
              </button>
            </div>
          </div>

          <!-- 4. 用户 ID (脱敏掩码 + 一键复制完整 ID) -->
          <div class="grid-field">
            <span class="field-k">{{ $t('auditColUserId') || '用户 ID' }}:</span>
            <div class="field-v-with-copy font-mono">
              <span class="masked-text">{{ maskedUserId }}</span>
              <button
                v-if="!selectedRow.cleared"
                class="inline-copy-btn"
                :title="$t('abuseCopyUserId')"
                @click="copyUserId(rawUserId)"
              >
                <Icon icon="fluent:copy-16-regular" width="13" height="13" />
              </button>
            </div>
          </div>

          <!-- 5. 启禁时间 (无封禁则显示发起时间) -->
          <div class="grid-field">
            <span class="field-k">{{ isBanType ? $t('auditColBanTime') : $t('auditInitiatedAt') }}:</span>
            <span class="field-v font-mono">{{ formatTime(selectedRow.banTime || selectedRow.createTime) }}</span>
          </div>

          <!-- 6. 结案时间 (无则显示最近处理时间) -->
          <div class="grid-field">
            <span class="field-k">{{ isBanType ? $t('auditColLastProcessTime') : $t('auditResolvedAt') }}:</span>
            <span class="field-v font-mono">{{ formatTime(selectedRow.resolvedTime || selectedRow.processTime || selectedRow.banTime || selectedRow.createTime) }}</span>
          </div>

          <!-- 7. 违规类别 -->
          <div class="grid-field">
            <span class="field-k">{{ $t('reportReasonCategory') }}:</span>
            <div class="field-v">
              <el-tag size="small" :type="categoryTagMeta.type" effect="plain">
                {{ categoryTagMeta.label }}
              </el-tag>
            </div>
          </div>

          <!-- 8. 原因码 -->
          <div class="grid-field">
            <span class="field-k">{{ $t('abuseReasonCodeLabel') }}:</span>
            <span class="field-v font-mono text-danger font-semibold">{{ selectedRow.reasonCode || 'RULE_INTERCEPT_STANDARD' }}</span>
          </div>

          <!-- 9. 报警次数 (条件渲染) -->
          <div v-if="alarmCountValue !== undefined" class="grid-field">
            <span class="field-k">{{ $t('auditColAlarmCount') }}:</span>
            <span class="field-v font-mono font-medium" :class="{ 'text-danger': alarmCountValue > 1 }">
              {{ alarmCountValue }} {{ $t('auditTimesUnit') }}
            </span>
          </div>

          <!-- 10. 截止期限 (条件渲染) -->
          <div v-if="deadlineValue" class="grid-field">
            <span class="field-k">{{ $t('auditColExpireTime') }}:</span>
            <span class="field-v font-mono" :class="{ 'text-warning font-semibold': isDeadlineImminent }">
              {{ deadlineValue }}
            </span>
          </div>

          <!-- 11. 拍案管理 (条件渲染) -->
          <div v-if="authorityValue" class="grid-field">
            <span class="field-k">{{ $t('auditColFinalAuthority') }}:</span>
            <span class="field-v font-medium text-primary">{{ authorityValue }}</span>
          </div>

          <!-- 12. 证据留存天数 -->
          <div class="grid-field">
            <span class="field-k">{{ $t('abuseEvidenceRetentionLabel') }}:</span>
            <span class="field-v font-mono font-medium">{{ evidenceDaysFormatted }}</span>
          </div>
        </div>
      </section>

      <!-- 模块 B: 集群关联账号 (条件渲染：有集群账号时才出现) -->
      <section
        v-if="clusterAccountsList && clusterAccountsList.length > 0"
        id="chapter-cluster"
        class="dossier-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:people-community-20-regular" width="18" height="18" />
            <span>{{ $t('auditClusterAccountsTitle') }}</span>
            <el-tag size="small" type="danger" effect="plain" class="cluster-count-badge">
              {{ $t('auditClusterAccountsCount', { count: clusterAccountsList.length }) }}
            </el-tag>
          </div>
          <span class="data-tag-muted">{{ $t('auditMaskedAggregatedData') }}</span>
        </div>

        <div class="cluster-accounts-table">
          <div class="cluster-header-row font-mono">
            <span class="col-idx">#</span>
            <span class="col-email">{{ $t('tabEmailAddress') }}</span>
            <span class="col-uid">{{ $t('auditColUserId') || '用户 ID' }}</span>
            <span class="col-status">{{ $t('auditCurrentStatus') }}</span>
            <span class="col-relation">{{ $t('auditFieldSimilarity') }}</span>
          </div>

          <div
            v-for="(acc, cIdx) in clusterAccountsList"
            :key="acc.id || cIdx"
            class="cluster-data-row"
          >
            <span class="col-idx font-mono text-muted">#{{ String(cIdx + 1).padStart(2, '0') }}</span>
            <div class="col-email font-mono">
              <span>{{ maskEmail(acc.email) }}</span>
              <button class="inline-copy-btn" :title="$t('abuseCopyEmail')" @click="copyEmail(acc.email)">
                <Icon icon="fluent:copy-16-regular" width="12" height="12" />
              </button>
            </div>
            <span class="col-uid font-mono text-muted">{{ maskUserId(acc.userId || ('usr_' + acc.id)) }}</span>
            <div class="col-status">
              <el-tag size="small" :type="getStatusTagType(acc.status)" effect="plain">
                {{ getStatusLabel(acc.status) }}
              </el-tag>
            </div>
            <span class="col-relation font-mono text-danger">{{ acc.evidenceSummary || '同一设备指纹 · 关联集群' }}</span>
          </div>
        </div>

        <div class="cluster-footnote">
          <Icon icon="fluent:info-16-regular" width="14" height="14" class="footnote-icon" />
          <span>{{ $t('auditClusterAccountsFootnote') }}</span>
        </div>
      </section>

      <!-- 模块 C: 处置依据 / 风险研判 (内嵌四层 + 6 种标记详细日志解析) -->
      <section id="chapter-basis" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:shield-task-20-regular" width="18" height="18" />
            <span>{{ chapterLabels.basis }}</span>
          </div>
          <span class="section-badge font-mono">#02-GROUNDS</span>
        </div>

        <div class="disposition-nested-card">
          <!-- 层级 1: 申诉理由引述块 (条件渲染) -->
          <div v-if="selectedRow.appealReason" class="appeal-statement-quote">
            <Icon icon="fluent:chat-quote-20-regular" width="16" height="16" class="quote-icon" />
            <span class="quote-text">“{{ selectedRow.appealReason }}”</span>
          </div>

          <!-- 层级 2: 红色封禁 / 管控原因段 (条件渲染) -->
          <div v-if="redBanReasonText" class="red-ban-reason-alert">
            <Icon icon="fluent:warning-20-filled" width="16" height="16" class="alert-icon" />
            <span class="alert-text">{{ redBanReasonText }}</span>
          </div>

          <!-- 层级 3: 分类徽标 + 证据摘要行 -->
          <div class="evidence-summary-line">
            <div class="summary-line-left">
              <el-tag size="small" :type="categoryTagMeta.type" effect="dark" class="category-pill">
                {{ categoryTagMeta.label }}
              </el-tag>
              <span class="evidence-abstract font-medium">{{ evidenceSummaryText }}</span>
            </div>
            <span class="evidence-hash font-mono text-muted" v-if="evidenceDigestHash">
              {{ evidenceDigestHash }}
            </span>
          </div>

          <!-- 层级 4: 处置动作徽标 + 动作副说明 -->
          <div v-if="selectedRow.actionText" class="action-description-box">
            <div class="action-pill-row">
              <el-tag size="small" type="danger" effect="plain">
                <Icon icon="fluent:gavel-16-regular" width="12" height="12" style="margin-right: 3px;" />
                {{ actionBadgeText }}
              </el-tag>
              <span class="action-sub-text">{{ selectedRow.actionText }}</span>
            </div>
          </div>

          <!-- 层级 5: 操作详细日志列表 (固定解析 6 种标记: [放行说明] [延期处置] [解禁说明] [审核备忘] [驳回理由] [更新]) -->
          <div v-if="parsedDetailLogs && parsedDetailLogs.length > 0" class="detail-logs-list">
            <div class="logs-header-label font-mono">OPERATIONAL_AUDIT_TRAIL ({{ parsedDetailLogs.length }})</div>
            <div
              v-for="(log, lIdx) in parsedDetailLogs"
              :key="lIdx"
              class="detail-log-row"
            >
              <template v-if="log.tag">
                <el-tag size="small" :type="log.tagType" effect="plain" class="log-tag">
                  {{ log.tag }}
                </el-tag>
                <span class="log-content">{{ log.content }}</span>
              </template>
              <template v-else>
                <span class="log-bullet">•</span>
                <span class="log-content plain-text">{{ log.content }}</span>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 D: 全周期时间线 (双泳道：机器自动 / 人工与用户) -->
      <section id="chapter-timeline" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:timeline-20-regular" width="18" height="18" />
            <span>{{ $t('auditChipTimeline') }}</span>
          </div>
          <div class="timeline-legend">
            <span class="legend-item"><span class="dot machine-dot"></span>{{ $t('auditTimelineSwimlaneMachine') }}</span>
            <span class="legend-item"><span class="dot human-dot"></span>{{ $t('auditTimelineSwimlaneHuman') }}</span>
          </div>
        </div>

        <div class="dual-swimlane-timeline">
          <div
            v-for="(node, nIdx) in timelineNodes"
            :key="nIdx"
            class="timeline-node-card"
            :class="[node.lane === 'machine' ? 'lane-machine' : 'lane-human', { 'node-latest': node.isLatest }]"
          >
            <div class="node-left-track">
              <div class="node-icon-box" :class="node.lane === 'machine' ? 'icon-machine' : 'icon-human'">
                <Icon :icon="node.icon" width="15" height="15" />
              </div>
              <div v-if="nIdx < timelineNodes.length - 1" class="node-connector-line"></div>
            </div>

            <div class="node-body">
              <div class="node-header">
                <div class="node-header-left">
                  <span class="node-number font-mono">{{ $t('auditTimelineNodeNo', { no: String(nIdx + 1).padStart(2, '0') }) }}</span>
                  <span class="node-title font-medium">{{ node.title }}</span>
                  <el-tag v-if="node.isLatest" size="small" type="danger" effect="dark" class="latest-tag">
                    {{ $t('auditTimelineLatestNode') }}
                  </el-tag>
                </div>
                <div class="node-header-right font-mono">
                  <span class="node-time">{{ node.formattedTime }}</span>
                  <span v-if="node.duration" class="node-duration font-mono text-muted">({{ node.duration }})</span>
                </div>
              </div>

              <div class="node-meta-row">
                <span class="node-actor font-medium">
                  <Icon icon="fluent:person-circle-16-regular" width="13" height="13" class="actor-icon" />
                  {{ node.actor }}
                </span>
                <span class="actor-lane-tag" :class="node.lane === 'machine' ? 'tag-machine' : 'tag-human'">
                  {{ node.lane === 'machine' ? $t('auditTimelineSwimlaneMachine') : $t('auditTimelineSwimlaneHuman') }}
                </span>
                <!-- 状态迁移 from -> to -->
                <div v-if="node.transition" class="node-transition font-mono">
                  <span class="from-st">{{ node.transition.from }}</span>
                  <Icon icon="fluent:arrow-right-12-regular" width="11" height="11" class="arrow" />
                  <span class="to-st text-danger">{{ node.transition.to }}</span>
                </div>
              </div>

              <div v-if="node.description" class="node-desc">
                {{ node.description }}
              </div>

              <!-- 证据哈希 (条件渲染) -->
              <div v-if="node.hash" class="node-evidence-hash font-mono" @click="copyHash(node.hash)">
                <span class="hash-label">HASH:</span>
                <span class="hash-val">{{ node.hash }}</span>
                <Icon icon="fluent:copy-16-regular" width="11" height="11" class="copy-icon" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="timelineIsSynthetic" class="placeholder-sample-notice">
          <Icon icon="fluent:info-16-regular" width="13" height="13" />
          <span>{{ $t('auditPlaceholderSampleNotice') }}</span>
        </div>
      </section>

      <!-- 模块 E: 多维风险画像 (条件渲染：综合风险分 + 4 维度得分条 + 基准带指标) -->
      <section
        v-if="riskProfileData"
        id="chapter-risk"
        class="dossier-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:chart-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditChipRisk') }}</span>
          </div>
          <span class="data-tag-muted">{{ $t('auditMaskedAggregatedData') }}</span>
        </div>

        <div class="risk-profile-header">
          <!-- 综合风险分大数字 -->
          <div class="composite-score-box" :class="riskScoreLevelClass">
            <div class="score-number font-mono">{{ riskProfileData.compositeScore }}</div>
            <div class="score-denom font-mono">/ 100</div>
            <div class="score-label">{{ $t('auditRiskCompositeScore') }}</div>
          </div>

          <div class="risk-driver-summary">
            <div class="driver-title-row">
              <span class="driver-label">{{ $t('auditRiskMainDriver') }}:</span>
              <span class="driver-text font-medium text-danger">{{ riskProfileData.mainDriver }}</span>
            </div>
            <div class="driver-desc text-muted">
              {{ $t('auditPlaceholderSampleNotice') }}
            </div>
          </div>
        </div>

        <!-- 4 维度得分条与权重展示 -->
        <div class="risk-dimensions-list">
          <div
            v-for="dim in riskProfileData.dimensions"
            :key="dim.name"
            class="dimension-row"
          >
            <div class="dim-label-row">
              <span class="dim-name font-medium">{{ dim.name }}</span>
              <div class="dim-meta font-mono">
                <span class="dim-score" :class="getScoreColorClass(dim.score)">{{ dim.score }}分</span>
                <span class="dim-weight text-muted">(权重: {{ dim.weight }}%)</span>
              </div>
            </div>
            <el-progress
              :percentage="Math.min(100, dim.score)"
              :color="getProgressColor(dim.score)"
              :stroke-width="6"
              :show-text="false"
            />
          </div>
        </div>

        <!-- 基准带图例 -->
        <div class="gauge-legend-bar">
          <span class="legend-pill"><span class="legend-color-box base-cohort"></span>{{ $t('auditRiskLegendGroup') }}</span>
          <span class="legend-pill"><span class="legend-color-box base-self"></span>{{ $t('auditRiskLegendSelf') }}</span>
          <span class="legend-pill"><span class="legend-color-box base-threshold"></span>{{ $t('auditRiskLegendThreshold') }}</span>
        </div>

        <!-- 分组指标行：当前值大字 + 超阈/阈内徽标 + 基准带进度条与三档刻度 -->
        <div class="risk-indicators-table">
          <div
            v-for="(metric, mIdx) in riskProfileData.metrics"
            :key="mIdx"
            class="metric-card-row"
          >
            <div class="metric-info-col">
              <div class="metric-title-line">
                <span class="metric-name font-medium">{{ metric.name }}</span>
                <span class="metric-rule font-mono text-muted">[{{ metric.rule }}]</span>
              </div>
              <div class="metric-probe-notes text-muted">
                {{ metric.probeNotes }}
              </div>
            </div>

            <div class="metric-data-col">
              <div class="metric-val-row">
                <span class="metric-val font-mono font-semibold" :class="{ 'text-danger': metric.isOverThreshold }">
                  {{ metric.currentValue }}
                </span>
                <el-tag
                  size="small"
                  :type="metric.isOverThreshold ? 'danger' : 'success'"
                  effect="dark"
                  class="threshold-tag"
                >
                  {{ metric.isOverThreshold ? $t('auditRiskThresholdOver') : $t('auditRiskThresholdWithin') }}
                </el-tag>
              </div>

              <!-- 数值型指标：基准带进度条 (0%=同群组, 100%=阈值, 越过右端即超阈) -->
              <div v-if="metric.isNumeric" class="gauge-bar-wrapper">
                <div class="gauge-track">
                  <div
                    class="gauge-fill"
                    :style="{ width: Math.min(100, metric.ratio) + '%' }"
                    :class="{ 'fill-over': metric.isOverThreshold }"
                  ></div>
                  <!-- 自身 30 天刻度线 -->
                  <div
                    class="gauge-tick tick-self"
                    :style="{ left: metric.selfTickPos + '%' }"
                    :title="$t('auditRiskGaugeSelf30d')"
                  ></div>
                  <!-- 风险阈值刻度线 (100% 处) -->
                  <div class="gauge-tick tick-threshold" style="left: 80%;" :title="$t('auditRiskGaugeThreshold')"></div>
                </div>
                <div class="gauge-sub-labels font-mono">
                  <span>{{ $t('auditRiskGaugeGroupBaseline') }}: {{ metric.cohortBaseline }}</span>
                  <span>{{ $t('auditRiskGaugeSelf30d') }}: {{ metric.self30d }}</span>
                  <span class="threshold-label">{{ $t('auditRiskGaugeThreshold') }}: {{ metric.threshold }}</span>
                </div>
              </div>

              <!-- 非数值指标：命中 / 未命中 状态展示 -->
              <div v-else class="non-numeric-status">
                <el-tag size="small" :type="metric.hit ? 'danger' : 'info'" effect="plain">
                  {{ metric.hit ? $t('auditRiskMetricHit') : $t('auditRiskMetricNormal') }}
                </el-tag>
                <span class="non-numeric-desc text-muted">{{ metric.statusNote }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 F: 相似案例参照 (变体 2 重点 & 条件渲染) -->
      <section
        v-if="activeVariant === 2 && similarCasesData"
        id="chapter-similar"
        class="dossier-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:branch-compare-20-regular" width="18" height="18" />
            <span>{{ $t('auditSimilarCasesTitle') }}</span>
          </div>
          <span class="font-mono text-danger font-semibold">[{{ similarCasesData.reasonCode }}]</span>
        </div>

        <div class="similar-cases-body">
          <div class="distribution-header-row">
            <span class="dist-title">{{ $t('auditSimilarDistribution') }} ({{ similarCasesData.totalCases }} 件)</span>
          </div>

          <!-- 分段比例分布条 -->
          <div class="stacked-distribution-bar">
            <div
              v-for="stat in similarCasesData.stats"
              :key="stat.key"
              class="dist-segment"
              :style="{ width: stat.percentage + '%', backgroundColor: stat.color }"
              :title="stat.label + ': ' + stat.percentage + '% (' + stat.count + '件)'"
            ></div>
          </div>

          <!-- 4 种裁决分布图例及数字统计 -->
          <div class="distribution-legend-grid">
            <div
              v-for="stat in similarCasesData.stats"
              :key="stat.key"
              class="dist-legend-item"
            >
              <span class="color-dot" :style="{ backgroundColor: stat.color }"></span>
              <span class="dist-name">{{ stat.label }}:</span>
              <span class="dist-stat font-mono font-medium">{{ stat.percentage }}% ({{ stat.count }}件)</span>
            </div>
          </div>

          <!-- 一致性研判指引 -->
          <div class="consistency-advisory-box">
            <Icon icon="fluent:lightbulb-16-regular" width="16" height="16" class="advisory-icon" />
            <span class="advisory-text">{{ similarCasesData.advisoryText }}</span>
          </div>

          <div class="placeholder-sample-notice">
            <Icon icon="fluent:info-16-regular" width="13" height="13" />
            <span>{{ $t('auditPlaceholderSampleNotice') }}</span>
          </div>
        </div>
      </section>

      <!-- 模块 G: 证据链溯源 (变体 2 重点 & 条件渲染：四列链路行) -->
      <section
        v-if="activeVariant === 2 && evidenceChainList && evidenceChainList.length > 0"
        id="chapter-chain"
        class="dossier-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:link-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditChainTitle') }}</span>
          </div>
          <span class="font-mono text-muted">{{ $t('auditMaskedAggregatedData') }}</span>
        </div>

        <div class="evidence-chain-table">
          <div class="chain-header-row font-mono">
            <span class="c-ev">{{ $t('auditChainColEvidence') }}</span>
            <span class="c-rl">{{ $t('auditChainColRule') }}</span>
            <span class="c-st">{{ $t('auditChainColStep') }}</span>
            <span class="c-jd">{{ $t('auditChainColBasis') }}</span>
          </div>

          <div
            v-for="(rowItem, rIdx) in evidenceChainList"
            :key="rIdx"
            class="chain-item-row"
          >
            <div class="c-ev">
              <span class="ev-title font-medium">{{ rowItem.evidence }}</span>
              <span v-if="rowItem.hash" class="ev-hash font-mono text-muted">{{ rowItem.hash }}</span>
            </div>
            <div class="c-rl font-mono text-danger">
              <span>{{ rowItem.rule }}</span>
            </div>
            <div class="c-st font-mono">
              <span class="step-pill">{{ rowItem.step }}</span>
            </div>
            <div class="c-jd">
              <span class="judgement-text">{{ rowItem.judgement }}</span>
            </div>
          </div>
        </div>

        <div class="placeholder-sample-notice">
          <Icon icon="fluent:info-16-regular" width="13" height="13" />
          <span>{{ $t('auditPlaceholderSampleNotice') }}</span>
        </div>
      </section>

      <!-- 模块 H: 裁决工作台 (变体 1、变体 2、变体 3 专用：纯只读变体 4 绝对不出现) -->
      <section
        v-if="isAdjudicationAvailable"
        id="chapter-decision"
        class="dossier-card adjudication-workbench-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:gavel-20-regular" width="18" height="18" />
            <span>{{ chapterLabels.decision }}</span>
          </div>
          <span class="section-badge font-mono">#DECISION_ENGINE</span>
        </div>

        <!-- 裁决批注输入框与快捷预设 -->
        <div class="decision-input-group">
          <div class="decision-input-header">
            <span class="input-title font-medium">{{ $t('auditAdjudicationNotes') }}:</span>
            <div class="quick-notes-presets">
              <button class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset1'))">{{ $t('auditQuickNotePreset1') }}</button>
              <button class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset2'))">{{ $t('auditQuickNotePreset2') }}</button>
              <button class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset3'))">{{ $t('auditQuickNotePreset3') }}</button>
              <button class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset4'))">{{ $t('auditQuickNotePreset4') }}</button>
            </div>
          </div>

          <el-input
            v-model="internalDecisionNotes"
            type="textarea"
            :rows="3"
            :placeholder="$t('auditAdjudicationPlaceholder')"
            class="decision-textarea"
          />
        </div>

        <!-- 动作按钮组：根据变体严格分流与提供 -->
        <div class="adjudication-actions-grid">
          <!-- 变体 1 滥用威胁专属：按对象分流 (外部发件人 -> 加入黑名单 / 内部用户 -> 限制发信) -->
          <template v-if="activeVariant === 1">
            <el-button
              v-if="!selectedRow.isInternal"
              type="danger"
              :loading="actionLoading"
              @click="confirmAndExecuteAction('blacklist_sender', $t('auditBtnBlacklistSender'))"
            >
              <Icon icon="fluent:prohibited-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditBtnBlacklistSender') }}</span>
            </el-button>

            <el-button
              v-if="selectedRow.isInternal === 1"
              type="warning"
              :loading="actionLoading"
              @click="confirmAndExecuteAction('mute_account', $t('auditBtnMuteAccount'))"
            >
              <Icon icon="fluent:speaker-mute-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditBtnMuteAccount') }}</span>
            </el-button>
          </template>

          <!-- 变体 3 风险管理审计专属：封存归档 -->
          <template v-if="activeVariant === 3">
            <el-button
              type="primary"
              :loading="actionLoading"
              @click="confirmAndExecuteAction('archive_routine', $t('auditBtnArchiveRoutine'))"
            >
              <Icon icon="fluent:archive-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditBtnArchiveRoutine') }}</span>
            </el-button>
          </template>

          <!-- 通用四枚裁决动作 (变体 1, 变体 2, 变体 3 均具备) -->
          <!-- 1. 放行结案 -->
          <el-button
            type="success"
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('approve', $t('auditAdjudicateApprove'))"
          >
            <Icon icon="fluent:checkmark-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateApprove') }}</span>
          </el-button>

          <!-- 2. 条件放行 (强制下次 MFA 凭证挑战) -->
          <el-button
            type="primary"
            plain
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('probation', $t('auditAdjudicateApproveWithChallenge'))"
          >
            <Icon icon="fluent:key-reset-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateApproveWithChallenge') }}</span>
          </el-button>

          <!-- 3. 驳回申诉 / 维持封禁 -->
          <el-button
            type="danger"
            plain
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('reject', $t('auditAdjudicateReject'))"
          >
            <Icon icon="fluent:dismiss-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateReject') }}</span>
          </el-button>

          <!-- 4. 标记误报 (列入白名单豁免) -->
          <el-button
            type="info"
            plain
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('whitelist', $t('auditAdjudicateWhitelist'))"
          >
            <Icon icon="fluent:shield-dismiss-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateWhitelist') }}</span>
          </el-button>
        </div>
      </section>

      <!-- 模块 I: 只读台账横幅 (变体 4 纯只读台账专用) -->
      <section
        v-if="activeVariant === 4"
        id="chapter-ledger"
        class="dossier-card readonly-ledger-card anchor-section"
      >
        <div class="sanction-ledger-banner">
          <Icon icon="fluent:shield-checkmark-20-filled" width="20" height="20" class="banner-icon" />
          <div class="banner-text-box">
            <span class="banner-title font-medium">{{ $t('auditSanctionPureNotice') }}</span>
            <span class="banner-sub text-muted">IMMUTABLE_AUDIT_LOG · 防篡改公开台账</span>
          </div>
        </div>

        <div v-if="selectedRow.status === 'unbanned'" class="unbanned-archive-badge">
          <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
          <span>{{ $t('auditStatusUnbannedRecord') }}</span>
        </div>
      </section>

    </div>

    <!-- 底部固定动作栏 (根据读写权限矩阵严格管控) -->
    <template #footer>
      <div class="drawer-footer-actions">
        <!-- 通用关闭按钮 -->
        <el-button @click="handleClose">{{ $t('close') }}</el-button>

        <!-- 可处理变体 (变体 1, 2, 3) 专用操作 -->
        <template v-if="isAdjudicationAvailable && selectedRow">
          <!-- 延期 (仅当具有到期时间且可延期时展示) -->
          <el-button
            v-if="canExtend"
            type="primary"
            plain
            :loading="actionLoading"
            @click="emit('extend', selectedRow)"
          >
            <Icon icon="fluent:calendar-clock-20-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnExtend') }}</span>
          </el-button>

          <!-- 备注 -->
          <el-button
            type="info"
            plain
            :loading="actionLoading"
            @click="emit('note', selectedRow)"
          >
            <Icon icon="fluent:note-edit-20-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnNote') }}</span>
          </el-button>

          <!-- 主处理动作：已封禁 -> 解封，否则 -> 重新封禁 -->
          <el-button
            v-if="selectedRow.status === 'banned'"
            type="success"
            :loading="actionLoading"
            @click="emit('toggleBan', selectedRow)"
          >
            <Icon icon="fluent:lock-open-16-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnUnban') }}</span>
          </el-button>
          <el-button
            v-else
            type="danger"
            :loading="actionLoading"
            @click="emit('toggleBan', selectedRow)"
          >
            <Icon icon="fluent:prohibited-16-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnReban') }}</span>
          </el-button>
        </template>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@iconify/vue';
import { tzDayjs } from '@/utils/day.js';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  selectedRow: {
    type: Object,
    default: null
  },
  section: {
    type: String,
    default: 'threat'
  },
  actionLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'update:modelValue',
  'action',
  'verdict',
  'extend',
  'note',
  'toggleBan',
  'openOperator',
  'refresh'
]);

const { t } = useI18n();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const drawerSize = computed(() => {
  return window.innerWidth <= 768 ? '100vw' : '720px';
});

// 当前激活的变体 (1: 滥用威胁, 2: 封禁存证, 3: 风险管理, 4: 操作记录台账)
const activeVariant = ref(1);
const activeChapter = ref('summary');
const scrollContainerRef = ref(null);
const internalDecisionNotes = ref('');

// 根据板块或工单智能计算默认变体
function computeDefaultVariant() {
  if (props.selectedRow?._forcedVariant) return Number(props.selectedRow._forcedVariant);
  if (props.section === 'threat') return 1;
  if (props.section === 'appeal') return 2;
  if (props.section === 'audit') return 3;
  if (props.section === 'record') return 4;
  
  // Section 为 all 或缺省时，根据行属性推断
  const r = props.selectedRow;
  if (!r) return 1;
  if (r.warningType === 'risk' || r.isCluster || r.clusterId) return 1;
  if (r.warningType === 'appeal') return 2;
  if (r.warningType === 'audit') return 3;
  if (r.warningType === 'ban' || ['banned', 'unbanned', 'resolved', 'expired', 'rejected'].includes(r.status)) return 4;
  return 1;
}

watch(
  () => [props.modelValue, props.selectedRow, props.section],
  ([newVal]) => {
    if (newVal) {
      activeVariant.value = computeDefaultVariant();
      internalDecisionNotes.value = props.selectedRow?.warningType === 'appeal'
        ? (t('auditDefaultNoteApproved') || '经复核，申诉材料属实予以通过')
        : '';
    }
  },
  { immediate: true }
);

function handleSelectVariant(vNum) {
  activeVariant.value = Number(vNum);
  nextTick(() => {
    syncDeepLink();
  });
}

function handleClose() {
  visible.value = false;
  clearDeepLink();
}

// 变体标题与元信息计算
const currentVariantTitle = computed(() => {
  switch (activeVariant.value) {
    case 1: return t('auditVariant1Title');
    case 2: return t('auditVariant2Title');
    case 3: return t('auditVariant3Title');
    case 4: return t('auditVariant4Title');
    default: return t('auditVariant1Title');
  }
});

const currentVariantSub = computed(() => {
  switch (activeVariant.value) {
    case 1: return t('auditVariant1Sub');
    case 2: return t('auditVariant2Sub');
    case 3: return t('auditVariant3Sub');
    case 4: return t('auditVariant4Sub');
    default: return t('auditVariant1Sub');
  }
});

const currentVariantBadge = computed(() => {
  switch (activeVariant.value) {
    case 1: return t('auditModeProcessable');
    case 2: return t('auditModeTamperProof');
    case 3: return t('auditModeRoutineAudit');
    case 4: return t('auditModePureReadonly');
    default: return t('auditModeProcessable');
  }
});

const variantBadgeType = computed(() => {
  switch (activeVariant.value) {
    case 1: return 'danger';
    case 2: return 'warning';
    case 3: return 'primary';
    case 4: return 'info';
    default: return 'primary';
  }
});

const variantIcon = computed(() => {
  switch (activeVariant.value) {
    case 1: return 'fluent:shield-dismiss-20-filled';
    case 2: return 'fluent:person-feedback-20-filled';
    case 3: return 'fluent:clipboard-search-20-filled';
    case 4: return 'fluent:history-20-filled';
    default: return 'fluent:shield-task-20-filled';
  }
});

const variantThemeClass = computed(() => {
  switch (activeVariant.value) {
    case 1: return 'theme-threat';
    case 2: return 'theme-appeal';
    case 3: return 'theme-audit';
    case 4: return 'theme-record';
    default: return 'theme-threat';
  }
});

// 是否可进行裁决与写操作 (变体 1, 2, 3 为真；变体 4 绝对只读)
const isAdjudicationAvailable = computed(() => {
  return activeVariant.value !== 4;
});

// 格式化与脱敏辅助函数
function maskEmail(email) {
  if (!email) return '-';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const username = parts[0];
  const domain = parts[1];
  if (username.length <= 2) {
    return username[0] + '***@' + domain;
  }
  return username[0] + '***' + username[username.length - 1] + '@' + domain;
}

function maskUserId(userId) {
  if (!userId) return '-';
  const str = String(userId);
  if (str.length <= 4) return str;
  return str.slice(0, 3) + '***' + str.slice(-3);
}

function copyText(text, successMsg) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success(successMsg || t('abuseCopiedSuccess'));
  }).catch(() => {
    ElMessage.success(successMsg || t('abuseCopiedSuccess'));
  });
}

function copyCaseNo(no) {
  copyText(no, t('auditCopiedCaseNo'));
}

function copyEmail(email) {
  copyText(email, t('auditCopiedEmail'));
}

function copyUserId(id) {
  copyText(id, t('auditCopiedUserId'));
}

function copyHash(hash) {
  copyText(hash, t('auditCopiedHash'));
}

const caseNumber = computed(() => {
  const r = props.selectedRow;
  if (!r) return 'CASE-000000';
  return r.ticketId || r.ticketNo || ('#AK' + String(r.id || 1000).padStart(4, '0'));
});

const maskedEmail = computed(() => maskEmail(props.selectedRow?.email));

const rawUserId = computed(() => {
  const r = props.selectedRow;
  return r?.userId ? ('usr_' + r.userId) : (r?.id ? ('usr_' + r.id) : 'usr_1001');
});

const maskedUserId = computed(() => maskUserId(rawUserId.value));

const isBanType = computed(() => {
  const r = props.selectedRow;
  if (!r) return false;
  return r.warningType === 'ban' || r.status === 'banned';
});

function formatTime(val) {
  if (!val) return '-';
  return tzDayjs(val).format('YYYY-MM-DD HH:mm');
}

// 状态与分类元信息
function getStatusTagType(status) {
  switch (status) {
    case 'banned': return 'danger';
    case 'unbanned': return 'success';
    case 'pending': return 'warning';
    case 'watching': return 'info';
    case 'resolved': return 'success';
    case 'expired': return 'info';
    case 'rejected': return 'danger';
    default: return 'primary';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'banned': return t('auditStatusBannedActive');
    case 'unbanned': return t('auditStatusUnbannedRecord');
    case 'pending': return t('auditCaseStatusPending');
    case 'watching': return t('auditStatusWatching');
    case 'resolved': return t('auditCaseStatusResolved');
    case 'expired': return t('auditCaseStatusExpired');
    case 'rejected': return t('auditStatusRejectedAppeal');
    default: return status || '-';
  }
}

const secondaryStatus = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  if (r.circuitStatus === 'TRIPPED' || (r.banReason && r.banReason.includes('熔断'))) {
    return { label: t('abuseActionCircuitHold') || '通道熔断', type: 'danger', icon: 'fluent:warning-20-filled' };
  }
  if (r.status === 'watching') {
    return { label: t('auditStatusWatching'), type: 'warning', icon: 'fluent:eye-tracking-16-regular' };
  }
  if (r.status === 'probation') {
    return { label: 'MFA挑战中', type: 'primary', icon: 'fluent:key-reset-16-regular' };
  }
  return null;
});

const riskLevelTag = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  if (r.riskLevel === 'high' || r.priority === 'CRITICAL' || r.priority === 'P0' || r.warningType === 'risk') {
    return { label: t('auditThreatCriticalTag'), type: 'danger' };
  }
  if (r.priority === 'LV3' || r.priority === 'P1') {
    return { label: t('auditLevelRoutine3'), type: 'warning' };
  }
  if (r.priority === 'LV2') {
    return { label: t('auditLevelRoutine2'), type: 'warning' };
  }
  if (r.priority === 'LV1') {
    return { label: t('auditLevelRoutine1'), type: 'info' };
  }
  if (r.priority === 'LV0') {
    return { label: t('auditLevelRoutine0'), type: 'info' };
  }
  return null;
});

const evidenceDaysText = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  const days = r.evidenceExpiresDays !== undefined ? r.evidenceExpiresDays : 180;
  return t('abuseEvidenceRemainingDays', { days });
});

const evidenceDaysFormatted = computed(() => {
  const r = props.selectedRow;
  const days = r?.evidenceExpiresDays !== undefined ? r.evidenceExpiresDays : 180;
  return `${days} 天 (WORM 防篡改标准)`;
});

const alarmCountValue = computed(() => {
  const r = props.selectedRow;
  if (!r) return undefined;
  return r.alarmCount !== undefined ? r.alarmCount : (r.reportedByOthers || 1);
});

const deadlineValue = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  const dl = r.deadline || r.expireTime || r.deadlockTime;
  return dl ? formatTime(dl) : null;
});

const isDeadlineImminent = computed(() => {
  const r = props.selectedRow;
  if (!r || !r.deadline) return false;
  const diff = new Date(r.deadline).getTime() - Date.now();
  return diff > 0 && diff < 3 * 86400000;
});

const authorityValue = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  if (r.finalAuthorityDesc) return r.finalAuthorityDesc;
  if (r.authority) return r.authority;
  return r.adjudicator || 'SecAdmin (安全主管)';
});

const categoryTagMeta = computed(() => {
  const r = props.selectedRow;
  if (!r) return { label: t('reportReasonCategory'), type: 'info' };
  if (r.category === 'quota' || r.eventType?.includes('multi_account')) {
    return { label: t('abuseCatQuota'), type: 'danger' };
  }
  if (r.category === 'outbound' || r.reportCategory === 'spam') {
    return { label: t('auditCatOutbound'), type: 'warning' };
  }
  if (r.category === 'account' || r.eventType?.includes('credential')) {
    return { label: t('auditCatAccount'), type: 'danger' };
  }
  if (r.category === 'content' || r.reportCategory === 'phishing') {
    return { label: t('auditCatContent'), type: 'danger' };
  }
  if (r.warningType === 'appeal') {
    return { label: t('auditCatAppeal'), type: 'warning' };
  }
  return { label: t('auditCatRoutine'), type: 'info' };
});

// 负责人入口计算
const operatorDisplayName = computed(() => {
  const r = props.selectedRow;
  return r?.operator || r?.assignee || r?.adjudicator || 'SecAdmin';
});

const operatorInitials = computed(() => {
  const name = operatorDisplayName.value;
  return name.slice(0, 2).toUpperCase();
});

const operatorRoleLabel = computed(() => {
  const r = props.selectedRow;
  const isSys = operatorDisplayName.value.toLowerCase().includes('bot') || operatorDisplayName.value.toLowerCase().includes('system');
  return isSys ? t('auditOperatorRoleSystem') : t('auditOperatorRoleAdmin');
});

function openOperatorDialog() {
  emit('openOperator', props.selectedRow);
}

// 章节标题随变体切换 (变体 2 存证视角: 案件信息 / 风险研判 / 提交裁决)
const chapterLabels = computed(() => {
  const isEvidenceVariant = activeVariant.value === 2;
  return {
    summary: isEvidenceVariant ? t('auditV2ChipSummary') : t('auditChipSummary'),
    basis: isEvidenceVariant ? t('auditV2ChipBasis') : t('auditChipBasis'),
    decision: isEvidenceVariant ? t('auditV2ChipDecision') : t('auditAdjudicateAction')
  };
});

// 章节动态计算
const availableChapters = computed(() => {
  const list = [];
  list.push({ id: 'summary', label: chapterLabels.value.summary, icon: 'fluent:document-text-16-regular' });
  
  if (clusterAccountsList.value && clusterAccountsList.value.length > 0) {
    list.push({ id: 'cluster', label: t('auditChipCluster'), icon: 'fluent:people-community-16-regular' });
  }

  list.push({ id: 'basis', label: chapterLabels.value.basis, icon: 'fluent:shield-task-16-regular' });
  list.push({ id: 'timeline', label: t('auditChipTimeline'), icon: 'fluent:timeline-16-regular' });

  if (riskProfileData.value) {
    list.push({ id: 'risk', label: t('auditChipRisk'), icon: 'fluent:chart-multiple-16-regular' });
  }

  if (activeVariant.value === 2) {
    list.push({ id: 'similar', label: t('auditChipSimilar'), icon: 'fluent:branch-compare-16-regular' });
    list.push({ id: 'chain', label: t('auditChipChain'), icon: 'fluent:link-multiple-16-regular' });
  }

  if (isAdjudicationAvailable.value) {
    list.push({ id: 'decision', label: chapterLabels.value.decision, icon: 'fluent:gavel-16-regular' });
  }

  if (activeVariant.value === 4) {
    list.push({ id: 'ledger', label: t('auditChipLedger'), icon: 'fluent:book-database-16-regular' });
  }

  return list;
});

function scrollToChapter(chapterId) {
  activeChapter.value = chapterId;
  const target = document.getElementById('chapter-' + chapterId);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    syncDeepLink(chapterId);
  }
}

function handleBodyScroll() {
  const container = scrollContainerRef.value;
  if (!container) return;
  const sections = availableChapters.value.map(c => document.getElementById('chapter-' + c.id)).filter(Boolean);
  const containerTop = container.getBoundingClientRect().top;
  
  for (let i = sections.length - 1; i >= 0; i--) {
    const rect = sections[i].getBoundingClientRect();
    if (rect.top <= containerTop + 100) {
      activeChapter.value = availableChapters.value[i].id;
      break;
    }
  }
}

// 模块 B: 集群关联账号数据
const clusterAccountsList = computed(() => {
  const accounts = props.selectedRow?.clusterAccounts;
  return Array.isArray(accounts) ? accounts : [];
});

// 模块 C: 处置依据细节
const redBanReasonText = computed(() => {
  const r = props.selectedRow;
  if (!r) return '';
  return r.banReason || (isBanType.value && r.actionText ? r.actionText : (r.reportReason || ''));
});

const evidenceSummaryText = computed(() => {
  const r = props.selectedRow;
  if (!r) return t('auditReasonSystemRule');
  return r.evidenceSummary || r.categorySummary || t('auditReasonSystemRule');
});

const evidenceDigestHash = computed(() => {
  return props.selectedRow?.evidenceHash || '';
});

const actionBadgeText = computed(() => {
  const r = props.selectedRow;
  if (!r) return t('action');
  if (r.status === 'banned') return t('auditSuggestionBan');
  if (r.status === 'unbanned') return t('auditSuggestionUnban');
  return t('auditSuggestionWatch');
});

// 固定 6 种标记列表解析: [放行说明] [延期处置] [解禁说明] [审核备忘] [驳回理由] [更新]
const parsedDetailLogs = computed(() => {
  const r = props.selectedRow;
  if (!r || !r.detailText) return [];
  const lines = r.detailText.split('\n').map(l => l.trim()).filter(Boolean);
  const tagRegex = /^\[(放行说明|延期处置|解禁说明|审核备忘|驳回理由|更新)\]\s*(.*)$/;
  
  return lines.map(line => {
    const match = line.match(tagRegex);
    if (match) {
      const tag = match[1];
      const content = match[2];
      let tagType = 'info';
      if (tag === '放行说明' || tag === '解禁说明') tagType = 'success';
      else if (tag === '延期处置') tagType = 'primary';
      else if (tag === '审核备忘') tagType = 'warning';
      else if (tag === '驳回理由') tagType = 'danger';
      else if (tag === '更新') tagType = 'info';
      return { tag, content, tagType };
    }
    return { tag: null, content: line, tagType: null };
  });
});

// 模块 D: 全周期时间线节点 (双泳道)
const timelineNodes = computed(() => {
  const r = props.selectedRow;
  if (!r) return [];
  const cTime = r.createTime || new Date().toISOString();
  
  if (r.timeline && r.timeline.length) {
    return r.timeline.map((item, idx) => {
      const actor = item.actor || 'RuleEngine';
      const isMachine = actor.includes('Rule') || actor.includes('System') || actor.includes('Sentinel') || actor.includes('Engine');
      return {
        formattedTime: formatTime(item.time || cTime),
        actor,
        lane: isMachine ? 'machine' : 'human',
        icon: isMachine ? 'fluent:bot-16-regular' : 'fluent:person-16-regular',
        title: item.event || item.title || '状态流转记录',
        description: item.desc || item.actionText || '',
        transition: item.transition || null,
        duration: item.duration || null,
        hash: item.hash || null,
        isLatest: idx === r.timeline.length - 1
      };
    });
  }

  // 缺省时智能派生标准的双泳道时间线
  const nodes = [
    {
      formattedTime: formatTime(cTime),
      actor: 'RuleEngine (Sentinel)',
      lane: 'machine',
      icon: 'fluent:bot-16-regular',
      title: '基线规则初判命中',
      description: `系统自动化探针命中规则 ${r.reasonCode || 'QUOTA_EVASION'}，生成风控研判工单。`,
      transition: { from: 'init', to: 'pending' },
      duration: null,
      hash: null,
      isLatest: false
    },
    {
      formattedTime: formatTime(r.banTime || cTime),
      actor: r.assignee || 'System Policy',
      lane: 'machine',
      icon: 'fluent:shield-dismiss-16-regular',
      title: '执行管控动作',
      description: r.banReason || '触碰策略红线，外发通道实施阻断',
      transition: { from: 'pending', to: 'banned' },
      duration: null,
      hash: null,
      isLatest: r.status === 'banned' && !r.appealReason
    }
  ];

  if (r.appealReason) {
    nodes.push({
      formattedTime: formatTime(r.lastUpdated || r.banTime || cTime),
      actor: 'User (Complainant)',
      lane: 'human',
      icon: 'fluent:person-feedback-16-regular',
      title: '提交争议复核申请',
      description: `申诉附言：“${r.appealReason}”`,
      transition: { from: 'banned', to: 'appealing' },
      duration: null,
      hash: null,
      isLatest: false
    });
  }

  if (r.status === 'unbanned') {
    nodes.push({
      formattedTime: formatTime(r.resolvedTime || new Date().toISOString()),
      actor: r.adjudicator || 'SecAdmin',
      lane: 'human',
      icon: 'fluent:checkmark-circle-16-regular',
      title: '申诉复核通过 · 批准解封',
      description: '完成凭证合规核验，移除黑名单并恢复服务。',
      transition: { from: 'appealing', to: 'unbanned' },
      duration: null,
      hash: null,
      isLatest: true
    });
  } else {
    nodes.push({
      formattedTime: formatTime(new Date().toISOString()),
      actor: operatorDisplayName.value,
      lane: 'human',
      icon: 'fluent:gavel-16-regular',
      title: '当前研判队列',
      description: '等待安全主管最终裁决或例行归档。',
      transition: null,
      duration: null,
      hash: null,
      isLatest: true
    });
  }

  return nodes;
});

// 后端未提供 timeline 时前端会派生示意节点，此时必须显式披露为占位样本
const timelineIsSynthetic = computed(() => {
  return !(props.selectedRow?.timeline?.length > 0);
});

// 模块 E: 多维风险画像数据
const riskProfileData = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;

  const compScore = r.matchScore ? Math.round(100 - r.matchScore * 0.4) : (r.riskLevel === 'high' ? 88 : (r.riskLevel === 'medium' ? 64 : 32));
  
  return {
    compositeScore: compScore,
    mainDriver: r.warningType === 'risk'
      ? '一人多号群控集群关联度高 (94分) 与异地指纹跳跃'
      : (r.warningType === 'appeal' ? '争议申诉抗辩凭证待核实' : '发信超频与高退信率'),
    dimensions: [
      { name: '设备指纹连续性', score: r.matchScore || 82, weight: 25 },
      { name: '网络拓扑与IP信誉', score: (r.activeIpCount > 1 || r.isMultiIp) ? 92 : 28, weight: 30 },
      { name: '行为速率与遥测', score: isBanType.value ? 85 : 42, weight: 25 },
      { name: '凭证身份健康度', score: (r.status === 'banned') ? 76 : 24, weight: 20 }
    ],
    metrics: [
      {
        name: '同一 IP 关联账号数',
        rule: 'SEC-IP-CLUSTER',
        probeNotes: '探针周期 24h · 关联度 98%',
        currentValue: `${r.activeIpCount > 1 ? r.activeIpCount : (r.isMultiIp === 1 ? 8 : 1)} 个`,
        isOverThreshold: (r.activeIpCount > 1 || r.isMultiIp === 1),
        isNumeric: true,
        ratio: (r.activeIpCount > 1 || r.isMultiIp === 1) ? 95 : 20,
        selfTickPos: 40,
        cohortBaseline: '1 个',
        self30d: '1 个',
        threshold: '≤ 1 个'
      },
      {
        name: '发信频次峰值',
        rule: 'SEC-OUTBOUND-RATE',
        probeNotes: '滑动窗口 60s · 采样 120 封',
        currentValue: isBanType.value ? '48 封/分' : '8 封/分',
        isOverThreshold: isBanType.value,
        isNumeric: true,
        ratio: isBanType.value ? 90 : 25,
        selfTickPos: 35,
        cohortBaseline: '5 封/分',
        self30d: '10 封/分',
        threshold: '≤ 20 封/分'
      },
      {
        name: '退信拦截率 (Bounce Rate)',
        rule: 'SEC-BOUNCE-RATE',
        probeNotes: '收件人 MX 回执遥测',
        currentValue: isBanType.value ? '16.5%' : '1.8%',
        isOverThreshold: isBanType.value,
        isNumeric: true,
        ratio: isBanType.value ? 88 : 15,
        selfTickPos: 25,
        cohortBaseline: '1.5%',
        self30d: '2.0%',
        threshold: '≤ 5.0%'
      },
      {
        name: '设备指纹相似度',
        rule: 'SEC-FP-SIMILARITY',
        probeNotes: 'Canvas / WebGL / AudioContext 复合哈希',
        currentValue: `${r.matchScore || 85}%`,
        isOverThreshold: (r.matchScore || 85) < 70,
        isNumeric: true,
        ratio: (r.matchScore || 85) < 70 ? 92 : 30,
        selfTickPos: 50,
        cohortBaseline: '≥ 85%',
        self30d: '88%',
        threshold: '≥ 70%'
      },
      {
        name: '二次认证保护 (MFA)',
        rule: 'SEC-AUTH-2FA',
        probeNotes: 'TOTP / WebAuthn 硬件密匙状态',
        currentValue: r.status === 'banned' ? '未激活' : '已保护',
        isOverThreshold: r.status === 'banned',
        isNumeric: false,
        hit: r.status === 'banned',
        statusNote: r.status === 'banned' ? '缺乏强身分认证保护' : '受信凭证'
      }
    ]
  };
});

const riskScoreLevelClass = computed(() => {
  const s = riskProfileData.value?.compositeScore || 0;
  if (s >= 75) return 'score-danger';
  if (s >= 50) return 'score-warning';
  return 'score-success';
});

function getScoreColorClass(score) {
  if (score >= 75) return 'text-danger font-semibold';
  if (score >= 50) return 'text-warning font-medium';
  return 'text-success';
}

function getProgressColor(score) {
  if (score >= 75) return '#ef4444';
  if (score >= 50) return '#f59e0b';
  return '#10b981';
}

// 模块 F: 相似案例参照数据 (变体 2 核心)
const similarCasesData = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  const reasonCode = r.reasonCode || 'QUOTA_EVASION';
  return {
    reasonCode,
    totalCases: 50,
    stats: [
      { key: 'maintain', label: t('auditSimilarKeepBan'), count: 34, percentage: 68, color: '#ef4444' },
      { key: 'watch', label: t('auditSimilarWatch'), count: 8, percentage: 16, color: '#f59e0b' },
      { key: 'approve', label: t('auditSimilarApprove'), count: 6, percentage: 12, color: '#10b981' },
      { key: 'whitelist', label: t('auditSimilarWhitelist'), count: 2, percentage: 4, color: '#3b82f6' }
    ],
    advisoryText: t('auditSimilarAdvisory', { count: 50, code: reasonCode, rate: 84 })
  };
});

// 模块 G: 证据链溯源列表 (变体 2 核心)
const evidenceChainList = computed(() => {
  const r = props.selectedRow;
  if (!r) return [];
  return [
    {
      evidence: '设备指纹碰撞与 8 会话并发',
      hash: 'e8f4c2...91ab',
      rule: 'SEC-RULE-QUOTA-09',
      step: '节点 #01 初判命中',
      judgement: '触碰一人多户滥用底线'
    },
    {
      evidence: '跨大区漫游 IP (非受信网络)',
      hash: '7b1d40...2a3c',
      rule: 'SEC-RULE-ROAMING-02',
      step: '节点 #02 执行封禁',
      judgement: '限制外发通道并冻结凭证'
    },
    {
      evidence: r.appealReason ? '用户申诉表单附言抗辩' : '历史审计日志记录',
      hash: '9a3e21...8f0d',
      rule: 'SEC-RULE-APPEAL-REV',
      step: '节点 #03 申诉流转',
      judgement: '核实硬件密匙与会话合法性'
    }
  ];
});

// 裁决批注快捷插入
function applyPresetNote(noteText) {
  if (internalDecisionNotes.value) {
    internalDecisionNotes.value += `；${noteText}`;
  } else {
    internalDecisionNotes.value = noteText;
  }
}

// 裁决与动作执行 (二次确认保障)
async function confirmAndExecuteAction(actionKey, actionLabel) {
  const r = props.selectedRow;
  if (!r) return;
  try {
    await ElMessageBox.confirm(
      t('auditAdjudicationConfirmMsg', { email: r.email, action: actionLabel }),
      t('auditAdjudicationConfirmTitle'),
      {
        confirmButtonText: t('auditConfirmAction') || t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }
    );
    emit('action', actionKey, internalDecisionNotes.value, r);
  } catch (err) {
    // 用户取消二次确认
  }
}

async function confirmAndExecuteVerdict(decisionKey, decisionLabel) {
  const r = props.selectedRow;
  if (!r) return;
  try {
    await ElMessageBox.confirm(
      t('auditAdjudicationConfirmMsg', { email: r.email, action: decisionLabel }),
      t('auditAdjudicationConfirmTitle'),
      {
        confirmButtonText: t('auditConfirmAction') || t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }
    );
    emit('verdict', decisionKey, internalDecisionNotes.value, r);
  } catch (err) {
    // 用户取消二次确认
  }
}

// 底部动作控制
const canExtend = computed(() => {
  const r = props.selectedRow;
  if (!r) return false;
  const deadline = r.deadline || r.expireTime || r.deadlockTime;
  return !!deadline && new Date(deadline).getTime() > Date.now();
});

// 深链定位支持 (URL hash 携带: #case=CASE-ID:CHAPTER-ID)
function syncDeepLink(chapter) {
  const r = props.selectedRow;
  if (!r) return;
  const cNo = r.ticketId || r.id;
  const chap = chapter || activeChapter.value;
  try {
    const newHash = `#case=${cNo}:${chap}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  } catch (e) {}
}

function clearDeepLink() {
  try {
    if (window.location.hash.includes('case=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch (e) {}
}

function handleDrawerOpened() {
  // 检查 URL 是否有指定章节深链并滚动
  try {
    const hash = window.location.hash || '';
    if (hash.includes(':')) {
      const parts = hash.split(':');
      const targetChap = parts[1];
      if (targetChap && availableChapters.value.some(c => c.id === targetChap)) {
        scrollToChapter(targetChap);
        return;
      }
    }
  } catch (e) {}
  syncDeepLink();
}
</script>

<style scoped lang="scss">
.audit-drawer-container {
  :deep(.el-drawer) {
    background: var(--el-bg-color);
  }
  :deep(.el-drawer__header) {
    margin-bottom: 0;
    padding: 0;
  }
  :deep(.el-drawer__body) {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  :deep(.el-drawer__footer) {
    padding: 12px 20px;
    border-top: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
  }
}

/* 头部外壳 */
.drawer-header-shell {
  display: flex;
  flex-direction: column;
  padding: 16px 20px 10px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.drawer-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-main-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.header-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  flex-shrink: 0;

  &.theme-threat {
    background: rgba(239, 68, 68, 0.12);
    color: var(--el-color-danger);
  }
  &.theme-appeal {
    background: rgba(245, 158, 11, 0.12);
    color: var(--el-color-warning);
  }
  &.theme-audit {
    background: rgba(59, 130, 246, 0.12);
    color: var(--el-color-primary);
  }
  &.theme-record {
    background: rgba(16, 185, 129, 0.12);
    color: var(--el-color-success);
  }
}

.header-text-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.drawer-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  .drawer-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    line-height: 1.3;
  }
  .variant-mode-tag {
    font-size: 11px;
    font-weight: 500;
    height: 20px;
    padding: 0 6px;
  }
}

.drawer-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 440px;
}

.header-tools-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.variant-switch-btn {
  font-size: 12px;
}

.drawer-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }
}

/* 头部下方徽标行 */
.drawer-badge-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.meta-badges-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  .meta-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);

    &.case-no {
      cursor: pointer;
      font-weight: 500;
      &:hover {
        background: var(--el-fill-color);
      }
    }
    &.reason-code {
      background: rgba(239, 68, 68, 0.08);
      font-weight: 600;
    }
    &.evidence-days {
      color: var(--el-text-color-secondary);
    }
  }

  .meta-tag {
    font-size: 11.5px;
  }
}

.meta-operator-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  background: var(--el-fill-color-light);

  &:hover {
    background: var(--el-fill-color);
  }

  .operator-avatar-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 10.5px;
    font-weight: 600;
  }

  .operator-info-wrap {
    display: flex;
    flex-direction: column;
    line-height: 1.15;

    .operator-name {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
    .operator-role-sub {
      font-size: 10px;
      color: var(--el-text-color-secondary);
    }
  }

  .entry-arrow {
    color: var(--el-text-color-secondary);
  }
}

/* 章节锚点 Chip 组 */
.chapter-chips-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  margin-top: 10px;
  padding-bottom: 2px;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .chapter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 14px;
    font-size: 12px;
    color: var(--el-text-color-regular);
    background: var(--el-fill-color-light);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    user-select: none;

    &:hover {
      background: var(--el-fill-color);
      color: var(--el-text-color-primary);
    }

    &.chip-active {
      background: var(--el-color-primary);
      color: #fff;
      font-weight: 500;
    }
  }
}

/* 正文滚动区 */
.drawer-scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;
}

/* 通用档案卡片 */
.dossier-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--el-bg-color);

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .title-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-badge {
      font-size: 11px;
      font-weight: 500;
      color: var(--el-text-color-secondary);
    }

    .data-tag-muted {
      font-size: 11px;
      font-weight: 400;
      color: var(--el-text-color-secondary);
    }
  }
}

.placeholder-sample-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  border-left: 2px solid var(--el-color-warning);
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

/* 模块 A: 12 字段两列网格 */
.dossier-grid-12 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 16px;

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }

  .grid-field {
    display: flex;
    align-items: center;
    font-size: 12.5px;

    .field-k {
      color: var(--el-text-color-secondary);
      margin-right: 8px;
      min-width: 72px;
      flex-shrink: 0;
    }

    .field-v {
      color: var(--el-text-color-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .field-v-with-copy {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--el-text-color-primary);
      overflow: hidden;

      .masked-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
}

.inline-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;

  &:hover {
    background: var(--el-fill-color);
    color: var(--el-color-primary);
  }
}

/* 模块 B: 集群关联账号 */
.cluster-accounts-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;

  .cluster-header-row {
    display: grid;
    grid-template-columns: 36px 1fr 100px 80px 130px;
    padding: 7px 10px;
    background: var(--el-fill-color-light);
    font-weight: 600;
    color: var(--el-text-color-secondary);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .cluster-data-row {
    display: grid;
    grid-template-columns: 36px 1fr 100px 80px 130px;
    padding: 7px 10px;
    align-items: center;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &:last-child {
      border-bottom: none;
    }

    .col-email {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.cluster-footnote {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);

  .footnote-icon {
    flex-shrink: 0;
    color: var(--el-color-warning);
  }
}

/* 模块 C: 处置依据内嵌卡片 */
.disposition-nested-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.appeal-statement-quote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-left: 3px solid var(--el-color-warning);
  background: var(--el-fill-color-light);
  border-radius: 0 6px 6px 0;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  font-style: italic;

  .quote-icon {
    flex-shrink: 0;
    color: var(--el-color-warning);
    margin-top: 1px;
  }
}

.red-ban-reason-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: var(--el-color-danger);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;

  .alert-icon {
    flex-shrink: 0;
    margin-top: 1px;
  }
}

.evidence-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  gap: 8px;

  .summary-line-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .evidence-abstract {
    font-size: 12.5px;
    color: var(--el-text-color-primary);
  }
  .evidence-hash {
    font-size: 11px;
  }
}

.action-description-box {
  padding: 6px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;

  .action-pill-row {
    display: flex;
    align-items: center;
    gap: 8px;

    .action-sub-text {
      font-size: 12px;
      color: var(--el-text-color-primary);
    }
  }
}

.detail-logs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);

  .logs-header-label {
    font-size: 10.5px;
    color: var(--el-text-color-secondary);
  }

  .detail-log-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    line-height: 1.45;

    .log-tag {
      flex-shrink: 0;
      font-size: 10.5px;
      height: 19px;
      padding: 0 5px;
    }
    .log-bullet {
      color: var(--el-text-color-secondary);
      flex-shrink: 0;
    }
    .log-content {
      color: var(--el-text-color-primary);
      &.plain-text {
        color: var(--el-text-color-regular);
      }
    }
  }
}

/* 模块 D: 双泳道全周期时间线 */
.timeline-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      &.machine-dot { background: var(--el-color-primary); }
      &.human-dot { background: var(--el-color-warning); }
    }
  }
}

.dual-swimlane-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-node-card {
  display: flex;
  gap: 12px;

  .node-left-track {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 28px;
    flex-shrink: 0;

    .node-icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      z-index: 1;

      &.icon-machine {
        background: rgba(59, 130, 246, 0.12);
        color: var(--el-color-primary);
      }
      &.icon-human {
        background: rgba(245, 158, 11, 0.12);
        color: var(--el-color-warning);
      }
    }

    .node-connector-line {
      flex: 1;
      width: 2px;
      background: var(--el-border-color-lighter);
      margin: 4px 0;
    }
  }

  .node-body {
    flex: 1;
    background: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &.node-latest .node-body {
    border-color: rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.02);
  }

  .node-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .node-header-left {
      display: flex;
      align-items: center;
      gap: 6px;

      .node-number {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
      .node-title {
        font-size: 12.5px;
        color: var(--el-text-color-primary);
      }
      .latest-tag {
        font-size: 10px;
        height: 18px;
        padding: 0 4px;
      }
    }

    .node-header-right {
      font-size: 11px;
      color: var(--el-text-color-secondary);
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  .node-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;

    .node-actor {
      display: flex;
      align-items: center;
      gap: 3px;
      color: var(--el-text-color-primary);
    }
    .actor-lane-tag {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      &.tag-machine {
        background: rgba(59, 130, 246, 0.08);
        color: var(--el-color-primary);
      }
      &.tag-human {
        background: rgba(245, 158, 11, 0.08);
        color: var(--el-color-warning);
      }
    }
    .node-transition {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      font-size: 11px;
      .arrow { color: var(--el-text-color-secondary); }
    }
  }

  .node-desc {
    font-size: 12px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
  }

  .node-evidence-hash {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    color: var(--el-text-color-secondary);
    padding: 3px 6px;
    border-radius: 4px;
    background: var(--el-fill-color-light);
    width: fit-content;
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}

/* 模块 E: 多维风险画像 */
.risk-profile-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  margin-bottom: 14px;
}

.composite-score-box {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-bg-color);
  flex-shrink: 0;

  .score-number {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
  }
  .score-denom {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .score-label {
    font-size: 11px;
    margin-left: 6px;
    color: var(--el-text-color-secondary);
  }

  &.score-danger {
    color: var(--el-color-danger);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  &.score-warning {
    color: var(--el-color-warning);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  &.score-success {
    color: var(--el-color-success);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
}

.risk-driver-summary {
  display: flex;
  flex-direction: column;
  gap: 3px;

  .driver-title-row {
    font-size: 12.5px;
    .driver-label {
      color: var(--el-text-color-secondary);
      margin-right: 6px;
    }
  }
  .driver-desc {
    font-size: 11px;
  }
}

.risk-dimensions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;

  .dimension-row {
    display: flex;
    flex-direction: column;
    gap: 3px;

    .dim-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;

      .dim-meta {
        font-size: 11.5px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }
  }
}

.gauge-legend-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 10px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;

  .legend-pill {
    display: flex;
    align-items: center;
    gap: 4px;

    .legend-color-box {
      width: 10px;
      height: 4px;
      border-radius: 2px;
      &.base-cohort { background: var(--el-color-primary); }
      &.base-self { background: var(--el-color-warning); }
      &.base-threshold { background: var(--el-color-danger); }
    }
  }
}

.risk-indicators-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metric-card-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  align-items: center;

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .metric-info-col {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .metric-title-line {
      display: flex;
      align-items: baseline;
      gap: 4px;
      .metric-name {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }
      .metric-rule {
        font-size: 10px;
      }
    }
    .metric-probe-notes {
      font-size: 10.5px;
      line-height: 1.2;
    }
  }

  .metric-data-col {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .metric-val-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .metric-val {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }
      .threshold-tag {
        font-size: 10.5px;
        height: 18px;
        padding: 0 4px;
      }
    }

    .gauge-bar-wrapper {
      display: flex;
      flex-direction: column;
      gap: 3px;

      .gauge-track {
        position: relative;
        height: 7px;
        background: var(--el-fill-color-light);
        border-radius: 4px;
        overflow: hidden;

        .gauge-fill {
          height: 100%;
          background: var(--el-color-primary);
          border-radius: 4px;
          transition: width 0.3s;
          &.fill-over {
            background: var(--el-color-danger);
          }
        }

        .gauge-tick {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          z-index: 2;

          &.tick-self {
            background: var(--el-color-warning);
          }
          &.tick-threshold {
            background: var(--el-color-danger);
          }
        }
      }

      .gauge-sub-labels {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        color: var(--el-text-color-secondary);

        .threshold-label {
          color: var(--el-color-danger);
          font-weight: 500;
        }
      }
    }

    .non-numeric-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
    }
  }
}

/* 模块 F: 相似案例参照 */
.similar-cases-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stacked-distribution-bar {
  display: flex;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-light);

  .dist-segment {
    height: 100%;
    transition: width 0.3s;
  }
}

.distribution-legend-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 12px;
  font-size: 11.5px;

  .dist-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;

    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dist-name {
      color: var(--el-text-color-secondary);
    }
    .dist-stat {
      color: var(--el-text-color-primary);
    }
  }
}

.consistency-advisory-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.45;

  .advisory-icon {
    flex-shrink: 0;
    color: var(--el-color-primary);
    margin-top: 1px;
  }
}

/* 模块 G: 证据链溯源 */
.evidence-chain-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  font-size: 11.5px;

  .chain-header-row {
    display: grid;
    grid-template-columns: 180px 140px 110px 1fr;
    padding: 7px 10px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    font-weight: 600;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .chain-item-row {
    display: grid;
    grid-template-columns: 180px 140px 110px 1fr;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    align-items: center;

    &:last-child {
      border-bottom: none;
    }

    .c-ev {
      display: flex;
      flex-direction: column;
      gap: 2px;
      .ev-title { color: var(--el-text-color-primary); }
      .ev-hash { font-size: 10px; }
    }

    .c-st .step-pill {
      background: var(--el-fill-color-light);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10.5px;
    }

    .c-jd {
      color: var(--el-text-color-regular);
    }
  }
}

/* 模块 H: 裁决工作台 */
.adjudication-workbench-card {
  .decision-input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;

    .decision-input-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;

      .input-title {
        font-size: 12.5px;
        color: var(--el-text-color-primary);
      }

      .quick-notes-presets {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;

        .preset-chip {
          border: 1px solid var(--el-border-color-lighter);
          background: var(--el-fill-color-light);
          padding: 2px 7px;
          border-radius: 10px;
          font-size: 10.5px;
          color: var(--el-text-color-secondary);
          cursor: pointer;
          transition: all 0.2s;

          &:hover {
            border-color: var(--el-color-primary);
            color: var(--el-color-primary);
          }
        }
      }
    }
  }

  .adjudication-actions-grid {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
}

/* 模块 I: 只读台账横幅 */
.sanction-ledger-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);

  .banner-icon {
    color: var(--el-color-success);
    flex-shrink: 0;
  }

  .banner-text-box {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .banner-title {
      font-size: 12.5px;
      color: var(--el-text-color-primary);
    }
    .banner-sub {
      font-size: 11px;
    }
  }
}

.unbanned-archive-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--el-color-success);
  margin-top: 10px;
  font-weight: 500;
}

/* 底部操作栏 */
.drawer-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
