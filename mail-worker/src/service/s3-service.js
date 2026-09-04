import { S3Client, PutObjectCommand, DeleteObjectsCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import settingService from './setting-service';
import domainUtils from '../utils/domain-uitls';
import { settingConst } from '../const/entity-const';
import s3Signer from '../utils/s3-signer';

const s3Service = {

	/**
	 * Build S3Client from custom config or system settings
	 */
	async client(c, customConfig = null) {
		let cfg = customConfig;
		if (!cfg) {
			cfg = await settingService.query(c);
		}

		const region = cfg.region || 'auto';
		const endpoint = s3Signer.normalizeEndpoint(cfg.endpoint);
		const forcePathStyle = cfg.forcePathStyle === settingConst.forcePathStyle.OPEN || cfg.forcePathStyle === 1 || cfg.forcePathStyle === true;
		const accessKeyId = cfg.s3AccessKey || cfg.accessKeyId || cfg.accessKey || '';
		const secretAccessKey = cfg.s3SecretKey || cfg.secretAccessKey || cfg.secretKey || '';

		return new S3Client({
			region,
			endpoint: domainUtils.toOssDomain(endpoint),
			forcePathStyle,
			credentials: {
				accessKeyId,
				secretAccessKey
			}
		});
	},

	/**
	 * Upload an object to S3 / Backblaze B2
	 */
	async putObj(c, key, content, metadata = {}, customConfig = null) {
		const client = await this.client(c, customConfig);
		const bucket = customConfig?.bucket || (await settingService.query(c)).bucket;

		const obj = {
			Bucket: bucket,
			Key: key,
			Body: content
		};

		if (metadata.cacheControl) {
			obj.CacheControl = metadata.cacheControl;
		}
		if (metadata.contentDisposition) {
			obj.ContentDisposition = metadata.contentDisposition;
		}
		if (metadata.contentType) {
			obj.ContentType = metadata.contentType;
		}

		await client.send(new PutObjectCommand(obj));
	},

	/**
	 * Delete one or multiple objects from S3 / Backblaze B2
	 */
	async deleteObj(c, keys, customConfig = null) {
		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (!keys || keys.length === 0) {
			return;
		}

		const client = await this.client(c, customConfig);
		const bucket = customConfig?.bucket || (await settingService.query(c)).bucket;

		// Calculate Content-MD5 header for AWS/Backblaze batch delete compatibility
		client.middlewareStack.add(
			(next) => async (args) => {
				const body = args.request.body;
				if (body) {
					const encoder = new TextEncoder();
					const data = typeof body === 'string' ? encoder.encode(body) : body;
					const hashBuffer = await crypto.subtle.digest('MD5', data);
					const hashArray = new Uint8Array(hashBuffer);
					const contentMD5 = btoa(String.fromCharCode.apply(null, hashArray));
					args.request.headers["Content-MD5"] = contentMD5;
				}
				return next(args);
			},
			{ step: "build", name: "inspectRequestMiddleware" }
		);

		await client.send(
			new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: {
					Objects: keys.map(key => ({ Key: key }))
				}
			})
		);
	},

	/**
	 * Retrieve object as a streaming Response
	 */
	async getObj(c, key, customConfig = null) {
		const client = await this.client(c, customConfig);
		const bucket = customConfig?.bucket || (await settingService.query(c)).bucket;

		const result = await client.send(new GetObjectCommand({
			Bucket: bucket,
			Key: key
		}));

		return new Response(result.Body, {
			headers: {
				'Content-Type': result.ContentType || 'application/octet-stream',
				'Content-Disposition': result.ContentDisposition || null,
				'Cache-Control': result.CacheControl || null
			}
		});
	},

	/**
	 * Get direct Presigned Download URL or CDN URL
	 */
	async getPresignedDownloadUrl(c, key, customConfig = null, filename = null, expiresIn = 3600) {
		const cfg = customConfig || (await settingService.query(c));
		const bucket = cfg.bucket;
		const endpoint = cfg.endpoint;
		const region = cfg.region || 'auto';
		const accessKeyId = cfg.s3AccessKey || cfg.accessKeyId || cfg.accessKey;
		const secretAccessKey = cfg.s3SecretKey || cfg.secretAccessKey || cfg.secretKey;
		const forcePathStyle = cfg.forcePathStyle === 1 || cfg.forcePathStyle === true || cfg.forcePathStyle === settingConst.forcePathStyle.OPEN;
		const customDomain = cfg.customDomain || cfg.cdnDomain || '';

		return await s3Signer.getPresignedUrl({
			bucket,
			endpoint,
			region,
			accessKeyId,
			secretAccessKey,
			key,
			forcePathStyle,
			expiresIn,
			customDomain
		});
	},

	/**
	 * Diagnostic Connection & Permissions Test
	 */
	async testConnection(config) {
		const startTime = Date.now();
		const bucket = (config.bucket || '').trim();
		const endpoint = s3Signer.normalizeEndpoint(config.endpoint || '');
		const region = (config.region || 'auto').trim();
		const accessKeyId = (config.s3AccessKey || config.accessKeyId || config.accessKey || '').trim();
		const secretAccessKey = (config.s3SecretKey || config.secretAccessKey || config.secretKey || '').trim();
		const forcePathStyle = config.forcePathStyle === 1 || config.forcePathStyle === true || config.forcePathStyle === '1';
		const customDomain = (config.customDomain || config.cdnDomain || '').trim();

		if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
			return {
				ok: false,
				message: '配置信息不完整，请提供 Bucket 名称、Endpoint 节点、Access Key 及 Secret Key。'
			};
		}

		const provider = s3Signer.detectProvider(endpoint);
		const probeKey = `epomail_probe_check_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.tmp`;

		try {
			const client = new S3Client({
				region,
				endpoint: domainUtils.toOssDomain(endpoint),
				forcePathStyle,
				credentials: {
					accessKeyId,
					secretAccessKey
				}
			});

			// 1. Test PUT Object
			const testData = JSON.stringify({
				system: 'EpoMail',
				probe: true,
				createdAt: new Date().toISOString(),
				provider
			});

			await client.send(new PutObjectCommand({
				Bucket: bucket,
				Key: probeKey,
				Body: testData,
				ContentType: 'application/json'
			}));

			// 2. Test GET Object
			const getRes = await client.send(new GetObjectCommand({
				Bucket: bucket,
				Key: probeKey
			}));

			if (!getRes.Body) {
				throw new Error('未能从存储桶读取测试探针对象。');
			}

			// 3. Test DELETE Object
			try {
				await client.send(new DeleteObjectCommand({
					Bucket: bucket,
					Key: probeKey
				}));
			} catch (delErr) {
				console.warn('Probe cleanup warning:', delErr);
			}

			const latencyMs = Date.now() - startTime;

			// 4. Test Presigned URL generation
			let samplePresignedUrl = null;
			try {
				samplePresignedUrl = await s3Signer.getPresignedUrl({
					bucket,
					endpoint,
					region,
					accessKeyId,
					secretAccessKey,
					key: 'sample-attachment.pdf',
					forcePathStyle,
					expiresIn: 3600,
					customDomain
				});
			} catch (urlErr) {
				console.warn('Presigned URL test warning:', urlErr);
			}

			return {
				ok: true,
				latencyMs,
				provider,
				bucket,
				endpoint,
				customDomain: customDomain || null,
				sampleDownloadUrl: samplePresignedUrl,
				message: `已成功连通 ${provider} 存储桶 [${bucket}]！读写与删除权限全部正常验证通过（耗时: ${latencyMs}ms）。`
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			const errMsg = error.message || error.toString();

			let friendlyError = errMsg;
			if (errMsg.includes('NoSuchBucket') || errMsg.includes('404')) {
				friendlyError = `存储桶 [${bucket}] 不存在，请检查存储桶名称是否拼写正确。`;
			} else if (errMsg.includes('InvalidAccessKeyId') || errMsg.includes('SignatureDoesNotMatch') || errMsg.includes('403') || errMsg.includes('Forbidden')) {
				friendlyError = `凭据验证失败 (403 Forbidden)，请检查 Access Key ID (Key ID) 与 Secret Key (Application Key) 是否正确并具备读写权限。`;
			} else if (errMsg.includes('ENOTFOUND') || errMsg.includes('fetch failed') || errMsg.includes('Failed to fetch')) {
				friendlyError = `无法解析或连接到 Endpoint [${endpoint}]，请检查网络节点域名是否正确。`;
			}

			return {
				ok: false,
				latencyMs,
				provider,
				error: errMsg,
				message: `连接失败: ${friendlyError}`
			};
		}
	}
};

export default s3Service;
