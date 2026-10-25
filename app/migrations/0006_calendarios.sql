-- Importação de reservas a partir dos calendários iCal do Booking, do Airbnb e de outras plataformas.

CREATE TABLE calendarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alojamento_id INTEGER NOT NULL REFERENCES alojamentos(id),
  plataforma TEXT NOT NULL,            -- 'booking' | 'airbnb' | 'outra'
  url TEXT NOT NULL,
  ultima_sincronizacao TEXT,
  erro TEXT,
  criado_em TEXT NOT NULL
);

ALTER TABLE reservas ADD COLUMN origem TEXT NOT NULL DEFAULT 'manual';   -- 'manual' | plataforma do calendário
ALTER TABLE reservas ADD COLUMN uid_externo TEXT;                        -- UID do evento no calendário
ALTER TABLE reservas ADD COLUMN incompleta INTEGER NOT NULL DEFAULT 0;   -- importada: falta nome e n.º de hóspedes
ALTER TABLE reservas ADD COLUMN ignorada INTEGER NOT NULL DEFAULT 0;     -- datas bloqueadas que não são uma reserva
ALTER TABLE reservas ADD COLUMN desaparecida_em TEXT;                    -- deixou de aparecer no calendário
CREATE UNIQUE INDEX reservas_uid ON reservas(alojamento_id, uid_externo) WHERE uid_externo IS NOT NULL;
