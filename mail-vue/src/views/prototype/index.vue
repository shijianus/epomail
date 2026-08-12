<template>
  <div class="prototype-wrapper">
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <symbol id="i-mail" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path></symbol>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></symbol>
      <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M21 21v-5h-5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path></symbol>
      <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></symbol>
      <symbol id="i-gear" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></symbol>
      <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></symbol>
      <symbol id="i-star" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"></polygon></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></symbol>
      <symbol id="i-send" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></symbol>
      <symbol id="i-draft" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></symbol>
      <symbol id="i-layers" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></symbol>
      <symbol id="i-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"></line></symbol>
      <symbol id="i-trash" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></symbol>
      <symbol id="i-pencil" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></symbol>
      <symbol id="i-reply" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></symbol>
      <symbol id="i-forward" viewBox="0 0 24 24"><polyline points="15 17 20 12 15 7"></polyline><path d="M4 18v-2a4 4 0 0 1 4-4h12"></path></symbol>
      <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></symbol>
      <symbol id="i-clip" viewBox="0 0 24 24"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></symbol>
      <symbol id="i-smile" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></symbol>
      <symbol id="i-min" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></symbol>
      <symbol id="i-max" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></symbol>
      <symbol id="i-filter" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46"></polygon></symbol>
      <symbol id="i-sort" viewBox="0 0 24 24"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></symbol>
      <symbol id="i-bold" viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></symbol>
      <symbol id="i-italic" viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></symbol>
      <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></symbol>
      <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"></path></symbol>
      <symbol id="i-file" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></symbol>
      <symbol id="i-arrow-left" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></symbol>
      <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></symbol>
      <symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></symbol>
      <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></symbol>
      <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></symbol>
      <symbol id="i-user" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></symbol>
      <symbol id="i-tag" viewBox="0 0 24 24"><path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></symbol>
    </svg>

    <div class="app">
      <!-- TOPBAR -->
      <header class="topbar">
        <button class="brand-toggle" id="sidebarToggle" data-tip="折叠侧边栏">
          <div class="brand-icon"><svg class="ic"><use href="#i-mail"></use></svg></div>
          <span class="brand-name">EpoMail</span>
        </button>
        <div class="topbar-search">
          <span class="search-icon"><svg class="ic ic-sm"><use href="#i-search"></use></svg></span>
          <input type="text" placeholder="搜索邮件、联系人、文件…">
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" data-tip="通知"><svg class="ic"><use href="#i-bell"></use></svg><span class="badge"></span></button>
          
          <!-- Route to settings / admin panel -->
          <button class="icon-btn" data-tip="管理设置" @click="$router.push('/admin/settings')">
            <svg class="ic"><use href="#i-gear"></use></svg>
          </button>
          
          <div class="avatar-wrap">
            <div class="avatar" id="avatarBtn" data-tip="账户">JS</div>
            <div class="account-menu" id="accountMenu">
              <div class="am-header">
                <div class="am-avatar">JS</div>
                <div style="overflow:hidden">
                  <div class="am-name">Jian Shi</div>
                  <div class="am-email">jian@epomail.dev</div>
                  <div class="am-status"><span class="status-dot"></span><span>在线 · 单账户模式</span></div>
                </div>
              </div>
              <div class="am-storage">
                <div class="am-storage-label"><span>存储空间</span><span>4.2 / 10 GB</span></div>
                <div class="storage-bar"><div class="storage-fill"></div></div>
              </div>
              <div class="am-item" id="themeRow">
                <svg class="ic ic-sm" id="themeIcon"><use href="#i-moon"></use></svg>
                <span>深色模式</span><span class="am-spacer"></span>
                <div class="switch on" id="themeSwitch"></div>
              </div>
              <div class="am-item"><svg class="ic ic-sm"><use href="#i-user"></use></svg><span>账户详情</span></div>
              
              <!-- Route to settings / admin panel -->
              <div class="am-item" @click="$router.push('/admin/settings')"><svg class="ic ic-sm"><use href="#i-gear"></use></svg><span>系统与管理设置</span></div>
              
              <div class="am-item"><svg class="ic ic-sm"><use href="#i-help"></use></svg><span>帮助与反馈</span></div>
              <div class="am-item logout" @click="handleLogout"><svg class="ic ic-sm"><use href="#i-logout"></use></svg><span>退出登录</span></div>
            </div>
          </div>
        </div>
      </header>

      <div class="main">
        <!-- SIDEBAR -->
        <nav class="sidebar" id="sidebar">
          <button class="compose-btn" id="composeBtn" data-tip="撰写邮件"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-pencil"></use></svg></span><span class="compose-label">撰写邮件</span></button>
          <div class="nav-section">
            <div class="nav-item active" data-tip="收件箱" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-inbox"></use></svg></span><span class="nav-label">收件箱</span><span class="nav-count">12</span></div>
            <div class="nav-item" data-tip="已加星标" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-star"></use></svg></span><span class="nav-label">已加星标</span><span class="nav-count muted">3</span></div>
            <div class="nav-item" data-tip="待处理" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-clock"></use></svg></span><span class="nav-label">待处理</span><span class="nav-count muted">2</span></div>
            <div class="nav-item" data-tip="已发送" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-send"></use></svg></span><span class="nav-label">已发送</span><span class="nav-count muted">47</span></div>
            <div class="nav-item" data-tip="草稿箱" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-draft"></use></svg></span><span class="nav-label">草稿箱</span><span class="nav-count">2</span></div>
            <div class="nav-item" data-tip="所有邮件" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-layers"></use></svg></span><span class="nav-label">所有邮件</span><span class="nav-count muted">284</span></div>
            <div class="nav-item" data-tip="垃圾邮件" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-ban"></use></svg></span><span class="nav-label">垃圾邮件</span><span class="nav-count muted">5</span></div>
            <div class="nav-item" data-tip="废纸篓" data-tp="r"><span class="nav-ic-wrap"><svg class="ic ic-sm"><use href="#i-trash"></use></svg></span><span class="nav-label">废纸篓</span></div>
          </div>
          <div class="divider"></div>
          <div class="nav-section" id="labelSection">
            <div class="nav-section-label"><span>标签</span><span class="label-edit-btn" id="labelEditBtn">编辑</span></div>
            <div id="labelList"></div>
          </div>
        </nav>

        <!-- LIST PANE -->
        <section class="email-list-pane">
          <div class="list-toolbar">
            <span class="list-title">收件箱</span>
            <button class="mini-btn" id="refreshBtn" data-tip="刷新收件箱"><svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>
            <button class="mini-btn" data-tip="筛选"><svg class="ic ic-sm"><use href="#i-filter"></use></svg></button>
            <button class="mini-btn" data-tip="排序"><svg class="ic ic-sm"><use href="#i-sort"></use></svg></button>
          </div>
          <div class="tab-bar" id="tabBar">
            <div class="tab active">主要</div>
            <div class="tab">社交</div>
            <div class="tab">促销</div>
            <div class="tab">通知</div>
            <div class="tab-underline" id="tabUnderline"></div>
          </div>
          <div class="email-list" id="emailList">
            <div class="email-item unread selected" style="animation-delay:.02s" data-from="notifications@github.com"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-purple">GH</div><span class="email-sender">GitHub</span><button class="star-btn starred" data-tip="取消星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">10:42</span></div>
              <div class="email-subject">Re: [epomail] Fix DKIM verification #142</div>
              <div class="email-preview">The changes look good. I've reviewed the DKIM signing logic…</div>
              <div class="email-tags"><span class="email-tag tag-work">工作</span><span class="email-tag tag-code">代码</span></div>
            </div>
            <div class="email-item unread" style="animation-delay:.06s" data-from="noreply@cloudflare.com"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-teal">CF</div><span class="email-sender">Cloudflare</span><button class="star-btn" data-tip="加星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">09:15</span></div>
              <div class="email-subject">您的 Worker 已成功部署至生产环境</div>
              <div class="email-preview">epomail-worker-prod 已于 09:14 UTC 部署完成…</div>
              <div class="email-tags"><span class="email-tag tag-work">工作</span></div>
            </div>
            <div class="email-item unread" style="animation-delay:.1s" data-from="no-reply@resend.dev"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-orange">RS</div><span class="email-sender">Resend</span><button class="star-btn" data-tip="加星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">昨天</span></div>
              <div class="email-subject">【验证码】您的登录验证码是 847291</div>
              <div class="email-preview">此验证码 10 分钟内有效，请勿泄露给他人…</div>
              <div class="email-tags"><span class="email-tag tag-code">验证码</span></div>
            </div>
            <div class="email-item" style="animation-delay:.14s" data-from="liming@company.com"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-blue">LM</div><span class="email-sender">Li Ming</span><button class="star-btn starred" data-tip="取消星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">昨天</span></div>
              <div class="email-subject">Q4 产品路线图讨论</div>
              <div class="email-preview">我整理了下季度的功能优先级清单，附上了需求文档…</div>
              <div class="email-tags"><span class="email-tag tag-work">工作</span><span class="email-tag tag-urgent">紧急</span></div>
            </div>
            <div class="email-item" style="animation-delay:.18s" data-from="wangxiao@company.com"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-green">WX</div><span class="email-sender">Wang Xiao</span><button class="star-btn" data-tip="加星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">周一</span></div>
              <div class="email-subject">Re: Epomail UI 设计稿 v0.3</div>
              <div class="email-preview">第二版原型里加了暗色主题切换和邮件分组…</div>
            </div>
            <div class="email-item" style="animation-delay:.22s" data-from="billing@aws.amazon.com"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-red">AW</div><span class="email-sender">AWS</span><button class="star-btn" data-tip="加星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">周一</span></div>
              <div class="email-subject">您的账单摘要 — 2026年7月</div>
              <div class="email-preview">本月账单总计 $24.60，详细明细请登录控制台查看…</div>
              <div class="email-tags"><span class="email-tag tag-promo">账单</span></div>
            </div>
            <div class="email-item" style="animation-delay:.26s" data-from="team@notion.so"><span class="unread-dot"></span>
              <div class="email-row1"><div class="email-avatar av-purple">NT</div><span class="email-sender">Notion</span><button class="star-btn" data-tip="加星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button><span class="email-time">周日</span></div>
              <div class="email-subject">您有 3 条新评论待处理</div>
              <div class="email-preview">Zhang Wei 在"2026 后端架构"页面上评论了您…</div>
            </div>
          </div>
        </section>

        <!-- READING PANE -->
        <section class="reading-pane">
          <div class="reading-toolbar">
            <button class="action-btn" data-tip="返回"><svg class="ic ic-sm"><use href="#i-arrow-left"></use></svg></button>
            <div class="spacer"></div>
            <button class="action-btn" id="replyBtn" data-tip="回复（使用邮件模板）"><svg class="ic ic-sm"><use href="#i-reply"></use></svg></button>
            <button class="action-btn" id="forwardBtn" data-tip="转发（使用邮件模板）"><svg class="ic ic-sm"><use href="#i-forward"></use></svg></button>
            <button class="action-btn" data-tip="加星标"><svg class="ic ic-sm"><use href="#i-star"></use></svg></button>
            <button class="action-btn" data-tip="标为未读"><svg class="ic ic-sm"><use href="#i-inbox"></use></svg></button>
            <button class="action-btn" data-tip="更多操作"><svg class="ic ic-sm"><use href="#i-more"></use></svg></button>
            <button class="action-btn danger" data-tip="删除"><svg class="ic ic-sm"><use href="#i-trash"></use></svg></button>
          </div>
          <div class="reading-scroll" id="readingScroll">
            <div class="reading-inner">
              <div class="msg-subject">Re: [epomail] Fix DKIM verification issue #142</div>
              <div class="msg-meta">
                <div class="msg-meta-row">
                  <div class="msg-avatar">GH</div>
                  <div class="msg-from-block"><div class="msg-from-name">GitHub Notifications</div><div class="msg-from-addr">notifications@github.com</div></div>
                  <div class="msg-date">2026-08-12&nbsp;&nbsp;10:42</div>
                </div>
                <div class="msg-to-row"><span class="msg-to-label">收件人</span><span class="msg-to-addr">jian@epomail.dev</span></div>
              </div>
              <div class="msg-body">
                <p>Hi @shijianus,</p>
                <p>The changes look good! I've reviewed the DKIM signing logic in <a href="javascript:void(0)">mail-worker/src/service/dkim.ts</a> and left two inline comments regarding the selector rotation strategy.</p>
                <p>Key points from the review:</p>
                <p>1. The current <code class="inl">signMessage()</code> function uses a fixed private key path — we should parameterize this for multi-domain support.<br>2. Consider caching the parsed RSA key object (~2ms overhead under load).<br>3. Test coverage for edge cases (missing <code class="inl">d=</code> header) needs expanding.</p>
                <p>Overall LGTM once those items are addressed. Let me know if you want to pair on the caching layer this afternoon.</p>
                <p class="muted-line">— Sent via GitHub · <a href="javascript:void(0)">View pull request #142</a></p>
              </div>
              <div class="attachment-section">
                <div class="attachment-label">附件（2）</div>
                <div class="attachments">
                  <div class="attachment-chip"><svg class="ic att-ic"><use href="#i-file"></use></svg><div><div class="att-name">dkim-review-notes.md</div><div class="att-size">14 KB</div></div></div>
                  <div class="attachment-chip"><svg class="ic att-ic"><use href="#i-image"></use></svg><div><div class="att-name">benchmark-results.png</div><div class="att-size">238 KB</div></div></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- COMPOSE (also used as the reply/forward template) -->
      <div class="compose-overlay" id="composeOverlay">
        <div class="compose-header" id="composeHeader">
          <span class="compose-title"><svg class="ic ic-sm"><use href="#i-pencil"></use></svg><span id="composeTitle">撰写新邮件</span></span>
          <button class="icon-btn" id="composeMax" data-tip="最大化" style="width:26px;height:26px;color:var(--text-secondary)"><svg class="ic ic-sm"><use href="#i-max"></use></svg></button>
          <button class="icon-btn" id="composeMin" data-tip="最小化" style="width:26px;height:26px;color:var(--text-secondary)"><svg class="ic ic-sm"><use href="#i-min"></use></svg></button>
          <button class="icon-btn" id="composeClose" data-tip="关闭" style="width:26px;height:26px;color:var(--text-secondary)"><svg class="ic ic-sm"><use href="#i-x"></use></svg></button>
        </div>
        <div class="compose-body">
          <div class="compose-field"><span class="compose-field-label">收件</span><input type="text" id="cTo" placeholder="收件人地址…"></div>
          <div class="compose-field"><span class="compose-field-label">抄送</span><input type="text" id="cCc" placeholder="（可选）"></div>
          <div class="compose-field compose-subject"><span class="compose-field-label">主题</span><input type="text" id="cSubject" placeholder="邮件主题…"></div>
          <div class="compose-editor" id="cBody" contenteditable="true"></div>
        </div>
        <div class="compose-footer">
          <div class="compose-tools">
            <button class="tool-btn" data-tip="加粗"><svg class="ic ic-sm"><use href="#i-bold"></use></svg></button>
            <button class="tool-btn" data-tip="斜体"><svg class="ic ic-sm"><use href="#i-italic"></use></svg></button>
            <button class="tool-btn" data-tip="插入链接"><svg class="ic ic-sm"><use href="#i-link"></use></svg></button>
            <button class="tool-btn" data-tip="添加附件"><svg class="ic ic-sm"><use href="#i-clip"></use></svg></button>
            <button class="tool-btn" data-tip="插入图片"><svg class="ic ic-sm"><use href="#i-image"></use></svg></button>
          </div>
          <div class="spacer"></div>
          <button class="action-btn" id="composeDraft">存草稿</button>
          <button class="action-btn primary" id="composeSend"><svg class="ic ic-sm"><use href="#i-send"></use></svg>发送</button>
        </div>
      </div>

      <!-- LABEL EDIT MODAL -->
      <div class="modal-overlay" id="labelModal">
        <div class="modal">
          <div class="modal-head">
            <svg class="ic ic-sm" style="color:var(--text-accent)"><use href="#i-tag"></use></svg>
            <h3>编辑标签</h3>
            <span class="modal-hint" id="labelCount"></span>
          </div>
          <div class="modal-body" id="labelModalBody"></div>
          <div class="label-add" id="labelAdd"><svg class="ic ic-sm"><use href="#i-plus"></use></svg><span>添加标签</span></div>
          <div class="modal-foot">
            <button class="action-btn" id="labelCancel">取消</button>
            <button class="action-btn primary" id="labelDone"><svg class="ic ic-sm"><use href="#i-check"></use></svg>完成</button>
          </div>
        </div>
      </div>

      <footer class="status-bar">
        <div class="status-item"><span class="status-dot"></span>已连接</div>
        <div class="status-item">上次同步：<span id="syncTime">刚刚</span></div>
        <div class="status-item">12 封未读</div>
        <div style="flex:1"></div>
        <div class="status-item" style="font-size:10px">EpoMail v2.3.1 · 单账户模式 · Cloudflare Workers</div>
      </footer>

      <div class="toast" id="toast"><svg class="ic ic-sm"><use href="#i-check"></use></svg><span id="toastMsg"></span></div>
      <div class="tip" id="tip"></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const handleLogout = () => {
  localStorage.removeItem('token')
  window.location.href = '/login/'
}

