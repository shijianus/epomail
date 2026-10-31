<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    direction="rtl"
    destroy-on-close
    class="audit-detail-drawer audit-drawer-container"
    :class="variantThemeClass"
    :show-close="false"
    :close-on-press-escape="false"
    @opened="handleDrawerOpened"
  >
    <!-- 抽屉头部：统一展示标题 + 案件编号/状态 + 纯图标关闭按钮 + 4 个真正的内容 Tab 导航 -->
    <template #header>
      <div class="drawer-header-shell">
        <div class="drawer-header-top">
          <div class="header-main-info">
            <div class="header-icon-wrap" :class="variantThemeClass">
              <Icon :icon="variantIcon" width="20" height="20" />
            </div>
            <div class="header-text-group">
              <div class="drawer-title-row">
                <span class="drawer-title">{{ currentVariantTitle }}</span>
                <span v-if="selectedRow" class="header-case-badge font-mono">{{ caseNumber }}</span>
                <el-tag
                  v-if="selectedRow"
                  size="small"
                  :type="getStatusTagType(selectedRow.status)"
                  class="header-status-tag"
                >
                  {{ getStatusLabel(selectedRow.status) }}
                </el-tag>
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

        <!-- 内容 Tab 导航 -->
        <div class="drawer-tabs-wrapper">
          <el-tabs v-model="activeTab" class="drawer-clean-tabs" @tab-change="handleTabChange">
            <el-tab-pane name="overview" :label="$t('auditTabOverview')" />
            <el-tab-pane v-if="!isVisitor" name="investigation" :label="$t('auditTabInvestigation')" />
            <el-tab-pane v-if="!isVisitor" name="evidence" :label="$t('auditTabEvidence')" />
            <el-tab-pane name="decision" :label="(adjudicationContext.isReadOnly || isVisitor) ? $t('auditTabLedger') : $t('auditTabDecision')" />
          </el-tabs>
        </div>
      </div>
    </template>

    <!-- 可滚动主体正文：按 4 个 Tab 组织内容 -->
    <div v-if="selectedRow" ref="scrollContainerRef" class="drawer-scroll-body">
      
      <!-- 1. 总览 Tab (风险依据摘要 -> 案件概要 -> 集群关联账号) -->
      <div v-show="activeTab === 'overview'" class="tab-pane-container">
        <!-- 风险研判与处置依据摘要 -->
        <section id="chapter-basis" class="dossier-card">
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:shield-task-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionBasis') }}</span>
            </div>
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
                    {{ triggerTagDisplay }}
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
                    {{ recommendedActionLabel(currentSuggestionTag) }}
                  </el-tag>
                </div>
                <div class="row-content-col">
                  <span class="chain-sub-text font-medium">{{ currentSuggestionText }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 案件概要 (两列网格字段，左右等距对齐，纯文本展示) -->
        <section id="chapter-summary" class="dossier-card">
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:document-text-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionOverview') }}</span>
            </div>
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
                  v-if="!isVisitor && !selectedRow.cleared"
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
                <span class="masked-text" :title="maskedUserId">{{ maskedUserId }}</span>
                <button
                  v-if="!isVisitor && !selectedRow.cleared"
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
              <div class="field-v">
                <span class="font-mono font-medium reason-code-highlight" :title="selectedRow.reasonCode || '—'">{{ selectedRow.reasonCode || '—' }}</span>
              </div>
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

        <!-- 集群关联账号 (仅非参观者且具有集群账号时渲染：逐账号纵向条目，取消横向表格) -->
        <section
          v-if="!isVisitor && isThreatVariant && clusterAccountsList && clusterAccountsList.length > 0"
          id="chapter-cluster"
          class="dossier-card"
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

          <div class="cluster-records-list">
            <div
              v-for="(acc, cIdx) in clusterAccountsList"
              :key="acc.id || cIdx"
              class="cluster-record-row cluster-account-entry"
            >
              <!-- 紧凑行序号 -->
              <span class="record-idx font-mono font-medium">#{{ cIdx + 1 }}</span>

              <!-- 邮箱单元：仅放邮箱 + 紧邻复制图标 -->
              <div class="record-col record-email">
                <span class="account-email-val font-mono font-medium">{{ maskEmail(acc.email) }}</span>
                <button
                  type="button"
                  class="inline-copy-btn"
                  :title="$t('abuseCopyEmail')"
                  :aria-label="$t('abuseCopyEmail')"
                  @click="copyEmail(acc.email)"
                >
                  <Icon icon="fluent:copy-16-regular" width="13" height="13" />
                </button>
              </div>

              <!-- 状态单元：仅放真实状态 -->
              <div class="record-col record-status">
                <el-tag
                  size="small"
                  :type="getStatusTagType(acc.status)"
                  effect="plain"
                  class="entry-status-tag"
                >
                  {{ getStatusLabel(acc.status) }}
                </el-tag>
              </div>

              <!-- 依据单元：原始完整关联依据 (自然换行，不截断；无采集数据时禁止编造) -->
              <div class="record-col record-basis">
                <span class="basis-full-text">{{ acc.evidenceSummary || '—' }}</span>
              </div>

              <!-- 查看标识入口 (可访问浮层，键盘与无障碍支持) -->
              <div class="record-col record-action">
                <el-popover
                  :ref="el => setPopoverRef(el, cIdx)"
                  placement="bottom-end"
                  :width="280"
                  trigger="click"
                  popper-class="account-identity-popover"
                >
                  <template #reference>
                    <button
                      :ref="el => setIdentityBtnRef(el, cIdx)"
                      type="button"
                      class="view-identity-btn"
                      :title="$t('auditBtnViewIdentifiers')"
                      :aria-label="$t('auditBtnViewIdentifiers') + ' #' + (cIdx + 1)"
                    >
                      <Icon icon="fluent:person-key-20-regular" width="14" height="14" />
                      <span>{{ $t('auditBtnViewIdentifiers') }}</span>
                    </button>
                  </template>
                  <div class="identity-popover-content">
                    <div class="popover-header font-medium">{{ $t('auditTechnicalIdentifiers') }} (#{{ cIdx + 1 }})</div>
                    <div class="popover-row">
                      <span class="popover-label">{{ $t('auditColUserId') }}:</span>
                      <span class="popover-val account-uid-val font-mono">{{ maskUserId(acc.userId || ('usr_' + acc.id)) }}</span>
                      <button
                        type="button"
                        class="inline-copy-btn"
                        :title="$t('abuseCopyUserId')"
                        @click="copyUserId(acc.userId || ('usr_' + acc.id))"
                      >
                        <Icon icon="fluent:copy-16-regular" width="12" height="12" />
                      </button>
                    </div>
                    <div class="popover-row">
                      <span class="popover-label">{{ $t('auditColSubCaseId') }}:</span>
                      <span class="popover-val account-subcase-val font-mono">{{ getSubCaseId(caseNumber, cIdx) }}</span>
                      <button
                        type="button"
                        class="inline-copy-btn"
                        :title="$t('abuseCopiedSuccess')"
                        @click="copyCaseNo(getSubCaseId(caseNumber, cIdx))"
                      >
                        <Icon icon="fluent:copy-16-regular" width="12" height="12" />
                      </button>
                    </div>
                  </div>
                </el-popover>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 2. 调查 Tab (人机双泳道时间线 -> 研判路径记录 -> 多维风险画像) -->
      <div v-show="activeTab === 'investigation'" class="tab-pane-container">
        <!-- 模块 D: 处置与存证全周期时间线 (人机左右双泳道) -->
        <section id="chapter-timeline" class="dossier-card">
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:timeline-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionTimeline') }}</span>
            </div>
          </div>

          <div class="dual-swimlane-container">
            <!-- 左右泳道表头 -->
            <div class="swimlane-column-headers">
              <div class="swimlane-header machine-header">
                <Icon icon="fluent:bot-16-regular" width="15" height="15" />
                <span class="header-text-full">{{ $t('auditTimelineSwimlaneMachine') }}</span>
                <span class="header-text-short">{{ $t('auditTimelineSwimlaneMachineShort') }}</span>
              </div>
              <div class="swimlane-header-spacer"></div>
              <div class="swimlane-header human-header">
                <Icon icon="fluent:person-16-regular" width="15" height="15" />
                <span class="header-text-full">{{ $t('auditTimelineSwimlaneHuman') }}</span>
                <span class="header-text-short">{{ $t('auditTimelineSwimlaneHumanShort') }}</span>
              </div>
            </div>

            <!-- 双泳道节点网格流水线：中间唯一时间中轴穿过，左右严格归属 -->
            <div class="swimlane-grid-track">
              <div
                v-for="(node, nIdx) in currentTimelineNodes"
                :key="nIdx"
                class="swimlane-row"
                :class="[ `node-lane-${node.lane}`, { 'is-latest': node.isLatest } ]"
              >
                <!-- 机器自动泳道单元格 (左侧：机器/系统自动事件) -->
                <div class="swimlane-cell machine-cell">
                  <div v-if="node.lane === 'machine'" class="swimlane-event-box machine-event" :class="{ 'event-latest': node.isLatest }">
                    <!-- 行 1: 标题 + 角色标识(窄屏显示) + 最新标记 + 时间 -->
                    <div class="event-head-line">
                      <div class="event-title-group">
                        <span class="event-lane-badge badge-machine">
                          <Icon icon="fluent:bot-16-regular" width="11" height="11" />
                          <span>{{ $t('auditTimelineSwimlaneMachine') || '自动化' }}</span>
                        </span>
                        <span class="event-action-title font-semibold">{{ node.action }}</span>
                        <span v-if="node.isLatest" class="event-latest-badge">{{ $t('auditTimelineLatestNode') }}</span>
                      </div>
                      <span class="event-time-tag font-mono text-muted">{{ node.time }}</span>
                    </div>

                    <!-- 行 2: 执行者 · 节点编号 · 原有耗时 (纯文本辅助行，不堆填充胶囊) -->
                    <div class="event-meta-line text-muted font-mono">
                      <span class="meta-actor actor-machine">
                        <Icon icon="fluent:bot-16-regular" width="12" height="12" />
                        <span>{{ node.actor }}</span>
                      </span>
                      <span class="meta-dot">·</span>
                      <span class="meta-node-id">{{ node.nodeId }}</span>
                      <template v-if="node.duration">
                        <span class="meta-dot">·</span>
                        <span class="meta-duration">{{ node.duration }}</span>
                      </template>
                      <template v-if="node.badge">
                        <span class="meta-dot">·</span>
                        <span class="meta-badge-text">{{ node.badge }}</span>
                      </template>
                    </div>

                    <!-- 行 3: 完整事件说明 (完整展示，不截断) -->
                    <div class="event-desc-line">{{ node.desc }}</div>

                    <!-- 行 4: 原状态 → 新状态 与 已有证据哈希与复制入口 -->
                    <div v-if="node.transition || node.hash" class="event-transition-hash-line font-mono">
                      <div v-if="node.transition" class="node-transition-inline">
                        <span class="st-text st-from">{{ node.transition.from }}</span>
                        <Icon icon="fluent:arrow-right-12-regular" width="11" height="11" class="st-arrow" />
                        <span class="st-text st-to font-medium">{{ node.transition.to }}</span>
                      </div>
                      <div v-if="node.hash" class="node-hash-inline" @click="copyHash(node.hash)" :title="$t('auditCopiedHash')">
                        <span class="hash-label text-muted">HASH:</span>
                        <span class="hash-val">{{ node.hash }}</span>
                        <button class="inline-copy-btn" :title="$t('auditCopiedHash')">
                          <Icon icon="fluent:copy-16-regular" width="11" height="11" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div v-else class="swimlane-placeholder"></div>
                </div>

                <!-- 居中唯一时间轴中轴线与节点锚点 -->
                <div class="swimlane-axis">
                  <div class="axis-line" :class="{ 'line-first': nIdx === 0, 'line-last': nIdx === currentTimelineNodes.length - 1 }"></div>
                  <div class="axis-dot" :class="[ node.lane === 'machine' ? 'dot-machine' : 'dot-human', { 'dot-latest': node.isLatest } ]">
                    <Icon :icon="node.lane === 'machine' ? 'fluent:bot-16-regular' : 'fluent:person-16-regular'" width="11" height="11" />
                  </div>
                </div>

                <!-- 人工与用户泳道单元格 (右侧：管理员/人工审核/用户事件) -->
                <div class="swimlane-cell human-cell">
                  <div v-if="node.lane === 'human'" class="swimlane-event-box human-event" :class="{ 'event-latest': node.isLatest }">
                    <!-- 行 1: 标题 + 角色标识(窄屏显示) + 最新标记 + 时间 -->
                    <div class="event-head-line">
                      <div class="event-title-group">
                        <span class="event-lane-badge badge-human">
                          <Icon icon="fluent:person-16-regular" width="11" height="11" />
                          <span>{{ $t('auditTimelineSwimlaneHuman') || '人工·用户' }}</span>
                        </span>
                        <span class="event-action-title font-semibold">{{ node.action }}</span>
                        <span v-if="node.isLatest" class="event-latest-badge">{{ $t('auditTimelineLatestNode') }}</span>
                      </div>
                      <span class="event-time-tag font-mono text-muted">{{ node.time }}</span>
                    </div>

                    <!-- 行 2: 执行者 · 节点编号 · 原有耗时 (纯文本辅助行，不堆填充胶囊) -->
                    <div class="event-meta-line text-muted font-mono">
                      <span class="meta-actor actor-human">
                        <Icon icon="fluent:person-16-regular" width="12" height="12" />
                        <span>{{ node.actor }}</span>
                      </span>
                      <span class="meta-dot">·</span>
                      <span class="meta-node-id">{{ node.nodeId }}</span>
                      <template v-if="node.duration">
                        <span class="meta-dot">·</span>
                        <span class="meta-duration">{{ node.duration }}</span>
                      </template>
                      <template v-if="node.badge">
                        <span class="meta-dot">·</span>
                        <span class="meta-badge-text">{{ node.badge }}</span>
                      </template>
                    </div>

                    <!-- 行 3: 完整事件说明 (统一左对齐) -->
                    <div class="event-desc-line">{{ node.desc }}</div>

                    <!-- 行 4: 原状态 → 新状态 与 已有证据哈希与复制入口 -->
                    <div v-if="node.transition || node.hash" class="event-transition-hash-line font-mono">
                      <div v-if="node.transition" class="node-transition-inline">
                        <span class="st-text st-from">{{ node.transition.from }}</span>
                        <Icon icon="fluent:arrow-right-12-regular" width="11" height="11" class="st-arrow" />
                        <span class="st-text st-to font-medium">{{ node.transition.to }}</span>
                      </div>
                      <div v-if="node.hash" class="node-hash-inline" @click="copyHash(node.hash)" :title="$t('auditCopiedHash')">
                        <span class="hash-label text-muted">HASH:</span>
                        <span class="hash-val">{{ node.hash }}</span>
                        <button class="inline-copy-btn" :title="$t('auditCopiedHash')">
                          <Icon icon="fluent:copy-16-regular" width="11" height="11" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div v-else class="swimlane-placeholder"></div>
                </div>
              </div>
            </div>

            <!-- 时间线空态：数据库无 timeline 节点时给出明确说明，避免呈现为加载失败 -->
            <div v-if="!currentTimelineNodes.length" class="evidence-empty-box">
              <Icon icon="fluent:timeline-20-regular" width="22" height="22" />
              <div class="evidence-empty-title font-medium">{{ $t('auditTimelineEmpty') }}</div>
            </div>
          </div>
        </section>

        <!-- 原有研判路径记录 (移入调查面板，支持按需折叠) -->
        <section id="chapter-judgment-path" class="dossier-card">
          <div class="section-title cursor-pointer" @click="isJudgmentLogsCollapsed = !isJudgmentLogsCollapsed">
            <div class="title-left">
              <Icon icon="fluent:history-20-regular" width="18" height="18" />
              <span>{{ $t('auditJudgmentPathRecord') }}</span>
              <el-tag size="small" type="info" effect="plain" class="ml-2">
                {{ $t('auditJudgmentLogCount', { n: currentJudgmentLogs.length }) }}
              </el-tag>
            </div>
            <button class="collapse-toggle-btn" :title="isJudgmentLogsCollapsed ? $t('expand') : $t('collapse')">
              <Icon :icon="isJudgmentLogsCollapsed ? 'fluent:chevron-down-16-regular' : 'fluent:chevron-up-16-regular'" width="16" height="16" />
            </button>
          </div>

          <div v-show="!isJudgmentLogsCollapsed" class="judgment-path-record-box">
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
        </section>

        <!-- 模块 E: 多维风险画像与遥测指标 -->
        <section id="chapter-risk" class="dossier-card">
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:chart-multiple-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionRisk') }}</span>
            </div>
          </div>

          <div class="risk-profile-unified-card">
            <!-- 上半区：正方形方格综合风险分 + 中间主驱动维度 + 右侧紧凑维度条列表 -->
            <div class="risk-top-grid">
              <!-- 1. 正方形方格综合风险分 (克制强调，非整块大红；未采集评分时展示占位破折号) -->
              <div class="composite-score-square" :class="riskScoreLevelClass">
                <div class="score-number font-mono">{{ currentRiskProfile.compositeScore ?? '—' }}</div>
                <div class="score-label">{{ $t('auditRiskCompositeScore') }}</div>
              </div>

              <!-- 2. 中间：主驱动维度 (中性克制表面) -->
              <div class="risk-driver-2line-box risk-driver-bar-centered">
                <div class="driver-prefix-line">{{ $t('auditRiskMainDriver') }}:</div>
                <div class="driver-highlight-line font-medium">
                  {{ currentRiskProfile.mainDriver }}
                </div>
              </div>

              <!-- 3. 右侧：多维风险维度条列表 (中性细轨，不喧宾夺主) -->
              <div class="risk-dimensions-list">
                <div
                  v-for="dim in currentRiskProfile.dimensions"
                  :key="dim.name"
                  class="dimension-row"
                >
                  <div class="dim-label-row">
                    <span class="dim-name font-medium" :title="dim.name">{{ dim.name }}</span>
                    <div class="dim-meta font-mono">
                      <span class="dim-score">{{ $t('auditRiskDimScore', { score: dim.score }) }}</span>
                      <span class="dim-weight text-muted">{{ $t('auditRiskDimWeight', { weight: dim.weight }) }}</span>
                    </div>
                  </div>
                  <div class="dim-progress-wrap">
                    <el-progress
                      :percentage="Math.min(100, dim.score)"
                      :color="getProgressColor(dim.score)"
                      :stroke-width="4"
                      :show-text="false"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- 数据比较区：将比较数据集中排列，当前值与阈值相邻放置，诚实图形映射与局部克制强调 -->
            <div class="risk-indicators-unified-box" v-if="enrichedRiskMetrics.length">
              <!-- 图形符号与图例说明栏（形状 + 色彩双重编码，不单靠颜色区分含义） -->
              <div class="risk-gauge-legend-bar font-mono">
                <span class="legend-chip">
                  <span class="legend-shape shape-current"></span>
                  <span>{{ $t('auditGaugeLegendCurrent') }}</span>
                </span>
                <span class="legend-chip">
                  <span class="legend-shape shape-threshold"></span>
                  <span>{{ $t('auditGaugeLegendThreshold') }}</span>
                </span>
                <span class="legend-chip">
                  <span class="legend-shape shape-self"></span>
                  <span>{{ $t('auditGaugeLegendSelf') }}</span>
                </span>
                <span class="legend-chip">
                  <span class="legend-shape shape-cohort"></span>
                  <span>{{ $t('auditGaugeLegendCohort') }}</span>
                </span>
                <span class="legend-chip">
                  <span class="legend-shape shape-overflow">▸</span>
                  <span>{{ $t('auditGaugeLegendOverflow') }}</span>
                </span>
              </div>

              <div class="risk-indicators-table">
                <div
                  v-for="(metric, mIdx) in enrichedRiskMetrics"
                  :key="mIdx"
                  class="metric-compare-row"
                  :data-rule="metric.rule"
                  :data-gauge-mode="metric.visualSpec.mode"
                >
                  <!-- 行 1: 指标名称 .................... 量程口径 + 命中状态 -->
                  <div class="metric-head-line">
                    <span class="metric-name font-medium">{{ metric.name }}</span>
                    <div class="metric-head-right">
                      <span v-if="metric.visualSpec.scaleLabel" class="metric-scale-caption font-mono">
                        {{ metric.visualSpec.scaleLabel }}
                      </span>
                      <el-tag
                        size="small"
                        :type="metric.isOverThreshold ? 'danger' : 'info'"
                        effect="plain"
                        class="metric-status-tag"
                      >
                        {{ metric.isOverThreshold ? $t('auditRiskThresholdOver') : $t('auditRiskThresholdWithin') }}
                      </el-tag>
                    </div>
                  </div>

                  <!-- 行 2: 当前值 …… / 风险阈值 …… + 越界徽标 -->
                  <div class="metric-values-pair font-mono">
                    <div class="val-item current-val-item">
                      <span class="val-label text-muted">{{ $t('auditColCurrentValue') }}:</span>
                      <span class="val-num font-semibold" :class="{ 'text-danger': metric.isOverThreshold }">
                        {{ metric.currentValue }}
                      </span>
                      <span
                        v-if="metric.visualSpec.convertedNote"
                        class="val-converted-note text-muted"
                      >
                        ({{ metric.visualSpec.convertedNote }})
                      </span>
                    </div>

                    <span class="val-divider text-muted">/</span>

                    <div class="val-item threshold-val-item">
                      <span class="val-label text-muted">{{ $t('auditRiskGaugeThreshold') }}:</span>
                      <span class="val-num">{{ metric.threshold }}</span>
                    </div>

                    <span
                      v-if="metric.visualSpec.isOverflow"
                      class="gauge-overflow-badge"
                      :title="metric.visualSpec.overflowTooltip"
                    >
                      ▸ {{ $t('auditGaugeOverflowBadge') }} ({{ metric.visualSpec.rawCurrentPct }}%)
                    </span>
                  </div>

                  <!-- 行 3: 紧凑图形比较条 (Bullet / Range Gauge 或独立状态条) -->
                  <div
                    class="metric-gauge-track-wrap"
                    role="img"
                    :aria-label="metric.visualSpec.ariaLabel"
                  >
                    <!-- 场景 A: 离散校验型指标（不画虚假连续数轴，采用独立四段式校验条） -->
                    <div
                      v-if="metric.visualSpec.mode === 'discrete-pass'"
                      class="gauge-benchmark-bar gauge-discrete-status-bar"
                    >
                      <span v-for="seg in 4" :key="seg" class="discrete-seg is-verified"></span>
                    </div>

                    <!-- 场景 B: 缺失当前值（不画虚假 0% 节点，采用虚线空置轨） -->
                    <div
                      v-else-if="metric.visualSpec.mode === 'missing'"
                      class="gauge-benchmark-bar gauge-missing-bar"
                    >
                      <div
                        v-if="metric.visualSpec.thresholdPct !== null"
                        class="gauge-tick-marker tick-threshold"
                        :style="{ left: metric.visualSpec.thresholdPct + '%' }"
                        :title="`${$t('auditRiskGaugeThreshold')}: ${metric.threshold}`"
                      ></div>
                    </div>

                    <!-- 场景 C: 连续量纲子弹图 (Bullet / Benchmark Gauge) -->
                    <div
                      v-else
                      class="gauge-benchmark-bar"
                      :class="{ 'is-overflow': metric.visualSpec.isOverflow }"
                    >
                      <!-- 风险警戒区间 (低饱和微警示底纹，仅覆盖阈值外侧区域) -->
                      <div
                        class="gauge-risk-zone"
                        :style="metric.visualSpec.riskZoneStyle"
                      ></div>

                      <!-- 正常区间段 (中性低饱和石板蓝，绝不整条铺红) -->
                      <div
                        class="gauge-fill-line gauge-normal-segment"
                        :style="metric.visualSpec.normalSegmentStyle"
                      ></div>

                      <!-- 局部异常越限段 (仅超阈值部分或下限缺口区段采用克制危险色强调) -->
                      <div
                        v-if="metric.visualSpec.anomalySegmentStyle"
                        class="gauge-anomaly-segment"
                        :class="{ 'is-lower-gap': metric.visualSpec.direction === 'lower' }"
                        :style="metric.visualSpec.anomalySegmentStyle"
                      ></div>

                      <!-- 阈值门禁刻度 (┃ 高竖线标识) -->
                      <div
                        v-if="metric.visualSpec.thresholdPct !== null"
                        class="gauge-tick-marker tick-threshold"
                        :style="{ left: metric.visualSpec.thresholdPct + '%' }"
                        :title="`${$t('auditRiskGaugeThreshold')}: ${metric.threshold}`"
                      ></div>

                      <!-- 自身30天基线刻度 (▲ 三角标识，缺失值不渲染) -->
                      <div
                        v-if="metric.visualSpec.selfPct !== null"
                        class="gauge-tick-marker tick-self"
                        :style="{ left: metric.visualSpec.selfPct + '%' }"
                        :title="`${$t('auditRiskGaugeSelf30d')}: ${metric.self30d}`"
                      ></div>

                      <!-- 同群组基线刻度 (◇ 空心菱形标识，缺失值不渲染) -->
                      <div
                        v-if="metric.visualSpec.cohortPct !== null"
                        class="gauge-tick-marker tick-cohort"
                        :style="{ left: metric.visualSpec.cohortPct + '%' }"
                        :title="`${$t('auditRiskGaugeGroupBaseline')}: ${metric.cohortBaseline}`"
                      ></div>

                      <!-- 当前实测值圆点指针 (● 圆形标识) -->
                      <div
                        v-if="metric.visualSpec.currentPct !== null"
                        class="gauge-current-dot"
                        :class="{
                          'dot-over': metric.isOverThreshold,
                          'dot-overflow': metric.visualSpec.isOverflow
                        }"
                        :style="{ left: metric.visualSpec.currentPct + '%' }"
                        :title="`${$t('auditColCurrentValue')}: ${metric.currentValue}`"
                      ></div>

                      <!-- 超量程右端越界箭头帽 -->
                      <div
                        v-if="metric.visualSpec.isOverflow"
                        class="gauge-overflow-cap"
                        :title="metric.visualSpec.overflowTooltip"
                      >▸</div>
                    </div>
                  </div>

                  <!-- 行 4: 自身基线 …… · 群组基线 …… · 风险阈值 …… (形状图例与轨道一一对应) -->
                  <div class="metric-baselines-line font-mono text-muted">
                    <span class="meta-item">
                      <span class="legend-indicator dot-self"></span>
                      {{ $t('auditRiskGaugeSelf30d') }}: {{ metric.self30d }}
                    </span>
                    <span class="meta-dot">·</span>
                    <span class="meta-item">
                      <span class="legend-indicator dot-cohort"></span>
                      {{ $t('auditRiskGaugeGroupBaseline') }}: {{ metric.cohortBaseline }}
                    </span>
                  </div>

                  <!-- 行 5: 规则编号 · 原有采集说明 -->
                  <div class="metric-rule-probe-line font-mono text-muted">
                    <span class="metric-rule-tag">{{ metric.rule }}</span>
                    <template v-if="metric.probeNotes">
                      <span class="meta-dot">·</span>
                      <span class="meta-notes">{{ metric.probeNotes }}</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- 遥测指标空态：后端未采集结构化指标时给出诚实说明 -->
            <div v-else class="evidence-empty-box">
              <Icon icon="fluent:chart-multiple-20-regular" width="22" height="22" />
              <div class="evidence-empty-title font-medium">{{ $t('auditRiskMetricsEmpty') }}</div>
            </div>
          </div>
        </section>
      </div>

      <!-- 3. 证据 Tab (证据链溯源 -> 相似案例处置参照) -->
      <div v-show="activeTab === 'evidence'" class="tab-pane-container">
        <!-- 模块 G: 证据链溯源 (优先) -->
        <section id="chapter-chain" class="dossier-card">
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:link-multiple-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionChain') }}</span>
            </div>
          </div>

          <div class="evidence-chain-structured-list">
            <!-- 证据清单：仅渲染数据库中真实存在的存证字段，空态时给出明确说明 -->
            <template v-if="evidenceItems.length">
              <div
                v-for="(item, eIdx) in evidenceItems"
                :key="eIdx"
                class="evidence-item-row"
              >
                <div class="evidence-item-label">
                  <Icon :icon="item.icon" width="14" height="14" />
                  <span class="font-medium">{{ item.label }}</span>
                </div>
                <div class="evidence-item-value" :class="{ 'font-mono': item.mono }">{{ item.value }}</div>
              </div>
            </template>
            <div v-else class="evidence-empty-box">
              <Icon icon="fluent:folder-open-20-regular" width="22" height="22" />
              <div class="evidence-empty-title font-medium">{{ $t('auditEvidenceChainEmpty') }}</div>
              <div class="evidence-empty-desc text-muted">{{ $t('auditEvidenceChainEmptyHint') }}</div>
            </div>
          </div>
        </section>

        <!-- 模块 F: 相似案例处置参照 (后端未提供同类裁决统计接口，诚实空态，不伪造数据) -->
        <section id="chapter-similar" class="dossier-card">
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:branch-compare-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionSimilar') }}</span>
            </div>
          </div>

          <div class="evidence-empty-box">
            <Icon icon="fluent:branch-compare-20-regular" width="22" height="22" />
            <div class="evidence-empty-title font-medium">{{ $t('auditSimilarCasesUnavailable') }}</div>
          </div>
        </section>
      </div>

      <!-- 4. 裁决 Tab (裁决工作台 / 处置台账存证) -->
      <div v-show="activeTab === 'decision'" class="tab-pane-container">
        <!-- 模块 H: 裁决工作台 (仅在可处理状态展示，参观者仅呈现处置台账) -->
        <section
          v-if="!isVisitor && !adjudicationContext.isReadOnly"
          id="chapter-decision"
          class="dossier-card adjudication-workbench-card"
        >
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:gavel-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionDecision') }}</span>
            </div>
            <div class="title-right">
              <el-tag size="small" :type="adjudicationContext.scenarioBadgeTone" effect="plain" class="scenario-badge">
                {{ adjudicationContext.scenarioBadge }}
              </el-tag>
            </div>
          </div>

          <div class="decision-compact-panel">
            <!-- A. 当前审核类型与主体措施摘要 -->
            <div class="decision-target-bar">
              <div class="target-bar-left">
                <span class="target-account-label text-muted">{{ $t('auditDecisionTargetAccountLabel') }}:</span>
                <span class="target-account-val font-mono font-medium">{{ selectedRow.email }}</span>
                <span class="target-scope-note text-muted">({{ targetScopeDescription }})</span>
              </div>
              <div class="target-bar-right">
                <span class="measure-label text-muted">{{ $t('auditAccountMeasureLabel') }}:</span>
                <el-tag size="small" :type="adjudicationContext.currentMeasure.tagType" effect="light" class="measure-tag">
                  {{ adjudicationContext.currentMeasure.label }}
                </el-tag>
              </div>
            </div>

            <!-- B. 有依据的推荐方案 -->
            <div class="grounded-recommendation-card" :class="{ 'has-rec': adjudicationContext.recommendation.hasRecommendation }">
              <div class="rec-header">
                <div class="rec-title-wrap">
                  <Icon icon="fluent:lightbulb-filament-20-regular" width="16" height="16" class="rec-icon" />
                  <span class="rec-section-title font-medium">{{ $t('auditRecSectionTitle') }}</span>
                </div>
                <template v-if="adjudicationContext.recommendation.hasRecommendation">
                  <button
                    type="button"
                    class="btn-adopt-rec"
                    :disabled="selectedVerdict === adjudicationContext.recommendation.actionKey"
                    @click="adoptRecommendation(adjudicationContext.recommendation.actionKey)"
                  >
                    <Icon icon="fluent:arrow-circle-down-right-16-regular" width="14" height="14" />
                    <span>{{ selectedVerdict === adjudicationContext.recommendation.actionKey ? $t('auditRecAdopted') : $t('auditRecAdoptBtn') }}</span>
                  </button>
                </template>
              </div>
              <div class="rec-body">
                <template v-if="adjudicationContext.recommendation.hasRecommendation">
                  <div class="rec-action-row">
                    <span class="rec-label text-muted">{{ $t('auditRecActionLabel') }}:</span>
                    <span class="rec-action-name font-medium">{{ adjudicationContext.recommendation.actionLabel }}</span>
                  </div>
                  <div class="rec-meta-row">
                    <span class="rec-label text-muted">{{ $t('auditRecBasisLabel') }}:</span>
                    <span class="rec-meta-val">{{ adjudicationContext.recommendation.basisText }}</span>
                  </div>
                  <div v-if="adjudicationContext.recommendation.prerequisite" class="rec-meta-row">
                    <span class="rec-label text-muted">{{ $t('auditRecPrereqLabel') }}:</span>
                    <span class="rec-meta-val text-muted">{{ adjudicationContext.recommendation.prerequisite }}</span>
                  </div>
                </template>
                <template v-else>
                  <div class="rec-none-wrap text-muted">
                    <span>{{ adjudicationContext.recommendation.basisText }}</span>
                  </div>
                </template>
              </div>
            </div>

            <!-- C. 当前场景允许的裁决选项 (紧凑单选列表，默认不预选) -->
            <div class="verdict-compact-group" role="radiogroup">
              <div
                v-for="opt in verdictOptions"
                :key="opt.key"
                role="radio"
                tabindex="0"
                :aria-checked="selectedVerdict === opt.key"
                class="verdict-compact-option"
                :class="[
                  `tone-${opt.tone}`,
                  {
                    'is-selected': selectedVerdict === opt.key,
                    'is-destructive': opt.isDestructive
                  }
                ]"
                @click="selectVerdictOption(opt.key)"
                @keydown.enter.prevent="selectVerdictOption(opt.key)"
                @keydown.space.prevent="selectVerdictOption(opt.key)"
              >
                <div class="opt-main-line">
                  <span class="radio-indicator" :class="{ 'checked': selectedVerdict === opt.key }"></span>
                  <Icon :icon="opt.icon" width="15" height="15" class="verdict-opt-icon" />
                  <span class="verdict-opt-label font-medium">{{ opt.label }}</span>
                  <span class="verdict-opt-sub font-normal text-muted">{{ opt.resultDesc }}</span>
                </div>
              </div>
            </div>

            <!-- D. 当前选项影响说明 -->
            <div class="verdict-impact-bar">
              <template v-if="selectedVerdictMeta">
                <span class="impact-lead font-medium">{{ $t('auditVerdictImpactLabel') }}:</span>
                <span class="impact-body">{{ selectedVerdictMeta.capabilityDesc }}</span>
              </template>
              <template v-else>
                <span class="impact-hint text-muted">{{ $t('auditVerdictNoDefaultHint') }}</span>
              </template>
            </div>

            <!-- E. 内部批注 (输入框、快捷词、说明仅管理员可见) -->
            <div class="decision-notes-section">
              <div class="notes-head">
                <span class="notes-label font-medium">{{ $t('auditAdjudicationNotes') }}</span>
                <span class="notes-scope-tip text-muted">（{{ $t('auditInternalOnlyBadge') }}）</span>
              </div>
              <el-input
                v-model="internalDecisionNotes"
                type="textarea"
                :rows="2"
                :placeholder="$t('auditAdjudicationPlaceholder')"
                class="decision-textarea"
              />
              <div class="quick-notes-presets">
                <span class="quick-label text-muted">{{ $t('auditQuickNotesLabel') }}:</span>
                <button type="button" class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset1'))">{{ $t('auditQuickNotePreset1') }}</button>
                <button type="button" class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset2'))">{{ $t('auditQuickNotePreset2') }}</button>
                <button type="button" class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset3'))">{{ $t('auditQuickNotePreset3') }}</button>
                <button type="button" class="preset-chip" @click="applyPresetNote($t('auditQuickNotePreset4'))">{{ $t('auditQuickNotePreset4') }}</button>
              </div>
            </div>

            <!-- F. 用户通知摘要与预览入口 -->
            <div class="decision-notice-bar">
              <div class="notice-info">
                <span class="notice-title font-medium">{{ $t('auditStep4NotificationPreviewTitle') }}</span>
                <span class="notice-status-tag font-mono">({{ $t('auditPreviewStatusNotConnected') }})</span>
                <span v-if="selectedVerdictMeta && publicNotificationPreview" class="notice-subject-preview text-muted">
                  · {{ publicNotificationPreview.subject }}
                </span>
              </div>
              <div class="notice-actions">
                <el-button
                  ref="previewNoticeBtnRef"
                  size="small"
                  class="btn-preview-notice"
                  :disabled="!selectedVerdict || !publicNotificationPreview"
                  @click="noticeModalVisible = true"
                >
                  <Icon icon="fluent:mail-preview-20-regular" width="14" height="14" style="margin-right: 4px;" />
                  <span>{{ $t('auditBtnPreviewNotice') }}</span>
                </el-button>
              </div>
            </div>

            <!-- G. 操作区 (单一主要“确认所选裁决”入口，按钮文字与所选动作同步) -->
            <div class="decision-submit-row">
              <el-button
                type="primary"
                class="btn-submit-verdict"
                :disabled="!selectedVerdict || !canAdjudicatePerm || actionLoading || adjudicationContext.isReadOnly"
                :loading="actionLoading"
                @click="submitSelectedVerdict"
              >
                <Icon icon="fluent:gavel-20-regular" width="15" height="15" style="margin-right: 6px;" />
                <span>{{ submitButtonLabel }}</span>
              </el-button>

              <span v-if="adjudicationContext.cannotExecuteReason" class="submit-hint text-danger">
                {{ adjudicationContext.cannotExecuteReason }}
              </span>
              <span v-else-if="!selectedVerdict" class="submit-hint text-muted">
                {{ $t('auditSubmitDisabledNoVerdict') }}
              </span>
            </div>
          </div>
        </section>

        <!-- 模块 I: 处置台账合规存证 (已结案或上下文不足纯只读专用) -->
        <section
          v-if="adjudicationContext.isReadOnly"
          id="chapter-ledger"
          class="dossier-card readonly-ledger-card"
        >
          <div class="section-title">
            <div class="title-left">
              <Icon icon="fluent:book-database-20-regular" width="18" height="18" />
              <span>{{ $t('auditSectionLedger') }}</span>
            </div>
            <div class="title-right">
              <el-tag size="small" type="info" effect="plain" class="scenario-badge">
                {{ adjudicationContext.scenarioBadge }}
              </el-tag>
            </div>
          </div>

          <div class="sanction-ledger-banner">
            <Icon icon="fluent:shield-checkmark-20-filled" width="20" height="20" class="banner-icon" />
            <div class="banner-text-box">
              <span class="banner-title font-medium">{{ adjudicationContext.cannotExecuteReason || $t('auditSanctionPureNotice') }}</span>
              <span class="banner-sub text-muted font-mono">{{ $t('auditArchiveReadOnlyNote') }}</span>
            </div>
          </div>

          <div v-if="selectedRow.status === 'unbanned'" class="unbanned-archive-badge">
            <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
            <span>{{ $t('auditStatusUnbannedRecord') }}</span>
          </div>
        </section>
      </div>

    </div>

    <!-- 底部操作栏 -->
    <template #footer>
      <div class="drawer-footer-actions">
        <!-- 通用关闭按钮 -->
        <div class="footer-left">
          <el-button @click="handleClose">{{ $t('close') }}</el-button>
        </div>

        <!-- 可处理变体专用动作 (仅管理员呈现操作按钮，参观者仅保留关闭) -->
        <div class="footer-right" v-if="!isVisitor">
          <template v-if="selectedRow">
            <!-- 延期 -->
            <el-button
              v-if="isAdjudicationAvailable && canExtend"
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
              v-if="isAdjudicationAvailable"
              type="info"
              plain
              :loading="actionLoading"
              @click="emit('note', selectedRow)"
            >
              <Icon icon="fluent:note-edit-20-regular" width="14" height="14" style="margin-right: 4px;" />
              <span>{{ $t('auditBtnNote') }}</span>
            </el-button>

            <!-- 解封 / 重新封禁 (根据账号当前状态与权限精确控制，首次待审不出现重新封禁) -->
            <template v-if="isAdjudicationAvailable">
              <el-button
                v-if="canShowUnbanBtn"
                type="success"
                plain
                :loading="actionLoading"
                @click="emit('toggleBan', selectedRow)"
              >
                <Icon icon="fluent:lock-open-16-regular" width="14" height="14" style="margin-right: 4px;" />
                <span>{{ $t('auditBtnUnban') }}</span>
              </el-button>
              <el-button
                v-else-if="canShowRebanBtn"
                type="danger"
                plain
                :loading="actionLoading"
                @click="emit('toggleBan', selectedRow)"
              >
                <Icon icon="fluent:prohibited-16-regular" width="14" height="14" style="margin-right: 4px;" />
                <span>{{ $t('auditBtnReban') }}</span>
              </el-button>
            </template>

            <!-- 裁决处理主入口 (仅在非裁决 Tab 且具备裁决权限时展示) -->
            <el-button
              v-if="isAdjudicationAvailable && activeTab !== 'decision'"
              type="primary"
              class="btn-adjudicate-entry"
              @click="handleTabChange('decision')"
            >
              <Icon icon="fluent:gavel-20-regular" width="15" height="15" style="margin-right: 4px;" />
              <span>{{ $t('auditActionAdjudicate') }}</span>
            </el-button>
          </template>
        </div>
      </div>
    </template>

    <!-- 用户通知预览模态浮层 (按需查看，不占长卷，无障碍 Esc/关闭，严格脱敏) -->
    <el-dialog
      v-model="noticeModalVisible"
      :title="$t('auditStep4NotificationPreviewTitle')"
      width="580px"
      align-center
      destroy-on-close
      append-to-body
      class="notice-preview-dialog"
      @closed="handleNoticeDialogClosed"
    >
      <div v-if="publicNotificationPreview" class="notice-dialog-body">
        <div class="notice-redaction-tip text-muted">
          {{ $t('auditPreviewRedactionPolicyNote') }}
        </div>
        <div class="notice-dialog-table">
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldSender') }}:</span>
            <span class="dk-val font-mono">{{ publicNotificationPreview.sender }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldRecipient') }}:</span>
            <span class="dk-val font-mono font-medium">{{ publicNotificationPreview.recipient }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldSubject') }}:</span>
            <span class="dk-val font-medium">{{ publicNotificationPreview.subject }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldDecisionReason') }}:</span>
            <span class="dk-val">{{ publicNotificationPreview.decisionSummary }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldEffective') }}:</span>
            <span class="dk-val">{{ publicNotificationPreview.effectiveCondition }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldCapabilities') }}:</span>
            <span class="dk-val">{{ publicNotificationPreview.affectedCapabilities }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldAppealPath') }}:</span>
            <span class="dk-val">{{ publicNotificationPreview.appealPath }}</span>
          </div>
          <div class="dialog-kv-row">
            <span class="dk-label">{{ $t('auditPreviewFieldDeliveryStatus') }}:</span>
            <span class="dk-val reachability-note-text">{{ publicNotificationPreview.reachabilityNote }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="noticeModalVisible = false">{{ $t('close') }}</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@iconify/vue';
import { tzDayjs } from '@/utils/day.js';
import { hasPerm } from '@/perm/perm.js';
import { useUserStore } from '@/store/user.js';
import { parseCaseDeepLink, normalizeCaseTab } from '@/router/account-history.js';
import {
  evaluateAdjudicationContext,
  buildScenarioNotificationPreview,
  SCENARIO_TYPES
} from '../utils/adjudication-engine.js';

const userStore = useUserStore();
const isVisitor = computed(() => {
  const user = userStore.user;
  if (!user) return true;
  const roleCode = (user.role?.roleCode || user.role?.key || '').toLowerCase().trim();
  const roleName = (user.role?.name || '').trim();
  const permKeys = Array.isArray(user?.permKeys) ? user.permKeys : [];
  if (roleCode === 'visitor' || roleName === '参观者') return true;
  if (roleCode === 'master' || roleCode === 'admin' || roleName === '站长' || user.email === 'admin@epomail.bond' || permKeys.includes('*')) {
    return false;
  }
  if (roleCode === 'moderator' || roleName.includes('协管') || roleName.includes('管理')) {
    return false;
  }
  return true;
});

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
  initialTab: {
    type: String,
    default: ''
  },
  actionLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'update:modelValue',
  'tab-change',
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

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);
const handleWindowResize = () => {
  if (typeof window !== 'undefined') {
    windowWidth.value = window.innerWidth;
  }
};

function getInitialTabFromHash() {
  try {
    const parsed = parseCaseDeepLink(window.location);
    if (parsed.isCaseLink) {
      return parsed.tab;
    }
  } catch (e) {}
  if (props.initialTab) {
    return normalizeCaseTab(props.initialTab);
  }
  return 'overview';
}

function handleWindowHashChange() {
  if (visible.value) {
    const tab = getInitialTabFromHash();
    if (tab && activeTab.value !== tab) {
      activeTab.value = tab;
      emit('tab-change', tab);
    }
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('hashchange', handleWindowHashChange);
    window.addEventListener('popstate', handleWindowHashChange);
    window.addEventListener('keydown', handleGlobalKeydown, true);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('hashchange', handleWindowHashChange);
    window.removeEventListener('popstate', handleWindowHashChange);
    window.removeEventListener('keydown', handleGlobalKeydown, true);
  }
});

const drawerSize = computed(() => {
  const w = windowWidth.value;
  if (w <= 768) return '100%';
  if (w < 800) return `${Math.min(760, w)}px`;
  // 桌面默认固定 760 CSS px，绝不扩张到 960 或 1080px
  return '760px';
});

// 当前激活的变体 (1: 滥用威胁, 2: 审计申诉, 3: 风控预警, 4: 封禁记录/处置台账)
const activeVariant = ref(1);
const activeTab = ref(getInitialTabFromHash());
const activeChapter = ref('summary');
const scrollContainerRef = ref(null);
const internalDecisionNotes = ref('');
const selectedVerdict = ref('');
const draftNotesByCaseMap = ref({});
const selectedVerdictByCaseMap = ref({});
const isJudgmentLogsCollapsed = ref(true);

function getCaseKey(row = props.selectedRow) {
  if (!row) return '';
  return String(row.ticketId || row.id || '');
}

watch(internalDecisionNotes, (val) => {
  const key = getCaseKey();
  if (key) {
    draftNotesByCaseMap.value[key] = val;
  }
});

watch(selectedVerdict, (val) => {
  const key = getCaseKey();
  if (key) {
    selectedVerdictByCaseMap.value[key] = val;
  }
});

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
  () => [props.modelValue, props.selectedRow, props.section, props.initialTab],
  ([newVal, newRow, , newInitTab], oldValues) => {
    const [oldVal, oldRow, , oldInitTab] = oldValues || [];
    if (newVal) {
      activeVariant.value = computeDefaultVariant();
      const newCaseKey = getCaseKey(newRow);
      const oldCaseKey = getCaseKey(oldRow);
      const isNewCase = !oldRow || (newCaseKey !== oldCaseKey);
      if (isNewCase || !oldVal) {
        const resolvedTab = getInitialTabFromHash();
        activeTab.value = resolvedTab;
        emit('tab-change', resolvedTab);
        if (isNewCase) {
          isJudgmentLogsCollapsed.value = true;
        }
        if (newCaseKey && Object.prototype.hasOwnProperty.call(draftNotesByCaseMap.value, newCaseKey)) {
          internalDecisionNotes.value = draftNotesByCaseMap.value[newCaseKey];
        } else {
          internalDecisionNotes.value = '';
        }
        if (newCaseKey && Object.prototype.hasOwnProperty.call(selectedVerdictByCaseMap.value, newCaseKey)) {
          selectedVerdict.value = selectedVerdictByCaseMap.value[newCaseKey];
        } else {
          selectedVerdict.value = '';
        }
      } else if (newInitTab && newInitTab !== oldInitTab) {
        const resolvedTab = normalizeCaseTab(newInitTab);
        activeTab.value = resolvedTab;
      }
    }
  },
  { immediate: true }
);

watch(
  () => [visible.value, isVisitor.value],
  ([v, vis]) => {
    if (v && vis && ['investigation', 'evidence'].includes(activeTab.value)) {
      activeTab.value = 'overview';
    }
  }
);

function handleTabChange(tabName) {
  const resolved = normalizeCaseTab(tabName);
  activeTab.value = resolved;
  emit('tab-change', resolved);
  syncDeepLink(resolved, { push: true });
}

function handleClose() {
  activeIdentityPopoverIndex.value = -1;
  visible.value = false;
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

// 是否可进行裁决与写操作 (根据裁决上下文是否只读决定，已结案台账绝对只读)
const isAdjudicationAvailable = computed(() => {
  return !adjudicationContext.value?.isReadOnly;
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

// 状态与分类元信息：优先匹配传入的明确终态 (如关联账号的 banned/unbanned)，避免被主案件 circuitStatus 误覆盖
function getStatusTagType(status) {
  switch (status) {
    case 'banned': return 'danger';
    case 'unbanned': return 'success';
    case 'watching': return 'info';
    case 'resolved': return 'success';
    case 'expired': return 'info';
    case 'rejected': return 'danger';
  }
  if (status === 'active' || status === 'pending' || props.selectedRow?.circuitStatus === 'QUEUE_PAUSE' || props.selectedRow?.circuitStatus === 'TRIPPED') {
    return 'warning';
  }
  return 'primary';
}

function getStatusLabel(status) {
  switch (status) {
    case 'banned': return t('auditStatusBannedActive');
    case 'unbanned': return t('auditStatusUnbannedRecord');
    case 'watching': return t('auditStatusWatching');
    case 'resolved': return t('auditCaseStatusResolved');
    case 'expired': return t('auditCaseStatusExpired');
    case 'rejected': return t('auditStatusRejectedAppeal');
  }
  if (status === 'active' || status === 'pending' || props.selectedRow?.circuitStatus === 'QUEUE_PAUSE' || props.selectedRow?.circuitStatus === 'TRIPPED') {
    return t('abuseStatusPending') || '待审';
  }
  return status || '-';
}

// 拍案管理直接展示名称，与列表完全对照
const authorityValue = computed(() => {
  const r = props.selectedRow;
  if (!r) return null;
  return r.adjudicatorName || r.adjudicator || r.authority || r.operator || r.assignee || 'SecAdmin';
});

// 证据留存天数 (真实剩余天数，未采集时展示破折号)
const evidenceDaysFormatted = computed(() => {
  const r = props.selectedRow;
  const days = r?.evidenceExpiresDays;
  return (days === undefined || days === null) ? '—' : t('auditEvidenceRetentionDays', { days });
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
  } else {
    list.push({ id: 'ledger', label: t('auditChipLedger'), icon: 'fluent:book-database-16-regular' });
  }

  return list;
});

function scrollToChapter(chapterId) {
  if (['summary', 'basis', 'cluster'].includes(chapterId)) {
    activeTab.value = 'overview';
  } else if (['timeline', 'risk', 'judgment-path'].includes(chapterId)) {
    activeTab.value = 'investigation';
  } else if (['similar', 'chain'].includes(chapterId)) {
    activeTab.value = 'evidence';
  } else if (['decision', 'ledger'].includes(chapterId)) {
    activeTab.value = 'decision';
  } else if (['overview', 'investigation', 'evidence'].includes(chapterId)) {
    activeTab.value = chapterId;
  }
  activeChapter.value = chapterId;
  syncDeepLink(activeTab.value);

  nextTick(() => {
    try {
      const targetId = chapterId.startsWith('chapter-') ? chapterId : `chapter-${chapterId}`;
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {}
  });
}

function handleBodyScroll() {
  // Tabs provide true content isolation, scroll tracking across tabs is no longer required
}

// 模块 B: 集群关联账号数据 (仅使用服务端真实返回的关联账号)
const clusterAccountsList = computed(() => {
  const accounts = props.selectedRow?.clusterAccounts;
  return Array.isArray(accounts) ? accounts : [];
});

// 模块 C: 风险研判与处置依据 (仅展示数据库中已记录的事实)
const currentAlarmReason = computed(() => {
  const r = props.selectedRow;
  return r?.banReason || r?.appealReason || r?.detailText || '';
});

const currentTriggerTag = computed(() => {
  const r = props.selectedRow;
  return r?.eventType || r?.reasonCode || '';
});

const currentTriggerBadgeType = computed(() => {
  const r = props.selectedRow;
  if (r?.riskLevel === 'high' || r?.priority === 'P0' || r?.priority === 'CRITICAL') return 'danger';
  if (r?.riskLevel === 'medium' || r?.priority === 'P1') return 'warning';
  return 'info';
});

const currentTriggerCause = computed(() => {
  return props.selectedRow?.detailText || '';
});

const currentSuggestionTag = computed(() => {
  return props.selectedRow?.recommendedAction || '';
});

const currentSuggestionBadgeType = computed(() => {
  const status = props.selectedRow?.status;
  if (status === 'banned' || status === 'rejected') return 'danger';
  if (status === 'resolved' || status === 'unbanned') return 'success';
  return 'warning';
});

const currentSuggestionText = computed(() => {
  return '';
});

// 模块 C: 研判路径记录列表 (仅由数据库记录的真实 timeline 派生)
const recordedTimelineNodes = computed(() => {
  const raw = props.selectedRow?.timeline;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const actor = typeof entry?.actor === 'string' ? entry.actor : '';
    const event = typeof entry?.event === 'string' ? entry.event : '';
    return {
      lane: /admin|master|secadmin|moderator|user|人工|用户|管理员/i.test(actor) ? 'human' : 'machine',
      time: entry?.time ? formatTime(entry.time) : '',
      actor,
      nodeId: `N${index + 1}`,
      action: event,
      desc: typeof entry?.detail === 'string' ? entry.detail : event,
      transition: entry?.from || entry?.to ? { from: entry.from || '', to: entry.to || '' } : null,
      hash: typeof entry?.hash === 'string' ? entry.hash : null,
      isLatest: index === raw.length - 1
    };
  });
});

const currentJudgmentLogs = computed(() => {
  return recordedTimelineNodes.value.map(node => ({
    tag: node.action || '事件',
    tagType: 'info',
    content: [node.time, node.actor ? `${node.actor}：` : '', node.desc].filter(Boolean).join(' ')
  }));
});

// 模块 D: 处置与存证全周期时间线节点 (仅使用真实 timeline)
const currentTimelineNodes = computed(() => recordedTimelineNodes.value);

// 模块 E: 多维风险画像数据 (未采集的维度保持空集合)
const currentRiskProfile = computed(() => {
  const r = props.selectedRow;
  return {
    compositeScore: r?.matchScore ?? null,
    mainDriver: r?.reportReason || r?.evidenceSummary || '',
    dimensions: [],
    metrics: []
  };
});

// 模块 F: 相似案例处置参照 (后端未提供同类裁决统计，界面仅呈现诚实空态)

// 模块 G: 证据链溯源 —— 仅由数据库真实字段派生证据清单，绝不编造哈希或统计
const EVENT_TYPE_LABEL_KEYS = {
  multi_account_ban: 'auditEventTypeMultiAccountBan',
  multi_account_detected: 'auditEventTypeMultiAccountDetected',
  risk_spike: 'auditEventTypeRiskSpike',
  user_reported: 'auditEventTypeUserReported',
  appeal_submitted: 'auditEventTypeAppealSubmitted',
  auto_ban: 'auditEventTypeAutoBan',
  credential_tamper_ban: 'auditEventTypeCredentialTamper',
  outbound_rate: 'auditEventTypeOutboundRate',
  ip_roaming_routine: 'auditEventTypeIpRoaming',
  bot_probe_routine: 'auditEventTypeBotProbe',
  baseline_sample: 'auditEventTypeBaselineSample',
  device_shift_routine: 'auditEventTypeDeviceShift'
};

const RECOMMENDED_ACTION_LABEL_KEYS = {
  ban_account: 'auditActionBanAccount',
  temp_ban_24h: 'auditActionTempBan24h',
  mute_account: 'auditActionMuteAccount',
  blacklist_sender: 'auditActionBlacklistSender',
  blacklist_ip: 'auditActionBlacklistIp',
  approve_appeal: 'auditActionApproveAppeal',
  reject_appeal: 'auditActionRejectAppeal',
  archive_routine: 'auditActionArchiveRoutine',
  none: 'auditActionNone'
};

function eventTypeLabel(value) {
  if (!value) return '';
  const key = EVENT_TYPE_LABEL_KEYS[String(value)];
  return key ? t(key) : String(value);
}

function recommendedActionLabel(value) {
  if (!value) return '';
  const key = RECOMMENDED_ACTION_LABEL_KEYS[String(value)];
  return key ? t(key) : String(value);
}

const triggerTagDisplay = computed(() => {
  const r = props.selectedRow;
  if (!r) return '';
  if (r.eventType) return eventTypeLabel(r.eventType);
  return r.reasonCode || '';
});

const evidenceItems = computed(() => {
  const r = props.selectedRow;
  if (!r) return [];
  const items = [];
  const eventLabel = eventTypeLabel(r.eventType);
  if (eventLabel) {
    items.push({ icon: 'fluent:flash-16-regular', label: t('auditEvidenceItemEvent'), value: eventLabel });
  }
  const alarmReason = r.reportReason || r.banReason || r.appealReason;
  if (alarmReason) {
    items.push({ icon: 'fluent:shield-alert-16-regular', label: t('auditAlarmReasonLabel'), value: alarmReason });
  }
  if (r.detailText) {
    items.push({ icon: 'fluent:text-description-16-regular', label: t('auditEvidenceItemDetail'), value: r.detailText });
  }
  if (r.evidenceSummary) {
    items.push({ icon: 'fluent:document-bullet-list-16-regular', label: t('auditEvidenceItemSummary'), value: r.evidenceSummary });
  }
  const network = [r.ip, r.baseGeo || r.geo].filter(Boolean).join(' · ');
  if (network) {
    items.push({ icon: 'fluent:globe-16-regular', label: t('auditEvidenceItemNetwork'), value: network, mono: true });
  }
  const device = [r.device || r.baseDevice, r.fingerprint || r.baseFingerprint].filter(Boolean).join(' · ');
  if (device) {
    items.push({ icon: 'fluent:desktop-16-regular', label: t('auditEvidenceItemDevice'), value: device, mono: true });
  }
  if (Array.isArray(r.clusterAccounts) && r.clusterAccounts.length > 0) {
    items.push({
      icon: 'fluent:people-community-16-regular',
      label: t('auditClusterAccountsTitle'),
      value: t('auditClusterAccountsCount', { count: r.clusterAccounts.length })
    });
  }
  if (r.alarmCount !== undefined && r.alarmCount !== null && Number(r.alarmCount) > 0) {
    items.push({ icon: 'fluent:alert-16-regular', label: t('auditColAlarmCount'), value: String(r.alarmCount) });
  }
  if (r.evidenceExpiresDays !== undefined && r.evidenceExpiresDays !== null) {
    items.push({
      icon: 'fluent:timer-16-regular',
      label: t('abuseEvidenceRetentionLabel'),
      value: t('auditEvidenceRetentionDays', { days: r.evidenceExpiresDays }),
      mono: true
    });
  }
  return items;
});

// 多维风险画像评分分级 (依据 matchScore 真实评分着色，未采集时保持中性)
const riskScoreLevelClass = computed(() => {
  const score = Number(props.selectedRow?.matchScore);
  if (!Number.isFinite(score)) return '';
  if (score >= 70) return 'score-danger';
  if (score >= 40) return 'score-warning';
  return 'score-success';
});

// 遥测指标对比行 (后端未采集结构化指标时保持空集合，由空态接管展示)
const enrichedRiskMetrics = computed(() => []);

const canAdjudicatePerm = computed(() => hasPerm('setting:set'));

const targetScopeDescription = computed(() => {
  const email = props.selectedRow?.email || '-';
  const count = clusterAccountsList.value?.length || 0;
  if (isThreatVariant.value && count > 0) {
    return t('auditDecisionScopeClusterNotice', { email, count });
  }
  return t('auditDecisionScopeSingleNotice', { email });
});

// 纯函数计算当前案件的裁决上下文（包含场景判定、限制措施、依据推荐、可用选项与只读原因）
const adjudicationContext = computed(() => {
  return evaluateAdjudicationContext(props.selectedRow, {
    t,
    canAdjudicatePerm: canAdjudicatePerm.value
  });
});

// 当前场景允许展示的裁决选项（绝不与所有案件共享固定选项，无申诉时严禁出现驳回申诉/申诉放行）
const verdictOptions = computed(() => {
  return adjudicationContext.value.availableVerdicts;
});

const selectedVerdictMeta = computed(() => {
  return verdictOptions.value.find(o => o.key === selectedVerdict.value) || null;
});

function selectVerdictOption(key) {
  selectedVerdict.value = key;
}

// 采纳有依据的推荐方案（仅能采纳当前场景允许的动作，不自动提交）
function adoptRecommendation(actionKey) {
  if (!actionKey) return;
  const match = verdictOptions.value.find(o => o.key === actionKey);
  if (match) {
    selectedVerdict.value = match.key;
  }
}

// 提交按钮文案随当前选中动作动态变化（如“确认违规封禁”、“确认不予处罚”）
const submitButtonLabel = computed(() => {
  if (selectedVerdictMeta.value?.submitBtnText) {
    return selectedVerdictMeta.value.submitBtnText;
  }
  return t('auditSubmitPrimaryBtn') || '确认并提交裁决';
});

// 底部操作栏状态与权限守卫：仅已封禁展示解封，仅已解封展示重新封禁，首次待审严禁展示重新封禁
const canShowUnbanBtn = computed(() => {
  return props.selectedRow?.status === 'banned' && canAdjudicatePerm.value;
});

const canShowRebanBtn = computed(() => {
  return props.selectedRow?.status === 'unbanned' && canAdjudicatePerm.value;
});

// 案件切换或场景发生变化时，若已选选项不在当前合法选项集中，立即清空重置
watch(
  () => [props.selectedRow, adjudicationContext.value?.scenario],
  () => {
    const availableKeys = verdictOptions.value.map(o => o.key);
    if (selectedVerdict.value && !availableKeys.includes(selectedVerdict.value)) {
      selectedVerdict.value = '';
    }
  }
);

const noticeModalVisible = ref(false);
const activeIdentityPopoverIndex = ref(-1);
const popoverRefs = ref({});
const identityBtnRefs = ref({});
const previewNoticeBtnRef = ref(null);

function setPopoverRef(el, idx) {
  if (el) popoverRefs.value[idx] = el;
}

function setIdentityBtnRef(el, idx) {
  if (el) identityBtnRefs.value[idx] = el;
}

function handleGlobalKeydown(e) {
  if (e.key === 'Escape' || e.keyCode === 27) {
    const activePopover = typeof document !== 'undefined'
      ? document.querySelector('.account-identity-popover[aria-hidden="false"]')
      : null;
    if (activePopover) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      Object.keys(popoverRefs.value).forEach(idx => {
        try {
          popoverRefs.value[idx]?.hide?.();
        } catch (_) {}
      });
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const triggerBtn = document.querySelector('.record-action .view-identity-btn:focus') ||
        document.querySelector('.record-action .view-identity-btn');
      if (triggerBtn) {
        triggerBtn.focus();
      }
      return;
    }

    if (noticeModalVisible.value) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      noticeModalVisible.value = false;
      nextTick(() => {
        previewNoticeBtnRef.value?.$el?.focus?.() || previewNoticeBtnRef.value?.focus?.();
      });
      return;
    }

    if (visible.value) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleClose();
      return;
    }
  }
}

function handleNoticeDialogClosed() {
  nextTick(() => {
    previewNoticeBtnRef.value?.$el?.focus?.() || previewNoticeBtnRef.value?.focus?.();
  });
}

// 动态构建符合当前场景与选项的用户通知摘要与预览
const publicNotificationPreview = computed(() => {
  return buildScenarioNotificationPreview({
    row: props.selectedRow,
    scenario: adjudicationContext.value.scenario,
    verdictMeta: selectedVerdictMeta.value,
    caseNumber: caseNumber.value,
    t
  });
});

async function submitSelectedVerdict() {
  if (!selectedVerdict.value || !canAdjudicatePerm.value || props.actionLoading || adjudicationContext.value.isReadOnly) return;
  const meta = selectedVerdictMeta.value;
  if (!meta) return;
  await confirmAndExecuteVerdict(meta.apiAction || meta.key, meta.label);
}

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

function syncDeepLink(tab, options = {}) {
  const r = props.selectedRow;
  if (!r || !visible.value) return;
  const cNo = r.ticketId || r.id;
  const chap = normalizeCaseTab(tab || activeTab.value);
  try {
    const newHash = `#case=${cNo}:${chap}`;
    if (window.location.hash !== newHash) {
      const nextUrl = `${window.location.pathname}${window.location.search}${newHash}`;
      if (options.push) {
        window.history.pushState(window.history.state || {}, '', nextUrl);
      } else {
        window.history.replaceState(window.history.state || {}, '', nextUrl);
      }
    }
  } catch (e) {}
}

function handleDrawerOpened() {
  try {
    const parsed = parseCaseDeepLink(window.location);
    if (parsed.isCaseLink) {
      if (parsed.tab && activeTab.value !== parsed.tab) {
        activeTab.value = parsed.tab;
        emit('tab-change', parsed.tab);
      }
      if (parsed.rawTab) {
        const rawLower = parsed.rawTab.toLowerCase();
        const subChapters = ['summary', 'basis', 'cluster', 'timeline', 'risk', 'judgment-path', 'similar', 'chain', 'ledger'];
        if (subChapters.includes(rawLower)) {
          scrollToChapter(rawLower);
          return;
        }
      }
    }
  } catch (e) {}
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
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    line-height: 1.3;
  }

  .header-case-badge {
    font-size: 11.5px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--el-fill-color);
    color: var(--el-text-color-regular);
    border: 1px solid var(--el-border-color-lighter);
  }

  .header-status-tag {
    font-size: 11px;
    height: 20px;
    padding: 0 6px;
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

/* 4 个内容 Tab 导航 (安静精致设计，清晰选中态) */
.drawer-tabs-wrapper {
  margin-top: 8px;
  width: 100%;

  :deep(.el-tabs__header) {
    margin: 0;
    border-bottom: none;
  }

  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background-color: var(--el-border-color-lighter);
  }

  :deep(.el-tabs__item) {
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-regular);
    padding: 0 16px;
    height: 36px;
    line-height: 36px;
    transition: color 0.2s;

    &:hover {
      color: var(--el-text-color-primary);
    }

    &.is-active {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }

  :deep(.el-tabs__active-bar) {
    background-color: var(--el-color-primary);
    height: 2px;
  }
}

/* 正文滚动区 */
.drawer-scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;

  .tab-pane-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    min-width: 0;
  }
}

