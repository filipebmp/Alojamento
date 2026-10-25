-- Recuperação de palavra-passe por email. O link enviado (token) só funciona no browser onde o pedido
-- foi feito, que guarda a segunda parte num cookie: quem transporta o email não o consegue usar.
-- Ambas as partes ficam guardadas como hash.
CREATE TABLE pedidos_recuperacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilizador_id INTEGER NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  navegador_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  usado_em TEXT
);
CREATE INDEX recuperacao_utilizador ON pedidos_recuperacao(utilizador_id, criado_em);
