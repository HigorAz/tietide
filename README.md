# Capa

- **Título do Projeto**: TieTide - Plataforma de Integrações e Automações de Processos.
- **Nome do Estudante**: Higor Azevedo.
- **Curso**: Engenharia de Software.
- **Data de Entrega**: [Data].

# Resumo

Este documento detalha a proposta de projeto para o desenvolvimento do TieTide, um software utilizado como plataforma de automação e integração como serviço (IPaaS). O projeto visa resolver o problema da "Fragmentação Digital" enfrentado por empresas modernas, oferecendo uma solução low-code, open-source e auto-hospedável, que combine integração entre sistemas e automação de tarefas e processos de negócio. A ideia da TieTide é oferecer um equilíbrio estratégico entre a robustez exigida por desenvolvedores e a simplicidade necessária para a agilidade na implantação dos processos. Os principais diferenciais da TieTide são sua experiência de usuário superior, a "Maré de Dados", e uma funcionalidade inovadora de geração de documentação de processos via Inteligência Artificial. A plataforma será construída com tecnologias modernas, incluindo TypeScript, React, NestJS e Docker, seguindo os princípios de software maduro.

# 1. Introdução

## **1.1 Contexto**

Na economia digital, a adoção de softwares como serviço (SaaS) tornou-se um pilar para a eficiência empresarial, em que seus departamentos internos optam por utilizar as ferramentas que mais se adequam as suas necessidades, com ferramentas especializadas para CRM, comunicação, marketing, finanças, operações e entre outros. Embora essa especialização otimize tarefas isoladas, ela gera um desafio operacional significativo: a fragmentação digital. Dados e processos críticos acabam confinados em "silos" tecnológicos, com baixa ou nenhuma conexão entre si. Como consequência, as organizações recorrem a workarounds manuais que são ineficientes, propensos a erros e insustentáveis em escala.

## **1.2 Justificativa**

O mercado atual de plataformas de integração (IPaaS) oferece soluções para este problema, mas apresenta lacunas claras. De um lado, ferramentas no-code como o Zapier oferecem simplicidade, mas são restritas em robustez e podem ter um custo elevado em alto volume. No extremo oposto, plataformas enterprise como MuleSoft e Workato são extremamente poderosas, porém com uma complexidade e um custo de licenciamento que as tornam inviáveis para a maioria das pequenas e médias empresas. Soluções open-source como o n8n oferecem a flexibilidade necessária para desenvolvedores, mas frequentemente carecem de uma experiência de usuário polida que atenda também a analistas técnicos e de processos.
A TieTide justifica-se por se posicionar estrategicamente neste espaço. O projeto propõe uma solução que une a robustez e o controle exigidos por desenvolvedores com uma interface visual e intuitiva que empodera um público técnico mais amplo. A adição de uma funcionalidade inovadora, como a documentação de processos gerada por IA, reforça ainda mais a necessidade de uma nova abordagem no setor, focada não apenas em conectar, mas em gerenciar e documentar a automação de forma inteligente.

## **1.3 Objetivos**

### **1.3.1 Objetivo Principal**

Desenvolver uma plataforma iPaaS funcional que permita a criação, execução, monitoramento e documentação de workflows de integração e automação de processos de forma visual e intuitiva.

### **1.3.2 Objetivos Específicos**

- **Implementar o editor visual de workflows (“Maré de Dados”)**
  Desenvolver um canvas de arrastar e soltar que permita criar, editar e salvar workflows com pelo menos:
  - 3 tipos de gatilhos (Manual, Agendado/Cron, Webhook);
  - 3 tipos de ações (Requisição HTTP, Execução de Código, Condicional IF).
- **Construir o motor de execução assíncrono para workflows de integração e automação**
  Implementar um worker desacoplado da API, utilizando fila de mensagens, capaz de:
  - Processar workflows com múltiplos nós;
  - Manter o tempo de execução de um workflow simples abaixo de 5 segundos em 95% dos casos (em ambiente de teste controlado).
- **Entregar histórico e observabilidade básica das execuções**
  Implementar uma interface de histórico que exiba, para cada execução:
  - Status (sucesso/falha);
  - Data/hora de início e fim;
  - Logs em JSON por nó do workflow.
- **Desenvolver uma Prova de Conceito de documentação automática por IA**
  Criar um endpoint que receba a estrutura JSON de um workflow e gere uma descrição textual do processo (em linguagem natural), incluindo:
  - Objetivo do fluxo;
  - Principais etapas (gatilhos, ações e decisões).
- **Empacotar a plataforma para deploy via Docker e CI/CD**
  Disponibilizar a aplicação (frontend, API e worker) em containers Docker orquestrados por docker-compose, permitindo subir o ambiente com um único comando, além de:
  - Configurar um pipeline de CI/CD (GitHub Actions) que execute testes automatizados e build de imagens a cada push na branch principal.
- **Garantir critérios mínimos de qualidade técnica (“software maduro”)**
  Estabelecer e atingir metas objetivas de qualidade, como:
  - Cobertura de testes automatizados mínima de 70% nos módulos centrais (engine de execução, API de workflows);
  - Tempo de resposta médio da API abaixo de 200 ms em 95% das requisições de leitura em ambiente de teste;
  - Nenhum requisito funcional crítico (RF01–RF07) sem pelo menos um teste automatizado associado.

# 2. Descrição do Projeto

## **2.1 Linha de Projeto**

Web Apps.

## **2.2 Tema do Projeto**

Desenvolvimento de uma Plataforma de Automação e Integração como Serviço (iPaaS) com foco em Low-Code, Experiência do Usuário e Inovação Funcional.

## **2.3 Propósito e Uso Prático**

