-- Versões da app (assinadas no GitHub Actions), servidas ao instalador e às atualizações automáticas.
CREATE TABLE versoes (
  versao TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  assinatura TEXT NOT NULL,
  publicada_em TEXT NOT NULL
);

-- Onde ficou instalada cada licença (para apoio ao cliente). Nunca a chave de API do gestor.
ALTER TABLE licencas ADD COLUMN url_instalacao TEXT;
ALTER TABLE licencas ADD COLUMN instalada_em TEXT;
