# Capa

- **Título do Projeto**: TieTide - Plataforma de Integrações e Automações de Processos.
- **Nome do Estudante**: Higor Azevedo.
- **Curso**: Engenharia de Software.
- **Data de Entrega**: [Data].

# Resumo

Este documento detalha a proposta de projeto para o desenvolvimento do TieTide, um software utilizado como plataforma de automação e integração como serviço (IPaaS). O projeto visa resolver o problema da "Fragmentação Digital" enfrentado por empresas modernas, oferecendo uma solução low-code, open-source e auto-hospedável, oferecendo um equilíbrio estratégico entre a robustez exigida por desenvolvedores e a simplicidade necessária para a agilidade na implantação dos processos. Os principais diferenciais da TieTide são sua experiência de usuário superior, a "Maré de Dados", e uma funcionalidade inovadora de geração de documentação de processos via Inteligência Artificial. A plataforma será construída com tecnologias modernas, incluindo TypeScript, React, NestJS e Docker, seguindo os princípios de software maduro.

## 1. Introdução

- **Contexto**: Na economia digital, a adoção de softwares como serviço (SaaS) tornou-se um pilar para a eficiência empresarial, em que seus departamentos internos optam por utilizar as ferramentas que mais se adequam as suas necessidades, com ferramentas especializadas para CRM, comunicação, marketing, finanças, operações e entre outros. Embora essa especialização otimize tarefas isoladas, ela gera um desafio operacional significativo: a fragmentação digital. Dados e processos críticos acabam confinados em "silos" tecnológicos, com baixa ou nenhuma conexão entre si. Como consequência, as organizações recorrem a workarounds manuais que são ineficientes, propensos a erros e insustentáveis em escala.
- **Justificativa**: O mercado atual de plataformas de integração (IPaaS) oferece soluções para este problema, mas apresenta lacunas claras. De um lado, ferramentas no-code como o Zapier oferecem simplicidade, mas são restritas em robustez e podem ter um custo elevado em alto volume. No extremo oposto, plataformas enterprise como MuleSoft e Workato são extremamente poderosas, porém com uma complexidade e um custo de licenciamento que as tornam inviáveis para a maioria das pequenas e médias empresas. Soluções open-source como o n8n oferecem a flexibilidade necessária para desenvolvedores, mas frequentemente carecem de uma experiência de usuário polida que atenda também a analistas técnicos e de processos.
A TieTide justifica-se por se posicionar estrategicamente neste espaço. O projeto propõe uma solução que une a robustez e o controle exigidos por desenvolvedores com uma interface visual e intuitiva que empodera um público técnico mais amplo. A adição de uma funcionalidade inovadora, como a documentação de processos gerada por IA, reforça ainda mais a necessidade de uma nova abordagem no setor, focada não apenas em conectar, mas em gerenciar e documentar a automação de forma inteligente.
- **Objetivos**
  - **Objetivo Principal**: Desenvolver uma plataforma iPaaS funcional que permita a criação, execução e monitoramento de workflows de automação de forma visual e intuitiva.
  - **Objetivos Específicos**:
    - Implementar a interface de usuário "Maré de Dados", garantindo uma experiência superior que simplifique a visualização de fluxos complexos;
    - Construir um motor de execução que equilibre a simplicidade do low-code com a flexibilidade de nós de código customizáveis;
    - Desenvolver uma Prova de Conceito para a funcionalidade de documentação automática com IA;
    - Garantir que a plataforma seja distribuída via Docker para fácil auto-hospedagem;
    -Aplicar rigorosamente os princípios de software maduro (Robustez, Escalabilidade, Disponibilidade, Desempenho, Extensibilidade e Resiliência) em todas as fases do projeto.

## 2. Descrição do Projeto

* **Linha de Projeto**: Web Apps.
* **Tema do Projeto**: Desenvolvimento de uma Plataforma de Automação e Integração como Serviço (iPaaS) com foco em Low-Code, Experiência do Usuário e Inovação Funcional.
* **Propósito e Uso Prático**: Mitigar o desafio constante de integrar múltiplas ferramentas com agilidade. Na prática, a plataforma permite a integração de ferramentas e a automação de tarefas e processos que hoje dependem de intervenção manual. Um caso de uso típico seria: "Quando um novo cliente é cadastrado no CRM, disparar um fluxo que automaticamente o adiciona a uma lista de e-mail marketing, cria uma pasta para ele no Google Drive e notifica a equipe de sucesso do cliente via Slack".
* **Público-Alvo**: Profissionais de tecnologia e de processos, na faixa dos 20 aos 45 anos, incluindo Desenvolvedores, Analistas e Líderes Técnicos.
* **Problemas a Resolver**:
  * Fragmentação Digital e Silos de Dados: A falta de comunicação nativa entre ferramentas SaaS essenciais;
  * Ineficiência de Processos Manuais: A dependência de tarefas repetitivas e de baixo valor que consomem tempo e recursos;
  * Alto Custo e Complexidade de Soluções Atuais: A lacuna entre ferramentas no-code limitadas e plataformas enterprise inacessíveis;
  * Falta de Documentação de Processos: A dificuldade de manter um registro claro e atualizado de como as automações funcionam.