onMounted(() => {
  // Re-run vanilla JS logic from prototype
  const $ = function(s){return document.querySelector(s);};
  const $$ = function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
  
  if (!window.__PROTOTYPE_INIT__) {
    window.__PROTOTYPE_INIT__ = true;
    
    var body = document.body;
    var toast = $('#toast'), toastMsg = $('#toastMsg'), tt;
    function showToast(m) {
      if(!toast) return;
      toastMsg.textContent=m; toast.classList.add('show');
      clearTimeout(tt); tt=setTimeout(function(){toast.classList.remove('show');},2200);
    }

    var tip = $('#tip');
    function positionTip(t){
      if(!tip) return;
      var pos=t.getAttribute('data-tp'),anchor=t;
      if(pos==='r'){ var w=t.querySelector('.nav-ic-wrap'); if(w) anchor=w; }
      var r=anchor.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight,left,top;
      if(pos==='r'){ left=r.right+7; top=r.top+r.height/2-th/2; }
      else { top=r.bottom+7; left=r.left+r.width/2-tw/2; }
      left=Math.max(6,Math.min(left,window.innerWidth-tw-6));
      top=Math.max(6,Math.min(top,window.innerHeight-th-6));
      tip.style.left=left+'px'; tip.style.top=top+'px';
    }
    
    document.addEventListener('mouseover',function(e){
      var t=e.target.closest('[data-tip]'); if(!t || !tip) return;
      if(t.closest('.nav-item') && !$('#sidebar').classList.contains('collapsed')) return;
      tip.textContent=t.getAttribute('data-tip'); tip.classList.add('show'); positionTip(t);
    });
    
    document.addEventListener('mouseout',function(e){ if(tip && e.target.closest('[data-tip]')) tip.classList.remove('show'); });
    window.addEventListener('scroll',function(){if(tip) tip.classList.remove('show');},true);

    function ripple(e){
      var b=e.currentTarget,c=document.createElement('span');c.className='ripple';
      var r=b.getBoundingClientRect(),d=Math.max(r.width,r.height);
      c.style.width=c.style.height=d+'px';c.style.left=(e.clientX-r.left-d/2)+'px';
      c.style.top=(e.clientY-r.top-d/2)+'px';b.appendChild(c);
      setTimeout(function(){c.remove();},550);
    }
    $$('.action-btn,.compose-btn,.icon-btn,.mini-btn').forEach(function(b){b.addEventListener('click',ripple);});

    var sidebar=$('#sidebar'),toggle=$('#sidebarToggle');
    if(toggle) toggle.addEventListener('click',function(){
      var c=sidebar.classList.toggle('collapsed');
      toggle.setAttribute('data-tip', c?'展开侧边栏':'折叠侧边栏');
      tip.textContent=toggle.getAttribute('data-tip'); positionTip(toggle);
    });

    var refreshBtn = $('#refreshBtn');
    if(refreshBtn) refreshBtn.addEventListener('click',function(){
      var i=this.querySelector('.ic');i.classList.remove('spin');void i.offsetWidth;i.classList.add('spin');
      showToast('已同步 · 收件箱已是最新');$('#syncTime').textContent='刚刚';
    });

    var avatar=$('#avatarBtn'),menu=$('#accountMenu');
    if(avatar && menu) {
      avatar.addEventListener('click',function(e){e.stopPropagation();menu.classList.toggle('open');});
      menu.addEventListener('click',function(e){e.stopPropagation();});
      document.addEventListener('click',function(){menu.classList.remove('open');});
    }

    var themeRow=$('#themeRow'),themeSwitch=$('#themeSwitch'),themeIcon=$('#themeIcon');
    function applyTheme(){
      var light=body.classList.toggle('light');
      if(themeSwitch) themeSwitch.classList.toggle('on',!light);
      if(themeIcon) themeIcon.querySelector('use').setAttribute('href', light?'#i-sun':'#i-moon');
    }
    function toggleTheme(e){
      var x=(e&&e.clientX)||window.innerWidth-40, y=(e&&e.clientY)||30;
      if(!document.startViewTransition){ applyTheme(); return; }
      var end=Math.hypot(Math.max(x,window.innerWidth-x),Math.max(y,window.innerHeight-y));
      document.startViewTransition(applyTheme).ready.then(function(){
        document.documentElement.animate({clipPath:['circle(0px at '+x+'px '+y+'px)','circle('+end+'px at '+x+'px '+y+'px)']},{duration:480,easing:'ease-in-out',pseudoElement:'::view-transition-new(root)'});
      });
    }
    if(themeRow) themeRow.addEventListener('click',function(e){e.stopPropagation();toggleTheme(e);});

    var curFrom='notifications@github.com';
    $$('.email-item').forEach(function(item){
      item.addEventListener('click',function(){
        $$('.email-item').forEach(function(e){e.classList.remove('selected');});
        item.classList.add('selected'); item.classList.remove('unread');
        var s=$('#readingScroll'); if(s) { s.classList.remove('reload'); void s.offsetWidth; s.classList.add('reload'); }
        var subj = item.querySelector('.email-subject');
        if(subj) $('.msg-subject').textContent = subj.textContent;
        var senderEl = item.querySelector('.email-sender');
        if(senderEl) {
          curFrom=item.getAttribute('data-from')||'';
          $('.msg-from-name').textContent=senderEl.textContent;
          $('.msg-from-addr').textContent=curFrom;
        }
      });
    });

    $$('.star-btn').forEach(function(s){
      s.addEventListener('click',function(e){e.stopPropagation();var on=this.classList.toggle('starred');this.setAttribute('data-tip',on?'取消星标':'加星标');this.classList.remove('pop');void this.offsetWidth;this.classList.add('pop');});
    });

    if(sidebar) sidebar.addEventListener('click',function(e){
      if(e.target.closest('.label-edit-btn')) return;
      var n=e.target.closest('.nav-item'); if(!n) return;
      $$('.nav-item').forEach(function(x){x.classList.remove('active');});
      n.classList.add('active');
      var l=n.querySelector('.nav-label'); if(l && $('.list-title'))$('.list-title').textContent=l.textContent;
    });

    var underline=$('#tabUnderline'),tabs=$$('.tab');
    function moveU(t){if(underline){underline.style.left=t.offsetLeft+'px';underline.style.width=t.offsetWidth+'px';}}
    tabs.forEach(function(t){t.addEventListener('click',function(){tabs.forEach(function(x){x.classList.remove('active');});t.classList.add('active');moveU(t);});});
    setTimeout(function(){var act=$('.tab.active'); if(act) moveU(act);},60);

    var ov=$('#composeOverlay');
    function openCompose(opts){
      opts=opts||{};
      var t = $('#composeTitle'); if(t) t.textContent=opts.title||'撰写新邮件';
      var cTo = $('#cTo'); if(cTo) cTo.value=opts.to||'';
      var cCc = $('#cCc'); if(cCc) cCc.value='';
      var cSub = $('#cSubject'); if(cSub) cSub.value=opts.subject||'';
      var cBod = $('#cBody'); if(cBod) cBod.innerHTML=opts.bodyHtml||'';
      if(ov) { ov.classList.remove('min'); ov.classList.add('open'); }
      setTimeout(function(){ var tgt = (opts.to?$('#cBody'):$('#cTo')); if(tgt) tgt.focus(); },320);
    }
    var cb = $('#composeBtn'); if(cb) cb.addEventListener('click',function(){ openCompose(); });
    var cc = $('#composeClose'); if(cc) cc.addEventListener('click',function(){ov.classList.remove('open');});
    var cm = $('#composeMin'); if(cm) cm.addEventListener('click',function(){ov.classList.toggle('min');});
    var cx = $('#composeMax'); if(cx) cx.addEventListener('click',function(){ov.classList.toggle('max');});
    var ch = $('#composeHeader'); if(ch) ch.addEventListener('click',function(e){if(e.target.closest('.icon-btn'))return;if(ov.classList.contains('min'))ov.classList.remove('min');});
    var cs = $('#composeSend'); if(cs) cs.addEventListener('click',function(){ov.classList.remove('open');showToast('邮件已发送 ✓');});
    var cd = $('#composeDraft'); if(cd) cd.addEventListener('click',function(){ov.classList.remove('open');showToast('已存入草稿箱');});

    function quotedBlock(){
      var subjEl=$('.msg-subject'), nameEl=$('.msg-from-name');
      var subj = subjEl?subjEl.textContent:'', name = nameEl?nameEl.textContent:'';
      return '<br><br><div style="border-left:2px solid rgba(91,110,245,.4);padding-left:10px;color:var(--text-muted)">'+
             '在 2026-08-12，'+name+' &lt;'+curFrom+'&gt; 写道：<br>'+subj+' …</div>';
    }
    var rb = $('#replyBtn'); if(rb) rb.addEventListener('click',function(){
      var subjEl=$('.msg-subject'); var subj = subjEl?subjEl.textContent:'';
      openCompose({ title:'回复邮件', to:curFrom, subject:(/^\s*re:/i.test(subj)?subj:'Re: '+subj), bodyHtml:quotedBlock() });
    });
    var fb = $('#forwardBtn'); if(fb) fb.addEventListener('click',function(){
      var subjEl=$('.msg-subject'); var subj = subjEl?subjEl.textContent:'';
      openCompose({ title:'转发邮件', to:'', subject:(/^\s*fwd:/i.test(subj)?subj:'Fwd: '+subj), bodyHtml:quotedBlock() });
    });

    var MAX=5;
    var PALETTE=['#7c5cbf','#5b6ef5','#4caf7d','#f5a623','#e05f5f','#21a1a1','#e07fd6','#8b9cff'];
    var labels=[{n:'社群',c:'#7c5cbf'},{n:'工作',c:'#5b6ef5'},{n:'促销',c:'#4caf7d'},{n:'订阅',c:'#f5a623'}];
    var labelList=$('#labelList');
    function renderSidebarLabels(){
      if(!labelList) return;
      labelList.innerHTML='';
      labels.forEach(function(l){
        var item=document.createElement('div');
        item.className='nav-item'; item.setAttribute('data-tip',l.n); item.setAttribute('data-tp','r');
        var wrap=document.createElement('span'); wrap.className='nav-ic-wrap';
        var dot=document.createElement('span'); dot.className='nav-dot-ic'; dot.style.background=l.c;
        wrap.appendChild(dot);
        var lab=document.createElement('span'); lab.className='nav-label'; lab.textContent=l.n;
        item.appendChild(wrap); item.appendChild(lab);
        labelList.appendChild(item);
      });
    }
    var modal=$('#labelModal'),modalBody=$('#labelModalBody'),addBtn=$('#labelAdd'),countEl=$('#labelCount');
    var draft=[];
    function renderModal(){
      if(!modalBody) return;
      modalBody.innerHTML='';
      draft.forEach(function(l,i){
        var row=document.createElement('div'); row.className='label-row';
        var sw=document.createElement('span'); sw.className='label-swatch'; sw.style.background=l.c;
        sw.addEventListener('click',function(){ var idx=PALETTE.indexOf(l.c); l.c=PALETTE[(idx+1)%PALETTE.length]; sw.style.background=l.c; });
        var inp=document.createElement('input'); inp.className='label-input'; inp.value=l.n; inp.maxLength=12;
        inp.addEventListener('input',function(){ l.n=inp.value; });
        var del=document.createElement('button'); del.className='label-del';
        del.innerHTML='<svg class="ic ic-sm"><use href="#i-trash"/></svg>';
        del.addEventListener('click',function(){ draft.splice(i,1); renderModal(); });
        row.appendChild(sw); row.appendChild(inp); row.appendChild(del);
        modalBody.appendChild(row);
      });
      if(countEl) countEl.textContent='最多 '+MAX+' 个 · 当前 '+draft.length;
      if(draft.length>=MAX){ addBtn.classList.add('disabled'); addBtn.querySelector('span').textContent='已达上限（最多 '+MAX+' 个）'; }
      else { addBtn.classList.remove('disabled'); addBtn.querySelector('span').textContent='添加标签'; }
    }
    function openModal(){ draft=labels.map(function(l){return {n:l.n,c:l.c};}); renderModal(); modal.classList.add('open'); }
    function closeModal(){ modal.classList.remove('open'); }
    var leb = $('#labelEditBtn'); if(leb) leb.addEventListener('click',function(e){e.stopPropagation();openModal();});
    if(addBtn) addBtn.addEventListener('click',function(){ if(draft.length>=MAX) return; draft.push({n:'新标签',c:PALETTE[draft.length%PALETTE.length]}); renderModal(); var inps=modalBody.querySelectorAll('.label-input'); var last=inps[inps.length-1]; if(last){last.focus();last.select();} });
    var lc = $('#labelCancel'); if(lc) lc.addEventListener('click',closeModal);
    if(modal) modal.addEventListener('click',function(e){ if(e.target===modal) closeModal(); });
    var ld = $('#labelDone'); if(ld) ld.addEventListener('click',function(){
      labels=draft.filter(function(l){return l.n.trim()!=='';}).map(function(l){return {n:l.n.trim(),c:l.c};});
      renderSidebarLabels(); closeModal(); showToast('标签已更新（'+labels.length+' 个）');
    });

    renderSidebarLabels();
  }
})

