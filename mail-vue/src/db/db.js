import Dexie from "dexie";
import {useUserStore} from "@/store/user.js"
import { watch, shallowRef } from "vue";
import { rememberDraftDatabase, registerDatabaseCloser, isLocalSessionEnded } from '@/utils/device-privacy.js';
import { resolveTabSession } from '@/utils/tab-session.js';

const userStore = useUserStore();
const db = shallowRef({});

export function closeDraftDatabase() {
    if (typeof db.value.close === 'function') db.value.close();
}
registerDatabaseCloser(closeDraftDatabase);

function createDB() {
    closeDraftDatabase();
    const identity = resolveTabSession();
    const email = identity?.userId ? `user-${identity.userId}` : identity?.email;
    if (!email || isLocalSessionEnded()) return;
    const databaseName = `epomail-drafts-${email}`;
    const database = new Dexie(databaseName);
    database.version(1).stores({
        draft: '++draftId,createTime',
        att: 'draftId'
    });
    // Another tab may be clearing this device. Release our connection instead
    // of indefinitely blocking deletion, and never auto-reopen it on a write.
    database.on('versionchange', () => {
        database.close();
        return false; // Suppress Dexie's default handler, which enables auto-open.
    });
    db.value = database;
    rememberDraftDatabase(databaseName);
}

createDB();
watch(() => [userStore.user.email, userStore.user.userId], createDB);

export const listDraftDatabaseNames = () => Dexie.getDatabaseNames();
export default db;