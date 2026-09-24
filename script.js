const { FFmpeg } = FFmpegWASM;
let ffmpeg = null;
let selectedFile = null;

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

// Eventos de Drag & Drop
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#2b62b3';
    dropZone.style.background = '#eef4fc';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#99b8e2';
    dropZone.style.background = '#f7faff';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#99b8e2';
    dropZone.style.background = '#f7faff';
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    selectedFile = file;
    fileNameSpan.innerText = file.name;
    fileInfo.style.display = 'block';
    convertBtn.removeAttribute('disabled');
    resultContainer.style.display = 'none';
}

// Inicializar FFmpeg.wasm ao carregar a página em background
async function initFFmpeg() {
    if (!ffmpeg) {
        try {
            ffmpeg = new FFmpeg();
            
            ffmpeg.on('log', ({ message }) => {
                console.log(message);
            });

            ffmpeg.on('progress', ({ progress }) => {
                const percent = Math.round(progress * 100);
                progressBar.style.width = percent + '%';
                statusText.innerText = `Convertendo arquivo para .AMV... (${percent}%)`;
            });

            await ffmpeg.load({
                coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
            });
            console.log("FFmpeg carregado com sucesso!");
        } catch (error) {
            console.error("Erro ao carregar FFmpeg:", error);
            statusText.innerText = "Erro ao carregar o motor de conversão.";
        }
    }
}

window.addEventListener('DOMContentLoaded', initFFmpeg);

// Processo de Conversão
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    if (!ffmpeg) {
        alert("O motor de conversão ainda está carregando. Aguarde alguns segundos.");
        return;
    }

    convertBtn.setAttribute('disabled', 'true');
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    progressBar.style.width = '0%';
    statusText.innerText = "Preparando arquivo para conversão...";

    try {
        // Ler arquivo enviado para a memória virtual do FFmpeg.wasm
        const fileData = await fetchFile(selectedFile);
        const inputName = 'input_video' + getFileExtension(selectedFile.name);
        const outputName = 'output.amv';

        await ffmpeg.writeFile(inputName, fileData);

        // Capturar opções selecionadas pelo usuário
        const resolution = document.getElementById('resolution').value; // ex: 160x128
        const aspect = document.getElementById('aspect').value;
        const fps = document.getElementById('fps').value;
        const audioBitrate = document.getElementById('audioBitrate').value;

        // Tratar aspect ratio para o comando FFmpeg (-vf scale)
        // No AMV players antigos, forçar a resolução exata é essencial.
        let scaleFilter = `scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2`;
        if (aspect === 'stretch') {
            scaleFilter = `scale=${resolution}`;
        }

        statusText.innerText = "Processando conversão otimizada para AMV...";

        // Comando FFmpeg otimizado para formato AMV (codec amv + adpcm_amv)
        // Parâmetros essenciais exigidos por players MP4/AMV antigos
        await ffmpeg.exec([
            '-i', inputName,
            '-f', 'amv',
            '-vcodec', 'amv',
            '-acodec', 'adpcm_amv',
            '-s', resolution,
            '-r', fps,
            '-ar', '22050',
            '-ac', '1',
            '-b:v', '500k',
            '-b:a', audioBitrate,
            '-vf', scaleFilter,
            outputName
        ]);

        // Ler o arquivo gerado
        const data = await ffmpeg.readFile(outputName);
        
        // Criar link de download
        const blob = new Blob([data.buffer], { type: 'video/amv' });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || 'video';
        downloadLink.download = `${baseName}_player.amv`;

        progressContainer.style.display = 'none';
        resultContainer.style.display = 'block';

    } catch (error) {
        console.error(error);
        statusText.innerText = "Erro durante a conversão do vídeo. Tente outro arquivo.";
    } finally {
        convertBtn.removeAttribute('disabled');
    }
});

// Helper para ler arquivos binários
async function fetchFile(file) {
    return new Uint8Array(await file.arrayBuffer());
}

function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf - 1 >>> 0) + 2) ? '.' + filename.split('.').pop() : '.mp4';
}
