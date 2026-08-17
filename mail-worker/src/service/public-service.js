import jwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql, like } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import user from '../entity/user';
import userService from './user-service';
import KvConst from '../const/kv-const';


const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const userSql = `INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES ('${email}', '${hash}', '${salt}', '${type}', '${os}', '${browser}', '${activeIp}', '${activeIp}', '${device}', '${activeTime}', '${activeTime}')`

			const accountSql = `INSERT INTO account (email, name, user_id)
			VALUES ('${email}', '${emailUtils.getName(email)}', 0);`;

			userList.push(c.env.db.prepare(userSql));
			userList.push(c.env.db.prepare(accountSql));

		}

		userList.push(c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`))

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	},

	async getProfile(c, username) {
		const settingStr = await c.env.kv.get(KvConst.SETTING);
		let publicProfileEnabled = 0;
		if (settingStr) {
		    try {
		        const settings = JSON.parse(settingStr);
		        publicProfileEnabled = settings.publicProfile || 0;
		    } catch (e) {}
		}
		
		if (publicProfileEnabled === 0) {
		    // Not public. Verify token.
		    const jwt = c.req.header(constant.TOKEN_HEADER);
		    if (!jwt) throw new BizError(t('unauthorized'), 401);
		    
		    const result = await jwtUtils.verifyToken(c, jwt);
        	if (!result) throw new BizError(t('authExpired'), 401);
        	
        	const { userId, token } = result;
        	const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
        	
        	if (!authInfo || !authInfo.tokens.includes(token)) {
        		throw new BizError(t('authExpired'), 401);
        	}
        	
        	const currentUser = authInfo.user;
        	
        	// Allow if current user matches username, or is admin
        	const currentUsername = currentUser.email.split('@')[0];
        	if (currentUsername !== username && currentUser.email !== c.env.admin) {
        	    throw new BizError(t('unauthorized'), 403);
        	}
		}

		const userRow = await orm(c).select().from(user).where(like(user.email, `${username}@%`)).get();
		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}
		
		const roleRow = await roleService.selectById(c, userRow.type);
		
		const allEmails = await orm(c).select({ 
            createTime: email.createTime, 
            labels: email.labels, 
            isSpam: email.isSpam,
            type: email.type,
            sendEmail: email.sendEmail
        }).from(email).where(eq(email.userId, userRow.userId)).all();
        
        let todaySent = 0;
        let todayReceived = 0;
        let totalProcessed = 0;
        let totalIntercepted = 0;
        
        const now = new Date();
		const todayStr = now.toISOString().split('T')[0];
        
        const trendMap = {};
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const dateStr = d.toISOString().split('T')[0];
			trendMap[dateStr] = { send: 0, receive: 0, intercept: 0 };
		}
		
		const sourceMap = {};
		
		allEmails.forEach(e => {
            const rawTime = e.createTime ? String(e.createTime).replace(' ', 'T') : '';
			const dateObj = rawTime ? new Date(rawTime) : new Date();
			const dateStr = dateObj.toISOString().split('T')[0];
			
			let intercepted = false;
			if (e.isSpam === 1) intercepted = true;
			if (e.labels) {
				try {
					const labs = JSON.parse(e.labels);
					if (Array.isArray(labs) && (labs.includes('推销') || labs.includes('垃圾'))) {
                        intercepted = true;
                    }
				} catch(err) {}
			}
			
			totalProcessed++;
			if (intercepted) totalIntercepted++;
			
			if (dateStr === todayStr) {
			    if (e.type === 1) todaySent++;
			    else if (e.type === 0 && !intercepted) todayReceived++;
			}
			
			if (trendMap[dateStr]) {
			    if (intercepted) trendMap[dateStr].intercept++;
			    else if (e.type === 1) trendMap[dateStr].send++;
			    else trendMap[dateStr].receive++;
			}
			
			if (e.type === 0) { // receive, calculate source
			    let domain = '其它来源';
			    if (e.sendEmail) {
			        const match = e.sendEmail.match(/@([^>]+)>/) || e.sendEmail.match(/@([^\s]+)/);
			        if (match) {
			            domain = match[1].trim();
			        } else if (e.sendEmail.includes('@')) {
                        domain = e.sendEmail.split('@')[1].trim();
                    }
			    }
			    sourceMap[domain] = (sourceMap[domain] || 0) + 1;
			}
		});
		
		const trend = Object.keys(trendMap).map(date => {
		    const data = trendMap[date];
		    const total = data.receive + data.intercept || 1;
		    const receivePercent = Math.round((data.receive / total) * 100);
		    const interceptPercent = total > 1 || (data.receive > 0 || data.intercept > 0) ? 100 - receivePercent : 0;
		    
		    return {
		        date,
		        label: date.substring(5), // MM-DD
		        sendPercent: 0, // No longer used in UI
		        receivePercent,
		        interceptPercent
		    }
		});
		
		const topSources = Object.keys(sourceMap)
		    .map(domain => ({ domain, count: sourceMap[domain] }))
		    .sort((a,b) => b.count - a.count);
		    
		let totalSources = 0;
		for (const k in sourceMap) totalSources += sourceMap[k];
		
		const pieSources = topSources.slice(0, 3).map(s => {
		    return {
		        domain: s.domain,
		        percent: Math.round((s.count / (totalSources||1)) * 100)
		    }
		});
		
		let otherPercent = 100;
		pieSources.forEach(s => otherPercent -= s.percent);
		if (otherPercent < 0) otherPercent = 0;
		
		let profile = {};
        try {
            const profileStr = await c.env.kv.get('USER_PROFILE_' + userRow.userId);
            if (profileStr) {
                profile = JSON.parse(profileStr);
            }
        } catch (e) {}

        return {
            userInfo: {
                account: username,
                email: userRow.email,
                roleName: roleRow ? roleRow.name : 'Unknown',
                joinTime: userRow.createTime,
                avatarInitials: username.substring(0, 2).toUpperCase(),
                nickname: profile.nickname || '',
                bio: profile.bio || '',
                avatarUrl: profile.avatarUrl || '',
                backgroundUrl: profile.backgroundUrl || '',
                showStats: profile.showStats ?? true,
                showTrend: profile.showTrend ?? true,
                showSources: profile.showSources ?? true
            },
            stats: {
                todaySent,
                todayReceived,
                interceptRate: totalProcessed > 0 ? ((totalIntercepted / totalProcessed) * 100).toFixed(1) + '%' : '0%',
            },
            trend,
            sources: {
                total: totalSources,
                top: pieSources,
                otherPercent
            }
        }
	}

}

export default publicService
