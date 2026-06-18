const STATE_URL = "https://audio.twcoffee.cl/api/state.php";
const PLAYLIST_URL = "playlist.json?v=2";

const select = document.getElementById("songSelect");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const msg = document.getElementById("msg");

async function loadPlaylist() {
  const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
  const playlist = await res.json();

  select.innerHTML = "";
  playlist.forEach(song => {
    const opt = document.createElement("option");
    opt.value = song.file;
    opt.textContent = song.title || song.file;
    select.appendChild(opt);
  });
}

async function setState(playing) {
  const payload = {
    currentSong: select.value,
    playing: playing,
    position: 0
  };

  const res = await fetch(STATE_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  msg.textContent = data.ok ? "Estado actualizado y sincronizado" : "Error";
}

playBtn.addEventListener("click", () => setState(true));
pauseBtn.addEventListener("click", () => setState(false));

loadPlaylist();