import { mailOrm as orm } from '../entity/orm';
import { star } from '../entity/star';
import emailService from './email-service';
import BizError from '../error/biz-error';
import { and, desc, eq, lt, sql, inArray, or } from 'drizzle-orm';
import email from '../entity/email';
import { isDel } from '../const/entity-const';
import attService from "./att-service";
import settingService from './setting-service';
import { t } from '../i18n/i18n';

const starService = {

	async add(c, params, userId) {
		const { emailId } = params;
		const email = await emailService.selectById(c, emailId);
		if (!email) {
			throw new BizError(t('starNotExistEmail'));
		}
		if (email.userId !== userId) {
			throw new BizError(t('starNotExistEmail'));
		}
		const exist = await orm(c).select().from(star).where(
			and(
				eq(star.userId, userId),
				eq(star.emailId, emailId)))
			.get()

		if (exist) {
			return
		}

		await orm(c).insert(star).values({ userId, emailId }).run();
	},

	async cancel(c, params, userId) {
		const { emailId } = params;
		await orm(c).delete(star).where(
			and(
				eq(star.userId, userId),
				eq(star.emailId, emailId)))
			.run();
	},

	async list(c, params, userId) {
		let { emailId, size, keyword } = params;
		emailId = Number(emailId);
		size = Number(size);

		if (!emailId) {
			emailId = 9999999999;
		}

		const conditions = [
			eq(star.userId, userId),
			eq(email.isDel, isDel.NORMAL),
			lt(star.emailId, emailId)
		];

		if (keyword) {
			conditions.push(
				or(
					sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ keyword + '%'}`,
					sql`${email.name} COLLATE NOCASE LIKE ${'%'+ keyword + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ keyword + '%'}`,
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ keyword + '%'}`,
					sql`${email.text} COLLATE NOCASE LIKE ${'%'+ keyword + '%'}`
				)
			);
		}

		const list = await orm(c).select({
			isStar: sql`1`.as('isStar'),
			starId: star.starId
			, ...email
		}).from(star)
			.leftJoin(email, eq(email.emailId, star.emailId))
			.where(and(...conditions))
			.orderBy(desc(star.emailId))
			.limit(size)
			.all();

		const emailIds = list.map(item => item.emailId);

		const attsList = await attService.selectByEmailIds(c, emailIds);

		const settingData = await settingService.query(c);
		list.forEach(emailRow => {
			const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			emailRow.attList = atts;
			const isOfficial = emailRow.sendEmail === 'admin@epocanvas.com' || (emailRow.labels && emailRow.labels.includes('官方'));
			if (isOfficial) {
				emailRow.isOfficial = 1;
				if (!emailRow.content && settingData.welcomeContent) {
					emailRow.content = settingData.welcomeContent;
				}
				emailRow.expireDays = settingData.welcomeExpireDays ?? 7;
			}
		});

		return { list };
	},
	async removeByEmailIds(c, emailIds) {
		await orm(c).delete(star).where(inArray(star.emailId, emailIds)).run();
	}
};

export default starService;