onUnmounted(() => {
  window.__PROTOTYPE_INIT__ = false;
})
</script>

<style scoped>
/* Scoped to not break the global admin layout when navigating */
.prototype-wrapper {
  --bg-base:#0d0f1a; --bg-surface:#13162a; --bg-elevated:#1a1e36;
  --bg-hover:#1e2340; --bg-active:#232850; --bg-card:#181c33;
  --accent-primary:#5b6ef5; --accent-secondary:#7c5cbf;
  --accent-glow:rgba(91,110,245,0.18); --accent-muted:rgba(91,110,245,0.14);
  --text-primary:#eef0fb; --text-secondary:#b6bce4; --text-muted:#767ca8; --text-accent:#9fb0ff;
  --star-color:#f5c542; --danger:#e05f5f; --success:#4caf7d;
  --border-subtle:rgba(91,110,245,0.12); --border-mid:rgba(91,110,245,0.22);
  --sidebar-w:230px; --sidebar-collapsed:72px; --list-w:340px;
  --ease:cubic-bezier(0.4,0,0.2,1);

  width: 100vw;
  height: 100vh;
  margin: 0; padding: 0;
  overflow: hidden;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 13px;
  background: var(--bg-base);
  color: var(--text-primary);
  text-align: left;
}

:global(body.light) .prototype-wrapper {
  --bg-base:#eef0f8; --bg-surface:#ffffff; --bg-elevated:#f5f6fd;
  --bg-hover:#e7eaf9; --bg-active:#dde2fb; --bg-card:#ffffff;
  --text-primary:#141726; --text-secondary:#3b4266; --text-muted:#828aad; --text-accent:#5546d6;
  --accent-glow:rgba(91,110,245,0.16); --accent-muted:rgba(91,110,245,0.12);
  --border-subtle:rgba(91,110,245,0.16); --border-mid:rgba(91,110,245,0.3);
  --star-color:#e0a91f;
}

