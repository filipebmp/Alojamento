-- Plataforma comercial: só dados de clientes e licenças. Nunca reservas nem hóspedes.
-- Instantes em ISO 8601 (UTC); valores em cêntimos.

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_customer_id TEXT UNIQUE,
  email TEXT,
  nome TEXT,
  nif TEXT,
  pais TEXT,
  morada TEXT,
  codigo_postal TEXT,
  cidade TEXT,
  criado_em TEXT NOT NULL
);

CREATE TABLE licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  cliente_id INTEGER REFERENCES clientes(id),
  -- 'stripe' (assinatura paga) ou 'cortesia' (criada à mão: o próprio fornecedor, piloto)
  tipo TEXT NOT NULL,
  stripe_checkout_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_estado TEXT,
  alojamentos_pagos INTEGER NOT NULL DEFAULT 0,
  revogada INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  -- Última comunicação da instalação
  versao TEXT,
  alojamentos_ativos INTEGER,
  ultima_comunicacao TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE faturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  cliente_id INTEGER REFERENCES clientes(id),
  licenca_id INTEGER REFERENCES licencas(id),
  valor_cents INTEGER NOT NULL,
  alojamentos INTEGER NOT NULL,
  periodo_inicio TEXT,
  periodo_fim TEXT,
  pago_em TEXT NOT NULL,
  -- 'por_emitir' | 'emitida' | 'erro'
  estado TEXT NOT NULL DEFAULT 'por_emitir',
  numero TEXT,
  invoicexpress_id TEXT,
  erro TEXT,
  emitida_em TEXT
);

-- Eventos do Stripe já tratados (o Stripe pode reenviar o mesmo evento).
CREATE TABLE eventos_stripe (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  recebido_em TEXT NOT NULL
);

CREATE TABLE definicoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
