const BACKEND_URL = "https://saylist.onrender.com"; 
const FRONTEND_URL = "https://babaello.github.io/saylist";

const loginBtn = document.getElementById("login-btn");
const loginErrorDiv = document.getElementById("login-error");
const mainUI = document.getElementById("main-ui");
const sentenceInput = document.getElementById("sentence-input");
const generateBtn = document.getElementById("generate-btn");
const playlistInfo = document.getElementById("playlist-info");
const tracksList = document.getElementById("tracks-list");
const createPlaylistBtn = document.getElementById("create-playlist-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const loadingDiv = document.getElementById("loading");
const errorMsg = document.getElementById("error-msg");
const darkmodeCheckbox = document.getElementById("darkmode-checkbox");

let accessToken = null;
let refreshToken = null;
let storedState = null;
let currentPlaylistId = null;

// Synonyms map for fallback word->search term
const synonymsMap = {
  hello: ["hi", "hey"],
  happy: ["joyful", "cheerful", "smile"],
  sad: ["blue", "tear", "cry"],
  love: ["heart", "romance", "affection"],
  rickroll: ["rick astley", "never gonna give you up"],
  // add more if you want...
};

function generateState() {
  return Math.random().toString(36).substring(2, 15);
}

// Save state to sessionStorage before login
function saveState(state) {
  sessionStorage.setItem("saylist_state", state);
}

// Get stored state from sessionStorage
function getStoredState() {
  return sessionStorage.getItem("saylist_state");
}

// Parse URL hash parameters
function parseHashParams() {
  const hash = window.location.hash.substring(1);
  return hash.split("&").reduce((acc, pair) => {
    const [key, value] = pair.split("=");
    if (key && value) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

// Show or hide error
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = msg ? "block" : "none";
}

// Show or hide login error
function showLoginError(msg) {
  loginErrorDiv.textContent = msg;
  loginErrorDiv.style.display = msg ? "block" : "none";
}

// Show loading spinner
function showLoading(show) {
  loadingDiv.style.display = show ? "block" : "none";
}

// Enable or disable buttons
function setButtonsDisabled(disabled) {
  generateBtn.disabled = disabled;
  createPlaylistBtn.disabled = disabled;
}

// Clear playlist UI
function clearPlaylistUI() {
  tracksList.innerHTML = "";
  playlistInfo.style.display = "none";
  currentPlaylistId = null;
}

// Dark mode toggle handling
darkmodeCheckbox.addEventListener("change", () => {
  if (darkmodeCheckbox.checked) {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
});

// Login button click — redirect to backend login
loginBtn.addEventListener("click", () => {
  const state = generateState();
  saveState(state);
  window.location.href = `${BACKEND_URL}/login?state=${state}`;
});

// After redirect from backend, check tokens and state
function handleRedirect() {
  const params = parseHashParams();
  if (params.error) {
    showLoginError(params.error_description || "Login error");
    loginBtn.style.display = "none";
    return;
  }

  if (params.access_token && params.state) {
    storedState = getStoredState();
    if (!storedState || storedState !== params.state) {
      showLoginError("State mismatch error. Please login again.");
      return;
    }
    accessToken = params.access_token;
    refreshToken = params.refresh_token || null;
    loginBtn.style.display = "none";
    mainUI.style.display = "block";
    showLoginError("");
    clearPlaylistUI();
  }
}

function getSpotifySearchURL(query) {
  return `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    query
  )}&type=track&limit=5`;
}

// Search Spotify for a word, fallback on synonyms if no results
async function searchTrack(word) {
  let queries = [word];
  if (synonymsMap[word.toLowerCase()]) {
    queries = [...queries, ...synonymsMap[word.toLowerCase()]];
  }

  for (const q of queries) {
    const url = getSpotifySearchURL(q);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.tracks && data.tracks.items.length > 0) {
      // Find track with title containing the word (case-insensitive) if possible
      let track = data.tracks.items.find((t) =>
        t.name.toLowerCase().includes(word.toLowerCase())
      );
      if (!track) track = data.tracks.items[0];
      return track;
    }
  }
  return null;
}

// Generate playlist tracks for sentence words
async function generatePlaylist(sentence) {
  showError("");
  clearPlaylistUI();
  showLoading(true);
  setButtonsDisabled(true);

  const words = sentence
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (words.length === 0) {
    showError("Please enter a valid sentence.");
    showLoading(false);
    setButtonsDisabled(false);
    return;
  }

  const tracks = [];
  for (const word of words) {
    try {
      const track = await searchTrack(word);
      if (track) {
        tracks.push(track);
      }
    } catch {
      // Ignore search errors per word
    }
  }

  showLoading(false);

  if (tracks.length === 0) {
    showError("No matching songs found for your sentence.");
    setButtonsDisabled(false);
    return;
  }

  tracksList.innerHTML = "";
  for (const track of tracks) {
    const li = document.createElement("li");

    const title = document.createElement("div");
    title.textContent = track.name;
    title.className = "track-title";

    const artist = document.createElement("div");
    artist.textContent = track.artists.map((a) => a.name).join(", ");
    artist.className = "track-artist";

    const info = document.createElement("div");
    info.className = "track-info";
    info.appendChild(title);
    info.appendChild(artist);

    const audio = document.createElement("audio");
    audio.className = "audio-preview";
    audio.controls = true;
    audio.src = track.preview_url || "";
    audio.title = "Audio preview";
    if (!track.preview_url) {
      audio.style.display = "none";
    }

    li.appendChild(info);
    li.appendChild(audio);
    tracksList.appendChild(li);
  }

  playlistInfo.style.display = "block";
  setButtonsDisabled(false);
  currentPlaylistId = null;
}

// Create playlist on Spotify account
async function createPlaylistOnSpotify() {
  if (!accessToken) {
    showError("You must log in first.");
    return;
  }
  if (!sentenceInput.value.trim()) {
    showError("Enter a sentence first.");
    return;
  }

  showLoading(true);
  setButtonsDisabled(true);
  showError("");

  try {
    // Get user profile for user ID
    const userRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) throw new Error("Failed to get user profile.");
    const userData = await userRes.json();

    // Create new playlist
    const playlistName = "Saylist: " + sentenceInput.value.substring(0, 30);
    const createRes = await fetch(
      `https://api.spotify.com/v1/users/${userData.id}/playlists`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: playlistName,
          description:
            "Playlist generated by Saylist (words from your sentence)",
          public: false,
        }),
      }
    );
    if (!createRes.ok) throw new Error("Failed to create playlist.");
    const playlistData = await createRes.json();

    // Search tracks again to get their URIs
    const words = sentenceInput.value
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
    const trackUris = [];

    for (const word of words) {
      const track = await searchTrack(word);
      if (track) trackUris.push(track.uri);
    }

    if (trackUris.length === 0) {
      showError("No tracks found to add to playlist.");
      showLoading(false);
      setButtonsDisabled(false);
      return;
    }

    // Add tracks to playlist
    const addRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: trackUris }),
      }
    );

    if (!addRes.ok) throw new Error("Failed to add tracks to playlist.");

    currentPlaylistId = playlistData.id;

    // Show success message and copy link button
    showError("");
    alert(
      `Playlist created! View it on Spotify:\nhttps://open.spotify.com/playlist/${currentPlaylistId}`
    );
  } catch (err) {
    showError(err.message || "Error creating playlist.");
  } finally {
    showLoading(false);
    setButtonsDisabled(false);
  }
}

// Copy playlist link button handler
copyLinkBtn.addEventListener("click", () => {
  if (currentPlaylistId) {
    const url = `https://open.spotify.com/playlist/${currentPlaylistId}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("Playlist link copied to clipboard!");
    });
  } else {
    alert("No playlist to copy yet.");
  }
});

// Button event listeners
generateBtn.addEventListener("click", () => {
  generatePlaylist(sentenceInput.value);
});
createPlaylistBtn.addEventListener("click", createPlaylistOnSpotify);

// On load, check if redirected with tokens and state
window.onload = () => {
  handleRedirect();
};