.prototype-wrapper * {
  box-sizing: border-box;
}

.app { position:relative; width:100%; height:100%; display:flex; flex-direction:column; }

/* Global-like elements scoped to .prototype-wrapper */
.topbar, .sidebar, .email-list-pane, .reading-pane, .email-list, .list-toolbar,
.tab-bar, .reading-toolbar, .status-bar, .compose-overlay, .msg-meta,
.email-item, .action-btn, .nav-item, .account-menu, .mini-btn, .modal, .nav-ic-wrap {
  transition: background-color .38s var(--ease), color .38s var(--ease), border-color .38s var(--ease);
}

.ic { width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex-shrink:0; }
.ic-sm { width:15px; height:15px; }

/* ── TOPBAR ── */
.topbar { height:48px; background:var(--bg-surface); border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; gap:12px; padding:0 16px; flex-shrink:0; z-index:100; }
.brand-toggle { display:flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer; padding:0; }
.brand-icon { width:28px; height:28px; background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary)); border-radius:7px; display:flex; align-items:center; justify-content:center; color:#fff; flex-shrink:0; box-shadow:0 2px 10px rgba(91,110,245,0.4); transition:transform .25s var(--ease); }
.brand-toggle:hover .brand-icon { transform:rotate(-8deg) scale(1.05); }
.brand-toggle:active .brand-icon { transform:scale(.92); }
.brand-icon .ic { width:16px; height:16px; }
.brand-name { font-size:15px; font-weight:700; background:linear-gradient(90deg,#8b9cff,#b07ff5); -webkit-background-clip:text; -webkit-text-fill-color:transparent; letter-spacing:.5px; }

.topbar-search { flex:1; max-width:520px; position:relative; }
.topbar-search input { width:100%; height:32px; background:var(--bg-elevated); border:1px solid var(--border-mid); border-radius:16px; color:var(--text-primary); padding:0 14px 0 36px; font-size:12.5px; outline:none; transition:border-color .2s,box-shadow .2s; }
.topbar-search input::placeholder { color:var(--text-muted); }
.topbar-search input:focus { border-color:var(--accent-primary); box-shadow:0 0 0 3px var(--accent-glow); }
.topbar-search .search-icon { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--text-muted); pointer-events:none; }

.topbar-actions { margin-left:auto; display:flex; align-items:center; gap:6px; }
.icon-btn { width:32px; height:32px; border:none; background:transparent; cursor:pointer; color:var(--text-secondary); border-radius:8px; display:flex; align-items:center; justify-content:center; transition:background .15s,color .15s,transform .1s; position:relative; overflow:hidden; }
.icon-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
.icon-btn:active { transform:scale(.9); }
.icon-btn .badge { position:absolute; top:5px; right:6px; width:8px; height:8px; background:var(--accent-primary); border-radius:50%; border:2px solid var(--bg-surface); animation:pulse 2s var(--ease) infinite; }
@keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(91,110,245,.5);} 50%{box-shadow:0 0 0 4px rgba(91,110,245,0);} }
.spin { animation:spin .7s var(--ease); }
@keyframes spin { from{transform:rotate(0);} to{transform:rotate(360deg);} }

