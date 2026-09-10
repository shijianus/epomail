<template>
  <div class="perm-box">
    <div class="header-actions">
      <div class="action-btn-group">
        <el-tooltip :content="$t('addRoleTitle')" placement="bottom">
          <div class="action-btn-pill" @click="openAddRole">
            <Icon class="icon-btn" icon="ion:add-outline" width="20" height="20"/>
          </div>
        </el-tooltip>
        <el-tooltip :content="$t('refresh')" placement="bottom">
          <div class="action-btn-pill" @click="refresh">
            <Icon class="icon-btn" icon="ion:reload" width="17" height="17"/>
          </div>
        </el-tooltip>
      </div>

      <el-button size="small" type="primary" plain class="hierarchy-btn" @click="hierarchyVisible = true">
        <Icon icon="lucide:shield-check" width="16" height="16" style="margin-right: 4px;" />
        架构与分级一览
      </el-button>

    </div>

    <el-scrollbar class="perm-scrollbar">
      <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
           :style="first ? 'background: transparent' : ''">
        <loading/>
      </div>
      <el-table
          :data="roles"
          style="height: 100%;"
          :empty-text="''"
      >
        <el-table-column width="12"/>
        <el-table-column :label="$t('role')" prop="name" :min-width="roleWidth">
          <template #default="props">
            <div class="role-name-cell">
              <span class="role-title">{{ props.row.name }}</span>
              <span v-if="getRoleBadge(props.row)" class="custom-badge-wrapper">
                <span class="custom-role-badge" :style="getRoleBadgeStyle(props.row)">
                  {{ getRoleBadge(props.row).text }}
                </span>
              </span>
              <span v-if="props.row.isDefault"><el-tag size="small" effect="dark" class="role-tag def-tag">{{ $t('default') }}</el-tag></span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="存储配额" width="140">
          <template #default="props">
            <div class="quota-badge">
              <Icon icon="lucide:hard-drive" width="14" height="14" class="col-ic" />
              <span v-if="props.row.roleCode === 'master'" class="quota-master">无限制</span>
              <span v-else-if="props.row.storageQuotaMb === 0" class="quota-zero">0 MB</span>
              <span v-else class="quota-val">{{ formatQuotaDisplay(props.row.storageQuotaMb, props.row.roleCode) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="发件上限" width="130">
          <template #default="props">
            <div class="send-badge">
              <Icon icon="lucide:send" width="13" height="13" class="col-ic" />
              <span v-if="props.row.sendType === 'ban'" class="text-banned">禁止发信</span>
              <span v-else-if="props.row.sendType === 'day'">{{ props.row.sendCount }} 封/天</span>
              <span v-else-if="props.row.sendType === 'internal'">仅限站内</span>
              <span v-else-if="props.row.sendCount === 0 || !props.row.sendCount">无限制</span>
              <span v-else>累计 {{ props.row.sendCount }} 封</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="附件权限" width="140">
          <template #default="props">
            <el-tag v-if="props.row.allowAttachment === 1" size="small" type="success" effect="light" class="att-tag">
              <Icon icon="lucide:paperclip" width="12" height="12" style="margin-right: 4px;" />
              开放附件
            </el-tag>
            <el-tag v-else size="small" type="info" effect="plain" class="att-tag">
              <Icon icon="lucide:file-text" width="12" height="12" style="margin-right: 4px;" />
              仅纯文本
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="AI 授权模型" min-width="160">
          <template #default="props">
            <div v-if="props.row.aiModels && props.row.aiModels.length > 0" class="role-ai-models-tags" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <el-tag v-for="m in props.row.aiModels.slice(0, 2)" :key="m" size="small" type="primary" effect="plain" style="font-size: 11px;">
                {{ m }}
              </el-tag>
              <el-tag v-if="props.row.aiModels.length > 2" size="small" type="info" effect="plain" style="font-size: 11px;">
                +{{ props.row.aiModels.length - 2 }}
              </el-tag>
            </div>
            <span v-else style="font-size: 12px; color: var(--el-text-color-secondary);">跟随全局 (全部)</span>
          </template>
        </el-table-column>

        <el-table-column :label="$t('order')" :width="sortWidth" prop="sort"/>

        <el-table-column v-if="desShow" :label="$t('description')" min-width="180" prop="description">
          <template #default="props">
            <div class="description" :title="props.row.description">
              <span>{{ props.row.description }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="$t('tabSetting')" :width="settingWidth" align="right">
          <template #default="props">
            <el-dropdown trigger="click">
              <el-button size="small" type="primary">{{ $t('action') }}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item 
                    :disabled="isModeratorSelf(props.row) || (!isMaster && props.row.roleCode === 'master')"
                    @click="openRoleSet(props.row)"
                  >
                    {{ $t('change') }}
                  </el-dropdown-item>
                  <el-dropdown-item 
                    :disabled="props.row.isDefault === 1 || props.row.roleCode === 'visitor'"
                    @click="setDef(props.row)"
                  >
                    {{ $t('default') }}
                  </el-dropdown-item>
                  <el-dropdown-item 
                    :disabled="props.row.isDefault === 1 || props.row.roleCode === 'master' || props.row.roleCode === 'visitor' || isModeratorSelf(props.row)"
                    @click="delRole(props.row)"
                  >
                    {{ $t('delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </el-scrollbar>

    <el-dialog class="dialog role-form-dialog" v-model="roleFormShow" @closed="resetForm" :width="'min(860px, 95vw)'" align-center>
      <template #header>
        <div class="dialog-title-bar">
          <span style="font-size: 16.5px; font-weight: 600;">{{ dialogType.title }}</span>
          <el-popover width="340" :title="t('featDesc')" placement="bottom">
            <template #reference>
              <Icon class="warning" icon="fe:warning" width="18" height="18"/>
            </template>
            <div style="font-weight: bold; margin-bottom: 2px;">{{ t('emailInterception') }}</div>
            <div>{{ t('emailInterceptionDesc') }}</div>
            <div style="font-weight: bold; margin-top: 10px; margin-bottom: 2px;">{{ t('availableDomains') }}</div>
            <div>{{ t('availableDomainsDesc') }}</div>
          </el-popover>
        </div>
      </template>

      <div class="dialog-box role-edit-grid">
        <!-- Left Column: Attributes & Templates -->
        <div class="modal-col-left">
          <!-- Preset Templates Selector -->
          <div class="preset-templates">
            <div class="preset-label">
              <Icon icon="lucide:sparkles" width="13" height="13" style="color: #6366f1; margin-right: 4px;" />
              快捷套用系统分组模板：
            </div>
            <div class="preset-chips">
              <el-button size="small" round @click="applyTemplate('visitor')">参观者</el-button>
              <el-button size="small" round @click="applyTemplate('user_base')">普通用户</el-button>
              <el-button size="small" round @click="applyTemplate('user_lv0')">普通用户 LV.0</el-button>
              <el-button size="small" round @click="applyTemplate('user_lv1')">普通用户 LV.1</el-button>
              <el-button size="small" round @click="applyTemplate('moderator')">协管者</el-button>
              <el-button size="small" round @click="applyTemplate('master')">站长</el-button>
            </div>
          </div>

          <div class="form-row">
            <el-input class="dialog-input" v-model="form.name" type="text" :maxlength="16" :placeholder="$t('roleName')" autocomplete="off"/>
            <el-input class="dialog-input" v-model="form.roleCode" type="text" :maxlength="20" placeholder="分组代码 (如 user_lv0)" autocomplete="off"/>
          </div>

          <!-- Tag Text & Tag Color Customizer -->
          <div class="form-row tag-picker-row">
            <el-input class="dialog-input" v-model="form.tagText" type="text" :maxlength="10" placeholder="自订标签 (如 活跃学者)" autocomplete="off">
              <template #prefix>
                <Icon icon="lucide:tag" width="14" height="14" style="color: var(--text-muted);" />
              </template>
            </el-input>
            <div class="color-picker-box">
              <el-color-picker v-model="form.tagColor" size="default" :predefine="['#6366f1','#10b981','#06b6d4','#f59e0b','#ef4444','#8b5cf6','#64748b']" />
              <span class="color-label" :style="{ color: form.tagColor || 'var(--text-secondary)' }">色彩</span>
            </div>
          </div>

          <el-input class="dialog-input" v-model="form.description" :maxlength="60" type="text" :placeholder="$t('description')" autocomplete="off"/>

          <!-- Quota & Attachment Grid -->
          <div class="form-grid-pair">
            <div class="pair-item">
              <div class="pair-label">默认存储配额 (MB)</div>
              <el-input-number 
                v-model="form.storageQuotaMb" 
                :min="0" 
                :max="102400" 
                controls-position="right" 
                style="width: 100%;" 
              />
            </div>

            <div class="pair-item">
              <div class="pair-label">允许发送邮件附件</div>
              <div class="switch-box">
                <el-switch 
                  v-model="form.allowAttachment" 
                  :active-value="1" 
                  :inactive-value="0" 
                  active-text="开放附件" 
                  inactive-text="仅纯文本"
                />
              </div>
            </div>
          </div>

          <!-- Ban Email & Avail Domain -->
          <div class="form-row">
            <el-input-tag class="dialog-input" tag-type="warning" v-model="form.banEmail"
                          @add-tag="banEmailAddTag" type="text" :placeholder="$t('emailInterception')" autocomplete="off"/>
            <el-select
                class="dialog-input"
                v-model="form.availDomain"
                multiple
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                tag-type="success"
                :placeholder="$t('availableDomains')"
                @change="availDomainChange"
            >
              <el-option
                  v-for="item in domainOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>

          <!-- AI 模型分级授权 (Allowed AI Models Hierarchy) -->
          <div class="form-row">
            <el-select
                class="dialog-input role-ai-models-select"
                v-model="form.aiModels"
                multiple
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                tag-type="primary"
                placeholder="允许调用的 AI 模型 (留空代表允许全部)"
                style="width: 100%;"
            >
              <el-option
                  v-for="item in roleAiModelOptions"
                  :key="item.value"
                  :label="item.value"
                  :value="item.value"
              >
                <div class="role-model-opt-wrapper">
                  <span class="role-model-opt-name">{{ item.value }}</span>
                  <span v-if="item.badge" class="role-model-opt-badge" :class="item.badgeType">{{ item.badge }}</span>
                </div>
              </el-option>
            </el-select>
          </div>

          <div class="dialog-input" style="margin-bottom: 0;">
            <el-input-number :placeholder="$t('order')" :min="0" :max="9999" v-model.number="form.sort"
                             controls-position="right" autocomplete="off" style="width: 100%;" />
          </div>
        </div>

        <!-- Right Column: Permission Tree & Save Button -->
        <div class="modal-col-right">
          <!-- Permission Tree Header -->
          <div class="perm-tree-header">
            <div class="perm-title-group">
              <Icon icon="lucide:shield-check" class="perm-header-ic" width="16" height="16" />
              <span class="perm-title">权限分配细则</span>
              <span class="perm-count-badge">{{ locale === 'zh' ? `已选 ${checkedPermsCount} 项` : `${checkedPermsCount} Selected` }}</span>
            </div>
            <div class="perm-header-actions">
              <el-button link type="primary" size="small" class="expand-toggle-btn" @click="toggleExpandAll">
                <Icon :icon="expandAll ? 'lucide:chevrons-down-up' : 'lucide:chevrons-up-down'" width="14" height="14" style="margin-right: 3px;" />
                {{ expandAll ? '全部收起' : '全部展开' }}
              </el-button>
            </div>
          </div>

          <div class="perm-tree-wrap">
            <el-scrollbar class="perm-tree-scrollbar">
              <el-tree
                  :expand-on-click-node="false"
                  :check-on-click-node="false"
                  ref="tree"
                  :data="treeList"
                  show-checkbox
                  node-key="permId"
                  :default-expand-all="true"
                  :props="{ label: 'name' }"
                  @check="updateCheckedPermsCount"
              >
                <template #default="{ node, data }">
                  <div class="tree-node-content">
                    <span class="tree-node-label" :title="node.label">{{ node.label }}</span>
                    <span class="send-num" v-if="data.permKey === 'email:send'" @click.stop>
                      <el-input-number v-if="form.sendType === 'day' || form.sendType === 'count'" v-model="form.sendCount" controls-position="right" :min="0" :max="99999" size="small"
                                       :placeholder="$t('total')">
                      </el-input-number>
                      <el-select v-model="form.sendType" placeholder="Select" size="small"
                                 :style="`min-width: ${ locale === 'zh' ? 96 : 110 }px; width: auto; margin-left: 5px;`">
                        <el-option :label="$t('total')" value="count"/>
                        <el-option :label="$t('daily')" value="day"/>
                        <el-option :label="$t('internal')" value="internal"/>
                        <el-option :label="$t('btnBan')" value="ban"/>
                      </el-select>
                    </span>
                    <span class="send-num" v-if="data.permKey === 'account:add'" @click.stop>
                      <el-input-number v-model="form.accountCount" controls-position="right" :min="0" :max="99999"
                                       size="small" :placeholder="$t('total')">
                      </el-input-number>
                    </span>
                  </div>
                </template>
              </el-tree>
            </el-scrollbar>
          </div>

          <el-button class="btn btn-save-role" type="primary" :loading="permLoading" @click="roleFormClick">
            <Icon icon="lucide:check" width="16" height="16" style="margin-right: 6px;" />
            {{ $t('save') }}
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- Role Hierarchy & Blog Integration Modal -->
    <el-dialog
      v-model="hierarchyVisible"
      class="role-hierarchy-dialog"
      width="880px"
      top="4vh"
      title="EpoMail 权限控制模板与书友分级全景一览"
      align-center
    >
      <div class="hierarchy-container">
        <!-- Banner Intro -->
        <div class="hierarchy-intro">
          <div class="intro-left">
            <div class="intro-title">开源体验 · 阶梯式赋能 · 博客深度协同</div>
            <div class="intro-desc">
              系统预置 6 大基础管理与用户分组。读者在 <strong>blog.epomail.com</strong> (shijianus-blog) 的阅读与讨论将自动转化为 EpoMail 的配额跃升与特权解锁。
            </div>
          </div>
          <div class="intro-right">
            <el-button type="primary" size="default" :loading="syncingBlog" @click="handleSyncBlogTier">
              <Icon icon="lucide:refresh-cw" width="14" height="14" style="margin-right: 6px;" />
              一键同步博客等级
            </el-button>
          </div>
        </div>

        <!-- 6 Core Groups Grid -->
        <div class="roles-grid">
          <div class="role-card role-card-visitor">
            <div class="card-top">
              <span class="card-badge bg-cyan">1. 参观者 (Visitor)</span>
              <span class="card-quota">0 MB (外接DB)</span>
            </div>
            <div class="card-summary">开源巡检与交互演示用户，不分配存储空间(需外置DB)。拥有后台设置查看权限，交互配置仅供体验，不持久化保存。</div>
            <div class="card-props">
              <div class="prop-item"><Icon icon="lucide:x" class="text-danger" /> 附件发送：禁止</div>
              <div class="prop-item"><Icon icon="lucide:send" class="text-muted" /> 外发上限：0 封 (禁用)</div>
              <div class="prop-item"><Icon icon="lucide:eye" class="text-success" /> 管理端：只读沙箱体验</div>
            </div>
          </div>

          <div class="role-card role-card-base">
            <div class="card-top">
              <span class="card-badge bg-blue">2. 普通用户 (Base)</span>
              <span class="card-quota">5 MB 配额</span>
            </div>
            <div class="card-summary">系统默认注册用户，无后台管理权限，具备基础邮箱收发能力，纯文本收发，无附件能力。</div>
            <div class="card-props">
              <div class="prop-item"><Icon icon="lucide:file-text" class="text-info" /> 仅纯文本收发</div>
              <div class="prop-item"><Icon icon="lucide:send" class="text-primary" /> 每日上限：5 封/天</div>
              <div class="prop-item"><Icon icon="lucide:shield-off" class="text-muted" /> 无管理后台权限</div>
            </div>
          </div>

          <div class="role-card role-card-lv0">
            <div class="card-top">
              <span class="card-badge bg-amber">3. 普通用户 LV.0</span>
              <span class="card-quota">10 MB 配额</span>
            </div>
            <div class="card-summary">已注册并绑定 blog.epomail.com 博客书友账号的用户，注册即刻自动升级，尊享配额提升。</div>
            <div class="card-props">
              <div class="prop-item"><Icon icon="lucide:file-text" class="text-info" /> 纯文本极速收发</div>
              <div class="prop-item"><Icon icon="lucide:send" class="text-primary" /> 每日上限：8 封/天</div>
              <div class="prop-item"><Icon icon="lucide:link" class="text-amber" /> 博客账号认证绑定</div>
            </div>
          </div>

          <div class="role-card role-card-lv1">
            <div class="card-top">
              <span class="card-badge bg-emerald">4. 普通用户 LV.1</span>
              <span class="card-quota">25 MB 配额</span>
            </div>
            <div class="card-summary">参与 blog.epomail.com 活跃讨论的书友分组，加入 10 天且发表 3 条有效讨论即可晋升，正式解锁附件权限！</div>
            <div class="card-props">
              <div class="prop-item"><Icon icon="lucide:paperclip" class="text-success" /> <strong>解锁附件与图片发送</strong></div>
              <div class="prop-item"><Icon icon="lucide:send" class="text-primary" /> 每日上限：10 封/天</div>
              <div class="prop-item"><Icon icon="lucide:award" class="text-success" /> 博客活跃学者认证</div>
            </div>
          </div>

          <div class="role-card role-card-mod">
            <div class="card-top">
              <span class="card-badge bg-purple">5. 协管者/管理员</span>
              <span class="card-quota">500 MB 配额</span>
            </div>
            <div class="card-summary">非站长管理员，拥有细分模块管理权限，默认管理权限完备，但<strong>无权修改自身分组管理权限与站长权限</strong>。</div>
            <div class="card-props">
              <div class="prop-item"><Icon icon="lucide:check" class="text-success" /> 支持附件与大容量</div>
              <div class="prop-item"><Icon icon="lucide:send" class="text-primary" /> 每日上限：100 封/天</div>
              <div class="prop-item"><Icon icon="lucide:lock" class="text-danger" /> 严格禁止自封与提权</div>
            </div>
          </div>

          <div class="role-card role-card-master">
            <div class="card-top">
              <span class="card-badge bg-gold">6. 站长 (Master)</span>
              <span class="card-quota">1024 MB (无限制)</span>
            </div>
            <div class="card-summary">全站最高权力拥有者，拥有全模块、全接口无限制管控权力，全功能自由调度。</div>
            <div class="card-props">
              <div class="prop-item"><Icon icon="lucide:crown" class="text-gold" /> 最高管理主权</div>
              <div class="prop-item"><Icon icon="lucide:infinity" class="text-primary" /> 发信与存储无限制</div>
              <div class="prop-item"><Icon icon="lucide:sparkles" class="text-purple" /> 全局底座治理</div>
            </div>
          </div>
        </div>

        <!-- Blog Grading Roadmap Section -->
        <div class="blog-grading-section">
          <div class="grading-header">
            <Icon icon="lucide:book-open" width="18" height="18" style="color: #6366f1; margin-right: 6px;" />
            <span>blog.epomail.com 书友等级进阶规则（与邮局权益联动）</span>
          </div>
          <div class="grading-table-wrap">
            <table class="grading-table">
              <thead>
                <tr>
                  <th>等级称号</th>
                  <th>博客达成要求</th>
                  <th>邮局对应分组</th>
                  <th>特权与配额提升</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="badge-pill pill-lv0">LV.0 认证书友</span></td>
                  <td>在博客注册并绑定账号（即刻达成）</td>
                  <td>普通用户 LV.0</td>
                  <td>10MB 存储，8封/天发信，纯文本收发</td>
                </tr>
                <tr>
                  <td><span class="badge-pill pill-lv1">LV.1 活跃学者</span></td>
                  <td>注册满 10 天，发表 3 条讨论评论（或阅读 100 分钟）</td>
                  <td>普通用户 LV.1</td>
                  <td><strong>25MB 存储，10封/天发信，解锁附件发送</strong></td>
                </tr>
                <tr>
                  <td><span class="badge-pill pill-lv2">LV.2 资深贡献者</span></td>
                  <td>注册满 90 天，获得 30 个社区点赞或发表 20 条优质讨论</td>
                  <td>普通用户 LV.2 (进阶)</td>
                  <td>50MB 存储，20封/天发信，优先发信通道</td>
                </tr>
                <tr>
                  <td><span class="badge-pill pill-lv3">LV.3 终身学者</span></td>
                  <td>注册满 180 天，累计获得 100 个点赞，精选作者</td>
                  <td>普通用户 LV.3 (至尊)</td>
                  <td>100MB 存储，50封/天发信，全功能极速通道</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {computed, defineOptions, nextTick, onBeforeUnmount, onMounted, reactive, ref} from "vue";
import {roleAdd, roleDelete, rolePermTree, roleRoleList, roleSet, roleSetDef} from "@/request/role.js";
import {settingQuery, websiteConfig} from "@/request/setting.js";
import {userSyncBlogLevel} from "@/request/user.js";
import loading from '@/components/loading/index.vue';
import {hasPerm} from "@/perm/perm.js";
import {useRoleStore} from "@/store/role.js";
import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {isDomain, isEmail} from "@/utils/verify-utils.js";
import {useI18n} from "vue-i18n";
import {ElMessage, ElMessageBox} from "element-plus";

defineOptions({
  name: 'role'
})

const settingStore = useSettingStore();
const {domainList} = settingStore;
const {t, locale} = useI18n();
const userStore = useUserStore();
const roleStore = useRoleStore();
const roleFormShow = ref(false);
const hierarchyVisible = ref(false);
const syncingBlog = ref(false);
const treeList = reactive([]);
const roles = ref([]);
const tree = ref(null);
const permLoading = ref(false);
const tableLoading = ref(false);
const desShow = ref(true);
const settingWidth = ref(null);
const sortWidth = ref(null);
const roleWidth = ref(240);
const first = ref(true);

const isVisitor = computed(() => {
  const r = userStore.user?.role;
  return r?.roleCode === 'visitor' || r?.key === 'visitor' || r?.name === '参观者';
});

const isMaster = computed(() => {
  return userStore.user?.type === 0 || userStore.user?.role?.roleCode === 'master' || userStore.user?.role?.name === '站长' || userStore.user?.permKeys?.includes('*');
});

const isModerator = computed(() => {
  return !isMaster.value && (userStore.user?.role?.roleCode === 'moderator' || userStore.user?.role?.name?.includes('协管'));
});

function isModeratorSelf(roleRow) {
  if (isMaster.value) return false;
  return isModerator.value && userStore.user?.type === roleRow.roleId;
}

const dialogType = reactive({
  title: '',
  type: ''
});

const form = reactive({
  name: null,
  roleCode: 'custom',
  tagText: '',
  tagColor: '#6366f1',
  description: null,
  storageQuotaMb: 5,
  allowAttachment: 0,
  banEmail: [],
  sendType: 'day',
  sendCount: 5,
  accountCount: 1,
  sort: 0,
  isDefault: 0,
  availDomain: [],
  aiModels: []
});

function fetchFreshSettings() {
  if (hasPerm('setting:query')) {
    settingQuery().then(data => {
      if (data) {
        if (typeof settingStore.setSettings === 'function') {
          settingStore.setSettings(data);
        } else {
          settingStore.settings = { ...settingStore.settings, ...data };
          if (data.domainList) settingStore.domainList = data.domainList;
        }
      }
    }).catch(() => {});
  } else {
    websiteConfig().then(data => {
      if (data) {
        if (data.domainList) settingStore.domainList = data.domainList;
        if (typeof settingStore.setSettings === 'function') {
          settingStore.setSettings(data);
        } else {
          settingStore.settings = { ...settingStore.settings, ...data };
        }
      }
    }).catch(() => {});
  }
}

const roleAiModelOptions = computed(() => {
  const currentSetting = settingStore.settings || settingStore.setting || {};
  const primaryModel = (currentSetting.aiModel || '').trim();
  const poolStr = (currentSetting.aiModels || '').trim();
  const poolModels = poolStr ? poolStr.split(',').map(m => m.trim()).filter(Boolean) : [];

  const optionsMap = new Map();

  // 1. 系统设置中的主推理模型 (Primary Model)
  if (primaryModel) {
    optionsMap.set(primaryModel, {
      value: primaryModel,
      label: primaryModel,
      badge: '主推理模型',
      badgeType: 'primary'
    });
  }

  // 2. 系统设置中被选定的可用多模型池 (aiModels)
  poolModels.forEach(m => {
    if (!optionsMap.has(m)) {
      optionsMap.set(m, {
        value: m,
        label: m,
        badge: '系统模型池',
        badgeType: 'pool'
      });
    }
  });

  // 3. 当前角色正在编辑已分配的模型 (确保已有分配模型在下拉中正常呈现与回显)
  if (Array.isArray(form.aiModels)) {
    form.aiModels.forEach(m => {
      const clean = typeof m === 'string' ? m.trim() : '';
      if (clean && !optionsMap.has(clean)) {
        optionsMap.set(clean, {
          value: clean,
          label: clean,
          badge: '已分配',
          badgeType: 'assigned'
        });
      }
    });
  }

  // 4. 所有角色列表中已分配过的模型
  if (Array.isArray(roles.value)) {
    roles.value.forEach(r => {
      const rModels = Array.isArray(r.aiModels) ? r.aiModels : (typeof r.aiModels === 'string' && r.aiModels ? r.aiModels.split(',') : []);
      rModels.forEach(m => {
        const clean = typeof m === 'string' ? m.trim() : '';
        if (clean && !optionsMap.has(clean)) {
          optionsMap.set(clean, {
            value: clean,
            label: clean,
            badge: '角色专属',
            badgeType: 'role'
          });
        }
      });
    });
  }

  // 5. 零配置时的保底：仅提供 Workers AI 权威官方模型
  if (optionsMap.size === 0) {
    optionsMap.set('@cf/meta/llama-3.1-8b-instruct', {
      value: '@cf/meta/llama-3.1-8b-instruct',
      label: '@cf/meta/llama-3.1-8b-instruct',
      badge: 'Workers AI 默认',
      badgeType: 'default'
    });
  }

  return Array.from(optionsMap.values());
});

function formatQuotaDisplay(mb, roleCode) {
  if (roleCode === 'master') return '无限制';
  if (!mb || mb === 0) return '0 MB';
  if (mb >= 1024) {
    const gb = mb / 1024;
    return (Number.isInteger(gb) ? gb : Number(gb.toFixed(1))) + ' GB';
  }
  return mb + ' MB';
}

function getRoleBadge(row) {
  if (row.tagText && row.tagText !== 'tag_text') {
    return { text: row.tagText, color: row.tagColor && row.tagColor !== 'tag_color' ? row.tagColor : '#6366f1' };
  }
  const defaults = {
    visitor: { text: '开源体验', color: '#6366f1' },
    user_base: { text: '基础成员', color: '#64748b' },
    user_lv0: { text: '认证书友', color: '#10b981' },
    user_lv1: { text: '活跃学者', color: '#06b6d4' },
    moderator: { text: '协同管理', color: '#f59e0b' },
    master: { text: '最高统领', color: '#ef4444' }
  };
  return defaults[row.roleCode] || (row.name ? { text: '自定义组', color: '#8b5cf6' } : null);
}

function getRoleBadgeStyle(row) {
  const badge = getRoleBadge(row);
  if (!badge) return {};
  return {
    color: badge.color,
    borderColor: badge.color + '44',
    backgroundColor: badge.color + '18'
  };
}

const domainOptions = computed(() => {
  const list = settingStore.domainList || [];
  return list.map(domain => {
    const cleanDomain = domain.replace(/^@/, '');
    return {label: cleanDomain, value: cleanDomain};
  });
});

const expandAll = ref(true);
const checkedPermsCount = ref(0);
let chooseRole = {};

function updateCheckedPermsCount() {
  if (!tree.value) return;
  const checked = tree.value.getCheckedKeys(true) || [];
  checkedPermsCount.value = checked.length;
}

function toggleExpandAll() {
  expandAll.value = !expandAll.value;
  if (!tree.value?.store) return;
  const nodes = tree.value.store.nodesMap;
  for (const key in nodes) {
    nodes[key].expanded = expandAll.value;
  }
}

fetchFreshSettings();
refresh();

rolePermTree().then(treeRes => {
  treeList.push(...treeRes);
});

function availDomainChange() {
  const index = form.availDomain.findIndex(domain => {
    return !(domainOptions.value || []).map(option => option.value).includes(domain);
  });
  if (index > -1) {
    form.availDomain.splice(index, 1);
  }
}

function banEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  form.banEmail.splice(form.banEmail.length - 1, 1);

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email) || email === '*') && !form.banEmail.includes(email)) {
      form.banEmail.push(email);
    }
  });
}

