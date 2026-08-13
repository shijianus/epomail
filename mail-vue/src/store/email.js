import { defineStore } from 'pinia'

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
    }),
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
                .trim();
            
            // We return the raw input as keyword so the backend can parse its own flags 
            // (e.g. global:, is:sent, is:draft, is:spam, etc.)
            return { keyword: input, cleanKeyword, isGlobal, highlight, isDraft };
        }
    },
    persist: {
        pick: ['contentData'],
    },
})