Mitigar o desafio constante de integrar múltiplas ferramentas com agilidade e, ao mesmo tempo, automatizar processos de negócio que hoje dependem de intervenção manual. Na prática, a plataforma permite a integração de ferramentas e a automação de tarefas e processos que hoje dependem de intervenção manual. Um caso de uso típico seria: "Quando um novo cliente é cadastrado no CRM, disparar um fluxo que automaticamente o adiciona a uma lista de e-mail marketing, cria uma pasta para ele no Google Drive e notifica a equipe de sucesso do cliente via Slack".

## **2.4 Público-Alvo**

Profissionais de tecnologia e de processos, na faixa dos 20 aos 45 anos, incluindo Desenvolvedores, Analistas e Líderes Técnicos.

## **2.5 Problemas a Resolver**

- Fragmentação Digital e Silos de Dados: A falta de comunicação nativa entre ferramentas SaaS essenciais;
- Ineficiência de Processos Manuais: A dependência de tarefas repetitivas e de baixo valor que consomem tempo e recursos;
- Alto Custo e Complexidade de Soluções Atuais: A lacuna entre ferramentas no-code limitadas e plataformas enterprise inacessíveis;
- Falta de Documentação de Processos: A dificuldade de manter um registro claro e atualizado de como as automações funcionam.

## **2.6 Diferenciação/Ineditismo**

Os principais pontos são a experiência de usuário (UX) superior, a documentação de processos gerada por IA, o equilíbrio entre low-code e pro-code e um modelo open-source e auto-hospedável.

## **2.7 Limitações**

Para garantir a viabilidade e a excelência na entrega dentro do escopo acadêmico, o projeto em sua versão inicial (MVP) não abrangerá:

- Uma biblioteca extensa de conectores pré-construídos para centenas de serviços, será limitado de 3 à 5 conectores;
- Funcionalidades de nível enterprise, como gerenciamento de equipes multi-tenant, dashboards complexos de usabilidade e permissões de acesso granulares;
- Um marketplace para conectores desenvolvidos pela comunidade.

## **2.8 Normas e Legislações Aplicáveis**

O projeto observará as seguintes normas e legislações:

- Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018): A arquitetura auto-hospedável da TieTide é um diferencial que facilita a conformidade com a LGPD, pois permite que as empresas processem e armazenem seus dados em sua própria infraestrutura;
- Licenças de Software: O projeto será distribuído sob uma licença open-source permissiva (MIT) e garantirá a conformidade com as licenças de todas as bibliotecas e frameworks de terceiros utilizados.

## **2.9 Métricas de Sucesso**

O sucesso do projeto será medido pelos seguintes critérios:

- Métricas Funcionais: Implementação bem-sucedida de todas as funcionalidades definidas como escopo do MVP, incluindo o canvas de nós, o motor de execução e a Prova de Conceito da IA de documentação;
- Métricas Técnicas: Atingimento das metas de requisitos não-funcionais, como tempo de resposta da API abaixo de 200ms e tempo de execução de workflows simples abaixo de 5 segundos;

# 3. Especificação Técnica

Esta seção descreve em detalhes a proposta técnica para o desenvolvimento da TieTide, abrangendo os requisitos de software, as decisões de arquitetura e a stack tecnológica selecionada.

## 3.1. Requisitos de Software

### **3.1.1 Requisitos Funcionais (RF)**

- RF01. Gestão de Usuários: O sistema deverá permitir o cadastro e login de usuários, com autenticação baseada em JWT (JSON Web Tokens);

- RF02. Gestão de Workflows: O sistema deverá prover funcionalidades CRUD (Criar, Ler, Atualizar, Deletar) completas para os workflows;

- RF03. Editor Visual de Fluxo: A interface deverá apresentar um canvas de "arrastar e soltar" que permita ao usuário adicionar nós, posicioná-los livremente e conectá-los para definir o fluxo de dados;

- RF04. Nós Essenciais: A versão MVP deverá conter os seguintes nós funcionais:
  - Gatilhos: Manual, Agendado (Cron) e Webhook;
  - Ações: Requisição HTTP, Execução de Código (Node.js/TypeScript) e Lógica Condicional (IF).

- RF05. Motor de Execução: O sistema deverá processar os workflows de forma assíncrona, utilizando uma fila de mensagens para garantir desempenho e resiliência;

- RF06. Histórico de Execuções: A interface deverá exibir um histórico de todas as execuções de um workflow, com seu status (sucesso, falha), data e logs detalhados;

- RF07. Documentação por IA (PoC): O sistema deverá ter um endpoint que, ao receber a estrutura de um workflow em formato JSON, retorne uma descrição textual do processo gerada por um modelo de IA.

### **3.1.2 Requisitos Não-Funcionais (RNF)**

- RNF01. Desempenho: As respostas da API devem ter uma latência inferior a 200ms para 95% das requisições. A sobrecarga de execução de um workflow simples deve ser inferior a 5 segundos;

- RNF02. Escalabilidade: A arquitetura do motor de execução (workers) deverá ser projetada para permitir escalabilidade horizontal independente da API principal;

- RNF03. Disponibilidade: O sistema deverá ser projetado para alta disponibilidade, incluindo endpoints de health check para monitoramento;

- RNF04. Extensibilidade: A arquitetura deverá ser modular, permitindo a adição de novos conectores (nós) com o mínimo de impacto no núcleo do sistema (Plugin Architecture);

- RNF05. Usabilidade: A interface deve ser intuitiva para o público-alvo, minimizando a curva de aprendizado para a criação de workflows complexos.

### **3.1.3 Representação dos Requisitos**

Um Diagrama de Casos de Uso (UML) será fornecido como apêndice para ilustrar as principais interações do usuário com o sistema, incluindo a criação, edição, execução e monitoramento de workflows de integração e automação de processos.

