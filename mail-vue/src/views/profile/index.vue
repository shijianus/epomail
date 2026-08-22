<template>
  <div class="settings-container">
    <!-- Dynamic Aurora Background -->
    <div class="aurora-bg">
      <div class="aurora-1"></div>
      <div class="aurora-2"></div>
      <div class="aurora-3"></div>
    </div>
    
    <div id="float-tooltip" ref="floatTooltip"></div>
    <div style="height: 64px; flex-shrink: 0; width: 100%; position: relative; z-index: 101; background: var(--bg-base); border-bottom: 1px solid var(--border-subtle);">
      <Header :isProfile="true" />
    </div>
    
    <div class="loading" :class="loading ? 'loading-show' : 'loading-hide'">
      <loading/>
    </div>
    
    <el-scrollbar class="scroll" v-if="!loading" style="height: calc(100% - 64px - 28px);">
      <div class="scroll-body">
        <div class="cover-photo" :style="profileData.userInfo.backgroundUrl ? 'background-image: url(' + profileData.userInfo.backgroundUrl + '); background-size: cover; background-position: center;' : ''"></div>
        <div class="desktop-layout">
          <!-- Left Side: Identity -->
      <div class="profile-identity">
        <div class="avatar" :style="profileData.userInfo.avatarUrl ? 'background-image: url(' + profileData.userInfo.avatarUrl + '); background-size: cover; background-position: center;' : ''">
          <span v-if="!profileData.userInfo.avatarUrl">{{ profileData.userInfo.avatarInitials }}</span>
          <div class="verified-badge">
            <svg class="ic-fill" style="width:20px; height:20px;" viewBox="0 0 24 24"><path d="M22.5 12.5c0-.67-.2-1.33-.57-1.89l1.45-2.02c.32-.44.38-1.01.15-1.5-.23-.49-.71-.8-1.25-.8h-2.47c-.43 0-.82-.24-1.02-.63l-1.1-2.22c-.25-.5-.73-.83-1.29-.89-.55-.06-1.1.17-1.46.61l-1.6 1.94c-.4.49-1.02.77-1.66.77s-1.26-.28-1.66-.77l-1.6-1.94c-.36-.44-.91-.67-1.46-.61-.56.06-1.04.39-1.29.89l-1.1 2.22c-.2-.39-.59.63-1.02-.63H3.74c-.54 0-1.02.31-1.25.8-.23.49-.17 1.06-.15-1.5l1.45 2.02c.37.56.57 1.22.57 1.89 0 .67-.2 1.33-.57 1.89l-1.45 2.02c-.32.44-.38 1.01-.15 1.5.23.49.71.8 1.25.8h2.47c.43 0 .82.24 1.02.63l1.1 2.22c.25.5.73.83 1.29.89.55.06 1.1-.17 1.46-.61l1.6-1.94c.4-.49 1.02-.77 1.66-.77s1.26.28 1.66.77l1.6 1.94c.36.44.91.67 1.46.61.56-.06 1.04-.39 1.29-.89l1.1-2.22c.2-.39.59-.63 1.02-.63h2.47c.54 0 1.02-.31 1.25-.8.23-.49.17-1.06-.15-1.5l-1.45-2.02c-.37-.56-.57-1.22-.57-1.89zM10.82 17.5l-4.52-4.52 1.41-1.41 3.11 3.11 7.21-7.21 1.41 1.41-8.62 8.62z"></path></svg>
          </div>
        </div>
        
        <div class="name-block">
          <h1 class="name">
            <span v-if="profileData.userInfo.nickname"><strong>{{ profileData.userInfo.nickname }}</strong>({{ profileData.userInfo.account }})</span>
            <span v-else>{{ profileData.userInfo.account }}</span>
          </h1>
          <div class="handle">
            <Icon class="ic" icon="lucide:mail" style="margin-right: 6px;" />
            {{ profileData.userInfo.email }}
          </div>
        </div>

        <p class="bio" v-html="parseInlineMarkdown(profileData.userInfo.bio || (profileData.userInfo.roleName === 'admin' ? 'EpoMail 系统管理员，负责核心平台的维护与安全。我们在数字世界中连接彼此，保护每一次灵感的传递与思想的交汇。为您带来前所未有的纯净沟通体验。' : 'EpoMail 专属用户，致力于安全、高效的邮件通讯。我们在数字世界中连接彼此，保护每一次灵感的传递与思想的交汇。为您带来前所未有的纯净沟通体验。'))"></p>

        <!-- Bottom Section: Fixed to bottom -->
        <div class="bottom-section" style="margin-top: auto;">
          <!-- Detailed Subtitle Tags -->
          <div class="sub-tags-list" style="margin-bottom: 16px;">
            <div class="sub-tag-item">
              <Icon class="ic" icon="lucide:globe" />
              所在时区：{{ timezoneString }}
            </div>
            <div class="sub-tag-item">
              <Icon class="ic" icon="lucide:shield" />
              所属身份组：{{ profileData.userInfo.roleName }}
            </div>
            <div class="sub-tag-item">
              <Icon class="ic" icon="lucide:calendar" />
              加入时间：{{ dayjs(profileData.userInfo.joinTime).format('YYYY年M月') }}
            </div>
          </div>

          <el-button type="primary" size="large" style="width: 100%; border-radius: 12px; height: 48px;" @click="handleContact">
            <Icon icon="lucide:send" class="ic" style="margin-right: 8px;" />
            发送邮件联系我
          </el-button>
        </div>
      </div>

      <!-- Right Side: Analytics Dashboard -->
      <div class="profile-analysis">
        
        <div class="section-heading">账户数据与分析看板</div>

        <!-- Top Gradient Cards -->
        <div class="stats-row">
          <div class="stat-card blue">
            <div class="stat-title"><svg class="ic" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> 今日发件</div>
            <div class="stat-val">{{ profileData.userInfo.showStats ? profileData.stats.todaySent : '**' }}</div>
          </div>
          <div class="stat-card green">
            <div class="stat-title"><svg class="ic" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> 今日收件</div>
            <div class="stat-val">{{ profileData.userInfo.showStats ? profileData.stats.todayReceived : '**' }}</div>
          </div>
          <div class="stat-card orange">
            <div class="stat-title"><svg class="ic" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> 个人拦截率</div>
            <div class="stat-val">{{ profileData.userInfo.showStats ? profileData.stats.interceptRate : '**' }}</div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-grid">
          
          <!-- 邮件增长 (Email Growth 100% STACKED Bar Chart) -->
          <div class="chart-card">
            <div class="chart-title">
              <span>邮件处理态势分布</span>
              <div class="chart-legends-top" v-if="profileData.userInfo.showTrend">
                <div class="legend-pill"><div class="legend-color" style="background:var(--color-receive);"></div>接收</div>
                <div class="legend-pill"><div class="legend-color" style="background:var(--color-intercept);"></div>拦截</div>
              </div>
            </div>
            <div class="bar-chart-container">
              <div class="chart-gridlines">
                <div class="gridline"></div>
                <div class="gridline"></div>
                <div class="gridline"></div>
              </div>
              
              <template v-if="profileData.userInfo.showTrend">
                <div class="bar-col" v-for="(item, i) in profileData.trend" :key="item.date">
                  <div class="bar-wrapper" style="height: 100%;" :style="i === profileData.trend.length - 1 ? 'box-shadow: 0 0 16px rgba(16,185,129,0.3);' : ''">
                    <div class="segment seg-receive" :style="{height: item.receivePercent + '%'}" @mousemove="showTooltip($event, `接收占比: ${item.receivePercent}%`, 'var(--color-receive)')" @mouseleave="hideTooltip"></div>
                    <div class="segment seg-intercept" :style="{height: item.interceptPercent + '%'}" @mousemove="showTooltip($event, `拦截占比: ${item.interceptPercent}%`, 'var(--color-intercept)')" @mouseleave="hideTooltip"></div>
                  </div>
                  <div class="bar-label" :style="i === profileData.trend.length - 1 ? 'color:var(--text-primary); font-weight:bold;' : ''">{{ i === profileData.trend.length - 1 ? '今日' : item.label }}</div>
                </div>
              </template>
              <div v-else style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px 24px; background: var(--bg-base); border: 1px dashed var(--border-subtle); border-radius: 12px; transform: translateY(-15px);">
                  <Icon icon="lucide:eye-off" style="font-size: 36px; color: var(--text-muted); opacity: 0.8;" />
                  <span style="font-size: 13px; font-weight: 600; color: var(--text-muted); letter-spacing: 1px;">隐私保护已开启，态势数据不可见</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 邮件来源 (Email Sources SVG Pie Chart) -->
          <div class="chart-card">
            <div class="chart-title">
              <span>来源分布</span>
            </div>
            <div class="pie-chart-container">
              <div class="pie-ring">
                <svg viewBox="0 0 32 32" style="width: 110px; height: 110px; border-radius: 50%; transform: rotate(-90deg); filter: drop-shadow(0 0 10px var(--shadow-deep));">
                  <template v-if="profileData.userInfo.showSources">
                    <circle v-for="(source, index) in computedSources" :key="source.domain" r="15.9155" cx="16" cy="16" :stroke="source.color" stroke-width="32" :stroke-dasharray="source.dasharray" :stroke-dashoffset="source.dashoffset" fill="none" class="pie-circle" @mousemove="showTooltip($event, `${source.domain}: ${source.percent}%`, source.color)" @mouseleave="hideTooltip" />
                  </template>
                  <circle v-else r="15.9155" cx="16" cy="16" stroke="var(--border-subtle)" stroke-width="32" stroke-dasharray="100 100" fill="none" class="pie-circle" style="opacity: 0.2;" />
                </svg>
                <div class="pie-total">
                  <span class="pie-total-val">{{ profileData.userInfo.showSources ? profileData.sources.total : '**' }}</span>
                  <span class="pie-total-lbl">总量</span>
                </div>
              </div>
              
              <div class="pie-legend" v-if="profileData.userInfo.showSources">
                <div class="legend-item" v-for="(source, index) in computedSources" :key="source.domain" :style="source.domain === '其它来源' ? 'margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--border-subtle);' : ''" @mousemove="showTooltip($event, `${source.domain}: ${source.percent}%`, source.color)" @mouseleave="hideTooltip">
                  <div class="legend-dot"><div class="dot" :style="{background: source.color}"></div> {{ source.domain }}</div>
                  <span style="font-family: monospace;" :style="source.domain === '其它来源' ? 'color:var(--text-muted);' : ''">{{ source.percent }}%</span>
                </div>
              </div>
              <div class="pie-legend" v-else style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; min-height: 80px; gap: 8px;">
                <Icon icon="lucide:eye-off" style="font-size: 32px; color: var(--border-subtle); opacity: 0.5;" />
                <span style="font-size: 13px; font-weight: 600; color: var(--text-muted); letter-spacing: 1px;">来源数据不可见</span>
              </div>
            </div>
          </div>

        </div>

      </div>

        </div>
      </div>
    </el-scrollbar>
    <StatusBar style="position: absolute; bottom: 0; left: 0; right: 0; z-index: 100; border-top: 1px solid var(--border-subtle);" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProfile } from '@/request/public.js'
