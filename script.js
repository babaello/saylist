const loginBtn = document.getElementById("loginBtn");
const status = document.getElementById("status");
const form = document.getElementById("sentenceForm");
const sentenceInput = document.getElementById("sentence");
const result = document.getElementById("result");
let accessToken = null;

loginBtn.addEventListener("click", () => {
  window.location.href = "https://saylist.onrender.com/login";
});

function getAccessTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("access_token")) {
    return params.get("access_token");
  }
  return null;
}

async function fetchProfile() {
  try {
    const res = await fetch("https://saylist.onrender.com/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      status.textContent = `Logged in as ${data.display_name}`;
      loginBtn.style.display = "none";
      form.style.display = "block";
    } else {
      status.textContent = "Login failed. Please try again.";
    }
  } catch (err) {
    status.textContent = "Error fetching profile.";
  }
}

async function createPlaylist(sentence) {
  result.innerHTML = "Creating playlist...";
  try {
    const res = await fetch("https://saylist.onrender.com/create-playlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sentence }),
    });

    const data = await res.json();

    if (res.ok) {
      result.innerHTML = `
        <p>Playlist created: <strong>${data.name}</strong></p>
        <p><a href="${data.external_url}" target="_blank">Open in Spotify</a></p>
        <iframe src="https://open.spotify.com/embed/playlist/${data.id}" width="100%" height="380" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>
      `;
    } else {
      result.textContent = `Error: ${data.error || "Unable to create playlist"}`;
    }
  } catch (err) {
    result.textContent = "Network error. Try again.";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const sentence = sentenceInput.value.trim();
  if (sentence) {
    createPlaylist(sentence);
  } else {
    result.textContent = "Please enter a sentence.";
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const token = getAccessTokenFromUrl();
  if (token) {
    accessToken = token;
    fetchProfile();
    window.history.replaceState({}, document.title, "/saylist/");
  }
});
