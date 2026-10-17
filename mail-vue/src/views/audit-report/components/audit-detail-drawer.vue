<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    direction="rtl"
    destroy-on-close
    class="audit-detail-drawer audit-drawer-container"
    :class="variantThemeClass"
    :show-close="false"
    @opened="handleDrawerOpened"
  >
    <!-- 抽屉头部：统一展示标题 + 纯图标关闭按钮 + 章节锚点 Chips -->
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
              </div>
            </div>
          </div>

          <div class="header-tools-right">
            <!-- 纯图标关闭按钮 -->
            <el-tooltip effect="dark" :content="$t('close')" placement="top">
              <button class="drawer-close-btn" @click="handleClose">
                <Icon icon="fluent:dismiss-20-regular" width="18" height="18" />
              </button>
            </el-tooltip>
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
      
      <!-- 模块 A: 案件概要 (两列网格字段，左右等距对齐，纯文本展示) -->
      <section id="chapter-summary" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:document-text-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionOverview') }}</span>
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

          <!-- 2. 当前状态 (同步展示待审等标准状态，禁止展示原始 active) -->
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
            <span class="field-v font-mono font-medium reason-code-highlight">{{ selectedRow.reasonCode || 'RULE_INTERCEPT_STANDARD' }}</span>
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

          <!-- 11. 拍案管理 (直接展示名称，与列表中拍案管理完全对照) -->
          <div v-if="authorityValue" class="grid-field">
            <span class="field-k">{{ $t('auditColFinalAuthority') }}:</span>
            <span class="field-v font-medium text-primary">{{ authorityValue }}</span>
          </div>

          <!-- 12. 证据留存天数 (无需 WORM 无关描述) -->
          <div class="grid-field">
            <span class="field-k">{{ $t('abuseEvidenceRetentionLabel') }}:</span>
            <span class="field-v font-mono font-medium">{{ evidenceDaysFormatted }}</span>
          </div>
        </div>
      </section>

      <!-- 模块 B: 集群关联账号 (仅滥用威胁/具有集群账号时渲染) -->
      <section
        v-if="isThreatVariant && clusterAccountsList && clusterAccountsList.length > 0"
        id="chapter-cluster"
        class="dossier-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:people-community-20-regular" width="18" height="18" />
            <span>{{ $t('auditClusterAccountsTitle') }}</span>
            <el-tooltip effect="dark" :content="$t('auditClusterAccountsFootnote')" placement="top">
              <Icon icon="fluent:question-circle-16-regular" width="16" height="16" class="help-question-icon" />
            </el-tooltip>
            <el-tag size="small" type="danger" effect="plain" class="cluster-count-badge">
              {{ $t('auditClusterAccountsCount', { count: clusterAccountsList.length }) }}
            </el-tag>
          </div>
        </div>

        <div class="cluster-accounts-table">
          <div class="cluster-header-row font-mono">
            <span class="col-idx">{{ $t('auditColSerialSubCase') }}</span>
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
            <!-- 序列号与案件编号统一作为分项，如 THR-MULTI99-SUB01 -->
            <span class="col-idx font-mono font-medium text-danger">
              {{ getSubCaseId(caseNumber, cIdx) }}
            </span>
            <div class="col-email font-mono">
              <span :title="acc.email">{{ maskEmail(acc.email) }}</span>
              <button class="inline-copy-btn" :title="$t('abuseCopyEmail')" @click="copyEmail(acc.email)">
                <Icon icon="fluent:copy-16-regular" width="12" height="12" />
              </button>
            </div>
            <!-- 用户 ID 允许一键复制 -->
            <div class="col-uid font-mono text-muted flex items-center">
              <span>{{ maskUserId(acc.userId || ('usr_' + acc.id)) }}</span>
              <button class="inline-copy-btn" :title="$t('abuseCopyUserId')" @click="copyUserId(acc.userId || ('usr_' + acc.id))">
                <Icon icon="fluent:copy-16-regular" width="12" height="12" />
              </button>
            </div>
            <div class="col-status">
              <el-tag size="small" :type="getStatusTagType(acc.status)" effect="plain" :title="getStatusLabel(acc.status)">
                {{ getStatusLabel(acc.status) }}
              </el-tag>
            </div>
            <span class="col-relation font-mono text-danger" :title="acc.evidenceSummary">
              {{ acc.evidenceSummary || '同一设备指纹 · 关联集群' }}
            </span>
          </div>
        </div>
      </section>

      <!-- 模块 C: 风险研判与处置依据 (完整链路：报警原因、触发原因、推荐建议 + 研判路径记录) -->
      <section id="chapter-basis" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:shield-task-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionBasis') }}</span>
          </div>
          <span class="section-badge font-mono">#02-GROUNDS</span>
        </div>

        <div class="disposition-nested-card">
          <!-- 上部主链路：报警原因 (禁止 icon 替代文本) + 触发原因 + 推荐建议 -->
          <div class="basis-chain-card">
            <!-- 报警原因 (使用禁止的 icon 替代文本) -->
            <div class="basis-chain-row alarm-row">
              <div class="row-icon-col">
                <Icon icon="fluent:prohibited-20-filled" width="18" height="18" class="alarm-icon text-danger" />
              </div>
              <div class="row-content-col">
                <span class="chain-main-text font-medium">{{ currentAlarmReason }}</span>
              </div>
            </div>

            <!-- 触发原因 -->
            <div class="basis-chain-row trigger-row">
              <div class="row-icon-col">
                <el-tag size="small" :type="currentTriggerBadgeType" effect="plain" class="chain-tag">
                  {{ currentTriggerTag }}
                </el-tag>
              </div>
              <div class="row-content-col">
                <span class="chain-sub-text">{{ currentTriggerCause }}</span>
              </div>
            </div>

            <!-- 推荐建议 -->
            <div class="basis-chain-row suggestion-row">
              <div class="row-icon-col">
                <el-tag size="small" :type="currentSuggestionBadgeType" effect="dark" class="chain-tag">
                  {{ currentSuggestionTag }}
                </el-tag>
              </div>
              <div class="row-content-col">
                <span class="chain-sub-text font-medium">{{ currentSuggestionText }}</span>
              </div>
            </div>
          </div>

          <!-- 下面一个框专门显示完整的研判路径记录 -->
          <div class="judgment-path-record-box">
            <div class="record-box-header font-mono">
              <Icon icon="fluent:history-16-regular" width="14" height="14" />
              <span>{{ $t('auditJudgmentPathRecord') }}</span>
            </div>
            <div class="record-list">
              <div
                v-for="(log, lIdx) in currentJudgmentLogs"
                :key="lIdx"
                class="record-row"
              >
                <el-tag size="small" :type="log.tagType" effect="plain" class="record-tag">
                  {{ log.tag }}
                </el-tag>
                <span class="record-text font-mono">{{ log.content }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 D: 处置与存证全周期时间线 (时间线居中，左右双泳道分流，无多余时间线，边框徽章化无中括号) -->
      <section id="chapter-timeline" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:timeline-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionTimeline') }}</span>
          </div>
          <span class="section-badge font-mono">#03-TIMELINE</span>
        </div>

        <div class="dual-swimlane-container">
          <!-- 左右泳道表头 -->
          <div class="swimlane-column-headers">
            <div class="swimlane-header machine-header">
              <Icon icon="fluent:bot-16-regular" width="16" height="16" />
              <span>{{ $t('auditTimelineSwimlaneMachine') }}</span>
            </div>
            <div class="swimlane-header-spacer"></div>
            <div class="swimlane-header human-header">
              <Icon icon="fluent:person-16-regular" width="16" height="16" />
              <span>{{ $t('auditTimelineSwimlaneHuman') }}</span>
            </div>
          </div>

          <!-- 双泳道节点网格流水线：仅中间轴线穿过，两侧完全留白无附加时间线 -->
          <div class="swimlane-grid-track">
            <div
              v-for="(node, nIdx) in currentTimelineNodes"
              :key="nIdx"
              class="swimlane-row"
              :class="`node-lane-${node.lane}`"
            >
              <!-- 机器自动泳道单元格 (仅机器节点渲染卡片，其余保持纯留白) -->
              <div class="swimlane-cell machine-cell">
                <div v-if="node.lane === 'machine'" class="swimlane-card machine-card" :class="{ 'card-latest': node.isLatest }">
                  <div class="card-top-row">
                    <span class="node-time font-mono">{{ node.time }}</span>
                    <span class="node-actor-box font-mono">{{ node.actor }}</span>
                    <span v-if="node.badge" class="node-badge-tag font-mono">{{ node.badge }}</span>
                    <el-tag v-if="node.isLatest" size="small" type="danger" effect="dark" class="latest-tag">{{ $t('auditTimelineLatestNode') }}</el-tag>
                  </div>
                  <div class="card-title-row">
                    <span class="node-num-badge font-mono">{{ node.nodeId }}</span>
                    <span class="node-action font-semibold">{{ node.action }}</span>
                  </div>
                  <div class="card-desc">{{ node.desc }}</div>
                  <div class="card-footer-row font-mono">
                    <div v-if="node.transition" class="node-transition">
                      <span class="st-box st-from">{{ node.transition.from }}</span>
                      <Icon icon="fluent:arrow-right-12-regular" width="11" height="11" class="arrow" />
                      <span class="st-box st-to text-danger">{{ node.transition.to }}</span>
                    </div>
                    <div v-if="node.hash" class="node-hash-pill" @click="copyHash(node.hash)" :title="$t('auditCopiedHash')">
                      <span>{{ node.hash }}</span>
                      <Icon icon="fluent:copy-16-regular" width="11" height="11" class="copy-icon" />
                    </div>
                  </div>
                </div>
                <div v-else class="swimlane-placeholder machine-placeholder"></div>
              </div>

              <!-- 居中唯一时间轴中轴线与节点锚点 -->
              <div class="swimlane-axis">
                <div class="axis-dot" :class="node.lane === 'machine' ? 'dot-machine' : 'dot-human'">
                  <Icon :icon="node.lane === 'machine' ? 'fluent:bot-16-regular' : 'fluent:person-16-regular'" width="12" height="12" />
                </div>
              </div>

              <!-- 人工与用户泳道单元格 (仅人工节点渲染卡片，其余保持纯留白) -->
              <div class="swimlane-cell human-cell">
                <div v-if="node.lane === 'human'" class="swimlane-card human-card" :class="{ 'card-latest': node.isLatest }">
                  <div class="card-top-row">
                    <span class="node-time font-mono">{{ node.time }}</span>
                    <span class="node-actor-box font-mono">{{ node.actor }}</span>
                    <span v-if="node.duration" class="node-duration font-mono text-muted">{{ node.duration }}</span>
                    <el-tag v-if="node.isLatest" size="small" type="danger" effect="dark" class="latest-tag">{{ $t('auditTimelineLatestNode') }}</el-tag>
                  </div>
                  <div class="card-title-row">
                    <span class="node-num-badge font-mono">{{ node.nodeId }}</span>
                    <span class="node-action font-semibold">{{ node.action }}</span>
                  </div>
                  <div class="card-desc">{{ node.desc }}</div>
                  <div class="card-footer-row font-mono">
                    <div v-if="node.transition" class="node-transition">
                      <span class="st-box st-from">{{ node.transition.from }}</span>
                      <Icon icon="fluent:arrow-right-12-regular" width="11" height="11" class="arrow" />
                      <span class="st-box st-to text-danger">{{ node.transition.to }}</span>
                    </div>
                    <div v-if="node.hash" class="node-hash-pill" @click="copyHash(node.hash)" :title="$t('auditCopiedHash')">
                      <span>{{ node.hash }}</span>
                      <Icon icon="fluent:copy-16-regular" width="11" height="11" class="copy-icon" />
                    </div>
                  </div>
                </div>
                <div v-else class="swimlane-placeholder human-placeholder"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 E: 多维风险画像 (正方形综合风险分在左，右侧为紧凑维度条列表 + 2行式主驱动维度，图例与全量进度条表格统一单框) -->
      <section id="chapter-risk" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:chart-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionRisk') }}</span>
          </div>
          <span class="section-badge font-mono">#04-PROFILE</span>
        </div>

        <div class="risk-profile-unified-card">
          <!-- 上半区：正方形方格综合风险分 + 中间多行主驱动维度 + 右侧紧凑维度条列表(缩短进度条) -->
          <div class="risk-top-grid">
            <!-- 1. 正方形方格综合风险分 -->
            <div class="composite-score-square" :class="riskScoreLevelClass">
              <div class="score-number font-mono">{{ currentRiskProfile.compositeScore }}</div>
              <div class="score-label">{{ $t('auditRiskCompositeScore') }}</div>
            </div>

            <!-- 2. 中间：主驱动维度置于方格与维度列表之间，多行输出缩减左右间距 -->
            <div class="risk-driver-2line-box risk-driver-bar-centered">
              <div class="driver-prefix-line">{{ $t('auditRiskMainDriver') }}:</div>
              <div class="driver-highlight-line text-danger font-medium">
                {{ currentRiskProfile.mainDriver }}
              </div>
            </div>

            <!-- 3. 右侧：多维风险维度条列表 (一行放2个，2列2行与左侧完全对齐) -->
            <div class="risk-dimensions-list">
              <div
                v-for="dim in currentRiskProfile.dimensions"
                :key="dim.name"
                class="dimension-row"
              >
                <div class="dim-label-row">
                  <span class="dim-name font-medium" :title="dim.name">{{ dim.name }}</span>
                  <div class="dim-meta font-mono">
                    <span class="dim-score" :class="getScoreColorClass(dim.score)">{{ dim.score }}分</span>
                    <span class="dim-weight text-muted">(权重: {{ dim.weight }}%)</span>
                  </div>
                </div>
                <div class="dim-progress-wrap">
                  <el-progress
                    :percentage="Math.min(100, dim.score)"
                    :color="getProgressColor(dim.score)"
                    :stroke-width="5"
                    :show-text="false"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 图例 class="gauge-legend-bar" 与表格 class="risk-indicators-table" 作为统一单框，指标100%全量具备进度条 -->
          <div class="risk-indicators-unified-box">
            <div class="gauge-legend-bar">
              <span class="legend-pill"><span class="legend-color-box base-cohort"></span>{{ $t('auditRiskLegendGroup') }}</span>
              <span class="legend-pill"><span class="legend-color-box base-self"></span>{{ $t('auditRiskLegendSelf') }}</span>
              <span class="legend-pill"><span class="legend-color-box base-threshold"></span>{{ $t('auditRiskLegendThreshold') }}</span>
            </div>

            <div class="risk-indicators-table">
              <div
                v-for="(metric, mIdx) in currentRiskProfile.metrics"
                :key="mIdx"
                class="metric-card-row"
              >
                <div class="metric-info-col">
                  <div class="metric-title-line">
                    <span class="metric-name font-medium">{{ metric.name }}</span>
                    <span class="metric-rule-box font-mono text-muted">{{ metric.rule }}</span>
                  </div>
                  <div class="metric-probe-notes text-muted font-mono">
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
                      effect="plain"
                      class="threshold-tag"
                    >
                      {{ metric.isOverThreshold ? $t('auditRiskThresholdOver') : $t('auditRiskThresholdWithin') }}
                    </el-tag>
                  </div>

                  <div class="gauge-bar-wrapper">
                    <div class="gauge-track">
                      <div
                        class="gauge-fill"
                        :style="{ width: Math.min(100, metric.ratio) + '%' }"
                        :class="{ 'fill-over': metric.isOverThreshold }"
                      ></div>
                      <div class="gauge-tick tick-self" :style="{ left: metric.selfTickPos + '%' }"></div>
                      <div class="gauge-tick tick-threshold" style="left: 80%;"></div>
                    </div>
                    <div class="gauge-sub-labels font-mono">
                      <span>{{ $t('auditRiskGaugeGroupBaseline') }}: {{ metric.cohortBaseline }}</span>
                      <span>{{ $t('auditRiskGaugeSelf30d') }}: {{ metric.self30d }}</span>
                      <span class="threshold-label">{{ $t('auditRiskGaugeThreshold') }}: {{ metric.threshold }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 F: 相似案例处置参照 (进度条式显示比例 + 4 列统计 + 研判一致性提示，无中括号纯结构化徽章) -->
      <section id="chapter-similar" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:branch-compare-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionSimilar') }}</span>
          </div>
          <span class="section-badge font-mono">#05-PRECEDENT</span>
        </div>

        <div class="similar-cases-body">
          <div class="distribution-header-row">
            <div class="header-reason-box font-mono text-danger font-semibold">
              <span class="reason-prefix">同原因码</span>
              <span class="reason-code-val">{{ currentSimilarCases.reasonCode }}</span>
            </div>
            <div class="header-right-meta font-mono text-muted">
              <span>已裁决样本 {{ currentSimilarCases.totalCases }} 例</span>
              <span class="meta-separator">·</span>
              <span>统计窗口 近 90 天</span>
            </div>
          </div>

          <!-- 分段比例分布条 -->
          <div class="stacked-distribution-bar">
            <div
              v-for="stat in currentSimilarCases.stats"
              :key="stat.key"
              class="dist-segment"
              :style="{ width: stat.percentage + '%', backgroundColor: stat.color }"
              :title="`${stat.label}: ${stat.percentage}% (${stat.count}例)`"
            ></div>
          </div>

          <!-- 4 列比例与数字统计矩阵 -->
          <div class="distribution-stats-grid">
            <div
              v-for="stat in currentSimilarCases.stats"
              :key="stat.key"
              class="stat-col-box"
            >
              <div class="stat-name-row">
                <span class="color-dot" :style="{ backgroundColor: stat.color }"></span>
                <span class="stat-name">{{ stat.label }}</span>
              </div>
              <div class="stat-percent font-mono font-semibold">{{ stat.percentage }}%</div>
              <div class="stat-count font-mono text-muted">{{ stat.count }} 例</div>
            </div>
          </div>

          <!-- 一致性研判指引边框卡片 -->
          <div class="consistency-advisory-box">
            <div class="advisory-bar-indicator"></div>
            <div class="advisory-content-wrap">
              <span class="advisory-text">{{ currentSimilarCases.advisoryText }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 G: 证据链溯源 (彻底移除公式副标题，代码/规则/步骤完全徽章化封装) -->
      <section id="chapter-chain" class="dossier-card anchor-section">
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:link-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionChain') }}</span>
          </div>
          <span class="section-badge font-mono">#06-PROVENANCE</span>
        </div>

        <div class="evidence-chain-structured-list">
          <div
            v-for="(rowItem, rIdx) in currentEvidenceChain"
            :key="rIdx"
            class="chain-card-row"
          >
            <div class="chain-header-line">
              <div class="evidence-id-title">
                <span class="ev-code-box font-mono font-semibold">{{ rowItem.code }}</span>
                <span class="ev-title font-medium">{{ rowItem.evidence }}</span>
              </div>
              <div class="evidence-rule-box font-mono text-danger font-medium">
                {{ rowItem.rule }}
              </div>
            </div>

            <div class="chain-flow-line font-mono">
              <div class="flow-step-box">
                <span>{{ rowItem.step }}</span>
              </div>
              <Icon icon="fluent:arrow-right-12-regular" width="12" height="12" class="flow-arrow" />
              <div class="flow-hash-pill" @click="copyHash(rowItem.hash)" :title="$t('auditCopiedHash')">
                <span>{{ rowItem.hash }}</span>
                <Icon icon="fluent:copy-16-regular" width="11" height="11" class="copy-icon" />
              </div>
              <Icon icon="fluent:arrow-right-12-regular" width="12" height="12" class="flow-arrow" />
              <div class="flow-judgement-text">
                {{ rowItem.judgement }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模块 H: 裁决工作台 (仅在可处理变体展示，封禁台账等纯只读绝对隐藏) -->
      <section
        v-if="isAdjudicationAvailable"
        id="chapter-decision"
        class="dossier-card adjudication-workbench-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:gavel-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionDecision') }}</span>
          </div>
          <span class="section-badge font-mono">#DECISION_ENGINE</span>
        </div>

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

        <!-- 动作按钮组：严格按变体分流 -->
        <div class="adjudication-actions-grid">
          <!-- 变体 1: 滥用威胁专属动作 -->
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

          <!-- 变体 3: 风控预警专属动作 -->
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

          <!-- 通用 4 按钮裁决矩阵 (放行结案 / 条件放行 / 驳回维持 / 标记误报) -->
          <el-button
            type="success"
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('approve', $t('auditAdjudicateApprove'))"
          >
            <Icon icon="fluent:checkmark-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateApprove') }}</span>
          </el-button>

          <el-button
            type="primary"
            plain
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('probation', $t('auditAdjudicateApproveWithChallenge'))"
          >
            <Icon icon="fluent:key-reset-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateApproveWithChallenge') }}</span>
          </el-button>

          <el-button
            type="danger"
            plain
            :loading="actionLoading"
            @click="confirmAndExecuteVerdict('reject', $t('auditAdjudicateReject'))"
          >
            <Icon icon="fluent:dismiss-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
            <span>{{ $t('auditAdjudicateReject') }}</span>
          </el-button>

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

      <!-- 模块 I: 处置台账合规存证 (变体 4 纯只读专用) -->
      <section
        v-if="activeVariant === 4"
        id="chapter-ledger"
        class="dossier-card readonly-ledger-card anchor-section"
      >
        <div class="section-title">
          <div class="title-left">
            <Icon icon="fluent:book-database-20-regular" width="18" height="18" />
            <span>{{ $t('auditSectionLedger') }}</span>
          </div>
          <span class="section-badge font-mono">#07-LEDGER</span>
        </div>

        <div class="sanction-ledger-banner">
          <Icon icon="fluent:shield-checkmark-20-filled" width="20" height="20" class="banner-icon" />
          <div class="banner-text-box">
            <span class="banner-title font-medium">{{ $t('auditSanctionPureNotice') }}</span>
            <span class="banner-sub text-muted font-mono">IMMUTABLE_AUDIT_LOG · sha256:d89f10a8...310c</span>
          </div>
        </div>

        <div v-if="selectedRow.status === 'unbanned'" class="unbanned-archive-badge">
          <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
          <span>{{ $t('auditStatusUnbannedRecord') }}</span>
        </div>
      </section>

    </div>

    <!-- 底部操作栏 -->
    <template #footer>
      <div class="drawer-footer-actions">
        <!-- 通用关闭按钮 -->
        <el-button @click="handleClose">{{ $t('close') }}</el-button>

        <!-- 可处理变体专用动作 -->
        <template v-if="isAdjudicationAvailable && selectedRow">
          <!-- 延期 -->
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

          <!-- 解封 / 重新封禁 (以更纯净的 plain 模式避免喧宾夺主) -->
          <el-button
            v-if="selectedRow.status === 'banned'"
            type="success"
            plain
            :loading="actionLoading"
            @click="emit('toggleBan', selectedRow)"
          >
            <Icon icon="fluent:lock-open-16-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnUnban') }}</span>
          </el-button>
          <el-button
            v-else
            type="danger"
            plain
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
import { ref, computed, watch, nextTick } from 'vue';
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
  return window.innerWidth <= 768 ? '100vw' : '680px';
});

// 当前激活的变体 (1: 滥用威胁, 2: 审计申诉, 3: 风控预警, 4: 封禁记录/处置台账)
const activeVariant = ref(1);
const activeChapter = ref('summary');
const scrollContainerRef = ref(null);
const internalDecisionNotes = ref('');

// 根据板块或工单智能计算变体
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

function handleClose() {
  visible.value = false;
  clearDeepLink();
}

// 变体标题
const currentVariantTitle = computed(() => {
  switch (activeVariant.value) {
    case 1: return t('auditVariant1Title');
    case 2: return t('auditVariant2Title');
    case 3: return t('auditVariant3Title');
    case 4: return t('auditVariant4Title');
    default: return t('auditVariant1Title');
  }
});

const isThreatVariant = computed(() => activeVariant.value === 1);

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

// 分区子案编号计算 (例如 THR-2026-MULTI99 -> THR-MULTI99-SUB01)
function getSubCaseId(caseNo, idx) {
  const num = String(idx + 1).padStart(2, '0');
  if (!caseNo) return `SUB-${num}`;
  const cleaned = String(caseNo).replace(/^#/, '').replace(/-\d{4}-/, '-');
  return `${cleaned}-SUB${num}`;
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

// 状态与分类元信息：确保 active/pending 等状态同步显示为标准“待审”等
function getStatusTagType(status) {
  if (status === 'active' || status === 'pending' || props.selectedRow?.circuitStatus === 'QUEUE_PAUSE' || props.selectedRow?.circuitStatus === 'TRIPPED') {
    return 'warning';
  }
  switch (status) {
    case 'banned': return 'danger';
    case 'unbanned': return 'success';
    case 'watching': return 'info';
    case 'resolved': return 'success';
    case 'expired': return 'info';
    case 'rejected': return 'danger';
    default: return 'primary';
  }
}

function getStatusLabel(status) {
  if (status === 'active' || status === 'pending' || props.selectedRow?.circuitStatus === 'QUEUE_PAUSE' || props.selectedRow?.circuitStatus === 'TRIPPED') {
    return t('abuseStatusPending') || '待审';
  }
  switch (status) {
    case 'banned': return t('auditStatusBannedActive');
    case 'unbanned': return t('auditStatusUnbannedRecord');
    case 'watching': return t('auditStatusWatching');
    case 'resolved': return t('auditCaseStatusResolved');
    case 'expired': return t('auditCaseStatusExpired');
    case 'rejected': return t('auditStatusRejectedAppeal');
    default: return status || '-';
  }
}

// 拍案管理直接展示名称，与列表完全对照
const authorityValue = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  return r.adjudicatorName || r.adjudicator || r.authority || r.operator || r.assignee || 'SecAdmin';
});

// 证据留存天数 (无需 WORM 无关说明)
const evidenceDaysFormatted = computed(() => {
  const r = props.selectedRow;
  const days = r?.evidenceExpiresDays !== undefined ? r.evidenceExpiresDays : 180;
  return `${days} 天`;
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

// 章节动态计算
const availableChapters = computed(() => {
  const list = [];
  list.push({ id: 'summary', label: t('auditChipSummary'), icon: 'fluent:document-text-16-regular' });
  
  if (isThreatVariant.value && clusterAccountsList.value && clusterAccountsList.value.length > 0) {
    list.push({ id: 'cluster', label: t('auditChipCluster'), icon: 'fluent:people-community-16-regular' });
  }

  list.push({ id: 'basis', label: t('auditChipBasis'), icon: 'fluent:shield-task-16-regular' });
  list.push({ id: 'timeline', label: t('auditChipTimeline'), icon: 'fluent:timeline-20-regular' });
  list.push({ id: 'risk', label: t('auditChipRisk'), icon: 'fluent:chart-multiple-16-regular' });
  list.push({ id: 'similar', label: t('auditChipSimilar'), icon: 'fluent:branch-compare-16-regular' });
  list.push({ id: 'chain', label: t('auditChipChain'), icon: 'fluent:link-multiple-16-regular' });

  if (isAdjudicationAvailable.value) {
    list.push({ id: 'decision', label: t('auditChipDecision'), icon: 'fluent:gavel-16-regular' });
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
  if (Array.isArray(accounts) && accounts.length > 0) return accounts;
  // 滥用威胁板块提供默认关联集群演示样本
  if (activeVariant.value === 1) {
    const mainMail = props.selectedRow?.email || 'alpha@epocanvas.com';
    const domain = mainMail.includes('@') ? mainMail.split('@')[1] : 'epocanvas.com';
    return [
      { id: 101, email: `sub01_${mainMail.split('@')[0]}@${domain}`, userId: 'usr_88201', status: 'banned', evidenceSummary: '同一设备指纹 · 30分钟内注册' },
      { id: 102, email: `sub02_${mainMail.split('@')[0]}@${domain}`, userId: 'usr_88202', status: 'banned', evidenceSummary: '同一设备指纹 · 批量协同外发' },
      { id: 103, email: `sub03_${mainMail.split('@')[0]}@${domain}`, userId: 'usr_88203', status: 'banned', evidenceSummary: '同一出口 IP · 触发退信熔断' }
    ];
  }
  return [];
});

// 模块 C: 风险研判与处置依据数据分流 (四板块完全差异化)
const currentAlarmReason = computed(() => {
  const r = props.selectedRow;
  if (activeVariant.value === 1) {
    return r?.banReason || '同一设备指纹 30 分钟内注册并激活 4 个账号，主账号协同 3 个子账号批量外发，判定一人多号集群滥用。';
  }
  if (activeVariant.value === 2) {
    return r?.appealReason
      ? `用户提交解封复核申请抗辩：“${r.appealReason}”，核验所处环境与历史行为。`
      : '用户提交解封复核申请，抗辩声称所处环境为高校/企业内网 NAT 共享出口，无主观多账号滥用恶意。';
  }
  if (activeVariant.value === 3) {
    return '实时监测到近 15 分钟外发速率突刺突破动态基线 300%，且硬退信率上升至 14.8%，触碰预警警戒线。';
  }
  return '案件全流程终结并固化归档。经双人合规会签与系统策略终审，恶意一人多号违规外发判定成立，永久阻断并写入防篡改台账。';
});

const currentTriggerTag = computed(() => {
  switch (activeVariant.value) {
    case 1: return '一人多号';
    case 2: return '争议申诉';
    case 3: return '速率突刺';
    case 4: return '终裁执行';
    default: return '规则触发';
  }
});

const currentTriggerBadgeType = computed(() => {
  switch (activeVariant.value) {
    case 1: return 'danger';
    case 2: return 'warning';
    case 3: return 'danger';
    case 4: return 'info';
    default: return 'primary';
  }
});

const currentTriggerCause = computed(() => {
  switch (activeVariant.value) {
    case 1: return '同设备指纹关联 4 账号，其中 3 个触发外发滥用';
    case 2: return '用户附言提交工位证明、网络拓扑说明及 TOTP 硬件密匙凭据';
    case 3: return '滑动窗口 120 秒内捕获并发发信连接 56 次，主要集中于未验证收件人域';
    case 4: return '安全委员会终审裁决执行完毕，不可逆注销外发凭据并冻结发信配额';
    default: return '系统安全引擎检测到违规风险指标超标';
  }
});

const currentSuggestionTag = computed(() => {
  switch (activeVariant.value) {
    case 1: return '维持封禁';
    case 2: return '条件放行';
    case 3: return '限流降级';
    case 4: return '固化封存';
    default: return '维持处置';
  }
});

const currentSuggestionBadgeType = computed(() => {
  switch (activeVariant.value) {
    case 1: return 'danger';
    case 2: return 'primary';
    case 3: return 'warning';
    case 4: return 'success';
    default: return 'danger';
  }
});

const currentSuggestionText = computed(() => {
  switch (activeVariant.value) {
    case 1: return '策略引擎终裁 · 10-12 11:02';
    case 2: return '申诉复核中心建议 · 强制启用 TOTP 二次认证并保持 7 天动态观察';
    case 3: return '动态策略建议 · 暂扣非核心外发通道 2 小时并持续遥测';
    case 4: return '证据保管期 180 天，到期前不可物理抹除或修改结论';
    default: return '安全主管核准执行';
  }
});

// 模块 C: 研判路径记录列表 (四板块完全差异化)
const currentJudgmentLogs = computed(() => {
  if (activeVariant.value === 1) {
    return [
      { tag: '更新', tagType: 'info', content: '10-12 11:02 策略引擎：主账号与 3 个子账号一并纳入封禁管控，外发通道关闭。' },
      { tag: '审核备忘', tagType: 'warning', content: '10-12 10:45 SecAdmin：比对指纹聚集快照与注册时序，确认一人多号集群成立。' },
      { tag: '更新', tagType: 'info', content: '10-12 03:20 处置管线：熔断期间仅暂扣外发，未直接封禁，等待人工终裁。' },
      { tag: '风控溯源', tagType: 'danger', content: '10-12 03:14 基线探针：命中 RULE-REG-55 与 RULE-SPAM-77，聚集度置信度 98.4%。' }
    ];
  }
  if (activeVariant.value === 2) {
    return [
      { tag: '审核备忘', tagType: 'warning', content: '10-13 15:40 SecAdmin：核实高校 NAT 出口拓扑，外发峰值期间存在瞬时会话劫持特征，建议重置密码并启用双因素认证。' },
      { tag: '更新', tagType: 'info', content: '10-13 14:20 申诉管线：用户补充提交机构 IT 证明文件，证据包哈希值已归档固化。' },
      { tag: '更新', tagType: 'info', content: '10-13 09:15 工单引擎：受理用户解封申请，系统自动挂起死局倒计时，分配专员复核。' },
      { tag: '放行说明', tagType: 'success', content: '10-13 09:00 合规策略：若初判属于共享 IP 误伤，且历史 90 天无违规，推荐条件放行。' }
    ];
  }
  if (activeVariant.value === 3) {
    return [
      { tag: '更新', tagType: 'info', content: '10-14 16:30 策略引擎：自动下调外发配额至 15 封/小时，暂扣队列平稳，未见扩散。' },
      { tag: '审核备忘', tagType: 'warning', content: '10-14 16:15 SecAdmin：抽检外发邮件正文，未见已知钓鱼模版，判定为推广测试发信。' },
      { tag: '更新', tagType: 'info', content: '10-14 16:02 探针管线：触发 L2 级速率异常告警，通知驻场值班员进入处置队列。' },
      { tag: '延期处置', tagType: 'primary', content: '10-14 16:00 熔断机制：暂扣非核心外发通道 2 小时，持续采集 SPF/DKIM 验签回执。' }
    ];
  }
  return [
    { tag: '更新', tagType: 'info', content: '10-15 18:00 台账引擎：写入只读存证区块 sha256:d89f...310c，公开可验证。' },
    { tag: '解禁说明', tagType: 'danger', content: '不可解禁：终审确认恶意侵权群发，已通知上游风控情报中心共享黑名单。' },
    { tag: '审核备忘', tagType: 'warning', content: '10-15 17:30 SecAdmin：完成全流程审计会签，移入永久不可操作归档库。' },
    { tag: '存证留痕', tagType: 'success', content: '10-15 17:00 合规官：核准生成 RFC-3161 数字时间戳证明，归档不可逆。' }
  ];
});

// 模块 D: 处置与存证全周期时间线节点 (左右双泳道分流)
const currentTimelineNodes = computed(() => {
  if (activeVariant.value === 1) {
    return [
      {
        lane: 'machine',
        time: '10-12 03:14',
        actor: '规则引擎',
        badge: '起点',
        nodeId: 'N1',
        action: '规则命中',
        desc: 'RULE-REG-55 同指纹关联 4 账号，进入暂扣队列',
        transition: { from: '正常', to: '观察中' },
        hash: 'sha256:4c81…d0f2',
        isLatest: false
      },
      {
        lane: 'machine',
        time: '10-12 03:20',
        actor: '处置管线',
        badge: '+6 分',
        nodeId: 'N2',
        action: '熔断暂扣',
        desc: '熔断期间仅暂扣外发，不直接封禁账号',
        transition: { from: '观察中', to: '熔断暂扣' },
        hash: null,
        isLatest: false
      },
      {
        lane: 'human',
        time: '10-12 10:45',
        actor: 'SecAdmin',
        duration: '+7 时 25 分',
        nodeId: 'N3',
        action: '人工复核',
        desc: '确认一人多号集群，3 个子账号抽样比对通过',
        transition: { from: '熔断暂扣', to: '已封禁' },
        hash: 'sha256:aa19…77c3',
        isLatest: false
      },
      {
        lane: 'machine',
        time: '10-12 11:02',
        actor: '处置管线',
        badge: '+17 分',
        nodeId: 'N4',
        action: '处置生效',
        desc: '主账号与 3 个子账号一并纳入封禁管控',
        transition: { from: '已封禁', to: '策略广播生效' },
        hash: null,
        isLatest: true
      }
    ];
  }
  if (activeVariant.value === 2) {
    return [
      {
        lane: 'machine',
        time: '10-13 08:30',
        actor: '规则引擎',
        badge: '起点',
        nodeId: 'N1',
        action: '异常阻断',
        desc: 'RULE-OUTBOUND-LIMIT 检测到非受信任异地 IP 批量外发',
        transition: { from: '正常', to: '临时阻断' },
        hash: 'sha256:6e12…330f',
        isLatest: false
      },
      {
        lane: 'human',
        time: '10-13 09:15',
        actor: '用户 (申诉人)',
        duration: '+45 分',
        nodeId: 'N2',
        action: '提交申诉',
        desc: '提交企业网络拓扑说明与学生工作证件，申请人工复核',
        transition: { from: '临时阻断', to: '申诉复核中' },
        hash: null,
        isLatest: false
      },
      {
        lane: 'human',
        time: '10-13 14:20',
        actor: 'SecAdmin',
        duration: '+5 时 05 分',
        nodeId: 'N3',
        action: '人工复核',
        desc: '调阅 NAT 拓扑与会话时序，确认非群控机器集群特征',
        transition: { from: '申诉复核中', to: '建议放行' },
        hash: 'sha256:b820…ef19',
        isLatest: false
      },
      {
        lane: 'machine',
        time: '10-13 15:45',
        actor: '策略引擎',
        badge: '+1 时 25 分',
        nodeId: 'N4',
        action: '条件放行生效',
        desc: '下发条件放行策略，用户端下一次登录强制触发 TOTP 凭证挑战',
        transition: { from: '建议放行', to: 'MFA挑战中' },
        hash: null,
        isLatest: true
      }
    ];
  }
  if (activeVariant.value === 3) {
    return [
      {
        lane: 'machine',
        time: '10-14 16:00',
        actor: '探针引擎',
        badge: '起点',
        nodeId: 'N1',
        action: '突刺捕获',
        desc: 'MON-OUTBOUND-SURGE 监测到并发外发速率冲顶',
        transition: { from: '正常', to: '触发告警' },
        hash: 'sha256:91ef…02a4',
        isLatest: false
      },
      {
        lane: 'machine',
        time: '10-14 16:02',
        actor: '处置管线',
        badge: '+2 分',
        nodeId: 'N2',
        action: '动态降级',
        desc: '激活限流熔断，将单小时外发限制压缩为 15 封',
        transition: { from: '触发告警', to: '限流观察中' },
        hash: null,
        isLatest: false
      },
      {
        lane: 'human',
        time: '10-14 16:15',
        actor: '值班安全员',
        duration: '+13 分',
        nodeId: 'N3',
        action: '抽样初判',
        desc: '抽检 20 封外发邮件正文，未见已知钓鱼模版与恶意载荷',
        transition: { from: '限流观察中', to: '维持观察' },
        hash: 'sha256:32cc…99d1',
        isLatest: false
      },
      {
        lane: 'machine',
        time: '10-14 16:30',
        actor: '策略引擎',
        badge: '+15 分',
        nodeId: 'N4',
        action: '配额下发',
        desc: '配额临时降级生效，设置 2 小时后自动复核恢复',
        transition: { from: '维持观察', to: '动态遥测中' },
        hash: null,
        isLatest: true
      }
    ];
  }
  return [
    {
      lane: 'machine',
      time: '10-15 02:00',
      actor: '探针引擎',
      badge: '起点',
      nodeId: 'N1',
      action: '基线初判',
      desc: 'RULE-REG-55 检测到一人多号集群关联',
      transition: { from: '正常', to: '观察中' },
      hash: 'sha256:1a2b…3c4d',
      isLatest: false
    },
    {
      lane: 'machine',
      time: '10-15 02:05',
      actor: '处置管线',
      badge: '+5 分',
      nodeId: 'N2',
      action: '自动阻断',
      desc: '触碰封禁红线，实施外发通道阻断与凭据冻结',
      transition: { from: '观察中', to: '已封禁' },
      hash: 'sha256:5e6f…7a8b',
      isLatest: false
    },
    {
      lane: 'human',
      time: '10-15 09:00',
      actor: '安全委员会',
      duration: '+6 时 55 分',
      nodeId: 'N3',
      action: '终审会签',
      desc: '完成证据链溯源复核，核准永久封禁处置令',
      transition: { from: '已封禁', to: '终裁确立' },
      hash: 'sha256:9c0d…1e2f',
      isLatest: false
    },
    {
      lane: 'machine',
      time: '10-15 09:10',
      actor: '台账引擎',
      badge: '+10 分',
      nodeId: 'N4',
      action: '存证固化',
      desc: '写入只读合规存证台账，生成数字哈希与时间戳区块',
      transition: { from: '终裁确立', to: '台账归档' },
      hash: 'sha256:d89f…310c',
      isLatest: true
    }
  ];
});

// 模块 E: 多维风险画像数据 (四板块指标完全独立)
const currentRiskProfile = computed(() => {
  if (activeVariant.value === 1) {
    return {
      compositeScore: 88,
      mainDriver: '一人多号群控集群关联度高 (94分) 与异地指纹跳跃',
      dimensions: [
        { name: '设备指纹连续性', score: 94, weight: 30 },
        { name: '注册时序聚集度', score: 92, weight: 25 },
        { name: '行为速率与遥测', score: 88, weight: 25 },
        { name: '网络拓扑信誉', score: 80, weight: 20 }
      ],
      metrics: [
        {
          name: '设备指纹关联账号',
          rule: 'RULE-REG-55',
          probeNotes: '探针周期 24h · 关联度 98%',
          currentValue: '4 个',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 95,
          selfTickPos: 40,
          cohortBaseline: '1 个',
          self30d: '1 个',
          threshold: '≤ 1 个'
        },
        {
          name: '会话连续性切换次数',
          rule: 'RULE-SESS-09',
          probeNotes: '滑动窗口 60m · 切换频次',
          currentValue: '18 次/时',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 90,
          selfTickPos: 30,
          cohortBaseline: '2 次/时',
          self30d: '3 次/时',
          threshold: '≤ 5 次/时'
        },
        {
          name: '注册时序聚集度',
          rule: 'RULE-BURST-REG',
          probeNotes: '指纹注册时序方差检验',
          currentValue: '4 账号/30分',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 92,
          selfTickPos: 20,
          cohortBaseline: '≤ 1 账号/天',
          self30d: '1 账号',
          threshold: '≤ 1 账号/小时'
        },
        {
          name: '站内投诉次数',
          rule: 'RULE-COMPLAINT-03',
          probeNotes: '受信用户反垃圾举报',
          currentValue: '3 次',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 85,
          selfTickPos: 10,
          cohortBaseline: '0 次',
          self30d: '0 次',
          threshold: '≤ 1 次'
        },
        {
          name: '小时峰值外发',
          rule: 'RULE-SPAM-77',
          probeNotes: '收发监控遥测 · 峰值速率',
          currentValue: '412 封/时',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 88,
          selfTickPos: 25,
          cohortBaseline: '20 封/时',
          self30d: '45 封/时',
          threshold: '≤ 100 封/时'
        },
        {
          name: '硬退信率 (Bounce Rate)',
          rule: 'RULE-BOUNCE-12',
          probeNotes: '收件方 MX 550 拒收占比',
          currentValue: '16.5%',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 86,
          selfTickPos: 20,
          cohortBaseline: '1.2%',
          self30d: '1.8%',
          threshold: '≤ 5.0%'
        },
        {
          name: '跨地域 IP 跳跃频率',
          rule: 'RULE-GEO-JUMP',
          probeNotes: 'GeoIP 自治域 BGP 路由跳变',
          currentValue: '6 个自治域/天',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 82,
          selfTickPos: 30,
          cohortBaseline: '1 自治域',
          self30d: '1 自治域',
          threshold: '≤ 2 自治域'
        },
        {
          name: 'WebGL 指纹熵值与伪造',
          rule: 'RULE-CANVAS-FP',
          probeNotes: 'Canvas / WebGL 抗渲染注入',
          currentValue: '98.5% (伪造注入)',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 98,
          selfTickPos: 30,
          cohortBaseline: '≤ 15%',
          self30d: '12%',
          threshold: '≤ 30%'
        },
        {
          name: '动态验证码绕过探测',
          rule: 'RULE-CAPTCHA-BYPASS',
          probeNotes: 'Turnstile 人机挑战时序',
          currentValue: '120ms (异常极速)',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 95,
          selfTickPos: 25,
          cohortBaseline: '≥ 1500ms',
          self30d: '1800ms',
          threshold: '≥ 800ms'
        }
      ]
    };
  }
  if (activeVariant.value === 2) {
    return {
      compositeScore: 46,
      mainDriver: '异地网络漫游跳跃 (62分) 与共享出口 IP',
      dimensions: [
        { name: '申诉文本可信度', score: 86, weight: 30 },
        { name: '历史账号健康度', score: 90, weight: 25 },
        { name: '凭证持有证明', score: 82, weight: 25 },
        { name: '历史违规阻断记录', score: 95, weight: 20 }
      ],
      metrics: [
        {
          name: '历史申诉结案通过率',
          rule: 'APP-HISTORY-RATE',
          probeNotes: '历史申诉合规记录',
          currentValue: '92.5%',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 20,
          selfTickPos: 80,
          cohortBaseline: '≥ 70%',
          self30d: '92.5%',
          threshold: '≥ 60%'
        },
        {
          name: '申诉提交端与常用设备重合度',
          rule: 'APP-DEVICE-MATCH',
          probeNotes: '设备指纹比对',
          currentValue: '86.4%',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 25,
          selfTickPos: 75,
          cohortBaseline: '≥ 80%',
          self30d: '88%',
          threshold: '≥ 70%'
        },
        {
          name: '多因子凭证 (TOTP) 绑定状态',
          rule: 'APP-2FA-TENURE',
          probeNotes: '硬件密匙与二次认证',
          currentValue: '100% (已激活绑定)',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 100,
          selfTickPos: 100,
          cohortBaseline: '≥ 80%',
          self30d: '100%',
          threshold: '≥ 60%'
        },
        {
          name: '申诉文本模版相似度',
          rule: 'APP-NLP-SIMILARITY',
          probeNotes: 'NLP 文本模版比对',
          currentValue: '12.8%',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 15,
          selfTickPos: 20,
          cohortBaseline: '≤ 30%',
          self30d: '10%',
          threshold: '≤ 45%'
        },
        {
          name: '历史违规阻断记录',
          rule: 'APP-VIOLATION-HIST',
          probeNotes: '全生命周期违规库',
          currentValue: '0 次',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 0,
          selfTickPos: 10,
          cohortBaseline: '0 次',
          self30d: '0 次',
          threshold: '≤ 1 次'
        },
        {
          name: '邮箱活跃正常使用天数',
          rule: 'APP-ACCOUNT-AGE',
          probeNotes: '账号注册年限与活跃',
          currentValue: '428 天',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 10,
          selfTickPos: 85,
          cohortBaseline: '≥ 90 天',
          self30d: '428 天',
          threshold: '≥ 30 天'
        },
        {
          name: '历史硬退信率基线',
          rule: 'APP-BASE-BOUNCE',
          probeNotes: '常态外发退信监测',
          currentValue: '0.8%',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 12,
          selfTickPos: 20,
          cohortBaseline: '≤ 2.0%',
          self30d: '0.8%',
          threshold: '≤ 5.0%'
        },
        {
          name: '异地登录失败频次',
          rule: 'APP-FAILED-AUTH',
          probeNotes: '近 30 天登录鉴权失败',
          currentValue: '1 次/月',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 10,
          selfTickPos: 15,
          cohortBaseline: '≤ 3 次',
          self30d: '1 次',
          threshold: '≤ 5 次'
        }
      ]
    };
  }
  if (activeVariant.value === 3) {
    return {
      compositeScore: 64,
      mainDriver: '短时突发发信速率 (76分) 与收件人域离散度',
      dimensions: [
        { name: '外发速率遥测', score: 76, weight: 30 },
        { name: '接口调用频率', score: 62, weight: 25 },
        { name: '邮件内容合规', score: 58, weight: 25 },
        { name: '凭证安全状态', score: 40, weight: 20 }
      ],
      metrics: [
        {
          name: '突发外发速率激增比',
          rule: 'MON-OUTBOUND-SURGE',
          probeNotes: '滑动窗口 120s 速率倍率',
          currentValue: '3.2 倍',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 78,
          selfTickPos: 35,
          cohortBaseline: '1.0 倍',
          self30d: '1.1 倍',
          threshold: '≤ 2.0 倍'
        },
        {
          name: '认证失败突刺速率',
          rule: 'MON-AUTH-SPIKE',
          probeNotes: '连续密码/Token 验证失败',
          currentValue: '3 次/分',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 30,
          selfTickPos: 25,
          cohortBaseline: '≤ 2 次/分',
          self30d: '1 次/分',
          threshold: '≤ 5 次/分'
        },
        {
          name: 'SMTP SPF/DKIM 对齐率',
          rule: 'MON-SPF-DKIM-ALIGN',
          probeNotes: 'DNS 反垃圾协议验签',
          currentValue: '99.2%',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 10,
          selfTickPos: 90,
          cohortBaseline: '≥ 95%',
          self30d: '99.5%',
          threshold: '≥ 90%'
        },
        {
          name: '敏感拦截关键词匹配频次',
          rule: 'MON-CONTENT-HIT',
          probeNotes: '启发式敏感词过滤',
          currentValue: '1 次',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 20,
          selfTickPos: 15,
          cohortBaseline: '0 次',
          self30d: '0 次',
          threshold: '≤ 3 次'
        },
        {
          name: 'IP 段信誉评分衰减',
          rule: 'MON-IP-REPUTATION',
          probeNotes: 'Spamhaus / RBL 信誉库',
          currentValue: '74 分',
          isOverThreshold: false,
          isNumeric: true,
          ratio: 35,
          selfTickPos: 70,
          cohortBaseline: '≥ 80 分',
          self30d: '85 分',
          threshold: '≥ 60 分'
        },
        {
          name: '接收方 MX 灰名单拦截频次',
          rule: 'MON-GREYLIST-RATE',
          probeNotes: 'Greylisting 临时延迟',
          currentValue: '8 次/时',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 72,
          selfTickPos: 20,
          cohortBaseline: '≤ 2 次/时',
          self30d: '1 次/时',
          threshold: '≤ 5 次/时'
        },
        {
          name: 'API 接口调用频率突增',
          rule: 'MON-API-RATE',
          probeNotes: 'REST 邮件发送接口突增',
          currentValue: '24 次/分',
          isOverThreshold: true,
          isNumeric: true,
          ratio: 80,
          selfTickPos: 30,
          cohortBaseline: '≤ 5 次/分',
          self30d: '6 次/分',
          threshold: '≤ 15 次/分'
        }
      ]
    };
  }
  return {
    compositeScore: 92,
    mainDriver: '终审封禁固化快照 (严重违规指数 92)',
    dimensions: [
      { name: '违规严重指数', score: 92, weight: 35 },
      { name: '证据链完整度', score: 98, weight: 25 },
      { name: '存证合规性', score: 100, weight: 20 },
      { name: '关联影响面', score: 85, weight: 20 }
    ],
    metrics: [
      {
        name: '封禁生效时违规严重指数',
        rule: 'REC-SEVERITY-IDX',
        probeNotes: '判例裁决终审严重度',
        currentValue: '92 分',
        isOverThreshold: true,
        isNumeric: true,
        ratio: 92,
        selfTickPos: 40,
        cohortBaseline: '≤ 30 分',
        self30d: '20 分',
        threshold: '≤ 50 分'
      },
      {
        name: '证据快照指纹匹配度',
        rule: 'REC-SNAPSHOT-MATCH',
        probeNotes: '归档证据哈希碰撞率',
        currentValue: '99.4%',
        isOverThreshold: false,
        isNumeric: true,
        ratio: 98,
        selfTickPos: 95,
        cohortBaseline: '≥ 95%',
        self30d: '99.4%',
        threshold: '≥ 90%'
      },
      {
        name: '关联受影响邮箱数量',
        rule: 'REC-CLUSTER-IMPACT',
        probeNotes: '主案关联协同账号',
        currentValue: '4 个',
        isOverThreshold: true,
        isNumeric: true,
        ratio: 80,
        selfTickPos: 30,
        cohortBaseline: '1 个',
        self30d: '1 个',
        threshold: '≤ 1 个'
      },
      {
        name: '策略引擎执行耗时',
        rule: 'REC-EXEC-LATENCY',
        probeNotes: '处置管线端到端时延',
        currentValue: '180ms',
        isOverThreshold: false,
        isNumeric: true,
        ratio: 15,
        selfTickPos: 20,
        cohortBaseline: '≤ 500ms',
        self30d: '210ms',
        threshold: '≤ 1000ms'
      },
      {
        name: '归档区块哈希验证状态',
        rule: 'REC-BLOCK-VALIDATION',
        probeNotes: '防篡改公开台账签名',
        currentValue: '100% (签名验证有效)',
        isOverThreshold: false,
        isNumeric: true,
        ratio: 100,
        selfTickPos: 100,
        cohortBaseline: '100%',
        self30d: '100%',
        threshold: '100%'
      },
      {
        name: '存证保管留存期',
        rule: 'REC-RETENTION-DAYS',
        probeNotes: '合规留痕保管周期',
        currentValue: '180 天',
        isOverThreshold: false,
        isNumeric: true,
        ratio: 100,
        selfTickPos: 100,
        cohortBaseline: '180 天',
        self30d: '180 天',
        threshold: '≥ 180 天'
      }
    ]
  };
});

const riskScoreLevelClass = computed(() => {
  const s = currentRiskProfile.value?.compositeScore || 0;
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

// 模块 F: 相似案例处置参照 (四板块完全差异化)
const currentSimilarCases = computed(() => {
  if (activeVariant.value === 1) {
    return {
      reasonCode: 'RULE-SPAM-77',
      totalCases: 119,
      stats: [
        { key: 'maintain', label: '维持封禁', count: 74, percentage: 62, color: '#ef4444' },
        { key: 'watch', label: '暂禁观察', count: 25, percentage: 21, color: '#f59e0b' },
        { key: 'approve', label: '放行结案', count: 13, percentage: 11, color: '#10b981' },
        { key: 'whitelist', label: '标记误报', count: 7, percentage: 6, color: '#3b82f6' }
      ],
      advisoryText: '本案处理建议「维持封禁」与同原因码已裁决案例的主流裁决（62%）一致，裁决一致性高；若改判放行将偏离判例带，需补充书面依据。'
    };
  }
  if (activeVariant.value === 2) {
    return {
      reasonCode: 'APP-NAT-SHARE',
      totalCases: 86,
      stats: [
        { key: 'approve', label: '批准解封', count: 41, percentage: 48, color: '#10b981' },
        { key: 'probation', label: '条件放行', count: 28, percentage: 32, color: '#3b82f6' },
        { key: 'maintain', label: '维持原判', count: 13, percentage: 15, color: '#ef4444' },
        { key: 'reject', label: '驳回补正', count: 4, percentage: 5, color: '#f59e0b' }
      ],
      advisoryText: '本案处理建议「条件放行」与同类企业网络共享 IP 申诉案例的主流裁决（80% 放行/条件放行）趋同；建议核验 TOTP 后准予放行。'
    };
  }
  if (activeVariant.value === 3) {
    return {
      reasonCode: 'RULE-BURST-REG',
      totalCases: 142,
      stats: [
        { key: 'throttle', label: '限流降级', count: 78, percentage: 55, color: '#f59e0b' },
        { key: 'watch', label: '加入观察', count: 40, percentage: 28, color: '#3b82f6' },
        { key: 'release', label: '自动解除', count: 17, percentage: 12, color: '#10b981' },
        { key: 'upgrade', label: '升级封禁', count: 7, percentage: 5, color: '#ef4444' }
      ],
      advisoryText: '同类发信突增预警案例中，55% 在暂扣降级后恢复正常，仅 5% 恶化为需要永久阻断。'
    };
  }
  return {
    reasonCode: 'RULE-REG-55',
    totalCases: 230,
    stats: [
      { key: 'maintain', label: '维持封禁', count: 196, percentage: 85, color: '#ef4444' },
      { key: 'probation', label: '附条件特赦', count: 23, percentage: 10, color: '#f59e0b' },
      { key: 'revoke', label: '纠错撤回', count: 11, percentage: 5, color: '#10b981' }
    ],
    advisoryText: '本案归档结论与历史判例完全对齐，台账不可篡改存证已固化入库。'
  };
});

// 模块 G: 证据链溯源 (四板块完全差异化)
const currentEvidenceChain = computed(() => {
  if (activeVariant.value === 1) {
    return [
      {
        code: 'EV-01',
        evidence: '外发样本归档（412 封/小时峰值）',
        rule: 'RULE-SPAM-77',
        step: 'N1 规则命中',
        hash: 'sha256:9f2c…b41d',
        judgement: '频率与退信率双超阈值，构成批量群发'
      },
      {
        code: 'EV-02',
        evidence: '设备指纹聚集快照',
        rule: 'RULE-REG-55',
        step: 'N4 证据留存',
        hash: 'sha256:77aa…0e6c',
        judgement: '同指纹关联 12 账号，排除个人设备误判'
      },
      {
        code: 'EV-03',
        evidence: '申诉文本相似度比对',
        rule: 'RULE-SPAM-31',
        step: 'N5 人工复核',
        hash: 'sha256:c3d1…88f0',
        judgement: '与已知模板库高度相似，申诉可信度弱'
      },
      {
        code: 'EV-04',
        evidence: '登录失败凭证填充特征',
        rule: 'RULE-BRUTE-12',
        step: 'N2 自动封禁',
        hash: 'sha256:51be…2a97',
        judgement: '携带填充指纹，共享出口抗辩不成立'
      }
    ];
  }
  if (activeVariant.value === 2) {
    return [
      {
        code: 'EV-APP-01',
        evidence: '申诉提交会话环境快照',
        rule: 'RULE-SESS-AUTH',
        step: 'N2 申诉受理',
        hash: 'sha256:3d8e…7a1c',
        judgement: '提交端 IP 与历史常用 IP 属于同一 C 段，初步排除异地盗号'
      },
      {
        code: 'EV-APP-02',
        evidence: '异常外发期间登录指纹对比',
        rule: 'RULE-FP-COMP',
        step: 'N3 人工复核',
        hash: 'sha256:8b1f…44e2',
        judgement: '外发峰值发生于非受信 Linux 终端，与用户常用 Windows/Edge 指纹不符'
      },
      {
        code: 'EV-APP-03',
        evidence: '二次认证激活与凭据挑战记录',
        rule: 'RULE-MFA-VERIFY',
        step: 'N4 条件放行',
        hash: 'sha256:a692…99bc',
        judgement: '用户成功完成 TOTP 硬件绑定与口令重置，安全隐患排除'
      }
    ];
  }
  if (activeVariant.value === 3) {
    return [
      {
        code: 'EV-MON-01',
        evidence: '滑动窗口连接频率遥测',
        rule: 'RULE-BURST-CONN',
        step: 'N1 预警捕获',
        hash: 'sha256:1f2a…4e5d',
        judgement: '10 秒内发起 35 次 SMTP 握手，超常态基线 4.2 倍'
      },
      {
        code: 'EV-MON-02',
        evidence: '收件人域名离散度分析',
        rule: 'RULE-MX-DISPERSE',
        step: 'N2 降级暂扣',
        hash: 'sha256:6c7b…8891',
        judgement: '85% 发往无 MX 记录域名，构成无效地址探测'
      },
      {
        code: 'EV-MON-03',
        evidence: 'SPF/DKIM 验签回执快照',
        rule: 'RULE-AUTH-ALIGN',
        step: 'N3 持续观察',
        hash: 'sha256:e01d…3a4b',
        judgement: '发件头符合本域签名，暂扣期间未见恶意扩散'
      }
    ];
  }
  return [
    {
      code: 'EV-REC-01',
      evidence: '终审处罚裁决书数字存证',
      rule: 'RULE-FINAL-SANCTION',
      step: 'N3 终审拍案',
      hash: 'sha256:d89f…310c',
      judgement: '安全主管与系统引擎双重联合签署'
    },
    {
      code: 'EV-REC-02',
      evidence: '违规外发证据包 WORM 存根',
      rule: 'RULE-EVI-ARCHIVE',
      step: 'N4 永久封存',
      hash: 'sha256:55ab…110e',
      judgement: '完整样本封存至只读合规存储桶，保管期 180 天'
    }
  ];
});

// 快捷裁决批注
function applyPresetNote(noteText) {
  if (internalDecisionNotes.value) {
    internalDecisionNotes.value += `；${noteText}`;
  } else {
    internalDecisionNotes.value = noteText;
  }
}

// 裁决动作
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
  } catch (err) {}
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
  } catch (err) {}
}

const canExtend = computed(() => {
  const r = props.selectedRow;
  if (!r) return false;
  const deadline = r.deadline || r.expireTime || r.deadlockTime;
  return !!deadline && new Date(deadline).getTime() > Date.now();
});

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
/* 头部外壳 */
.drawer-header-shell {
  display: flex;
  flex-direction: column;
  padding: 16px 20px 12px 20px;
  background: var(--el-bg-color);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.drawer-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
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
  border-radius: 9px;
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
}

.header-tools-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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

/* 章节锚点 Chip 组 (支持横向滑动，主题动态变色) */
.chapter-chips-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-wrap: nowrap;
  margin-top: 10px;
  padding-bottom: 2px;
  width: 100%;
  box-sizing: border-box;

  &::-webkit-scrollbar {
    display: none;
  }

  .chapter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 11.5px;
    color: var(--el-text-color-regular);
    background: var(--el-fill-color-light);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    user-select: none;
    border: 1px solid transparent;

    &:hover {
      background: var(--el-fill-color);
      color: var(--el-text-color-primary);
    }

    &.chip-active {
      background: var(--drawer-accent-color, var(--el-color-primary));
      color: #fff;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    .chip-icon {
      flex-shrink: 0;
    }
  }
}

/* 正文滚动区与卡片浮起立体层次 */
.drawer-scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;
  background: var(--el-bg-color-page, #f8fafc);
}

/* 通用档案卡片 */
.dossier-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px 18px;
  background: var(--el-bg-color, #ffffff);
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.03);
  transition: border-color 0.2s, box-shadow 0.2s;

  &:hover {
    border-color: var(--el-border-color);
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 14px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .title-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;

      .help-question-icon {
        color: var(--el-text-color-secondary);
        cursor: pointer;
        transition: color 0.2s;
        &:hover {
          color: var(--el-color-primary);
        }
      }

      .chain-formula-desc {
        font-size: 11px;
        font-weight: 400;
      }
    }

    .section-badge {
      font-size: 10px;
      font-weight: 500;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid var(--el-border-color-lighter);
      letter-spacing: 0.5px;
    }
  }
}

