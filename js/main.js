window.onload = function () {
  // --- Firebase config (replace with yours) ---
  const firebaseConfig = {
    apiKey: "AIzaSyCBbIZ3uvV0DZCsZebMdd9bwhpDUQ5ZWXY",
    authDomain: "yearchrawlv001.firebaseapp.com",
    projectId: "yearchrawlv001",
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let user = null;
  let phrasesGreyed = false;
  let cachedFillerDict = [];

  // Utility to chunk an array into smaller arrays
  const MAX_CHUNK_SIZE = 300;
  function chunkArray(arr, chunkSize) {
    let chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Upload filler dict chunks sequentially to Firestore
  async function uploadFillerChunks(userId, words) {
    let chunks = chunkArray(words, MAX_CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      let field = `filler_phrases_${i}`;
      let data = { [field]: chunks[i] };
      await db.collection("users").doc(userId).set(data, { merge: true });
    }
  }

  // Load and combine all filler dict chunks from Firestore
  async function loadFillerDict(userId) {
    let doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return [];
    let data = doc.data();
    let combined = [];
    for (let key in data) {
      if (key.startsWith("filler_phrases_") && Array.isArray(data[key])) {
        combined = combined.concat(data[key]);
      }
    }
    return combined;
  }

  function show(viewId) {
    document.getElementById("login-view").style.display =
      viewId === "login" ? "block" : "none";
    document.getElementById("main-menu").style.display =
      viewId === "main" ? "block" : "none";
  }

  function updateUserUI(u) {
    document.getElementById("user-email").textContent = u.email;
  }

  auth.onAuthStateChanged(function (u) {
    user = u;
    if (u) {
      show("main");
      updateUserUI(u);
      loadUserData();
    } else {
      show("login");
    }
  });

  document.getElementById("signin-btn").onclick = function () {
    let provider = new firebase.auth.GoogleAuthProvider();
    auth
      .signInWithPopup(provider)
      .catch((err) => alert("Sign-in error: " + err.message));
  };

  document.getElementById("signout-btn").onclick = function () {
    auth.signOut();
  };

  function buildSearchPhraseInputs(phrases) {
    let list = document.getElementById("search-phrase-list");
    list.innerHTML = "";
    for (let i = 0; i < 20; i++) {
      let val = phrases[i] || "";
      let box = document.createElement("input");
      box.type = "text";
      box.className = "form-control mb-1 search-box";
      box.value = val;
      box.placeholder = "Search phrase";
      box.disabled = phrasesGreyed;
      if (phrasesGreyed) box.classList.add("greyed");
      list.appendChild(box);
    }
  }

  function setPhraseGreyState(greyed) {
    let boxes = document.querySelectorAll("#search-phrase-list input");
    boxes.forEach((box) => {
      box.disabled = greyed;
      box.classList.toggle("greyed", greyed);
    });
    phrasesGreyed = greyed;
  }

  function fillPhrases(userPhrases) {
    let phrases = Array.isArray(userPhrases) ? userPhrases.slice(0) : [];
    phrases = phrases.filter((p) => !/^\d{8}$/.test(p));
    let combos = fillerPhraseCombinations(cachedFillerDict);
    while (phrases.length < 20 && combos.length) {
      // Randomly select filler combo
      let idx = Math.floor(Math.random() * combos.length);
      phrases.push(combos.splice(idx, 1)[0]);
    }
    return phrases;
  }

  function fillerPhraseCombinations(words) {
    let result = [];
    for (let i = 0; i < words.length; i++) {
      for (let j = 0; j < words.length; j++) {
        if (i === j) continue;
        result.push(words[i] + " " + words[j]);
        for (let k = 0; k < words.length; k++) {
          if (k === i || k === j) continue;
          result.push(words[i] + " " + words[j] + " " + words[k]);
        }
      }
    }
    return [...new Set(result)];
  }

  // --- User data load/save ---
  async function loadUserData() {
    let doc = await db.collection("users").doc(user.uid).get();
    let data = doc.exists ? doc.data() : {};
    // Load filler dict chunks and combine
    cachedFillerDict = await loadFillerDict(user.uid);

    let phrases = Array.isArray(data.search_phrases)
      ? data.search_phrases.slice(0, 20)
      : [];
    buildSearchPhraseInputs(phrases);
    phrasesGreyed = !!data.search_phrases_greyed;
    setPhraseGreyState(phrasesGreyed);

    // Preferences
    document.getElementById("video-short").checked = data.video_short || false;
    document.getElementById("video-medium").checked = data.video_medium || false;
    document.getElementById("video-long").checked = data.video_long || false;
    document.getElementById("age-restricted").checked = data.age_restricted || false;
    document.getElementById("date-from").value = data.date_range?.from || "";
    document.getElementById("date-to").value = data.date_range?.to || "";
    document.getElementById("ocr-phrases").value = (
      Array.isArray(data.ocr_terms) ? data.ocr_terms : []
    ).join(", ");

    document.getElementById("filler-dict").value = cachedFillerDict.join(", ");

    updateTokenCount(data.api_tokens_remaining);
    renderHitList(data.daily_hits || []);
  }

  // --- Save phrases ---
  document.getElementById("save-phrases-btn").onclick = async function () {
    let boxes = document.querySelectorAll("#search-phrase-list input");
    let phrases = [];
    boxes.forEach((box) => {
      let val = box.value.trim();
      if (val) phrases.push(val);
    });
    let phrasesToSave = fillPhrases(phrases);
    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          search_phrases: phrasesToSave,
          search_phrases_greyed: true,
        },
        { merge: true }
      );
    setPhraseGreyState(true);
    loadUserData();
  };
  document.getElementById("edit-phrases-btn").onclick = async function () {
    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          search_phrases_greyed: false,
        },
        { merge: true }
      );
    setPhraseGreyState(false);
    loadUserData();
  };

  // --- OCR phrases ---
  document.getElementById("save-ocr-btn").onclick = async function () {
    let txt = document.getElementById("ocr-phrases").value;
    let terms = txt.split(",").map((t) => t.trim()).filter((t) => t.length);
    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          ocr_terms: terms,
        },
        { merge: true }
      );
  };

  // --- Preferences ---
  [
    "video-short",
    "video-medium",
    "video-long",
    "age-restricted",
    "date-from",
    "date-to",
  ].forEach((id) => {
    document.getElementById(id).onchange = async function () {
      await db
        .collection("users")
        .doc(user.uid)
        .set(
          {
            video_short: document.getElementById("video-short").checked,
            video_medium: document.getElementById("video-medium").checked,
            video_long: document.getElementById("video-long").checked,
            age_restricted: document.getElementById("age-restricted").checked,
            date_range: {
              from: document.getElementById("date-from").value.trim(),
              to: document.getElementById("date-to").value.trim(),
            },
          },
          { merge: true }
        );
    };
  });

  // --- Filler phrase management ---
  document.getElementById("save-filler-btn").onclick = async function () {
    let words = document
      .getElementById("filler-dict")
      .value.split(",")
      .map((w) => w.trim())
      .filter((w) => w);
    try {
      await uploadFillerChunks(user.uid, words);
      cachedFillerDict = words;
      document.getElementById("filler-status").textContent = "Saved!";
      setTimeout(() => (document.getElementById("filler-status").textContent = ""), 2000);
    } catch (e) {
      alert("Error saving filler dictionary: " + e.message);
    }
  };
  document.getElementById("account-btn").onclick = function () {
    document.getElementById("modal-filler-dict").value = cachedFillerDict.join(
      ", "
    );
  };
  document.getElementById("modal-filler-save").onclick = async function () {
    let words = document
      .getElementById("modal-filler-dict")
      .value.split(",")
      .map((w) => w.trim())
      .filter((w) => w);
    try {
      await uploadFillerChunks(user.uid, words);
      cachedFillerDict = words;
      document.getElementById("modal-filler-status").textContent = "Updated!";
      setTimeout(
        () => (document.getElementById("modal-filler-status").textContent = ""),
        2000
      );
      document.getElementById("filler-dict").value = words.join(", ");
    } catch (e) {
      alert("Error updating filler dictionary: " + e.message);
    }
  };

  // --- Hit List ---
  function renderHitList(hits) {
    let list = document.getElementById("hit-list");
    if (!hits || hits.length === 0) {
      list.textContent = "No hits today.";
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

  // --- Update the YouTube API tokens live count ---
  function updateTokenCount(count) {
    document.getElementById("token-count").textContent = count ?? "—";
  }

  // --- Manual backend execution trigger ---
  document.getElementById("run-scheduled-btn").onclick = async function () {
    const statusSpan = document.getElementById("run-scheduled-status");
    statusSpan.textContent = "Running...";
    try {
      const functionUrl =
        "https://us-central1-yearchrawlv001.cloudfunctions.net/scheduled_youtube_search";
      let token = user ? await user.getIdToken() : null;

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: token ? "Bearer " + token : "",
        },
      });

      if (response.ok) {
        statusSpan.textContent = "Scheduled search triggered successfully.";
      } else {
        statusSpan.textContent = `Error: ${response.statusText}`;
      }
    } catch (err) {
      statusSpan.textContent = `Request failed: ${err.message}`;
    }

    // Clear status after 10 seconds
    setTimeout(() => {
      statusSpan.textContent = "";
    }, 10000);
  };
};