.avatar-wrap { position:relative; }
.avatar { width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary)); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff; cursor:pointer; border:2px solid var(--border-mid); transition:border-color .2s,transform .15s; }
.avatar:hover { border-color:var(--accent-primary); transform:scale(1.05); }
.account-menu { position:absolute; top:42px; right:0; width:264px; background:var(--bg-elevated); border:1px solid var(--border-mid); border-radius:12px; box-shadow:0 12px 44px rgba(0,0,0,.5); opacity:0; transform:translateY(-8px) scale(.96); transform-origin:top right; pointer-events:none; transition:opacity .2s var(--ease),transform .2s var(--ease); z-index:300; overflow:hidden; }
.account-menu.open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
.am-header { padding:16px; display:flex; gap:12px; align-items:center; background:linear-gradient(135deg,rgba(91,110,245,.2),rgba(124,92,191,.2)); border-bottom:1px solid var(--border-subtle); }
.am-avatar { width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary)); display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; color:#fff; flex-shrink:0; }
.am-name { font-size:14px; font-weight:700; color:var(--text-primary); }
.am-email { font-size:11px; color:var(--text-muted); }
.am-status { display:flex; align-items:center; gap:5px; margin-top:3px; }
.am-status span { font-size:10.5px; color:var(--success); }
.am-storage { padding:12px 16px; border-bottom:1px solid var(--border-subtle); }
.am-storage-label { display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary); margin-bottom:6px; }
.storage-bar { height:6px; background:var(--bg-hover); border-radius:3px; overflow:hidden; }
.storage-fill { width:42%; height:100%; background:linear-gradient(90deg,var(--accent-primary),var(--accent-secondary)); border-radius:3px; }
.am-item { padding:10px 16px; display:flex; align-items:center; gap:11px; cursor:pointer; color:var(--text-secondary); font-size:13px; transition:background .15s,color .15s; }
.am-item:hover { background:var(--bg-hover); color:var(--text-primary); }
.am-item.logout:hover { color:var(--danger); }
.am-item .am-spacer { flex:1; }
.switch { width:38px; height:20px; border-radius:10px; background:var(--bg-hover); position:relative; transition:background .25s; flex-shrink:0; }
.switch.on { background:var(--accent-primary); }
.switch::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .25s var(--ease); }
.switch.on::after { left:20px; }
.status-dot { width:7px; height:7px; border-radius:50%; background:var(--success); box-shadow:0 0 6px var(--success); }

