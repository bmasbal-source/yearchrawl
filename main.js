// ------------ Firebase + Firestore + Auth -----------------

// Paste your actual Firebase config here:
const firebaseConfig = {
  apiKey: 'AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY',
  authDomain: 'yearchrawlv001.firebaseapp.com',
  projectId: 'yearchrawlv001',
  // ...other config fields
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;

// Utility: Generate input fields for up to maxItems
function buildInputList(domID, values, placeholder, maxItems) {
  let html = '';
  for (let i = 0; i < values.length; i++)
    html += `<input class="form-control mb-1" type="text" value="${values[i]}" data-idx="${i}" ${i<values.length-1?'readonly disabled':''} maxlength="100">`;
  // If fewer than max, add an empty
  if (values.length < maxItems)
    html += `<input class="form-control mb-1" type="text" value="" data-idx="${values.length}" maxlength="100">`;
  $(domID).html(html);
}

// Display daily hits (videoIDs, terms, likelihood)
function displayHits(hits) {
  if (!hits || !hits.length) {
    $('#daily-hits').text('No hits today.');
    return;
  }
  let html = '<ul class="list-group">';
  hits.forEach(hit => {
    html += `<li class="list-group-item">
      <span class="fw-semibold">ID:</span> ${hit.videoID} 
      <span class="ms-2 text-success">${hit.term}</span>
      <span class="ms-2">(${hit.likelihood})</span>
      <a href="https://youtube.com/watch?v=${hit.videoID}" class="ms-2" target="_blank">View</a>
    </li>`;
  });
  html += '</ul>';
  $('#daily-hits').html(html);
}

function showUserPanel(user) {
  currentUser = user;
  $('#main-panel').show();
  $('#auth-panel').html(`<span class="me-2">Logged in as ${user.email}</span>
    <button class="btn btn-outline-secondary btn-sm" id="logout-btn">Sign Out</button>`);
}

function showSignIn() {
  $('#main-panel').hide();
  $('#auth-panel').html('<button class="btn btn-primary" id="login-btn">Sign in with Google</button>');
}

// ----------- Auth UI Handlers ---------------

$(document).on('click', '#login-btn', function() {
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .catch(e => alert('Login failed: '+e.message));
});
$(document).on('click', '#logout-btn', function() {
  auth.signOut();
});

// ----------- Dynamic Fields UI Logic -------------

let searchPhrases = [""];
let ocrTerms = [""];

function refreshInputs() {
  buildInputList('#search-phrases-list', searchPhrases, "Search phrase", 20);
  buildInputList('#ocr-terms-list', ocrTerms, "OCR term", 100);
}

// Limit and add phrase/term on button click
$(document).on('input', '#search-phrases-list input', function() {
  let idx = $(this).data('idx');
  searchPhrases[idx] = $(this).val();
  if (idx===searchPhrases.length-1 && searchPhrases.length<20 && $(this).val().trim())
    searchPhrases.push("");
  refreshInputs();
});
$(document).on('input', '#ocr-terms-list input', function() {
  let idx = $(this).data('idx');
  ocrTerms[idx] = $(this).val();
  if (idx===ocrTerms.length-1 && ocrTerms.length<100 && $(this).val().trim())
    ocrTerms.push("");
  refreshInputs();
});

// Add buttons convenience
$('#add-search-phrase-btn').click(function(){
  if (searchPhrases.length<20) searchPhrases.push(""); refreshInputs();
});
$('#add-ocr-term-btn').click(function(){
  if (ocrTerms.length<100) ocrTerms.push(""); refreshInputs();
});

// ------------ Save Form / Firestore ---------------
$('#main-form').on('submit', function(e){
  e.preventDefault();
  // Clean values: drop trailing blanks
  let sp = searchPhrases.filter(x=>x.trim()).slice(0,20);
  let ot = ocrTerms.filter(x=>x.trim()).slice(0,100);
  let settings = {
    search_phrases: sp,
    ocr_terms: ot,
    date_range: {
      from: $('#date-from').val(),
      to: $('#date-to').val()
    },
    video_length: $('#video-length').val(),
    view_limit: $('#view-limit').val(),
    age_restricted: $('#age-restricted').is(':checked')
  };
  if (!sp.length || !ot.length || !settings.date_range.from || !settings.date_range.to) {
    alert('Fill in all required fields.');
    return false;
  }
  db.collection('users').doc(currentUser.uid).set(settings, {merge:true})
    .then(()=>alert('Settings saved!'))
    .catch(e=>alert('Error saving: '+e.message));
});

// ----------- Live Monitor + Daily Hits ----------
function fetchLiveMonitor() {
  db.collection('users').doc(currentUser.uid).get().then(doc=>{
    let d = doc.data()||{};
    $('#token-count').text(
      typeof d.api_tokens_remaining === "undefined" ? "–" : d.api_tokens_remaining
    );
    $('#cloud-calls').text("–"); // Can update with API if available
    $('#memory-usage').text(
      typeof d.memory_usage === "undefined" ? "–" : d.memory_usage
    );
    displayHits(d.daily_hits || []);
  });
}

// -------- Initial Auth and Form Load ------------
auth.onAuthStateChanged(function(user) {
  if (!user) {
    showSignIn();
    return;
  }
  showUserPanel(user);
  currentUser = user;
  db.collection('users').doc(user.uid).get().then(doc => {
    let d = doc.data();
    searchPhrases = d?.search_phrases?.concat("") || [""];
    ocrTerms = d?.ocr_terms?.concat("") || [""];
    $('#date-from').val(d?.date_range?.from||"");
    $('#date-to').val(d?.date_range?.to||"");
    $('#video-length').val(d?.video_length||"any");
    $('#view-limit').val(d?.view_limit||"none");
    $('#age-restricted').prop('checked', !!d?.age_restricted);
    refreshInputs();
    fetchLiveMonitor();
  });
});

// Poll live stats every 30s
setInterval(function(){
  if (currentUser) fetchLiveMonitor();
}, 30000);

$(function(){ refreshInputs(); });

