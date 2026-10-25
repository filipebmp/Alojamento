import { describe, expect, it } from "vitest";
import { encontrarDatas, htmlParaTexto, lerEmailReserva, valorCents } from "../src/emails-reservas";

const agora = new Date("2026-10-25T12:00:00Z");

describe("datas e valores nos emails", () => {
  it("reconhece datas em português e inglês", () => {
    const t = "Chegada: sexta-feira, 15 de novembro de 2026 · Saída 18 nov. 2026 · Nov 20, 2026 · 21/11/2026 · Dec 3";
    expect(encontrarDatas(t, agora).map((d) => d.data)).toEqual(["2026-11-15", "2026-11-18", "2026-11-20", "2026-11-21", "2026-12-03"]);
  });

  it("sem ano, usa a próxima ocorrência", () => {
    expect(encontrarDatas("arrives Jan 5", agora).map((d) => d.data)).toEqual(["2027-01-05"]);
  });

  it("converte valores em vários formatos", () => {
    expect(valorCents("€ 1.234,56")).toBe(123456);
    expect(valorCents("€1,234.56")).toBe(123456);
    expect(valorCents("1 234,56 €")).toBe(123456);
    expect(valorCents("EUR 300")).toBe(30000);
    expect(valorCents("sem valor")).toBeUndefined();
  });
});

describe("emails do Airbnb", () => {
  it("reserva confirmada (inglês)", () => {
    const d = lerEmailReserva({
      de: "Airbnb <automated@airbnb.com>",
      assunto: "Reservation confirmed - John Smith arrives Nov 15",
      texto: "New booking confirmed! John arrives Nov 15.\nCheck-in Sat, Nov 15 3:00 PM\nCheckout Tue, Nov 18 11:00 AM\nGuests 2 adults, 1 child\nConfirmation code HMXYZ98765\nGuest paid\nTotal (EUR) €345.50\nHost service fee -€10.37\n",
    }, agora);
    expect(d).toMatchObject({
      plataforma: "airbnb", tipo: "nova", codigo: "HMXYZ98765", nome: "John Smith",
      checkin: "2026-11-15", checkout: "2026-11-18", hospedes: 3, totalCents: 34550, comissaoCents: 1037,
    });
    expect(d.texto).toBeUndefined();
  });

  it("reserva confirmada (português)", () => {
    const d = lerEmailReserva({
      de: "automated@airbnb.com",
      assunto: "Reserva confirmada – Maria Silva chega a 2 de dez.",
      texto: "Entrada\nqua., 2 de dez.\nSaída\nsáb., 5 de dez.\nHóspedes 2 adultos\nCódigo de confirmação HMABC12345",
    }, agora);
    expect(d).toMatchObject({ tipo: "nova", nome: "Maria Silva", checkin: "2026-12-02", checkout: "2026-12-05", hospedes: 2, codigo: "HMABC12345" });
  });

  it("cancelamento", () => {
    const d = lerEmailReserva({ de: "automated@airbnb.com", assunto: "Reservation HMXYZ98765 cancelled", texto: "Your reservation HMXYZ98765 for Nov 15 - 18 was cancelled." }, agora);
    expect(d).toMatchObject({ tipo: "cancelada", codigo: "HMXYZ98765" });
  });
});

describe("emails do Booking", () => {
  it("nova reserva (português, reencaminhado)", () => {
    const d = lerEmailReserva({
      de: "gestor@gmail.com",
      assunto: "Fwd: Booking.com - Nova reserva! (4123456789, sexta-feira, 20 de novembro de 2026)",
      texto: "---------- Forwarded message ---------\nDe: Booking.com <noreply@booking.com>\nPropriedade: Casa da Praia\nNúmero da reserva: 4123456789\nNome do hóspede: Hans Müller\nCheck-in: sexta-feira, 20 de novembro de 2026\nCheck-out: segunda-feira, 23 de novembro de 2026\n2 adultos\nPreço total € 412,80\nComissão € 61,92",
    }, agora);
    expect(d).toMatchObject({
      plataforma: "booking", tipo: "nova", codigo: "4123456789", nome: "Hans Müller", propriedade: "Casa da Praia",
      checkin: "2026-11-20", checkout: "2026-11-23", hospedes: 2, totalCents: 41280, comissaoCents: 6192,
    });
  });

  it("email desconhecido sem datas guarda um excerto para o gestor", () => {
    const d = lerEmailReserva({ de: "noreply@booking.com", assunto: "Mensagem do hóspede", texto: "Olá, a que horas posso chegar?" }, agora);
    expect(d.tipo).toBe("desconhecido");
    expect(d.texto).toContain("a que horas");
  });
});

describe("confirmação do reencaminhamento do Gmail", () => {
  it("extrai o código e o link", () => {
    const d = lerEmailReserva({
      de: "Gmail Team <forwarding-noreply@google.com>",
      assunto: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from gestor@gmail.com",
      texto: "Confirmation code: 123456789\nTo allow, click: https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc\n",
    }, agora);
    expect(d).toMatchObject({ tipo: "confirmacao_reencaminhamento", confirmacao: { codigo: "123456789", link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc" } });
  });
});

describe("html", () => {
  it("converte para texto", () => {
    expect(htmlParaTexto("<p>Check-in&nbsp;<b>Nov 15</b></p><style>x{}</style><p>Total &euro;10</p>")).toBe("Check-in Nov 15\nTotal €10");
  });
});
