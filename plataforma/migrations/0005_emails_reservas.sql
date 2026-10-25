-- Emails de reserva reencaminhados pelos gestores (Booking, Airbnb). Guardam-se só os dados extraídos,
-- até a instalação os ir buscar (no máximo 7 dias). O email original não é guardado.
ALTER TABLE licencas ADD COLUMN email_token TEXT;
CREATE UNIQUE INDEX licencas_email_token ON licencas(email_token) WHERE email_token IS NOT NULL;

CREATE TABLE emails_reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licenca_id INTEGER NOT NULL REFERENCES licencas(id),
  dados TEXT NOT NULL,
  recebido_em TEXT NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE INDEX emails_reservas_licenca ON emails_reservas(licenca_id, id);
