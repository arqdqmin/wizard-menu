const AUDIO_BASE_URL = "https://audio.twcoffee.cl/";
const STATE_URL = "https://audio.twcoffee.cl/api/state.php?t=";
const PLAYLIST_URL = "playlist.json?v=3";

const audio = document.getElementById("audio");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const songTitle = document.getElementById("songTitle");
const statusEl = document.getElementById("status");

let playlist = [];
let userStarted = false;
let lastUpdatedAt = null;

async function loadPlaylist() {
  const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
  playlist = await res.json();
  statusEl.textContent = "Playlist cargada";
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

    const url = AUDIO_BASE_URL + song.file;

    if (state.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = state.updatedAt;
      audio.src = url;
      audio.currentTime = 0;
      songTitle.textContent = song.title || song.file;
    }

    if (state.playing) {
      if (userStarted) {
        await audio.play();
        statusEl.textContent = "Reproduciendo: " + state.currentSong;
      } else {
        statusEl.textContent = "Pulsa Iniciar música";
      }
    } else {
      audio.pause();
      statusEl.textContent = "Pausado desde admin";
    }

  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
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