import app from '../hono/hono';
import { email } from '../email/email';
import userContext from '../security/user-context.js';
import { isAdminUser } from '../utils/admin-utils.js';

app.post('/test-receive', async (c) => {
    const envName = String(c.env.ENVIRONMENT || '').toLowerCase();
    const devLike = Boolean(c.env.DEV || c.env.dev) || envName === 'development' || envName === 'test';
    if (!devLike) {
        return c.text('Test receive endpoint is disabled outside development/test', 403);
    }
    const user = c.get?.('user');
    if (!user || !isAdminUser(c, user)) {
        return c.text('Admin permission required', 403);
    }
    const mockMessage = {
        from: 'test@example.com',
        to: 'admin@epomail.bond',
        headers: new Headers(),
        raw: {
            getReader: () => {
                let sent = false;
                return {
                    read: async () => {
                        if (sent) return { done: true };
                        sent = true;
                        return { done: false, value: new TextEncoder().encode(`From: test@example.com\r\nTo: admin@epomail.bond\r\nSubject: Test\r\n\r\nHello World!`) };
                    }
                };
            }
        },
        setReject: (msg) => { console.log('Rejected:', msg); }
    };
    
    try {
        await email(mockMessage, c.env, c.executionCtx);
        return c.json({ success: true, message: 'Email processed' });
    } catch (e) {
        return c.json({ success: false, error: 'Test receive failed' });
    }
});
