import { Resend } from 'resend';
const resend = new Resend('YOUR_RESEND_API_KEY');
resend.emails.send({
  from: 'admin@epomail.bond',
  to: 'shijianus@gmail.com',
  subject: 'Test Email from Epomail',
  html: '<p>This is a test email.</p>'
}).then(console.log).catch(console.error);