### **3.1.4 Aderência aos Requisitos da Linha de Projeto**

O projeto se enquadra na linha Web Apps e cumpre todos os seus requisitos obrigatórios, como hospedagem pública, funcionalidades reais, arquitetura definida e código-fonte versionado, aplicados a uma solução que atua como plataforma central de integração e automação de processos de negócio.

## 3.2. Considerações de Design

### **3.2.1 Visão Inicial da Arquitetura**:

- Frontend (SPA): React + React Flow (canvas “Maré de Dados”), Tailwind, shadcn/ui.

- API (NestJS): autenticação, gestão de workflows, histórico, webhooks e orquestração de jobs.

- Worker/Engine (NestJS): scheduler/cron, executor de nós, retries/backoff, DLQ.

- Fila (Valkey): enfileiramento de jobs via BullMQ (fallback para Redis OSS se necessário).

- Banco (PostgreSQL): usuários, workflows, execuções, auditoria e secrets (cifrados).

- Observabilidade: Loki/Promtail (logs, 30 dias), Prometheus (métricas), Grafana (dashboards).

- Gateway: Traefik (TLS/Let’s Encrypt, roteamento, rate-limit/headers).

- Serviço de IA (PoC): FastAPI (Python) + modelo local (Llama/Mistral) com RAG para gerar documentação de processos.

### **3.2.2 Padrões de Arquitetura**:

- Arquitetura em camadas (API/Worker): controllers → services → repositories/adapters.

- Event-Driven entre API ↔ Worker via fila (jobs e repeatables).

- Monorepo (pnpm/turborepo): compartilhamento de tipos e SDK de conectores.

- Ports & Adapters (Clean) para infra (DB, fila, HTTP externo).

- Sem CQRS no MVP (evita complexidade desnecessária).

### **3.2.3 Modelos C4**

#### **3.2.3.1 Context**

<img width="2928" height="1520" alt="Untitled diagram-2025-11-18-000101" src="https://github.com/user-attachments/assets/8abcf15b-5285-4345-9e3c-3bb3944353db" />

#### **3.2.3.2 Container**

<img width="3176" height="1604" alt="Untitled diagram-2025-11-18-000121" src="https://github.com/user-attachments/assets/891d6965-cbd5-49f8-995d-bc3370d0d4a2" />

#### **3.2.3.3 Component**

<img width="2802" height="3800" alt="Untitled diagram-2025-11-18-001546" src="https://github.com/user-attachments/assets/f6f8b27a-cf60-4aeb-a46e-141e63d29089" />

#### **3.2.3.4 Code**

<img width="3276" height="978" alt="Untitled diagram-2025-11-18-002130" src="https://github.com/user-attachments/assets/8becc8b9-e0dd-4400-87a6-f19fb18f062a" />

### **3.2.4 Mockups das Telas Principais**

