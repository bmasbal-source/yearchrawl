// Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY",
  authDomain: "yearchrawlv001.firebaseapp.com",
  projectId: "yearchrawlv001",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let user = null;
let phrasesGreyed = false; // Track state of editable/search box
let cachedFillerDict = [];

function show(viewId) {
  document.getElementById('login-view').style.display = (viewId === 'login') ? 'block' : 'none';
  document.getElementById('main-menu').style.display = (viewId === 'main') ? 'block' : 'none';
}

function updateUserUI(u) {
  document.getElementById('user-email').textContent = u.email;
}

//-----------------------------------
// Auth Related
//-----------------------------------
auth.onAuthStateChanged(function(u) {
  user = u;
  if (u) {
    show('main');
    updateUserUI(u);
    loadUserData();
  } else {
    show('login');
  }
});

document.getElementById('signin-btn').onclick = () => {
  let provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
};

document.getElementById('signout-btn').onclick = () => {
  auth.signOut();
};

//-----------------------------------
// Load and Save User Data
//-----------------------------------
function loadUserData() {
  db.collection('users').doc(user.uid).get().then(doc => {
    let data = doc.exists ? doc.data() : {};
    // Search phrases
    let phrases = Array.isArray(data.search_phrases) ? data.search_phrases.slice(0, 20) : [];
    buildSearchPhraseInputs(phrases);
    phrasesGreyed = !!data.search_phrases_greyed;
    setPhraseGreyState(phrasesGreyed);

    // Preferences
    document.getElementById('video-short').checked = data.video_short || false;
    document.getElementById('video-medium').checked = data.video_medium || false;
    document.getElementById('video-long').checked = data.video_long || false;
    document.getElementById('age-restricted').checked = data.age_restricted || false;
    document.getElementById('date-from').value = data.date_range?.from || '';
    document.getElementById('date-to').value = data.date_range?.to || '';

    // OCR Phrases
    document.getElementById('ocr-phrases').value = (Array.isArray(data.ocr_terms) ? data.ocr_terms : []).join(', ');

    // Filler dict
    cachedFillerDict = Array.isArray(data.filler_phrases_dict) ? data.filler_phrases_dict : [];
    document.getElementById('filler-dict').value = cachedFillerDict.join(', ');

    updateTokenCount(data.api_tokens_remaining);
    renderHitList(data.daily_hits || []);
  });
}

function saveSearchPhrases() {
  let boxes = document.querySelectorAll('#search-phrase-list input');
  let phrases = [];
  boxes.forEach(box => {
    let val = box.value.trim();
    if (val) phrases.push(val);
  });
  // If user left slots empty, autopopulate with filler phrases
  let phrasesToSave = fillPhrases(phrases);
  db.collection('users').doc(user.uid).set({
    search_phrases: phrasesToSave,
    search_phrases_greyed: true
  }, { merge: true }).then(() => {
    setPhraseGreyState(true);
    loadUserData();
  });
}

function setPhraseGreyState(greyed) {
  let boxes = document.querySelectorAll('#search-phrase-list input');
  boxes.forEach(box => {
    box.disabled = greyed;
    box.classList.toggle('greyed', greyed);
  });
  phrasesGreyed = greyed;
}

function editSearchPhrases() {
  db.collection('users').doc(user.uid).set({
    search_phrases_greyed: false
  }, { merge: true }).then(() => {
    setPhraseGreyState(false);
    loadUserData();
  });
}

function buildSearchPhraseInputs(phrases) {
  let list = document.getElementById('search-phrase-list');
  list.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    let val = phrases[i] || '';
    let box = document.createElement('input');
    box.type = 'text';
    box.className = 'form-control mb-1 search-box';
    box.value = val;
    box.placeholder = 'Search phrase';
    list.appendChild(box);
  }
}

function saveOcrPhrases() {
  let txt = document.getElementById('ocr-phrases').value;
  let terms = txt.split(',').map(t => t.trim()).filter(t => t.length);
  db.collection('users').doc(user.uid).set({
    ocr_terms: terms
  }, { merge: true });
}

