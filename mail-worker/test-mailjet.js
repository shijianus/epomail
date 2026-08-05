const apiKey = 'd51c7d88df21b24c9042b422d62f8482';
const apiSecret = '0067d99e58628320dee058d0a43b9c21';

fetch('https://api.mailjet.com/v3.1/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  },
  body: JSON.stringify({
    Messages: [
      {
        From: { Email: 'admin@epomail.bond', Name: 'Epomail Admin' },
        To: [ { Email: 'shijianus@gmail.com' } ],
        Subject: 'Test Mailjet Forwarding API',
        HTMLPart: 'This is a test email from Mailjet API configuration.'
      }
    ]
  })
}).then(res => res.json()).then(console.log).catch(console.error);
