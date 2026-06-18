const AUDIO_BASE_URL = "https://audio.twcoffee.cl/"; // Cambia esto si usas otro subdominio
const STATE_URL = "https://audio.twcoffee.cl/api/state.php";
const PLAYLIST_URL = "playlist.json";

const audio = document.getElementById("audio");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const songTitle = document.getElementById("songTitle");
const statusEl = document.getElementById("status");

let playlist = [];
let lastUpdatedAt = null;
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
    const res = await fetch(STATE_URL + "?t=" + Date.now(), { cache: "no-store" });
    const state = await res.json();

    statusEl.textContent = "Conectado";

    if (state.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = state.updatedAt;

      const song = findSong(state.currentSong);
      if (!song) return;

      const url = song.url || AUDIO_BASE_URL + song.file;

      if (audio.src !== url) {
        audio.src = url;
        songTitle.textContent = song.title || song.file;
      }

      if (state.playing && userStarted) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          statusEl.textContent = "Toca Iniciar música para permitir reproducción";
        });
      }

      if (!state.playing) {
        audio.pause();
      }
    }
  } catch (e) {
    statusEl.textContent = "No se pudo leer el estado";
  }
}

startBtn.addEventListener("click", async () => {
  userStarted = true;
  await checkState();
  audio.play().catch(() => {});
});

stopBtn.addEventListener("click", () => {
  audio.pause();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

loadPlaylist().then(() => {
  checkState();
  setInterval(checkState, 2000);
});