function selectPermsByKeys(keys) {
  if (!tree.value) return;
  if (keys.includes('*')) {
    const allIds = [];
    function collect(nodes) {
      nodes.forEach(n => {
        allIds.push(n.permId);
        if (n.children && n.children.length) collect(n.children);
      });
    }
    collect(treeList);
    tree.value.setCheckedKeys(allIds);
    updateCheckedPermsCount();
    return;
  }
  const matchedIds = [];
  function search(nodes) {
    nodes.forEach(n => {
      if (keys.includes(n.permKey)) {
        matchedIds.push(n.permId);
      }
      if (n.children && n.children.length) search(n.children);
    });
  }
  search(treeList);
  tree.value.setCheckedKeys(matchedIds);
  updateCheckedPermsCount();
}

function applyTemplate(type) {
  switch(type) {
    case 'visitor':
      form.name = '参观者';
      form.roleCode = 'visitor';
      form.tagText = '开源体验';
      form.tagColor = '#6366f1';
      form.description = '开源体验与巡检用户，全功能UI交互沙箱，无持久化写入权限，配额0MB';
      form.storageQuotaMb = 0;
      form.allowAttachment = 0;
      form.sendType = 'ban';
      form.sendCount = 0;
      form.accountCount = 0;
      form.sort = 1;
      selectPermsByKeys(['setting:query', 'role:query', 'analysis:query', 'user:query', 'reg-key:query']);
      break;
    case 'user_base':
      form.name = '普通用户';
      form.roleCode = 'user_base';
      form.tagText = '基础成员';
      form.tagColor = '#64748b';
      form.description = '默认注册用户，具备基础使用权限，纯文本收发(无附件)，每日5封上限';
      form.storageQuotaMb = 5;
      form.allowAttachment = 0;
      form.sendType = 'day';
      form.sendCount = 5;
      form.accountCount = 1;
      form.sort = 2;
      selectPermsByKeys(['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']);
      break;
    case 'user_lv0':
      form.name = '普通用户 LV.0';
      form.roleCode = 'user_lv0';
      form.tagText = '认证书友';
      form.tagColor = '#10b981';
      form.description = '已注册/绑定 blog.epomail.com 博客用户，配额提升至10MB，每日8封发信权';
      form.storageQuotaMb = 10;
      form.allowAttachment = 0;
      form.sendType = 'day';
      form.sendCount = 8;
      form.accountCount = 2;
      form.sort = 3;
      selectPermsByKeys(['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']);
      break;
    case 'user_lv1':
      form.name = '普通用户 LV.1';
      form.roleCode = 'user_lv1';
      form.tagText = '活跃学者';
      form.tagColor = '#06b6d4';
      form.description = '参与博客讨论与活跃互动的进阶用户，配额25MB，每日10封，开放附件发送权限';
      form.storageQuotaMb = 25;
      form.allowAttachment = 1;
      form.sendType = 'day';
      form.sendCount = 10;
      form.accountCount = 3;
      form.sort = 4;
      selectPermsByKeys(['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']);
      break;
    case 'moderator':
      form.name = '协管者/管理员';
      form.roleCode = 'moderator';
      form.tagText = '协同管理';
      form.tagColor = '#f59e0b';
      form.description = '非站长管理员，具备细分管控权限，无权修改自身权限与站长权限';
      form.storageQuotaMb = 500;
      form.allowAttachment = 1;
      form.sendType = 'day';
      form.sendCount = 100;
      form.accountCount = 10;
      form.sort = 5;
      selectPermsByKeys([
        'email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete',
        'user:query', 'user:add', 'user:reset-send', 'user:set-pwd', 'user:set-status', 'user:set-type',
        'all-email:query', 'setting:query', 'role:query', 'analysis:query'
      ]);
      break;
    case 'master':
      form.name = '站长';
      form.roleCode = 'master';
      form.tagText = '最高统领';
      form.tagColor = '#ef4444';
      form.description = '全站最高权力拥有者，全功能不受限';
      form.storageQuotaMb = 1024;
      form.allowAttachment = 1;
      form.sendType = 'count';
      form.sendCount = 0;
      form.accountCount = 0;
      form.sort = 6;
      selectPermsByKeys(['*']);
      break;
  }
}