/* ── MAIN ── */
.main { display:flex; flex:1; overflow:hidden; }

/* ── SIDEBAR ── */
.sidebar { width:var(--sidebar-w); background:var(--bg-surface); border-right:1px solid var(--border-subtle); display:flex; flex-direction:column; flex-shrink:0; overflow-x:hidden; overflow-y:auto; padding-bottom:8px; transition:width .28s var(--ease); }
.compose-btn { margin:14px 12px 12px; height:44px; background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary)); border:none; border-radius:22px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px; transition:transform .15s var(--ease),box-shadow .2s,width .28s var(--ease),margin .28s var(--ease); box-shadow:0 3px 14px rgba(91,110,245,.4); position:relative; overflow:hidden; }
.compose-btn:hover { transform:translateY(-1px); box-shadow:0 6px 24px rgba(91,110,245,.55); }
.compose-btn:active { transform:translateY(0) scale(.98); }
.compose-label { white-space:nowrap; }

.nav-section { margin-bottom:2px; }
.nav-section-label { padding:10px 20px 4px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.8px; white-space:nowrap; display:flex; align-items:center; justify-content:space-between; }
.label-edit-btn { cursor:pointer; color:var(--text-accent); font-size:10px; font-weight:600; text-transform:none; letter-spacing:0; padding:2px 8px; border-radius:8px; transition:background .15s; }
.label-edit-btn:hover { background:var(--bg-hover); }

