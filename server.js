const loginBtn = document.getElementById('loginBtn');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const appSection = document.getElementById('app');
const sentenceInput = document.getElementById('sentenceInput');

let accessToken = '';

function getAccessTokenFromHash() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get('access_token');
}

window.onload = () => {
  accessToken = getAccessTokenFromHash();

  if (accessToken) {
    loginBtn.style.display = 'none';
    appSection.style.display = 'block';
    history.replaceState(null, '', 'index.html');
  }
};

loginBtn.onclick = () => {
  window.location.href = 'https://saylist-backend.onrender.com/login';
};

generateBtn.onclick = async () => {
  const sentence = sentenceInput.value.trim();

  if (!sentence) {
    statusEl.textContent = 'Please enter a sentence.';
    return;
  }

  statusEl.textContent = 'Searching songs... This might take a moment.';

  const words = sentence.split(/\s+/);
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    const userRes = await fetch('https://api.spotify.com/v1/me', { headers });
    if (!userRes.ok) throw new Error('Invalid token or failed to fetch user.');
    const userData = await userRes.json();

    const songUris = [];
    for (const word of words) {
      const query = `track:"${word}"`;
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        { headers }
      );
      if (!searchRes.ok) {
        statusEl.textContent = `Failed to search for "${word}".`;
        return;
      }
      const searchData = await searchRes.json();
      if (searchData.tracks.items.length > 0) {
        songUris.push(searchData.tracks.items[0].uri);
      }
    }

    if (songUris.length === 0) {
      statusEl.textContent = 'No songs found for your sentence.';
      return;
    }

    statusEl.textContent = 'Creating playlist...';

    const createPlaylistRes = await fetch(
      `https://api.spotify.com/v1/users/${userData.id}/playlists`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Saylist: "${sentence}"`,
          description: 'Playlist with one song per word',
          public: false,
        }),
      }
    );
    if (!createPlaylistRes.ok) throw new Error('Failed to create playlist');

    const playlistData = await createPlaylistRes.json();

    const addTracksRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: songUris }),
      }
    );
    if (!addTracksRes.ok) throw new Error('Failed to add tracks');

    statusEl.innerHTML = `✅ Playlist created! <a href="${playlistData.external_urls.spotify}" target="_blank" rel="noopener noreferrer">Open in Spotify</a>`;
  } catch (err) {
    statusEl.textContent = `⚠️ Error: ${err.message}`;
    console.error(err);
  }
};
