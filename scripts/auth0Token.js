const axios = require("axios");

let cachedToken = null;
let tokenExpiryMs = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiryMs - 60_000) return cachedToken;

  const { AUTH_URL, CLIENT_ID, CLIENT_SECRET, AUDIENCE } = process.env;
  if (!AUTH_URL || !CLIENT_ID || !CLIENT_SECRET || !AUDIENCE) {
    throw new Error("Missing AUTH_URL, CLIENT_ID, CLIENT_SECRET, or AUDIENCE in .env");
  }

  const res = await axios.post(
    AUTH_URL,
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      audience: AUDIENCE,
      grant_type: "client_credentials"
    },
    { headers: { "Content-Type": "application/json" }, timeout: 20_000 }
  );

  cachedToken = res.data.access_token;
  const expiresIn = res.data.expires_in || 86_400;
  tokenExpiryMs = Date.now() + expiresIn * 1000;
  return cachedToken;
}

module.exports = { getToken };

