const fs = require('fs');
const d1Output = JSON.parse(fs.readFileSync('d1_output.json', 'utf8'));
const row = d1Output[0].results[0];

// Convert snake_case to camelCase
const camelRow = {};
for (const [key, value] of Object.entries(row)) {
  const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  camelRow[camelKey] = value;
}

// Parse resendTokens
if (typeof camelRow.resendTokens === 'string') {
  camelRow.resendTokens = JSON.parse(camelRow.resendTokens);
}

fs.writeFileSync('kv_setting.json', JSON.stringify(camelRow));
