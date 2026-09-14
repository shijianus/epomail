<template>
  <div class="box">
    <div class="header-actions">
      <div class="header-actions-left">
        <el-tooltip :content="$t('back') || 'Back'" placement="bottom">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handleBack">
            <Icon class="icon btn-back" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20"/>
          </span>
        </el-tooltip>
        <el-tooltip :content="$t('archive')" placement="bottom" v-if="emailStore.contentData.delType !== 'physics'">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handleArchive">
            <Icon class="icon btn-archive" icon="fluent:archive-20-regular" width="20" height="20"/>
          </span>
        </el-tooltip>
        <el-tooltip :content="$t('reportSpam')" placement="bottom" v-if="emailStore.contentData.delType !== 'physics'">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handleReportSpam">
            <Icon class="icon btn-spam" icon="fluent:shield-dismiss-20-regular" width="20" height="20"/>
          </span>
        </el-tooltip>
        <el-tooltip :content="$t('delete') || 'Delete'" placement="bottom" v-if="hasPerm('email:delete')">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handleDelete">
            <Icon class="icon btn-delete" icon="fluent:delete-20-regular" width="20" height="20"/>
          </span>
        </el-tooltip>
        <el-tooltip :content="email.unread === 0 ? ($t('markUnread')) : ($t('markRead'))" placement="bottom">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handleToggleRead">
            <Icon class="icon btn-unread" :icon="email.unread === 0 ? 'fluent:mail-unread-20-regular' : 'fluent:mail-read-20-regular'" width="20" height="20"/>
          </span>
        </el-tooltip>
        
        <!-- Snooze Popover -->
        <el-popover placement="bottom" :width="200" trigger="click" popper-class="header-action-popover" v-if="emailStore.contentData.delType !== 'physics'">
          <template #reference>
            <div class="action-icon-wrap btn-snooze" :title="$t('snooze')">
              <Icon class="icon" icon="fluent:clock-20-regular" width="20" height="20"/>
            </div>
          </template>
          <div class="snooze-quick-menu">
            <div class="snooze-menu-title">{{ $t('snooze') }}</div>
            <div class="snooze-menu-item" @click="handleQuickSnooze('today')">
              <Icon icon="fluent:weather-partly-cloudy-day-16-regular" width="16" />
              <span>{{ $t('snoozeLaterToday') }}</span>
            </div>
            <div class="snooze-menu-item" @click="handleQuickSnooze('tomorrow')">
              <Icon icon="fluent:calendar-ltr-16-regular" width="16" />
              <span>{{ $t('snoozeTomorrow') }}</span>
            </div>
            <div class="snooze-menu-item" @click="handleQuickSnooze('weekend')">
              <Icon icon="fluent:calendar-16-regular" width="16" />
              <span>{{ $t('snoozeThisWeekend') }}</span>
            </div>
            <div class="snooze-menu-item" @click="handleQuickSnooze('nextweek')">
              <Icon icon="fluent:calendar-arrow-right-16-regular" width="16" />
              <span>{{ $t('snoozeNextWeek') }}</span>
            </div>
            <el-divider style="margin: 6px 0;" />
            <div class="snooze-menu-item" @click="customSnoozeDialogVisible = true">
              <Icon icon="fluent:clock-toolbox-20-regular" width="16" />
              <span>{{ $t('snoozeCustom') }}</span>
            </div>
          </div>
        </el-popover>

        <!-- Add to tasks -->
        <el-tooltip :content="$t('addToTasks')" placement="bottom">
          <span class="action-icon-wrap btn-task" role="button" tabindex="0" @click="handleAddToTasks">
            <Icon class="icon" icon="fluent:task-list-add-20-regular" width="20" height="20" />
          </span>
        </el-tooltip>

        <!-- Move to Popover -->
        <el-popover placement="bottom" :width="180" trigger="click" popper-class="header-action-popover" v-if="emailStore.contentData.delType !== 'physics'">
          <template #reference>
            <div class="action-icon-wrap btn-move" :title="$t('moveTo')">
              <Icon class="icon" icon="fluent:folder-arrow-right-20-regular" width="20" height="20"/>
            </div>
          </template>
          <div class="move-to-menu">
            <div class="move-menu-title">{{ $t('moveTo') }}</div>
            <div class="move-menu-item" @click="handleMoveTo('inbox')">
              <Icon icon="fluent:mail-inbox-16-regular" width="16" />
              <span>{{ $t('moveToInbox') }}</span>
            </div>
            <div class="move-menu-item" @click="handleMoveTo('spam')">
              <Icon icon="fluent:shield-dismiss-16-regular" width="16" />
              <span>{{ $t('moveToSpam') }}</span>
            </div>
            <div class="move-menu-item" @click="handleMoveTo('trash')">
              <Icon icon="fluent:delete-16-regular" width="16" />
              <span>{{ $t('moveToTrash') }}</span>
            </div>
          </div>
        </el-popover>

        <!-- Label as Popover -->
        <el-popover placement="bottom" :width="220" trigger="click" popper-class="header-action-popover" v-if="emailStore.contentData.delType !== 'physics'">
          <template #reference>
            <div class="action-icon-wrap btn-label" :title="$t('labelAs')">
              <Icon class="icon" icon="fluent:tag-20-regular" width="20" height="20"/>
            </div>
          </template>
          <div class="label-quick-menu">
            <div class="label-menu-title">{{ $t('labelAs') }}</div>
            <div 
              v-for="lbl in availableLabels" 
              :key="lbl.name" 
              class="label-menu-item" 
              @click="toggleLabelOnEmail(lbl.name)"
            >
              <el-checkbox :model-value="currentLabels.includes(lbl.name)" @click.stop="toggleLabelOnEmail(lbl.name)" />
              <span class="label-dot" :style="{ backgroundColor: lbl.color || '#3b82f6' }"></span>
              <span class="label-text">{{ getLabelDisplayName(lbl.name, t) }}</span>
            </div>
          </div>
        </el-popover>

        <!-- Translate message -->
        <el-tooltip :content="$t('translateMessage')" placement="bottom">
          <span class="action-icon-wrap btn-translate-wrap" role="button" tabindex="0" @click="toggleTranslateBar(threadMessages[threadMessages.length - 1] || email)">
            <Icon class="icon btn-translate" icon="fluent:translate-20-regular" width="20" height="20" />
          </span>
        </el-tooltip>

        <!-- More options -->
        <el-dropdown trigger="click" @command="handleHeaderMoreCommand">
          <div class="action-icon-wrap btn-more" :title="$t('more')">
            <Icon class="icon" icon="fluent:more-vertical-20-regular" width="20" height="20" />
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="filter">
                <Icon icon="fluent:filter-20-regular" width="16" style="margin-right: 8px;" />
                {{ $t('filterMessages') }}
              </el-dropdown-item>
              <el-dropdown-item command="mute">
                <Icon icon="fluent:speaker-mute-20-regular" width="16" style="margin-right: 8px;" />
                {{ $t('muteConversation') }}
              </el-dropdown-item>
              <el-dropdown-item command="forwardAll" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                <Icon icon="iconoir:arrow-up-right" width="16" style="margin-right: 8px;" />
                {{ $t('forwardAll') }}
              </el-dropdown-item>
              <el-dropdown-item command="printAll">
                <Icon icon="fluent:print-20-regular" width="16" style="margin-right: 8px;" />
                {{ $t('printAll') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="header-actions-right">
        <el-tooltip :content="isAllExpanded ? ($t('collapseAll')) : ($t('expandAll'))" placement="bottom" v-if="threadMessages.length > 1">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="toggleExpandAll">
            <Icon class="icon btn-expand-all" :icon="isAllExpanded ? 'fluent:arrow-collapse-all-20-regular' : 'fluent:arrow-expand-all-20-regular'" width="20" height="20" />
          </span>
        </el-tooltip>
        <el-tooltip :content="$t('printAll')" placement="bottom">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handlePrintAll">
            <Icon class="icon btn-print-all" icon="fluent:print-20-regular" width="20" height="20" />
          </span>
        </el-tooltip>
        <el-tooltip :content="$t('inNewWindow')" placement="bottom">
          <span class="action-icon-wrap" role="button" tabindex="0" @click="handleOpenInNewWindow">
            <Icon class="icon btn-new-window" icon="fluent:open-20-regular" width="19" height="19" />
          </span>
        </el-tooltip>
      </div>
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title-row">
          <div class="email-title">{{ email.subject }}</div>
          <div class="email-labels-list" v-if="currentLabels.length">
            <el-tag 
              v-for="lbl in currentLabels" 
              :key="lbl" 
              size="small" 
              effect="light"
              class="subject-label-tag"
            >
              {{ lbl }}
            </el-tag>
          </div>
        </div>

        <!-- Thread Messages List -->
        <div class="thread-messages-flow">
          <div 
            v-for="(msg, index) in threadMessages" 
            :key="msg.emailId"
            class="thread-msg-item"
            :class="{ 'is-collapsed': !isMsgExpanded(msg.emailId, index), 'is-last': index === threadMessages.length - 1 }"
          >
            <!-- Collapsed Card Header -->
            <div 
              class="thread-collapsed-header" 
              v-if="!isMsgExpanded(msg.emailId, index)"
              @click="toggleMsg(msg.emailId, index)"
            >
              <div class="ch-left">
                <el-avatar :size="28" class="sender-avatar mini" :class="{ 'official-avatar': msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial }">
                  <Icon icon="ri:verified-badge-fill" width="16" height="16" v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" />
                  <template v-else>{{ msg.name ? msg.name.charAt(0).toUpperCase() : 'U' }}</template>
                </el-avatar>
                <span class="ch-name">{{ msg.name }}</span>
                <span class="ch-snippet">{{ msg.formatText || msg.text || $t('noPlainTextPreview') }}</span>
              </div>
              <div class="ch-right">
                <span class="ch-date">{{ formatDetailDate(msg.createTime) }}</span>
                <Icon icon="lucide:chevron-down" width="16" height="16" class="ch-arrow" />
              </div>
            </div>

            <!-- Expanded Full Message Content -->
            <div class="content thread-expanded-body" v-else>
              <div class="email-info" @click="threadMessages.length > 1 ? toggleMsg(msg.emailId, index) : null" :style="threadMessages.length > 1 ? 'cursor: pointer;' : ''">
                <div style="display: flex; gap: 16px;">
                  <el-avatar :size="44" class="sender-avatar" :class="{ 'official-avatar': msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial }">
                    <Icon icon="ri:verified-badge-fill" width="24" height="24" v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" />
                    <template v-else>{{ msg.name ? msg.name.charAt(0).toUpperCase() : 'U' }}</template>
                  </el-avatar>
                  <div class="info-body">
                    <div class="info-top">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="send-name-title">{{ msg.name }}</span>
                        <span v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" class="official-verified-badge" :title="$t('officialVerified')">
                          <Icon icon="ri:verified-badge-fill" width="18" height="18" style="color: #0284c7; vertical-align: middle;" />
                        </span>
                      </div>
                      <div class="thread-header-bar" @click.stop>
                        <span class="date">{{ formatDetailDate(msg.createTime) }}</span>
                        <div class="msg-header-quick-actions">
                          <el-tooltip :content="$t('star') || 'Star'" placement="bottom" v-if="emailStore.contentData.showStar">
                            <span class="msg-act-star" role="button" tabindex="0" @click="changeStar">
                              <Icon class="msg-act-icon btn-star" v-if="email.isStar" icon="fluent-color:star-16" width="18" height="18"/>
                              <Icon class="msg-act-icon btn-star" v-else icon="solar:star-line-duotone" width="17" height="17"/>
                            </span>
                          </el-tooltip>
                          <el-tooltip :content="$t('translateMessage')" placement="bottom">
                            <span class="msg-act-icon btn-translate" role="button" tabindex="0" @click="toggleTranslateBar(msg)">
                              <Icon icon="fluent:translate-20-regular" width="17" height="17"/>
                            </span>
                          </el-tooltip>
                          <el-tooltip :content="$t('reply')" placement="bottom" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                            <span class="msg-act-icon btn-reply" role="button" tabindex="0" @click="openReplyMsg(msg)">
                              <Icon icon="la:reply" width="18" height="18"/>
                            </span>
                          </el-tooltip>
                          <el-tooltip :content="$t('replyAll')" placement="bottom" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                            <span class="msg-act-icon btn-reply-all" role="button" tabindex="0" @click="openReplyAllMsg(msg)">
                              <Icon icon="fluent:arrow-reply-all-20-regular" width="18" height="18"/>
                            </span>
                          </el-tooltip>
                          <el-tooltip :content="$t('forward')" placement="bottom" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                            <span class="msg-act-icon btn-forward" role="button" tabindex="0" @click="openForwardMsg(msg)">
                              <Icon icon="iconoir:arrow-up-right" width="17" height="17"/>
                            </span>
                          </el-tooltip>
                          <el-tooltip :content="$t('printEmail')" placement="bottom">
                            <span class="msg-act-icon btn-print" role="button" tabindex="0" @click="printSingleMsg(msg)">
                              <Icon icon="fluent:print-20-regular" width="17" height="17"/>
                            </span>
                          </el-tooltip>
                          <el-dropdown trigger="click" @command="(cmd) => handleMsgMoreCommand(cmd, msg)">
                            <span class="msg-act-icon btn-msg-more" role="button" tabindex="0">
                              <Icon icon="fluent:more-vertical-20-regular" width="17" height="17" />
                            </span>
                            <template #dropdown>
                              <el-dropdown-menu>
                                <el-dropdown-item command="reply" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                                  <Icon icon="la:reply" width="15" style="margin-right: 8px;" />
                                  {{ $t('reply') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="replyAll" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                                  <Icon icon="fluent:arrow-reply-all-20-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('replyAll') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="forward" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                                  <Icon icon="iconoir:arrow-up-right" width="15" style="margin-right: 8px;" />
                                  {{ $t('forward') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="filter">
                                  <Icon icon="fluent:filter-20-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('filterMessages') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="spam" v-if="emailStore.contentData.delType !== 'physics'">
                                  <Icon icon="fluent:shield-dismiss-20-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('reportSpam') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="downloadEml">
                                  <Icon icon="fluent:document-arrow-down-16-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('downloadEml') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="viewHeaders">
                                  <Icon icon="fluent:code-text-16-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('viewRawHeaders') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="print">
                                  <Icon icon="fluent:print-20-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('printEmail') }}
                                </el-dropdown-item>
                                <el-dropdown-item command="delete" style="color: #ef4444;" v-if="hasPerm('email:delete')">
                                  <Icon icon="fluent:delete-20-regular" width="15" style="margin-right: 8px;" />
                                  {{ $t('delete') }}
                                </el-dropdown-item>
                              </el-dropdown-menu>
                            </template>
                          </el-dropdown>
                        </div>
                        <Icon icon="lucide:chevron-up" width="16" height="16" class="ch-arrow" v-if="threadMessages.length > 1" @click.stop="toggleMsg(msg.emailId, index)" />
                      </div>
                    </div>
                    <div class="info-middle">
                      <span>&lt;{{ msg.sendEmail }}&gt;</span>
                    </div>
                    <!-- Gmail-style info-bottom with 'to me' dropdown -->
                    <div class="info-bottom" @click.stop>
                      <el-popover
                        placement="bottom-start"
                        :width="380"
                        trigger="click"
                        popper-class="gmail-details-popover"
                        :teleported="true"
                      >
                        <template #reference>
                          <div class="to-me-trigger">
                            <span class="recipient-label">{{ getRecipientDisplay(msg.recipient) }}</span>
                            <Icon icon="fluent:chevron-down-12-regular" class="to-me-arrow" />
                          </div>
                        </template>

                        <div class="gmail-details-card">
                          <div class="detail-row">
                            <span class="dt-label">{{ $t('detailFrom') }}</span>
                            <span class="dt-val">{{ msg.name ? `${msg.name} <${msg.sendEmail}>` : msg.sendEmail }}</span>
                          </div>
                          <div class="detail-row" v-if="msg.replyTo">
                            <span class="dt-label">{{ $t('detailReplyTo') }}</span>
                            <span class="dt-val">{{ msg.replyTo }}</span>
                          </div>
                          <div class="detail-row">
                            <span class="dt-label">{{ $t('detailTo') }}</span>
                            <span class="dt-val">{{ formateReceive(msg.recipient) }}</span>
                          </div>
                          <div class="detail-row">
                            <span class="dt-label">{{ $t('detailDate') }}</span>
                            <span class="dt-val">{{ formatDetailDate(msg.createTime) }}</span>
                          </div>
                          <div class="detail-row">
                            <span class="dt-label">{{ $t('detailSubject') }}</span>
                            <span class="dt-val">{{ msg.subject || email.subject }}</span>
                          </div>
                          <div class="detail-row" v-if="getSenderDomain(msg.sendEmail)">
                            <span class="dt-label">{{ $t('detailMailedBy') }}</span>
                            <span class="dt-val">{{ getSenderDomain(msg.sendEmail) }}</span>
                          </div>
                          <div class="detail-row">
                            <span class="dt-label">{{ $t('detailSecurity') }}</span>
                            <span class="dt-val security-tls">
                              <Icon icon="fluent:lock-closed-16-regular" width="14" height="14" style="color: #10b981;" />
                              <span>{{ $t('detailSecurityTls') }}</span>
                            </span>
                          </div>
                        </div>
                      </el-popover>
                    </div>
                  </div>
                </div>

                <!-- Official System Mail Banner -->
                <div class="official-system-banner" v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" @click.stop>
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
                  <div class="banner-right" v-if="msg.expireDays">
                    <el-tag size="small" type="info" effect="plain" class="expire-pill">
                      <Icon icon="ic:outline-access-time" width="13" height="13" style="margin-right: 3px;" />
                      {{ $t('officialExpireNotice', { days: msg.expireDays }) }}
                    </el-tag>
                  </div>
                </div>

                <!-- Gmail-Style Translation Banner -->
                <div class="gmail-translate-bar" v-if="showTranslateMap[msg.emailId]" @click.stop>
                  <div class="gtb-left">
                    <Icon icon="fluent:translate-20-regular" width="16" height="16" class="gtb-icon" />
                    <span class="gtb-title">{{ $t('translateTo') }}</span>
                    <el-select v-model="targetLangMap[msg.emailId]" size="small" class="gtb-select" style="width: 135px;" @change="handleTranslate(msg, true)">
                      <el-option label="中文 (简体)" value="zh" />
                      <el-option label="正體中文 (繁體)" value="zh-Hant" />
                      <el-option label="English" value="en" />
                      <el-option label="日本語" value="ja" />
                      <el-option label="한국어" value="ko" />
                      <el-option label="Français" value="fr" />
                      <el-option label="Deutsch" value="de" />
                      <el-option label="Español" value="es" />
                      <el-option label="Русский" value="ru" />
                      <el-option label="Português" value="pt" />
                      <el-option label="Italiano" value="it" />
                      <el-option label="العربية" value="ar" />
                      <el-option label="ไทย" value="th" />
                      <el-option label="Tiếng Việt" value="vi" />
                      <el-option label="Bahasa Indonesia" value="id" />
                    </el-select>
                    <el-button size="small" type="primary" link :loading="translatingMap[msg.emailId]" @click="handleTranslate(msg)">
                      {{ isTranslatedMap[msg.emailId] ? ($t('reTranslate')) : ($t('translateMessage')) }}
                    </el-button>
                    <template v-if="isTranslatedMap[msg.emailId]">
                      <el-divider direction="vertical" />
                      <el-button size="small" link type="primary" @click="toggleViewOriginal(msg.emailId)">
                        {{ showOriginalMap[msg.emailId] ? ($t('viewTranslation')) : ($t('viewOriginal')) }}
                      </el-button>
                    </template>
                  </div>
                  <div class="gtb-right">
                    <span v-if="isTranslatedMap[msg.emailId] && !showOriginalMap[msg.emailId]" class="gtb-status-tag">
                      <Icon icon="fluent:sparkle-16-filled" width="13" height="13" />
                      <span>{{ $t('inPlaceFormatPreserved') }}</span>
                    </span>
                    <Icon icon="fluent:dismiss-16-regular" width="16" height="16" class="gtb-close" @click="closeTranslate(msg.emailId)" />
                  </div>
                </div>

                <el-alert v-if="msg.status === 3" :closable="false" :title="toMessage(msg.message)" class="email-msg" type="error" show-icon @click.stop />
                <el-alert v-if="msg.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon @click.stop />
                <el-alert v-if="msg.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon @click.stop />
                
                <div class="spam-alert-banner" v-if="msg.isSpam === 1 || (msg.labels && msg.labels.includes('推销'))" @click.stop>
                  <div class="spam-alert-content">
                    <Icon icon="mdi:alert-outline" width="18" height="18" style="flex-shrink: 0;" />
                    <span>{{ $t('spamAlertNotice') }}</span>
                  </div>
                  <el-button size="small" type="warning" plain :loading="isReporting" @click="handleReportNotSpam(msg.emailId)">{{ $t('notSpam') }}</el-button>
                </div>
                
              </div>

              <el-scrollbar class="htm-scrollbar" :class="(!msg.attList || msg.attList.length === 0) ? 'bottom-distance' : ''">
                <ShadowHtml class="shadow-html" :html="formatImage(displayedContent(msg))" v-if="msg.content || translatedHtmlMap[msg.emailId]" />
                <pre v-else class="email-text" >{{ displayedText(msg) }}</pre>
              </el-scrollbar>

              <div class="att" v-if="msg.attList && msg.attList.length > 0">
                <div class="att-title">
                  <span>{{$t('attachments')}}</span>
                  <span>{{$t('attCount',{total: msg.attList.length})}}</span>
                </div>
                <div class="att-box">
                  <div class="att-item" v-for="att in msg.attList" :key="att.attId">
                    <div class="att-icon" @click="showImage(att.key)">
                      <Icon v-bind="getIconByName(att.filename)" />
                    </div>
                    <div class="att-name" @click="showImage(att.key)">
                      {{ att.filename }}
                    </div>
                    <div class="att-size">{{ formatBytes(att.size) }}</div>
                    <div class="opt-icon att-icon">
                      <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                      <a :href="cvtR2Url(att.key)" download>
                        <Icon icon="system-uicons:push-down" width="22" height="22"/>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="inline-reply" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
                 <el-button round class="reply-btn" @click="openReplyMsg(msg)">
                    <Icon icon="la:reply" width="18" height="18" /> {{ $t('reply') || 'Reply' }}
                 </el-button>
                 <el-button round class="reply-btn" @click="openForwardMsg(msg)">
                    <Icon icon="iconoir:arrow-up-right" width="18" height="18" /> {{ $t('forward') || 'Forward' }}
                 </el-button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </el-scrollbar>

    <!-- Custom Snooze Dialog -->
    <el-dialog v-model="customSnoozeDialogVisible" :title="$t('snoozeCustom')" width="360px" class="custom-snooze-dialog" append-to-body>
      <div style="margin-bottom: 16px;">
        <el-date-picker
          v-model="customSnoozeTime"
          type="datetime"
          :placeholder="$t('selectTime')"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 100%;"
        />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="customSnoozeDialogVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="submitCustomSnooze">{{ $t('confirm') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Filter Messages Dialog -->
    <el-dialog v-model="filterDialogVisible" :title="$t('filterDialogTitle')" width="480px" class="filter-dialog" append-to-body>
      <el-form :model="filterForm" label-position="top">
        <el-form-item :label="$t('filterFrom')">
          <el-input v-model="filterForm.sender" placeholder="example@domain.com" />
        </el-form-item>
        <el-form-item :label="$t('filterSubject')">
          <el-input v-model="filterForm.subject" :placeholder="$t('keywordOrSubject')" />
        </el-form-item>
        <el-form-item :label="$t('filterAction')">
          <el-radio-group v-model="filterForm.action">
            <el-radio value="label">{{ $t('filterActionLabel') }}</el-radio>
            <el-radio value="read">{{ $t('filterActionRead') }}</el-radio>
            <el-radio value="spam">{{ $t('filterActionSpam') }}</el-radio>
            <el-radio value="trash">{{ $t('filterActionTrash') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('labelAs')" v-if="filterForm.action === 'label'">
          <el-select v-model="filterForm.targetLabel" style="width: 100%;">
            <el-option v-for="lbl in availableLabels" :key="lbl.name" :label="getLabelDisplayName(lbl.name, t)" :value="lbl.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="filterDialogVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="handleCreateFilter">{{ $t('createFilterBtn') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Show Original & Raw Headers Dialog -->
    <el-dialog v-model="rawHeadersDialogVisible" :title="$t('viewRawHeaders')" width="680px" class="raw-headers-dialog" append-to-body>
      <div class="raw-headers-modal-body" v-if="currentRawMsg">
        <el-tabs v-model="rawHeaderTab">
          <el-tab-pane :label="$t('summaryHeaders')" name="summary">
            <div class="raw-header-table">
              <div class="rht-row"><span class="rht-key">Message-ID</span><span class="rht-val">{{ currentRawMsg.messageId || currentRawMsg.emailId || 'N/A' }}</span></div>
              <div class="rht-row"><span class="rht-key">Created</span><span class="rht-val">{{ formatDetailDate(currentRawMsg.createTime) }}</span></div>
              <div class="rht-row"><span class="rht-key">From</span><span class="rht-val">{{ currentRawMsg.name ? `${currentRawMsg.name} <${currentRawMsg.sendEmail}>` : currentRawMsg.sendEmail }}</span></div>
              <div class="rht-row"><span class="rht-key">To</span><span class="rht-val">{{ formateReceive(currentRawMsg.recipient) }}</span></div>
              <div class="rht-row"><span class="rht-key">Subject</span><span class="rht-val">{{ currentRawMsg.subject || email.subject }}</span></div>
              <div class="rht-row"><span class="rht-key">Security</span><span class="rht-val">Standard Encryption (TLS 1.3 / AES-256)</span></div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="$t('rawEmlText')" name="raw">
            <pre class="raw-eml-pre">{{ getRawEmlText(currentRawMsg) }}</pre>
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <span class="dialog-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <el-button @click="copyRawEml(currentRawMsg)">
            <Icon icon="fluent:copy-16-regular" width="15" style="margin-right: 4px;" />
            {{ $t('copy') }}
          </el-button>
          <div>
            <el-button @click="rawHeadersDialogVisible = false">{{ $t('close') }}</el-button>
            <el-button type="primary" @click="handleDownloadEml(currentRawMsg)">
              <Icon icon="fluent:document-arrow-down-16-regular" width="15" style="margin-right: 4px;" />
              {{ $t('downloadEml') }}
            </el-button>
          </div>
        </span>
      </template>
    </el-dialog>

    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {reactive, ref, computed, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {
  emailDelete,
  emailRead,
  emailReportNotSpam,
  emailReportSpam,
  emailSetLabels,
  emailTranslate,
  emailSnooze
} from "@/request/email.js";
import { userSetCustomLabels } from "@/request/my.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import {hasPerm} from "@/perm/perm.js";
import {getLabelDisplayName} from "@/utils/label-i18n.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const userStore = useUserStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = emailStore.contentData.email
const showPreview = ref(false)
const srcList = reactive([])

const { t } = useI18n()

// Conversation Thread Messages
const threadMessages = computed(() => {
  if (email && email.threadEmails && email.threadEmails.length > 1) {
    return [...email.threadEmails].sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0) || a.emailId - b.emailId)
  }
  return email ? [email] : []
})

const expandedMap = reactive({})

function isMsgExpanded(emailId, index) {
  if (expandedMap[emailId] !== undefined) {
    return expandedMap[emailId]
  }
  // Default: latest message expanded, older messages collapsed
  return index === threadMessages.value.length - 1
}

function toggleMsg(emailId, index) {
  expandedMap[emailId] = !isMsgExpanded(emailId, index)
}

const isAllExpanded = computed(() => {
  return threadMessages.value.every((m, idx) => isMsgExpanded(m.emailId, idx))
})

function toggleExpandAll() {
  const target = !isAllExpanded.value
  threadMessages.value.forEach(m => {
    expandedMap[m.emailId] = target
  })
}

function openReplyMsg(msg) {
  uiStore.writerRef.openReply(msg || email)
}

function openForwardMsg(msg) {
  uiStore.writerRef.openForward(msg || email)
}

watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

onMounted(() => {
  if (emailStore.contentData.showUnread && email.unread === EmailUnreadEnum.UNREAD) {
    email.unread = EmailUnreadEnum.READ;
    emailRead([email.emailId], EmailUnreadEnum.READ).then(() => {
      emailStore.refreshSidebarStats();
    });
  }
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
})

function openReply() {
  uiStore.writerRef.openReply(email)
}

function openForward() {
  uiStore.writerRef.openForward(email)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  try {
    recipient = JSON.parse(recipient)
    return recipient.map(item => item.address).join(', ')
  } catch (e) {
    return recipient || ''
  }
}

function isRecipientMe(recipient) {
  if (emailStore.contentData.delType === 'physics' || router.currentRoute.value?.path === '/all-email') {
    return false;
  }
  const myEmail = (accountStore.currentAccount?.email || userStore.user?.email || '').toLowerCase().trim();
  if (!myEmail) return false;
  const formatted = formateReceive(recipient).toLowerCase();
  return formatted.includes(myEmail);
}

function getRecipientDisplay(recipient) {
  if (isRecipientMe(recipient)) {
    return t('toMe');
  }
  const rec = formateReceive(recipient);
  return rec ? t('toRecipient', { recipient: rec }) : t('toMe');
}

function getSenderDomain(sendEmail) {
  if (!sendEmail) return '';
  const match = sendEmail.match(/@([^>]+)/);
  return match ? match[1].replace('>', '').trim() : '';
}

function changeStar() {
  if (email.isStar) {
    email.isStar = 0;
    starCancel(email.emailId).then(() => {
      email.isStar = 0;
      emailStore.cancelStarEmailId = email.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.emailId])
    }).catch((e) => {
      console.error(e)
      email.isStar = 1;
    })
  } else {
    email.isStar = 1;
    starAdd(email.emailId).then(() => {
      email.isStar = 1;
      emailStore.addStarEmailId = email.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email)
    }).catch((e) => {
      console.error(e)
      email.isStar = 0;
    })
  }
}

const handleBack = () => {
  emailStore.contentData.email = null
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
        emailStore.refreshSidebarStats();
      })
    } else  {
      allEmailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
        emailStore.refreshSidebarStats();
      })
    }

    emailStore.contentData.email = null
  })
}

