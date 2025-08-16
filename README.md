# YouTube OCR Daily Search Front-End

## 1. Project Setup

- Ensure you've deployed your backend to Google Cloud Functions/Firestore and completed Firebase Auth setup.
- Replace `firebaseConfig` in `main.js` with your values from Firebase project settings.
- Ensure CORS is set for your GitHub Pages domain on your backend functions.

## 2. Deploy to GitHub Pages

- Place all files (`index.html`, `main.js`, `style.css`) in your project root or `/docs` directory in your repo.
- Commit/push to `main` or `gh-pages` branch.
- Enable GitHub Pages for your repo as per the [docs](https://pages.github.com/).
- Use your published GitHub Pages URL as the app access point.

## 3. Customization and Notes

- If you move/rename JS or CSS files, update references in `index.html`.
- Backend endpoints and Firestore must match your Cloud/GCP deployment.
- Supports mobile, tablets, and desktops.
