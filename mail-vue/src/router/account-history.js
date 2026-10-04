/**
 * Multi-Account Router History for Vue Router 4
 *
 * Implements URL architecture:
 * 1. Account prefix isolation: /mail/u/:userIndex/ (default: /mail/u/0/)
 * 2. Hash fragment view routing: #inbox, #inbox/<mailHash>, #sent, #starred...
 * 3. Browser Back / Forward & deep link synchronization
 */

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

    const buildFullUrl = (toPath) => {
        const p = typeof toPath === 'string' ? toPath : (toPath.path || '/inbox');
        const clean = p.startsWith('/') ? p.slice(1) : p;
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
        currentLocation = parsePathFromLocation();
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
        const initialFull = buildFullUrl(currentLocation);
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
            const targetUrl = buildFullUrl(currentLocation);
            if (typeof window !== 'undefined') {
                window.history.pushState(data || {}, '', targetUrl);
            }
        },
        replace(to, data) {
            const from = currentLocation;
            currentLocation = typeof to === 'string' ? to : (to.path || '/inbox');
            const targetUrl = buildFullUrl(currentLocation);
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
            return buildFullUrl(to);
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
