async function run() {
  const loginRes = await fetch('https://epomail.epocanvas.workers.dev/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: "admin@epomail.bond", password: "1" })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  
  const searchRes = await fetch('https://epomail.epocanvas.workers.dev/api/email/searchSuggestions?query=n&type=sender_address_includes&accountId=0', {
    headers: { Authorization: token }
  });
  const searchData = await searchRes.json();
  console.log("Search Result:", searchData);
}
run();