import dayjs from 'dayjs'
import { Icon } from '@iconify/vue'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import StatusBar from '@/layout/status-bar/index.vue'
import Header from '@/layout/header/index.vue'
import { parseInlineMarkdown } from "@/utils/md-parser.js"

const uiStore = useUiStore()
const userStore = useUserStore()

const route = useRoute()
const router = useRouter()

const username = ref(route.params.username || 'User')
const floatTooltip = ref(null)

const timezoneString = computed(() => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset() / 60;
  const offsetStr = offset >= 0 ? `+${offset}` : `${offset}`;
  let localeName = tz;
  if (tz === 'Asia/Shanghai') localeName = '北京';
  return `${localeName} (GMT${offsetStr})`;
})

const profileData = ref({
    userInfo: {
        account: username.value,
        email: `${username.value}@epocanvas.com`,
        roleName: 'Unknown',
        joinTime: new Date().toISOString(),
        avatarInitials: username.value.substring(0, 2).toUpperCase()
    },
    stats: {
        todaySent: 0,
        todayReceived: 0,
        interceptRate: '0%',
    },
    trend: [],
    sources: {
        total: 0,
        top: [],
        otherPercent: 100
    }
})

const computedSources = computed(() => {
    const list = []
    let currentOffset = 0
    const colors = ['var(--color-send)', 'var(--color-receive)', 'var(--color-intercept)', 'var(--color-other)']
    
    // Create a deep copy of top and ensure it's sorted
    let topSources = JSON.parse(JSON.stringify(profileData.value.sources.top || []))
    let otherPercent = profileData.value.sources.otherPercent || 0
    
    // 1. Remove '其它来源' or 'Other' from top list and add to otherPercent
    const otherIndex = topSources.findIndex(s => s.domain === '其它来源' || s.domain === 'Other')
    if (otherIndex !== -1) {
        otherPercent += topSources[otherIndex].percent
        topSources.splice(otherIndex, 1)
    }

    // 2. Limit top sources to exactly 3 items, aggregate the rest to otherPercent
    if (topSources.length > 3) {
        const excess = topSources.splice(3)
        excess.forEach(s => {
            otherPercent += s.percent
        })
    }
    
    // Generate final list
    topSources.forEach((item, index) => {
        list.push({
            domain: item.domain,
            percent: item.percent,
            color: colors[index % colors.length],
            dasharray: `${item.percent} 100`,
            dashoffset: -currentOffset
        })
        currentOffset += item.percent
    })
    
    if (otherPercent > 0) {
        list.push({
            domain: '其它来源',
            percent: parseFloat(otherPercent.toFixed(1)), // Fix precision issues
            color: colors[3],
            dasharray: `${otherPercent} 100`,
            dashoffset: -currentOffset
        })
    }
    return list
})

