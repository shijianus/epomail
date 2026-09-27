import { defineStore } from 'pinia'
import { emailSidebarStats } from '@/request/email.js'
import router from '@/router/index.js'

export const useEmailStore = defineStore('email', {
    state: () => ({
        deleteIds: 0,
        starScroll: null,
        emailScroll: null,
        cancelStarEmailId: 0,
        addStarEmailId: 0,
        contentData: {
            email: null,
            delType: null,
            showStar: true,
            showReply: true,
            showUnread: false
        },
        sendScroll: null,
        searchKeyword: '',
        sidebarStats: {},
    }),
    actions: {
        openEmail(email, { delType = 'logic', showUnread = true, showStar = true, showReply = true, routeName = null } = {}) {
            this.contentData.email = email;
            this.contentData.delType = delType;
            this.contentData.showUnread = showUnread;
            this.contentData.showStar = showStar;
            this.contentData.showReply = showReply;
            const mailIdentifier = email?.hash || email?.emailId;
            if (email && mailIdentifier) {
                const cur = router.currentRoute.value;
                const targetName = routeName || cur.name;
                const curParam = cur.params?.mailHash || cur.params?.mailId;
                if (curParam !== String(mailIdentifier)) {
                    router.push({
                        name: targetName,
                        params: { mailHash: mailIdentifier, mailId: mailIdentifier },
                        query: cur.query
                    }).catch(() => {});
                }
            }
        },
        closeEmail() {
            this.contentData.email = null;
            const cur = router.currentRoute.value;
            if (cur.params?.mailHash || cur.params?.mailId) {
                router.push({
                    name: cur.name,
                    params: { mailHash: '', mailId: '' },
                    query: cur.query
                }).catch(() => {});
            }
        },
        async refreshSidebarStats() {
            try {
                const data = await emailSidebarStats()
                if (data) {
                    this.sidebarStats = data
                }
            } catch (e) {
                console.error("Failed to fetch sidebar stats", e)
            }
        }
    },
    getters: {
        searchParsed: (state) => {
            let input = state.searchKeyword.trim();
            let isGlobal = false;
            let highlight = true;
            
            // Check for global parameter (still parse it for frontend routing)
            if (/global:/i.test(input)) {
                isGlobal = true;
            }
            
            // Check for highlight toggle parameter (still parse it for frontend rendering)
            if (/hl:off/i.test(input)) {
                highlight = false;
            }

            let isDraft = false;
            if (/is:draft/i.test(input)) {
                isDraft = true;
            }
            
            let cleanKeyword = input.replace(/global:/ig, '')
                .replace(/is:sent/ig, '')
                .replace(/from:me/ig, '')
                .replace(/is:draft/ig, '')
                .replace(/is:spam/ig, '')
                .replace(/is:trash/ig, '')
                .replace(/hl:off/ig, '')
                .replace(/label:"[^"]+"/ig, '')
                .replace(/label:[^\s]+/ig, '')
                .trim();
            
            // For all-email $-syntax: strip $token directives, keep plain keyword for highlight
            let allEmailKeyword = '';
            if (/\$/.test(cleanKeyword)) {
                // Extract plain words that are not $-prefixed tokens and their values
                const parts = cleanKeyword.split(/(?=\$)/);
                const freeText = [];
                for (const p of parts) {
                    if (p.startsWith('$')) {
                        // $token value — extract value after space as potential highlight text
                        const spaceIdx = p.indexOf(' ');
                        if (spaceIdx !== -1) {
                            freeText.push(p.slice(spaceIdx + 1).trim());
                        }
                    } else {
                        freeText.push(p.trim());
                    }
                }
                allEmailKeyword = freeText.filter(Boolean).join(' ').trim();
                cleanKeyword = allEmailKeyword || cleanKeyword;
            }
            
            // We return the raw input as keyword so the backend can parse its own flags 
            // (e.g. global:, is:sent, is:draft, is:spam, etc.)
            return { keyword: input, cleanKeyword, isGlobal, highlight, isDraft };
        }
    },
    persist: {
        pick: ['contentData'],
    },
})
