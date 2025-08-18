// Firebase initialization
const firebaseConfig = {
  apiKey: "AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY",
  authDomain: "yearchrawlv001.firebaseapp.com",
  projectId: "yearchrawlv001"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let user = null;
let phrasesGreyed = false;
let cachedFillerDict = [];

window.onload = function() {
  auth.onAuthStateChanged(function(u) {
    user = u;
    if (u) {
      showMainMenu();
      loadUserData();
    } else {
      showLogin();
    }
  });

  document.getElementById("signin-btn").onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(e => alert("Sign-in failed: " + e.message));
  };

  document.getElementById("signout-btn").onclick = () => {
    auth.signOut();
  };

  document.getElementById("save-phrases-btn").onclick = saveSearchPhrases;
  document.getElementById("edit-phrases-btn").onclick = enableSearchEditing;
  document.getElementById("save-ocr-btn").onclick = saveOcrPhrases;
  document.getElementById("modal-filler-save").onclick = saveFillerDictionary;
  document.getElementById("run-scheduled-btn").onclick = runScheduledSearch;

  ["date-from", "date-to", "video-short", "video-medium", "video-long", "age-restricted"].forEach(id => {
    document.getElementById(id).addEventListener("change", savePreferences);
  });
};

function showLogin() {
  document.getElementById("login-view").style.display = "block";
  document.getElementById("main-menu").style.display = "none";
}

function showMainMenu() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("main-menu").style.display = "block";
}

async function loadUserData() {
  if (!user) return;
  document.getElementById("user-email").textContent = user.email || "";
  const doc = await db.collection("users").doc(user.uid).get();
  const data = doc.exists ? doc.data() : {};
  cachedFillerDict = [];
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("filler_phrases_") && Array.isArray(v)) {
      cachedFillerDict = cachedFillerDict.concat(v);
    }
  }
  const phrases = data.search_phrases || [];
  buildSearchInputs(phrases);
  phrasesGreyed = data.search_phrases_greyed || false;
  setPhrasesDisabled(phrasesGreyed);

  document.getElementById("date-from").value = data.date_range?.from || "";
  document.getElementById("date-to").value = data.date_range?.to || "";
  document.getElementById("video-short").checked = data.video_short || false;
  document.getElementById("video-medium").checked = data.video_medium || false;
  document.getElementById("video-long").checked = data.video_long || false;
  document.getElementById("age-restricted").checked = data.age_restricted || false;
  document.getElementById("ocr-phrases").value = (data.ocr_terms || []).join(", ");

  document.getElementById("modal-filler-dict").value = cachedFillerDict.join(", ");

  document.getElementById("token-count").textContent = data.api_tokens_remaining ?? "—";
  renderHits(data.daily_hits || []);
}

function buildSearchInputs(phrases) {
  const container = document.getElementById("search-phrase-list");
  container.innerHTML = "";
  for (let i = 0; i < 20; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "search-box form-control";
    input.value = phrases[i] || "";
    input.placeholder = "Search phrase";
    if (phrasesGreyed) {
      input.disabled = true;
      input.classList.add("greyed");
    }
    container.appendChild(input);
  }
}

function setPhrasesDisabled(disabled) {
  const inputs = document.querySelectorAll("#search-phrase-list input");
  inputs.forEach(input => {
    input.disabled = disabled;
    if (disabled) {
      input.classList.add("greyed");
    } else {
      input.classList.remove("greyed");
    }
  });
  phrasesGreyed = disabled;
}

async function saveSearchPhrases() {
  if (!user) return;
  const inputs = document.querySelectorAll("#search-phrase-list input");
  let phrases = [];
  inputs.forEach(input => {
    if (input.value.trim()) phrases.push(input.value.trim());
  });
  await db.collection("users").doc(user.uid).set({
    search_phrases: phrases,
    search_phrases_greyed: true
  }, { merge: true });
  setPhrasesDisabled(true);
  loadUserData();
}

async function enableSearchEditing() {
  if (!user) return;
  await db.collection("users").doc(user.uid).set({
    search_phrases_greyed: false
  }, { merge: true });
  setPhrasesDisabled(false);
  loadUserData();
}

async function saveOcrPhrases() {
  if (!user) return;
  let text = document.getElementById("ocr-phrases").value;
  let terms = text.split(/[, ]+/).map(t => t.trim()).filter(t => t.length);
  await db.collection("users").doc(user.uid).set({ ocr_terms: terms }, { merge: true });
}

async function saveFillerDictionary() {
  if (!user) return;
  let text = document.getElementById("modal-filler-dict").value;
  let words = text.split(",").map(w => w.trim()).filter(w => w.length);
  const MAX_CHUNK_SIZE = 300;
  for (let i = 0; i < words.length; i += MAX_CHUNK_SIZE) {
    let chunk = words.slice(i, i + MAX_CHUNK_SIZE);
    const obj = {};
    obj["filler_phrases_" + (i / MAX_CHUNK_SIZE)] = chunk;
    await db.collection("users").doc(user.uid).set(obj, { merge: true });
  }
  cachedFillerDict = words;
  alert("Filler dictionary saved!");
  document.getElementById("modal-filler-dict").value = words.join(", ");
}

async function savePreferences() {
  if (!user) return;
  const data = {
    date_range: {
      from: document.getElementById("date-from").value.trim(),
      to: document.getElementById("date-to").value.trim()
    },
    video_short: document.getElementById("video-short").checked,
    video_medium: document.getElementById("video-medium").checked,
    video_long: document.getElementById("video-long").checked,
    age_restricted: document.getElementById("age-restricted").checked
  };
  await db.collection("users").doc(user.uid).set(data, { merge: true });
}

function renderHits(hits) {
  const container = document.getElementById("hit-list");
  if (!hits.length) {
    container.innerHTML = "<p>No hits today.</p>";
    return;
  }
  let html = "<ul>";
  hits.forEach(h => {
    html += `<li><a href="https://youtube.com/watch?v=${h.videoID}" target="_blank">${h.videoID}</a> | <strong>${h.term}</strong> | Confidence: ${h.likelihood}</li>`;
  });
  html += "</ul>";
  container.innerHTML = html;
}

async function runScheduledSearch() {
  if (!user) return;
  const statusEl = document.getElementById("run-scheduled-status");
  statusEl.textContent = "Running...";
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("https://us-central1-yearchrawlv001.cloudfunctions.net/scheduled_youtube_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken
      },
      body: JSON.stringify({ user_id: user.uid })
    });
    if (res.ok) {
      const data = await res.json();
      statusEl.textContent = `Search complete. ${data.hits_count} hits found. Tokens left: ${data.tokens_remaining}`;
      loadUserData();
    } else {
      const err = await res.json();
      statusEl.textContent = `Error: ${err.error || res.statusText}`;
    }
  } catch (e) {
    statusEl.textContent = `Failed: ${e.message}`;
  }
  setTimeout(() => { statusEl.textContent = ""; }, 10000);
}
