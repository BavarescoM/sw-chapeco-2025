import { chromium } from 'playwright';
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const scrape = async () => {
  try{
  console.log("Starting the scrape...");

  const browser = await chromium.launch({ headless: false }); // abre o navegador
  const page = await browser.newPage();
  await page.goto('https://santamaria.com.br/alugar?orderBy=least_expensive&_rsc=1f3kf');
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
    const currentUrl = page.url();
    for (let link of links) {
        let res = await fetchPropertyDetails(link, page);
        jsonRet.push(res);     
        fs.writeFileSync('saida.json', JSON.stringify(jsonRet, null, 2));   
    }
    await page.goto(currentUrl);
    await page.pause(2000);
    const proximoLink = await page.getByRole('button', { name: 'Ir para a próxima página' })
    const proximoLinkExists = await proximoLink.count() > 0;
    if (proximoLinkExists) {
        await proximoLink.click();
        return await makePagination(page, jsonRet);
    }
}

async function extrairLinks(html) {
  const $ = cheerio.load(html);
  let links = $('a').map((i, e)=> $(e).attr(`href`)).toArray()
  links = links.filter((e)=> {return e.includes("/imovel/")})
  links = links.map((e)=> {return `https://santamaria.com.br${e}`})
  return [...new Set(links)];
}

async function fetchPropertyDetails(url, page) {
  try {
    // const { data: html } = await axios.get(url);
    await page.goto(url);
    const html = await page.content();
    console.log(`Fetching details from: ${url}`);
    const $ = cheerio.load(html);
    const fullText = $('body').text();

    const extractValor = (pattern) => {
      const match = fullText.match(pattern);
      if (!match) return null;
      const valor = match[0].match(/R\$ ?[\d\.,]+/);
      if (!valor) return null;
      return parseFloat(valor[0].replace(/[R$\s\.]/g, '').replace(',', '.'));
    };

    const extractNumero = (pattern) => {
      const match = fullText.match(pattern);
      return match ? parseInt(match[1], 10) : null;
    };

    const extractTexto = (pattern) => {
      const match = fullText.match(pattern);
      return match ? match[1].trim() : null;
    };

    // Dados visuais do HTML (ex: área, quartos, etc.)
    const dados = {};
    $('ul[class*="sc-"] > li').each((_, el) => {
      const titulo = $(el).find('strong').text().trim();
      const subtitulo = $(el).find('span').text().trim();

      if (titulo.includes('m²')) {
        dados.areaTotal = titulo;
      } else if (titulo.includes('quarto')) {
        dados.quartos = titulo;
        if (subtitulo.includes('suíte')) dados.suites = subtitulo;
      } else if (titulo.includes('banheiro')) {
        dados.banheiros = titulo;
      } else if (titulo.includes('vaga')) {
        dados.vagas = titulo;
      } else if (subtitulo.toLowerCase().includes('andar')) {
        dados.andar = `${titulo} andar`;
      } else if (titulo.toLowerCase().includes('sol')) {
        dados.sol = titulo;
      }
    });

    // Juntando com outras informações
    const matchInfo = {
      url,
      tipo: "aluguel",
      preco: extractValor(/R\$ ?[\d\.,]+/),
      condominio: extractValor(/CONDOM[IÍ]NIO.*?R\$ ?[\d\.,]+/i),
      iptu: extractValor(/IPTU.*?R\$ ?[\d\.,]+/i),
      quartos: dados.quartos || extractNumero(/Quarto\(s\):\s*(\d+)/i),
      suites: dados.suites || null,
      banheiros: dados.banheiros || extractNumero(/Bwc \(s\):\s*(\d+)/i),
      vagas: dados.vagas || extractNumero(/Garagem rotativa:\s*(\d+)/i),
      andar: dados.andar || null,
      sol: dados.sol || null,
      area: dados.areaTotal || extractNumero(/área aproximada \(m²\):\s*(\d+)/i),
      piso: extractTexto(/Tipo de piso:\s*([^\n]+)/i),
      proximidade: extractTexto(/Proximidade:\s*([^\n]+)/i)
    };
    return matchInfo
  } catch (error) {
    console.error(`Erro ao buscar dados do imóvel: ${error}`);
    return null;
  }
}


scrape();