/* 通用档案卡片 */
.dossier-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--el-bg-color);

  .collapse-toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--el-text-color-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    border-radius: 4px;
    margin-left: auto;
    transition: all 0.2s;

    &:hover {
      color: var(--el-text-color-primary);
      background: var(--el-fill-color-light);
    }
  }

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
      font-size: 11px;
      font-weight: 500;
      color: var(--el-text-color-secondary);
    }
  }
}

/* 模块 A: 案件概要两列网格 (紧凑稳定间距，自然换行) */
.dossier-grid-12 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 20px;
  align-items: baseline;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 8px 0;
  }

  .grid-field {
    display: flex;
    align-items: baseline;
    font-size: 12.5px;
    min-width: 0;
    gap: 6px;

    .field-k {
      color: var(--el-text-color-secondary);
      width: 76px;
      min-width: 76px;
      flex-shrink: 0;
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.1px;
    }

    .field-v {
      flex: 1;
      min-width: 0;
      color: var(--el-text-color-primary);
      word-break: break-all;
      white-space: normal;
      line-height: 1.45;
    }

    .field-v-with-copy {
      flex: 1;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      color: var(--el-text-color-primary);
      word-break: break-all;
      line-height: 1.45;

      .masked-text {
        word-break: break-all;
        white-space: normal;
      }
    }
  }
}

