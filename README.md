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

* **Linha de Projeto**: Indique a categoria do projeto (Web Apps, Aplicações Mobile, Jogos Digitais, Projetos com IA ou Projetos IoT), conforme definido no regulamento.
* **Tema do Projeto**: Descreva de forma clara e objetiva o produto, serviço ou ferramenta a ser desenvolvido.
* **Propósito e Uso Prático**: Explique qual problema real será resolvido e como a solução será utilizada na prática.
* **Público-Alvo**: Defina o perfil dos usuários ou clientes potenciais que se beneficiarão da solução.
* **Problemas a Resolver**: Liste de forma objetiva os principais problemas ou necessidades que o projeto pretende atender.
* **Diferenciação/Ineditismo**: Destaque o que torna a proposta única em relação a soluções existentes, mesmo quando o tema é semelhante a outros projetos.
* **Limitações**: Especifique o que o projeto **não** abrangerá, evitando expectativas incorretas.
* **Normas e Legislações Aplicáveis**: Liste normas, leis e diretrizes relevantes ao contexto do projeto (ex.: LGPD, HIPAA, WCAG, ESRB/PEGI), indicando como serão observadas.
* **Métricas de Sucesso**: Apresente critérios iniciais para medir o desempenho e a efetividade do projeto (ex.: tempo de resposta, número de usuários atendidos, taxa de acerto do modelo de IA).

## 3. Especificação Técnica

Descrição detalhada da proposta, contemplando requisitos, arquitetura, tecnologias, segurança e aderência aos critérios obrigatórios da linha de projeto escolhida.

### 3.1. Requisitos de Software
- **Requisitos Funcionais (RF)**: Liste de forma clara as funcionalidades que o sistema deverá oferecer.
- **Requisitos Não-Funcionais (RNF)**: Inclua requisitos de desempenho, segurança, usabilidade, escalabilidade, disponibilidade, entre outros.
- **Representação dos Requisitos**: Inclua um Diagrama de Casos de Uso (UML) ou outra representação visual que facilite o entendimento.
- **Aderência aos Requisitos da Linha de Projeto**: Indique como cada requisito está alinhado aos itens “Obrigatório Atender” definidos para a linha de projeto (Web, Mobile, Jogos, IA ou IoT).

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
