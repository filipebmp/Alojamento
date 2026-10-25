-- Registo mínimo dos emails de recuperação enviados, só para limitar abusos:
-- o destinatário fica como hash (a plataforma não guarda os emails da equipa dos gestores).
CREATE TABLE envios_email (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licenca_id INTEGER NOT NULL REFERENCES licencas(id),
  para_hash TEXT NOT NULL,
  enviado_em TEXT NOT NULL
);
CREATE INDEX envios_licenca ON envios_email(licenca_id, enviado_em);