/* 模块 A: 案件概要两列网格 (左右等距对称排版) */
.dossier-grid-12 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 24px;
  align-items: center;

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
    gap: 10px 0;
  }

  .grid-field {
    display: flex;
    align-items: center;
    font-size: 12.5px;
    min-width: 0;

    .field-k {
      color: var(--el-text-color-secondary);
      width: 76px;
      min-width: 76px;
      margin-right: 8px;
      flex-shrink: 0;
      text-align: left;
    }

    .field-v {
      flex: 1;
      min-width: 0;
      color: var(--el-text-color-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .field-v-with-copy {
      flex: 1;
      min-width: 0;
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

.reason-code-highlight {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.08);
  color: var(--el-color-danger);
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-size: 11.5px;
  width: fit-content;
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
  border-radius: 8px;
  overflow: hidden;
  font-size: 12px;

  .cluster-header-row {
    display: grid;
    grid-template-columns: 140px minmax(170px, 1.8fr) minmax(90px, 1.1fr) 72px minmax(130px, 1.5fr);
    column-gap: 10px;
    padding: 9px 12px;
    background: var(--el-fill-color-light);
    font-weight: 600;
    color: var(--el-text-color-secondary);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .cluster-data-row {
    display: grid;
    grid-template-columns: 140px minmax(170px, 1.8fr) minmax(90px, 1.1fr) 72px minmax(130px, 1.5fr);
    column-gap: 10px;
    padding: 9px 12px;
    align-items: center;
    border-bottom: 1px solid var(--el-border-color-lighter);
    transition: background 0.15s ease;

    &:hover {
      background: var(--el-fill-color-light);
    }

    &:last-child {
      border-bottom: none;
    }

    > * {
      min-width: 0;
    }

    .col-idx {
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .col-email {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;

      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .col-uid {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;

      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .col-status {
      overflow: hidden;
    }

    .col-relation {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11.5px;
    }
  }

  @media (max-width: 640px) {
    .cluster-header-row {
      display: none;
    }
    .cluster-data-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px;
    }
  }
}

/* 模块 C: 风险研判与处置依据 */
.disposition-nested-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.basis-chain-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);

  .basis-chain-row {
    display: flex;
    align-items: center;
    gap: 10px;

    .row-icon-col {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      min-width: 22px;
    }

    .row-content-col {
      flex: 1;
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--el-text-color-primary);

      .chain-main-text {
        color: var(--el-text-color-primary);
      }
      .chain-sub-text {
        color: var(--el-text-color-regular);
      }
    }
  }
}

.judgment-path-record-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);

  .record-box-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .record-list {
    display: flex;
    flex-direction: column;
    gap: 7px;

    .record-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 12px;
      line-height: 1.45;

      .record-tag {
        flex-shrink: 0;
        font-size: 10.5px;
        height: 19px;
        padding: 0 5px;
      }

      .record-text {
        color: var(--el-text-color-primary);
        word-break: break-all;
      }
    }
  }
}

