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

const synonymsMap = {
  hello: ["hi", "hey"],
  happy: ["joyful", "cheerful", "smile"],
  sad: ["blue", "tear", "cry"],
  love: ["heart", "romance", "affection"],
  rickroll: ["rick astley", "never gonna give you up"],
};

function generateState() {
  return Math.random().toString(36).substring(2, 15);
}

function saveState(state) {
  sessionStorage.setItem("saylist_state", state);
}

function getStoredState() {
  return sessionStorage.getItem("saylist_state");
}

function parseHashParams() {
  const hash = window.location.hash.substring(1);
  return hash.split("&").reduce((acc, pair) => {
    const [key, value] = pair.split("=");
    if (key && value) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = msg ? "block" : "none";
}

function showLoginError(msg) {
  loginErrorDiv.textContent = msg;
  loginErrorDiv.style.display = msg ? "block" : "none";
}

function showLoading(show) {
  loadingDiv.style.display = show ? "block" : "none";
}

function setButtonsDisabled(disabled) {
  generateBtn.disabled = disabled;
  createPlaylistBtn.disabled = disabled;
}

function clearPlaylistUI() {
  tracksList.innerHTML = "";
  playlistInfo.style.display = "none";
  currentPlaylistId = null;
}

darkmodeCheckbox.addEventListener("change", () => {
  if (darkmodeCheckbox.checked) {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
});

loginBtn.addEventListener("click", () => {
  const state = generateState();
  saveState(state);
  window.location.href = `${BACKEND_URL}/login?state=${state}`;
});

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

// Normalize string to letters only lowercase, no spaces or punctuation for strict matching
function normalizeStrict(str) {
  return str.toLowerCase().replace(/[^a-z]/g, "").trim();
}

async function searchTrack(word) {
  let queries = [word];
  if (synonymsMap[word.toLowerCase()]) {
    queries = [...queries, ...synonymsMap[word.toLowerCase()]];
  }

  for (const q of queries) {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
      q
    )}&type=track&limit=50`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.warn(`Spotify search failed for "${q}"`);
      continue;
    }
    const data = await res.json();
    if (data.tracks && data.tracks.items.length > 0) {
      const normQuery = normalizeStrict(q);
      console.log(`Searching for "${q}" normalized to "${normQuery}"`);
      let track = data.tracks.items.find((t) => {
        const normTrackName = normalizeStrict(t.name);
        console.log(`Comparing to track "${t.name}" normalized as "${normTrackName}"`);
        return normTrackName === normQuery;
      });
      if (track) {
        console.log(`Exact strict match found for "${q}": "${track.name}"`);
        return track;
      } else {
        console.log(`No strict exact match for "${q}".`);
      }
    } else {
      console.log(`No tracks returned for "${q}".`);
    }
  }
  return null;
}

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
      // Ignore per-word errors
    }
  }

  showLoading(false);

  if (tracks.length === 0) {
    showError("No exact match songs found for your sentence.");
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
    const userRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) throw new Error("Failed to get user profile.");
    const userData = await userRes.json();

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

generateBtn.addEventListener("click", () => {
  generatePlaylist(sentenceInput.value);
});
createPlaylistBtn.addEventListener("click", createPlaylistOnSpotify);

window.onload = () => {
  handleRedirect();
};
