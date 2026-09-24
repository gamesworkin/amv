/* =======================================================
   AMV Converter - motor de conversão 100% client-side
   FFmpeg.wasm 0.12 (core single-thread: NÃO exige
   SharedArrayBuffer, funciona no GitHub Pages)
   ======================================================= */

const FFMPEG_VER = '0.12.10';
const CORE_VER = '0.12.6';
const BASE_FF = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VER}/dist/umd`;
const BASE_CORE = `https://unpkg.com/@ffmpeg/core@${CORE_VER}/dist/esm`;

const { FFmpeg } = FFmpegWASM;
const { fetchFile, toBlobURL } = FFmpegUtil;

const ffmpeg = new FFmpeg();

let selectedFile = null;
let isFFmpegReady = false;
let isLoading = false;
let isConverting = false;
let lastUrl = null;
let durationSec = 0;

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameSpan = document.getElementById('fileName');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const resultContainer = document.getElementById('resultContainer');
const downloadLink = document.getElementById('downloadLink');
const logBox = document.getElementById('logBox');

/* ---------- helpers ---------- */
function setStatus(msg) {
  progressContainer.style.display = 'block';
  statusText.innerText = msg;
}
function setProgress(p) {
  progressBar.style.width = Math.max(0, Math.min(100, p)) + '%';
}
function log(line) {
  if (!logBox) return;
  logBox.style.display = 'block';
  logBox.textContent += line + '\n';
  logBox.scrollTop = logBox.scrollHeight;
}
function updateButton() {
  convertBtn.disabled = !(selectedFile && isFFmpegReady && !isConverting);
  if (isConverting) convertBtn.innerText = 'Convertendo...';
  else if (!isFFmpegReady) convertBtn.innerText = 'Carregando motor...';
  else convertBtn.innerText = 'Converter para .AMV';
}

/* ---------- seleção de arquivo ---------- */
dropZone.addEventListener('click', () => fileInput.click());
['dragover', 'dragenter'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  })
);
['dragleave', 'dragend'].forEach((ev) =>
  dropZone.addEventListener(ev, () => dropZone.classList.remove('dragging'))
);
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  if (e.dataTransfer.files && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file) return;
  if (file.size > 400 * 1024 * 1024) {
    alert('Arquivo muito grande para o navegador (limite prático: 400 MB). Corte o vídeo antes.');
    return;
  }
  selectedFile = file;
  fileNameSpan.innerText = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  fileInfo.style.display = 'block';
  resultContainer.style.display = 'none';
  durationSec = 0;
  updateButton();
}

/* ---------- carregamento do FFmpeg ---------- */
ffmpeg.on('log', ({ message }) => {
  log(message);
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(message);
  if (m) durationSec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  const t = /time=\s*(\d+):(\d+):(\d+\.\d+)/.exec(message);
  if (t && durationSec > 0 && isConverting) {
    const cur = (+t[1]) * 3600 + (+t[2]) * 60 + parseFloat(t[3]);
    const pct = 10 + Math.round((cur / durationSec) * 85);
    setProgress(pct);
    setStatus(`Convertendo vídeo... (${Math.min(99, pct)}%)`);
  }
});

ffmpeg.on('progress', ({ progress }) => {
  if (!isConverting || durationSec > 0) return;
  const pct = 10 + Math.round(progress * 85);
  setProgress(pct);
  setStatus(`Convertendo vídeo... (${Math.min(99, pct)}%)`);
});

async function initFFmpeg() {
  if (isFFmpegReady || isLoading) return isFFmpegReady;
  isLoading = true;
  updateButton();
  try {
    setStatus('Carregando motor de conversão (alguns segundos na primeira vez)...');
    setProgress(5);
    await ffmpeg.load({
      coreURL: `${BASE_CORE}/ffmpeg-core.js`,
      wasmURL: `${BASE_CORE}/ffmpeg-core.wasm`,
      classWorkerURL: await toBlobURL(`${BASE_FF}/814.ffmpeg.js`, 'text/javascript'),
    });
    isFFmpegReady = true;
    setStatus('Motor pronto. Selecione um vídeo e clique em Converter.');
    setProgress(0);
  } catch (err) {
    console.error(err);
    setStatus('Não foi possível carregar o motor de conversão. Verifique sua conexão e recarregue a página.');
  } finally {
    isLoading = false;
    updateButton();
  }
  return isFFmpegReady;
}