const loading = ref(true)

const fetchProfile = () => {
    loading.value = true
    getProfile(username.value).then(res => {
        if (res) {
            profileData.value = res
        }
    }).catch(err => {
        console.error('Failed to load profile', err)
    }).finally(() => {
        loading.value = false
    })
}

onMounted(() => {
    fetchProfile()
})

const goBack = () => {
  router.push('/')
}

const handleContact = () => {
  const targetEmail = profileData.value.userInfo.email;
  const isLogged = localStorage.getItem('token');
  if (isLogged) {
    router.push({ path: '/inbox', query: { composeTo: targetEmail } });
  } else {
    window.location.href = `mailto:${targetEmail}`;
  }
}

const showTooltip = (e, text, color) => {
  if (!floatTooltip.value) return
  floatTooltip.value.style.display = 'block'
  floatTooltip.value.style.left = (e.clientX + 15) + 'px'
  floatTooltip.value.style.top = (e.clientY + 15) + 'px'
  floatTooltip.value.innerHTML = text
  floatTooltip.value.style.borderColor = color
  floatTooltip.value.style.color = color
}

const hideTooltip = () => {
  if (!floatTooltip.value) return
  floatTooltip.value.style.display = 'none'
}

</script>

<style scoped lang="scss">
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap');

.settings-container {
  --color-send: #3b82f6;
  --color-receive: #10b981;
  --color-intercept: #ef4444;
  --color-other: #8b5cf6;
  
  height: 100%;
  overflow: hidden;
  background: var(--extra-light-fill) !important;
  position: relative;
  font-family: 'Archivo', system-ui, -apple-system, sans-serif;

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
    justify-content: flex-start;
  }
}