.reason-code-highlight {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.06);
  color: var(--el-color-danger);
  border: 1px solid rgba(239, 68, 68, 0.18);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.2px;
  width: fit-content;
}

.inline-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.7;
  transition: all 0.15s ease;

  &:hover {
    opacity: 1;
    background: var(--el-fill-color);
    color: var(--el-color-primary);
  }
}

/* 模块 B: 集群关联账号 (紧凑平面记录行，轻量分隔线，无多层嵌套卡片) */
.cluster-records-list {
  display: flex;
  flex-direction: column;
  font-size: 12.5px;

  .cluster-record-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    box-sizing: border-box;

    &:first-child {
      padding-top: 2px;
    }

    &:last-child {
      padding-bottom: 2px;
      border-bottom: none;
    }

    .record-idx {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      flex-shrink: 0;
      width: 24px;
    }

    .record-email {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      min-width: 175px;

      .account-email-val {
        font-size: 12.5px;
        color: var(--el-text-color-primary);
      }

      .inline-copy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          color: var(--el-color-primary);
          background: var(--el-fill-color-light);
        }
      }
    }

    .record-status {
      flex-shrink: 0;
      width: 95px;
    }

    .record-basis {
      flex: 1;
      min-width: 0;

      .basis-full-text {
        font-size: 12px;
        line-height: 1.45;
        color: var(--el-text-color-regular);
        word-break: break-word;
        white-space: normal;
      }
    }

    .record-action {
      flex-shrink: 0;

      .view-identity-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid var(--el-border-color-lighter);
        background: transparent;
        color: var(--el-text-color-secondary);
        font-size: 11.5px;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          color: var(--el-color-primary);
          border-color: var(--el-color-primary-light-5);
          background: var(--el-fill-color-light);
        }
      }
    }

    @media (max-width: 600px) {
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 6px 10px;

      .record-idx {
        order: 1;
      }
      .record-email {
        order: 2;
        flex: 1;
        min-width: 140px;
      }
      .record-status {
        order: 3;
        width: auto;
      }
      .record-action {
        order: 4;
      }
      .record-basis {
        order: 5;
        width: 100%;
        flex-basis: 100%;
        padding-top: 2px;
        padding-left: 24px;
      }
    }
  }
}

