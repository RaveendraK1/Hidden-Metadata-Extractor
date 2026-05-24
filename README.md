# Hidden Metadata Extractor

A web app for extracting hidden image and video metadata for digital forensics, now with a modern glass‑morphism UI and smooth animations.

## Features
- Drag‑and‑drop or browse file upload
- Extract device model, capture timestamp, GPS location, and raw metadata
- Detect likely edits using metadata clues
- **New UI**: gradient background, glass‑morphism cards, hover scaling, fade‑in animations, responsive layout
- Clean, responsive UI for fast forensic review

## Setup & Run
1. Open a terminal in `d:\Hidden Metadata Extractor`
2. Install dependencies (if not done): `npm install`
3. Start the server: `node server.js`
   - The server runs at `http://localhost:3000`
4. Open the URL in a browser to see the updated interface.

## Usage
- Click **Choose a file** or drag a file into the drop zone.
- The app will display extracted metadata in a glass‑styled card.
- The raw metadata object is hidden by default for a cleaner view.

## Notes
- This app uses `exiftool-vendored` to analyze metadata.
- For videos, the backend can inspect container and track metadata.
- Edited detection is heuristic‑based and looks for software/process tags plus modification timestamps.
