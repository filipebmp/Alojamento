import { describe, expect, it } from "vitest";
import { PERFIL, PUBLICACOES, quebrar, svgDiapositivo } from "../src/instagram";
import { chaveTitulo, concelhosNaNoticia, eImportante, lerRss, temasDe } from "../src/noticias";

const RSS = `<rss><channel><item><title>Tomar começa a cobrar taxa turística de dois euros &amp; mais - SAPO</title>
<link>https://news.google.com/rss/articles/abc</link><pubDate>Mon, 26 Oct 2026 09:15:00 GMT</pubDate>
<source url="https://sapo.pt">SAPO</source></item>
<item><title>Sem link</title><pubDate>Mon, 26 Oct 2026 09:15:00 GMT</pubDate></item></channel></rss>`;

describe("notícias", () => {
  it("lê o RSS do Google Notícias e tira a fonte do título", () => {
    expect(lerRss(RSS)).toEqual([{ titulo: "Tomar começa a cobrar taxa turística de dois euros & mais", fonte: "SAPO",
      link: "https://news.google.com/rss/articles/abc", publicadaEm: "2026-10-26T09:15:00.000Z" }]);
  });

  it("classifica por tema e importância", () => {
    expect(temasDe("Governo aprova novas regras para o alojamento local").map((t) => t.id)).toContain("legislacao");
    expect(temasDe("Lajes do Pico cria taxa turística").map((t) => t.id)).toContain("taxa");
    expect(eImportante(["mercado"])).toBe(false);
    expect(eImportante(["mercado", "siba"])).toBe(true);
  });

  it("compara os concelhos com a tabela de taxas", () => {
    expect(concelhosNaNoticia("Tomar começa a cobrar taxa turística")).toEqual([{ nome: "Tomar", valorCents: null }]);
    expect(concelhosNaNoticia("Aumento da taxa turística no Porto Santo")).toEqual([{ nome: "Porto Santo", valorCents: 200 }]);
    expect(concelhosNaNoticia("Lajes do Pico abre consulta pública").map((c) => c.nome)).toEqual(["Lajes do Pico"]);
  });

  it("a mesma notícia com outra pontuação tem a mesma chave", () => {
    expect(chaveTitulo("Tomar: taxa turística!")).toBe(chaveTitulo("Tomar taxa turística"));
  });
});

describe("instagram", () => {
  it("a biografia cabe nos 150 caracteres", () => {
    expect([...PERFIL.bio].length).toBeLessThanOrEqual(150);
  });

  it("quebra o texto em linhas", () => {
    expect(quebrar("um dois três quatro", 9)).toEqual(["um dois", "três", "quatro"]);
  });

  it("gera SVG válido para todos os diapositivos", () => {
    for (const p of PUBLICACOES) for (const d of p.diapositivos) {
      const svg = svgDiapositivo(d);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
      // O texto não pode chegar ao rodapé (bookgest.pt, em y = 990).
      const ys = [...svg.matchAll(/<text x="(?:96|166)" y="(\d+)"/g)].map((m) => Number(m[1])).filter((y) => y !== 990);
      expect(Math.max(...ys), d.titulo).toBeLessThan(930);
    }
  });
});
