const AUDIO_BASE_URL = "https://audio.twcoffee.cl/";
const STATE_URL = "https://audio.twcoffee.cl/api/state.php?t=";
const PLAYLIST_URL = "playlist.json?v=2";

const audio = document.getElementById("audio");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const songTitle = document.getElementById("songTitle");
const statusEl = document.getElementById("status");

let playlist = [];
let lastSong = null;
let userStarted = false;

async function loadPlaylist() {
  const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
  playlist = await res.json();
}

function findSong(file) {
  return playlist.find(s => s.file === file);
}

async function checkState() {
  try {
    const res = await fetch(STATE_URL + Date.now(), { cache: "no-store" });
    const state = await res.json();

    const song = findSong(state.currentSong);

    if (!song) {
      statusEl.textContent = "No está en playlist: " + state.currentSong;
      return;
    }

    const url = song.url || AUDIO_BASE_URL + song.file;

    if (lastSong !== state.currentSong) {
      audio.src = url;
      lastSong = state.currentSong;
      songTitle.textContent = song.title || song.file;
    }

    if (state.playing && userStarted) {
      let targetTime = 0;

      if (state.startedAt && state.serverTime) {
        targetTime = (state.serverTime - state.startedAt) / 1000;
      }

      const diff = Math.abs(audio.currentTime - targetTime);

      if (diff > 0.8) {
        audio.currentTime = targetTime;
      }

      audio.play().then(() => {
        statusEl.textContent = "Sincronizado: " + Math.round(targetTime) + "s";
      }).catch(() => {
        statusEl.textContent = "Pulsa Iniciar música";
      });
    }

    if (!state.playing) {
      audio.pause();
      statusEl.textContent = "Pausado desde admin";
    }

  } catch (e) {
    statusEl.textContent = "Error leyendo estado: " + e.message;
  }
}

startBtn.addEventListener("click", async () => {
  userStarted = true;
  await checkState();
});

stopBtn.addEventListener("click", () => {
  audio.pause();
});

loadPlaylist().then(() => {
  checkState();
  setInterval(checkState, 2000);
});