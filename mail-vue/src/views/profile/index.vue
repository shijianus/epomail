<template>
  <div class="profile-page">
    <div id="float-tooltip" ref="floatTooltip"></div>

    <Header :isProfile="true" />
    <!-- Ready for User Background Image -->
    <div class="cover-photo"></div>

    <div class="desktop-layout" v-if="!loading">
      <!-- Left Side: Identity -->
      <div class="profile-identity">
        <div class="avatar">
          {{ profileData.userInfo.avatarInitials }}
          <div class="verified-badge">
            <svg class="ic-fill" style="width:20px; height:20px;" viewBox="0 0 24 24"><path d="M22.5 12.5c0-.67-.2-1.33-.57-1.89l1.45-2.02c.32-.44.38-1.01.15-1.5-.23-.49-.71-.8-1.25-.8h-2.47c-.43 0-.82-.24-1.02-.63l-1.1-2.22c-.25-.5-.73-.83-1.29-.89-.55-.06-1.1.17-1.46.61l-1.6 1.94c-.4.49-1.02.77-1.66.77s-1.26-.28-1.66-.77l-1.6-1.94c-.36-.44-.91-.67-1.46-.61-.56.06-1.04.39-1.29.89l-1.1 2.22c-.2-.39-.59.63-1.02-.63H3.74c-.54 0-1.02.31-1.25.8-.23.49-.17 1.06-.15-1.5l1.45 2.02c.37.56.57 1.22.57 1.89 0 .67-.2 1.33-.57 1.89l-1.45 2.02c-.32.44-.38 1.01-.15 1.5.23.49.71.8 1.25.8h2.47c.43 0 .82.24 1.02.63l1.1 2.22c.25.5.73.83 1.29.89.55.06 1.1-.17 1.46-.61l1.6-1.94c.4-.49 1.02-.77 1.66-.77s1.26.28 1.66.77l1.6 1.94c.36.44.91.67 1.46.61.56-.06 1.04-.39 1.29-.89l1.1-2.22c.2-.39.59-.63 1.02-.63h2.47c.54 0 1.02-.31 1.25-.8.23-.49.17-1.06-.15-1.5l-1.45-2.02c-.37-.56-.57-1.22-.57-1.89zM10.82 17.5l-4.52-4.52 1.41-1.41 3.11 3.11 7.21-7.21 1.41 1.41-8.62 8.62z"></path></svg>
          </div>
        </div>
        
        <div class="name-block">
          <h1 class="name">{{ profileData.userInfo.account }}</h1>
          <div class="handle">
            <Icon class="ic" icon="lucide:mail" style="margin-right: 6px;" />
            {{ profileData.userInfo.email }}
          </div>
        </div>

        <p class="bio">
          {{ profileData.userInfo.roleName === 'admin' ? 'EpoMail 系统管理员，负责核心平台的维护与安全。我们在数字世界中连接彼此，保护每一次灵感的传递与思想的交汇。为您带来前所未有的纯净沟通体验。' : 'EpoMail 专属用户，致力于安全、高效的邮件通讯。我们在数字世界中连接彼此，保护每一次灵感的传递与思想的交汇。为您带来前所未有的纯净沟通体验。' }}
        </p>

        <!-- Detailed Subtitle Tags -->
        <div class="sub-tags-list">
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

        <el-button type="primary" size="large" style="width: 100%; border-radius: 12px; height: 48px; margin-top: auto;" @click="router.push('/inbox')">
          <Icon icon="lucide:send" class="ic" style="margin-right: 8px;" />
          发送邮件联系我
        </el-button>
      </div>

      <!-- Right Side: Analytics Dashboard -->
      <div class="profile-analysis">
        
        <div class="section-heading">账户数据与分析看板</div>

        <!-- Top Gradient Cards -->
        <div class="stats-row">
          <div class="stat-card blue">
            <div class="stat-title"><svg class="ic" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> 今日发件</div>
            <div class="stat-val">{{ profileData.stats.todaySent }}</div>
          </div>
          <div class="stat-card green">
            <div class="stat-title"><svg class="ic" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> 今日收件</div>
            <div class="stat-val">{{ profileData.stats.todayReceived }}</div>
          </div>
          <div class="stat-card orange">
            <div class="stat-title"><svg class="ic" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> 个人拦截率</div>
            <div class="stat-val">{{ profileData.stats.interceptRate }}</div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-grid">
          
          <!-- 邮件增长 (Email Growth 100% STACKED Bar Chart) -->
          <div class="chart-card">
            <div class="chart-title">
              <span>邮件处理态势分布</span>
              <div class="chart-legends-top">
                <div class="legend-pill"><div class="legend-color" style="background:var(--color-send);"></div>发送</div>
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
              
              <div class="bar-col" v-for="(item, i) in profileData.trend" :key="item.date">
                <div class="bar-wrapper" style="height: 100%;" :style="i === profileData.trend.length - 1 ? 'box-shadow: 0 0 16px rgba(16,185,129,0.3);' : ''">
                  <div class="segment seg-send" :style="{height: item.sendPercent + '%'}" @mousemove="showTooltip($event, `发送占比: ${item.sendPercent}%`, 'var(--color-send)')" @mouseleave="hideTooltip"></div>
                  <div class="segment seg-receive" :style="{height: item.receivePercent + '%'}" @mousemove="showTooltip($event, `接收占比: ${item.receivePercent}%`, 'var(--color-receive)')" @mouseleave="hideTooltip"></div>
                  <div class="segment seg-intercept" :style="{height: item.interceptPercent + '%'}" @mousemove="showTooltip($event, `拦截占比: ${item.interceptPercent}%`, 'var(--color-intercept)')" @mouseleave="hideTooltip"></div>
                </div>
                <div class="bar-label" :style="i === profileData.trend.length - 1 ? 'color:var(--text-primary); font-weight:bold;' : ''">{{ i === profileData.trend.length - 1 ? '今日' : item.label }}</div>
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
                <svg viewBox="0 0 32 32" style="width: 130px; height: 130px; border-radius: 50%; transform: rotate(-90deg); filter: drop-shadow(0 0 10px var(--shadow-deep));">
                  <circle v-for="(source, index) in computedSources" :key="source.domain" r="15.9155" cx="16" cy="16" :stroke="source.color" stroke-width="32" :stroke-dasharray="source.dasharray" :stroke-dashoffset="source.dashoffset" fill="none" class="pie-circle" @mousemove="showTooltip($event, `${source.domain}: ${source.percent}%`, source.color)" @mouseleave="hideTooltip" />
                </svg>
                <div class="pie-total">
                  <span class="pie-total-val">{{ profileData.sources.total }}</span>
                  <span class="pie-total-lbl">总量</span>
                </div>
              </div>
              
              <div class="pie-legend">
                <div class="legend-item" v-for="(source, index) in computedSources" :key="source.domain" :style="source.domain === '其它来源' ? 'margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--border-subtle);' : ''" @mousemove="showTooltip($event, `${source.domain}: ${source.percent}%`, source.color)" @mouseleave="hideTooltip">
                  <div class="legend-dot"><div class="dot" :style="{background: source.color}"></div> {{ source.domain }}</div>
                  <span style="font-family: monospace;" :style="source.domain === '其它来源' ? 'color:var(--text-muted);' : ''">{{ source.percent }}%</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
    
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

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap');

