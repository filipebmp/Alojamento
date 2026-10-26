-- Notícias do Alojamento Local (Google Notícias) para a página de gestão.
CREATE TABLE noticias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  fonte TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL UNIQUE,
  chave TEXT NOT NULL UNIQUE,      -- título normalizado (a mesma notícia em pesquisas diferentes)
  temas TEXT NOT NULL DEFAULT '',  -- ids separados por vírgulas (legislacao, taxa, siba, …)
  publicada_em TEXT NOT NULL,
  encontrada_em TEXT NOT NULL,
  vista INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX noticias_publicada ON noticias (publicada_em);