* **Diferenciação/Ineditismo**: Os principais pontos são a experiência de usuário (UX) superior, a documentação de processos gerada por IA, o equilíbrio entre low-code e pro-code e um modelo open-source e auto-hospedável.
* **Limitações**: Para garantir a viabilidade e a excelência na entrega dentro do escopo acadêmico, o projeto em sua versão inicial (MVP) não abrangerá:
  * Uma biblioteca extensa de conectores pré-construídos para centenas de serviços, será limitado de 3 à 5 conectores;
  * Funcionalidades de nível enterprise, como gerenciamento de equipes multi-tenant, dashboards complexos de usabilidade e permissões de acesso granulares;
  * Um marketplace para conectores desenvolvidos pela comunidade.
* **Normas e Legislações Aplicáveis**: O projeto observará as seguintes normas e legislações:
  * Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018): A arquitetura auto-hospedável da TieTide é um diferencial que facilita a conformidade com a LGPD, pois permite que as empresas processem e armazenem seus dados em sua própria infraestrutura;
  * Licenças de Software: O projeto será distribuído sob uma licença open-source permissiva (MIT) e garantirá a conformidade com as licenças de todas as bibliotecas e frameworks de terceiros utilizados.
* **Métricas de Sucesso**: O sucesso do projeto será medido pelos seguintes critérios:
  * Métricas Funcionais: Implementação bem-sucedida de todas as funcionalidades definidas como escopo do MVP, incluindo o canvas de nós, o motor de execução e a Prova de Conceito da IA de documentação;
  * Métricas Técnicas: Atingimento das metas de requisitos não-funcionais, como tempo de resposta da API abaixo de 200ms e tempo de execução de workflows simples abaixo de 5 segundos;
  * Métricas Acadêmicas: Aprovação do RFC pelos professores avaliadores e uma apresentação bem-sucedida e funcional do projeto no Poster + Demo Day.

## 3. Especificação Técnica

Esta seção descreve em detalhes a proposta técnica para o desenvolvimento da TieTide, abrangendo os requisitos de software, as decisões de arquitetura e a stack tecnológica selecionada.

### 3.1. Requisitos de Software
- **Requisitos Funcionais (RF)**:
  - RF01. Gestão de Usuários: O sistema deverá permitir o cadastro e login de usuários, com autenticação baseada em JWT (JSON Web Tokens);
  - RF02. Gestão de Workflows: O sistema deverá prover funcionalidades CRUD (Criar, Ler, Atualizar, Deletar) completas para os workflows;
  - RF03. Editor Visual de Fluxo: A interface deverá apresentar um canvas de "arrastar e soltar" que permita ao usuário adicionar nós, posicioná-los livremente e conectá-los para definir o fluxo de dados;
  - RF04. Nós Essenciais: A versão MVP deverá conter os seguintes nós funcionais:
    - Gatilhos: Manual, Agendado (Cron) e Webhook;
    - Ações: Requisição HTTP, Execução de Código (Node.js/TypeScript) e Lógica Condicional (IF).
  - RF05. Motor de Execução: O sistema deverá processar os workflows de forma assíncrona, utilizando uma fila de mensagens para garantir desempenho e resiliência;
  - RF06. Histórico de Execuções: A interface deverá exibir um histórico de todas as execuções de um workflow, com seu status (sucesso, falha), data e logs detalhados;
  - RF07. Documentação por IA (PoC): O sistema deverá ter um endpoint que, ao receber a estrutura de um workflow em formato JSON, retorne uma descrição textual do processo gerada por um modelo de IA.
- **Requisitos Não-Funcionais (RNF)**:
  - RNF01. Desempenho: As respostas da API devem ter uma latência inferior a 200ms para 95% das requisições. A sobrecarga de execução de um workflow simples deve ser inferior a 5 segundos;
  - RNF02. Escalabilidade: A arquitetura do motor de execução (workers) deverá ser projetada para permitir escalabilidade horizontal independente da API principal;
  - RNF03. Disponibilidade: O sistema deverá ser projetado para alta disponibilidade, incluindo endpoints de health check para monitoramento;
  - RNF04. Extensibilidade: A arquitetura deverá ser modular, permitindo a adição de novos conectores (nós) com o mínimo de impacto no núcleo do sistema (Plugin Architecture);
  - RNF05. Usabilidade: A interface deve ser intuitiva para o público-alvo, minimizando a curva de aprendizado para a criação de workflows complexos.
