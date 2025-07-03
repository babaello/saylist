const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('querystring');
require('dotenv').config();

const app = express();
app.use(cors());

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

app.get('/login', (req, res) => {
  const scope = 'playlist-modify-private playlist-modify-public';
  res.redirect('https://accounts.spotify.com/authorize?' + qs.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
  }));
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const tokenRes = await axios.post(
    'https://accounts.spotify.com/api/token',
    qs.stringify({ code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    { headers: { Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64') } }
  );
  const access_token = tokenRes.data.access_token;
  res.redirect(`http://localhost:5500/index.html?access_token=${access_token}`);
});

app.listen(8888, () => console.log('Auth server running on http://localhost:8888'));