.nav-item { display:flex; align-items:center; gap:14px; height:36px; margin:1px 10px; padding:0 12px; cursor:pointer; color:var(--text-secondary); border-radius:18px; transition:background .14s,color .14s,margin .22s var(--ease),padding .22s var(--ease); font-size:13px; position:relative; white-space:nowrap; overflow:hidden; }
.nav-item:hover { background:var(--bg-hover); color:var(--text-primary); }
.nav-item.active { background:var(--accent-muted); color:var(--text-accent); font-weight:600; }
.nav-item.active .ic { color:var(--accent-primary); }
.nav-ic-wrap { width:22px; height:22px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-radius:50%; }
.nav-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.nav-dot-ic { width:11px; height:11px; border-radius:50%; flex-shrink:0; }
.nav-count { background:var(--accent-primary); color:#fff; font-size:10px; font-weight:700; padding:1px 6px; border-radius:10px; min-width:18px; text-align:center; }
.nav-count.muted { background:var(--bg-elevated); color:var(--text-muted); }
.divider { height:1px; background:var(--border-subtle); margin:8px 16px; }

.sidebar.collapsed { width:var(--sidebar-collapsed); }
.sidebar.collapsed .compose-btn { width:48px; height:48px; margin:14px auto 12px; border-radius:50%; gap:0; padding:0; }
.sidebar.collapsed .compose-label,
.sidebar.collapsed .nav-label,
.sidebar.collapsed .nav-count,
.sidebar.collapsed .nav-section-label { display:none; }
.sidebar.collapsed .nav-item { margin:3px 0; padding:0; height:auto; justify-content:center; gap:0; border-radius:0; background:transparent; }
.sidebar.collapsed .nav-ic-wrap { width:44px; height:44px; }
.sidebar.collapsed .nav-item:hover .nav-ic-wrap { background:var(--bg-hover); }
.sidebar.collapsed .nav-item.active .nav-ic-wrap { background:var(--accent-muted); }
.sidebar.collapsed .divider { margin:8px auto; width:36px; }

/* ── LIST PANE ── */
.email-list-pane { width:var(--list-w); border-right:1px solid var(--border-subtle); display:flex; flex-direction:column; flex-shrink:0; overflow:hidden; }
.list-toolbar { height:44px; padding:0 8px 0 16px; display:flex; align-items:center; gap:3px; border-bottom:1px solid var(--border-subtle); background:var(--bg-surface); flex-shrink:0; }
.list-title { font-size:14px; font-weight:700; color:var(--text-primary); flex:1; }
.mini-btn { width:30px; height:30px; border-radius:8px; border:none; background:transparent; color:var(--text-secondary); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s,color .15s,transform .1s; overflow:hidden; position:relative; }
.mini-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
.mini-btn:active { transform:scale(.9); }

.tab-bar { display:flex; border-bottom:1px solid var(--border-subtle); background:var(--bg-surface); flex-shrink:0; position:relative; }
.tab { flex:1; padding:9px 6px; text-align:center; font-size:12px; color:var(--text-muted); cursor:pointer; transition:color .15s; white-space:nowrap; position:relative; z-index:1; }
.tab.active { color:var(--text-accent); font-weight:600; }
.tab:hover:not(.active) { color:var(--text-secondary); }
.tab-underline { position:absolute; bottom:0; height:2px; background:linear-gradient(90deg,var(--accent-primary),var(--accent-secondary)); transition:left .28s var(--ease),width .28s var(--ease); border-radius:2px 2px 0 0; }

.email-list { flex:1; overflow-y:auto; overflow-x:hidden; background:var(--bg-base); }
.email-item { padding:10px 14px; border-bottom:1px solid var(--border-subtle); cursor:pointer; position:relative; display:flex; flex-direction:column; gap:3px; animation:fadeInUp .35s var(--ease) both; }
@keyframes fadeInUp { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:translateY(0);} }
.email-item:hover { background:var(--bg-hover); }
.email-item.selected { background:var(--bg-active); }
.email-item.selected::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:linear-gradient(var(--accent-primary),var(--accent-secondary)); }
.email-item.unread .email-sender { font-weight:700; color:var(--text-primary); }
.email-item.unread .email-subject { color:var(--text-primary); font-weight:600; }
.unread-dot { position:absolute; right:13px; top:15px; width:7px; height:7px; background:var(--accent-primary); border-radius:50%; transition:opacity .2s,transform .2s; }
.email-item:not(.unread) .unread-dot { opacity:0; transform:scale(0); }
.email-row1 { display:flex; align-items:center; gap:8px; }
.email-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff; }
.email-sender { flex:1; font-size:13px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.email-time { font-size:11px; color:var(--text-muted); flex-shrink:0; }
.email-subject { font-size:12.5px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-left:36px; }
.email-preview { font-size:11.5px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-left:36px; }
.email-tags { display:flex; gap:4px; padding-left:36px; flex-wrap:wrap; margin-top:1px; }
.email-tag { font-size:10px; padding:1px 6px; border-radius:4px; font-weight:600; }
.tag-work{background:rgba(91,110,245,.2);color:#8b9cff;} .tag-promo{background:rgba(76,175,125,.2);color:#4caf7d;} .tag-urgent{background:rgba(224,95,95,.2);color:#e05f5f;} .tag-code{background:rgba(245,166,35,.2);color:#f5a623;}
.star-btn { background:none; border:none; cursor:pointer; color:var(--text-muted); padding:0 2px; flex-shrink:0; display:flex; transition:transform .15s var(--ease); }
.star-btn:hover { transform:scale(1.25); color:var(--star-color); }
.star-btn:active { transform:scale(.85); }
.star-btn.starred { color:var(--star-color); }
.star-btn.starred svg { fill:var(--star-color); }
.star-btn.pop { animation:starPop .35s var(--ease); }
@keyframes starPop { 0%{transform:scale(1);} 40%{transform:scale(1.4) rotate(12deg);} 100%{transform:scale(1);} }

/* ── READING PANE ── */
.reading-pane { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--bg-card); }
.reading-toolbar { height:44px; padding:0 12px; display:flex; align-items:center; gap:4px; border-bottom:1px solid var(--border-subtle); background:var(--bg-elevated); flex-shrink:0; }
.reading-toolbar .spacer { flex:1; }
.action-btn { height:30px; min-width:30px; padding:0 9px; border-radius:8px; border:1px solid var(--border-mid); background:var(--bg-hover); color:var(--text-secondary); font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:background .15s,color .15s,border-color .15s,transform .1s; position:relative; overflow:hidden; }
.action-btn:hover { background:var(--bg-active); color:var(--text-primary); border-color:var(--accent-primary); }
.action-btn:active { transform:scale(.94); }
.action-btn.primary { background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary)); border-color:transparent; color:#fff; font-weight:600; box-shadow:0 2px 10px rgba(91,110,245,.35); padding:0 14px; }
.action-btn.primary:hover { box-shadow:0 4px 16px rgba(91,110,245,.5); }
.action-btn.danger:hover { color:var(--danger); border-color:rgba(224,95,95,.5); background:rgba(224,95,95,.1); }

