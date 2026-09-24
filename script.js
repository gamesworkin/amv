const { FFmpeg } = FFmpegWASM;
let ffmpeg = null;
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

// Inicializar FFmpeg.wasm em background com logs visíveis de carregamento
async function initFFmpeg() {
    if (!ffmpeg) {
        try {
            progressContainer.style.display = 'block';
            statusText.innerText = "Carregando motor FFmpeg (Aguarde alguns segundos)...";
            
            ffmpeg = new FFmpeg();
            
            ffmpeg.on('log', ({ message }) => {
                console.log("[FFmpeg Log]:", message);
            });

            ffmpeg.on('progress', ({ progress }) => {
                // O progresso do ffmpeg vai de 0 a 1 durante a codificação
                const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
                progressBar.style.width = percent + '%';
                statusText.innerText = `Convertendo vídeo para .AMV... (${percent}%)`;
            });

            await ffmpeg.load({
                coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
            });

            isFFmpegReady = true;
            statusText.innerText = "Motor FFmpeg pronto! Selecione um vídeo para começar.";
            progressContainer.style.display = 'none';

            if (selectedFile) {
                convertBtn.removeAttribute('disabled');
            }
        } catch (error) {
            console.error("Erro ao carregar FFmpeg:", error);
            statusText.innerText = "Erro crítico ao carregar o motor de conversão. Atualize a página.";
        }
    }
}

window.addEventListener('DOMContentLoaded', initFFmpeg);

// Processo de Conversão Robusto para Arquivos Grandes (ex: 97MB)
convertBtn.addEventListener('click', async () => {
    if (!selectedFile || !isFFmpegReady) return;

    convertBtn.setAttribute('disabled', 'true');
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    progressBar.style.width = '0%';
    statusText.innerText = "Lendo arquivo para a memória do navegador...";

    try {
        // Passo 1: Ler o arquivo binário com barra de progresso simulada/real para arquivos grandes
        const arrayBuffer = await selectedFile.arrayBuffer();
        const fileData = new Uint8Array(arrayBuffer);
        
        const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')) || '.mp4';
        const inputName = 'input_video' + fileExt;
        const outputName = 'output.amv';

        statusText.innerText = "Gravando arquivo na memória virtual (Isso pode levar alguns segundos para arquivos grandes)...";
        progressBar.style.width = '15%';

        // Escrever arquivo na memória virtual do FFmpeg
        await ffmpeg.writeFile(inputName, fileData);
        
        progressBar.style.width = '30%';
        statusText.innerText = "Configurando parâmetros para AMV...";

        // Capturar opções selecionadas
        const resolution = document.getElementById('resolution').value;
        const aspect = document.getElementById('aspect').value;
        const fps = document.getElementById('fps').value;
        const audioBitrate = document.getElementById('audioBitrate').value;

        let scaleFilter = `scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2`;
        if (aspect === 'stretch') {
            scaleFilter = `scale=${resolution}`;
        }

        statusText.innerText = "Iniciando codificação FFmpeg. Aguarde...";

        // Executar comando FFmpeg otimizado para AMV compatível com players antigos
        await ffmpeg.exec([
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
        ]);

        statusText.innerText = "Finalizando e gerando link de download...";
        progressBar.style.width = '95%';

        // Ler o arquivo gerado
        const data = await ffmpeg.readFile(outputName);
        
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