function roleFormClick() {
  if (dialogType.type === 'add') {
    addRole();
  } else {
    setRole();
  }
}

function setDef(role) {
  roleSetDef(role.roleId).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    });
    getRoleList();
  });
}

function delRole(role) {
  ElMessageBox.confirm(t('delConfirm', {msg: role.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('confirm'),
    type: 'warning'
  }).then(() => {
    roleDelete(role.roleId).then(() => {
      ElMessage({
        message: t('copySuccessMsg'),
        type: "success",
        plain: true
      });
      getRoleList();
      userStore.refreshUserList();
      roleStore.refreshSelect();
    });
  });
}

function expandChange(e) {
  if (!tree.value) return;
  if (tree.value.store) {
    tree.value.store.accordion = !e;
  }
  const nodes = tree.value.store.nodesMap;
  for (const key in nodes) {
    nodes[key].expanded = !!e;
  }
}

function setRole() {
  if (!form.name) {
    ElMessage({
      message: t('emptyRoleNameMsg'),
      type: "error",
      plain: true
    });
    return;
  }

  const params = {...form, roleId: chooseRole.roleId};
  const checkedLeafIds = tree.value ? tree.value.getCheckedKeys(true) : [];
  const halfId = tree.value ? tree.value.getHalfCheckedKeys() : [];
  const checkedParentIds = tree.value ? tree.value.getCheckedKeys(false).filter(id => !checkedLeafIds.includes(id)) : [];
  params.permIds = [...checkedLeafIds, ...halfId, ...checkedParentIds];

  permLoading.value = true;
  roleSet(params).then((res) => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    });

    const names = roles.value.map(role => role.name);
    if (!names.includes(params.name)) {
      roleStore.refreshSelect();
    }

    roleFormShow.value = false;
    getRoleList();
  }).finally(() => {
    permLoading.value = false;
  });
}