:deep(.account-identity-popover),
.account-identity-popover {
  padding: 10px 12px !important;

  .identity-popover-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;

    .popover-header {
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      padding-bottom: 4px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    .popover-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .popover-label {
        font-size: 11.5px;
        color: var(--el-text-color-secondary);
        width: 82px;
        flex-shrink: 0;
      }

      .popover-val {
        flex: 1;
        font-size: 12px;
        color: var(--el-text-color-primary);
        word-break: break-all;
      }

      .inline-copy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: 3px;
        background: transparent;
        color: var(--el-text-color-secondary);
        cursor: pointer;

        &:hover {
          color: var(--el-color-primary);
          background: var(--el-fill-color-light);
        }
      }
    }
  }
}

/* 模块 C: 风险研判与处置依据 */
.disposition-nested-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.basis-chain-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.02);
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-left: 3px solid var(--el-color-danger);

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
        font-weight: 500;
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
  padding: 10px 14px;
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);

  .record-box-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    padding-bottom: 7px;
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
        border-radius: 3px;
      }

      .record-text {
        color: var(--el-text-color-primary);
        word-break: break-all;
      }
    }
  }
}

/* 模块 D: 处置与存证全周期时间线 (桌面双泳道，窄屏纵向流保留明确人机角色标签) */
.dual-swimlane-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;

  .swimlane-column-headers {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
    align-items: center;
    margin-bottom: 10px;

    .swimlane-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;

      &.machine-header {
        grid-column: 1;
        color: var(--el-color-primary);
        background: rgba(59, 130, 246, 0.04);
        border: 1px solid rgba(59, 130, 246, 0.15);
      }
      &.human-header {
        grid-column: 3;
        color: #d97706;
        background: rgba(245, 158, 11, 0.04);
        border: 1px solid rgba(245, 158, 11, 0.18);
      }

      .header-text-short {
        display: none;
      }
    }

    .swimlane-header-spacer {
      grid-column: 2;
    }
  }

  .swimlane-grid-track {
    display: flex;
    flex-direction: column;
    gap: 0;

    .swimlane-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
      align-items: stretch;
      position: relative;
      padding-bottom: 14px;

      &:last-child {
        padding-bottom: 2px;
      }

      .swimlane-cell {
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        text-align: left;

        &.machine-cell {
          grid-column: 1;
        }

        &.human-cell {
          grid-column: 3;
        }

        .swimlane-placeholder {
          min-height: 1px;
        }

        .swimlane-event-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          border-radius: 6px;
          background: var(--el-fill-color-blank);
          border: 1px solid var(--el-border-color-lighter);
          text-align: left;
          transition: all 0.15s ease;

          &:hover {
            border-color: var(--el-border-color);
          }

          &.machine-event {
            border-left: 3px solid var(--el-color-primary);
          }

          &.human-event {
            border-left: 3px solid #f59e0b;
          }

          &.event-latest {
            border-color: rgba(239, 68, 68, 0.35);
          }

          .event-head-line {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 6px;
            flex-wrap: wrap;

            .event-title-group {
              display: flex;
              align-items: center;
              gap: 5px;
              flex-wrap: wrap;

              .event-lane-badge {
                display: none; /* 桌面双泳道已通过列头区分，窄屏启用 */
                align-items: center;
                gap: 3px;
                font-size: 10px;
                font-weight: 600;
                padding: 1px 5px;
                border-radius: 3px;
                line-height: 15px;

                &.badge-machine {
                  color: var(--el-color-primary);
                  background: rgba(59, 130, 246, 0.08);
                  border: 1px solid rgba(59, 130, 246, 0.2);
                }
                &.badge-human {
                  color: #d97706;
                  background: rgba(245, 158, 11, 0.08);
                  border: 1px solid rgba(245, 158, 11, 0.2);
                }
              }

              .event-action-title {
                font-size: 12.5px;
                font-weight: 600;
                color: var(--el-text-color-primary);
                line-height: 1.4;
              }

              .event-latest-badge {
                display: inline-flex;
                align-items: center;
                font-size: 9.5px;
                font-weight: 600;
                color: var(--el-color-danger);
                background: rgba(239, 68, 68, 0.08);
                border: 1px solid rgba(239, 68, 68, 0.2);
                padding: 0 4px;
                border-radius: 3px;
                line-height: 15px;
                height: 16px;
              }
            }

            .event-time-tag {
              font-size: 11px;
              color: var(--el-text-color-secondary);
              white-space: nowrap;
              flex-shrink: 0;
            }
          }

          .event-meta-line {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10.5px;
            color: var(--el-text-color-secondary);
            flex-wrap: wrap;

            .meta-actor {
              display: inline-flex;
              align-items: center;
              gap: 3px;
              font-weight: 500;

              &.actor-machine {
                color: var(--el-color-primary);
              }
              &.actor-human {
                color: #d97706;
              }
            }

            .meta-dot {
              color: var(--el-text-color-placeholder);
            }

            .meta-node-id {
              letter-spacing: 0.2px;
            }
          }

          .event-desc-line {
            font-size: 12px;
            line-height: 1.5;
            color: var(--el-text-color-regular);
            word-break: break-word;
            white-space: normal;
            margin-top: 1px;
          }

          .event-transition-hash-line {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 10.5px;
            flex-wrap: wrap;
            margin-top: 3px;

            .node-transition-inline {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              background: var(--el-fill-color-light);
              padding: 2px 6px;
              border-radius: 4px;
              border: 1px solid var(--el-border-color-lighter);

              .st-text {
                color: var(--el-text-color-secondary);
                font-size: 10.5px;

                &.st-to {
                  color: var(--el-color-danger);
                  font-weight: 600;
                }
              }

              .st-arrow {
                color: var(--el-text-color-placeholder);
              }
            }

            .node-hash-inline {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              color: var(--el-text-color-secondary);
              cursor: pointer;
              background: var(--el-fill-color-light);
              padding: 2px 6px;
              border-radius: 4px;
              border: 1px solid var(--el-border-color-lighter);
              transition: all 0.15s ease;

              &:hover {
                color: var(--el-color-primary);
                border-color: var(--el-color-primary-light-5);
                background: var(--el-color-primary-light-9);
              }

              .hash-label {
                font-weight: 600;
                font-size: 9.5px;
              }

              .hash-val {
                letter-spacing: 0.2px;
              }

              .inline-copy-btn {
                background: transparent;
                border: none;
                padding: 0;
                display: inline-flex;
                align-items: center;
                cursor: pointer;
                color: inherit;
              }
            }
          }
        }
      }

      .swimlane-axis {
        grid-column: 2;
        position: relative;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        width: 28px;
        flex-shrink: 0;

        .axis-line {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 1.5px;
          transform: translateX(-50%);
          background: var(--el-border-color-lighter);
          z-index: 1;

          &.line-first {
            top: 10px;
          }
          &.line-last {
            bottom: calc(100% - 10px);
          }
        }

        .axis-dot {
          position: relative;
          z-index: 2;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--el-bg-color);
          border: 1.5px solid var(--el-border-color);
          color: var(--el-text-color-secondary);
          margin-top: 2px;
          flex-shrink: 0;

          &.dot-machine {
            border-color: var(--el-color-primary);
            color: var(--el-color-primary);
            background: rgba(59, 130, 246, 0.08);
          }
          &.dot-human {
            border-color: #f59e0b;
            color: #d97706;
            background: rgba(245, 158, 11, 0.08);
          }
          &.dot-latest {
            border-color: var(--el-color-danger);
            color: var(--el-color-danger);
            background: rgba(239, 68, 68, 0.1);
          }
        }
      }
    }
  }

  /* 手机与极窄容器 (≤640px)：纵向单列流，左侧轴线，展示明确的角色标签，不丢失角色归属 */
  @media (max-width: 640px) {
    .swimlane-column-headers {
      display: none;
    }

    .swimlane-grid-track {
      .swimlane-row {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 10px;
        padding-bottom: 12px;

        .swimlane-placeholder {
          display: none !important;
        }

        .swimlane-axis {
          grid-column: 1;
          grid-row: 1;
          width: 24px;

          .axis-dot {
            width: 18px;
            height: 18px;
            svg {
              width: 10px;
              height: 10px;
            }
          }
        }

        .swimlane-cell.machine-cell,
        .swimlane-cell.human-cell {
          grid-column: 2;
          grid-row: 1;
          width: 100%;
          min-width: 0;

          .swimlane-event-box {
            padding: 8px 10px;
            gap: 3px;
            width: 100%;
            box-sizing: border-box;

            .event-head-line {
              flex-direction: column;
              align-items: flex-start;
              gap: 3px;

              .event-title-group {
                .event-lane-badge {
                  display: inline-flex; /* 窄屏显示角色标签 */
                }
                .event-action-title {
                  font-size: 12.5px;
                }
              }
            }

            .event-desc-line {
              font-size: 12px;
              line-height: 1.45;
            }
          }
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
  grid-template-columns: 88px 125px 1fr;
  gap: 14px;
  align-items: center;
  height: 88px;

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
  gap: 3px;
  height: 88px;
  width: 125px;
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
    font-size: 11px;
    line-height: 1.35;
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
  height: 88px;
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

/* 数据比较区：将比较数据集中排列，当前值与阈值相邻放置，低饱和正常段 + 局部异常强调 */
.risk-indicators-unified-box {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-blank);

  .risk-gauge-legend-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 7px 14px;
    background: var(--el-fill-color-lighter);
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-size: 11px;
    color: var(--el-text-color-secondary);

    .legend-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .legend-shape {
      display: inline-block;
      flex-shrink: 0;

      &.shape-current {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #475569;
        box-sizing: border-box;
      }

      &.shape-threshold {
        width: 2.5px;
        height: 10px;
        border-radius: 1px;
        background: #334155;
      }

      &.shape-self {
        width: 0;
        height: 0;
        border-left: 4.5px solid transparent;
        border-right: 4.5px solid transparent;
        border-bottom: 7px solid #d97706;
      }

      &.shape-cohort {
        width: 6px;
        height: 6px;
        transform: rotate(45deg);
        border: 1.5px solid #0284c7;
        background: #ffffff;
        box-sizing: border-box;
      }

      &.shape-overflow {
        font-size: 11px;
        font-weight: 700;
        color: #b91c1c;
        line-height: 1;
      }
    }
  }

  .risk-indicators-table {
    display: flex;
    flex-direction: column;

    .metric-compare-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--el-border-color-lighter);
      transition: background 0.15s ease;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &:last-child {
        border-bottom: none;
      }

      /* 行 1: 指标名称 .................... 量程口径 + 命中状态 */
      .metric-head-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;

        .metric-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--el-text-color-primary);
        }

        .metric-head-right {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .metric-scale-caption {
          font-size: 10.5px;
          color: var(--el-text-color-secondary);
          background: var(--el-fill-color-light);
          border: 1px solid var(--el-border-color-lighter);
          padding: 1px 5px;
          border-radius: 3px;
          line-height: 1.3;
        }

        .metric-status-tag {
          font-size: 10.5px;
          height: 18px;
          padding: 0 5px;
          line-height: 16px;
        }
      }

      /* 行 2: 当前值 …… / 风险阈值 …… + 越界徽标 */
      .metric-values-pair {
        display: flex;
        align-items: baseline;
        gap: 10px;
        font-size: 12px;
        flex-wrap: wrap;

        .val-item {
          display: inline-flex;
          align-items: baseline;
          gap: 5px;

          .val-label {
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }
          .val-num {
            font-size: 13px;
            color: var(--el-text-color-primary);

            &.text-danger {
              color: #dc2626;
              font-weight: 600;
            }
          }
          .val-converted-note {
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }
        }

        .val-divider {
          color: var(--el-text-color-placeholder);
          font-size: 11px;
        }

        .gauge-overflow-badge {
          display: inline-flex;
          align-items: center;
          padding: 0 5px;
          height: 18px;
          border-radius: 3px;
          font-size: 10.5px;
          font-weight: 600;
          color: #b91c1c;
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.24);
        }
      }

      /* 行 3: 紧凑图形比较条 (Bullet / Range Gauge) */
      .metric-gauge-track-wrap {
        width: 100%;
        padding: 6px 10px 5px 4px;
        box-sizing: border-box;

        .gauge-benchmark-bar {
          position: relative;
          width: 100%;
          height: 8px;
          background: var(--el-fill-color-darker, #e2e8f0);
          border-radius: 4px;
          overflow: visible;

          &.is-overflow {
            border-top-right-radius: 1px;
            border-bottom-right-radius: 1px;
          }

          &.gauge-discrete-status-bar {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            background: transparent;
            height: 8px;

            .discrete-seg {
              height: 100%;
              border-radius: 3px;
              background: rgba(16, 185, 129, 0.55);
              border: 1px solid rgba(16, 185, 129, 0.78);
            }
          }

          &.gauge-missing-bar {
            background: transparent;
            border: 1px dashed var(--el-border-color);
            height: 8px;
            border-radius: 4px;
          }

          .gauge-risk-zone {
            position: absolute;
            top: 0;
            bottom: 0;
            background: rgba(220, 38, 38, 0.08);
            border-radius: 4px;
            pointer-events: none;
          }

          .gauge-normal-segment {
            position: absolute;
            left: 0;
            top: 1px;
            bottom: 1px;
            background: #64748b;
            opacity: 0.72;
            border-radius: 3px;
            transition: width 0.25s ease;
            pointer-events: none;
          }

          .gauge-anomaly-segment {
            position: absolute;
            top: 1px;
            bottom: 1px;
            background: rgba(220, 38, 38, 0.68);
            border-radius: 0 3px 3px 0;
            transition: width 0.25s ease;
            pointer-events: none;

            &.is-lower-gap {
              background: repeating-linear-gradient(
                135deg,
                rgba(220, 38, 38, 0.2),
                rgba(220, 38, 38, 0.2) 3px,
                rgba(220, 38, 38, 0.45) 3px,
                rgba(220, 38, 38, 0.45) 6px
              );
              border-radius: 2px;
            }
          }

          .gauge-tick-marker {
            position: absolute;
            transform: translateX(-50%);
            pointer-events: none;

            &.tick-threshold {
              top: -3px;
              bottom: -3px;
              width: 2.5px;
              border-radius: 1px;
              background: #334155;
              z-index: 3;
            }

            &.tick-self {
              bottom: -5px;
              top: auto;
              width: 0;
              height: 0;
              background: transparent;
              border-left: 4.5px solid transparent;
              border-right: 4.5px solid transparent;
              border-bottom: 6.5px solid #d97706;
              z-index: 3;
            }

            &.tick-cohort {
              top: 50%;
              bottom: auto;
              width: 6px;
              height: 6px;
              background: #ffffff;
              border: 1.5px solid #0284c7;
              transform: translate(-50%, -50%) rotate(45deg);
              box-sizing: border-box;
              z-index: 3;
            }
          }

          .gauge-current-dot {
            position: absolute;
            top: 50%;
            width: 10px;
            height: 10px;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #475569;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
            z-index: 4;

            &.dot-over {
              border-color: #dc2626;
            }

            &.dot-overflow {
              border-color: #b91c1c;
              background: #fef2f2;
            }
          }

          .gauge-overflow-cap {
            position: absolute;
            right: -9px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 11px;
            font-weight: 700;
            color: #b91c1c;
            line-height: 1;
            z-index: 5;
            pointer-events: none;
          }
        }
      }

      /* 行 4: 自身基线 …… · 群组基线 …… · 风险阈值 …… (形状标记与轨道一致) */
      .metric-baselines-line {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        flex-wrap: wrap;

        .meta-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .legend-indicator {
          display: inline-block;
          flex-shrink: 0;

          &.dot-self {
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 6px solid #d97706;
          }

          &.dot-cohort {
            width: 6px;
            height: 6px;
            transform: rotate(45deg);
            border: 1.5px solid #0284c7;
            background: #ffffff;
            box-sizing: border-box;
          }

          &.line-threshold {
            width: 2.5px;
            height: 9px;
            border-radius: 1px;
            background: #334155;
          }
        }

        .meta-dot {
          color: var(--el-text-color-placeholder);
        }
      }

      /* 行 4: 规则编号 · 原有采集说明 */
      .metric-rule-probe-line {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 10.5px;
        color: var(--el-text-color-placeholder);
        flex-wrap: wrap;

        .metric-rule-tag {
          background: var(--el-fill-color-light);
          padding: 1px 6px;
          border-radius: 3px;
          border: 1px solid var(--el-border-color-lighter);
          color: var(--el-text-color-secondary);
        }

        .meta-dot {
          color: var(--el-text-color-placeholder);
        }

        .meta-notes {
          color: var(--el-text-color-secondary);
          word-break: break-all;
        }
      }
    }
  }
}

