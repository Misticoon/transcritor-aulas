# Transcritor de Aulas

Aplicação web para transcrever áudios e vídeos inteiros ou por intervalo, com seleção de idiomas e marcações de tempo. O frontend estático é publicado no **Netlify**; o áudio é extraído por **FFmpeg.wasm** no navegador e transcrito com **Cloudflare Workers AI**.

## Funcionalidades

- Upload de vídeo/áudio e links diretos de mídia compatíveis com o proxy.
- Aula inteira ou **Somente trecho**, incluindo **Desde o início** e **Até o final**.
- Se o fim digitado ultrapassar a duração real da mídia, o sistema limita o intervalo automaticamente.
- Horários por digitação progressiva: `1` → `00:00:01`; `12` → `00:00:12`; `123` → `00:01:23`.
- Idiomas: Automático (padrão), Português, Japonês, Inglês, Espanhol, Francês, Alemão, Italiano, Coreano e Chinês.
- Dois Workers processando blocos alternados em paralelo; os resultados são ordenados pelos timestamps.
- Blocos principais de até **5 minutos**, recuperação em blocos de até **2 minutos** e subdivisões menores se necessário, até aproximadamente 3 segundos.
- Failover de cota, cancelamento, tema claro/escuro, cópia e downloads em TXT/VTT.

## Arquitetura

```text
Arquivo / URL de mídia
        |
        v
Frontend estático (Netlify)
        |
        v
FFmpeg.wasm (WAV mono PCM 16 kHz)
        |
        +-- Blocos 1, 3, 5... --> Worker principal (Workers AI, conta A)
        |
        +-- Blocos 2, 4, 6... --> Worker reserva   (Workers AI, conta B)
                   |                  |
                   +---- timestamps --+
                            |
                      ordenação / TXT / VTT
```

O frontend extrai os blocos com FFmpeg de forma serializada para não executar dois processos simultâneos na mesma instância do navegador, enquanto os pedidos de transcrição podem ocorrer em paralelo. O balanceamento normal é aproximadamente 50/50 e pode mudar em caso de erro ou falta de cota.

Cada Worker chama `@cf/openai/whisper-large-v3-turbo` e pode tentar `@cf/openai/whisper` em alguns erros de decodificação. A aplicação tenta usar o outro Worker quando recebe erro explícito de cota; isso não garante disponibilidade.

## Configuração sem URLs fixas no código

As URLs dos Workers **não ficam gravadas em `app.js`**. No deploy manual do Netlify, um script local lê `.env` e gera `deploy-netlify/config.js`, que é carregado antes de `app.js`.

**Atenção:** URLs de endpoints públicos não são credenciais. `config.js` é enviado ao navegador e poderá ser visualizado por qualquer visitante. Variáveis de ambiente facilitam configuração/versionamento, mas **não escondem** URLs públicas. Nunca coloque chaves ou tokens nesse arquivo.

### 1. Cloudflare: Worker reserva

Crie ou atualize o Worker usando `worker-reserva.js` e configure o binding **Workers AI** chamado `AI` em **Settings → Bindings**. Publique. O diagnóstico GET deve incluir `"versao":"13.6-reserva"`.

### 2. Cloudflare: Worker principal

Use `worker-principal.js`, configure o binding **Workers AI** chamado `AI` e crie em **Settings → Variables and secrets** uma variável de texto:

```text
BACKUP_WORKER_URL=https://URL-REAL-DO-WORKER-RESERVA/
```

Esse valor é configurado **na conta Cloudflare do Worker principal**, não no código-fonte e não no `.env` do frontend. Quando a cota do principal termina, o código lê `env.BACKUP_WORKER_URL` para encaminhar o WAV ao reserva.

O diagnóstico GET deve mostrar `"versao":"13.6-primary"` e `"backup_configurado":true`.

**Observação:** ambos os Workers importam `node:buffer`; mantenha o ambiente/configuração de compatibilidade Node.js exigido por sua implantação Cloudflare. Os nomes dos arquivos no GitHub não alteram os Workers já publicados. Nesta atualização de configuração não é necessário publicar os Workers novamente.

### 3. Configurar o frontend localmente

Requisitos: **Python 3**, instalado na maioria das distribuições Linux. Nenhuma dependência adicional do Python.

Primeiro, na raiz do repositório, crie seu arquivo local `.env` (se não o tiver recebido no pacote):

```bash
cp .env.example .env
```

Edite `.env` e informe as URLs reais dos dois Workers:

```dotenv
PRIMARY_WORKER_URL=https://seu-worker-principal.seu-subdominio.workers.dev/
BACKUP_WORKER_URL=https://seu-worker-reserva.seu-outro-subdominio.workers.dev/
```

**Não confundir:** `BACKUP_WORKER_URL` no `.env` local serve somente para configurar o frontend. A variável com o mesmo nome, em **Cloudflare → Worker principal → Settings**, precisa continuar cadastrada lá para o failover do backend.

Gere a pasta pronta para deploy:

```bash
python3 scripts/preparar_netlify.py
```

O comando valida URLs e cria exatamente:

```text
deploy-netlify/
├── _headers
├── app.js
├── config.js       # gerado a partir do .env
├── favicon.svg
├── index.html
└── style.css
```

No Netlify, abra o site existente → **Deploys** → **deploy manual** e arraste a pasta **`deploy-netlify` inteira**. Não arraste a raiz do repositório. A cada alteração em `.env` ou no frontend, execute novamente o comando e publique essa pasta.

Depois abra o site com `Ctrl+Shift+R` e transcreva um trecho curto.

### 4. GitHub

Versione os arquivos de código, a documentação, o script e `.env.example`:

```bash
git add app.js index.html README.md .gitignore .env.example scripts/preparar_netlify.py
git commit -m "refactor: move configuracao dos workers para variaveis de ambiente"
git push origin main
```

`.env`, `config.js` e `deploy-netlify/` devem permanecer ignorados. Confirme com `git status` e `git check-ignore .env deploy-netlify/config.js`.

## Estrutura do repositório

```text
transcritor-aulas/
├── .env.example                # modelo público; não contém os valores reais
├── .gitignore                  # ignora .env e saída gerada
├── README.md
├── _headers
├── app.js
├── favicon.svg
├── index.html
├── style.css
├── worker-principal.js        # Cloudflare, usa env.BACKUP_WORKER_URL
├── worker-reserva.js          # Cloudflare, binding env.AI
└── scripts/
    └── preparar_netlify.py   # gera deploy-netlify/config.js
```

## Segurança, limites e observações

- `.env` fica **somente no seu computador**, ignorado no Git. **Não armazene credenciais de terceiros em `config.js`**. Se houver chaves privadas no futuro, armazene-as em **Cloudflare Secrets**, nunca no frontend.
- O frontend é público e precisa conhecer os endereços públicos de ambos os Workers para processamento paralelo. **Configuração por `.env` não torna as APIs privadas**. Para controlar acesso/custos, considere políticas de autenticação e limites de requisições na Cloudflare.
- O proxy aceita URLs HTTPS de mídia apenas de `cdn.estrategiaconcursos.com.br`; links assinados podem expirar.
- Cada Worker rejeita blocos WAV acima de 20 MB. Processamento grande consome memória e CPU do dispositivo do usuário e está sujeito às cotas dos serviços.
- O modo de idioma Automático não define idioma no pedido do modelo; transcrições podem variar conforme a qualidade da gravação.

## Tecnologias

HTML, CSS, JavaScript, FFmpeg.wasm, Cloudflare Workers, Cloudflare Workers AI, Whisper, Netlify e Python 3 (somente na preparação local de deploy).
