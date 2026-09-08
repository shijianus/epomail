import analysisDao from '../dao/analysis-dao';
import { mailOrm } from '../entity/orm';
import email from '../entity/email';
import { desc, count, eq, and, ne, isNotNull } from 'drizzle-orm';
import { emailConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import dayjs from 'dayjs';
import { toUtc } from '../utils/date-uitil';
const analysisService = {

	async echarts(c, params) {
		if (!this.analysisCacheEnabled(c)) {
			return await this.queryEcharts(c, params);
		}

		const cacheKey = this.echartsCacheKey(params);
		const cache = await c.env.kv.get(cacheKey, { type: 'json' });

		if (cache) {
			return cache;
		}

		return await this.refreshEchartsCacheByKey(c, cacheKey);
	},

	async refreshEchartsCacheByKey(c, cacheKey) {
		const params = this.echartsParamsByCacheKey(cacheKey);
		const data = await this.queryEcharts(c, params);
		await c.env.kv.put(cacheKey, JSON.stringify(data));
		return data;
	},

	async refreshEchartsCache(c) {
		if (!this.analysisCacheEnabled(c)) {
			return;
		}

		const { keys } = await c.env.kv.list({ prefix: kvConst.ANALYSIS_ECHARTS });

		await Promise.all(keys.map(key => this.refreshEchartsCacheByKey(c, key.name)));
	},

	async queryEcharts(c, params) {

		const { timeZone } = params;

		let utcDate = toUtc().startOf('day');

		let localDate = utcDate.tz(timeZone);

		utcDate = dayjs(utcDate.format('YYYY-MM-DD HH:mm:ss'))

		localDate = dayjs(localDate.format('YYYY-MM-DD HH:mm:ss'))

		//获取时差
		const diffHours = localDate.diff(utcDate, 'hour',true);

		const todayTz = toUtc().tz(timeZone).subtract(1, 'day');
		const previousDays = Array.from({ length: 15 }, (_, i) => {
			return todayTz.subtract(i, 'day').format('YYYY-MM-DD');
		}).reverse();

		const [
			numberCount,
			nameRatio,
			userDayCountRaw,
			receiveDayCountRaw,
			sendDayCountRaw,
			interceptDayCountRaw,
			daySendTotalRaw,
			hardInterceptTotalRaw,
			aiTotalRaw,
			...aiDayRawList
		] = await Promise.all([
			analysisDao.numberCount(c),

			mailOrm(c)
				.select({ name: email.name, total: count(), isSpam: email.isSpam })
				.from(email)
				.where(and(eq(email.type, emailConst.type.RECEIVE), isNotNull(email.name),ne(email.name,'noreply'), ne(email.name,'')))
				.groupBy(email.name, email.isSpam)
				.orderBy(desc(count()))
				.limit(6),

			analysisDao.userDayCount(c, diffHours),
			analysisDao.receiveDayCount(c, diffHours),
			analysisDao.sendDayCount(c, diffHours),
			analysisDao.interceptDayCount(c, diffHours),

			c.env.kv.get(kvConst.SEND_DAY_COUNT + dayjs().format('YYYY-MM-DD')),
			c.env.kv.get(kvConst.HARD_INTERCEPT_TOTAL),
			c.env.kv.get(kvConst.AI_TOTAL_USAGE, { type: 'json' }).catch(() => null),
			...previousDays.map(day => c.env.kv.get(kvConst.AI_DAY_USAGE + day, { type: 'json' }).catch(() => null))
		]);

		const userDayCount = this.filterEmptyDay(userDayCountRaw, previousDays);
		const receiveDayCount = this.filterEmptyDay(receiveDayCountRaw, previousDays);
		const sendDayCount = this.filterEmptyDay(sendDayCountRaw, previousDays);
		const interceptDayCount = this.filterEmptyDay(interceptDayCountRaw, previousDays);

		const daySendTotal = daySendTotalRaw || 0;
		const hardInterceptTotal = Number(hardInterceptTotalRaw || 0);

		// AI 用量走势与模型分布
		const aiDayCount = previousDays.map((day, idx) => {
			const item = aiDayRawList[idx] || {};
			return {
				date: day,
				calls: Number(item.calls || 0),
				tokens: Number(item.tokens || 0)
			};
		});

		const modelMap = {};
		if (aiTotalRaw && aiTotalRaw.models) {
			for (const [m, count] of Object.entries(aiTotalRaw.models)) {
				modelMap[m] = (modelMap[m] || 0) + count;
			}
		} else {
			aiDayRawList.forEach(item => {
				if (item && item.models) {
					for (const [m, count] of Object.entries(item.models)) {
						modelMap[m] = (modelMap[m] || 0) + count;
					}
				}
			});
		}

		const aiModelRatio = Object.entries(modelMap).map(([name, value]) => ({
			name,
			value: Number(value)
		})).sort((a, b) => b.value - a.value);

		const aiAnalytics = {
			dayCount: aiDayCount,
			modelRatio: aiModelRatio,
			totalCalls: Number(aiTotalRaw?.calls || aiDayCount.reduce((acc, cur) => acc + cur.calls, 0)),
			totalTokens: Number(aiTotalRaw?.tokens || aiDayCount.reduce((acc, cur) => acc + cur.tokens, 0))
		};

		return {
			numberCount: {
				...numberCount,
				hardInterceptTotal
			},
			userDayCount,
			receiveRatio: {
				nameRatio
			},
			emailDayCount: {
				receiveDayCount,
				sendDayCount,
				interceptDayCount
			},
			daySendTotal: Number(daySendTotal),
			aiAnalytics
		};
	},

	filterEmptyDay(data, previousDays) {
		return previousDays.map(day => {
			const index = data.findIndex(item => item.date === day)
			const total = index > - 1 ? data[index].total : 0
			return {date: day,total}
		})
	},

	echartsCacheKey(params = {}) {
		return kvConst.ANALYSIS_ECHARTS + encodeURIComponent(params.timeZone || 'UTC');
	},

	echartsParamsByCacheKey(cacheKey) {
		return {
			timeZone: decodeURIComponent(cacheKey.replace(kvConst.ANALYSIS_ECHARTS, ''))
		};
	},

	analysisCacheEnabled(c) {
		return c.env.analysis_cache === true || c.env.analysis_cache === 'true';
	}
}

export default  analysisService
