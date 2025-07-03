const loginBtn = document.getElementById('loginBtn');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const appSection = document.getElementById('app');
let accessToken = '';

window.onload = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('access_token')) {
    accessToken = params.get('access_token');
    loginBtn.style.display = 'none';
    appSection.style.display = 'block';
  }
};

loginBtn.onclick = () => { window.location.href = 'http://localhost:8888/login'; };

generateBtn.onclick = async () => {
  const sentence = document.getElementById('sentenceInput').value.trim();
  if (!sentence) return;
  statusEl.textContent = 'Creating playlist...';
  const words = sentence.split(/\s+/);
  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    const userRes = await fetch('https://api.spotify.com/v1/me', { headers });
    const userData = await userRes.json();
    const songUris = [];
    for (const word of words) {
      const res = await fetch(`https://api.spotify.com/v1/search?q=track:${encodeURIComponent(word)}&type=track&limit=1`, { headers });
      const data = await res.json();
      if (data.tracks.items[0]) songUris.push(data.tracks.items[0].uri);
    }
    const playlistRes = await fetch(`https://api.spotify.com/v1/users/${userData.id}/playlists`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Saylist: "${sentence}"`,
        description: 'One song per word!',
        public: false,
      }),
    });
    const playlist = await playlistRes.json();
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: songUris }),
    });
    statusEl.innerHTML = `✅ Playlist created! <a href="${playlist.external_urls.spotify}" target="_blank">Open in Spotify</a>`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = '⚠️ Error creating playlist';
  }
};
