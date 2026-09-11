import app from '../hono/hono';
import { email } from '../email/email';

app.post('/test-receive', async (c) => {
    if (c.env.admin && !c.env.DEV && !c.env.dev) {
        return c.text('Test receive endpoint is disabled in production', 403);
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
        return c.json({ success: false, error: e.message, stack: e.stack });
    }
});
