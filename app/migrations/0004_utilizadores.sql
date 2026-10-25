-- Vários utilizadores por instalação, com entrada por email e palavra-passe.
-- A palavra-passe única anterior (definicoes.senha ou o segredo ADMIN_PASSWORD) continua a funcionar
-- até à primeira entrada com email, que cria o primeiro gestor.

CREATE TABLE utilizadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT,
  senha TEXT NOT NULL,
  -- 'gestor': tudo; 'equipa': reservas sem dados pessoais sensíveis nem configuração
  papel TEXT NOT NULL CHECK (papel IN ('gestor', 'equipa')),
  ativo INTEGER NOT NULL DEFAULT 1,
  -- Muda ao alterar a palavra-passe ou desativar: termina as sessões abertas
  versao_sessao TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  ultimo_acesso TEXT
);

-- Códigos de recuperação do gestor (guardados como hash; cada um só serve uma vez).
CREATE TABLE codigos_recuperacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilizador_id INTEGER NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  usado_em TEXT
);
CREATE INDEX codigos_utilizador ON codigos_recuperacao(utilizador_id);
