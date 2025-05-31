const clientId = '6aea0f0190b4471eb3041d45e47adbcc';
const redirectUri = 'https://badkarmasyts.github.io/TypeGame/callback.html';
const scopes = 'user-read-private playlist-read-private streaming user-read-playback-state user-modify-playback-state';

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
const countdownDiv = document.getElementById('countdown');

let lyricsData = [];
let currentLineIndex = 0;
let score = 0;
let player;
let deviceId = null;
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
  if (res.status === 401) {
    alert('Spotify token expired. Please reconnect.');
    localStorage.removeItem('spotify_access_token');
    window.location.reload();
    return;
  }
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

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
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

window.onload = async () => {
  const token = localStorage.getItem('spotify_access_token');
  if (!token) return;

  loginButton.style.display = 'none';
  gameDiv.style.display = 'flex';

  const playlists = await fetchSpotify('me/playlists');
  playlistSelect.innerHTML = '<option disabled selected>Select Playlist</option>';
  playlists.items.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    playlistSelect.appendChild(option);
  });

  playlistSelect.onchange = async () => {
    const playlistId = playlistSelect.value;
    const tracks = await fetchSpotify(`playlists/${playlistId}/tracks`);
    trackSelect.innerHTML = '<option disabled selected>Select Track</option>';
    tracks.items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.track.id;
      option.textContent = item.track.name;
      trackSelect.appendChild(option);
    });
  };
};

startGameBtn.onclick = async () => {
  if (!deviceId) {
    alert('Spotify player not ready yet, please wait a few seconds and try again.');
    return;
  }

  const trackId = trackSelect.value;
  if (!trackId) {
    alert('Select a track first!');
    return;
  }
  currentTrackId = trackId;

  const token = localStorage.getItem('spotify_access_token');

  // Start playing on your Web Playback SDK device
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
  });

  const lyricsRes = await fetch(`https://spotify-lyric-api.herokuapp.com/?url=https://open.spotify.com/track/${trackId}`);
  const lyricsJson = await lyricsRes.json();
  lyricsData = lyricsJson.lines || [];

  if (!lyricsData.length) {
    alert('Lyrics not found for this song. Try another one.');
    return;
  }

  currentLineIndex = 0;
  score = 0;
  updateLyricsDisplay();

  typingInput.value = '';
  typingInput.disabled = true;
  typingInput.classList.remove('correct', 'incorrect');
  countdownDiv.style.display = 'block';

  // Countdown before game starts
  let countdown = 3;
  countdownDiv.textContent = `Starting in ${countdown}...`;

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownDiv.style.display = 'none';
      typingInput.disabled = false;
      typingInput.focus();
    } else {
      countdownDiv.textContent = `Starting in ${countdown}...`;
    }
  }, 1000);

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

  // Show current line highlighted
  lyricsDisplay.textContent = currentLine.words;

  scoreDiv.textContent = `Score: ${score}`;

  // Scroll lyrics div to bottom (not really needed here, but for longer lyrics)
  lyricsDisplay.scrollTop = lyricsDisplay.scrollHeight;
}

// When redirected back from Spotify auth (callback.html)
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

  // Exchange code for token
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

  // Clear PKCE stuff to keep clean
  localStorage.removeItem('spotify_code_verifier');
  localStorage.removeItem('spotify_auth_state');

  // Redirect back to main page without code params
  window.location.href = window.location.origin + window.location.pathname;
}

if (window.location.pathname.endsWith('callback.html')) {
  handleAuthRedirect();
}
