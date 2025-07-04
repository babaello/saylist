// Constants & DOM elements
const loginBtn = document.getElementById("login");
const generateBtn = document.getElementById("generate");
const createPlaylistBtn = document.getElementById("create-playlist");
const copyLinkBtn = document.getElementById("copy-link");
const toggleThemeBtn = document.getElementById("toggle-theme");

const sentenceInput = document.getElementById("sentence-input");
const loadingDiv = document.getElementById("loading");
const resultsDiv = document.getElementById("results");
const playlistNameSpan = document.getElementById("playlist-name");
const trackListDiv = document.getElementById("track-list");
const playlistPreviewDiv = document.getElementById("playlist-preview");
const easterEggDiv = document.getElementById("easter-egg");

let accessToken = null;
let userId = null;
let tracksData = [];
let audioPlayers = [];

// Backend base URL
const BACKEND_URL = "https://saylist.onrender.com";

// ========== THEME TOGGLE ==========
function setTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
    toggleThemeBtn.textContent = "☀️";
  } else {
    document.body.classList.remove("dark");
    toggleThemeBtn.textContent = "🌙";
  }
  localStorage.setItem("theme", theme);
}

toggleThemeBtn.onclick = () => {
  const newTheme = document.body.classList.contains("dark") ? "light" : "dark";
  setTheme(newTheme);
};

// Initialize theme from localStorage or system
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  setTheme(savedTheme);
} else {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

// ========== SPOTIFY AUTH ==========

// Extract access token from URL fragment (#access_token=...)
function getAccessTokenFromUrl() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  if (params.has("access_token")) {
    return params.get("access_token");
  }
  return null;
}

function clearUrlHash() {
  history.replaceState(null, null, " ");
}

async function fetchUserProfile() {
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Failed to fetch profile");
    const data = await res.json();
    userId = data.id;
    loginBtn.style.display = "none";
    generateBtn.disabled = false;
    sentenceInput.disabled = false;
    return data;
  } catch {
    alert("Session expired or invalid token. Please login again.");
    accessToken = null;
    loginBtn.style.display = "inline-block";
    generateBtn.disabled = true;
    sentenceInput.disabled = true;
  }
}

// ========== UI HELPERS ==========
function showLoading(show) {
  loadingDiv.classList.toggle("hidden", !show);
  resultsDiv.classList.toggle("hidden", show);
}

function clearResults() {
  trackListDiv.innerHTML = "";
  playlistNameSpan.textContent = "";
  playlistPreviewDiv.classList.add("hidden");
  playlistPreviewDiv.innerHTML = "";
  createPlaylistBtn.classList.add("hidden");
  copyLinkBtn.classList.add("hidden");
  easterEggDiv.classList.add("hidden");
  tracksData = [];
  stopAllAudio();
}

function stopAllAudio() {
  audioPlayers.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  audioPlayers = [];
}

// ========== UTILS ==========

// Synonym fallback using a small built-in map (can extend with API if wanted)
const synonymsMap = {
  happy: ["joyful", "cheerful", "merry", "glad"],
  sad: ["blue", "down", "melancholy", "gloomy"],
  love: ["adore", "cherish", "passion", "affection"],
  // add more as needed...
};

function getSynonyms(word) {
  return synonymsMap[word.toLowerCase()] || [];
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Generate playlist name from sentence (simple: first 5 words + “Saylist”)
function generatePlaylistName(sentence) {
  const words = sentence.trim().split(/\s+/).slice(0, 5);
  return `Saylist: ${words.join(" ")}${words.length < 5 ? "" : "..."}`;
}

// Check for easter egg trigger words
function checkEasterEgg(sentence) {
  return sentence.toLowerCase().includes("rickroll") || sentence.toLowerCase().includes("rick astley");
}

// ========== SPOTIFY API CALLS ==========

async function searchTrack(query) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.tracks.items.length > 0) return data.tracks.items[0];
  return null;
}

async function searchTrackWithSynonyms(word) {
  // Try exact word
  let track = await searchTrack(`track:${word}`);
  if (track) return track;

  // Fallback to synonyms
  const synonyms = getSynonyms(word);
  for (const syn of synonyms) {
    track = await searchTrack(`track:${syn}`);
    if (track) return track;
  }
  return null;
}

async function createSpotifyPlaylist(name) {
  const url = `https://api.spotify.com/v1/users/${userId}/playlists`;
  const body = {
    name,
    description: "Created with Saylist - your sentence to playlist tool!",
    public: false,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error.message || "Failed to create playlist");
  }
  return await res.json();
}

async function addTracksToPlaylist(playlistId, uris) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris }),
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error.message || "Failed to add tracks");
  }
  return await res.json();
}

