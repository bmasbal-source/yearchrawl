const firebaseConfig = {
  apiKey: 'AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY',
  authDomain: 'yearchrawlv001.firebaseapp.com',
  projectId: 'yearchrawlv001',
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;

function buildInputList(domID, values, maxItems) {
  let html = '';
  for (let i = 0; i < values.length; i++) {
    const valEscaped = $('<div>').text(values[i]).html();
    html += `<input class="form-control mb-1" type="text" value="${valEscaped}" data-idx="${i}" maxlength="100" />`;
  }
  if (values.length < maxItems) {
    html += `<input class="form-control mb-1" type="text" value="" data-idx="${values.length}" maxlength="100" />`;
  }
  $(domID).html(html);
}

function displayHits(hits) {
  if (!hits || !hits.length) {
    $('#daily-hits').text('No hits today.');
    return;
  }
  let html = '<ul class="list-group">';
  hits.forEach((hit) => {
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
  $('#auth-panel').html(
    `<span class="me-2">Logged in as ${user.email}</span>
    <button class="btn btn-outline-secondary btn-sm" id="logout-btn">Sign Out</button>`
  );
}

function showSignIn() {
  $('#main-panel').hide();
  $('#auth-panel').html('<button class="btn btn-primary" id="login-btn">Sign in with Google</button>');
}

$(document).on('click', '#login-btn', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((e) => alert('Login failed: ' + e.message));
});
$(document).on('click', '#logout-btn', () => {
  auth.signOut();
});

let searchPhrases = [''];
let ocrTerms = [''];

// Generate all 2-word and 3-word combinations (all permutations)
function generateCombinations(words) {
  const phrasesSet = new Set();
  for (let i = 0; i < words.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (i !== j) {
        phrasesSet.add(words[i] + ' ' + words[j]);
      }
    }
  }
  for (let i = 0; i < words.length; i++) {
    for (let j = 0; j < words.length; j++) {
      for (let k = 0; k < words.length; k++) {
        if (i !== j && j !== k && i !== k) {
          phrasesSet.add(words[i] + ' ' + words[j] + ' ' + words[k]);
        }
      }
    }
  }
  return Array.from(phrasesSet);
}

async function checkAndGenerateFillerPhrases() {
  const fillerPhrasesCollection = db.collection('filler_phrases');
  const fillerSnapshot = await fillerPhrasesCollection.limit(1).get();

  if (fillerSnapshot.empty) {
    let fillerWordsInput = prompt(
      "Welcome! Please enter a space-separated list of filler words to generate 2- and 3-word phrases:"
    );
    if (fillerWordsInput) {
      const fillerWords = fillerWordsInput.trim().split(/\s+/);
      const generatedPhrases = generateCombinations(fillerWords);

      const chunkSize = 400;
      for (let i = 0; i < generatedPhrases.length; i += chunkSize) {
        const batch = db.batch();
        const chunk = generatedPhrases.slice(i, i + chunkSize);
        chunk.forEach((phrase) => {
          const docRef = fillerPhrasesCollection.doc();
          batch.set(docRef, { phrase });
        });
        await batch.commit();
      }
      alert(`${generatedPhrases.length} filler phrases generated and stored.`);
    } else {
      alert("No filler words entered. Default fallback phrases won't be available.");
    }
  }
}

function refreshInputs() {
  buildInputList('#search-phrases-list', searchPhrases, 20);
  buildInputList('#ocr-terms-list', ocrTerms, 100);
}

$(document).on('input', '#search-phrases-list input', function () {
  const idx = $(this).data('idx');
  searchPhrases[idx] = $(this).val();
  if (idx === searchPhrases.length - 1 && searchPhrases.length < 20 && $(this).val().trim()) {
    searchPhrases.push('');
  }
  refreshInputs();
});
$(document).on('input', '#ocr-terms-list input', function () {
  const idx = $(this).data('idx');
  ocrTerms[idx] = $(this).val();
  if (idx === ocrTerms.length - 1 && ocrTerms.length < 100 && $(this).val().trim()) {
    ocrTerms.push('');
  }
  refreshInputs();
});

$('#add-search-phrase-btn').click(() => {
  if (searchPhrases.length < 20) {
    searchPhrases.push('');
    refreshInputs();
  }
});
$('#add-ocr-term-btn').click(() => {
  if (ocrTerms.length < 100) {
    ocrTerms.push('');
    refreshInputs();
  }
});

$('#main-form').on('submit', function (e) {
  e.preventDefault();
  const sp = searchPhrases.filter((x) => x.trim()).slice(0, 20);
  const ot = ocrTerms.filter((x) => x.trim()).slice(0, 100);
  const settings = {
    search_phrases: sp,
    ocr_terms: ot,
    date_range: {
      from: $('#date-from').val(),
      to: $('#date-to').val(),
    },
    video_length: $('#video-length').val(),
    view_limit: $('#view-limit').val(),
    age_restricted: $('#age-restricted').is(':checked'),
    sort_by: $('#sort-by').val(),
  };
  if (!sp.length || !ot.length || !settings.date_range.from || !settings.date_range.to) {
    alert('Fill in all required fields.');
    return false;
  }
  db.collection('users')
    .doc(currentUser.uid)
    .set(settings, { merge: true })
    .then(() => alert('Settings saved!'))
    .catch((e) => alert('Error saving: ' + e.message));
});

function fetchLiveMonitor() {
  db.collection('users')
    .doc(currentUser.uid)
    .get()
    .then((doc) => {
      const d = doc.data() || {};
      $('#token-count').text(d.api_tokens_remaining === undefined ? '–' : d.api_tokens_remaining);
      $('#cloud-calls').text('–');
      $('#memory-usage').text(d.memory_usage === undefined ? '–' : d.memory_usage);
      displayHits(d.daily_hits || []);
    });
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showSignIn();
    return;
  }
  currentUser = user;

  // Prompt for filler words if needed
  await checkAndGenerateFillerPhrases();

  showUserPanel(user);
  const userDoc = await db.collection('users').doc(user.uid).get();
  const d = userDoc.data();
  searchPhrases = (d?.search_phrases?.concat('')) || [''];
  ocrTerms = (d?.ocr_terms?.concat('')) || [''];
  $('#date-from').val(d?.date_range?.from || '');
  $('#date-to').val(d?.date_range?.to || '');
  $('#video-length').val(d?.video_length || 'any');
  $('#view-limit').val(d?.view_limit || 'none');
  $('#age-restricted').prop('checked', !!d?.age_restricted);
  $('#sort-by').val(d?.sort_by || 'relevance');
  refreshInputs();
  fetchLiveMonitor();
});

setInterval(() => {
  if (currentUser) fetchLiveMonitor();
}, 30000);

$(function () {
  refreshInputs();
});