.ic { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; display: block; flex-shrink:0; }
.ic-fill { width: 16px; height: 16px; fill: currentColor; display: block; flex-shrink:0; }

.navbar {
  height: 64px; display: flex; align-items: center; position: absolute; top: 0; left: 0; right: 0; z-index: 100;
}
.back-btn {
  display: flex; align-items: center; gap: 6px; color: var(--text-primary); cursor: pointer;
  font-size: 14px; font-weight: 600; background: var(--bg-elevated); padding: 6px 14px; border-radius: 16px; backdrop-filter: blur(10px);
  transition: all 0.2s; border: 1px solid var(--border-subtle);
}
.back-btn:hover { background: var(--bg-hover); }

.icon-btn { 
  width: 40px; height: 40px; border: none; background: transparent; cursor: pointer; 
  color: var(--text-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; 
  transition: background .15s, color .15s; 
}
.icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.avatar-wrap { margin-left: 8px; }
.avatar { 
  width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); 
  display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; cursor: pointer; 
  border: 2px solid transparent; transition: transform .15s; 
}
.avatar:hover { transform: scale(1.05); }


.cover-photo {
  width: 100%; height: 25vh;
  background-color: transparent;
  position: relative; flex-shrink: 0; z-index: 1;
}
.cover-photo::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to bottom, transparent 20%, var(--bg-base) 100%);
}

