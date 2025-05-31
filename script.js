const clientId = '6aea0f0190b4471eb3041d45e47adbcc';
const redirectUri = 'https://badkarmasyts.github.io/TypeGame/callback.html';
const scopes = 'user-read-private playlist-read-private streaming user-read-playback-state user-modify-playback-state';

// Helpers for PKCE
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

function base64UrlEncode(array) {
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

const loginButton = document.getElementById('login');
const gameDiv = document.getElementById('game');
const playlistSelect = document.getElementById('playlistSelect');
const trackSelect = document.getElementById('trackSelect');
const startGameBtn = document.getElementById('startGame');
const lyricsDisplay = document.getElementById('lyricsDisplay');
const typingInput = document.getElementById('typingInput');
const scoreDiv = document.getElementById('score');

let lyricsData = [];
let currentWordIndex = 0;
let score = 0;
let player;
let currentTrackId = '';

loginButton.onclick = async () => {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  localStorage.setItem('spotify_code_verifier', codeVerifier);
  localStorage.setItem('spotify_auth_state', state);

  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    `response_type=code&` +
    `client_id=${clientId}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${state}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;

  window.location = authUrl;
};

async function fetchSpotify(endpoint) {
  const token = localStorage.getItem('spotify_access_token');
  if (!token) return;
  const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

window.onSpotifyWebPlaybackSDKReady = () => {
  const token = localStorage.getItem('spotify_access_token');
  if (!token) return;
  player = new Spotify.Player({
    name: 'Typing Game Player',
    getOAuthToken: cb => { cb(token); },
    volume: 0.5
  });
  player.connect();
};

window.onload = async () => {
  const token = localStorage.getItem('spotify_access_token');
  if (!token) return;

  loginButton.style.display = 'none';
  gameDiv.style.display = 'block';

  const playlists = await fetchSpotify('me/playlists');
  playlists.items.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    playlistSelect.appendChild(option);
  });

  playlistSelect.onchange = async () => {
    const playlistId = playlistSelect.value;
    const tracks = await fetchSpotify(`playlists/${playlistId}/tracks`);
    trackSelect.innerHTML = '';
    tracks.items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.track.id;
      option.textContent = item.track.name;
      trackSelect.appendChild(option);
    });
  };
};

startGameBtn.onclick = async () => {
  const trackId = trackSelect.value;
  currentTrackId = trackId;
  const track = await fetchSpotify(`tracks/${trackId}`);
  const trackUri = track.uri;

  const token = localStorage.getItem('spotify_access_token');
  await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [trackUri] })
  });

  const lyricsRes = await fetch(`https://spotify-lyric-api.herokuapp.com/?url=https://open.spotify.com/track/${trackId}`);
  const lyricsJson = await lyricsRes.json();
  lyricsData = lyricsJson.lines || [];

  currentWordIndex = 0;
  score = 0;
  updateLyricsDisplay();

  typingInput.value = '';
  typingInput.focus();

  typingInput.oninput = () => {
    const input = typingInput.value.trim();
    const currentLine = lyricsData[currentWordIndex];
    if (currentLine && input.toLowerCase() === currentLine.words.toLowerCase()) {
      currentWordIndex++;
      typingInput.value = '';
      score++;
      updateLyricsDisplay();
    }
  };
};

function updateLyricsDisplay() {
  const currentLine = lyricsData[currentWordIndex];
  lyricsDisplay.textContent = currentLine ? currentLine.words : 'No more lyrics!';
  scoreDiv.textContent = `Score: ${score}`;
}
