import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import 'dotenv/config';

import whatsapp from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = whatsapp;
//chave api
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
//num operadores
const num_wpp = [
    '554799402411@c.us', // pedro
    '76897614569492@lid', // apontador
    '113760899465453@lid' // ney sinalizacao
];
//id grupo
// const grupoPermitido = [
//     '',
// ]

async function saveExcel(dados){

    const pastaDestino = './Relatorios';

    if (!fs.existsSync(pastaDestino)){
        fs.mkdirSync(pastaDestino, { recursive: true })
    }

    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();

    const dataForm = `${dia}-${mes}-${ano}`;

    const nomeArquivo = `relatorio_producao_${dataForm}.xlsx`;

    const nomeArq = path.join(pastaDestino, nomeArquivo);
    const workbook = new ExcelJS.Workbook();
    let worksheet;

    try{
        if (fs.existsSync(nomeArq)) {
            await workbook.xlsx.readFile(nomeArq);
            worksheet = workbook.getWorksheet("Produção");
        } else {
            worksheet = workbook.addWorksheet("Produção");
            worksheet.columns = [
            { header: 'KM Inicial', key: 'km inicial', width: 15 },
            { header: 'KM Final', key: 'km final', width: 15 },
            { header: 'Sentido', key: 'sentido', width: 15 },
            { header: 'Extensão', key: 'extensão', width: 15 },
            { header: 'Largura', key: 'largura', width: 15 },
            { header: 'Espessura', key: 'espessura', width: 15 },
            { header: 'Volume', key: 'volume', width: 15 }
            ]        

            worksheet.getRow(1).font = { bold: true };
        }

        dados.forEach(linha => {
            worksheet.addRow(linha)
        });

        await workbook.xlsx.writeFile(nomeArq);
        console.log(`Dados salvos com sucesso na planilha: ${nomeArq}`);
        return true;
    } catch (error) {

        if(error.code === 'EBUSY') {
            console.error(`\nErro: A planilha ${nomeArq} está aberta. Feche e tente novamente...`)
        } else {
            console.error('\nErro desconhecido ao salvar no Excel: ', error);
        }
        return false;
    }
}

async function extrairDadosImg(base64Data, mimeType) {

    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const prompt = `
    Você é um assistente especialista em extração de dados logísticos e de produção de rodovias.
    Analise a imagem deste Boletim de Medição em Campo.
    
    Sua tarefa é extrair as informações da tabela, linha por linha, e me retornar EXATAMENTE um array em formato JSON.
    Não adicione NENHUM texto antes ou depois do JSON. Não use formatação markdown (como \`\`\`json).
    
    REGRAS DE NEGÓCIO E CORREÇÃO DE LEITURA:
    1. A caligrafia na coluna "Faixa" pode parecer "SCL", mas o correto no jargão da rodovia é "SUL". Sempre que ler "SCL" ou parecido, converta para "SUL".
    2. O campo "sentido" no JSON deve ser a apenas a coluna "Faixa". Exemplo: "SUL" ou "NORTE".
    3. Trate os números com atenção, mantendo as vírgulas originais ou convertendo para pontos decimais.
    4. Nos campos de km, mantenha o formato numérico, sem o sinal de '+', mesmo que haja variações na escrita (ex: "216.570" ou "216+570" devem ser convertidos para 216570).
    
    O formato esperado de cada objeto dentro do array deve ser estruturado desta forma:
    [
      {
        "km inicial": "ex: 216570",
        "km final": "ex: 216795",
        "sentido": "SUL",
        "extensão": "215",
        "largura": "2.30",
        "espessura": "0.02",
        "volume": "9.89"
      }
    ]
  `;

    const imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: mimeType
        }
    };

    try {
        console.log("\nEnviando foto e extraindo dados. Aguarde...");

        const result = await model.generateContent([prompt, imagePart]);
        let textResp = result.response.text();

        textResp = textResp.replace(/```json/g, "").replace(/```/g, "").trim();

        return JSON.parse(textResp);

    } catch (error) {
        console.error("\nOcorreu um erro: ", error.message);
        return null;
    }

}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }
});

client.on('qr', (qr) => {
    console.log('\nEscaneie o QR Code no seu WhatsApp...');
    qrcode.generate(qr, {
        small: true
    })
});

client.on('ready', () => {
    console.log('\nBot conectado e aguardando fotos...');
})

client.on('message', async msg => {

    try{

        if(!num_wpp.includes(msg.from)) {
            console.log(`\nMensagem recebida de ${msg.from}, mas este número não é autorizado a enviar fotos. Ignorando...`);
            return;
        }

        console.log('\nNova mensagem recebida, analisando...');

        if(msg.hasMedia) {
            console.log('\nNova foto do relatório recebida...');

            const media = await msg.downloadMedia();

            if(media && (media.mimetype.includes('image'))){
                    const dadosExtraidos = await extrairDadosImg(media.data, media.mimetype);

                    if (dadosExtraidos) {
                        console.log('\nDados lidos com sucesso. Injetando...');
                        const salvoSucesso = await saveExcel(dadosExtraidos);

                        if(salvoSucesso) {
                            client.sendMessage(msg.from,"Relatório recebido e planilha atualizada, obrigado!");
                        } else {
                            client.sendMessage(msg.from,'Ops! A planilha de destino está aberta, por favor feche e tente novamente.')
                        }
                    }
            }
        }

    } catch (error) {
        console.error("\nOcorreu um erro inesperado...", error.message);
        client.sendMessage(msg.from,"\nTive um problema interno, contate o suporte.")
    }

})

client.initialize();