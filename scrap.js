import { chromium } from 'playwright';
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const scrape = async () => {
  try{
  console.log("Starting the scrape...");

  const browser = await chromium.launch({ headless: false }); // abre o navegador
  const page = await browser.newPage();
  await page.goto('https://www.nostracasa.com.br/alugar-imoveis-chapeco-sc?ordem=valor_asc');

  let jsonRet = []
  await makePagination(page, jsonRet)
  fs.writeFileSync('saida.json', JSON.stringify(jsonRet, null, 2));
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
  links = links.filter((e)=> {return e.includes("https://www.nostracasa.com.br/apartamento/alugar")})
  return [...new Set(links)];
}

async function fetchPropertyDetails(url) {
  const { data: html } = await axios.get(url);
  console.log(`Fetching details from: ${url}`);
  const $ = cheerio.load(html);
  const getText = (selector) => $(selector).text().trim();
  let auxBairro = url.split(`/`)
  let bairro = auxBairro[auxBairro.length -3]
  const price = $('body').text().match(/R\$ ?[\d\.,]+/)?.[0] || null;
  const condo = $('body').text().match(/CONDOM[IÍ]NIO.*?R\$ ?[\d\.,]+/)?.[0]?.match(/R\$ ?[\d\.,]+/)?.[0] || null;
  const iptu = $('body').text().match(/IPTU.*?R\$ ?[\d\.,]+/)?.[0]?.match(/R\$ ?[\d\.,]+/)?.[0] || null;

  const fullText = $('body').text();

  const matchInfo = {
    quartos: fullText.match(/Quarto\(s\): (\d+)/)?.[1],
    salas: fullText.match(/Sala\(s\): (\d+)/)?.[1],
    cozinhas: fullText.match(/Cozinha: (\d+)/)?.[1],
    bwcs: fullText.match(/Bwc \(s\): (\d+)/)?.[1],
    areaServico: fullText.match(/área de serviço: (\d+)/)?.[1],
    piso: fullText.match(/Tipo de piso: ([^\n]+)/)?.[1]?.trim(),
    garagem: fullText.match(/Garagem rotativa: (\d+)/)?.[1],
    area: fullText.match(/área aproximada \(m²\): (\d+)/)?.[1],
    proximidade: fullText.match(/Proximidade: ([^\n]+)/)?.[1]?.trim(),
  };

  return {
    url: url,
    tipo: "aluguel",
    bairro: bairro,
    preco: price,
    condominio: condo,
    iptu: iptu,
    ...matchInfo,
  };
}


scrape();
