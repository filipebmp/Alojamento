-- Taxa turística com épocas (ex.: Algarve, Mafra): valor da época baixa e meses da época alta.
-- Sem valor da época baixa (NULL), aplica-se o valor único tmt_valor_cents todo o ano.
ALTER TABLE alojamentos ADD COLUMN tmt_valor_baixa_cents INTEGER;
ALTER TABLE alojamentos ADD COLUMN tmt_alta_inicio INTEGER; -- mês (1-12)
ALTER TABLE alojamentos ADD COLUMN tmt_alta_fim INTEGER;    -- mês (1-12), inclusive
