/**
 * Multi-Account Router History for Vue Router 4
 *
 * Implements URL architecture:
 * 1. Account prefix isolation: /mail/u/:userIndex/ (default: /mail/u/0/)
 * 2. Hash fragment view routing: #inbox, #inbox/<mailHash>, #sent, #starred...
 * 3. Browser Back / Forward & deep link synchronization
 */

export const CASE_TAB_WHITELIST = {
    overview: 'overview',
    summary: 'overview',
    basis: 'overview',
    cluster: 'overview',
    investigation: 'investigation',
    timeline: 'investigation',
    risk: 'investigation',
    'judgment-path': 'investigation',
    evidence: 'evidence',
    chain: 'evidence',
    similar: 'evidence',
    decision: 'decision',
    ledger: 'decision'
};

export function normalizeCaseTab(rawTab) {
    if (!rawTab) return 'overview';
    const clean = String(rawTab).trim().toLowerCase();
    return CASE_TAB_WHITELIST[clean] || 'overview';
}

export function parseCaseDeepLink(loc = typeof window !== 'undefined' ? window.location : null) {
    const empty = { isCaseLink: false, caseId: '', rawTab: '', tab: 'overview', canonicalHash: '' };
    if (!loc) return empty;

    const hash = String(loc.hash || '');
    const search = String(loc.search || '');

    let rawCase = '';
    let rawTab = '';

    // 1. Check hash fragment first: #case=THR-2026-MULTI99:investigation or #/case=...
    if (hash) {
        let h = hash.startsWith('#') ? hash.slice(1) : hash;
        if (h.startsWith('/')) h = h.slice(1);
        const hashMatch = h.match(/(?:^|[?&/])case=([^&#]+)/);
        if (hashMatch && hashMatch[1]) {
            const seg = hashMatch[1].trim();
            const colonIdx = seg.indexOf(':');
            if (colonIdx !== -1) {
                rawCase = seg.slice(0, colonIdx).trim();
                rawTab = seg.slice(colonIdx + 1).trim();
            } else {
                rawCase = seg;
            }
            if (!rawTab && h.includes('tab=')) {
                const tabMatch = h.match(/[?&]tab=([^&#:]+)/);
                if (tabMatch && tabMatch[1]) rawTab = tabMatch[1].trim();
            }
        }
    }

    // 2. Check query string fallback: ?case=THR-2026-MULTI99&tab=investigation
    if (!rawCase && search) {
        try {
            const sp = new URLSearchParams(search);
            const qCase = (sp.get('case') || '').trim();
            const qTab = (sp.get('tab') || '').trim();
            if (qCase) {
                const colonIdx = qCase.indexOf(':');
                if (colonIdx !== -1) {
                    rawCase = qCase.slice(0, colonIdx).trim();
                    rawTab = qTab || qCase.slice(colonIdx + 1).trim();
                } else {
                    rawCase = qCase;
                    rawTab = qTab;
                }
            }
        } catch (_) {}
    }

    if (!rawCase) return empty;

    try {
        rawCase = decodeURIComponent(rawCase).replace(/^#/, '').trim();
    } catch (_) {
        rawCase = rawCase.replace(/^#/, '').trim();
    }
    if (!rawCase) return empty;

    const tab = normalizeCaseTab(rawTab);
    return {
        isCaseLink: true,
        caseId: rawCase,
        rawTab: rawTab || tab,
        tab,
        canonicalHash: `#case=${rawCase}:${tab}`
    };
}

export function createAccountHistory(defaultAccountIdx = 0) {
    const getAccountBase = () => {
        if (typeof window === 'undefined') return `/mail/u/${defaultAccountIdx}/`;
        const m = window.location.pathname.match(/\/mail\/u\/(\d+)/);
        const idx = m ? m[1] : defaultAccountIdx;
        return `/mail/u/${idx}/`;
    };

    const parsePathFromLocation = () => {
        if (typeof window === 'undefined') return '/inbox';
        const { pathname, search, hash } = window.location;

        // 0. 优先识别案件全宗深链接 (#case=... 或 ?case=...)，防止落入通用 /:username 个人资料兜底
        const caseLink = parseCaseDeepLink(window.location);
        if (caseLink.isCaseLink) {
            return '/audit-report';
        }

        // 1. If hash exists: e.g. #inbox, #inbox/xxx, #/inbox
        if (hash) {
            let h = hash.startsWith('#') ? hash.slice(1) : hash;
            if (h.startsWith('/')) h = h.slice(1);
            if (h) {
                return '/' + h;
            }
        }

        // 2. If no hash, but pathname is a legacy or direct path (e.g. /inbox, /sent)
        if (pathname && !pathname.startsWith('/mail/u/')) {
            const cleanPath = pathname.startsWith('/') ? pathname : '/' + pathname;
            if (cleanPath !== '/' && cleanPath !== '/mail' && cleanPath !== '/mail/') {
                return cleanPath + (search || '');
            }
        }

        return '/inbox';
    };

    let currentLocation = parsePathFromLocation();
    let historyListeners = [];

    const isAuditRoutePath = (cleanPath) => {
        return cleanPath === 'audit-report' || cleanPath === 'audit' || cleanPath.endsWith('/audit') || cleanPath.endsWith('/audit-report');
    };

    const buildFullUrl = (toPath, options = {}) => {
        const preserveCaseHash = options.preserveCaseHash !== false;
        const p = typeof toPath === 'string' ? toPath : (toPath.path || '/inbox');
        const clean = p.startsWith('/') ? p.slice(1) : p;
        if (preserveCaseHash && isAuditRoutePath(clean) && typeof window !== 'undefined') {
            const caseLink = parseCaseDeepLink(window.location);
            if (caseLink.isCaseLink) {
                return `${getAccountBase()}${window.location.hash || caseLink.canonicalHash}`;
            }
        }
        return `${getAccountBase()}#${clean}`;
    };

    const notify = (to, from, info = {}) => {
        historyListeners.forEach(cb => {
            try {
                cb(to, from, info);
            } catch (err) {
                console.error('[account-history] listener error:', err);
            }
        });
    };

    const onPop = () => {
        const from = currentLocation;
        const nextLocation = parsePathFromLocation();
        currentLocation = nextLocation;
        // 当仅在同路由内切换案件或 Tab (如 #audit-report <-> #case=THR-xxx:tab 或 /manage/admin/audit <-> /audit-report) 时，
        // 路由视图仍为同一个操作报告组件，不触发重复路由跳转，交由审计视图内部响应状态
        const cleanFrom = String(from || '').replace(/^\//, '');
        const cleanNext = String(nextLocation || '').replace(/^\//, '');
        if (nextLocation === from || (isAuditRoutePath(cleanFrom) && isAuditRoutePath(cleanNext))) {
            return;
        }
        notify(currentLocation, from, {
            delta: 0,
            type: 'pop',
            direction: ''
        });
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('popstate', onPop);
        window.addEventListener('hashchange', onPop);

        // Normalize URL if on legacy path or naked root
        const initialFull = buildFullUrl(currentLocation, { preserveCaseHash: true });
        const currentFull = window.location.pathname + window.location.search + window.location.hash;
        if (!currentFull.startsWith(getAccountBase()) || !window.location.hash) {
            window.history.replaceState(window.history.state || {}, '', initialFull);
        }
    }

    return {
        get base() {
            return getAccountBase();
        },
        get location() {
            return currentLocation;
        },
        get state() {
            return typeof window !== 'undefined' ? (window.history.state || {}) : {};
        },
        push(to, data) {
            const from = currentLocation;
            currentLocation = typeof to === 'string' ? to : (to.path || '/inbox');
            const targetUrl = buildFullUrl(currentLocation, { preserveCaseHash: true });
            if (typeof window !== 'undefined') {
                window.history.pushState(data || {}, '', targetUrl);
            }
        },
        replace(to, data) {
            const from = currentLocation;
            currentLocation = typeof to === 'string' ? to : (to.path || '/inbox');
            const targetUrl = buildFullUrl(currentLocation, { preserveCaseHash: true });
            if (typeof window !== 'undefined') {
                window.history.replaceState(data || {}, '', targetUrl);
            }
        },
        go(delta) {
            if (typeof window !== 'undefined') {
                window.history.go(delta);
            }
        },
        listen(callback) {
            historyListeners.push(callback);
            return () => {
                historyListeners = historyListeners.filter(fn => fn !== callback);
            };
        },
        createHref(to) {
            return buildFullUrl(to, { preserveCaseHash: false });
        },
        destroy() {
            if (typeof window !== 'undefined') {
                window.removeEventListener('popstate', onPop);
                window.removeEventListener('hashchange', onPop);
            }
            historyListeners = [];
        }
    };
}

export const createGmailHistory = createAccountHistory;
export default createAccountHistory;