.profile-page {
  --bg-base: #0d0f1a; 
  --bg-surface: #13162a; 
  --bg-elevated: #1a1e36;
  --accent-primary: #5b6ef5; 
  --accent-secondary: #7c5cbf;
  --text-primary: #eef0fb; 
  --text-secondary: #b6bce4; 
  --text-muted: #767ca8;
  --border-subtle: rgba(91,110,245,0.12);
  
  --color-send: #3b82f6;
  --color-receive: #10b981;
  --color-intercept: #ef4444;
  --color-other: #64748b;

  --grad-blue: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.05) 100%);
  --grad-blue-border: rgba(59,130,246,0.3);
  --grad-orange: linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.05) 100%);
  --grad-orange-border: rgba(245,158,11,0.3);
  --grad-green: linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.05) 100%);
  --grad-green-border: rgba(16,185,129,0.3);

  width: 100vw; height: 100vh;
  overflow: hidden;
  font-family: 'Archivo', system-ui, -apple-system, sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1000;
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
  width: 100%; height: 32vh;
  background-color: var(--bg-elevated);
  background-image: repeating-linear-gradient(45deg, var(--bg-hover) 25%, transparent 25%, transparent 75%, var(--bg-hover) 75%, var(--bg-hover)), repeating-linear-gradient(45deg, var(--bg-hover) 25%, var(--bg-elevated) 25%, var(--bg-elevated) 75%, var(--bg-hover) 75%, var(--bg-hover));
  background-position: 0 0, 20px 20px;
  background-size: 40px 40px;
  position: relative; flex-shrink: 0; z-index: 1;
}
.cover-photo::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to bottom, transparent 40%, var(--bg-base) 100%);
}

.desktop-layout {
  max-width: 1300px; width: 100%; margin: -70px auto 0; padding: 0 40px;
  display: grid; grid-template-columns: 300px 1fr; gap: 50px; position: relative; z-index: 10;
}

.profile-identity { display: flex; flex-direction: column; }
.avatar {
  width: 140px; height: 140px; border-radius: 24px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border: 6px solid var(--bg-base); box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; font-size: 54px; font-weight: 800; color: #fff;
  margin-bottom: 20px; position: relative;
}
.verified-badge {
  position: absolute; bottom: -6px; right: -6px; width: 36px; height: 36px;
  background: var(--bg-base); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--accent-primary);
}
.name-block { margin-bottom: 16px; }
.name { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 2px; }
.handle { font-size: 14px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; font-weight: 500; }
.bio { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px; }

.sub-tags-list {
  display: flex; flex-direction: column; gap: 10px; margin-bottom: 32px;
  padding: 16px; background: var(--bg-elevated); border-radius: 12px; border: 1px solid var(--border-subtle);
}
.sub-tag-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); font-weight: 500; }
.sub-tag-item .ic { color: var(--accent-primary); }

.btn-message {
  display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--text-primary); color: var(--bg-base);
  border: none; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;
}
.btn-message:hover { transform: translateY(-2px); box-shadow: 0 8px 24px var(--shadow-color); background: var(--text-secondary); }

.profile-analysis { display: flex; flex-direction: column; gap: 20px; margin-top: 70px; }
.section-heading { font-size: 18px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.section-heading::before { content: ''; width: 4px; height: 16px; background: var(--accent-primary); border-radius: 2px; }

.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat-card {
  padding: 20px; border-radius: 16px; display: flex; flex-direction: column; gap: 8px;
  backdrop-filter: blur(20px); border: 1px solid var(--border-subtle); background: var(--bg-elevated);
}
.stat-card.blue { border-top: 3px solid var(--color-send); }
.stat-card.orange { border-top: 3px solid var(--color-intercept); }
.stat-card.green { border-top: 3px solid var(--color-receive); }
.stat-title { font-size: 13px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.stat-val { font-size: 28px; font-weight: 800; color: var(--text-primary); letter-spacing: -1px; }

.charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; flex: 1; min-height: 240px; }
.chart-card {
  background: var(--bg-elevated); backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle); border-radius: 16px; padding: 20px;
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
.pie-ring { width: 130px; height: 130px; position: relative; }
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
