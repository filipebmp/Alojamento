-- Regime de IVA de cada alojamento, para preparar a fatura-recibo:
-- '6' (continente), '5' (Madeira), '4' (Açores) ou 'isento' (art. 53.º do CIVA).
ALTER TABLE alojamentos ADD COLUMN regime_iva TEXT NOT NULL DEFAULT '6';