/* 模块 D: 处置与存证全周期时间线 (单轴贯通流，消除 50% 虚白与孤字换行) */
.dual-swimlane-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.swimlane-column-headers {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  font-weight: 600;

  .swimlane-header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 9999px;
    background: var(--el-fill-color-light);

    &.machine-header {
      color: var(--el-color-primary);
      border: 1px solid rgba(59, 130, 246, 0.15);
    }
    &.human-header {
      color: var(--el-color-warning);
      border: 1px solid rgba(245, 158, 11, 0.15);
    }
  }

  .swimlane-header-spacer {
    display: none;
  }
}

.swimlane-grid-track {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  padding-left: 32px;

  /* 垂直贯通时间线 */
  &::before {
    content: '';
    position: absolute;
    top: 14px;
    bottom: 20px;
    left: 12px;
    width: 2px;
    background: var(--el-border-color-lighter);
    z-index: 1;
  }

  .swimlane-row {
    display: flex;
    align-items: stretch;
    position: relative;
    width: 100%;

    /* 隐藏对立侧空白占位单元格，不再虚耗 50% 宽度 */
    .swimlane-cell {
      min-width: 0;
      width: 100%;

      &:has(.swimlane-placeholder),
      &.machine-cell:empty,
      &.human-cell:empty {
        display: none !important;
      }

      .swimlane-placeholder {
        display: none !important;
      }

      .swimlane-card {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid var(--el-border-color-lighter);
        background: var(--el-fill-color-blank);
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: all 0.2s;

        &:hover {
          border-color: var(--el-border-color);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
        }

        &.machine-card {
          border-left: 3px solid var(--el-color-primary);
        }
        &.human-card {
          border-left: 3px solid var(--el-color-warning);
        }
        &.card-latest {
          border-color: rgba(239, 68, 68, 0.45);
          background: rgba(239, 68, 68, 0.02);
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.15);
        }

        .card-top-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          flex-wrap: wrap;

          .node-time {
            color: var(--el-text-color-secondary);
          }
          .node-actor-box {
            font-weight: 600;
            color: var(--el-text-color-primary);
            padding: 1px 6px;
            border-radius: 4px;
            background: var(--el-fill-color-light);
            border: 1px solid var(--el-border-color-lighter);
          }
          .node-badge-tag {
            color: var(--el-text-color-secondary);
            padding: 1px 5px;
            border-radius: 4px;
            background: var(--el-fill-color-lighter);
          }
          .node-duration {
            color: var(--el-text-color-secondary);
          }
          .latest-tag {
            font-size: 10px;
            height: 18px;
            padding: 0 5px;
            margin-left: auto;
          }
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;

          .node-num-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 1px 6px;
            border-radius: 4px;
            background: var(--el-fill-color);
            color: var(--el-text-color-primary);
            font-weight: 600;
            font-size: 11px;
            border: 1px solid var(--el-border-color-lighter);
          }
          .node-action {
            color: var(--el-text-color-primary);
          }
        }

        .card-desc {
          font-size: 12.5px;
          color: var(--el-text-color-regular);
          line-height: 1.5;
        }

        .card-footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          margin-top: 2px;
          gap: 8px;
          flex-wrap: wrap;

          .node-transition {
            display: flex;
            align-items: center;
            gap: 4px;

            .st-box {
              padding: 1px 6px;
              border-radius: 4px;
              background: var(--el-fill-color-light);
              border: 1px solid var(--el-border-color-lighter);
              color: var(--el-text-color-primary);

              &.st-to {
                color: var(--el-color-danger);
                font-weight: 500;
                background: rgba(239, 68, 68, 0.08);
                border-color: rgba(239, 68, 68, 0.2);
              }
            }

            .arrow { color: var(--el-text-color-secondary); }
          }

          .node-hash-pill {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 1px 6px;
            border-radius: 4px;
            background: var(--el-fill-color-light);
            border: 1px solid var(--el-border-color-lighter);
            color: var(--el-text-color-secondary);
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              color: var(--el-color-primary);
              border-color: var(--el-color-primary);
            }
          }
        }
      }
    }

    /* 唯一居中时间线节点锚点，整齐靠左中轴对齐 */
    .swimlane-axis {
      position: absolute;
      left: -32px;
      top: 10px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;

      &::before {
        display: none;
      }

      .axis-dot {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--el-bg-color);
        box-shadow: 0 0 0 2px var(--el-border-color-light);

        &.dot-machine {
          box-shadow: 0 0 0 2px var(--el-color-primary);
          color: var(--el-color-primary);
          background: rgba(59, 130, 246, 0.1);
        }
        &.dot-human {
          box-shadow: 0 0 0 2px var(--el-color-warning);
          color: var(--el-color-warning);
          background: rgba(245, 158, 11, 0.1);
        }
      }
    }
  }
}

