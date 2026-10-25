-- Fatura-recibo emitida (ou criada em rascunho) no programa de faturação do gestor.
ALTER TABLE reservas ADD COLUMN fatura_programa TEXT;    -- 'invoicexpress' | 'vendus' | 'toconline'
ALTER TABLE reservas ADD COLUMN fatura_externa_id TEXT;  -- id do documento no programa (evita duplicar após um erro)
ALTER TABLE reservas ADD COLUMN fatura_pdf TEXT;         -- link para o PDF, quando o programa o devolve