.reading-scroll { flex:1; overflow-y:auto; padding:26px 36px 40px; }
.reading-scroll.reload { animation:fadeIn .3s var(--ease); }
@keyframes fadeIn { from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
.reading-inner { max-width:760px; }
.msg-subject { font-size:21px; font-weight:700; color:var(--text-primary); margin-bottom:18px; line-height:1.35; }
.msg-meta { background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:10px; padding:13px 15px; margin-bottom:24px; }
.msg-meta-row { display:flex; align-items:flex-start; gap:11px; margin-bottom:7px; }
.msg-meta-row:last-child { margin-bottom:0; }
.msg-avatar { width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,#5b6ef5,#7c5cbf); display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; color:#fff; flex-shrink:0; }
.msg-from-block { flex:1; }
.msg-from-name { font-size:14px; font-weight:700; color:var(--text-primary); }
.msg-from-addr { font-size:12px; color:var(--text-secondary); }
.msg-date { font-size:12px; color:var(--text-secondary); white-space:nowrap; }
.msg-to-row { font-size:12.5px; color:var(--text-secondary); }
.msg-to-label { color:var(--text-muted); margin-right:4px; }
.msg-to-addr { display:inline-block; padding:1px 7px; background:var(--bg-hover); border-radius:4px; color:var(--text-accent); font-size:12px; margin:1px 2px; }

/* readable body */
.msg-body { font-size:15px; line-height:1.85; color:var(--text-primary); }
.msg-body p { margin-bottom:15px; color:var(--text-primary); }
.msg-body a { color:var(--text-accent); text-decoration:none; font-weight:500; }
.msg-body a:hover { text-decoration:underline; }
.msg-body .muted-line { color:var(--text-muted); font-size:13px; }
code.inl { background:var(--bg-hover); padding:2px 6px; border-radius:5px; font-size:13.5px; color:var(--text-accent); font-family:'SF Mono',Menlo,Consolas,monospace; }

.attachment-section { margin-top:26px; }
.attachment-label { font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:var(--text-secondary); margin-bottom:10px; }
.attachments { display:flex; gap:10px; flex-wrap:wrap; }
.attachment-chip { display:flex; align-items:center; gap:9px; padding:8px 13px; background:var(--bg-elevated); border:1px solid var(--border-mid); border-radius:9px; cursor:pointer; transition:background .15s,border-color .15s,transform .12s; }
.attachment-chip:hover { background:var(--bg-hover); border-color:var(--accent-primary); transform:translateY(-2px); }
.att-ic { color:var(--text-accent); }
.att-name { font-size:12.5px; color:var(--text-primary); font-weight:600; }
.att-size { font-size:11px; color:var(--text-muted); }

/* ── COMPOSE ── */
.compose-overlay { position:fixed; bottom:0; right:24px; width:520px; background:var(--bg-elevated); border:1px solid var(--border-mid); border-bottom:none; border-radius:10px 10px 0 0; box-shadow:0 -8px 50px rgba(0,0,0,.55); z-index:250; overflow:hidden; transform:translateY(110%); opacity:0; transition:transform .32s var(--ease),opacity .25s,width .25s var(--ease); }
.compose-overlay.open { transform:translateY(0); opacity:1; }
.compose-overlay.min .compose-body, .compose-overlay.min .compose-footer { display:none; }
.compose-overlay.max { width:70vw; }
.compose-header { height:40px; padding:0 8px 0 14px; background:linear-gradient(90deg,rgba(91,110,245,.28),rgba(124,92,191,.28)); display:flex; align-items:center; gap:4px; border-bottom:1px solid var(--border-mid); cursor:pointer; }
.compose-title { flex:1; font-size:13px; font-weight:600; color:var(--text-primary); display:flex; align-items:center; gap:7px; }
.compose-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.compose-field { display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-subtle); padding-bottom:7px; }
.compose-field-label { font-size:11px; color:var(--text-muted); width:28px; flex-shrink:0; font-weight:600; }
.compose-field input { flex:1; background:none; border:none; color:var(--text-primary); font-size:13px; outline:none; font-family:inherit; }
.compose-field input::placeholder { color:var(--text-muted); }
.compose-subject input { font-weight:600; }
.compose-editor { min-height:140px; max-height:40vh; overflow-y:auto; padding:6px 0; font-size:13.5px; color:var(--text-primary); line-height:1.7; outline:none; font-family:inherit; }
.compose-editor:empty::before { content:'正文内容…'; color:var(--text-muted); }
.compose-footer { display:flex; align-items:center; gap:6px; padding:8px 12px 12px; border-top:1px solid var(--border-subtle); }
.compose-footer .spacer { flex:1; }
.compose-tools { display:flex; gap:2px; }
.tool-btn { width:30px; height:30px; border-radius:8px; background:none; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center; justify-content:center; transition:background .15s,color .15s,transform .1s; }
.tool-btn:hover { background:var(--bg-hover); color:var(--text-secondary); }
.tool-btn:active { transform:scale(.88); }

/* ── MODAL ── */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; z-index:400; }
.modal-overlay.open { opacity:1; pointer-events:auto; }
.modal { width:370px; max-width:90vw; background:var(--bg-elevated); border:1px solid var(--border-mid); border-radius:14px; box-shadow:0 20px 60px rgba(0,0,0,.55); transform:scale(.94); transition:transform .2s var(--ease); overflow:hidden; }
.modal-overlay.open .modal { transform:scale(1); }
.modal-head { padding:14px 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-subtle); }
.modal-head h3 { font-size:14px; font-weight:700; color:var(--text-primary); }
.modal-hint { font-size:11px; color:var(--text-muted); flex:1; text-align:right; }
.modal-body { padding:12px 16px; max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:9px; }
.label-row { display:flex; align-items:center; gap:10px; }
.label-swatch { width:18px; height:18px; border-radius:50%; cursor:pointer; flex-shrink:0; transition:transform .12s; }
.label-swatch:hover { transform:scale(1.18); }
.label-input { flex:1; background:var(--bg-hover); border:1px solid var(--border-subtle); border-radius:8px; padding:7px 11px; color:var(--text-primary); font-size:12.5px; outline:none; font-family:inherit; transition:border-color .15s; }
.label-input:focus { border-color:var(--accent-primary); }
.label-del { width:28px; height:28px; border-radius:7px; border:none; background:transparent; color:var(--text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s,color .15s; flex-shrink:0; }
.label-del:hover { background:rgba(224,95,95,.14); color:var(--danger); }
.label-add { margin:2px 16px 0; padding:9px; border:1px dashed var(--border-mid); border-radius:9px; color:var(--text-accent); font-size:12.5px; cursor:pointer; transition:background .15s; display:flex; align-items:center; justify-content:center; gap:7px; }
.label-add:hover { background:var(--bg-hover); }
.label-add.disabled { opacity:.45; cursor:not-allowed; color:var(--text-muted); }
.modal-foot { padding:12px 16px; display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--border-subtle); margin-top:6px; }

/* ── STATUS BAR ── */
.status-bar { height:22px; background:var(--bg-surface); border-top:1px solid var(--border-subtle); display:flex; align-items:center; padding:0 14px; gap:16px; flex-shrink:0; }
.status-item { font-size:10.5px; color:var(--text-muted); display:flex; align-items:center; gap:5px; }

.toast { position:fixed; bottom:34px; left:50%; transform:translateX(-50%) translateY(20px); background:var(--bg-active); border:1px solid var(--accent-primary); color:var(--text-primary); padding:9px 18px; border-radius:10px; font-size:12.5px; font-weight:500; box-shadow:0 6px 30px rgba(0,0,0,.5); opacity:0; pointer-events:none; transition:opacity .25s,transform .25s var(--ease); z-index:500; display:flex; align-items:center; gap:8px; }
.toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
.toast .ic { color:var(--success); }

.tip { position:fixed; background:#000; color:#fff; padding:5px 9px; border-radius:6px; font-size:11px; font-weight:500; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .13s var(--ease); z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,.45); }
.tip.show { opacity:1; }

.ripple { position:absolute; border-radius:50%; background:rgba(255,255,255,.35); transform:scale(0); animation:rippleAnim .55s var(--ease); pointer-events:none; }
@keyframes rippleAnim { to{ transform:scale(2.5); opacity:0; } }

.av-blue{background:linear-gradient(135deg,#5b6ef5,#3d4fd6);} .av-purple{background:linear-gradient(135deg,#7c5cbf,#9b4dd6);} .av-teal{background:linear-gradient(135deg,#21a1a1,#2e8bc0);} .av-green{background:linear-gradient(135deg,#4caf7d,#2e7d5a);} .av-orange{background:linear-gradient(135deg,#f5a623,#e0701f);} .av-red{background:linear-gradient(135deg,#e05f5f,#b02929);}

::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:var(--border-mid); border-radius:3px; }
::-webkit-scrollbar-thumb:hover { background:var(--accent-primary); }
.prototype-wrapper * { scrollbar-width:thin; scrollbar-color:var(--border-mid) transparent; }
</style>