/* 模块 E: 多维风险画像 */
.risk-profile-unified-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.risk-top-grid {
  display: grid;
  grid-template-columns: 88px minmax(130px, 160px) 1fr;
  gap: 16px;
  align-items: center;
  min-height: 88px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    justify-items: center;
    height: auto;

    .composite-score-square,
    .risk-driver-2line-box,
    .risk-dimensions-list {
      height: auto;
    }
  }
}

.composite-score-square {
  width: 88px;
  height: 88px;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;

  .score-number {
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
  }
  .score-label {
    font-size: 10.5px;
    margin-top: 5px;
    color: var(--el-text-color-secondary);
  }

  &.score-danger {
    color: var(--el-color-danger);
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  &.score-warning {
    color: var(--el-color-warning);
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.25);
  }
  &.score-success {
    color: var(--el-color-success);
    background: rgba(16, 185, 129, 0.06);
    border: 1px solid rgba(16, 185, 129, 0.25);
  }
}

/* 主驱动维度：自然居中与左侧方格及右侧列表对齐 */
.risk-driver-2line-box,
.risk-driver-bar-centered {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 0;
  background: transparent;
  border: none;
  box-sizing: border-box;

  .driver-prefix-line {
    font-size: 11px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    line-height: 1.3;
  }

  .driver-highlight-line {
    font-size: 11.5px;
    line-height: 1.4;
    word-break: break-word;
    white-space: normal;
  }
}