.desktop-layout {
  max-width: 1100px; width: 100%; margin: -60px auto 0; padding: 0 40px;
  display: grid; grid-template-columns: 280px 1fr; gap: 30px; position: relative; z-index: 10;
}

/* Aurora Dynamic Background */
.aurora-bg {
  position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0;
}
.aurora-1, .aurora-2, .aurora-3 {
  position: absolute; border-radius: 50%;
  animation: aurora-float 20s infinite alternate ease-in-out;
}
.aurora-1 {
  width: 70vw; height: 70vw; left: -10vw; top: -20vw;
  background: radial-gradient(circle, var(--accent-primary) 0%, transparent 65%);
  opacity: 0.12; animation-delay: 0s;
}
.aurora-2 {
  width: 80vw; height: 80vw; right: -20vw; top: -10vw;
  background: radial-gradient(circle, var(--color-receive) 0%, transparent 65%);
  opacity: 0.1; animation-delay: -5s;
}
.aurora-3 {
  width: 60vw; height: 60vw; left: 20vw; bottom: -20vw;
  background: radial-gradient(circle, var(--color-other) 0%, transparent 65%);
  opacity: 0.12; animation-delay: -10s;
}

@keyframes aurora-float {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(3%, 8%) scale(1.05); }
  100% { transform: translate(-3%, 4%) scale(0.95); }
}

.profile-identity { display: flex; flex-direction: column; }
.avatar {
  width: 120px; height: 120px; border-radius: 24px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border: 4px solid var(--bg-base); box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: 800; color: #fff;
  margin-bottom: 20px; position: relative;
}
.verified-badge {
  position: absolute; bottom: -6px; right: -6px; width: 32px; height: 32px;
  background: var(--bg-base); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--accent-primary);
}
.name-block { margin-bottom: 16px; }
.name { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 2px; }
.handle { font-size: 14px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; font-weight: 500; }
.bio { 
  font-size: 14px; 
  color: var(--text-secondary); 
  line-height: 1.6; 
  margin-bottom: 24px; 
  height: 112px; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  display: -webkit-box; 
  -webkit-line-clamp: 5; 
  -webkit-box-orient: vertical; 
  word-break: break-word; 
  white-space: pre-wrap;
}

.sub-tags-list {
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px; background: var(--bg-elevated); border-radius: 12px; border: 1px solid var(--border-subtle);
}
.sub-tag-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); font-weight: 500; }
.sub-tag-item .ic { color: var(--accent-primary); }

.btn-message {
  display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--text-primary); color: var(--bg-base);
  border: none; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;
}
.btn-message:hover { transform: translateY(-2px); box-shadow: 0 8px 24px var(--shadow-color); background: var(--text-secondary); }

