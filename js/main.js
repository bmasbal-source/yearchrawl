// main.js

/**
 * Frontend JavaScript for YouTube OCR Daily app using CORS Anywhere proxy on Google Cloud Run.
 * This script handles:
 * - Firebase Authentication (Google Sign-In)
 * - Firestore user data CRUD (search phrases, preferences, filler dictionary)
 * - Triggering backend Cloud Function calls via a CORS proxy
 * - Proper CORS handling by routing API requests through the proxy URL
 * - Optionally filling search phrases with filler phrases before saving or search
 * - Displaying detailed log data received from backend after search
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// --- Firebase config and initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY",
  authDomain: "yearchrawlv001.firebaseapp.com",
  projectId: "yearchrawlv001"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Backend URL and CORS proxy ---
const backendUrl = "https://us-central1-yearchrawlv001.cloudfunctions.net/scheduled_youtube_search";
const corsProxyUrl = "https://cors-anywhere-1074015979598.us-central1.run.app/";
const proxiedBackendUrl = corsProxyUrl + backendUrl;

// --- App state ---
let currentUser = null;
let phrasesGreyed = false;
let cachedFillerWords = [];

// --- DOM elements ---
const loginView = document.getElementById("login-view");
const mainMenu = document.getElementById("main-menu");
const signinBtn = document.getElementById("signin-btn");
const signoutBtn = document.getElementById("signout-btn");
const userEmailEl = document.getElementById("user-email");
const searchPhraseListEl = document.getElementById("search-phrase-list");
const editPhrasesBtn = document.getElementById("edit-phrases-btn");
const savePhrasesBtn = document.getElementById("save-phrases-btn");
const runScheduledBtn = document.getElementById("run-scheduled-btn");
const runStatusEl = document.getElementById("run-scheduled-status");
const tokenCountEl = document.getElementById("token-count");
const fillerDictTextarea = document.getElementById("modal-filler-dict");
const fillerSaveBtn = document.getElementById("modal-filler-save");
const ocrPhrasesTextarea = document.getElementById("ocr-phrases");
const saveOcrBtn = document.getElementById("save-ocr-btn");
const hitListEl = document.getElementById("hit-list");

// Preference inputs
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const videoShortCheckbox = document.getElementById("video-short");
const videoMediumCheckbox = document.getElementById("video-medium");
const videoLongCheckbox = document.getElementById("video-long");
const ageRestrictedCheckbox = document.getElementById("age-restricted");
const useFillerCheckbox = document.getElementById("use-filler-phrases");

// Backend log display element (added in index.html)
const backendLogEl = document.getElementById("backend-log");

// --- Initialize app ---
window.addEventListener('DOMContentLoaded', () => {
  // Listen to Firebase auth state changes and toggle views accordingly
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      showMainMenu();
      await loadUserData();
    } else {
      currentUser = null;
      showLogin();
    }
  });

  // Hook up button event listeners
  signinBtn.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(e => alert("Sign-in failed: " + e.message));
  });

  signoutBtn.addEventListener('click', () => {
    signOut(auth).catch(e => alert("Sign-out failed: " + e.message));
  });

  savePhrasesBtn.addEventListener('click', saveSearchPhrases);
  editPhrasesBtn.addEventListener('click', enableSearchEditing);
  saveOcrBtn.addEventListener('click', saveOcrPhrases);
  fillerSaveBtn.addEventListener('click', saveFillerDictionary);
  runScheduledBtn.addEventListener('click', runScheduledSearch);

  // Preferences auto-save on change
  [dateFromInput, dateToInput, videoShortCheckbox, videoMediumCheckbox, videoLongCheckbox, ageRestrictedCheckbox, useFillerCheckbox]
    .forEach(el => el.addEventListener("change", savePreferences));
});

// --- UI helpers ---
function showLogin() {
  loginView.style.display = "block";
  mainMenu.style.display = "none";
}
function showMainMenu() {
  loginView.style.display = "none";
  mainMenu.style.display = "block";
}

function setPhrasesDisabled(disabled) {
  searchPhraseListEl.querySelectorAll("input").forEach(input => {
    input.disabled = disabled;
    input.classList.toggle("greyed", disabled);
  });
  phrasesGreyed = disabled;
}

// --- Load user data ---
async function loadUserData() {
  if (!currentUser) return;
  userEmailEl.textContent = currentUser.email || "";

  const docRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(docRef);
  const userData = docSnap.exists() ? docSnap.data() : {};

  // Search phrases and grey state
  const phrases = userData.search_phrases || [];
  buildSearchInputs(phrases);
  phrasesGreyed = userData.search_phrases_greyed || false;
  setPhrasesDisabled(phrasesGreyed);

  // Preferences
  dateFromInput.value = userData.date_range?.from || "";
  dateToInput.value = userData.date_range?.to || "";
  videoShortCheckbox.checked = !!userData.video_short;
  videoMediumCheckbox.checked = !!userData.video_medium;
  videoLongCheckbox.checked = !!userData.video_long;
  ageRestrictedCheckbox.checked = !!userData.age_restricted;
  useFillerCheckbox.checked = !!userData.use_filler_phrases;

  // OCR terms
  ocrPhrasesTextarea.value = (userData.ocr_terms || []).join(", ");

  // Filler dictionary load (chunked fields)
  cachedFillerWords = [];
  for (const key in userData) {
    if (key.startsWith("filler_phrases_") && Array.isArray(userData[key])) {
      cachedFillerWords = cachedFillerWords.concat(userData[key]);
    }
  }
  fillerDictTextarea.value = cachedFillerWords.join(", ");

  tokenCountEl.textContent = userData.api_tokens_remaining ?? "—";

  renderHits(userData.daily_hits || []);
  clearBackendLog();
}

// Build 20 search phrase inputs
function buildSearchInputs(phrases) {
  searchPhraseListEl.innerHTML = "";
  for (let i = 0; i < 20; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "search-box form-control mb-1";
    input.placeholder = "Enter search phrase";
    input.value = phrases[i] || "";
    if (phrasesGreyed) {
      input.disabled = true;
      input.classList.add("greyed");
    }
    searchPhraseListEl.appendChild(input);
  }
}

// Render daily hits list
function renderHits(hits) {
  if (!hits.length) {
    hitListEl.innerHTML = "<p>No hits today.</p>";
    return;
  }
  let html = "<ul class='list-group'>";
  hits.forEach(hit => {
    html += `<li class="list-group-item">${hit.term} found in video ID: ${hit.videoID} with confidence ${hit.likelihood}</li>`;
  });
  html += "</ul>";
  hitListEl.innerHTML = html;
}

// Clear backend log display
function clearBackendLog() {
  if (backendLogEl) {
    backendLogEl.innerHTML = "";
  }
}

// Display backend search attempt log nicely
function renderBackendLog(log) {
  if (!backendLogEl || !log) return;

  let html = "<h4>Backend Search Log</h4>";
  html += "<ul>";

  // Video search counts
  if (log.video_search_counts && log.video_search_counts.length) {
    html += "<li><strong>Video Search Results:</strong><ul>";
    log.video_search_counts.forEach(item => {
      let from = item.time_window[0] || "N/A";
      let to = item.time_window[1] || "N/A";
      html += `<li>Phrase: <em>${item.phrase}</em> | Date Range: ${from} - ${to} | Results: ${item.results}</li>`;
    });
    html += "</ul></li>";
  }

  html += `<li>Thumbnails successfully opened: ${log.thumbnails_opened || 0}</li>`;
  html += `<li>Thumbnail open failures: ${log.thumbnail_open_failures || 0}</li>`;
  html += `<li>OCR errors encountered: ${log.ocr_errors || 0}</li>`;
  html += `<li>OCR low confidence matches (not hits): ${log.ocr_low_confidence || 0}</li>`;
  html += `<li>Total backend execution time: ${log.total_time_sec || 0} seconds</li>`;
  html += "</ul>";

  backendLogEl.innerHTML = html;
}

// --- Save and editing functions ---
async function saveSearchPhrases() {
  if (!currentUser) return;
  const phrases = [...searchPhraseListEl.querySelectorAll("input")].map(input => input.value.trim()).filter(Boolean);
  const userRef = doc(db, "users", currentUser.uid);
  await setDoc(userRef, { search_phrases: phrases }, { merge: true });
  phrasesGreyed = true;
  setPhrasesDisabled(true);
}

function enableSearchEditing() {
  setPhrasesDisabled(false);
}

async function saveOcrPhrases() {
  if (!currentUser) return;
  const ocrTerms = ocrPhrasesTextarea.value.split(",").map(s => s.trim()).filter(Boolean);
  const userRef = doc(db, "users", currentUser.uid);
  await setDoc(userRef, { ocr_terms: ocrTerms }, { merge: true });
}

async function saveFillerDictionary() {
  if (!currentUser) return;
  const words = fillerDictTextarea.value.split(",").map(s => s.trim()).filter(Boolean);
  const chunkSize = 500;
  const userRef = doc(db, "users", currentUser.uid);
  let updates = {};
  for (let i = 0; i < words.length; i += chunkSize) {
    updates[`filler_phrases_${i / chunkSize}`] = words.slice(i, i + chunkSize);
  }
  await setDoc(userRef, updates, { merge: true });
  cachedFillerWords = words;
}

async function savePreferences() {
  if (!currentUser) return;
  const prefs = {
    date_range: {
      from: dateFromInput.value.trim(),
      to: dateToInput.value.trim()
    },
    video_short: videoShortCheckbox.checked,
    video_medium: videoMediumCheckbox.checked,
    video_long: videoLongCheckbox.checked,
    age_restricted: ageRestrictedCheckbox.checked,
    use_filler_phrases: useFillerCheckbox.checked
  };
  const userRef = doc(db, "users", currentUser.uid);
  await setDoc(userRef, prefs, { merge: true });
}

// --- Run scheduled search on backend ---
async function runScheduledSearch() {
  if (!currentUser) return;
  runStatusEl.textContent = "Running search...";
  try {
    const response = await fetch(proxiedBackendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.uid }),
    });
    const data = await response.json();
    if (data.status === 'success') {
      // Reload user data to update UI including hits and tokens
      await loadUserData();
      // Display detailed backend log data from search attempt
      renderBackendLog(data.log);
      runStatusEl.textContent = `Search completed. Hits found: ${data.hits_count}, Tokens used: ${data.tokens_used}, Tokens remaining: ${data.tokens_remaining}`;
    } else {
      runStatusEl.textContent = "Search returned error: " + (data.error || "Unknown error");
      clearBackendLog();
    }
  } catch (e) {
    runStatusEl.textContent = "Search failed: " + e.message;
    clearBackendLog();
  }
}








