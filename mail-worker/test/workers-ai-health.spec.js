import { describe, expect, it } from 'vitest';
import aiService from '../src/service/ai-service.js';

describe('B10: Workers AI Health Check & Graceful Degradation Specification', () => {
	it('returns success: false when c.env.ai binding is completely missing', async () => {
		const mockContext = {
			env: {} // No ai binding
		};

		const result = await aiService.testWorkersAiModel(mockContext, '@cf/meta/llama-3.1-8b-instruct');
		expect(result.success).toBe(false);
		expect(result.model).toBe('@cf/meta/llama-3.1-8b-instruct');
		expect(result.error).toMatch(/绑定不可用|binding/i);
		expect(result.reason).toBe('binding_missing');
	});

	it('returns success: false and reports actual error when c.env.ai.run throws an exception', async () => {
		const mockContext = {
			env: {
				ai: {
					run: async () => {
						throw new Error('Model @cf/meta/invalid-model not found');
					}
				}
			}
		};

		const result = await aiService.testWorkersAiModel(mockContext, '@cf/meta/invalid-model');
		// 严禁假阳性！抛异常时绝对不能返回 success: true
		expect(result.success).toBe(false);
		expect(result.model).toBe('@cf/meta/invalid-model');
		expect(result.latencyMs).toBeGreaterThan(0);
		expect(result.error).toMatch(/not found/i);
		expect(result.reason).toBe('model_not_found');
	});

	it('classifies rate limit or quota exceeded errors correctly', async () => {
		const mockContext = {
			env: {
				ai: {
					run: async () => {
						throw new Error('Rate limit exceeded: 429 Too Many Requests');
					}
				}
			}
		};

		const result = await aiService.testWorkersAiModel(mockContext, '@cf/meta/llama-3.1-8b-instruct');
		expect(result.success).toBe(false);
		expect(result.reason).toBe('quota_exceeded');
	});

	it('classifies timeout errors correctly', async () => {
		const mockContext = {
			env: {
				ai: {
					run: async () => {
						throw new Error('The operation timed out after 5000ms');
					}
				}
			}
		};

		const result = await aiService.testWorkersAiModel(mockContext, '@cf/meta/llama-3.1-8b-instruct');
		expect(result.success).toBe(false);
		expect(result.reason).toBe('timeout');
	});

	it('returns success: true with latency and tokens when c.env.ai.run succeeds', async () => {
		const mockContext = {
			env: {
				ai: {
					run: async () => ({
						response: '1'
					})
				}
			}
		};

		const result = await aiService.testWorkersAiModel(mockContext, '@cf/meta/llama-3.1-8b-instruct');
		expect(result.success).toBe(true);
		expect(result.model).toBe('@cf/meta/llama-3.1-8b-instruct');
		expect(result.latencyMs).toBeGreaterThan(0);
		expect(result.tokens).toBe(1);
		expect(result.method).toBe('workers-ai');
	});
});