/* 右侧多维风险维度条列表 */
.risk-dimensions-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 8px 14px;
  min-width: 0;
  flex: 1;
  box-sizing: border-box;

  .dimension-row {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    min-width: 0;

    .dim-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      gap: 4px;

      .dim-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dim-meta {
        font-size: 9.5px;
        display: flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
        flex-shrink: 0;

        .dim-score {
          font-weight: 600;
        }
      }
    }

    .dim-progress-wrap {
      display: flex;
      align-items: center;
      width: 100%;

      :deep(.el-progress) {
        width: 100%;
      }
      :deep(.el-progress-bar__outer) {
        height: 6px !important;
        border-radius: 9999px;
        background: var(--el-fill-color-light);
      }
      :deep(.el-progress-bar__inner) {
        border-radius: 9999px;
      }
    }
  }
}

.risk-indicators-unified-box {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;

  .gauge-legend-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 12px;
    background: var(--el-fill-color-light);
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-size: 11px;
    color: var(--el-text-color-secondary);
    flex-wrap: wrap;

    .legend-pill {
      display: flex;
      align-items: center;
      gap: 5px;

      .legend-color-box {
        width: 12px;
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

    .metric-card-row {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(240px, 280px);
      gap: 14px;
      padding: 9px 14px;
      border-bottom: 1px solid var(--el-border-color-lighter);
      align-items: center;
      transition: background 0.15s ease;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &:last-child {
        border-bottom: none;
      }

      @media (max-width: 580px) {
        grid-template-columns: 1fr;
        gap: 6px;
      }

      .metric-info-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;

        .metric-title-line {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          column-gap: 6px;
          row-gap: 2px;

          .metric-name {
            font-size: 12px;
            color: var(--el-text-color-primary);
          }
          .metric-rule-box {
            display: inline-flex;
            align-items: center;
            padding: 0 4px;
            border-radius: 3px;
            background: var(--el-fill-color-light);
            border: 1px solid var(--el-border-color-lighter);
            font-size: 10px;
            white-space: nowrap;
          }
        }

        .metric-probe-notes {
          font-size: 10.5px;
          line-height: 1.3;
        }
      }

      .metric-data-col {
        display: flex;
        flex-direction: column;
        gap: 5px;

        .metric-val-row {
          display: flex;
          align-items: center;
          justify-content: space-between;

          .metric-val {
            font-size: 12px;
            color: var(--el-text-color-primary);
          }
          .threshold-tag {
            font-size: 10.5px;
            height: 18px;
            padding: 0 5px;
          }
        }

        .gauge-bar-wrapper {
          display: flex;
          flex-direction: column;
          gap: 3px;
          width: 100%;

          .gauge-track {
            position: relative;
            height: 6px;
            background: var(--el-fill-color-light);
            border-radius: 9999px;
            overflow: hidden;

            .gauge-fill {
              height: 100%;
              background: var(--el-color-primary);
              border-radius: 9999px;
              transition: width 0.3s;
              &.fill-over {
                background: linear-gradient(90deg, #f87171, #ef4444);
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
      }
    }
  }
}

/* 模块 F: 相似案例处置参照 */
.similar-cases-body {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .distribution-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    flex-wrap: wrap;
    gap: 8px;

    .header-reason-box {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.18);
      font-size: 11.5px;

      .reason-prefix {
        color: var(--el-text-color-secondary);
        font-weight: 500;
      }
      .reason-code-val {
        color: var(--el-color-danger);
        font-weight: 600;
        font-family: var(--el-font-family-monospace, monospace);
      }
    }

    .distribution-meta {
      font-size: 11.5px;
      color: var(--el-text-color-secondary);
    }

    .meta-separator {
      margin: 0 4px;
    }
  }

  .stacked-distribution-bar {
    display: flex;
    height: 8px;
    border-radius: 9999px;
    overflow: hidden;
    background: var(--el-fill-color);

    .dist-segment {
      height: 100%;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
  }

  .distribution-stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;

    @media (max-width: 580px) {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-col-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px 8px;
      border-radius: 8px;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      gap: 4px;
      transition: border-color 0.2s, box-shadow 0.2s;

      &:hover {
        border-color: var(--el-border-color);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      }

      .stat-name-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        color: var(--el-text-color-secondary);

        .color-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
      }

      .stat-percent {
        font-size: 16px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
        line-height: 1.2;
      }

      .stat-count {
        font-size: 11px;
        color: var(--el-text-color-placeholder);
        font-variant-numeric: tabular-nums;
      }
    }
  }

  .consistency-advisory-box {
    display: flex;
    align-items: stretch;
    background: rgba(59, 130, 246, 0.04);
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(59, 130, 246, 0.15);

    .advisory-bar-indicator {
      width: 3px;
      background: var(--el-color-primary);
      flex-shrink: 0;
    }

    .advisory-content-wrap {
      padding: 10px 14px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-regular);
    }
  }
}

/* 模块 G: 证据链溯源 */
.evidence-chain-structured-list {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .chain-card-row {
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color-lighter);
    gap: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      border-color: var(--el-border-color);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }

    .chain-header-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;

      .evidence-id-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12.5px;
        font-weight: 500;
        color: var(--el-text-color-primary);

        .ev-code-box {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(59, 130, 246, 0.08);
          color: var(--el-color-primary);
          border: 1px solid rgba(59, 130, 246, 0.2);
          font-family: var(--el-font-family-monospace, monospace);
          font-size: 11px;
          font-weight: 600;
        }
      }

      .evidence-rule-box {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.2);
        font-size: 11px;
        font-weight: 500;
      }
    }

    .chain-flow-line {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      flex-wrap: wrap;

      .flow-step-box {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 4px;
        background: var(--el-fill-color-light);
        border: 1px solid var(--el-border-color-lighter);
        color: var(--el-text-color-primary);
        font-weight: 500;
        font-size: 11px;
      }

      .flow-arrow {
        color: var(--el-text-color-placeholder);
        display: inline-flex;
        align-items: center;
      }

      .flow-hash-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 4px;
        background: var(--el-fill-color-light);
        border: 1px solid var(--el-border-color-lighter);
        color: var(--el-text-color-secondary);
        cursor: pointer;
        font-family: var(--el-font-family-monospace, monospace);
        font-size: 11px;
        transition: all 0.15s ease;

        &:hover {
          color: var(--el-color-primary);
          border-color: var(--el-color-primary-light-5);
          background: var(--el-color-primary-light-9);
        }
      }

      .flow-judgement-text {
        color: var(--el-text-color-regular);
        font-size: 12px;
      }
    }
  }
}

