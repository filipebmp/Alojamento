-- Datas no formato YYYY-MM-DD; instantes em ISO 8601 (UTC); valores em cêntimos.

CREATE TABLE reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  ref_booking TEXT,
  nome_titular TEXT NOT NULL,
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  n_hospedes INTEGER NOT NULL,
  valor_total_cents INTEGER NOT NULL DEFAULT 0,
  comissao_cents INTEGER NOT NULL DEFAULT 0,
  tmt_cobrada_cents INTEGER,
  fatura_numero TEXT,
  fatura_emitida_em TEXT,
  siba_submetido_em TEXT,
  cancelada INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE hospedes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserva_id INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  titular INTEGER NOT NULL DEFAULT 0,
  nome TEXT NOT NULL,
  data_nascimento TEXT NOT NULL,
  nacionalidade TEXT,
  pais_residencia TEXT,
  doc_tipo TEXT,
  doc_numero TEXT,
  doc_pais TEXT,
  criado_em TEXT NOT NULL
);

CREATE INDEX hospedes_reserva ON hospedes(reserva_id);

CREATE TABLE faturacao (
  reserva_id INTEGER PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  nif TEXT NOT NULL,
  pais TEXT NOT NULL,
  morada TEXT,
  codigo_postal TEXT,
  cidade TEXT,
  email TEXT
);

CREATE TABLE declaracoes_tmt (
  mes TEXT PRIMARY KEY,
  declarado_em TEXT,
  pago_em TEXT
);
