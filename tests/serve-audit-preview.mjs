import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('mail-worker/dist');
const port = 4199;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const mockCases = [
  {
    id: 1001,
    ticketId: 'THR-2026-MULTI99',
    email: 'cluster_master@epocanvas.com',
    userId: '88200',
    status: 'pending',
    circuitStatus: 'QUEUE_PAUSE',
    warningType: 'risk',
    recommendedAction: 'ban_account',
    priority: 'P0',
    category: 'quota',
    reasonCode: 'RULE-SPAM-77',
    reportReason: '同一设备指纹 30 分钟内注册并激活 4 个账号，批量外发',
    banReason: '同一设备指纹 30 分钟内注册并激活 4 个账号，主账号协同 3 个子账号批量外发，判定一人多号集群滥用。',
    alarmCount: 3,
    assignee: 'SecAdmin',
    adjudicator: 'SecAdmin',
    evidenceExpiresDays: 180,
    createTime: '2026-10-12T03:14:00Z',
    banTime: '2026-10-12T03:20:00Z',
    clusterAccounts: [
      { id: 101, email: 'sub01_cluster@epocanvas.com', userId: '88201', status: 'banned', evidenceSummary: '同一设备指纹 · 30分钟内注册' },
      { id: 102, email: 'sub02_cluster@epocanvas.com', userId: '88202', status: 'banned', evidenceSummary: '同一设备指纹 · 批量协同外发' },
      { id: 103, email: 'sub03_cluster@epocanvas.com', userId: '88203', status: 'banned', evidenceSummary: '同一出口 IP · 触发退信熔断' }
    ]
  },
  {
    id: 1002,
    ticketId: 'APP-2026-NAT88',
    email: 'student_nat@epocanvas.com',
    userId: '77301',
    status: 'pending',
    warningType: 'appeal',
    recommendedAction: 'approve_appeal',
    priority: 'P1',
    category: 'outbound',
    reasonCode: 'APP-NAT-SHARE',
    appealReason: '校园网NAT出口共享IP，无主观多账号滥用恶意',
    alarmCount: 1,
    assignee: 'SecAdmin',
    adjudicator: '合规复核组',
    evidenceExpiresDays: 180,
    createTime: '2026-10-13T08:30:00Z'
  },
  {
    id: 1003,
    ticketId: 'AUD-2026-SPIKE12',
    email: 'marketing_surge@epocanvas.com',
    userId: '66102',
    status: 'watching',
    warningType: 'audit',
    priority: 'P2',
    category: 'account',
    reasonCode: 'RULE-BURST-REG',
    reportReason: '短时突发发信速率超动态基线 300%',
    alarmCount: 2,
    assignee: 'SecAdmin',
    adjudicator: '系统策略引擎',
    evidenceExpiresDays: 90,
    createTime: '2026-10-14T16:00:00Z'
  },
  {
    id: 1004,
    ticketId: 'REC-2026-BAN05',
    email: 'terminated_sybil@epocanvas.com',
    userId: '55403',
    status: 'banned',
    warningType: 'ban',
    priority: 'P0',
    category: 'quota',
    reasonCode: 'RULE-REG-55',
    banReason: '终审封禁固化，永久阻断发信通道',
    alarmCount: 4,
    assignee: 'SecAdmin',
    adjudicator: '安全委员会',
    evidenceExpiresDays: 180,
    createTime: '2026-10-15T02:00:00Z',
    banTime: '2026-10-15T02:05:00Z'
  },
  {
    id: 1005,
    ticketId: 'BAN-2026-UN0021',
    email: 'unbanned_sybil@epocanvas.com',
    userId: '44201',
    status: 'unbanned',
    warningType: 'ban',
    priority: 'P2',
    category: 'security',
    reasonCode: 'RULE-REG-55',
    banReason: '前期封禁已复核解除，存证归档',
    alarmCount: 1,
    assignee: 'SecAdmin',
    adjudicator: '安全委员会',
    evidenceExpiresDays: 180,
    createTime: '2026-10-10T02:00:00Z',
    banTime: '2026-10-10T02:05:00Z'
  }
];

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // 1. 若外部或旧缓存访问登录页，在预览服务中平滑直达审计页面
  if (urlPath === '/login' || urlPath === '/login/') {
    res.writeHead(302, { 'Location': '/audit-report' });
    return res.end();
  }

  // 2. API Mock 端点：下发只读演示所需的各上下文
  if (urlPath === '/api/my/loginUserInfo') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      code: 200,
      data: {
        userId: 9,
        email: 'admin@epomail.cyou',
        primaryEmail: 'admin@epomail.cyou',
        username: 'SecAdmin',
        name: 'SecAdmin',
        permKeys: ['*'],
        role: { roleId: 1, name: '站长', roleCode: 'admin', key: 'admin' },
        account: { accountId: 99, email: 'admin@epomail.cyou', name: 'admin@epomail.cyou' },
        accounts: [{ accountId: 99, email: 'admin@epomail.cyou', name: 'admin@epomail.cyou' }]
      }
    }));
  }

  if (urlPath === '/api/setting/websiteConfig' || urlPath === '/api/sys/setting' || urlPath === '/api/settings') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      code: 200,
      data: {
        title: 'Epocanvas Mail',
        enable_registration: true,
        require_email_verify: false,
        enable_turnstile: false,
        domainList: ['epocanvas.com', 'epomail.cyou']
      }
    }));
  }

  if (urlPath === '/api/my/storage') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      code: 200,
      data: {
        usedBytes: 1048576,
        usedMb: '1.00',
        fileCount: 12,
        isVisitor: false,
        quotaMb: 1024
      }
    }));
  }

  if (urlPath === '/api/audit/mock-delay') {
    const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    globalThis.__auditListDelayMs = Math.max(0, Number(reqUrl.searchParams.get('ms') || 0));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 200, data: { delayMs: globalThis.__auditListDelayMs } }));
  }

  if (urlPath === '/api/audit/list') {
    const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const kw = (reqUrl.searchParams.get('keyword') || '').trim();
    const wType = (reqUrl.searchParams.get('warningType') || 'all').trim();
    const delayMs = globalThis.__auditListDelayMs || 0;

    const sendList = () => {
      const upperKw = kw.toUpperCase();
      if (upperKw.includes('FORBIDDEN') || upperKw.includes('UNAUTH')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        return res.end(JSON.stringify({
          code: 403,
          message: '当前角色无权访问该受控案件档案 (403 Forbidden)'
        }));
      }
      if (upperKw.includes('LOADERR') || upperKw.includes('SERVERERR')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        return res.end(JSON.stringify({
          code: 500,
          message: '案件档案加载失败，上游存储服务暂时不可用 (500)'
        }));
      }

      let filtered = [...mockCases];
      if (wType && wType !== 'all') {
        filtered = filtered.filter(c => c.warningType === wType);
      }
      if (kw) {
        const cleanKw = kw.replace(/^ticket:/i, '').replace(/^#/, '').trim().toLowerCase();
        filtered = filtered.filter(c =>
          String(c.ticketId || '').toLowerCase().includes(cleanKw) ||
          String(c.id || '').toLowerCase() === cleanKw ||
          String(c.email || '').toLowerCase().includes(cleanKw)
        );
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({
        code: 200,
        data: {
          list: filtered,
          total: filtered.length,
          summary: { threat: 1, appeal: 1, audit: 1, record: 1 }
        }
      }));
    };
    if (delayMs > 0) {
      setTimeout(sendList, delayMs);
      return;
    }
    return sendList();
  }

  if (urlPath === '/api/public/profile') {
    const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const uname = (reqUrl.searchParams.get('username') || '').trim().toLowerCase();
    if (uname === 'admin' || uname === 'secadmin') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        code: 200,
        data: {
          userInfo: {
            account: 'SecAdmin',
            email: 'admin@epomail.cyou',
            roleName: '站长',
            roleCode: 'master',
            joinTime: '2026-01-01T00:00:00Z',
            avatarInitials: 'SA'
          },
          stats: { todaySent: 0, todayReceived: 0, interceptRate: '0%' },
          trend: [],
          sources: { total: 0, top: [], otherPercent: 100 }
        }
      }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      code: 501,
      message: 'User profile not found'
    }));
  }

  if (urlPath.startsWith('/api/mail')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 200, data: { list: [], total: 0 } }));
  }

  // 严防生产转发与虚假写操作：任何写操作（POST/PUT/DELETE 如裁决提交、封禁等）全面拦截，明确提示只读
  if (req.method !== 'GET' && urlPath.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      code: 403,
      message: '【安全提示】当前为纯前端只读仿真预览，已全面拦截并禁止所有写操作与裁决提交。'
    }));
  }

  if (urlPath.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 200, data: null }));
  }

  // 3. 静态资源分发与 SPA 入口安全注入
  let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
  let isHtml = false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
    isHtml = true;
  } else if (filePath.endsWith('.html')) {
    isHtml = true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading asset');
    }
    if (isHtml) {
      let html = content.toString('utf-8');
      html = html
        .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
        .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/gi, '')
        .replace(/<script[^>]*challenges\.cloudflare\.com[^>]*><\/script>/gi, '');
      const previewBootstrap = `
  <script>
    (function() {
      try {
        if (!localStorage.getItem('setting')) {
          localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
        }
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', 'preview_safe_mock_token');
          localStorage.setItem('role', 'admin');
          localStorage.setItem('loginEmail', 'admin@epomail.cyou');
          localStorage.setItem('epo_sessions', JSON.stringify([{
            u: 0,
            token: 'preview_safe_mock_token',
            email: 'admin@epomail.cyou',
            name: 'SecAdmin',
            roleName: '站长'
          }]));
        }
        if (window.location.hash && window.location.hash.includes('login')) {
          window.location.hash = '#audit-report';
        }
      } catch (e) {
        console.warn('[Preview] bootstrap warning:', e);
      }
    })();
  </script>`;
      html = html.replace('<head>', '<head>' + previewBootstrap);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end(html);
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(content);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[Preview Server] Active on 0.0.0.0:${port}`);
});
