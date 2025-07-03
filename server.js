// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
app.use(cors());

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

app.get('/login', (req, res) => {
  const scope = 'playlist-modify-private playlist-modify-public';
  const authUrl = 'https://accounts.spotify.com/authorize?' + querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
  });
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing code parameter');
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      {
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const access_token = tokenResponse.data.access_token;

    // Redirect to frontend with token in hash fragment
    res.redirect(`https://babaello.github.io/saylist/index.html#access_token=${access_token}`);
  } catch (err) {
    console.error('Error fetching token:', err.response?.data || err.message);
    res.status(500).send('Failed to get access token');
  }
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
