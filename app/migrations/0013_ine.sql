-- Inquérito mensal do INE (IPHH): capacidade do alojamento e registo das respostas.
ALTER TABLE alojamentos ADD COLUMN ine_responde INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alojamentos ADD COLUMN modalidade TEXT NOT NULL DEFAULT 'apartamento'; -- apartamento | moradia | quartos | hospedagem | hostel
ALTER TABLE alojamentos ADD COLUMN tipologia TEXT NOT NULL DEFAULT 'T1';          -- T0 a T6 (apartamento / moradia)
ALTER TABLE alojamentos ADD COLUMN quartos INTEGER;                               -- quartos / hospedagem / hostel
ALTER TABLE alojamentos ADD COLUMN camas_individuais INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alojamentos ADD COLUMN camas_casal INTEGER NOT NULL DEFAULT 0;

CREATE TABLE ine_respostas (
  alojamento_id INTEGER NOT NULL REFERENCES alojamentos(id),
  mes TEXT NOT NULL,
  respondido_em TEXT NOT NULL,
  PRIMARY KEY (alojamento_id, mes)
);
