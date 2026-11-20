import { getUserDb } from './db-accessor.js';

// A fixed vocabulary bounds the table to nine rows. It stores no per-object
// samples, identities, endpoints, bucket names, credentials or measurements.
export const storageProbeNames = ['kv', 'd1', 'byo', 'orphans', 'deletionQueue', 'inboundRawCleanup', 's3', 'engine', 'settings'];

export async function ensureStorageProbeHistory(c) {
	await getUserDb(c).prepare(`CREATE TABLE IF NOT EXISTS storage_probe_history (
		probe TEXT PRIMARY KEY, last_success_at TEXT NOT NULL
	)`).run();
}

export async function recordStorageProbeHistory(c, successfulAt) {
	const history = Object.fromEntries(storageProbeNames.map(probe => [probe, successfulAt[probe] || null]));
	const successes = storageProbeNames.filter(probe => successfulAt[probe]);
	const merge = rows => {
		for (const { probe, last_success_at: stamp } of rows || []) {
			if (storageProbeNames.includes(probe) && typeof stamp === 'string' &&
				Number.isFinite(Date.parse(stamp)) && (!history[probe] || stamp > history[probe])) history[probe] = stamp;
		}
	};
	const db = getUserDb(c);
	if (!db) return { available: false, history };
	const read = () => db.prepare('SELECT probe, last_success_at FROM storage_probe_history');
	try {
		if (successes.length) {
			const insert = db.prepare(`INSERT INTO storage_probe_history(probe,last_success_at)
				VALUES ${successes.map(() => '(?,?)').join(',')}
				ON CONFLICT(probe) DO UPDATE SET last_success_at=excluded.last_success_at
				WHERE excluded.last_success_at > storage_probe_history.last_success_at`)
				.bind(...successes.flatMap(probe => [probe, successfulAt[probe]]));
			const [, saved] = await db.batch([insert, read()]);
			merge(saved.results);
		} else {
			merge((await read().all()).results);
		}
		return { available: true, history };
	} catch {
		// A transient write failure can still leave previously recorded evidence readable.
		if (successes.length) {
			try { merge((await read().all()).results); } catch { /* history unavailable */ }
		}
		return { available: false, history };
	}
}