// ========== AUDIO PREVIEW ==========
function createAudioPlayer(previewUrl) {
  if (!previewUrl) return null;
  const audio = new Audio(previewUrl);
  audio.preload = "none";
  return audio;
}

// ========== EVENT HANDLERS ==========

loginBtn.addEventListener("click", () => {
  // Redirect user to backend login endpoint to start OAuth
  window.location.href = `${BACKEND_URL}/login`;
});

generateBtn.addEventListener("click", async () => {
  clearResults();
  const sentence = sentenceInput.value.trim();
  if (!sentence) {
    alert("Please enter a sentence.");
    return;
  }

  if (!accessToken) {
    alert("Please log in with Spotify first.");
    return;
  }

  // Show loading
  loadingDiv.classList.remove("hidden");
  resultsDiv.classList.remove("hidden");

  // Easter egg check
  if (checkEasterEgg(sentence)) {
    easterEggDiv.classList.remove("hidden");
  }

  // Split sentence into words (letters/numbers only, ignoring punctuation)
  const words = sentence.match(/\b[\w']+\b/g) || [];

  playlistNameSpan.textContent = generatePlaylistName(sentence);

  // Find tracks for each word with async throttle to avoid API limits
  tracksData = [];
  for (const word of words) {
    const track = await searchTrackWithSynonyms(word);
    if (track) {
      tracksData.push(track);
    } else {
      // If no track found, add a placeholder "No match for {word}"
      tracksData.push({
        name: `No track for "${word}"`,
        artists: [{ name: "N/A" }],
        preview_url: null,
        external_urls: { spotify: "#" },
        uri: null,
      });
    }
    // Tiny delay to be gentle with API
    await sleep(200);
  }

  loadingDiv.classList.add("hidden");
  displayTracks(tracksData);
  createPlaylistBtn.classList.remove("hidden");
});

createPlaylistBtn.addEventListener("click", async () => {
  if (!accessToken || !userId) {
    alert("Please log in first.");
    return;
  }

  if (tracksData.length === 0) {
    alert("No tracks found to create a playlist.");
    return;
  }

  createPlaylistBtn.disabled = true;
  createPlaylistBtn.textContent = "Creating playlist...";

  try {
    // Create playlist on Spotify
    const playlist = await createSpotifyPlaylist(playlistNameSpan.textContent);

    // Filter tracks with valid URIs
    const uris = tracksData.filter(t => t.uri).map(t => t.uri);

    if (uris.length === 0) {
      alert("No valid tracks found to add.");
      createPlaylistBtn.disabled = false;
      createPlaylistBtn.textContent = "📀 Create on Spotify";
      return;
    }

    await addTracksToPlaylist(playlist.id, uris);

    playlistPreviewDiv.innerHTML = `<iframe src="https://open.spotify.com/embed/playlist/${playlist.id}" width="100%" height="380" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
    playlistPreviewDiv.classList.remove("hidden");

    copyLinkBtn.classList.remove("hidden");
    copyLinkBtn.onclick = () => {
      navigator.clipboard.writeText(playlist.external_urls.spotify);
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => (copyLinkBtn.textContent = "🔗 Copy Playlist Link"), 2000);
    };
  } catch (e) {
    alert("Failed to create playlist: " + e.message);
  } finally {
    createPlaylistBtn.disabled = false;
    createPlaylistBtn.textContent = "📀 Create on Spotify";
  }
});

// Display found tracks with preview buttons
function displayTracks(tracks) {
  trackListDiv.innerHTML = "";
  tracks.forEach((track, i) => {
    const div = document.createElement("div");
    div.className = "track-item";

    const name = document.createElement("div");
    name.className = "track-name";
    name.textContent = track.name;

    const artist = document.createElement("div");
    artist.className = "track-artist";
    artist.textContent = track.artists.map(a => a.name).join(", ");

    const previewBtn = document.createElement("div");
    previewBtn.className = "play-preview";
    previewBtn.textContent = "▶";

    let audio = null;
    previewBtn.onclick = () => {
      // Pause others
      stopAllAudio();

      if (!audio) audio = createAudioPlayer(track.preview_url);
      if (!audio) return alert("No preview available for this track.");

      if (audio.paused) {
        audio.play();
        previewBtn.textContent = "⏸";
        audio.onended = () => {
          previewBtn.textContent = "▶";
        };
        audioPlayers.push(audio);
      } else {
        audio.pause();
        previewBtn.textContent = "▶";
      }
    };

    div.appendChild(name);
    div.appendChild(artist);
    div.appendChild(previewBtn);

    trackListDiv.appendChild(div);
  });
}

// ========== INIT ==========

window.addEventListener("DOMContentLoaded", async () => {
  generateBtn.disabled = true;
  sentenceInput.disabled = true;

  accessToken = getAccessTokenFromUrl();
  if (accessToken) {
    clearUrlHash();
    await fetchUserProfile();
  }
});
