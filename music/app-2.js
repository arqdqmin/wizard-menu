const AUDIO_BASE_URL = "https://audio.twcoffee.cl/";
const STATE_URL = "https://audio.twcoffee.cl/api/state.php";
const PLAYLIST_URL = "playlist.json?v=999";

const audio = document.getElementById("audio");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const songTitle = document.getElementById("songTitle");
const statusEl = document.getElementById("status");

let playlist = [];
let userStarted = false;
let currentSong = "";

async function loadPlaylist() {
  const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
  playlist = await res.json();
}

function findSong(file) {
  return playlist.find(s => s.file === file);
}

async function readState() {
  const res = await fetch(STATE_URL + "?t=" + Date.now(), { cache: "no-store" });
  return await res.json();
}

async function syncPlayer(forcePlay = false) {
  try {
    const state = await readState();
    const song = findSong(state.currentSong);

    if (!song) {
      statusEl.textContent = "No está en playlist: " + state.currentSong;
      return;
    }

    const url = AUDIO_BASE_URL + song.file;

    if (currentSong !== state.currentSong || audio.src !== url) {
      currentSong = state.currentSong;
      audio.src = url;
      audio.load();
      songTitle.textContent = song.title || song.file;
    }

    if (state.playing && (userStarted || forcePlay)) {
      await audio.play();
      statusEl.textContent = "Reproduciendo: " + state.currentSong;
    } else if (!state.playing) {
      audio.pause();
      statusEl.textContent = "Pausado desde admin";
    } else {
      statusEl.textContent = "Listo. Pulsa Iniciar música.";
    }

  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
    console.error(err);
  }
}

startBtn.addEventListener("click", async () => {
  userStarted = true;
  await syncPlayer(true);
});

stopBtn.addEventListener("click", () => {
  audio.pause();
  statusEl.textContent = "Pausado localmente";
});

loadPlaylist().then(() => {
  statusEl.textContent = "Playlist cargada";
  syncPlayer(false);
  setInterval(() => syncPlayer(false), 2000);
});