const handleReportSpam = () => {
  ElMessageBox.confirm(
    t('reportSpamConfirm'),
    t('reportSpam'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(() => {
    emailReportSpam([email.emailId]).then(() => {
      ElMessage({
        message: t('reportSpamSuccess'),
        type: 'success',
        plain: true,
      });
      emailStore.deleteIds = [email.emailId];
      emailStore.refreshSidebarStats();
      emailStore.contentData.email = null;
    }).catch(err => {
      console.error(err);
      ElMessage.error(t('operateFailedRetry'));
    });
  });
};

const handleToggleRead = () => {
  const newStatus = email.unread === EmailUnreadEnum.READ ? EmailUnreadEnum.UNREAD : EmailUnreadEnum.READ;
  emailRead([email.emailId], newStatus).then(() => {
    email.unread = newStatus;
    emailStore.refreshSidebarStats();
    ElMessage.success(newStatus === EmailUnreadEnum.UNREAD ? (t('markUnreadSuccess')) : (t('markReadSuccess')));
    if (newStatus === EmailUnreadEnum.UNREAD) {
      handleBack();
    }
  });
};

// Snooze Handling
const customSnoozeDialogVisible = ref(false);
const customSnoozeTime = ref('');

const handleQuickSnooze = (type) => {
  const pad = (n) => n.toString().padStart(2, '0');
  const formatTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  
  const now = new Date();
  let startTime = new Date();
  
  if (type === 'today') {
    startTime.setHours(18, 0, 0, 0);
    if (startTime <= now) {
      startTime = new Date(now.getTime() + 2 * 3600 * 1000);
    }
  } else if (type === 'tomorrow') {
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(9, 0, 0, 0);
  } else if (type === 'weekend') {
    const day = startTime.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    startTime.setDate(startTime.getDate() + diff);
    startTime.setHours(9, 0, 0, 0);
  } else if (type === 'nextweek') {
    const day = startTime.getDay();
    const diff = (8 - day) % 7 || 7;
    startTime.setDate(startTime.getDate() + diff);
    startTime.setHours(9, 0, 0, 0);
  }

  const endTime = new Date(startTime.getTime() + 3600 * 1000);
  const timeStr = formatTime(startTime);
  const endTimeStr = formatTime(endTime);

  emailSnooze([email.emailId], timeStr, endTimeStr).then(() => {
    ElMessage.success(t('snoozedSuccess'));
    emailStore.deleteIds = [email.emailId];
    emailStore.refreshSidebarStats();
    emailStore.contentData.email = null;
  });
};

const submitCustomSnooze = () => {
  if (!customSnoozeTime.value) {
    ElMessage.warning(t('selectTime'));
    return;
  }
  const start = new Date(customSnoozeTime.value);
  const end = new Date(start.getTime() + 3600 * 1000);
  const pad = (n) => n.toString().padStart(2, '0');
  const formatTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  
  emailSnooze([email.emailId], formatTime(start), formatTime(end)).then(() => {
    ElMessage.success(t('snoozedSuccess'));
    customSnoozeDialogVisible.value = false;
    emailStore.deleteIds = [email.emailId];
    emailStore.refreshSidebarStats();
    emailStore.contentData.email = null;
  });
};

// Labels Handling
const availableLabels = computed(() => {
  return (uiStore.allLabels || []).filter(l => l.name && l.name !== '系统设置');
});

const currentLabels = computed(() => {
  if (!email?.labels) return [];
  try {
    const parsed = JSON.parse(email.labels);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
});

const toggleLabelOnEmail = (labelName) => {
  let list = [...currentLabels.value];
  if (list.includes(labelName)) {
    list = list.filter(l => l !== labelName);
  } else {
    list.push(labelName);
  }
  email.labels = JSON.stringify(list);
  emailSetLabels(email.emailId, list).then(() => {
    ElMessage.success(t('labelUpdated'));
    emailStore.refreshSidebarStats();
  });
};

// Filter Messages Dialog
const filterDialogVisible = ref(false);
const filterForm = reactive({
  sender: '',
  subject: '',
  action: 'label',
  targetLabel: '',
});

const openFilterDialog = (msg) => {
  const target = msg || email;
  filterForm.sender = target?.sendEmail || '';
  filterForm.subject = target?.subject || email?.subject || '';
  filterForm.action = 'label';
  filterForm.targetLabel = availableLabels.value[0]?.name || 'Social';
  filterDialogVisible.value = true;
};

const handleCreateFilter = () => {
  const senderVal = (filterForm.sender || '').trim();
  if (!senderVal && !filterForm.subject) {
    ElMessage.warning(t('enterFilterConditions'));
    return;
  }

  let targetLabel = uiStore.allLabels.find(l => l.name === filterForm.targetLabel);
  if (filterForm.action === 'spam') {
    targetLabel = uiStore.allLabels.find(l => l.name === '黑名单' || l.name === '个人拦截');
    if (!targetLabel) {
      targetLabel = {
        id: Date.now().toString(),
        name: '黑名单',
        color: '#ef4444',
        icon: 'fluent:shield-dismiss-20-regular',
        listVis: false,
        actions: { targetFolder: 'spam', priority: 1, stopProcessing: true },
        rules: []
      };
      uiStore.allLabels.push(targetLabel);
    }
  } else if (filterForm.action === 'trash') {
    targetLabel = uiStore.allLabels.find(l => l.name === '自动删除');
    if (!targetLabel) {
      targetLabel = {
        id: Date.now().toString(),
        name: '自动删除',
        color: '#64748b',
        icon: 'fluent:delete-20-regular',
        listVis: false,
        actions: { targetFolder: 'trash', priority: 1, stopProcessing: true },
        rules: []
      };
      uiStore.allLabels.push(targetLabel);
    }
  }

  if (targetLabel) {
    if (!targetLabel.rules) targetLabel.rules = [];
    const condition = senderVal 
      ? { type: 'sender_includes', value: senderVal }
      : { type: 'subject_include', value: filterForm.subject };
    
    targetLabel.rules.push({
      id: Date.now().toString() + 'r',
      condition,
      exception: { type: 'none', value: '' }
    });

    if (filterForm.action === 'read') {
      if (!targetLabel.actions) targetLabel.actions = {};
      targetLabel.actions.markAsRead = true;
    }

    userSetCustomLabels(JSON.stringify({ allLabels: uiStore.allLabels })).then(() => {
      ElMessage.success(t('filterCreatedSuccess'));
      filterDialogVisible.value = false;
    });
  } else {
    filterDialogVisible.value = false;
  }
};

const handleMute = () => {
  let list = [...currentLabels.value];
  if (!list.includes('已静音')) {
    list.push('已静音');
  }
  email.labels = JSON.stringify(list);
  emailSetLabels(email.emailId, list).then(() => {
    ElMessage.success(t('muteSuccess'));
    handleBack();
  });
};

const handleArchive = () => {
  let list = [...currentLabels.value];
  if (!list.includes('已归档')) {
    list.push('已归档');
  }
  email.labels = JSON.stringify(list);
  emailSetLabels(email.emailId, list).then(() => {
    ElMessage.success(t('archiveSuccess'));
    emailStore.refreshSidebarStats();
    handleBack();
  });
};

const handleAddToTasks = () => {
  let list = [...currentLabels.value];
  if (!list.includes('任务待办')) {
    list.push('任务待办');
    email.labels = JSON.stringify(list);
    emailSetLabels(email.emailId, list).then(() => {
      emailStore.refreshSidebarStats();
    });
  }
  ElMessage.success(t('addedToTasks'));
};

const handleMoveTo = (target) => {
  if (target === 'spam') {
    handleReportSpam();
  } else if (target === 'trash') {
    handleDelete();
  } else if (target === 'inbox') {
    let list = currentLabels.value.filter(l => l !== '已归档' && l !== '垃圾邮件');
    email.labels = JSON.stringify(list);
    emailSetLabels(email.emailId, list).then(() => {
      ElMessage.success(t('moveToInbox'));
      emailStore.refreshSidebarStats();
    });
  }
};

const openReplyAllMsg = (msg) => {
  const target = msg || email;
  uiStore.writerRef.openReply(target);
};

const handlePrintAll = () => {
  window.print();
};

const printSingleMsg = (msg) => {
  const target = msg || email;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }
  const contentHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${target.subject || email.subject || 'Print Email'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 22px; font-weight: bold; margin-bottom: 8px; }
          .meta { font-size: 13px; color: #64748b; line-height: 1.6; }
          .body { font-size: 14px; line-height: 1.6; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${target.subject || email.subject || ''}</div>
          <div class="meta">
            <div><strong>From:</strong> ${target.name ? `${target.name} &lt;${target.sendEmail}&gt;` : target.sendEmail}</div>
            <div><strong>To:</strong> ${formateReceive(target.recipient)}</div>
            <div><strong>Date:</strong> ${formatDetailDate(target.createTime)}</div>
          </div>
        </div>
        <div class="body">
          ${target.content || target.text || ''}
        </div>
      </body>
    </html>
  `;
  printWindow.document.write(contentHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 300);
};

const handleOpenInNewWindow = () => {
  window.open(window.location.href, '_blank');
};

const handleDownloadEml = (msg) => {
  const target = msg || email;
  const emlContent = [
    `From: ${target.name ? `${target.name} <${target.sendEmail}>` : target.sendEmail}`,
    `To: ${formateReceive(target.recipient)}`,
    target.replyTo ? `Reply-To: ${target.replyTo}` : '',
    `Subject: ${target.subject || email.subject || 'No Subject'}`,
    `Date: ${new Date(target.createTime || Date.now()).toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    target.content || target.text || ''
  ].filter(line => line !== '').join('\r\n');

  const blob = new Blob([emlContent], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(target.subject || 'email').replace(/[\/\\?%*:|"<>]/g, '_')}.eml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  ElMessage.success(t('downloadEml'));
};

const rawHeadersDialogVisible = ref(false);
const rawHeaderTab = ref('summary');
const currentRawMsg = ref(null);

const handleViewRawHeaders = (msg) => {
  currentRawMsg.value = msg || email;
  rawHeadersDialogVisible.value = true;
};

const getRawEmlText = (msg) => {
  if (!msg) return '';
  return [
    `Delivered-To: ${formateReceive(msg.recipient)}`,
    `Received: by epomail.bond with SMTP id mail-${msg.emailId || '0'};`,
    `        ${new Date(msg.createTime || Date.now()).toUTCString()}`,
    `Return-Path: <${msg.sendEmail}>`,
    `From: ${msg.name ? `${msg.name} <${msg.sendEmail}>` : msg.sendEmail}`,
    `To: ${formateReceive(msg.recipient)}`,
    msg.replyTo ? `Reply-To: ${msg.replyTo}` : '',
    `Subject: ${msg.subject || email.subject || 'No Subject'}`,
    `Date: ${new Date(msg.createTime || Date.now()).toUTCString()}`,
    `Message-ID: <${msg.messageId || `mail.${msg.emailId || Date.now()}@epomail.bond`}>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Security: TLS 1.3 256-bit encryption`,
    '',
    msg.content || msg.text || ''
  ].filter(line => line !== '').join('\r\n');
};

const copyRawEml = (msg) => {
  const text = getRawEmlText(msg);
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success(t('copySuccess'));
  });
};

const handleHeaderMoreCommand = (command) => {
  if (command === 'filter') {
    openFilterDialog();
  } else if (command === 'mute') {
    handleMute();
  } else if (command === 'printAll') {
    handlePrintAll();
  } else if (command === 'forwardAll') {
    openForward();
  }
};

const handleMsgMoreCommand = (command, msg) => {
  if (command === 'reply') {
    openReplyMsg(msg);
  } else if (command === 'replyAll') {
    openReplyAllMsg(msg);
  } else if (command === 'forward') {
    openForwardMsg(msg);
  } else if (command === 'filter') {
    openFilterDialog(msg);
  } else if (command === 'spam') {
    handleReportSpam();
  } else if (command === 'print') {
    printSingleMsg(msg);
  } else if (command === 'downloadEml') {
    handleDownloadEml(msg);
  } else if (command === 'viewHeaders') {
    handleViewRawHeaders(msg);
  } else if (command === 'delete') {
    handleDelete();
  }
};

// Translation Handling
const showTranslateMap = reactive({});
const translatingMap = reactive({});
const isTranslatedMap = reactive({});
const translatedTextMap = reactive({});
const translatedHtmlMap = reactive({});
const showOriginalMap = reactive({});
const targetLangMap = reactive({});
const activeTranslationAbortControllers = reactive({});
const activeTranslationSeqMap = reactive({});

const displayedContent = (msg) => {
  if (!msg) return '';
  if (isTranslatedMap[msg.emailId] && !showOriginalMap[msg.emailId]) {
    const transHtml = translatedHtmlMap[msg.emailId];
    if (transHtml && /<[a-z][\s\S]*>/i.test(transHtml)) {
      return transHtml;
    }
    const transText = translatedTextMap[msg.emailId];
    if (transText) {
      return `<div class="translated-embed-body" style="color: inherit; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; padding: 4px 0;">${transText}</div>`;
    }
    return msg.content;
  }
  return msg.content;
};

const displayedText = (msg) => {
  if (!msg) return '';
  if (isTranslatedMap[msg.emailId] && !showOriginalMap[msg.emailId]) {
    return translatedTextMap[msg.emailId] || msg.text;
  }
  return msg.text;
};

const detectSourceLanguage = (content) => {
  if (!content) return 'en';
  const clean = content.replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ');

  const chineseChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
  const japaneseKana = (clean.match(/[\u3040-\u30ff]/g) || []).length;
  const koreanHangul = (clean.match(/[\uac00-\ud7af]/g) || []).length;
  const cyrillicChars = (clean.match(/[\u0400-\u04ff]/g) || []).length;
  const arabicChars = (clean.match(/[\u0600-\u06ff]/g) || []).length;
  const thaiChars = (clean.match(/[\u0e00-\u0e7f]/g) || []).length;

  if (japaneseKana >= 2) return 'ja';
  if (koreanHangul >= 2) return 'ko';
  if (cyrillicChars >= 3) return 'ru';
  if (arabicChars >= 3) return 'ar';
  if (thaiChars >= 3) return 'th';

  if (chineseChars >= 2) {
    const tradMatches = (clean.match(/[體點為國實學發電網麼這門說時後話開關與這裏讓當從會對應]/g) || []).length;
    const simpMatches = (clean.match(/[体点为国实学发电网么这门说时后话开关与这里让当从会对应]/g) || []).length;
    if (tradMatches > simpMatches && tradMatches >= 1) {
      return 'zh-Hant';
    }
    return 'zh';
  }

  const lower = clean.toLowerCase();
  const frCount = (lower.match(/\b(le|la|les|un|une|des|du|de|pour|avec|dans|sur|est|sont|cette|vous|nous|bonjour|merci)\b/g) || []).length;
  const deCount = (lower.match(/\b(der|die|das|und|in|den|von|zu|mit|sich|des|auf|für|ist|nicht|hallo|danke)\b/g) || []).length;
  const esCount = (lower.match(/\b(el|la|los|las|un|una|de|en|y|a|por|para|con|no|es|son|hola|gracias)\b/g) || []).length;

  if (frCount >= 3 && frCount > deCount && frCount > esCount) return 'fr';
  if (deCount >= 3 && deCount > frCount && deCount > esCount) return 'de';
  if (esCount >= 3 && esCount > frCount && esCount > deCount) return 'es';

  return 'en';
};

const isSameLanguage = (langA, langB) => {
  if (!langA || !langB) return false;
  if (langA === langB) return true;
  if (langA === 'zh' && (langB === 'zh-Hans' || langB === 'zh-CN')) return true;
  if (langA === 'zh-Hant' && (langB === 'zh-TW' || langB === 'zh-HK')) return true;
  return false;
};

const getAlternateTargetLanguage = (srcLang, preferredLang) => {
  if (srcLang === 'zh' || srcLang === 'zh-Hant') {
    return 'en';
  }
  if (srcLang === 'en') {
    return preferredLang && preferredLang !== 'en' ? preferredLang : 'fr';
  }
  return preferredLang && !isSameLanguage(srcLang, preferredLang) ? preferredLang : 'en';
};

const toggleTranslateBar = (msg) => {
  const target = msg || email;
  if (!target) return;
  const id = target.emailId;
  showTranslateMap[id] = !showTranslateMap[id];

  if (showTranslateMap[id]) {
    const userDefault = uiStore.defaultTranslateLang || 'zh';
    const rawContent = target.text || target.content || '';
    const srcLang = detectSourceLanguage(rawContent);

    // 检查源语言与默认目标语言是否相同
    const isSameLang = isSameLanguage(srcLang, userDefault);

    if (isSameLang) {
      // 原文已是默认目标语言：呼出翻译工具条而不会自动执行翻译，并提供合理的替代目标语言
      const altLang = getAlternateTargetLanguage(srcLang, userDefault);
      targetLangMap[id] = altLang;
      ElMessage.closeAll();
      ElMessage.info(t('alreadyInTargetLang'));
      return;
    }

    targetLangMap[id] = userDefault;
    if (!isTranslatedMap[id]) {
      handleTranslate(target);
    }
  }
};

const handleTranslate = (msg, isLanguageSwitch = false) => {
  const target = msg || email;
  if (!target) return;
  const id = target.emailId;

  // 1. 若当前邮件已有在途的旧翻译请求，立即主动终止旧请求并静默转到最新请求！
  if (activeTranslationAbortControllers[id]) {
    try {
      activeTranslationAbortControllers[id].abort();
    } catch (_) {}
    delete activeTranslationAbortControllers[id];
  }

  // 2. 生成请求唯一时间戳序号，确保若旧请求延时到达也彻底静默废弃
  const currentSeq = Date.now();
  activeTranslationSeqMap[id] = currentSeq;

  const rawContent = target.text || target.content || '';
  const srcLang = detectSourceLanguage(rawContent);
  let lang = targetLangMap[id] || uiStore.defaultTranslateLang || 'zh';

  // 严格禁止针对源语言翻译为原语言 (杜绝中文翻译为中文等无效调用)
  if (isSameLanguage(srcLang, lang)) {
    const altLang = getAlternateTargetLanguage(srcLang, uiStore.defaultTranslateLang);
    targetLangMap[id] = altLang;
    if (!isLanguageSwitch) {
      ElMessage.closeAll();
      ElMessage.warning(t('sameLangNotice'));
    }
    showTranslateMap[id] = true;
    translatingMap[id] = false;
    return;
  }

  translatingMap[id] = true;
  showTranslateMap[id] = true;

  const controller = new AbortController();
  activeTranslationAbortControllers[id] = controller;

  emailTranslate({
    text: target.text || '',
    html: target.content || '',
    targetLang: lang,
    enableOcr: Boolean(uiStore.enableImageOcr)
  }, { signal: controller.signal }).then((res) => {
    // 若序号落后（用户在未完成状态下切换了新语言），静默抛弃旧响应
    if (activeTranslationSeqMap[id] !== currentSeq) return;

    ElMessage.closeAll();
    const data = (res && res.data !== undefined) ? res.data : (res || {});
    const transText = (data.translatedText || '').trim();
    const transHtml = (data.translatedHtml || '').trim();
    if (!transText && !transHtml) {
      ElMessage.warning(t('translateEmpty'));
      return;
    }
    translatedTextMap[id] = transText;
    translatedHtmlMap[id] = transHtml;
    isTranslatedMap[id] = true;
    showOriginalMap[id] = false;
    ElMessage.success(t('translateSuccess'));
  }).catch(err => {
    // 若请求被新语言主动终止，静默处理：严禁弹窗、严禁报错提示，以最新请求为准
    if (activeTranslationSeqMap[id] !== currentSeq) return;
    if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
      return;
    }

    console.error('Translation error:', err);
    ElMessage.closeAll();
    ElMessage.error(t('translateFailed'));
  }).finally(() => {
    // 只有最新一次请求完成时，才重置正在翻译中加载状态
    if (activeTranslationSeqMap[id] === currentSeq) {
      translatingMap[id] = false;
      delete activeTranslationAbortControllers[id];
    }
  });
};

const toggleViewOriginal = (emailId) => {
  showOriginalMap[emailId] = !showOriginalMap[emailId];
};

const closeTranslate = (emailId) => {
  if (activeTranslationAbortControllers[emailId]) {
    try {
      activeTranslationAbortControllers[emailId].abort();
    } catch (_) {}
    delete activeTranslationAbortControllers[emailId];
  }
  translatingMap[emailId] = false;
  showTranslateMap[emailId] = false;
  showOriginalMap[emailId] = true;
};

const isReporting = ref(false)

const handleReportNotSpam = (emailId) => {
  const targetId = emailId || email.emailId
  if (isReporting.value) return;
  isReporting.value = true;
  emailReportNotSpam(targetId).then(() => {
    ElMessage({
      message: '已移至收件箱并加入信任名单',
      type: 'success',
      plain: true,
    })
    if (email.emailId === targetId) {
      email.isSpam = 0;
      if (email.labels) {
        try {
          let labs = JSON.parse(email.labels);
          if (Array.isArray(labs)) {
            labs = labs.filter(l => l !== '推销');
            email.labels = JSON.stringify(labs);
          }
        } catch (e) {}
      }
    }
    emailStore.deleteIds = [targetId]
    emailStore.contentData.email = null
    emailStore.refreshSidebarStats();
  }).catch((err) => {
    console.error(err);
    ElMessage({
      message: '操作失败，请重试',
      type: 'error',
      plain: true,
    })
  }).finally(() => {
    isReporting.value = false;
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
  font-size: 18px;

  .header-actions-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-actions-right {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
    color: var(--text-secondary, #64748b);
    transition: color 0.15s ease, transform 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &:hover {
      color: var(--text-primary, #0f172a);
      transform: scale(1.08);
    }
  }

  .action-icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1;
  }
}

.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;

    .email-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 0;
      color: var(--text-primary);
    }

    .email-labels-list {
      display: flex;
      align-items: center;
      gap: 6px;

      .subject-label-tag {
        border-radius: 4px;
        font-weight: 500;
      }
    }
  }

  .thread-messages-flow {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;

    .thread-msg-item {
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      overflow: hidden;
      transition: all 0.2s ease;

      &.is-collapsed {
        &:hover {
          background: var(--bg-hover, #f8fafc);
        }
      }

      &.is-last {
        border-color: var(--border-subtle, #e2e8f0);
      }
    }

    .thread-collapsed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      cursor: pointer;
      gap: 16px;

      .ch-left {
        display: flex;
        align-items: center;
        gap: 12px;
        overflow: hidden;
        flex: 1;

        .mini {
          font-size: 13px;
          flex-shrink: 0;
        }

        .ch-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .ch-snippet {
          font-size: 13px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .ch-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;

        .ch-date {
          font-size: 12px;
          color: var(--text-muted);
        }

        .ch-arrow {
          color: var(--text-muted);
        }
      }
    }

    .thread-expanded-body {
      padding: 16px;
      
      .email-info {
        border-bottom: 1px solid var(--border-subtle, #e2e8f0);
      }
    }
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

      .email-info {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid var(--light-border-color);
        margin-bottom: 20px;
        padding-bottom: 16px;
        @media (max-width: 1024px) {
          margin-bottom: 15px;
        }

        .sender-avatar {
          background: var(--el-color-primary);
          color: white;
          font-weight: bold;
          font-size: 18px;
        }

        .info-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .info-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          
          .sender-title-wrap {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .send-name-title {
            font-size: 16px;
            font-weight: bold;
            color: var(--el-text-color-primary);
          }

          .thread-header-bar {
            display: flex;
            align-items: center;
            gap: 12px;

            .date {
              color: var(--regular-text-color);
              font-size: 13px;
              white-space: nowrap;
            }

            .msg-header-quick-actions {
              display: flex;
              align-items: center;
              gap: 8px;

              .msg-act-star {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                flex-shrink: 0;
              }

              .msg-act-icon {
                cursor: pointer;
                color: var(--text-muted, #94a3b8);
                transition: color 0.15s ease, transform 0.15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                line-height: 1;
                vertical-align: middle;

                &:hover {
                  color: var(--text-primary, #0f172a);
                  transform: scale(1.1);
                }
              }
            }
          }
        }
        
        .info-middle {
          color: var(--regular-text-color);
          font-size: 13px;
        }

        .info-bottom {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: var(--secondary-text-color, #64748b);
          margin-top: 1px;

          .to-me-trigger {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            transition: background-color 0.15s ease;
            color: var(--text-secondary, #475569);
            user-select: none;

            &:hover {
              background-color: var(--bg-hover, rgba(0, 0, 0, 0.05));
              color: var(--text-primary, #0f172a);
            }

            .recipient-label {
              font-size: 12.5px;
              max-width: 320px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .to-me-arrow {
              font-size: 12px;
              color: var(--text-muted, #94a3b8);
              transition: transform 0.2s;
            }
          }
        }

        .email-msg {
          max-width: 400px;
          width: fit-content;
          margin-top: 15px;
        }

        .official-avatar {
          background: linear-gradient(135deg, #0284c7, #2563eb) !important;
          color: #ffffff !important;
        }

        .official-system-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(37, 99, 235, 0.08));
          border: 1px solid rgba(2, 132, 199, 0.25);
          border-radius: 10px;
          padding: 12px 16px;
          margin-top: 14px;
          gap: 16px;

          .banner-left {
            display: flex;
            align-items: center;
            gap: 12px;

            .banner-text {
              .banner-heading {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 700;
                color: var(--el-text-color-primary);

                .official-mini-tag {
                  background: linear-gradient(135deg, #0284c7, #2563eb);
                  border: none;
                  font-weight: 600;
                  border-radius: 4px;
                }
              }

              .banner-subtitle {
                font-size: 12px;
                color: var(--el-text-color-secondary);
                margin-top: 2px;
              }
            }
          }

          .banner-right {
            .expire-pill {
              font-size: 12px;
              border-radius: 6px;
            }
          }

          @media (max-width: 600px) {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        .spam-alert-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--el-color-warning-light-9);
          border: 1px solid var(--el-color-warning-light-5);
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: 16px;
          gap: 16px;

          .spam-alert-content {
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--el-color-warning-dark-2);
            font-size: 13px;
            line-height: 1.4;
          }

          @media (max-width: 600px) {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      }

      .inline-reply {
        display: flex;
        gap: 12px;
        margin-top: 30px;
        margin-bottom: 40px;
        
        .reply-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px;
          font-size: 14px;
        }
      }
      
      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }


.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}

.gmail-translate-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-elevated, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 6px;
  padding: 6px 12px;
  margin-top: 12px;
  gap: 12px;
  font-size: 13px;

  .gtb-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .gtb-icon {
      color: #0284c7;
      flex-shrink: 0;
    }

    .gtb-title {
      font-weight: 500;
      color: var(--text-primary, #1e293b);
      font-size: 12.5px;
    }

    .gtb-select {
      width: 120px;
    }
  }

  .gtb-right {
    display: flex;
    align-items: center;

    .gtb-status-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11.5px;
      font-weight: 500;
      color: #0284c7;
      background: rgba(2, 132, 199, 0.1);
      padding: 2px 8px;
      border-radius: 10px;
      margin-right: 8px;
    }

    .gtb-close {
      cursor: pointer;
      color: var(--text-muted, #94a3b8);
      transition: color 0.15s ease;
      &:hover {
        color: var(--text-primary, #0f172a);
      }
    }
  }
}

.translated-box {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 20px;

  .translated-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #0284c7;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px dashed var(--border-subtle, #e2e8f0);
  }

  .translated-text {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-primary, #1e293b);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

:deep(.gmail-details-popover) {
  padding: 12px 14px !important;
  border-radius: 8px !important;
}

.gmail-details-card {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #1e293b);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .detail-row {
    display: flex;
    align-items: baseline;
    gap: 8px;

    .dt-label {
      color: var(--text-muted, #64748b);
      width: 60px;
      flex-shrink: 0;
      text-align: right;
      font-size: 12.5px;
    }

    .dt-val {
      flex: 1;
      word-break: break-all;
      color: var(--text-primary, #0f172a);
      font-size: 13px;

      &.security-tls {
        display: flex;
        align-items: center;
        gap: 5px;
      }
    }
  }
}

.snooze-quick-menu, .label-quick-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .snooze-menu-title, .label-menu-title, .move-menu-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    padding: 4px 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .snooze-menu-item, .label-menu-item, .move-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary, #1e293b);
    transition: background 0.15s ease;

    &:hover {
      background: var(--bg-hover, rgba(0, 0, 0, 0.05));
    }

    .label-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .label-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.raw-headers-modal-body {
  .raw-header-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    .rht-row {
      display: flex;
      padding: 6px 10px;
      background: var(--el-fill-color-light);
      border-radius: 6px;
      .rht-key {
        width: 110px;
        font-weight: 600;
        color: var(--text-secondary);
        flex-shrink: 0;
      }
      .rht-val {
        color: var(--text-primary);
        word-break: break-all;
      }
    }
  }

  .raw-eml-pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
}
</style>
