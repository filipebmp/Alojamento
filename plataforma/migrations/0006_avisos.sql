-- Envios de email registados para limitar abusos: recuperação de palavra-passe ou aviso diário ao gestor.
ALTER TABLE envios_email ADD COLUMN tipo TEXT NOT NULL DEFAULT 'recuperacao';
