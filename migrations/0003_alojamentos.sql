-- Vários alojamentos por gestor e configuração guardada na base de dados (em vez de variáveis do wrangler).
-- Só acrescenta: a versão anterior da app continua a funcionar até a nova ser publicada.

CREATE TABLE alojamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  morada TEXT,
  registo_al TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  codigo_cofre TEXT,
  hora_checkin TEXT NOT NULL DEFAULT '15:00',
  horas_antes_codigo INTEGER NOT NULL DEFAULT 24,
  horas_prazo_hospedes INTEGER NOT NULL DEFAULT 48,
  -- Taxa municipal turística (valor 0 = o concelho não cobra)
  concelho TEXT NOT NULL DEFAULT '',
  tmt_valor_cents INTEGER NOT NULL DEFAULT 0,
  tmt_max_noites INTEGER NOT NULL DEFAULT 0,
  tmt_idade_minima INTEGER NOT NULL DEFAULT 0,
  tmt_dia_declaracao INTEGER NOT NULL DEFAULT 15,
  tmt_dia_pagamento INTEGER NOT NULL DEFAULT 30,
  tmt_portal TEXT,
  criado_em TEXT NOT NULL
);

-- Instalação já em uso (Almada): os dados existentes passam a pertencer ao primeiro alojamento.
-- O código do cofre vem do segredo CODIGO_CHAVES e é copiado pela app no primeiro pedido.
INSERT INTO alojamentos (nome, concelho, tmt_valor_cents, tmt_max_noites, tmt_idade_minima, tmt_portal, criado_em)
SELECT 'O meu alojamento', 'Almada', 200, 5, 13, 'https://www.cm-almada.pt/inscricao-de-estabelecimentos', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM reservas) OR EXISTS (SELECT 1 FROM passos) OR EXISTS (SELECT 1 FROM declaracoes_tmt);

ALTER TABLE reservas ADD COLUMN alojamento_id INTEGER REFERENCES alojamentos(id);
UPDATE reservas SET alojamento_id = (SELECT MIN(id) FROM alojamentos);
CREATE INDEX reservas_alojamento ON reservas(alojamento_id);

ALTER TABLE passos ADD COLUMN alojamento_id INTEGER REFERENCES alojamentos(id);
UPDATE passos SET alojamento_id = (SELECT MIN(id) FROM alojamentos);

-- Declarações da taxa turística passam a ser por alojamento.
CREATE TABLE declaracoes_tmt_alojamento (
  alojamento_id INTEGER NOT NULL REFERENCES alojamentos(id),
  mes TEXT NOT NULL,
  declarado_em TEXT,
  pago_em TEXT,
  PRIMARY KEY (alojamento_id, mes)
);
INSERT INTO declaracoes_tmt_alojamento (alojamento_id, mes, declarado_em, pago_em)
SELECT (SELECT MIN(id) FROM alojamentos), mes, declarado_em, pago_em FROM declaracoes_tmt
WHERE EXISTS (SELECT 1 FROM alojamentos);

-- Palavra-passe (hash), versão da sessão, segredo de sessão gerado, etc.
CREATE TABLE definicoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
