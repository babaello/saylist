import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import querystring from "querystring";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8888;

const CLIENT_ID = "7f69356de8634da0b43c4c650b8eb3fc";
const CLIENT_SECRET = "9e9b04ffc205438e8f3708f12604d6ac";
const REDIRECT_URI = "https://saylist.onrender.com/callback";

function generateRandomString(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.get("/login", (req, res) => {
  const state = generateRandomString();
  const scope =
    "playlist-modify-private playlist-modify-public user-read-private";

  const params = querystring.stringify({
    response_type: "code",
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const returnedState = req.query.state || null;

  if (!code || !returnedState) {
    return res.redirect(
      "/#error=missing_parameters&error_description=Missing code or state"
    );
  }

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
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

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      return res.redirect(
        "/#error=invalid_token&error_description=" +
          encodeURIComponent(err.error_description || "Failed to get token")
      );
    }

    const tokenData = await tokenRes.json();

    // Pass tokens and state to frontend in URL hash
    const frontendUrl = `https://babaello.github.io/saylist/#access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}&state=${returnedState}`;

    res.redirect(frontendUrl);
  } catch (error) {
    console.error(error);
    res.redirect("/#error=server_error&error_description=Server error");
  }
});

app.get("/", (req, res) => {
  res.send("Saylist backend is up and running.");
});

app.listen(PORT, () => {
  console.log(`Saylist backend listening on port ${PORT}`);
});
