import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

const genAI = new GoogleGenerativeAI("AIzaSyDjf-9MW8uj-81mLC2RrTazoCqlsYgTa3Q");

function fileToGenerative(path, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(path)).toString('base64'),
            mimeType
        },
    };
}

async function testeExtrair() {

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Você é um assistente especialista em extração de dados logísticos e de produção.
    Analise a imagem deste relatório de produção diário.
    Sua tarefa é extrair as informações da imagem, linha por linha, e me retornar EXATAMENTE um array em formato JSON.
    Não adicione NENHUM texto antes ou depois do JSON. Não use formatação markdown (como \`\`\`json).
    
    O formato esperado de cada objeto dentro do array deve ser estruturado desta forma:
    [
      {
        "km inicial": "km inicial",
        "km final": "km final",
        "sentido": "sentido",
        "extensão": "extensão",
        "largura": "largura",
        "espessura": "espessura",
        "volume": "volume",
      }
    ]
    
    Se houver rasuras na imagem, tente deduzir pelo contexto.`;

    const imagePart = fileToGenerative("relatorio-teste.jpg", "image/jpeg");

    try {
        console.log("Enviando foto para API. Aguarde...");

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        let textResp = response.text();

        textResp = textResp.replace(/```json/g, "").replace(/```/g, "").trim();

        const dadosExtraidos = JSON.parse(textResp);

        console.log("\nSucesso! Dados extraídos:");
        console.log(dadosExtraidos);

    } catch (error) {
        console.error("Ocorreu um erro: ", error.message);
    }

}

testeExtrair();