function resetForm() {
  form.name = null;
  form.roleCode = 'custom';
  form.tagText = '';
  form.tagColor = '#6366f1';
  form.description = null;
  form.storageQuotaMb = 5;
  form.allowAttachment = 0;
  form.sort = 0;
  form.sendType = 'day';
  form.sendCount = 5;
  form.accountCount = 1;
  form.banEmail = [];
  form.availDomain = [];
  form.aiModels = [];
  expandAll.value = true;
  checkedPermsCount.value = 0;
  if (tree.value) {
    tree.value.setCheckedKeys([]);
  }
}

function openRoleSet(role) {
  fetchFreshSettings();
  chooseRole = role;
  dialogType.title = t('changeRoleTitle');
  dialogType.type = 'set';
  roleFormShow.value = true;
  expandAll.value = true;
  form.sort = role.sort;
  form.name = role.name;
  form.roleCode = role.roleCode || role.key || 'custom';
  form.tagText = role.tagText || '';
  form.tagColor = role.tagColor || '#6366f1';
  form.description = role.description;
  form.storageQuotaMb = role.storageQuotaMb !== undefined ? Number(role.storageQuotaMb) : 5;
  form.allowAttachment = role.allowAttachment !== undefined ? Number(role.allowAttachment) : 0;
  form.sendType = role.sendType || 'day';
  form.sendCount = role.sendCount || 0;
  form.accountCount = role.accountCount || 0;
  form.banEmail = role.banEmail || [];
  form.availDomain = role.availDomain || [];
  form.aiModels = Array.isArray(role.aiModels) ? [...role.aiModels] : (typeof role.aiModels === 'string' && role.aiModels ? role.aiModels.split(',').map(s => s.trim()).filter(Boolean) : []);
  nextTick(() => {
    tree.value?.setCheckedKeys(role.permIds || []);
    updateCheckedPermsCount();
  });
}