- **Representação dos Requisitos**: Um Diagrama de Casos de Uso (UML) será fornecido como apêndice para ilustrar as principais interações do usuário com o sistema.
- **Aderência aos Requisitos da Linha de Projeto**: O projeto se enquadra na linha Web Apps e cumpre todos os seus requisitos obrigatórios, como hospedagem pública, funcionalidades reais, arquitetura definida e código-fonte versionado.

### 3.2. Considerações de Design
- **Visão Inicial da Arquitetura**: Apresente os principais componentes e suas interações.
- **Padrões de Arquitetura**: Informe padrões adotados (ex.: [MVC](https://en.wikipedia.org/wiki/Model–view–controller), [Microserviços](https://microservices.io/), [MVVM](https://en.wikipedia.org/wiki/Model–view–viewmodel), Arquitetura em Camadas).
- **Modelos C4**: Utilize os quatro níveis ([C4 Model](https://c4model.com/)) quando aplicável.
- **Mockups das Telas Principais**: Apresente protótipos visuais das telas mais relevantes, mostrando navegação, disposição de elementos e principais interações do usuário. Esses mockups podem ser feitos em ferramentas como Figma, Adobe XD ou similares, e devem refletir a identidade visual e usabilidade prevista para o produto.
- **Decisões e Alternativas Consideradas**: Justifique escolhas de design, documentando alternativas avaliadas.
- **Critérios de Escalabilidade, Resiliência e Segurança**: Descreva como a solução será projetada para suportar crescimento, lidar com falhas e manter segurança.

### 3.3. Stack Tecnológica
- **Linguagens de Programação**: Liste e justifique as escolhas.
- **Frameworks e Bibliotecas**: Detalhe e justifique a seleção.
- **Ferramentas de Desenvolvimento e Gestão**: Inclua IDEs, sistemas de versionamento, plataformas de integração contínua, monitoramento, entre outros.
- **Licenciamento**: Indique as licenças dos softwares e bibliotecas utilizados ([MIT](https://opensource.org/licenses/MIT), [GPL](https://www.gnu.org/licenses/gpl-3.0.html), [Apache](https://www.apache.org/licenses/), [Creative Commons](https://creativecommons.org/licenses/)).

### 3.4. Considerações de Segurança
- **Riscos Identificados**: Liste ameaças potenciais (ex.: injeção de código, vazamento de dados, falhas de autenticação).
- **Medidas de Mitigação**: Explique as ações planejadas para minimizar riscos (ex.: criptografia, controle de acesso, validação de entrada).
- **Normas e Boas Práticas Seguidas**: Cite padrões como [OWASP Top 10](https://owasp.org/www-project-top-ten/), [ISO/IEC 27001](https://www.iso.org/isoiec-27001-information-security.html), [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm) ou outros aplicáveis.
- **Responsabilidade Ética**: Para projetos de IA ou manipulação de dados sensíveis, descreva como serão tratados vieses, privacidade e uso responsável ([UNESCO – Ética em IA](https://unesdoc.unesco.org/ark:/48223/pf0000380455), [OECD AI Principles](https://oecd.ai/en/ai-principles)).

### 3.5. Conformidade e Normas Aplicáveis
- Relacione todas as legislações, regulamentações e normas técnicas aplicáveis ao projeto, descrevendo brevemente como serão atendidas.
- Exemplos:
  - [LGPD – Lei Geral de Proteção de Dados](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm)
    - Coletar apenas dados necessários (nome, contato, dados do imóvel).
    - Evitar dados sensíveis desnecessários.
    - Solicitar consentimento explícito e exibir política de privacidade clara.
    - Permitir acesso, correção e exclusão de dados pelo usuário.
    -   ...
   
## 4. Próximos Passos

 - Descrição dos passos seguintes após a conclusão do documento, com uma visão geral do cronograma para Portfólio I e II.
 - Definição de Marcos: Estabelecer datas para entregas intermediárias e checkpoints.


## 5. Referências

Listagem de todas as fontes de pesquisa, frameworks, bibliotecas e ferramentas que serão utilizadas.

## 6. Apêndices (Opcionais)

Informações complementares, dados de suporte ou discussões detalhadas fora do corpo principal.
## 7. Avaliações de Professores

Adicionar três páginas no final do RFC para que os Professores escolhidos possam fazer suas considerações e assinatura:
- Considerações Professor/a:
- Considerações Professor/a:
- Considerações Professor/a:
💬
