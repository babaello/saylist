import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());

const CLIENT_ID = "7f69356de8634da0b43c4c650b8eb3fc"; // Your Spotify Client ID
const CLIENT_SECRET = "9e9b04ffc205438e8f3708f12604d6ac"; // Your Spotify Client Secret
const FRONTEND_URI = "https://babaello.github.io/saylist/"; // Your frontend URL (GitHub Pages)
const PORT = process.env.PORT || 8888;

const redirect_uri = `${process.env.REDIRECT_URI || FRONTEND_URI}`;

// In-memory state & code verifier storage (for demo; use DB for prod)
const stateVerifiers = new Map();

function generateRandomString(length) {
  return crypto.randomBytes(length).toString("hex");
}

function base64URLEncode(str) {
  return str
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest();
}

// Step 1: Redirect to Spotify login with PKCE and state
app.get("/login", (req, res) => {
  const state = generateRandomString(16);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = base64URLEncode(sha256(codeVerifier));

  stateVerifiers.set(state, codeVerifier);

  const scope =
    "playlist-modify-private playlist-modify-public user-read-private user-read-email";

  const authQueryParams = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope,
    redirect_uri,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  res.redirect(
    `https://accounts.spotify.com/authorize?${authQueryParams.toString()}`
  );
});

// Step 2: Callback from Spotify with code, exchange for tokens
app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedVerifier = stateVerifiers.get(state);

  if (!state || !storedVerifier) {
    return res.status(400).send("State mismatch or missing.");
  }

  stateVerifiers.delete(state);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri,
    client_id: CLIENT_ID,
    code_verifier: storedVerifier,
  });

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return res.status(500).send("Failed to get tokens: " + errText);
    }

    const tokenData = await tokenRes.json();

    // Redirect back to frontend with tokens in URL hash for client-side use
    const redirectUrl = `${FRONTEND_URI}#access_token=${tokenData.access_token}&token_type=${tokenData.token_type}&expires_in=${tokenData.expires_in}&refresh_token=${tokenData.refresh_token}&state=${state}`;

    res.redirect(redirectUrl);
  } catch (e) {
    res.status(500).send("Error during token exchange: " + e.message);
  }
});

// Step 3: Optional refresh token endpoint (for future expansions)
app.get("/refresh_token", async (req, res) => {
  const refresh_token = req.query.refresh_token;
  if (!refresh_token) {
    return res.status(400).send("Missing refresh_token");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: CLIENT_ID,
  });

  try {
    const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
      },
      body,
    });

    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      return res.status(500).send("Failed to refresh token: " + errText);
    }
    const refreshData = await refreshRes.json();
    res.json(refreshData);
  } catch (e) {
    res.status(500).send("Error refreshing token: " + e.message);
  }
});

app.listen(PORT, () =>
  console.log(`Saylist backend listening on port ${PORT}!`)
);
