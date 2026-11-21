import { defineStore } from 'pinia'
import { resolveTabSession, getTabIdentity } from '@/utils/tab-session.js'

const fallbackKey = identity => identity?.userId != null
    ? `user:${identity.userId}`
    : identity?.email ? `email:${identity.email}` : ''

function readRecords(identity) {
    const key = fallbackKey(identity)
    if (!key) return []
    try {
        const raw = localStorage.getItem(`epomail_recipient_records:${encodeURIComponent(key)}`)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
    } catch (_) { return [] }
}

function writeRecords(identity, records) {
    const key = fallbackKey(identity)
    if (!key) return
    const clean = Array.from(new Set((records || []).filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))).slice(0, 500)
    try { localStorage.setItem(`epomail_recipient_records:${encodeURIComponent(key)}`, JSON.stringify(clean)) } catch (_) {}
}

export const useWriterStore = defineStore('writer', {
    state: () => ({
        sendRecipientRecord: [],
        identityKey: '',
    }),
    actions: {
        bindIdentity(identity = resolveTabSession() || getTabIdentity()) {
            const nextKey = fallbackKey(identity)
            if (nextKey === this.identityKey) return
            this.identityKey = nextKey
            this.sendRecipientRecord = readRecords(identity)
            // The old persisted unowned writer list is deliberately not imported:
            // it cannot be attributed safely on a shared device.
            try { localStorage.removeItem('writer') } catch (_) {}
        },
        addRecipientRecords(values) {
            const identity = resolveTabSession() || getTabIdentity()
            this.bindIdentity(identity)
            const next = (values || []).filter(Boolean)
            this.sendRecipientRecord = [...next, ...this.sendRecipientRecord.filter(item => !next.includes(item))].slice(0, 500)
            writeRecords(identity, this.sendRecipientRecord)
        },
        removeRecipientRecords(values) {
            const identity = resolveTabSession() || getTabIdentity()
            this.bindIdentity(identity)
            const remove = new Set(values || [])
            this.sendRecipientRecord = this.sendRecipientRecord.filter(item => !remove.has(item))
            writeRecords(identity, this.sendRecipientRecord)
        },
        clearIdentityRecords(identity = resolveTabSession() || getTabIdentity()) {
            const key = fallbackKey(identity)
            this.sendRecipientRecord = []
            this.identityKey = ''
            if (key) try { localStorage.removeItem(`epomail_recipient_records:${encodeURIComponent(key)}`) } catch (_) {}
        },
    },
})