/* 模块 F/G 共用空态盒：无真实数据时的诚实说明（替代伪造统计与空白区域） */
.evidence-empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 26px 16px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color-lighter);
  color: var(--el-text-color-placeholder);
  text-align: center;

  .evidence-empty-title {
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  .evidence-empty-desc {
    font-size: 12px;
    line-height: 1.6;
    max-width: 420px;
  }
}

/* 模块 G: 证据清单 (仅真实存证字段，无数据时不渲染任何行) */
.evidence-chain-structured-list {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .evidence-item-row {
    display: grid;
    grid-template-columns: 128px 1fr;
    gap: 12px;
    align-items: start;
    padding: 10px 14px;
    border-radius: 6px;
    background: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color-lighter);
    transition: border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      border-color: var(--el-border-color);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }

    @media (max-width: 600px) {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .evidence-item-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--el-text-color-secondary);

      svg {
        color: var(--el-color-primary);
        flex-shrink: 0;
      }
    }

    .evidence-item-value {
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--el-text-color-primary);
      word-break: break-word;
    }
  }
}

/* 模块 H: 裁决工作台 (5 步有联系的决策流程) */
.adjudication-workbench-card {
  .decision-compact-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .decision-target-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    line-height: 1.45;
    flex-wrap: wrap;
    padding: 6px 10px;
    background: var(--el-fill-color-light);
    border-radius: 6px;

    .target-bar-left {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
    }

    .target-bar-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .target-account-label, .measure-label {
      font-weight: 500;
      font-size: 11.5px;
    }

    .target-account-val {
      color: var(--el-text-color-primary);
    }

    .target-scope-note {
      font-size: 11.5px;
    }
  }

  .grounded-recommendation-card {
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-light);
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;

    &.has-rec {
      border-color: rgba(59, 130, 246, 0.25);
      background: rgba(59, 130, 246, 0.03);
    }

    .rec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;

      .rec-title-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--el-color-primary);

        .rec-icon {
          flex-shrink: 0;
        }

        .rec-section-title {
          font-size: 12.5px;
          color: var(--el-text-color-primary);
        }
      }

      .btn-adopt-rec {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid var(--el-color-primary-light-5);
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary);
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover:not(:disabled) {
          background: var(--el-color-primary);
          color: #fff;
        }

        &:disabled {
          opacity: 0.65;
          cursor: default;
          border-color: var(--el-border-color-light);
          background: var(--el-fill-color);
          color: var(--el-text-color-secondary);
        }
      }
    }

    .rec-body {
      display: flex;
      flex-direction: column;
      gap: 3px;

      .rec-action-row,
      .rec-meta-row {
        display: flex;
        align-items: baseline;
        gap: 6px;
        line-height: 1.45;

        .rec-label {
          flex-shrink: 0;
          font-size: 11.5px;
        }

        .rec-action-name {
          color: var(--el-color-primary);
        }

        .rec-meta-val {
          color: var(--el-text-color-regular);
        }
      }

      .rec-none-wrap {
        font-size: 11.5px;
        font-style: italic;
      }
    }
  }

  .verdict-compact-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .verdict-compact-option {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--el-border-color-lighter);
      background: var(--el-fill-color-blank);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--el-border-color);
        background: var(--el-fill-color-light);
      }

      &.is-selected {
        border-color: var(--el-color-primary);
        background: rgba(59, 130, 246, 0.05);

        &.tone-success,
        &.tone-approve {
          border-color: #059669;
          background: rgba(16, 185, 129, 0.05);
        }

        &.tone-danger,
        &.tone-reject {
          border-color: var(--el-color-danger);
          background: rgba(239, 68, 68, 0.05);
        }

        &.tone-probation {
          border-color: var(--el-color-warning);
          background: rgba(245, 158, 11, 0.05);
        }
      }

      .opt-main-line {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        flex-wrap: wrap;

        .radio-indicator {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 1.5px solid var(--el-border-color);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s ease;

          &.checked {
            border-color: var(--el-color-primary);
            background: var(--el-color-primary);
            box-shadow: inset 0 0 0 2.5px var(--el-bg-color);
          }
        }

        .verdict-opt-icon {
          color: var(--el-text-color-secondary);
          flex-shrink: 0;
        }

        .verdict-opt-label {
          font-size: 12.5px;
          color: var(--el-text-color-primary);
          flex-shrink: 0;
        }

        .verdict-opt-sub {
          font-size: 11.5px;
          color: var(--el-text-color-secondary);
          margin-left: 4px;
        }
      }
    }
  }

  .verdict-impact-bar {
    padding: 6px 10px;
    border-radius: 4px;
    background: var(--el-fill-color-light);
    font-size: 12px;
    line-height: 1.45;
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;

    .impact-lead {
      color: var(--el-text-color-primary);
      flex-shrink: 0;
    }

    .impact-body {
      color: var(--el-text-color-regular);
      flex: 1;
    }

    .impact-hint {
      font-size: 11.5px;
    }
  }

  .decision-notes-section {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .notes-head {
      display: flex;
      align-items: baseline;
      gap: 6px;

      .notes-label {
        font-size: 12.5px;
        color: var(--el-text-color-primary);
      }

      .notes-scope-tip {
        font-size: 11.5px;
      }
    }

    .decision-textarea {
      font-size: 12px;
    }

    .quick-notes-presets {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      .quick-label {
        font-size: 11.5px;
      }

      .preset-chip {
        border: 1px solid var(--el-border-color-lighter);
        background: var(--el-fill-color-light);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;

        &:hover {
          border-color: var(--el-color-primary);
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
        }
      }
    }
  }

  .decision-notice-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 5px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-blank);
    flex-wrap: wrap;

    .notice-info {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      flex-wrap: wrap;

      .notice-title {
        color: var(--el-text-color-primary);
      }

      .notice-status-tag {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      .notice-subject-preview {
        font-size: 11.5px;
      }
    }
  }

  .decision-submit-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 4px;

    .submit-hint {
      font-size: 11.5px;
    }
  }

  .secondary-blacklist-row {
    padding-top: 6px;
    border-top: 1px dashed var(--el-border-color-lighter);

    .btn-subtle-blacklist {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: none;
      padding: 0;
      font-size: 11.5px;
      color: var(--el-color-danger);
      cursor: pointer;
      opacity: 0.85;

      &:hover:not(:disabled) {
        opacity: 1;
        text-decoration: underline;
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  }
}

.notice-preview-dialog {
  .notice-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .notice-redaction-tip {
      font-size: 11.5px;
      line-height: 1.45;
      padding: 6px 10px;
      border-radius: 4px;
      background: var(--el-fill-color-light);
    }

    .notice-dialog-table {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--el-border-color-lighter);

      .dialog-kv-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        font-size: 12px;
        line-height: 1.5;

        .dk-label {
          width: 96px;
          min-width: 96px;
          flex-shrink: 0;
          color: var(--el-text-color-secondary);
        }

        .dk-val {
          flex: 1;
          color: var(--el-text-color-primary);
          word-break: break-word;
        }

        .reachability-note-text {
          color: var(--el-text-color-regular);
        }
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
  border-radius: 6px;
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
  justify-content: space-between;
  width: 100%;
  flex-wrap: wrap;
  gap: 10px;

  .footer-left {
    display: flex;
    align-items: center;
  }

  .footer-right {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }

  :deep(.el-button) {
    height: 34px;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 500;
  }

  .btn-adjudicate-entry {
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  @media (max-width: 600px) {
    justify-content: stretch;
    gap: 8px;

    .footer-left,
    .footer-right {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    :deep(.el-button) {
      flex: 1 1 calc(50% - 4px);
      margin-left: 0 !important;
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
  max-width: 100vw;

  @media (min-width: 769px) {
    max-width: 800px !important;
  }

  @media (max-width: 768px) {
    width: 100% !important;
    max-width: 100vw !important;
  }

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
    }

    .evidence-item-row,
    .evidence-empty-box,
    .judgment-path-record-box,
    .risk-indicators-unified-box {
      background: #161b22;
      border-color: #30363d;
    }

    .dual-swimlane-container {
      .swimlane-column-headers {
        .machine-header {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.25);
        }
        .human-header {
          background: rgba(245, 158, 11, 0.1);
          border-color: rgba(245, 158, 11, 0.25);
          color: #fbbf24;
        }
      }

      .swimlane-axis {
        .axis-line {
          background: #30363d;
        }
        .axis-dot {
          background: #0d1117;
          border-color: #30363d;
        }
      }

      .swimlane-event-box {
        background: #161b22;
        border-color: #30363d;

        &:hover {
          border-color: #484f58;
        }

        .event-head-line {
          .event-action-title {
            color: #f0f6fc;
          }
          .event-time-tag {
            color: #8b949e;
          }
        }

        .event-meta-line {
          color: #8b949e;
          .meta-dot {
            color: #484f58;
          }
        }

        .event-desc-line {
          color: #c9d1d9;
        }

        .node-transition-inline {
          background: #21262d;
          border-color: #30363d;
          .st-text {
            color: #8b949e;
            &.st-to {
              color: #f85149;
            }
          }
        }

        .node-hash-inline {
          background: #21262d;
          border-color: #30363d;
          color: #8b949e;

          &:hover {
            color: var(--el-color-primary);
            border-color: var(--el-color-primary);
          }
        }
      }
    }

    .collapse-toggle-btn {
      background: #21262d;
      border-color: #30363d;
      color: #c9d1d9;

      &:hover {
        background: #282e33;
        color: var(--el-color-primary);
      }
    }

    .cluster-records-list {
      .cluster-record-row {
        border-bottom-color: #21262d;

        .view-identity-btn {
          border-color: #30363d;
          color: #8b949e;

          &:hover {
            background: #21262d;
            color: var(--el-color-primary);
          }
        }

        .inline-copy-btn {
          color: #8b949e;

          &:hover {
            color: var(--el-color-primary);
            background: #21262d;
          }
        }
      }
    }

    .risk-indicators-unified-box {
      .gauge-legend-bar {
        background: #1c2128;
        border-bottom-color: #30363d;
      }

      .metric-compare-row {
        border-bottom-color: #21262d;

        &:hover {
          background: #1c2128;
        }

        .metric-title-col {
          .metric-name {
            color: #f0f6fc;
          }
          .metric-rule-box {
            background: #21262d;
            border-color: #30363d;
            color: #8b949e;
          }
        }

        .benchmark-track {
          background: #21262d;
          border-color: #30363d;
        }

        .point-marker {
          background: #f0f6fc;
          border-color: #0d1117;
          &.marker-over {
            background: #f85149;
          }
        }

        .metric-gauge-track-wrap {
          .gauge-benchmark-bar {
            background: #21262d;

            .gauge-risk-zone {
              background: rgba(248, 81, 73, 0.18);
            }

            .gauge-tick-marker.tick-threshold {
              background: #8b949e;
            }

            .gauge-tick-marker.tick-self {
              background: #f0883e;
            }

            .gauge-tick-marker.tick-cohort {
              background: #38bdf8;
            }

            .gauge-current-dot {
              background: #161b22;
              border-color: #58a6ff;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);

              &.dot-over {
                border-color: #f85149;
              }
            }
          }
        }

        .metric-baselines-line {
          .legend-indicator.dot-self {
            background: #f0883e;
          }

          .legend-indicator.dot-cohort {
            background: #38bdf8;
          }

          .legend-indicator.line-threshold {
            background: #8b949e;
          }
        }
      }
    }

    .adjudication-workbench-card {
      .verdict-compact-option,
      .decision-notice-bar {
        background: #161b22;
        border-color: #30363d;

        &:hover {
          background: #1c2128;
          border-color: #484f58;
        }

        &.is-selected {
          border-color: #388bfd;
          background: rgba(56, 139, 253, 0.1);
        }
      }

      .verdict-impact-bar {
        background: #161b22;
      }

      .preset-chip {
        background: #21262d;
        border-color: #30363d;
        color: #c9d1d9;

        &:hover {
          background: #282e33;
          color: var(--el-color-primary);
        }
      }
    }

    .notice-preview-dialog {
      .notice-dialog-table {
        border-color: #30363d;
      }

      .notice-redaction-tip {
        background: #161b22;
        color: #8b949e;
      }
    }
  }
}
</style>
