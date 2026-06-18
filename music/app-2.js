const AUDIO_BASE_URL = "https://audio.twcoffee.cl/";
const STATE_URL = "https://audio.twcoffee.cl/api/state.php?t=";
const PLAYLIST_URL = "playlist.json?v=2";

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
  console.log("Playlist cargada:", playlist);
}

function findSong(file) {
  return playlist.find(s => s.file === file);
}

async function checkState() {
  try {
    const res = await fetch(STATE_URL + Date.now(), { cache: "no-store" });
    const state = await res.json();

    console.log("Estado recibido:", state);
    statusEl.textContent = "Estado leído: " + state.currentSong;

    const song = findSong(state.currentSong);

    if (!song) {
      statusEl.textContent = "Canción no está en playlist.json: " + state.currentSong;
      return;
    }

    const url = song.url || AUDIO_BASE_URL + song.file;

    if (audio.src !== url) {
      audio.src = url;
      songTitle.textContent = song.title || song.file;
    }

    if (state.playing && userStarted) {
      audio.play().then(() => {
        statusEl.textContent = "Reproduciendo: " + state.currentSong;
      }).catch(err => {
        statusEl.textContent = "Chrome bloqueó el audio. Pulsa Iniciar música.";
        console.error(err);
      });
    }

    if (!state.playing) {
      audio.pause();
      statusEl.textContent = "Pausado desde admin";
    }

    lastUpdatedAt = state.updatedAt;

  } catch (e) {
    console.error(e);
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