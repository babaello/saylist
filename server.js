import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import querystring from "querystring";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8888;

// Put your Spotify credentials here (or use env vars)
const CLIENT_ID = "7f69356de8634da0b43c4c650b8eb3fc";
const CLIENT_SECRET = "9e9b04ffc205438e8f3708f12604d6ac";
const REDIRECT_URI = "https://saylist.onrender.com/callback";

// In-memory token store (for demo purposes only)
const stateKey = "saylist_auth_state";

function generateRandomString(length) {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// ========== ROUTES ==========

// Step 1: Login endpoint - redirect user to Spotify auth page
app.get("/login", (req, res) => {
  const state = generateRandomString(16);
  const scope =
    "playlist-modify-private playlist-modify-public user-read-private";

  const params = querystring.stringify({
    response_type: "code",
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
  });

  // Set state cookie for validation on callback
  res.cookie(stateKey, state);

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// Step 2: Callback endpoint - Spotify redirects here with code
app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    return res.redirect(
      "/#error=state_mismatch&error_description=State mismatch"
    );
  }

  // Clear state cookie
  res.clearCookie(stateKey);

  try {
    // Exchange code for access token & refresh token
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: querystring.stringify({
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.json();
      return res.redirect(
        `/#error=invalid_token&error_description=${encodeURIComponent(
          errData.error_description || "Failed to get token"
        )}`
      );
    }

    const tokenData = await tokenResponse.json();

    // Redirect to frontend with tokens in URL fragment (not query)
    const redirectUrl = `https://babaello.github.io/saylist/#access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}`;

    res.redirect(redirectUrl);
  } catch (err) {
    console.error(err);
    res.redirect("/#error=server_error");
  }
});

// Optional: Refresh token endpoint (not used in frontend currently)
app.post("/refresh_token", async (req, res) => {
  const refresh_token = req.body.refresh_token;
  if (!refresh_token)
    return res.status(400).json({ error: "Missing refresh_token" });

  try {
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: querystring.stringify({
        grant_type: "refresh_token",
        refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.json();
      return res.status(400).json(errData);
    }

    const tokenData = await tokenResponse.json();
    res.json(tokenData);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Saylist backend is running.");
});

app.listen(PORT, () => {
  console.log(`Saylist backend listening on port ${PORT}`);
});

import cookieParser from "cookie-parser";
app.use(cookieParser());
