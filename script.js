const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
});

let selectedFile = null;
let isFFmpegReady = false;

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
    fileNameSpan.innerText = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    fileInfo.style.display = 'block';
    resultContainer.style.display = 'none';
    
    if (isFFmpegReady) {
        convertBtn.removeAttribute('disabled');
    }
}

// Inicializar FFmpeg sob demanda ou de forma assíncrona limpa
async function initFFmpeg() {
    if (!isFFmpegReady) {
        try {
            if (!ffmpeg.isLoaded()) {
                progressContainer.style.display = 'block';
                statusText.innerText = "Carregando motor FFmpeg (Aguarde alguns segundos)...";
                await ffmpeg.load();
            }
            isFFmpegReady = true;
            statusText.innerText = "Motor FFmpeg pronto! Selecione um vídeo para começar.";
            progressContainer.style.display = 'none';

            if (selectedFile) {
                convertBtn.removeAttribute('disabled');
            }
        } catch (error) {
            console.error("Erro ao carregar FFmpeg:", error);
            statusText.innerText = "Erro ao carregar motor de conversão. Verifique sua conexão.";
        }
    }
}

// Carregar em background logo após o carregamento da página sem travar a interface
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initFFmpeg, 500);
});

// Processo de Conversão Robusto para Arquivos Grandes (ex: 97MB)
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    convertBtn.setAttribute('disabled', 'true');
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    progressBar.style.width = '0%';
    statusText.innerText = "Carregando motor FFmpeg para conversão...";

    try {
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }
        isFFmpegReady = true;

        statusText.innerText = "Lendo arquivo para a memória do navegador...";
        progressBar.style.width = '20%';

        const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')) || '.mp4';
        const inputName = 'input_video' + fileExt;
        const outputName = 'output.amv';

        // Escrever arquivo na memória virtual usando o fetchFile nativo do FFmpeg 0.11
        ffmpeg.FS('writeFile', inputName, await fetchFile(selectedFile));

        progressBar.style.width = '40%';
        statusText.innerText = "Configurando parâmetros e convertendo para .AMV...";

        // Configurar listener de progresso de conversão
        ffmpeg.setProgress(({ ratio }) => {
            const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
            progressBar.style.width = percent + '%';
            statusText.innerText = `Convertendo vídeo para .AMV... (${percent}%)`;
        });

        // Capturar opções selecionadas
        const resolution = document.getElementById('resolution').value;
        const aspect = document.getElementById('aspect').value;
        const fps = document.getElementById('fps').value;
        const audioBitrate = document.getElementById('audioBitrate').value;

        let scaleFilter = `scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2`;
        if (aspect === 'stretch') {
            scaleFilter = `scale=${resolution}`;
        }

        // Executar comando FFmpeg otimizado para AMV compatível com players antigos
        await ffmpeg.run(
            '-i', inputName,
            '-f', 'amv',
            '-vcodec', 'amv',
            '-acodec', 'adpcm_amv',
            '-s', resolution,
            '-r', fps,
            '-ar', '22050',
            '-ac', '1',
            '-b:v', '600k',
            '-b:a', audioBitrate,
            '-vf', scaleFilter,
            outputName
        );

        statusText.innerText = "Finalizando e gerando link de download...";
        progressBar.style.width = '95%';

        // Ler o arquivo gerado da memória virtual
        const data = ffmpeg.FS('readFile', outputName);
        
        // Criar link de download seguro
        const blob = new Blob([data.buffer], { type: 'video/amv' });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || 'video';
        downloadLink.download = `${baseName}_player.amv`;

        progressContainer.style.display = 'none';
        resultContainer.style.display = 'block';

    } catch (error) {
        console.error("Erro durante a conversão:", error);
        statusText.innerText = "Erro ao converter o vídeo. O formato pode não ser suportado ou a memória foi excedida.";
    } finally {
        convertBtn.removeAttribute('disabled');
    }
});
