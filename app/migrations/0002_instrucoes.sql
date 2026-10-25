-- Passos do procedimento de chegada (foto + texto), mostrados ao hóspede com o código.
CREATE TABLE passos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem INTEGER NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  imagem BLOB,
  imagem_tipo TEXT,
  atualizado_em TEXT NOT NULL
);