window.addEventListener('DOMContentLoaded', () => {
  updateButton();
  setTimeout(initFFmpeg, 300);
});

/* ---------- conversão ---------- */
convertBtn.addEventListener('click', async () => {
  if (!selectedFile || isConverting) return;
  if (!isFFmpegReady && !(await initFFmpeg())) return;

  isConverting = true;
  updateButton();
  resultContainer.style.display = 'none';
  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }
  setProgress(5);
  setStatus('Lendo arquivo...');

  const dot = selectedFile.name.lastIndexOf('.');
  const ext = dot > -1 ? selectedFile.name.slice(dot) : '.mp4';
  const inputName = 'input' + ext.toLowerCase();
  const outputName = 'output.amv';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

    const resolution = document.getElementById('resolution').value; // ex: 160x128
    const [w, h] = resolution.split('x').map(Number);
    const stretch = document.getElementById('aspect').value === 'stretch';
    const fps = document.getElementById('fps').value;
    const quality = document.getElementById('quality').value;

    // O codec AMV exige dimensões exatas; com "manter proporção" usamos padding.
    const vf = stretch
      ? `scale=${w}:${h},fps=${fps},format=yuvj420p`
      : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},format=yuvj420p`;

    setStatus('Convertendo vídeo...');
    setProgress(10);

    // AMV exige: áudio ADPCM mono a 22050 Hz e taxa de quadros que divida
    // 22050 exatamente (10, 14, 15, 18, 21, 25, 30) -> block_size = 22050/fps.
    const blockSize = Math.round(22050 / Number(fps));

    const args = [
      '-i', inputName,
      '-vf', vf,
      '-c:v', 'amv',
      '-q:v', quality,
      '-pix_fmt', 'yuvj420p',
      '-c:a', 'adpcm_ima_amv',
      '-ar', '22050',
      '-ac', '1',
      '-block_size', String(blockSize),
      '-f', 'amv',
      '-y', outputName,
    ];

    let code = await ffmpeg.exec(args);

    if (code !== 0) {
      // Fallback: alguns arquivos falham no mux AMV com áudio; tenta sem áudio.
      log('>> Tentando novamente sem áudio (fallback)...');
      setStatus('Ajustando parâmetros e tentando novamente...');
      code = await ffmpeg.exec([
        '-i', inputName,
        '-vf', vf,
        '-c:v', 'amv',
        '-q:v', '6',
        '-pix_fmt', 'yuvj420p',
        '-an',
        '-f', 'amv',
        '-y', outputName,
      ]);
    }

    if (code !== 0) throw new Error('FFmpeg retornou código ' + code);

    const data = await ffmpeg.readFile(outputName);
    if (!data || data.length === 0) throw new Error('Arquivo de saída vazio');

    const blob = new Blob([data.buffer], { type: 'video/x-amv' });
    lastUrl = URL.createObjectURL(blob);
    downloadLink.href = lastUrl;
    const baseName = dot > -1 ? selectedFile.name.slice(0, dot) : selectedFile.name;
    downloadLink.download = `${baseName}_player.amv`;
    document.getElementById('resultSize').innerText =
      `Tamanho final: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`;

    setProgress(100);
    setStatus('Conversão concluída!');
    progressContainer.style.display = 'none';
    resultContainer.style.display = 'block';
  } catch (error) {
    console.error(error);
    setStatus('Erro na conversão: ' + (error && error.message ? error.message : 'falha desconhecida') +
      '. Tente outro arquivo, uma resolução menor ou um vídeo mais curto.');
  } finally {
    // limpa a memória virtual para permitir novas conversões
    try { await ffmpeg.deleteFile(inputName); } catch (e) {}
    try { await ffmpeg.deleteFile(outputName); } catch (e) {}
    isConverting = false;
    updateButton();
  }
});
