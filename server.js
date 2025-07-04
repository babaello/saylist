import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8888;

const client_id = process.env.SPOTIFY_CLIENT_ID;       // from .env
const client_secret = process.env.SPOTIFY_CLIENT_SECRET; // from .env
const redirect_uri = process.env.REDIRECT_URI;           // your frontend URL + /callback redirect

// Generate random string for state param
const generateRandomString = (length) =>
  crypto.randomBytes(length).toString("hex");

const stateKey = "spotify_auth_state";

app.get("/login", (req, res) => {
  const state = generateRandomString(16);
  const scope = [
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-private",
    "user-read-email",
  ].join(" ");

  // Save state in cookie for later verification
  res.cookie(stateKey, state, { httpOnly: true, secure: true, sameSite: "lax" });

  const authQueryParams = new URLSearchParams({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state,
  });

  res.redirect(
    `https://accounts.spotify.com/authorize?${authQueryParams.toString()}`
  );
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    return res.redirect(
      `${redirect_uri}/#error=state_mismatch&error_description=State%20mismatch`
    );
  }

  res.clearCookie(stateKey);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri,
    client_id,
    client_secret,
  });

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.json();
      console.error("Spotify token error:", errorData);
      return res.redirect(
        `${redirect_uri}/#error=invalid_token&error_description=${encodeURIComponent(
          JSON.stringify(errorData)
        )}`
      );
    }

    const tokenData = await tokenRes.json();

    // Redirect back to frontend with tokens in hash
    const hashParams = new URLSearchParams({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in.toString(),
      state,
    });

    res.redirect(`${redirect_uri}/#${hashParams.toString()}`);
  } catch (err) {
    console.error("Callback error:", err);
    res.redirect(
      `${redirect_uri}/#error=server_error&error_description=Unable%20to%20complete%20authentication`
    );
  }
});

app.get("/refresh_token", async (req, res) => {
  const refresh_token = req.query.refresh_token;
  if (!refresh_token) return res.status(400).json({ error: "No refresh token" });

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id,
    client_secret,
  });

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.json();
      console.error("Refresh token error:", errorData);
      return res.status(400).json(errorData);
    }

    const tokenData = await tokenRes.json();
    res.json(tokenData);
  } catch (err) {
    console.error("Refresh token exception:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// To allow backend to set cookies
import cookieParser from "cookie-parser";
app.use(cookieParser());

app.listen(PORT, () => {
  console.log(`Saylist backend listening on port ${PORT}`);
});
