-- Modo "Simples": instalações alojadas na conta Cloudflare do fornecedor (uma app e uma base por cliente),
-- criadas a partir de um registo com período experimental, e atualizadas pela plataforma.

ALTER TABLE licencas ADD COLUMN modo TEXT;           -- 'alojado' | 'privado' (null = ainda sem instalação)
ALTER TABLE licencas ADD COLUMN valida_ate TEXT;     -- fim do período experimental (tipo 'teste')
ALTER TABLE licencas ADD COLUMN slug TEXT;           -- nome do endereço (modo alojado)
ALTER TABLE licencas ADD COLUMN cf_base TEXT;        -- id da base D1 (modo alojado)
ALTER TABLE licencas ADD COLUMN versao_publicada TEXT;
ALTER TABLE licencas ADD COLUMN erro_atualizacao TEXT;
CREATE UNIQUE INDEX licencas_slug ON licencas(slug) WHERE slug IS NOT NULL;
UPDATE licencas SET modo = 'privado' WHERE url_instalacao IS NOT NULL;

-- Registos à espera de confirmação do email.
CREATE TABLE registos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  nome TEXT,
  email TEXT NOT NULL,
  slug TEXT NOT NULL,
  aceitou_termos_em TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  confirmado_em TEXT,
  licenca_id INTEGER REFERENCES licencas(id)
);
CREATE INDEX registos_email ON registos(email, criado_em);
