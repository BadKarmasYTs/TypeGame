const clientId = '6aea0f0190b4471eb3041d45e47adbcc';
const redirectUri = 'https://badkarmasyts.github.io/TypeGame/callback.html';
const scopes = 'user-read-private playlist-read-private streaming user-read-playback-state user-modify-playback-state';

const loginButton = document.getElementById('login');
const gameDiv = document.getElementById('game');
const playlistSelect = document.getElementById('playlistSelect');
const trackSelect = document.getElementById('trackSelect');
const startGameBtn = document.getElementById('startGame');
const lyricsDisplay = document.getElementById('lyricsDisplay');
const typingInput = document.getElementById('typingInput');
const scoreDiv = document.getElementById('score');

let lyricsData = [];
let currentLineIndex = 0;
let score = 0;
let player;
let deviceId = null;

loginButton.onclick = () => {
  const state = generateRandomString(16);
  localStorage.setItem('spotify_auth_state', state);

  const codeVerifier = generateRandomString(64);
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  generateCodeChallenge(codeVerifier).then(codeChallenge => {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge_method=S256&code_challenge=${codeChallenge}`;
    window.location = authUrl;
  });
};

startGameBtn.disabled = true;
startGameBtn.textContent = "Loading Spotify Player...";

window.onSpotifyWebPlaybackSDKReady = () => {
  const token = localStorage.getItem('spotify_access_token');
  if (!token) return;

  player = new Spotify.Player({
    name: 'Typing Game Player',
    getOAuthToken: cb => { cb(token); },
    volume: 0.5
  });

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    startGameBtn.disabled = false;
    startGameBtn.textContent = 'Start Game';
  });

  player.addListener('not_ready', ({ device_id }) => {
    console.log('Device ID has gone offline', device_id);
  });

  player.addListener('initialization_error', ({ message }) => { console.error(message); });
  player.addListener('authentication_error', ({ message }) => { console.error(message); });
  player.addListener('account_error', ({ message }) => { console.error(message); });
  player.addListener('playback_error', ({ message }) => { console.error(message); });

  player.connect();
};

async function fetchSpotify(endpoint) {
  const token = localStorage.getItem("spotify_access_token");
  const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

window.onload = async () => {
  const token = localStorage.getItem("spotify_access_token");
  if (!token) return;

  loginButton.style.display = "none";
  gameDiv.style.display = "block";

  const playlists = await fetchSpotify("me/playlists");
  playlists.items.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.name;
    playlistSelect.appendChild(option);
  });

  playlistSelect.onchange = async () => {
    const playlistId = playlistSelect.value;
    const tracks = await fetchSpotify(`playlists/${playlistId}/tracks`);
    trackSelect.innerHTML = '';
    tracks.items.forEach(item => {
      const option = document.createElement("option");
      option.value = item.track.id;
      option.textContent = item.track.name;
      trackSelect.appendChild(option);
    });
  };
};

startGameBtn.onclick = async () => {
  if (!deviceId) {
    alert('Spotify player not ready yet. Please wait a few seconds.');
    return;
  }

  const trackId = trackSelect.value;
  const track = await fetchSpotify(`tracks/${trackId}`);
  const trackUri = track.uri;

  const token = localStorage.getItem("spotify_access_token");
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [trackUri] })
  });

  if (!res.ok) {
    alert('Failed to start playback. Make sure Spotify is open and you have Premium.');
    return;
  }

  const lyricsRes = await fetch(`https://spotify-lyric-api.herokuapp.com/?url=https://open.spotify.com/track/${trackId}`);
  const lyricsJson = await lyricsRes.json();
  lyricsData = lyricsJson.lines || [];

  currentLineIndex = 0;
  score = 0;
  typingInput.disabled = false;
  typingInput.value = '';
  updateLyricsDisplay();

  typingInput.focus();

  typingInput.oninput = () => {
    const input = typingInput.value.trim();
    const currentLine = lyricsData[currentLineIndex];
    if (!currentLine) return;

    if (currentLine.words.toLowerCase().startsWith(input.toLowerCase())) {
      typingInput.classList.add('correct');
      typingInput.classList.remove('incorrect');
    } else {
      typingInput.classList.add('incorrect');
      typingInput.classList.remove('correct');
    }

    if (input.toLowerCase() === currentLine.words.toLowerCase()) {
      currentLineIndex++;
      score++;
      typingInput.value = '';
      updateLyricsDisplay();
    }
  };
};

function updateLyricsDisplay() {
  const currentLine = lyricsData[currentLineIndex];
  if (!currentLine) {
    lyricsDisplay.textContent = '🎉 You finished the lyrics! 🎉';
    typingInput.disabled = true;
    return;
  }

  lyricsDisplay.textContent = currentLine.words;
  scoreDiv.textContent = `Score: ${score}`;
  lyricsDisplay.scrollTop = lyricsDisplay.scrollHeight;
}

// Helper functions for PKCE
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Call this on callback.html to handle auth code exchange and save tokens
async function handleAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const storedState = localStorage.getItem('spotify_auth_state');

  if (!code) return;

  if (state !== storedState) {
    alert('Spotify auth state mismatch.');
    return;
  }

  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  if (!codeVerifier) {
    alert('Missing code verifier.');
    return;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    alert('Failed to exchange code for token.');
    return;
  }

  const data = await res.json();
  localStorage.setItem('spotify_access_token', data.access_token);

  localStorage.removeItem('spotify_code_verifier');
  localStorage.removeItem('spotify_auth_state');

  window.location.href = window.location.origin + window.location.pathname;
}

if (window.location.pathname.endsWith('callback.html')) {
  handleAuthRedirect();
}
