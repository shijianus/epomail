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
            
            // Check for global parameter
            if (input.includes('global:')) {
                isGlobal = true;
                input = input.replace(/global:\s*/i, '').trim();
            }
            
            // Check for highlight toggle parameter
            if (input.includes('hl:off')) {
                highlight = false;
                input = input.replace(/hl:off\s*/i, '').trim();
            }
            
            return { keyword: input, isGlobal, highlight };
        }
    },
    persist: {
        pick: ['contentData'],
    },
})
