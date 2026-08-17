	async getSidebarStats(c, userId) {
		const stats = await c.env.db.prepare(`
			SELECT 
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 0 AND unread = 1 THEN 1 ELSE 0 END) as inboxUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 1 AND status = 0 AND unread = 1 THEN 1 ELSE 0 END) as draftUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 1 AND status != 0 AND unread = 1 THEN 1 ELSE 0 END) as sentUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 1 AND unread = 1 THEN 1 ELSE 0 END) as spamUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 1 AND unread = 0 THEN 1 ELSE 0 END) as spamRead,
				SUM(CASE WHEN is_del = 1 AND unread = 1 THEN 1 ELSE 0 END) as trashUnread,
				SUM(CASE WHEN is_del = 1 AND unread = 0 THEN 1 ELSE 0 END) as trashRead,
				SUM(CASE WHEN is_del = 0 AND snoozed_time IS NOT NULL AND (snoozed_end_time IS NULL OR datetime(snoozed_end_time) <= datetime('now')) THEN 1 ELSE 0 END) as snoozedUrgent,
				SUM(CASE WHEN is_del = 0 AND snoozed_time IS NOT NULL AND snoozed_end_time IS NOT NULL AND datetime(snoozed_end_time) > datetime('now') THEN 1 ELSE 0 END) as snoozedWaiting,
				SUM(CASE WHEN is_del = 0 AND unread = 1 THEN 1 ELSE 0 END) as allUnread
			FROM email
			WHERE user_id = ?
		`).bind(userId).first();

		const labelEmails = await c.env.db.prepare(`
			SELECT labels, unread FROM email WHERE user_id = ? AND is_del = 0 AND labels != '[]' AND labels IS NOT NULL
		`).bind(userId).all();

		const labelStats = {};
		if (labelEmails && labelEmails.results) {
			for (const row of labelEmails.results) {
				try {
					const labels = JSON.parse(row.labels);
					for (const lbl of labels) {
						if (!labelStats[lbl]) {
							labelStats[lbl] = { unread: 0, read: 0 };
						}
						if (row.unread === 1) {
							labelStats[lbl].unread++;
						} else {
							labelStats[lbl].read++;
						}
					}
				} catch (e) {}
			}
		}

		return {
			...stats,
			labelStats
		};
	}