- Canvas (“Maré de Dados”): área central escura (#0A2540) com nós híbridos (círculo + cartão), anel de status pulsante, arestas “tinta viva” animadas em teal (#00D4B3).

- Biblioteca de Nós (esquerda): pesquisa + categorias (Gatilhos, Ações, Lógica, Conectores).

- Painel Lateral (direita): propriedades do nó (inputs/outputs, validações), botões de teste/preview.

- Histórico/Execuções: tabela com filtro por workflow/status/data; detalhe da execução com logs por nó, tempo total e payloads saneados.

- Configurações: secrets (nome/valor mascarado), webhooks assinados (HMAC), endpoints e credenciais.

Identidade:

- Fundo: #0A2540

- Acento/fluxo: #00D4B3

- Texto primário: #F6F8FA | secundário: #6B7C93

Sucesso: #12B886 | Erro: #F03E3E | Aviso: #FAB005
(expostas como CSS Variables da aplicação)

### **3.2.5 Decisões e Alternativas Consideradas**

Esta seção consolida decisões do projeto como um todo (produto, UX, arquitetura, dados, IA, segurança e entrega), registrando opções avaliadas, critérios (custo para MVP, maturidade, open-source, auto-hospedagem/LGPD, simplicidade operacional) e justificativas.

#### **3.2.5.1 Produto & UX**

- Tema visual (Dark Mode) vs Light

Escolha: Dark by default.

Motivo: Aderência ao público técnico (maior uso noturno, contraste com grafos), menor fadiga visual e sinergia com a metáfora “Maré de Dados”.

Identidade: Paleta que remete ao mar profundo (fundo #0A2540), acento bioluminescente (#00D4B3), tipografia e hierarquia de contraste pensadas para legibilidade.

- Canvas de workflows (React Flow) vs construção do zero

Escolha: React Flow.

Motivo: Lib estável, MIT, ótima para grafos interativos, acelera MVP com custom edges (efeito “tinta viva”) e nós híbridos.

- Low-code + pro-code vs apenas no-code

Escolha: Equilíbrio low-code/pro-code.

Motivo: Atende analistas e desenvolvedores; no MVP, Code Node fica desativado por segurança, preservando o caminho para extensões pro-code no futuro.

#### **3.2.5.2 Linguagens & Stack**

- TypeScript full-stack vs mix de linguagens

Escolha: TypeScript 100% em Frontend/API/Worker.

Motivo: Tipagem forte, produtividade, compartilhamento de tipos, comunidade e ferramentas maduras.

- Python para IA vs Node para IA

Escolha: Python (FastAPI) para o serviço de IA.

Motivo: Ecossistema de LLMs, bibliotecas de NLP e tooling de RAG mais robustos; integração via HTTP com a API TS.

#### **3.2.5.3 Arquitetura de Software**

- Arquitetura em camadas + Ports & Adapters vs ad-hoc

Escolha: Camadas (controllers → services → repositories/adapters) com Ports & Adapters nos pontos de infra.

Motivo: Testabilidade, isolamento de domínio, facilidade de troca de provedores.

- Event-Driven (fila) vs execução síncrona

Escolha: Event-Driven com enfileiramento.

Motivo: Desacoplamento, resiliência, paralelismo e controles de retry/backoff.

- Monorepo vs multirepo

Escolha: Monorepo (pnpm/turbo).

Motivo: Reuso de tipos/utilitários, versionamento simplificado do SDK de conectores.

- CQRS

Escolha: Não adotar no MVP.

Motivo: Complexidade não compensa agora; espaço para evoluir se leitura/escala exigirem.

#### **3.2.5.4 Execução & Orquestração**

- BullMQ + Valkey vs RabbitMQ/Kafka

Escolha: BullMQ + Valkey (compatível com Redis); fallback para Redis OSS.

Motivo: Simplicidade operacional, custo zero, repeatable jobs (cron) nativos; suficiente para throughput esperado no MVP.

- Cron distribuído

Escolha: Repeatables do BullMQ.

Motivo: Locks na store, evita duplicidades em escala horizontal sem serviços extras.

#### **3.2.5.5 Dados, Logs & Observabilidade**

- PostgreSQL vs MySQL/SQLite

Escolha: PostgreSQL.

Motivo: JSONB, robustez, extensões, padrão de mercado; bom para workflows, execuções e auditoria.

- Logs (Loki) vs Elastic/OpenSearch

Escolha: Loki no MVP (retenção 30 dias).

Motivo: Leve, econômico e simples para começar; trilha aberta para OpenSearch quando houver necessidade de busca/analytics avançados.

- Métricas & Tracing

Escolha: Prometheus + Grafana (+ OpenTelemetry).

Motivo: Stack OSS consolidada, baixo custo, dashboards claros para banca e operação.

#### **3.2.5.6 Segurança & Conformidade**

- Auth: JWT + opção de OAuth2/OIDC (SSO) em roadmap curto; RBAC básico (admin/usuário) no MVP.

- Secrets: armazenados no Postgres cifrados com libsodium (XChaCha20-Poly1305); chave mestra versionada com SOPS/age (migração para KMS em cloud no produto).

- Webhooks: HMAC (SHA-256), timestamp/nonce e replay protection, allowlist opcional.

- Code Node: desativado no MVP; roadmap de sandbox (isolated-vm/containers efêmeros) para mitigar RCE e fuga de isolamento.

- Normas: LGPD (minimização, base legal, direitos do titular, registro de operações), OWASP Top 10, ISO 27001 (boas práticas) e WCAG (AA básico).

#### **3.2.5.7 IA (documentação de processos)**

- Modelo local (Llama/Mistral) + RAG vs API proprietária externa

Escolha: Modelo local + RAG no serviço Python.

Motivo: Reduz dependência e custo por chamada, facilita ajuste fino e privacidade; alinhado a auto-hospedagem e requisitos de conformidade.

Treino/Base: conhecimento do domínio (estrutura JSON do workflow, taxonomia de nós, exemplos anotados) e prompt pipeline explicável; anonimização de PII antes do processamento.

#### **3.2.5.8 Entrega & Operação**

- Gateway: Traefik vs Nginx → Traefik pela integração com Docker, ACME/Let’s Encrypt automático, middlewares e observabilidade.

- Empacotamento/Deploy: Docker Compose em VPS (MVP) com hardening (TLS, headers, backups, healthchecks); roadmap para Kubernetes (auto-scaling, ingress, secrets via KMS) quando houver tração.

- CI/CD: GitHub Actions (lint, testes, coverage, build/push de imagens, segurança básica com scanner, deploy por SSH).

- Custo/viabilidade: priorizadas alternativas open-source e/ou gratuitas para o MVP (Valkey, Postgres, Loki/Prometheus/Grafana, Traefik, React Flow), mantendo caminho claro para evolução enterprise.

#### **3.2.5.9 Extensibilidade (Conectores)**

- Modelo de plugins (NPM) vs conectores acoplados

Escolha: Plugins NPM com contrato/manifesto (inputs/outputs, validação, versionamento semântico).

Motivo: Facilita catálogo interno agora e marketplace/comunidade no futuro; no MVP, conectores produzidos pelo autor com SDK oficial.

### **3.2.6 Critérios de Escalabilidade, Resiliência e Segurança**

- Escalabilidade: API e Worker escaláveis horizontalmente; cron distribuído por repeatables + locks na fila; métricas para auto-scale futuro (K8s).

- Resiliência: retries por nó com backoff exponencial; DLQ por execução; circuit breaker/timeouts por conector; idempotência (eventId/jobKey).

- Segurança: JWT + OAuth2 (OIDC) opcional; RBAC básico (admin/usuário); secrets cifrados (libsodium) no Postgres com chave gerida por SOPS/age; webhooks com HMAC + proteção a replay.

## 3.3. Stack Tecnológica

### **3.3.1 Linguagens de Programação**

- TypeScript (Frontend, API e Worker)

Por quê: tipagem forte end-to-end, redução de bugs, DX superior, reaproveitamento de tipos/SDK de conectores, base única de linguagem.

Impacto no MVP: acelera desenvolvimento, melhora manutenção e testes; facilita monorepo.

Alternativas consideradas: JS puro (menos segurança de tipos), Go/Java no backend (mais overhead para o escopo atual).

- Python (FastAPI) para o serviço de IA

Por quê: ecossistema maduro para LLM/RAG (Llama/Mistral, libs de embeddings, vetorização), comunidade enorme e muita referência.

Impacto no MVP: PoC de documentação por IA mais rápido e com melhor tooling.

Alternativas consideradas: Node para IA (menos bibliotecas de NLP/LLM), chamadas a APIs proprietárias (dependência e custo por uso).

### **3.3.2 Frameworks e Bibliotecas**

#### **3.3.2.1 Frontend**

- React: padrão de mercado, ecossistema vasto, componentes/estado previsíveis.

- Vite: bundling e dev server extremamente rápidos → iteração veloz no MVP.

- Tailwind CSS: produtividade em UI, consistência visual, fácil aplicar design tokens (paleta “maré”).

- shadcn/ui: componentes acessíveis e modernos, acelera construção de telas.

- React Flow: canvas de grafos pronto para drag-and-drop e custom edges/nodes → base da “Maré de Dados”.

- Zustand: state management simples e performático para editor/histórico.

#### **3.3.2.2 API**

- NestJS: estrutura em camadas, injeção de dependências, testes fáceis, padrão enterprise.

- Prisma (ORM) + PostgreSQL: migrações seguras, schema declarado, JSONB e robustez do Postgres.

- class-validator / Zod: validação forte nas bordas (evita injeção e dados inválidos).

- OpenAPI/Swagger: contrato claro para o Frontend e documentação automática.

#### **3.3.2.3 Worker**

- NestJS: reaproveita padrão/boas práticas da API.

- BullMQ (com Valkey): enfileiramento, repeatable jobs (cron), retries/backoff/DLQ prontos; custo zero.

#### **3.3.2.4 Observabilidade**

- Prometheus: coleta de métricas padrão de mercado.

- Grafana: dashboards para saúde/execuções, úteis para banca e operação.

- Loki + Promtail: logs leves com retenção de 30 dias; simples de manter no MVP.

- OpenTelemetry (OTLP): trilha para tracing distribuído e futura evolução.

#### **3.3.2.5 Segurança**

- libsodium: criptografia moderna (XChaCha20-Poly1305) para secrets.

- Helmet: security headers padrão na API.

- CORS estrito: restringe origens e métodos.

- Rate-limit (Traefik/Nest): proteção básica contra abuso/DoS.

#### **3.3.2.6 DevX (Qualidade)**

- ESLint + Prettier: estilo e linting consistentes.

- Husky + lint-staged: checagens no pre-commit (evita lixo no repo).

- Commitlint (Conventional Commits): changelog e versionamento semântico fáceis.

#### **3.3.2.7 CI/CD**

- GitHub Actions: pipeline único para lint, testes, coverage, build Docker, security scan e deploy.
  - Benefício: automação reprodutível e visível; prepara para CD no VPS/K8s.

#### **3.3.2.8 Deploy**

- Docker Compose (VPS): simplicidade e baixo custo no MVP; sobe API, SPA, Worker, Valkey, Postgres, Traefik e observabilidade rapidamente.

- Roadmap K8s (k3s/managed): quando houver tração/escala → auto-scaling, ingress gerenciado, secrets via KMS.
  - Motivo: evita complexidade prematura e mantém caminho claro de evolução.

### **3.3.3 Ferramentas de Desenvolvimento e Gestão**

- IDEs: VS Code + extensões TS/ESLint/Prisma.

- Versionamento: GitHub + Projects (Kanban), branching simples (main/dev/feature/\*).

- Artefatos: GitHub Container Registry.

- Documentação: Wiki do repositório (guia de deploy, runbooks, contratos de conectores).

### **3.3.4 Licenciamento**

| Componente/Lib                      | Licença                               | Observação                     |
| ----------------------------------- | ------------------------------------- | ------------------------------ |
| **TieTide (projeto)**               | **MIT**                               | Repositório principal          |
| React / Vite / Tailwind / shadcn/ui | MIT                                   | UI e build                     |
| React Flow                          | MIT                                   | Canvas de nós                  |
| NestJS                              | MIT                                   | API/Worker                     |
| Prisma                              | Apache-2.0                            | ORM                            |
| BullMQ                              | MIT                                   | Fila/jobs                      |
| Valkey                              | BSD-like _(confirmar na implantação)_ | Protocolo compatível com Redis |
| Prometheus / Grafana / Loki         | Apache-2.0                            | Observabilidade                |
| FastAPI                             | MIT                                   | Serviço IA                     |
| libsodium                           | ISC                                   | Criptografia                   |

## 3.4. Considerações de Segurança

### **3.4.1 Riscos Identificados**

- Injeção (SQL/Command)

- Quebra de autenticação/autorização

- Exposição de secrets/tokens

- Quebra de isolamento no “Code Node”

- DoS/abuso (rate-limit insuficiente)

### **3.4.2 Medidas de Mitigação**

- Validação rigorosa (DTOs + class-validator/Zod), sanitização/escaping.

- Rate-limit e circuit breaker por conector (timeouts, bulkhead de concorrência).

- Criptografia em repouso para secrets: libsodium (XChaCha20-Poly1305) no Postgres; chave mestra via SOPS/age (KMS no roadmap).

- Criptografia em trânsito: TLS obrigatório no gateway.

- Webhooks seguros: HMAC (SHA-256) + timestamp/nonce (proteção a replay), whitelist opcional de IPs.

- Auditoria: trilhas de quem criou/alterou/executou workflows; retenção de 30 dias para logs de aplicação.

- Headers de segurança: via Traefik + Helmet (CSP, HSTS, X-Content-Type, etc.).

### **3.4.3 Normas e Boas Práticas Seguidas**

- OWASP Top 10 (riscos e controles).

- ISO/IEC 27001 (adoção de boas práticas/controles selecionados).

- LGPD (minimização, base legal/consentimento quando aplicável, direitos do titular, política de privacidade, registro de operações).

### **3.4.4 Responsabilidade Ética**

- Privacidade: anonimização/remoção de PII do JSON antes de enviar ao serviço de IA.

- Transparência: indicar que a documentação é gerada por IA; manter versão/histórico.

- Qualidade: prompt pipeline com checagem de consistência; avaliação humana quando necessário.

- Viés: usar instruções neutras e corpus técnico; permitir override manual do texto gerado.

## 3.5. Conformidade e Normas Aplicáveis

- LGPD – Lei Geral de Proteção de Dados
  - Minimizar dados tratados; coletar apenas o necessário ao workflow.

  - Consentimento/base legal quando conectores exigirem dados pessoais.

  - Direitos do titular (acesso/correção/eliminação mediante controle do operador do ambiente).

  - Registro de operações (auditoria de execuções/alterações).

- OWASP Top 10 — referência para análise de riscos e testes.

- WCAG (AA básico) — contraste, navegação por teclado e aria no SPA.

- ISO/IEC 25010 — metas de qualidade (confiabilidade, desempenho, manutenibilidade, usabilidade).

- ISO/IEC 27001 (boas práticas) — gestão de secrets, controle de acesso, backups e resposta a incidentes.

Políticas operacionais (MVP)

- Retenção de logs: 30 dias (Loki).

- Backups: PostgreSQL diário (criptografado); teste de restauração semanal.

- Incidentes: regra de notificação por e-mail (SMTP configurável) ao atingir limiares de falhas (ex.: N retries/dlq, serviço fora do ar).

- Deploy: Docker Compose (VPS) com hardening; roadmap para Kubernetes (auto-scaling, secrets no KMS, ingress gerenciado).

# 4. Próximos Passos

## 4.1 Cronograma

| Período              | Sprint/Fase                          | Objetivo                                              | Entregas (Exit criteria)                                                                                                                                                                                                      |
| -------------------- | ------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Até 30/11/2025**   | **CP0 – Entrega do RFC**             | RFC v1.0 aprovado                                     | RFC consolidado (seções 1–3 completas + 3.2.5 decisões + 3.3 stack + 3.4 segurança + 3.5 conformidade) assinado/validado                                                                                                      |
| **01–14/12/2025**    | **S0 – Kickoff técnico**             | Monorepo + infraestrutura mínima sobem local e na VPS | Repositório monorepo (`apps/spa`,`apps/api`,`apps/worker`,`apps/ai`,`packages/sdk`,`infra/`); Docker Compose com **Postgres, Valkey, Traefik, Prometheus, Grafana, Loki/Promtail**; README com “como subir”; domínio + TLS ok |
| **15–28/12/2025**    | **S1 – Editor base (Maré de Dados)** | Canvas e nós básicos funcionam                        | React + Vite + Tailwind + shadcn/ui + **React Flow**; nó custom + aresta “tinta viva”; criar/salvar/abrir workflow no browser (local state) + persistência simplificada via API stub                                          |
| **29/12–05/01/2026** | **Buffer de fim de ano**             | Hardening/ajustes                                     | Issues de débitos S0/S1 fechadas; healthchecks e dashboards básicos no ar                                                                                                                                                     |
| **06–19/01/2026**    | **S2 – Autenticação & Secrets**      | Login/JWT + cofres de secrets cifrados                | Auth (NestJS) com JWT; tabela `users`; **libsodium** para cifrar secrets no Postgres; painel de secrets na SPA (criar/editar/mascarar); testes unitários de crypto                                                            |
| **20/01–02/02/2026** | **S3 – CRUD de Workflows**           | API de workflows completa + versionamento simples     | Endpoints CRUD (`/workflows`); schema Prisma (users, workflows, runs, steps, secrets); versionamento simples (v1, v2…); Swagger/OpenAPI publicado; testes integração básicos                                                  |
| **03–16/02/2026**    | **S4 – Fila & Executor (básico)**    | BullMQ + Valkey; executar **HTTP, IF, Delay**         | Producer/consumer; **idempotency key**; **HTTP** com timeout/circuit breaker; **IF** (eval segura); **Delay/Cron adapter**; persistência de `runs/steps`                                                                      |
| **17/02–02/03/2026** | **S5 – Webhooks & Cron real**        | Webhook-in seguro + repeatables confiáveis            | Webhook com **HMAC + timestamp/nonce**; validação de origem; **repeatable jobs** (cron) com lock; testes de duplicidade; cenários fim-a-fim (enqueue→executa→persiste)                                                        |
| **03–16/03/2026**    | **S6 – Histórico & Observabilidade** | Tela de execuções + logs e métricas                   | Tela **Histórico** com filtro (status/data); detalhe do step (payload saneado); **Loki** com retenção 30d; **dashboards Grafana** (taxa sucesso/falha, latência, throughput); alertas por e-mail SMTP básico                  |
| **17–30/03/2026**    | **S7 – IA PoC (RAG)**                | Serviço **FastAPI** gera documentação                 | `apps/ai` com **FastAPI**; ingestão mínima (RAG) com taxonomia de nós/JSON do workflow; endpoint `/doc-from-workflow`; integração na SPA (botão “Gerar documentação”); logs e métricas do serviço IA                          |
| **31/03–13/04/2026** | **S8 – Qualidade & Performance**     | Cobertura testes + metas de desempenho                | **70%+** cobertura em engine/API; p95 **< 200 ms** nas leituras; workflow simples p95 **< 5 s**; testes de carga leve; pipeline CI com lint/test/coverage/build/push                                                          |
| **14–27/04/2026**    | **S9 – Segurança & Resiliência**     | Rate-limit, DLQ, auditoria                            | Rate-limit (Traefik ou Nest); **DLQ** por execução; auditoria (quem criou/alterou/executou); headers de segurança (Helmet + Traefik); backup diário do Postgres + restore testado                                             |
| **28/04–11/05/2026** | **S10 – UX & Documentação**          | Polimento UX e docs de operação                       | Ajustes de usabilidade no editor/painéis; **Runbooks** (incidentes/backup-restore); Guia de Deploy/Infra; contrato do **SDK de conectores**; acessibilidade básica (WCAG AA contraste/teclado)                                |
| **12–25/05/2026**    | **S11 – Freeze & Demo**              | Estabilização + roteiro Demo Day                      | Code freeze (hotfix apenas); roteiro de **demo fim-a-fim** (gatilho→ações→histórico→documentação IA); cenários de falha/recuperação; captura de telas/vídeos                                                                  |
| **26–30/05/2026**    | **S12 – Entrega final**              | Entrega e apresentação                                | Ambiente público estável; checklist de critérios de aceite; material para banca (slides, links, QR)                                                                                                                           |

## 4.2 Marcos e Checkpoints

### 4.2.1 Marcos (Go/No-Go)

- M0 – RFC entregue (30/11/2025)

Critérios: RFC completo e aceito pelos professores.

- M1 – Infra + Editor base (até 28/12/2025)

Critérios: compose sobe na VPS com TLS, canvas cria/edita nós, persistência stub/incipiente ok.

- M2 – CRUD + Executor mínimo (até 16/02/2026)

Critérios: CRUD de workflows, fila operando, execução de nós HTTP/IF/Delay com persistência.

- M3 – Webhook + Cron confiáveis (até 02/03/2026)

Critérios: HMAC + anti-replay; repeatables sem duplicação; cenários fim-a-fim validados.

- M4 – Histórico + Observabilidade (até 16/03/2026)

Critérios: Tela histórico funcional; dashboards Grafana e logs Loki úteis; alertas SMTP.

- M5 – IA PoC integrada (até 30/03/2026)

Critérios: FastAPI gera documentação coerente do workflow; botão na SPA funcionando.

- M6 – Qualidade & Segurança base (até 27/04/2026)

Critérios: Cobertura ≥ 70%, p95 API/execução cumpridos, rate-limit + DLQ + auditoria + backup/restore.

- M7 – Freeze + Demo pronta (até 25/05/2026)

Critérios: Build estável, demo roteirizada, documentação final pronta.

- M8 – Entrega final (30/05/2026)

Critérios: Tudo acessível publicamente; apresentação realizada.

### 4.2.2 Checkpoints com professores

- CP1 (meados jan/2026) – S0/S1 concluídos (infra + editor).

- CP2 (fim fev/2026) – S2/S3/S4 (auth, CRUD, executor mínimo).

- CP3 (meados mar/2026) – S5/S6 (webhook/cron + histórico/observabilidade).

- CP4 (início abr/2026) – S7 (IA PoC integrada).

- CP5 (fim abr/2026) – S8/S9 (qualidade/performance/segurança).

- CP6 (meados mai/2026) – S10/S11 (UX/docs + freeze/demo).

### 4.2.3 Lista de entregáveis

- Infra: compose com serviços, TLS válido, healthchecks, dashboards, backups agendados.

- Editor: criação/edição de workflow, biblioteca de nós, painel de propriedades, UX consistente.

- API/Worker: CRUD completo, execução assíncrona com idempotência, retries/backoff, DLQ.

- Segurança: JWT, secrets cifrados (libsodium), webhook HMAC + anti-replay, headers e rate-limit.

- Observabilidade: logs Loki (30d), métricas Prometheus, painéis Grafana, alertas SMTP.

- IA PoC: serviço FastAPI (RAG mínimo) + integração na SPA com retorno textual.

- Qualidade: cobertura ≥ 70% módulos core; p95 API < 200 ms leitura; p95 execução simples < 5 s.

- Documentação: Swagger, Guia de Deploy, Runbooks (incidentes/backup-restore), contrato SDK conectores, README dev.

- Demo: roteiro e dados de teste, cenários de sucesso/falha, vídeo ou script passo a passo.

### 4.2.4 Riscos e mitigação

| Risco                        | Mitigação                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Atraso na IA PoC             | Entregar stub primeiro; RAG minimalista (modelo pequeno local)                      |
| Duplicidade em cron/webhooks | Locks/repeatables; idempotency key; testes fim-a-fim                                |
| Gargalos de logs/queue       | Ajustar retenção/concor­rência; monitorar throughput; DLQ e alertas                 |
| Débito técnico acumulado     | Buffers previstos (fim de ano e S10); política de “bug antes de feature” pós-freeze |
| Segurança de secrets         | libsodium + SOPS/age desde S2; revisão de permissões; auditoria ativa               |

# 5. Referências

ARJONA, Aitor; GARCÍA-LÓPEZ, Pedro; SAMPÉ, Josep; SŁOMIŃSKI, Aleksander; VILLARD, Lionel. Triggerflow: trigger-based orchestration of serverless workflows. 2021. Disponível em: https://arxiv.org/abs/2106.00583
. Acesso em: 23 out. 2025.

ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. ABNT NBR ISO/IEC 25010:2011 – Engenharia de software e de sistemas — Modelos de qualidade. Rio de Janeiro: ABNT, 2011.

BRASIL. Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais (LGPD). Diário Oficial da União, Brasília, DF, 15 ago. 2018. Disponível em: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm
. Acesso em: 20 nov. 2025.

BROWN, Simon. The C4 model for visualising software architecture. 2018. Disponível em: https://c4model.com/
. Acesso em: 20 nov. 2025.

FASTAPI. FastAPI — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://fastapi.tiangolo.com/
. Acesso em: 20 nov. 2025.

GRAFANA LABS. Grafana / Loki / Promtail — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://grafana.com/docs/
. Acesso em: 20 nov. 2025.

INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO/IEC 27001:2022 — Information security, cybersecurity and privacy protection — Information security management systems — Requirements. Geneva: ISO, 2022.

LIBSODIUM. The sodium crypto library — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://doc.libsodium.org/
. Acesso em: 20 nov. 2025.

LOUIS, J. A case study for workflow-based automation in the Internet of Things. International Journal of Computer Applications, v. 179, n. 8, p. 25–30, 2018. Disponível em: https://www.researchgate.net/publication/324877033_A_Case_Study_for_Workflow-Based_Automation_in_the_Internet_of_Things
. Acesso em: 23 out. 2025.

MALAWSKI, Maciej. Towards serverless execution of scientific workflows – HyperFlow case study. CEUR Workshop Proceedings, v. 1800, 2017. Disponível em: https://ceur-ws.org/Vol-1800/paper4.pdf. Acesso em: 23 out. 2025.

NESTJS. NestJS — A progressive Node.js framework. [s.l.]: [s.n.], [s.d.]. Disponível em: https://nestjs.com/
. Acesso em: 20 nov. 2025.

OWASP FOUNDATION. OWASP Top 10 – 2021. 2021. Disponível em: https://owasp.org/www-project-top-ten/
. Acesso em: 20 nov. 2025.

PRISMA. Prisma ORM — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://www.prisma.io/docs
. Acesso em: 20 nov. 2025.

PROMETHEUS. Prometheus — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://prometheus.io/docs/introduction/overview/
. Acesso em: 20 nov. 2025.

SIDO, N.; VESTERGAARD, A.; BJØRHOLM, M. Low/No Code Development and Generative AI: Architectural Perspectives and Practical Use-Cases. 2024. Disponível em: https://vbn.aau.dk/ws/files/717521040/LowNOCode__GenAI.pdf
. Acesso em: 23 out. 2025.

TASKFORCE.SH. BullMQ — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://docs.bullmq.io/
. Acesso em: 20 nov. 2025.

VALKEY PROJECT. Valkey — Documentation. [s.l.]: [s.n.], [s.d.]. Disponível em: https://valkey.io/
. Acesso em: 20 nov. 2025.

WASHINGTON, Jasmine. The impact of AI-assisted low-code development on software engineering. [s.l.]: [s.n.], 2024. Disponível em: https://www.researchgate.net/publication/390175006_The_Impact_of_AI-Assisted_Low-Code_Development_on_Software_Engineering
. Acesso em: 23 out. 2025.

XYFLOW. React Flow — A library for building node-based UIs. [s.l.]: [s.n.], [s.d.]. Disponível em: https://reactflow.dev/
. Acesso em: 20 nov. 2025.

# Getting Started

## Prerequisites

- **Node.js** 20 LTS
- **pnpm** 10.x (`npm install -g pnpm`)
- **Docker** and **Docker Compose** (for PostgreSQL, Valkey, Ollama, ChromaDB)
- **Python** 3.12+ (for the AI service)

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/higorazeved/tietide.git
cd tietide

# 2. Copy environment variables
cp .env.example .env

# 3. Install dependencies
pnpm install

# 4. Start infrastructure services (PostgreSQL, Valkey, Ollama, ChromaDB)
docker compose -f infra/docker/docker-compose.yml up -d

# 5. Generate Prisma client and run migrations
cd apps/api
pnpm prisma generate
pnpm prisma db push
cd ../..

# 6. Build shared packages
pnpm -r run build --filter @tietide/shared --filter @tietide/sdk

# 7. Start all apps in development mode
pnpm dev
```

## Available Scripts

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | Start all apps in dev mode (API :3000, SPA :5173) |
| `pnpm build`     | Build all packages and apps                       |
| `pnpm test`      | Run all tests across the monorepo                 |
| `pnpm lint`      | Lint all packages                                 |
| `pnpm typecheck` | Type-check all packages                           |

## Project Structure

```
tietide/
├── apps/
│   ├── api/          # NestJS REST API (port 3000)
│   ├── worker/       # NestJS BullMQ Worker
│   ├── spa/          # React SPA (port 5173)
│   └── ai/           # FastAPI AI Service (port 8000)
├── packages/
│   ├── shared/       # Shared types, schemas, constants
│   ├── sdk/          # Connector/Node SDK (INodeExecutor)
│   └── eslint-config/ # Shared ESLint configuration
└── infra/
    └── docker/       # Docker Compose files
```

## Notes

- On **Windows**, Turborepo may be blocked by Application Control policies. The project uses `pnpm -r` for local development and Turborepo only in CI (GitHub Actions).
- The AI service requires **Ollama** running with a model downloaded. Run `ollama pull llama3.1:8b` after starting Ollama.

# 6. Apêndices (Opcionais)

## 6.1 Apêndice 1 — Diagrama de Casos de Uso (UML)

Este apêndice apresenta o diagrama de casos de uso do MVP do TieTide, evidenciando as interações entre atores (Usuário, Admin, Sistemas Externos, Serviço de IA e Scheduler interno) e os casos de uso de autenticação, modelagem/validação de workflows, execução/orquestração, observabilidade/segurança e geração de documentação por IA (RAG).

<img width="1098" height="1990" alt="UML TieTide" src="https://github.com/user-attachments/assets/b75435ea-cb45-49de-baa7-c2c8e283c80a" />
Fonte: Elaborado pelo autor (2025).

# 7. Avaliações de Professores

Adicionar três páginas no final do RFC para que os Professores escolhidos possam fazer suas considerações e assinatura:

- Considerações Professor/a:
- Considerações Professor/a:
- Considerações Professor/a:
  💬
