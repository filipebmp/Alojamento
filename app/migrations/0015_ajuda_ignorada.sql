-- Barra de boas-vindas no ecrã Hoje ("Veja os primeiros passos"), até o utilizador a ignorar.
ALTER TABLE utilizadores ADD COLUMN ajuda_ignorada INTEGER NOT NULL DEFAULT 0;
