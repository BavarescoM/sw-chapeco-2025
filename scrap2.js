import { chromium } from 'playwright';
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const scrape = async () => {
  try{
  console.log("Starting the scrape...");

  const browser = await chromium.launch({ headless: false }); // abre o navegador
  const page = await browser.newPage();
  await page.goto('https://santamaria.com.br/alugar?orderBy=least_expensive');
  let jsonRet = []
  await makePagination(page, jsonRet)
  await browser.close();
  }catch(e){
    console.log("Error: ", e);  
  }

};

async function makePagination(page, jsonRet) {
    const html = await page.content(); 
    let links = await extrairLinks(html);
    for (let link of links) {
        let res = await fetchPropertyDetails(link);
        jsonRet.push(res);     
        fs.writeFileSync('saida.json', JSON.stringify(jsonRet, null, 2));   
    }
    const proximoLink = await page.getByRole('link', { name: 'Próximo' });
    const proximoLinkExists = await proximoLink.count() > 0;
    if (proximoLinkExists) {
        await proximoLink.click();
        return await makePagination(page, jsonRet);
    }
}

async function extrairLinks(html) {
  const $ = cheerio.load(html);
  let links = $('a').map((i, e)=> $(e).attr(`href`)).toArray()
  links = links.filter((e)=> {return e.includes("https://santamaria.com.br/imovel/")})
  return [...new Set(links)];
}

async function fetchPropertyDetails(url) {
  try {
    const { data: html } = await axios.get(url);
    console.log(`Fetching details from: ${url}`);
    const $ = cheerio.load(html);
    const fullText = $('body').text();
    const extractMoney = (pattern) => fullText.match(pattern)?.[0].match(/R\$ ?[\d\.,]+/)?.[0] || null;
    const matchInfo = {
      url: url,
      tipo: "aluguel",
      preco: extractMoney(/R\$ ?[\d\.,]+/),
      condominio: extractMoney(/CONDOM[IÍ]NIO.*?R\$ ?[\d\.,]+/i),
      iptu: extractMoney(/IPTU.*?R\$ ?[\d\.,]+/i),
      quartos: fullText.match(/Quarto\(s\): (\d+)/i)?.[1] || null,
      salas: fullText.match(/Sala\(s\): (\d+)/i)?.[1] || null,
      cozinhas: fullText.match(/Cozinha: (\d+)/i)?.[1] || null,
      bwcs: fullText.match(/Bwc \(s\): (\d+)/i)?.[1] || null,
      areaServico: fullText.match(/área de serviço: (\d+)/i)?.[1] || null,
      piso: fullText.match(/Tipo de piso: ([^\n]+)/i)?.[1]?.trim() || null,
      garagem: fullText.match(/Garagem rotativa: (\d+)/i)?.[1] || null,
      area: fullText.match(/área aproximada \(m²\): (\d+)/i)?.[1] || null,
      proximidade: fullText.match(/Proximidade: ([^\n]+)/i)?.[1]?.trim() || null,
    };

    return matchInfo;
  } catch (error) {
    console.error(`Erro ao buscar dados do imóvel: ${error}`);
    return null;
  }
}


scrape();
