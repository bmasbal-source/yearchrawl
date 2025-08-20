// js/main.js
/**
 * Frontend JavaScript for YouTube OCR Daily app using CORS Anywhere proxy on Google Cloud Run.
 *
 * This script handles:
 * - Firebase Authentication (Google Sign-In)
 * - Firestore user data CRUD (search phrases, preferences, filler dictionary)
 * - Triggering backend Cloud Function calls via a CORS proxy
 * - Proper CORS handling by routing API requests through the proxy URL
 * - Optionally filling search phrases with filler phrases before saving or search
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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
const useFillerCheckbox = document.getElementById("use-filler-phrases"); // New checkbox element

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
  let html = "<ul>";
  hits.forEach(h => {
    html += `<li>
      <a href="https://youtube.com/watch?v=${h.videoID}" target="_blank" rel="noopener">${h.videoID}</a>
      | <strong>${h.term}</strong>
      | Confidence: ${h.likelihood}
    </li>`;
  });
  html += "</ul>";
  hitListEl.innerHTML = html;
}

// --- Save handlers with filler phrases option ---

// Save search phrases, optionally appending filler phrases
async function saveSearchPhrases() {
  if (!currentUser) return;

  let phrases = Array.from(searchPhraseListEl.querySelectorAll("input"))
    .map(i => i.value.trim())
    .filter(Boolean);

  // Append filler phrases if checkbox checked
  if (useFillerCheckbox.checked && cachedFillerWords.length > 0) {
    phrases = phrases.concat(cachedFillerWords);
  }

  const docRef = doc(db, "users", currentUser.uid);
  await setDoc(docRef, {
    search_phrases: phrases,
    search_phrases_greyed: true,
    use_filler_phrases: useFillerCheckbox.checked
  }, { merge: true });

  setPhrasesDisabled(true);
  await loadUserData();
}

// Enable editing mode for search phrases
async function enableSearchEditing() {
  if (!currentUser) return;
  const docRef = doc(db, "users", currentUser.uid);
  await setDoc(docRef, { search_phrases_greyed: false }, { merge: true });
  setPhrasesDisabled(false);
  await loadUserData();
}

// Save OCR phrases comma separated
async function saveOcrPhrases() {
  if (!currentUser) return;
  const terms = ocrPhrasesTextarea.value.split(/[, ]+/).map(t => t.trim()).filter(Boolean);
  const docRef = doc(db, "users", currentUser.uid);
  await setDoc(docRef, { ocr_terms: terms }, { merge: true });
}

// Save filler dictionary in chunks due to Firestore limits
async function saveFillerDictionary() {
  if (!currentUser) return;
  const words = fillerDictTextarea.value.split(",").map(w => w.trim()).filter(Boolean);
  cachedFillerWords = words;

  const MAX_CHUNK = 300;
  const docRef = doc(db, "users", currentUser.uid);
  for (let i = 0; i < words.length; i += MAX_CHUNK) {
    const chunk = words.slice(i, i + MAX_CHUNK);
    await setDoc(docRef, { [`filler_phrases_${i / MAX_CHUNK}`]: chunk }, { merge: true });
  }

  alert("Filler dictionary saved!");
}

// Save user preferences including filler phrases toggle
async function savePreferences() {
  if (!currentUser) return;
  const docRef = doc(db, "users", currentUser.uid);
  await setDoc(docRef, {
    date_range: {
      from: dateFromInput.value.trim(),
      to: dateToInput.value.trim()
    },
    video_short: videoShortCheckbox.checked,
    video_medium: videoMediumCheckbox.checked,
    video_long: videoLongCheckbox.checked,
    age_restricted: ageRestrictedCheckbox.checked,
    use_filler_phrases: useFillerCheckbox.checked
  }, { merge: true });
}

// --- API call to backend via CORS proxy ---
async function runScheduledSearch() {
  if (!currentUser) return;

  runStatusEl.textContent = "Running...";
  try {
    const idToken = await currentUser.getIdToken();

    const response = await fetch(proxiedBackendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken
      },
      body: JSON.stringify({ user_id: currentUser.uid })
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      runStatusEl.textContent = `Error: ${errorJson.error || response.statusText}`;
      return;
    }
    const data = await response.json();
    runStatusEl.textContent = `Search complete: ${data.hits_count} hits. Tokens left: ${data.tokens_remaining}`;

    await loadUserData();
  } catch (err) {
    runStatusEl.textContent = `Failed: ${err.message}`;
  }

  setTimeout(() => { runStatusEl.textContent = ""; }, 10000);
}








