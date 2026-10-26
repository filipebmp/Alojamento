-- Envio automático dos boletins ao SIBA (webservice), por alojamento.
CREATE TABLE siba_config (
  alojamento_id INTEGER PRIMARY KEY REFERENCES alojamentos(id),
  ativo INTEGER NOT NULL DEFAULT 0,
  teste INTEGER NOT NULL DEFAULT 1,          -- 1 = ambiente de desenvolvimento do SIBA
  nif TEXT NOT NULL,
  estabelecimento TEXT NOT NULL DEFAULT '00',
  chave TEXT NOT NULL,
  abreviatura TEXT NOT NULL DEFAULT '',
  localidade TEXT NOT NULL,
  codigo_postal TEXT NOT NULL,
  telefone TEXT NOT NULL,
  contacto_nome TEXT NOT NULL,
  contacto_email TEXT NOT NULL,
  numero_ficheiro INTEGER NOT NULL DEFAULT 0 -- n.º sequencial de cada envio (exigido pelo SIBA)
);

ALTER TABLE hospedes ADD COLUMN siba_enviado_em TEXT;
ALTER TABLE reservas ADD COLUMN siba_erro TEXT;
ALTER TABLE reservas ADD COLUMN siba_tentativa_em TEXT;