function openAddRole() {
  fetchFreshSettings();
  dialogType.title = t('addRoleTitle');
  dialogType.type = 'add';
  resetForm();
  roleFormShow.value = true;
  expandAll.value = true;
  nextTick(() => {
    updateCheckedPermsCount();
  });
}

function addRole() {
  const params = {...form};
  const checkedLeafIds = tree.value ? tree.value.getCheckedKeys(true) : [];
  const halfId = tree.value ? tree.value.getHalfCheckedKeys() : [];
  const checkedParentIds = tree.value ? tree.value.getCheckedKeys(false).filter(id => !checkedLeafIds.includes(id)) : [];
  params.permIds = [...checkedLeafIds, ...halfId, ...checkedParentIds];

  permLoading.value = true;
  roleAdd(params).then(() => {
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    });
    roleFormShow.value = false;
    getRoleList();
    roleStore.refreshSelect();
  }).finally(() => {
    permLoading.value = false;
  });
}

function refresh() {
  fetchFreshSettings();
  tableLoading.value = true;
  roles.length = 0;
  getRoleList();
}

function getRoleList() {
  roleRoleList().then(list => {
    roles.value = list;
  }).finally(() => {
    tableLoading.value = false;
    setTimeout(() => {
      first.value = false;
    }, 200);
  });
}

