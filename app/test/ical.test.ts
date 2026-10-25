import { describe, expect, it } from "vitest";
import { eReserva, lerCalendario, referencia } from "../src/lib/ical";

const airbnb = [
  "BEGIN:VCALENDAR", "PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN", "VERSION:2.0",
  "BEGIN:VEVENT", "DTEND;VALUE=DATE:20261105", "DTSTART;VALUE=DATE:20261101", "UID:1418fb94e984-abc@airbnb.com",
  "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC12345\\nPhone Number (Last 4 Digi",
  " ts): 1234", "SUMMARY:Reserved", "END:VEVENT",
  "BEGIN:VEVENT", "DTEND;VALUE=DATE:20261212", "DTSTART;VALUE=DATE:20261210", "UID:bloq-1@airbnb.com", "SUMMARY:Airbnb (Not available)", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const booking = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:9a8b7c@booking.com", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261123",
  "SUMMARY:CLOSED - Not available", "END:VEVENT",
  "BEGIN:VEVENT", "UID:sem-datas", "SUMMARY:x", "END:VEVENT", "END:VCALENDAR",
].join("\n");

describe("calendários iCal", () => {
  it("lê as reservas do Airbnb, com o código, e ignora as datas bloqueadas", () => {
    const ev = lerCalendario(airbnb);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ uid: "1418fb94e984-abc@airbnb.com", checkin: "2026-11-01", checkout: "2026-11-05", resumo: "Reserved" });
    expect(ev[0].descricao).toContain("Last 4 Digits): 1234");
    expect(referencia(ev[0])).toBe("HMABC12345");
    expect(ev.filter((e) => eReserva(e, "airbnb")).map((e) => e.uid)).toEqual(["1418fb94e984-abc@airbnb.com"]);
  });

  it("lê os eventos do Booking e descarta eventos sem datas", () => {
    const ev = lerCalendario(booking);
    expect(ev).toEqual([{ uid: "9a8b7c@booking.com", checkin: "2026-11-20", checkout: "2026-11-23", resumo: "CLOSED - Not available", descricao: "" }]);
    expect(eReserva(ev[0], "booking")).toBe(true);
  });
});
