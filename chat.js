import OpenAI from "openai";
import fs from "fs";
import 'dotenv/config'

//
const token = process.env["GITHUB_TOKEN"];
const endpoint = "https://models.github.ai/inference";
const modelName = "openai/gpt-4.1";

console.log(token);
// Carrega os imóveis de um JSON local
function buscarImoveis({ bairro, tipo, maxPreco }) {
  const data = JSON.parse(fs.readFileSync("imoveis.json", "utf-8"));

  const filtrado = data.filter(imovel => {
    const matchBairro = !bairro || imovel.bairro.toLowerCase() === bairro.toLowerCase();
    const matchTipo = !tipo || imovel.tipo.toLowerCase() === tipo.toLowerCase();
    const matchPreco = !maxPreco || imovel.preco <= maxPreco;
    return matchBairro && matchTipo && matchPreco;
  });

  if (filtrado.length === 0) {
    return JSON.stringify({ error: "Nenhum imóvel encontrado com os critérios fornecidos." });
  }

  return JSON.stringify({
    resultados: filtrado.map(imovel => ({
      tipo: imovel.tipo,
      bairro: imovel.bairro,
      preco: imovel.preco,
      preview: `<iframe src="${imovel.url}" width="100%" height="300"></iframe>`
    }))
  });
}

const namesToFunctions = {
  buscarImoveis: (data) => buscarImoveis(data),
};

export async function main() {
  const tool = {
    "type": "function",
    "function": {
      name: "buscarImoveis",
      description: "Busca imóveis com base no bairro, tipo e preço máximo. Retorna prévia em iframe.",
      parameters: {
        "type": "object",
        "properties": {
          "bairro": {
            "type": "string",
            "description": "Bairro desejado do imóvel",
          },
          "tipo": {
            "type": "string",
            "description": "Tipo do imóvel (Apartamento, Casa, etc.)",
          },
          "maxPreco": {
            "type": "number",
            "description": "Preço máximo em reais",
          }
        },
        "required": [],
      }
    }
  };

  const client = new OpenAI({ baseURL: endpoint, apiKey: token });

  let messages = [
    {
      role: "system",
      content: "Você é um agente imobiliário. Responda apenas perguntas relacionadas a imóveis. Use a ferramenta para buscar imóveis e retorne um preview em iframe se houver resultados.",
    },
    {
      role: "user",
      content: "Procuro um apartamento em Copacabana até 1.5 milhões",
    },
  ];

  let response = await client.chat.completions.create({
    messages: messages,
    tools: [tool],
    model: modelName
  });

  if (response.choices[0].finish_reason === "tool_calls") {
    messages.push(response.choices[0].message);

    const toolCall = response.choices[0].message.tool_calls[0];
    if (toolCall.type === "function") {
      const functionArgs = JSON.parse(toolCall.function.arguments);
      const result = namesToFunctions[toolCall.function.name](functionArgs);

      messages.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: toolCall.function.name,
        content: result,
      });

      response = await client.chat.completions.create({
        messages: messages,
        tools: [tool],
        model: modelName
      });

      console.log(`Model response:\n${response.choices[0].message.content}`);
    }
  }
}

main().catch((err) => {
  console.error("Erro ao executar o agente imobiliário:", err);
});
