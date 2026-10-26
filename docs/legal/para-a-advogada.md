# bookgest — resumo legal e RGPD para revisão jurídica

> Rascunho preparado a partir do funcionamento real do programa (outubro de 2026). Serve de base à conversa com a advogada;
> não é aconselhamento jurídico. Os textos públicos (provisórios) estão em:
> - https://bookgest.pt/termos — Termos de utilização
> - https://bookgest.pt/privacidade — Política de privacidade (dados dos clientes)
> - https://bookgest.pt/tratamento-de-dados — Acordo de tratamento de dados (art. 28.º RGPD)
> - https://bookgest.pt/subcontratantes — Lista de subcontratantes
> - `https://<cliente>.bookgest.pt/privacidade` — Informação aos hóspedes (art. 13.º), em PT e EN
>
> Os dados da entidade (nome, NIF, morada, RAL) preenchem-se num só sítio: `plataforma/src/legal.ts` (constante `ENTIDADE`).

## 1. O serviço

Programa online (SaaS) para gestores de Alojamento Local: check-in online dos hóspedes, código das chaves, reservas
(importadas dos calendários do Booking, Airbnb, Vrbo, etc. e de emails de reserva reencaminhados), comunicação ao SIBA (AIMA)
por webservice, faturação (ligação a InvoiceXpress, Vendus, TOConline ou ajuda para o Portal das Finanças), taxa municipal
turística e inquérito do INE. Subscrição de 4,90 €/alojamento/mês (IVA incluído), 30 dias grátis, pagamento pelo Stripe.

Dois modos:
- **Simples (alojado):** cada cliente tem uma instalação e uma base de dados próprias na conta Cloudflare do bookgest
  (`<nome>.bookgest.pt`). O bookgest é **subcontratante** dos dados dos hóspedes.
- **Privado:** instalado na conta Cloudflare do próprio cliente. O bookgest **não tem acesso** aos dados dos hóspedes;
  só recebe a chave de licença, a versão e o n.º de alojamentos ativos.

## 2. Mapa dos dados

| Titulares | Dados | Quem é responsável | Onde ficam | Conservação hoje |
|---|---|---|---|---|
| Hóspedes | Nome, data de nascimento, nacionalidade, país de residência, documento (tipo, n.º, país), datas da estadia | Gestor (bookgest = subcontratante, no modo Simples) | Base D1 do cliente (Cloudflare) | **Sem apagamento automático** (ver questão 4) |
| Titular da reserva | Dados de faturação: nome, NIF, morada, email | Gestor | Base D1 do cliente | Idem |
| Hóspedes (via emails) | Nome, datas, n.º hóspedes, valores extraídos dos emails do Booking/Airbnb reencaminhados | Gestor | Base da plataforma, até ser recolhido pela instalação | Máx. 7 dias; o email original não é guardado |
| Utilizadores do gestor | Nome, email, palavra-passe (hash) | Gestor | Base D1 do cliente | Enquanto existir a conta |
| Clientes (gestores) | Nome, email, NIF, morada, n.º de alojamentos, pagamentos | **bookgest** | Base da plataforma; Stripe; (InvoiceXpress) | Faturas: 10 anos; resto: enquanto houver conta |
| Visitantes do site | IP e pedido (registos técnicos) | bookgest | Cloudflare | Prazos da Cloudflare |

Cookies: só estritamente necessários (sessão do painel e da gestão; memória do último endereço usado para entrar). Sem análise nem publicidade.

Destinatários dos dados dos hóspedes (por instrução do gestor): AIMA/SIBA (webservice oficial), INE (só agregados),
câmara municipal (taxa turística, valores agregados), programa de faturação escolhido pelo gestor, Autoridade Tributária (via faturas).

## 3. Registo das atividades de tratamento (art. 30.º) — rascunho

**Como responsável (bookgest):**
1. Gestão de clientes e subscrições — contrato (6.º/1/b) — clientes — Stripe, InvoiceXpress, Resend, Cloudflare.
2. Faturação — obrigação legal (6.º/1/c) — clientes — AT, InvoiceXpress — 10 anos.
3. Apoio ao cliente — interesse legítimo (6.º/1/f) — clientes — email.
4. Segurança do serviço — interesse legítimo — visitantes/clientes — Cloudflare.

**Como subcontratante (por conta de cada gestor, modo Simples):**
5. Alojamento e tratamento dos dados de reservas e hóspedes — categorias da tabela acima — subcontratante ulterior: Cloudflare.

## 4. Questões para a advogada

1. **Entidade:** ENI ou sociedade unipessoal? Que dados de identificação têm de aparecer (DL 7/2004, comércio eletrónico)?
2. **Clientes consumidores?** O serviço destina-se a quem explora AL como atividade profissional. Mesmo assim, aplicam-se regras de
   consumo (direito de livre resolução de 14 dias, DL 24/2014) a pessoas singulares com AL? Como tratar o período grátis de 30 dias?
3. **Aceitação dos termos na compra direta:** hoje, no registo grátis, há uma caixa a assinalar; na compra direta (Stripe) há só o
   texto "Ao subscrever, aceita os termos…". Chega, ou deve haver caixa de aceitação no Stripe (`consent_collection`)?
4. **Prazos de conservação dos dados dos hóspedes:** que prazo aplicar aos dados de identificação comunicados ao SIBA e aos dados de faturação?
   O programa ainda não apaga automaticamente; depois de definido o prazo, implementamos o apagamento (ou anonimização) automático.
5. **Acordo de tratamento de dados (art. 28.º):** aceite por clique no registo. Chega? Prazo de notificação de violações ao cliente
   (proposta: 48 h)? Prazo para apagar os dados no fim do contrato sem pedido (proposta: 90 dias)?
6. **Subcontratantes nos EUA** (Cloudflare, Resend): confirmar que o EU-US Data Privacy Framework e/ou as cláusulas contratuais-tipo
   dos DPA destes fornecedores chegam. Convém fixar as bases de dados na UE (Cloudflare D1, jurisdição "eu") para as novas instalações?
7. **Avaliação de impacto (AIPD/DPIA):** os documentos de identificação de hóspedes justificam uma AIPD (não há categorias especiais;
   volume pequeno por cliente, mas agregado na plataforma)?
8. **Encarregado de proteção de dados (EPD/DPO):** é obrigatório? (À partida não: não é atividade principal de controlo sistemático em grande escala.)
9. **Limitação de responsabilidade** nos termos (proposta: até ao valor pago nos últimos 12 meses, exceto dolo ou culpa grave).
10. **Informação ao hóspede (art. 13.º):** o texto do check-in e da página `/privacidade` de cada instalação está adequado?
    O gestor preenche o seu nome, NIF e email em Definições.
11. **Livro de Reclamações Eletrónico e RAL:** confirmar a obrigação e a entidade RAL a indicar (ex.: CNIACC).
12. **Foro** e lei aplicável.

## 5. O que já está feito (técnico)

- Base de dados separada por cliente; HTTPS em todo o lado; palavras-passe com hash; sessões com prazo; papéis gestor/equipa.
- Links de check-in individuais e impossíveis de adivinhar; código das chaves só com check-in completo e perto da entrada.
- Emails de reserva: só os dados extraídos, apagados da plataforma até 7 dias depois; o email não é guardado.
- Avisos diários por email: só tipos e quantidades de tarefas, nunca dados de hóspedes.
- Pagamentos só no Stripe (o bookgest não vê os cartões).
- Atualizações das instalações assinadas digitalmente.
- Páginas legais publicadas como **provisórias**, com os campos por preencher assinalados.
