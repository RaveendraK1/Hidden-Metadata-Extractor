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
  return `{
${Object.entries(raw)
    .map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`)
    .join(',\n')}
}`;
}

function renderResult(data) {
  results.innerHTML = `
    <div class="card">
      <h2>Analysis Result</h2>
      <div class="grid">
        <div class="meta-item"><strong>File</strong><span>${data.fileName}</span></div>
        <div class="meta-item"><strong>Type</strong><span>${data.fileType}</span></div>
        <div class="meta-item"><strong>Size</strong><span>${(data.size / 1024).toFixed(1)} KB</span></div>
        <div class="meta-item"><strong>Device</strong><span>${data.device}</span></div>
        <div class="meta-item"><strong>Captured</strong><span>${data.timestamp}</span></div>
        <div class="meta-item"><strong>Edited?</strong><span>${data.edited ? 'Likely yes' : 'No clear edit evidence'}</span></div>
        <div class="meta-item"><strong>Location</strong><span>${data.location ? `${data.location.latitude}, ${data.location.longitude}` : 'No GPS metadata found'}</span></div>
      </div>
    </div>
      // Raw metadata section removed per user request

  `;
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
