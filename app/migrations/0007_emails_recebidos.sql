-- Emails de reserva reencaminhados (Booking, Airbnb): os dados extraídos pela plataforma e o que foi feito com eles.
CREATE TABLE emails_recebidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_plataforma INTEGER NOT NULL UNIQUE,
  recebido_em TEXT NOT NULL,
  dados TEXT NOT NULL,
  -- 'associado' (completou ou criou uma reserva) | 'por_associar' | 'confirmacao' (Gmail) | 'arquivado'
  estado TEXT NOT NULL,
  reserva_id INTEGER REFERENCES reservas(id),
  criado_em TEXT NOT NULL
);
CREATE INDEX emails_recebidos_estado ON emails_recebidos(estado, id);
