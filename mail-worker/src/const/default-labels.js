/**
 * epocanvas-mail - 默认用户预置标签配置
 * 
 * 管理员/站长硬编码层面的用户默认预置标签配置。
 * 站长可在此调整系统赋予新创建/注册用户的初始标签集合及规则。
 * 各用户拥有完全自主控制权，可在个人「标签设置」中自由修改、调整规则或直接删除。
 */

export const DEFAULT_USER_LABELS = [
	{
		name: '社群',
		icon: 'ic:outline-people-alt',
		color: '#3b82f6',
		listVis: true,
		stats: { total: 0, current: 0, unread: 0 },
		rules: [
			{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }
		]
	},
	{
		name: '订阅',
		icon: 'ic:outline-subscriptions',
		color: '#10b981',
		listVis: true,
		stats: { total: 0, current: 0, unread: 0 },
		rules: [
			{ condition: { type: 'system_setting', value: '' } }
		]
	},
	{
		name: '推销',
		icon: 'ic:outline-local-offer',
		color: '#f59e0b',
		listVis: true,
		stats: { total: 0, current: 0, unread: 0 },
		rules: [
			{ condition: { type: 'system_setting', value: '' } }
		]
	},
	{
		name: '工作',
		icon: 'ic:outline-work-outline',
		color: '#8b5cf6',
		listVis: true,
		stats: { total: 0, current: 0, unread: 0 },
		rules: []
	}
];

export const getDefaultUserLabelsString = () => JSON.stringify({ allLabels: DEFAULT_USER_LABELS });

export default DEFAULT_USER_LABELS;
