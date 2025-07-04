// === CONFIGURATION ===
// Put your backend URL here:
const backendBaseUrl = "https://saylist.onrender.com";

// === DOM ELEMENTS ===
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const btnLogin = document.getElementById("btnLogin");
const btnCreatePlaylist = document.getElementById("btnCreatePlaylist");
const sentenceInput = document.getElementById("sentenceInput");
const errorMsg = document.getElementById("errorMsg");
const songsList = document.getElementById("songsList");
const playlistLink = document.getElementById("playlistLink");
const loadingSpinner = document.getElementById("loadingSpinner");
const toggleThemeBtn = document.getElementById("toggleTheme");

let accessToken = null;
let userId = null;

// === THEME TOGGLER ===
function loadTheme() {
  const savedTheme = localStorage.getItem("saylist-theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    toggleThemeBtn.textContent = "☀️";
  } else {
    document.body.classList.remove("dark");
    toggleThemeBtn.textContent = "🌙";
  }
}

toggleThemeBtn.onclick = () => {
  document.body.classList.toggle("dark");
  if (document.body.classList.contains("dark")) {
    toggleThemeBtn.textContent = "☀️";
    localStorage.setItem("saylist-theme", "dark");
  } else {
    toggleThemeBtn.textContent = "🌙";
    localStorage.setItem("saylist-theme", "light");
  }
};

// === OAUTH TOKEN PARSING & UI UPDATE ===

function parseTokenFromHash() {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get("access_token"),
    token_type: params.get("token_type"),
    expires_in: params.get("expires_in"),
    state: params.get("state"),
  };
}

function clearUrlHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

function updateUI() {
  if (accessToken) {
    loginSection.hidden = true;
    appSection.hidden = false;
  } else {
    loginSection.hidden = false;
    appSection.hidden = true;
  }
}

btnLogin.onclick = () => {
  // Redirect user to backend login route for Spotify auth
  window.location.href = `${backendBaseUrl}/login`;
};

// === SPOTIFY API FUNCTIONS ===

// Search exact track title (case insensitive)
async function searchExactSong(word) {
  const query = `"${word}"`; // Quotes to force phrase search (try to get exact)
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error("Failed to search Spotify");

  const data = await res.json();

  // Find exact title match ignoring case
  if (!data.tracks || !data.tracks.items) return null;
  const lowerWord = word.toLowerCase();

  for (const track of data.tracks.items) {
    if (track.name.toLowerCase() === lowerWord) {
      return track;
    }
  }
  return null;
}

// Get current user profile to get user ID
async function fetchUserId() {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch user profile");
  const data = await res.json();
  return data.id;
}

// Create playlist for user
async function createPlaylist(userId, name, description) {
  const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description,
      public: false,
    }),
  });
  if (!res.ok) throw new Error("Failed to create playlist");
  return await res.json();
}

// Add tracks to playlist
async function addTracksToPlaylist(playlistId, uris) {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris }),
  });
  if (!res.ok) throw new Error("Failed to add tracks to playlist");
  return await res.json();
}

// === PLAYLIST CREATION LOGIC ===
btnCreatePlaylist.onclick = async () => {
  errorMsg.textContent = "";
  songsList.innerHTML = "";
  playlistLink.hidden = true;
  loadingSpinner.hidden = false;

  const sentence = sentenceInput.value.trim();
  if (!sentence) {
    errorMsg.textContent = "Please enter a sentence.";
    loadingSpinner.hidden = true;
    return;
  }

  const words = sentence
    .split(/\s+/)
    .map((w) => w.replace(/[^\w'-]/g, "")) // remove punctuation but keep apostrophes/hyphens
    .filter(Boolean);

  if (words.length === 0) {
    errorMsg.textContent = "No valid words found.";
    loadingSpinner.hidden = true;
    return;
  }

  try {
    if (!userId) userId = await fetchUserId();

    const tracks = [];
    for (const word of words) {
      const track = await searchExactSong(word);
      if (track) {
        tracks.push(track);
        const li = document.createElement("li");
        li.innerHTML = `<a href="${track.external_urls.spotify}" target="_blank" rel="noopener noreferrer" title="Artist(s): ${track.artists
          .map((a) => a.name)
          .join(", ")}">${track.name}</a>`;
        songsList.appendChild(li);
      } else {
        const li = document.createElement("li");
        li.textContent = `"${word}" - No exact match found.`;
        li.classList.add("no-match");
        songsList.appendChild(li);
      }
    }

    if (tracks.length === 0) {
      errorMsg.textContent = "No songs matched exactly. Try different words!";
      loadingSpinner.hidden = true;
      return;
    }

    const playlistName = `Saylist: ${sentence}`;
    const playlistDescription =
      "Playlist created by Saylist — each song title exactly matches a word from your sentence.";

    const playlist = await createPlaylist(userId, playlistName, playlistDescription);
    await addTracksToPlaylist(playlist.id, tracks.map((t) => t.uri));

    playlistLink.href = playlist.external_urls.spotify;
    playlistLink.textContent = `🎧 Open your playlist: ${playlist.name}`;
    playlistLink.hidden = false;
  } catch (err) {
    errorMsg.textContent = err.message || "An unknown error occurred.";
  } finally {
    loadingSpinner.hidden = true;
  }
};

// === ON PAGE LOAD ===
window.addEventListener("load", () => {
  const tokens = parseTokenFromHash();
  if (tokens && tokens.access_token) {
    accessToken = tokens.access_token;
    clearUrlHash();
  }
  updateUI();
  loadTheme();
});
