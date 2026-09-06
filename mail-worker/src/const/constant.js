const constant = {
	TOKEN_HEADER: 'Authorization',
	JWT_UID: 'user_id:',
	JWT_TOKEN: 'token:',
	TOKEN_EXPIRE: 60 * 60 * 24 * 30,
	ATTACHMENT_PREFIX: 'attachments/',
	BACKGROUND_PREFIX: 'static/background/',
	ADMIN_ROLE: {
		name: '站长',
		roleCode: 'master',
		tagText: '最高统领',
		tagColor: '#ef4444',
		sendCount: 0,
		sendType: 'count',
		accountCount: 0,
		storageQuotaMb: 1024,
		allowAttachment: 1
	}
}

export default constant