/* 模块 H: 裁决工作台 */
.adjudication-workbench-card {
  .decision-input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;

    .decision-input-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;

      .input-title {
        font-size: 12.5px;
        font-weight: 500;
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
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;

          &:hover {
            border-color: var(--el-color-primary);
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
          }
        }
      }
    }
  }

  .adjudication-actions-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;

    @media (max-width: 580px) {
      grid-template-columns: 1fr;
    }

    :deep(.el-button) {
      width: 100%;
      margin-left: 0;
      justify-content: center;
      height: 38px;
      min-height: 38px;
      padding: 8px 12px;
      font-size: 12.5px;
      font-weight: 500;
      border-radius: 8px;
      line-height: 1.35;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

      .el-icon {
        margin-right: 6px;
        font-size: 14px;
      }
    }
  }
}

/* 模块 I: 只读台账横幅 */
.sanction-ledger-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--el-color-success);

  .banner-icon {
    color: var(--el-color-success);
    flex-shrink: 0;
    font-size: 20px;
  }

  .banner-text-box {
    display: flex;
    flex-direction: column;
    gap: 3px;

    .banner-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }
    .banner-sub {
      font-size: 11.5px;
      color: var(--el-text-color-secondary);
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
  flex-wrap: wrap;
  gap: 10px;

  :deep(.el-button) {
    height: 34px;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 500;
  }

  @media (max-width: 768px) {
    gap: 8px;

    :deep(.el-button) {
      flex: 1 1 calc(50% - 4px);
      margin-left: 0;
      justify-content: center;
    }
  }
}
</style>

