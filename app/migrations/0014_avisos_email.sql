-- Aviso diário por email com as tarefas com prazo a terminar (gestores; pode ser desligado em A minha conta).
ALTER TABLE utilizadores ADD COLUMN avisos_email INTEGER NOT NULL DEFAULT 1;
