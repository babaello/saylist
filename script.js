(() => {
  const loginBtn = document.getElementById('loginBtn');
  const generateBtn = document.getElementById('generateBtn');
  const statusEl = document.getElementById('status');
  const appSection = document.getElementById('app');
  const sentenceInput = document.getElementById('sentenceInput');
  const playlistSection = document.getElementById('playlistSection');
  const playlistLink = document.getElementById('playlistLink');
  const spotifyPlayer = document.getElementById('spotifyPlayer');

  let accessToken = '';

  // Extract access token from URL hash
  function getAccessTokenFromHash() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return params.get('access_token');
  }

  // Clean URL to remove token from address bar after login
  function cleanUrl() {
    history.replaceState(null, '', 'index.html');
  }

  // Show status message with optional error flag
  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#f44336' : '#b3b3b3';
  }

  // Enable/disable buttons during async ops
  function toggleLoading(isLoading) {
    generateBtn.disabled = isLoading;
    generateBtn.setAttribute('aria-busy', isLoading);
  }

  // Sanitize and split sentence into words, removing punctuation
  function getCleanWords(sentence) {
    return sentence
      .toLowerCase()
      .replace(/[.,!?;:(){}[\]'"`]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  }

  // Search Spotify tracks by word, fallback to partial if exact fails
  async function searchTrack(word, headers) {
    // Try exact track title
    let res = await fetch(
      `https://api.spotify.com/v1/search?q=track:"${encodeURIComponent(word)}"&type=track&limit=1`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.tracks.items.length > 0) return data.tracks.items[0];
    }
    // Fallback: partial match
    res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(word)}&type=track&limit=1`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.tracks.items.length > 0) return data.tracks.items[0];
    }
    return null;
  }

  // Create playlist and add tracks
  async function createPlaylistWithTracks(userId, name, trackUris, headers) {
    const createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: 'Playlist created with Saylist: one song per word',
        public: false,
      }),
    });
    if (!createRes.ok) throw new Error('Failed to create playlist');
    const playlistData = await createRes.json();

    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: trackUris }),
    });
    if (!addRes.ok) throw new Error('Failed to add tracks');

    return playlistData;
  }

  // Initialize app on load
  window.onload = async () => {
    accessToken = getAccessTokenFromHash();

    if (accessToken) {
      cleanUrl();
      loginBtn.style.display = 'none';
      appSection.hidden = false;
    }
  };

  loginBtn.onclick = () => {
    window.location.href = 'https://saylist-backend.onrender.com/login';
  };

  generateBtn.onclick = async () => {
    const sentence = sentenceInput.value.trim();
    if (!sentence) {
      setStatus('Please enter a sentence.', true);
      return;
    }

    setStatus('');
    toggleLoading(true);
    playlistSection.hidden = true;
    spotifyPlayer.innerHTML = '';
    playlistLink.href = '#';

    const words = getCleanWords(sentence);
    if (words.length === 0) {
      setStatus('Please enter at least one valid word.', true);
      toggleLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${accessToken}` };

    try {
      // Get user profile
      const userRes = await fetch('https://api.spotify.com/v1/me', { headers });
      if (!userRes.ok) throw new Error('Failed to get user profile.');
      const userData = await userRes.json();

      setStatus('Searching tracks for each word...');

      // Search tracks in parallel (with limit of 5 concurrent requests to avoid rate limits)
      const concurrencyLimit = 5;
      const results = [];
      for (let i = 0; i < words.length; i += concurrencyLimit) {
        const chunk = words.slice(i, i + concurrencyLimit);
        const promises = chunk.map((word) => searchTrack(word, headers));
        const chunkResults = await Promise.all(promises);
        results.push(...chunkResults);
      }

      // Filter found tracks
      const tracks = results.filter(Boolean);

      if (tracks.length === 0) {
        setStatus('No matching songs found for your sentence.', true);
        toggleLoading(false);
        return;
      }

      const trackUris = tracks.map((t) => t.uri);

      setStatus('Creating playlist...');

      // Create playlist & add tracks
      const playlist = await createPlaylistWithTracks(userData.id, `Saylist: "${sentence}"`, trackUris, headers);

      setStatus('Playlist created successfully!');

      // Show embedded Spotify player
      spotifyPlayer.innerHTML = `
        <iframe
          src="https://open.spotify.com/embed/playlist/${playlist.id}"
          width="100%"
          height="380"
          allow="encrypted-media"
          allowtransparency="true"
          frameborder="0"
          loading="lazy"
          title="Spotify Playlist Player"
        ></iframe>`;

      playlistLink.href = playlist.external_urls.spotify;
      playlistSection.hidden = false;
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`, true);
    } finally {
      toggleLoading(false);
    }
  };
})();
