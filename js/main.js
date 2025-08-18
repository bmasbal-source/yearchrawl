// js/main.js
/**
 * Frontend JavaScript for YouTube OCR Daily
 * - Firebase auth and Firestore integration
 * - UI management of search phrases, preferences, filler dictionary
 * - Calls backend Cloud Function securely with user Firebase token
 */

// Firebase config for your project
const firebaseConfig = {
  apiKey: "AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY",
  authDomain: "yearchrawlv001.firebaseapp.com",
  projectId: "yearchrawlv001"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Your backend Cloud Function URL for scheduled searches
const CLOUD_FUNCTION_URL = "https://us-central1-yearchrawlv001.cloudfunctions.net/scheduled_youtube_search";

let user = null;
let phrasesGreyed = false;
let cachedFillerDict = [];

// Initialize app on window load
window.onload = () => {
  auth.onAuthStateChanged(async (u) => {
    user = u;
    if (u) {
      showMainMenu();
      await loadUserData();
    } else {
      showLogin();
    }
  });

  // Event listeners for auth and UI buttons
  document.getElementById("signin-btn").onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(e => alert("Sign-in failed: " + e.message));
  };

  document.getElementById("signout-btn").onclick = () => auth.signOut();

  document.getElementById("save-phrases-btn").onclick = saveSearchPhrases;
  document.getElementById("edit-phrases-btn").onclick = enableSearchEditing;
  document.getElementById("save-ocr-btn").onclick = saveOcrPhrases;
  document.getElementById("modal-filler-save").onclick = saveFillerDictionary;
  document.getElementById("run-scheduled-btn").onclick = runScheduledSearch;

  ["date-from", "date-to", "video-short", "video-medium", "video-long", "age-restricted"]
    .forEach(id => document.getElementById(id).addEventListener("change", savePreferences));
};

// Show login container, hide main menu
function showLogin() {
  document.getElementById("login-view").style.display = "block";
  document.getElementById("main-menu").style.display = "none";
}

// Show main menu, hide login container
function showMainMenu() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("main-menu").style.display = "block";
}

// Load user data from Firestore and populate UI
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
  buildSearchInputs(data.search_phrases || []);
  phrasesGreyed = data.search_phrases_greyed || false;
  setPhrasesDisabled(phrasesGreyed);

  // Populate preferences fields
  document.getElementById("date-from").value = data.date_range?.from || "";
  document.getElementById("date-to").value = data.date_range?.to || "";
  ["video-short", "video-medium", "video-long", "age-restricted"].forEach(id => {
    document.getElementById(id).checked = !!data[id.replace("-", "_")];
  });
  document.getElementById("ocr-phrases").value = (data.ocr_terms || []).join(", ");
  document.getElementById("modal-filler-dict").value = cachedFillerDict.join(", ");

  document.getElementById("token-count").textContent = data.api_tokens_remaining ?? "—";
  renderHits(data.daily_hits || []);
}

// Build the 20 search phrase input fields with values
function buildSearchInputs(phrases) {
  const container = document.getElementById("search-phrase-list");
  container.innerHTML = "";
  for(let i=0; i < 20; i++) {
    let input = document.createElement("input");
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

// Enable or disable editing of search phrase inputs
function setPhrasesDisabled(disabled) {
  document.querySelectorAll("#search-phrase-list input").forEach(input => {
    input.disabled = disabled;
    input.classList.toggle("greyed", disabled);
  });
  phrasesGreyed = disabled;
}

// Save search phrases to Firestore, disable editing afterward
async function saveSearchPhrases() {
  if (!user) return;
  const phrases = Array.from(document.querySelectorAll("#search-phrase-list input"))
    .map(input => input.value.trim()).filter(Boolean);
  await db.collection("users").doc(user.uid).set({
    search_phrases: phrases,
    search_phrases_greyed: true,
  }, {merge:true});
  setPhrasesDisabled(true);
  loadUserData();
}

// Enable editing of search phrases
async function enableSearchEditing() {
  if (!user) return;
  await db.collection("users").doc(user.uid).set({
    search_phrases_greyed: false
  }, {merge:true});
  setPhrasesDisabled(false);
  loadUserData();
}

// Save OCR phrases, comma or space separated
async function saveOcrPhrases() {
  if (!user) return;
  let terms = document.getElementById("ocr-phrases").value.split(/[, ]+/)
    .map(t => t.trim()).filter(Boolean);
  await db.collection("users").doc(user.uid).set({ocr_terms: terms}, {merge:true});
}

// Save filler dictionary (chunks due to Firestore limits)
async function saveFillerDictionary() {
  if (!user) return;
  let words = document.getElementById("modal-filler-dict").value.split(",")
    .map(w => w.trim()).filter(Boolean);
  const MAX_CHUNK=300;
  for (let i=0; i < words.length; i+= MAX_CHUNK) {
    let chunk = words.slice(i, i+MAX_CHUNK);
    let obj = {};
    obj[`filler_phrases_${i/MAX_CHUNK}`] = chunk;
    await db.collection("users").doc(user.uid).set(obj, {merge:true});
  }
  cachedFillerDict = words;
  alert("Filler dictionary saved!");
}

// Save user preferences for date range, video lengths, and age restriction
async function savePreferences() {
  if (!user) return;
  const data = {
    date_range: {
      from: document.getElementById("date-from").value.trim(),
      to: document.getElementById("date-to").value.trim(),
    },
    video_short: document.getElementById("video-short").checked,
    video_medium: document.getElementById("video-medium").checked,
    video_long: document.getElementById("video-long").checked,
    age_restricted: document.getElementById("age-restricted").checked,
  };
  await db.collection("users").doc(user.uid).set(data, {merge:true});
}

// Render the daily OCR hit results to the UI
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

// Run the scheduled search manually by calling backend Cloud Function
async function runScheduledSearch() {
  if (!user) return;
  const statusEl = document.getElementById("run-scheduled-status");
  statusEl.textContent = "Running...";
  try {
    const idToken = await user.getIdToken();
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken
      },
      body: JSON.stringify({ user_id: user.uid })
    });
    if (response.ok) {
      const data = await response.json();
      statusEl.textContent = `Search complete: ${data.hits_count} hits. Tokens left: ${data.tokens_remaining}`;
      loadUserData();
    } else {
      const errorData = await response.json();
      statusEl.textContent = `Error: ${errorData.error || response.statusText}`;
    }
  } catch (err) {
    statusEl.textContent = `Failed: ${err.message}`;
  }
  setTimeout(() => { statusEl.textContent = ""; }, 10000);
}


