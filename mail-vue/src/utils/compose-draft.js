// Each editor holds the database for its signed-in user. Draft rows and their
// attachments change in a single transaction, including the key saved before POST.
import { makeIdempotencyKey } from './tab-session.js';

const fields = ['accountId', 'sendEmail', 'name', 'receiveEmail', 'subject', 'content',
    'text', 'sendType', 'emailId', 'manyType', 'attachments'];

export function composePayload(form) {
    const body = {};
    for (const field of fields) {
        if (form[field] !== undefined) body[field] = form[field];
    }
    // Only plain transport fields (including base64 attachment content) are persisted.
    if (body.receiveEmail) body.receiveEmail = [...body.receiveEmail];
    if (body.attachments) body.attachments = body.attachments.map(item => ({ ...item }));
    return body;
}

export function hasDraftContent(body) {
    return Boolean(body.subject || body.content || body.receiveEmail?.length || body.attachments?.length);
}

export function createDraftSession(database, row = {}) {
    let id = row.draftId;
    let revision = row.revision || 0;
    let ended = false;
    let tail = Promise.resolve();
    let queuedSave;
    function transact(operation, allowMissing = false) {
        const result = tail.then(() => database.transaction('rw', database.draft, database.att, async () => {
            const saved = id == null ? null : await database.draft.get(id);
            if ((ended && !allowMissing) || (saved && (saved.revision || 0) !== revision) || (id != null && !saved && !allowMissing)) {
                throw new Error('draft_conflict');
            }
            return operation(saved);
        })).then(result => {
            // Update the editor only after IndexedDB has committed both tables.
            id = result.id;
            revision = result.revision;
            ended = !!result.ended;
            return result;
        });
        tail = result.catch(() => {});
        return result;
    }

    function persist(body, startAttempt = false) {
        // While a large attachment is being committed, retain only the latest
        // unsaved edit. Starting a send is a barrier in this queue.
        if (!startAttempt && queuedSave) {
            queuedSave.body = body;
            return queuedSave.done;
        }
        const item = { body };
        queuedSave = startAttempt ? null : item;
        item.done = transact(async saved => {
            if (queuedSave === item) queuedSave = null;
            const body = item.body;
            if (saved?.attemptKey) {
                if (!startAttempt) throw new Error('draft_pending');
                const att = await database.att.get(id);
                return { id, revision, key: saved.attemptKey, body: composePayload({
                    ...saved, attachments: att?.attachments || []
                }) };
            }
            if (!hasDraftContent(body)) {
                if (saved) {
                    await database.draft.delete(id);
                    await database.att.delete(id);
                }
                return { id: undefined, revision: 0 };
            }
            const { attachments, ...message } = body;
            const key = startAttempt ? makeIdempotencyKey() : null;
            const next = { ...message, createTime: saved?.createTime || new Date().toISOString().slice(0,19).replace('T',' '),
                revision: revision + 1, attemptKey: key };
            if (id != null) next.draftId = id;
            const savedId = await database.draft.put(next);
            await database.att.put({ draftId: savedId, attachments: attachments || [] });
            return { id: savedId, revision: next.revision, key, body };
        }).finally(() => {
            if (queuedSave === item) queuedSave = null;
        });
        return item.done;
    }

    function finish(key, delivered) {
        return transact(async saved => {
            if (!saved && delivered) return { id, revision, ended: true };
            if (!saved || saved.attemptKey !== key) throw new Error('draft_conflict');
            if (delivered) {
                await database.draft.delete(id);
                await database.att.delete(id);
                return { id, revision, ended: true };
            }
            await database.draft.update(id, { attemptKey: null, revision: revision + 1 });
            return { id, revision: revision + 1 };
        }, delivered);
    }

    return { database, persist, finish };
}
