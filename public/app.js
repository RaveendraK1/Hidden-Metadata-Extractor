const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const statusBox = document.getElementById('statusBox');
const results = document.getElementById('results');

function setStatus(message, error = false) {
  statusBox.textContent = message;
  statusBox.style.color = error ? '#ffb3b3' : '#a6b5db';
}

function renderRawMetadata(raw) {
  return `<pre><code>{
${Object.entries(raw)
    .map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`)
    .join(',\n')}
}</code></pre>`;
}

function createSection(title, dataObj) {
  if (!dataObj || Object.keys(dataObj).length === 0) return '';
  const items = Object.entries(dataObj)
    .filter(([_, val]) => val !== null && val !== undefined && val !== '')
    .map(([key, val]) => `<div class="meta-item"><strong>${key}</strong><span>${val}</span></div>`)
    .join('');
  
  if (!items) return '';

  return `
    <div class="card" style="margin-top: 20px;">
      <h2>${title}</h2>
      <div class="grid">
        ${items}
      </div>
    </div>
  `;
}

function renderResult(data) {
  let html = `
    <div class="card">
      <h2>Basic Analysis Result</h2>
      <div class="grid">
        <div class="meta-item"><strong>File Name</strong><span>${data.fileName}</span></div>
        <div class="meta-item"><strong>Type</strong><span>${data.fileType}</span></div>
        <div class="meta-item"><strong>Size</strong><span>${(data.size / 1024).toFixed(1)} KB</span></div>
        <div class="meta-item"><strong>Guessed Device</strong><span>${data.device}</span></div>
        <div class="meta-item"><strong>Make</strong><span>${data.make || 'Unknown'}</span></div>
        <div class="meta-item"><strong>Model</strong><span>${data.model || 'Unknown'}</span></div>
        <div class="meta-item"><strong>Software</strong><span>${data.software || 'Unknown'}</span></div>
        <div class="meta-item"><strong>Best Timestamp</strong><span>${data.timestamp || 'Unknown'}</span></div>
        <div class="meta-item"><strong>Edited?</strong><span>${data.edited ? 'Likely yes' : 'No clear edit evidence'}</span></div>
      </div>
    </div>
  `;

  if (data.editReasons && data.editReasons.length > 0) {
      html += `
        <div class="card" style="margin-top: 20px;">
          <h2>Edit Evidence Found</h2>
          <ul style="color: #ffb3b3; margin: 0; padding-left: 20px; font-weight: bold;">
            ${data.editReasons.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      `;
  }

  if (data.location) {
      html += `
        <div class="card" style="margin-top: 20px;">
          <h2>Location Information</h2>
          <div class="grid">
             <div class="meta-item"><strong>Coordinates</strong><span>${data.location.latitude}, ${data.location.longitude}</span></div>
             ${data.location.mapsUrl ? `<div class="meta-item" style="grid-column: 1 / -1;"><a href="${data.location.mapsUrl}" target="_blank" style="color:#8ab4ff;">Open in Google Maps</a></div>` : ''}
          </div>
        </div>
      `;
      html += createSection('More Location Data', data.location);
  } else {
      html += `
        <div class="card" style="margin-top: 20px;">
          <h2>Location Information</h2>
          <p style="color: #a6b5db;">No GPS metadata found.</p>
        </div>
      `;
  }

  html += createSection('All Dates Found', data.allDates);
  html += createSection('Camera Settings', data.camera);
  html += createSection('Image Properties', data.image);
  html += createSection('Author Information', data.author);

  if (data.raw) {
      html += `
        <div class="card" style="margin-top: 20px;">
          <h2>Raw Metadata</h2>
          ${renderRawMetadata(data.raw)}
        </div>
      `;
  }

  results.innerHTML = html;
}

function handleError(message) {
  setStatus(message, true);
  results.innerHTML = '';
}

async function analyzeFile(file) {
  setStatus('Analyzing metadata…');
  results.innerHTML = '';

  const formData = new FormData();
  formData.append('media', file);

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error || 'Server returned an error.');
    }

    const data = await response.json();
    renderResult(data);
    setStatus('Metadata extracted successfully. Scroll below for full details.');
  } catch (error) {
    console.error(error);
    handleError('Unable to extract metadata. Please try a different file.');
  }
}

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (file) analyzeFile(file);
});

dropZone.addEventListener('dragover', event => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  if (file) analyzeFile(file);
});