<style lang="scss">
.audit-detail-drawer.audit-drawer-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color);

  /* Variant-aware accent tokens */
  &.theme-threat {
    --drawer-accent-color: var(--el-color-danger, #ef4444);
    --drawer-accent-light: rgba(239, 68, 68, 0.08);
  }
  &.theme-appeal {
    --drawer-accent-color: var(--el-color-warning, #f59e0b);
    --drawer-accent-light: rgba(245, 158, 11, 0.08);
  }
  &.theme-audit {
    --drawer-accent-color: var(--el-color-primary, #3b82f6);
    --drawer-accent-light: rgba(59, 130, 246, 0.08);
  }
  &.theme-record {
    --drawer-accent-color: var(--el-color-info, #64748b);
    --drawer-accent-light: rgba(100, 116, 139, 0.08);
  }

  > .el-drawer__header {
    flex-shrink: 0;
    margin-bottom: 0;
    padding: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  > .el-drawer__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    background: var(--el-bg-color-page, #f8fafc);
  }

  > .el-drawer__footer {
    flex-shrink: 0;
    padding: 12px 20px;
    border-top: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
  }
}

/* Dark mode theme alignment */
html.dark {
  .audit-detail-drawer.audit-drawer-container {
    background: #0d1117;

    > .el-drawer__body {
      background: #090d13;
    }

    > .el-drawer__footer {
      background: #0d1117;
      border-top-color: #30363d;
    }

    .drawer-header-shell {
      background: #0d1117;
    }

    .dossier-card {
      background: #161b22;
      border-color: #30363d;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);

      &:hover {
        border-color: #484f58;
      }
    }

    .chain-card-row,
    .swimlane-card,
    .stat-col-box {
      background: #161b22;
      border-color: #30363d;
    }

    .cluster-preview-table {
      background: #161b22;
      border-color: #30363d;

      .table-header-row {
        background: #1c2128;
        border-bottom-color: #30363d;
      }

      .table-data-row {
        border-bottom-color: #21262d;

        &:hover {
          background: #1c2128;
        }
      }
    }

    .gauge-track {
      background: #21262d;
    }
  }
}
</style>