.profile-analysis { display: flex; flex-direction: column; gap: 16px; margin-top: 40px; }
.section-heading { font-size: 18px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.section-heading::before { content: ''; width: 4px; height: 16px; background: var(--accent-primary); border-radius: 2px; }

.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat-card {
  padding: 16px; border-radius: 16px; display: flex; flex-direction: column; gap: 8px;
  backdrop-filter: blur(20px); border: 1px solid var(--border-subtle); background: var(--bg-elevated);
}
.stat-card.blue { border-top: 3px solid var(--color-send); }
.stat-card.orange { border-top: 3px solid var(--color-intercept); }
.stat-card.green { border-top: 3px solid var(--color-receive); }
.stat-title { font-size: 13px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.stat-val { font-size: 28px; font-weight: 800; color: var(--text-primary); letter-spacing: -1px; }

.charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; flex: 1; min-height: 200px; }
.chart-card {
  background: var(--bg-elevated); backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle); border-radius: 16px; padding: 16px;
  display: flex; flex-direction: column; position: relative;
}
.chart-title { font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }

.bar-chart-container {
  flex: 1; display: flex; align-items: flex-end; justify-content: space-between; position: relative;
  padding-bottom: 24px; padding-top: 10px;
}
.chart-gridlines {
  position: absolute; inset: 0 0 24px 0; display: flex; flex-direction: column; justify-content: space-between; z-index: 0; pointer-events: none;
}
.gridline { width: 100%; height: 1px; background: var(--border-subtle); position: relative; }
.chart-legends-top { display: flex; gap: 12px; font-size: 11px; font-weight: 600; }
.legend-pill { display: flex; align-items: center; gap: 4px; color: var(--text-secondary); }
.legend-color { width: 8px; height: 8px; border-radius: 2px; }

.bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; z-index: 1; width: 12%; position: relative; height: 100%; }
.bar-wrapper {
  width: 100%; border-radius: 4px 4px 0 0; display: flex; flex-direction: column-reverse;
  overflow: hidden; transition: transform 0.5s ease, box-shadow 0.3s ease; box-shadow: 0 0 10px var(--shadow-color);
}
.bar-wrapper:hover { box-shadow: 0 0 16px var(--shadow-color); transform: scaleX(1.1); }
.segment { width: 100%; border-top: 1px solid rgba(0,0,0,0.1); transition: filter 0.2s; cursor: pointer; }
.segment:first-child { border-top: none; }
.seg-intercept { background: linear-gradient(to top, rgba(239,68,68,0.7), var(--color-intercept)); }
.seg-receive { background: linear-gradient(to top, rgba(16,185,129,0.7), var(--color-receive)); }
.seg-send { background: linear-gradient(to top, rgba(59,130,246,0.7), var(--color-send)); }
.segment:hover { filter: brightness(1.1); }
.bar-label { font-size: 11px; color: var(--text-muted); position: absolute; bottom: -20px; font-family: 'Fira Code', monospace; }

.pie-chart-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
.pie-ring { width: 110px; height: 110px; position: relative; }
.pie-circle { transition: opacity 0.2s; cursor: pointer; }
.pie-circle:hover { opacity: 0.8; }
.pie-total { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; background: var(--bg-elevated); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid var(--border-subtle); }
.pie-total-val { font-size: 18px; font-weight: 800; color: var(--text-primary); font-family: 'Fira Code', monospace; }
.pie-total-lbl { font-size: 10px; color: var(--text-muted); }

.pie-legend { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.legend-item { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-secondary); cursor: pointer; transition: opacity 0.2s; }
.legend-item:hover { opacity: 0.8; }
.legend-dot { display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }

#float-tooltip {
  display: none; position: fixed; z-index: 999999;
  background: var(--bg-elevated); padding: 8px 12px;
  border-radius: 6px; border: 1px solid var(--border-subtle);
  font-family: 'Fira Code', monospace; font-size: 12px;
  pointer-events: none; box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  white-space: nowrap; font-weight: 600;
}
</style>