function savePreferences() {
  db.collection('users').doc(user.uid).set({
    video_short: document.getElementById('video-short').checked,
    video_medium: document.getElementById('video-medium').checked,
    video_long: document.getElementById('video-long').checked,
    age_restricted: document.getElementById('age-restricted').checked,
    date_range: {
      from: document.getElementById('date-from').value.trim(),
      to: document.getElementById('date-to').value.trim()
    }
  }, { merge: true });
}

//-----------------------------------
// Filler Phrase Management
//-----------------------------------
document.getElementById('save-filler-btn').onclick = function() {
  let words = document.getElementById('filler-dict').value.split(',').map(w => w.trim()).filter(w => w);
  db.collection('users').doc(user.uid).set({
    filler_phrases_dict: words
  }, { merge: true }).then(() => {
    cachedFillerDict = words;
    document.getElementById('filler-status').textContent = 'Saved!';
    setTimeout(() => document.getElementById('filler-status').textContent = '', 2000);
  });
};
// Account modal version
document.getElementById('modal-filler-save').onclick = function() {
  let words = document.getElementById('modal-filler-dict').value.split(',').map(w => w.trim()).filter(w => w);
  db.collection('users').doc(user.uid).set({
    filler_phrases_dict: words
  }, { merge: true }).then(() => {
    cachedFillerDict = words;
    document.getElementById('modal-filler-status').textContent = 'Updated!';
    setTimeout(() => document.getElementById('modal-filler-status').textContent = '', 2000);
    document.getElementById('filler-dict').value = words.join(', ');
  });
};

function fillPhrases(userPhrases) {
  let phrases = Array.isArray(userPhrases) ? userPhrases.slice(0)
    : [];
  // Remove any phrases recognized as a date (YYYYMMDD or similar)
  phrases = phrases.filter(p => !/^\d{8}$/.test(p));
  let combos = fillerPhraseCombinations(cachedFillerDict);
  while (phrases.length < 20 && combos.length) {
    // Randomly select and remove filler combo
    let idx = Math.floor(Math.random() * combos.length);
    phrases.push(combos.splice(idx, 1)[0]);
  }
  return phrases;
}

function fillerPhraseCombinations(words) {
  // All possible 2 and 3 word combos
  let result = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (i === j) continue;
      result.push(words[i] + ' ' + words[j]);
      for (let k = 0; k < words.length; k++) {
        if (k === i || k === j) continue;
        result.push(words[i] + ' ' + words[j] + ' ' + words[k]);
      }
    }
  }
  // Remove duplicates
  return [...new Set(result)];
}

//-----------------------------------
// Hit List & Live Stats
//-----------------------------------
function renderHitList(hits) {
  let list = document.getElementById('hit-list');
  if (!hits || hits.length === 0) {
    list.textContent = 'No hits today.';
    return;
  }
  let html = '<ul class="list-group">';
  for (let hit of hits) {
    html += `<li class="list-group-item">
      <b>${hit.videoID}</b> &nbsp;
      <span class="text-success">${hit.term}</span>
      <span>(${hit.likelihood})</span>
      <a href="https://youtube.com/watch?v=${hit.videoID}" target="_blank" style="margin-left:12px;">View</a>
    </li>`;
  }
  html += "</ul>";
  list.innerHTML = html;
}

function updateTokenCount(count) {
  document.getElementById('token-count').textContent = count ?? '—';
}

//-----------------------------------
// UI Buttons
//-----------------------------------
document.getElementById('save-phrases-btn').onclick = saveSearchPhrases;
document.getElementById('edit-phrases-btn').onclick = editSearchPhrases;
document.getElementById('save-ocr-btn').onclick = saveOcrPhrases;
document.getElementById('video-short').onchange = document.getElementById('video-medium').onchange =
document.getElementById('video-long').onchange = document.getElementById('age-restricted').onchange =
document.getElementById('date-from').onblur = document.getElementById('date-to').onblur = savePreferences;

// Account modal: populate filler dict textarea
document.getElementById('account-btn').onclick = function() {
  document.getElementById('modal-filler-dict').value = cachedFillerDict.join(', ');
};


