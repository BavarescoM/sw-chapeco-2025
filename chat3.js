import OpenAI from "openai";
import fs from "fs";
import 'dotenv/config'

const token = process.env["GITHUB_TOKEN"];
const endpoint = "https://models.github.ai/inference";
const modelName = "openai/gpt-4o-mini";

// Função de busca usando novo formato de dados
function buscarImoveis({ bairro, tipo, maxPreco, quartos }) {
  const data = JSON.parse(fs.readFileSync("nostraCasaAluguel.json", "utf-8"));

  const filtrado = data.filter(imovel => {
    const matchBairro = !bairro || imovel.bairro.toLowerCase() === bairro.toLowerCase();
    const matchTipo = !tipo || imovel.tipo.toLowerCase() === tipo.toLowerCase();
    const precoNumerico = parseFloat(imovel.preco.replace("R$", "").replace(".", "").replace(",", "."));
    const matchPreco = !maxPreco || precoNumerico <= maxPreco;
    const matchQuartos = !quartos || parseInt(imovel.quartos) >= parseInt(quartos);
    return matchBairro && matchTipo && matchPreco && matchQuartos;
  });

  if (filtrado.length === 0) {
    return JSON.stringify({ error: "Nenhum imóvel encontrado com os critérios fornecidos." });
  }

  return JSON.stringify({
    resultados: filtrado.map(imovel => ({
      bairro: imovel.bairro,
      tipo: imovel.tipo,
      preco: imovel.preco,
      quartos: imovel.quartos,
      area: imovel.area,
      proximidade: imovel.proximidade,
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
      description: "Busca imóveis para aluguel com base em bairro, tipo, número de quartos e preço máximo. Retorna prévia com iframe.",
      parameters: {
        "type": "object",
        "properties": {
          "bairro": { "type": "string", "description": "Bairro desejado" },
          "tipo": { "type": "string", "description": "Tipo (ex: aluguel)" },
          "maxPreco": { "type": "number", "description": "Preço máximo em reais" },
          "quartos": { "type": "integer", "description": "Número mínimo de quartos" }
        },
        "required": []
      }
    }
  };

  const client = new OpenAI({ baseURL: endpoint, apiKey: token });

  const messages = [
    {
      role: "system",
      content: "Você é um agente imobiliário que responde apenas sobre imóveis e usa a ferramenta para buscar imóveis e retornar previews com iframe.",
    },
    {
      role: "user",
      content: "Quero um apartamento para alugar no centro com pelo menos 3 quartos por até 13 mil reais.",
    }
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
      const args = JSON.parse(toolCall.function.arguments);
      const result = namesToFunctions[toolCall.function.name](args);

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

      console.log("Resposta do modelo:\n", response.choices[0].message.content);
    }
  }
}

main().catch((err) => {
  console.error("Erro ao executar o agente imobiliário:", err);
});