function handleSyncBlogTier() {
  syncingBlog.value = true;
  userSyncBlogLevel().then(res => {
    if (res?.message) {
      ElMessage({
        message: res.message,
        type: res.synced ? "success" : "info",
        plain: true
      });
    }
    getRoleList();
    userStore.refreshUserList?.();
  }).catch(e => {
    console.warn('handleSyncBlogTier error:', e);
  }).finally(() => {
    syncingBlog.value = false;
  });
}

function adjustWidth() {
  desShow.value = window.innerWidth > 767;
  settingWidth.value = window.innerWidth < 480 ? (locale.value === 'en' ? 85 : 75) : null;
  sortWidth.value = window.innerWidth < 480 ? 75 : null;
  roleWidth.value = window.innerWidth < 480 ? 180 : 240;
}

adjustWidth();

let resizeTimer = null;
const handleResize = () => {
  if (resizeTimer) return;
  resizeTimer = requestAnimationFrame(() => {
    adjustWidth();
    resizeTimer = null;
  });
};

onMounted(() => {
  fetchFreshSettings();
  window.addEventListener('resize', handleResize, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped lang="scss">
.perm-box {
  height: 100%;
  overflow: hidden;
  width: 100%;

  .perm-scrollbar {
    height: 100%;
  }
}

.header-actions {
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  border-radius: 10px 10px 0 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  font-size: 16px;
  flex-wrap: wrap;

  .action-btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn-pill {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--bg-surface-variant, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--text-primary, #4b5563);

    &:hover {
      background: var(--primary-color-light, rgba(99, 102, 241, 0.12));
      border-color: rgba(99, 102, 241, 0.35);
      color: #6366f1;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.18);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .hierarchy-btn {
    font-weight: 500;
    border-radius: 8px;
    height: 32px;
  }
}

.moderator-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #7c3aed;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  margin-left: auto;
}

.role-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  .role-title {
    font-weight: 600;
    color: var(--text-primary, #1f2937);
  }

  .role-tag {
    height: 20px;
    font-size: 11px;
    padding: 0 6px;
  }

  .def-tag {
    background: #6366f1;
    border-color: #6366f1;
  }
}

.custom-badge-wrapper {
  display: inline-flex;
  align-items: center;
}

.custom-role-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  white-space: nowrap;
  line-height: 18px;
}

.quota-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  line-height: 20px;
  height: 22px;
  white-space: nowrap !important;
  word-break: keep-all !important;
  color: var(--text-secondary, #4b5563);

  .col-ic {
    color: var(--text-muted, #9ca3af);
    flex-shrink: 0;
  }

  .quota-zero {
    color: #9ca3af;
    font-weight: 500;
  }

  .quota-master {
    color: #ef4444;
    font-weight: 700;
    background: rgba(239, 68, 68, 0.1);
    padding: 0 7px;
    height: 20px;
    line-height: 18px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .quota-val {
    font-weight: 600;
    color: var(--text-primary, #1f2937);
  }
}

.send-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap !important;
  color: var(--text-secondary, #4b5563);

  .col-ic {
    color: var(--text-muted, #9ca3af);
    flex-shrink: 0;
  }

  .text-banned {
    color: #ef4444;
    font-weight: 500;
  }
}

.att-tag {
  display: inline-flex;
  align-items: center;
  white-space: nowrap !important;
  padding: 0 8px;
  font-size: 11.5px;
  border-radius: 6px;
}

.description {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-muted, #6b7280);
  font-size: 13px;
}

.loading {
  height: calc(100% - 41px);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  background: var(--loadding-background);
  z-index: 2;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

/* Preset Template Buttons */
.preset-templates {
  height: 98px;
  min-height: 98px;
  max-height: 98px;
  box-sizing: border-box;
  background: var(--bg-elevated, #f8fafc);
  border: 1px dashed var(--border-mid, #cbd5e1);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 0 !important;
  overflow: hidden;
  flex-shrink: 0;

  .preset-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary, #475569);
    margin-bottom: 6px;
    height: 18px;
    line-height: 18px;
    display: flex;
    align-items: center;
  }

  .preset-chips {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    width: 100%;

    :deep(.el-button),
    .el-button {
      margin: 0 !important;
      margin-left: 0 !important;
      width: 100% !important;
      height: 26px !important;
      padding: 0 4px !important;
      font-size: 11.5px !important;
      font-weight: 500;
      border-radius: 13px !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-sizing: border-box;
      background: var(--bg-surface, #ffffff);
      border-color: var(--border-subtle, #e2e8f0);
      color: var(--text-primary, #334155);
      transition: all 0.15s ease;

      &:hover {
        background: var(--primary-color-light, rgba(99, 102, 241, 0.08));
        border-color: var(--accent-primary, #6366f1);
        color: var(--accent-primary, #6366f1);
        transform: translateY(-1px);
      }
    }
  }
}

.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;

  > * {
    flex: 1 1 0%;
    min-width: 0;
    width: 100%;
  }

  .dialog-input {
    margin-bottom: 0 !important;
  }
}

.tag-picker-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .color-picker-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-elevated, #f8fafc);
    border: 1px solid var(--border-subtle, #e2e8f0);
    border-radius: 8px;
    padding: 0 8px;
    height: 38px;
    flex-shrink: 0;

    .color-label {
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
    }
  }
}

.form-grid-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;

  .pair-item {
    background: var(--bg-elevated, #f8fafc);
    border: 1px solid var(--border-subtle, #e2e8f0);
    border-radius: 8px;
    padding: 8px 12px;
  }

  .pair-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary, #475569);
    margin-bottom: 6px;
  }

  .switch-box {
    height: 32px;
    display: flex;
    align-items: center;
  }

  .pair-tip {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    margin-top: 4px;
  }
}

/* 2-Column Dialog Layout (Zero Scrollbar & Centered) */
:deep(.el-dialog:not(.role-hierarchy-dialog):not(.role-form-dialog)) {
  margin: auto !important;
  width: 520px !important;
  border-radius: 14px;
  @media (max-width: 540px) {
    width: calc(100% - 32px) !important;
    margin: 16px !important;
  }
}

:deep(.el-dialog.role-form-dialog) {
  width: min(860px, 95vw) !important;
  border-radius: 16px;
  overflow: visible !important;
  margin: auto !important;

  .dialog-title-bar {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .el-dialog__body {
    padding: 16px 22px 22px;
    overflow: visible !important;
  }

  .el-select__wrapper {
    .el-select__placeholder {
      white-space: nowrap !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }
    .el-select__selected-item,
    .el-select__tags-text {
      max-width: none !important;
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: normal !important;
    }
  }
}

.role-edit-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 20px;
  align-items: stretch; /* Strict equal-height alignment for both columns */

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

.modal-col-left {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .preset-templates,
  .form-row,
  .form-grid-pair,
  .dialog-input {
    margin-bottom: 0 !important;
  }
}

.modal-col-right {
  display: flex;
  flex-direction: column;
  height: 100%; /* Match left column height */

  .perm-tree-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    height: 32px;
    flex-shrink: 0;

    .perm-title-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;

      .perm-header-ic {
        color: var(--accent-primary, #6366f1);
      }

      .perm-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary, #475569);
      }

      .perm-count-badge {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 12px;
        background: rgba(99, 102, 241, 0.1);
        color: var(--accent-primary, #6366f1);
        font-weight: 500;
        letter-spacing: 0.2px;
      }
    }

    .perm-actions {
      display: flex;
      align-items: center;

      .expand-toggle-btn {
        font-size: 11.5px;
        color: var(--accent-primary, #6366f1);
        padding: 0 4px;
        height: 24px;

        &:hover {
          color: #4f46e5;
          background: rgba(99, 102, 241, 0.08);
        }
      }
    }
  }

  .perm-tree-wrap {
    border: 1px solid var(--border-subtle, #e2e8f0);
    border-radius: 10px;
    background: var(--bg-elevated, #f8fafc);
    height: 372px;
    min-height: 372px;
    max-height: 372px;
    flex: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;

    .perm-tree-scrollbar {
      height: 100% !important;
      max-height: 100% !important;
      width: 100%;

      :deep(.el-scrollbar__wrap),
      :deep(.el-scrollbar__wrap--hidden-default) {
        height: 100% !important;
        max-height: 372px !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scrollbar-width: none;
        -ms-overflow-style: none;
        &::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
          display: none !important;
        }
      }

      :deep(.el-scrollbar__view) {
        padding: 8px 10px;
      }

      :deep(.el-scrollbar__bar.is-vertical) {
        width: 5px;
        right: 2px;
        opacity: 0;
        transition: opacity 0.25s ease;

        .el-scrollbar__thumb {
          background-color: rgba(99, 102, 241, 0.35);
          border-radius: 4px;
          transition: background-color 0.2s ease;

          &:hover {
            background-color: var(--accent-primary, #6366f1);
          }
        }
      }

      &:hover,
      &:focus-within {
        :deep(.el-scrollbar__bar.is-vertical) {
          opacity: 0.85;
        }
      }
    }

    :deep(.el-tree) {
      background: transparent !important;
      color: var(--text-primary);
    }

    :deep(.el-tree-node__content) {
      border-radius: 6px;
      margin: 2px 0;
      padding-right: 8px;
      min-height: 32px;
      height: auto;
      color: var(--text-primary);
      transition: background-color 0.15s ease;

      &:hover {
        background: var(--bg-hover, #f1f5f9) !important;
      }
    }

    :deep(.el-tree-node:focus > .el-tree-node__content) {
      background: var(--bg-hover, #f1f5f9) !important;
    }
  }

  .btn.btn-save-role {
    width: 100%;
    margin-top: 12px;
    height: 40px;
    font-weight: 600;
    font-size: 14px;
    border-radius: 8px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
    transition: all 0.2s ease;

    &:hover {
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.tree-node-content {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;

  .tree-node-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
}

.send-num {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-left: 8px;

  .el-input-number {
    width: 90px;
  }
}

/* Hierarchy Modal Styles */
:deep(.el-dialog.role-hierarchy-dialog) {
  width: min(880px, 94vw) !important;
  border-radius: 16px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;

  .el-dialog__body {
    padding: 16px 20px 24px;
    overflow-y: auto;
    max-height: calc(85vh - 60px);
  }
}

.hierarchy-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hierarchy-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  padding: 14px 18px;
  gap: 16px;

  .intro-title {
    font-size: 15px;
    font-weight: 700;
    color: #4f46e5;
    margin-bottom: 4px;
  }

  .intro-desc {
    font-size: 12.5px;
    color: var(--text-secondary, #475569);
    line-height: 1.5;
  }
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.role-card {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-badge {
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 6px;
  }

  .bg-cyan { background: #e0f2fe; color: #0369a1; }
  .bg-blue { background: #dbeafe; color: #1d4ed8; }
  .bg-amber { background: #fef3c7; color: #b45309; }
  .bg-emerald { background: #d1fae5; color: #047857; }
  .bg-purple { background: #f3e8ff; color: #7e22ce; }
  .bg-gold { background: #fef9c3; color: #a16207; }

  .card-quota {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
  }

  .card-summary {
    font-size: 11.5px;
    color: var(--text-secondary, #475569);
    line-height: 1.45;
    min-height: 34px;
  }

  .card-props {
    border-top: 1px dashed var(--border-subtle, #e2e8f0);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--text-muted, #64748b);

    .prop-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
  }
}

.blog-grading-section {
  background: var(--bg-surface, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 12px;
  padding: 14px 16px;

  .grading-header {
    display: flex;
    align-items: center;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-primary, #1e293b);
    margin-bottom: 10px;
  }

  .grading-table-wrap {
    overflow-x: auto;
  }

  .grading-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;

    th, td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid var(--border-subtle, #e2e8f0);
    }

    th {
      font-weight: 600;
      color: var(--text-secondary, #64748b);
      background: var(--bg-base, #f1f5f9);
    }

    td {
      color: var(--text-primary, #334155);
    }

    .badge-pill {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
    }

    .pill-lv0 { background: #fef3c7; color: #b45309; }
    .pill-lv1 { background: #d1fae5; color: #047857; }
    .pill-lv2 { background: #e0e7ff; color: #4338ca; }
    .pill-lv3 { background: #fae8ff; color: #86198f; }
  }
}

.text-success { color: #10b981; }
.text-danger { color: #ef4444; }
.text-primary { color: #3b82f6; }
.text-info { color: #0ea5e9; }
.text-amber { color: #f59e0b; }
.text-purple { color: #8b5cf6; }
.text-gold { color: #d97706; }
.text-muted { color: #94a3b8; }

/* Dark mode theme adaptations */
:global(html.dark) {
  .header-actions {
    background: var(--bg-surface, #1e293b) !important;
    border-bottom-color: var(--border-subtle, #334155) !important;
  }

  .action-btn-pill {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.12) !important;
    color: #e2e8f0 !important;

    &:hover {
      background: rgba(99, 102, 241, 0.25) !important;
      border-color: rgba(99, 102, 241, 0.5) !important;
      color: #818cf8 !important;
    }
  }

  .preset-templates,
  .form-grid-pair .pair-item,
  .modal-col-right .perm-tree-wrap,
  .tag-picker-row .color-picker-box {
    background: var(--bg-elevated, #1e293b) !important;
    border-color: var(--border-subtle, rgba(99, 102, 241, 0.18)) !important;
  }

  .preset-templates {
    .preset-chips {
      :deep(.el-button),
      .el-button {
        background: rgba(255, 255, 255, 0.05) !important;
        border-color: rgba(255, 255, 255, 0.12) !important;
        color: #e2e8f0 !important;

        &:hover {
          background: rgba(99, 102, 241, 0.25) !important;
          border-color: rgba(99, 102, 241, 0.5) !important;
          color: #818cf8 !important;
        }
      }
    }
  }

  .modal-col-right .perm-tree-wrap {
    .perm-tree-scrollbar {
      :deep(.el-scrollbar__bar.is-vertical) {
        .el-scrollbar__thumb {
          background-color: rgba(129, 140, 248, 0.45) !important;

          &:hover {
            background-color: #818cf8 !important;
          }
        }
      }
    }

    :deep(.el-tree) {
      background: transparent !important;
      color: var(--text-primary, #f8fafc) !important;
    }

    :deep(.el-tree-node__content) {
      color: var(--text-primary, #f8fafc) !important;
      &:hover {
        background: var(--bg-hover, #1f293d) !important;
      }
    }

    :deep(.el-tree-node:focus > .el-tree-node__content) {
      background: var(--bg-hover, #1f293d) !important;
    }
  }

  .perm-title-group {
    .perm-title {
      color: #f8fafc !important;
    }
    .perm-count-badge {
      background: rgba(99, 102, 241, 0.22) !important;
      color: #a5b4fc !important;
    }
  }

  .role-card {
    background: var(--bg-surface, #1e293b) !important;
    border-color: var(--border-subtle, #334155) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25) !important;
  }

  .bg-cyan { background: rgba(14, 165, 233, 0.18) !important; color: #38bdf8 !important; }
  .bg-blue { background: rgba(59, 130, 246, 0.18) !important; color: #60a5fa !important; }
  .bg-amber { background: rgba(245, 158, 11, 0.18) !important; color: #fbbf24 !important; }
  .bg-emerald { background: rgba(16, 185, 129, 0.18) !important; color: #34d399 !important; }
  .bg-purple { background: rgba(139, 92, 246, 0.18) !important; color: #c084fc !important; }
  .bg-gold { background: rgba(234, 179, 8, 0.18) !important; color: #fde047 !important; }

  .blog-grading-section {
    background: var(--bg-surface, #1e293b) !important;
    border-color: var(--border-subtle, #334155) !important;

    .grading-table th {
      background: rgba(255, 255, 255, 0.05) !important;
      color: #94a3b8 !important;
    }

    .grading-table td {
      color: #e2e8f0 !important;
      border-bottom-color: rgba(255, 255, 255, 0.08) !important;
    }
  }

  .quota-val {
    color: #e2e8f0 !important;
  }
}
</style>

<style lang="scss">
.role-model-opt-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 10px;

  .role-model-opt-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
  }

  .role-model-opt-badge {
    flex-shrink: 0;
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 4px;
    font-weight: 600;
    line-height: 1.4;

    &.primary {
      background: rgba(99, 102, 241, 0.12);
      color: #6366f1;
      border: 1px solid rgba(99, 102, 241, 0.24);
    }
    &.pool {
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
      border: 1px solid rgba(16, 185, 129, 0.24);
    }
    &.assigned, &.role {
      background: rgba(245, 158, 11, 0.12);
      color: #d97706;
      border: 1px solid rgba(245, 158, 11, 0.24);
    }
    &.default {
      background: rgba(100, 116, 139, 0.12);
      color: #64748b;
      border: 1px solid rgba(100, 116, 139, 0.24);
    }
  }
}

html.dark {
  .role-model-opt-wrapper {
    .role-model-opt-badge {
      &.primary {
        background: rgba(99, 102, 241, 0.22);
        color: #818cf8;
        border-color: rgba(99, 102, 241, 0.35);
      }
      &.pool {
        background: rgba(16, 185, 129, 0.22);
        color: #34d399;
        border-color: rgba(16, 185, 129, 0.35);
      }
      &.assigned, &.role {
        background: rgba(245, 158, 11, 0.22);
        color: #fbbf24;
        border-color: rgba(245, 158, 11, 0.35);
      }
      &.default {
        background: rgba(148, 163, 184, 0.22);
        color: #94a3b8;
        border-color: rgba(148, 163, 184, 0.35);
      }
    }
  }
}
</style>
