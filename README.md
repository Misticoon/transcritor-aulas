# Transcritor de Aulas

Aplicação web para transcrever arquivos de áudio e vídeo, integralmente ou por intervalo, com marcações de tempo, seleção de idioma e exportação dos resultados. O processamento utiliza **FFmpeg no navegador** e **Cloudflare Workers AI**; o frontend estático é publicado no **Netlify**.

## Funcionalidades

- **Origem da mídia:** upload de áudio/vídeo por seleção ou arrastar e soltar; opção de link direto para mídia hospedada no domínio permitido pelo proxy.
- **Intervalo:** transcrição da aula inteira ou apenas de um trecho, com as opções **Desde o início** e **Até o final**.
- **Fim automático:** se o horário final ultrapassar a duração real do vídeo, o intervalo é limitado ao final da mídia.
- **Digitação progressiva de horários (`HH:MM:SS`):** os dígitos entram pela direita, sem precisar apagar os zeros. Exemplos: `1` → `00:00:01`; `12` → `00:00:12`; `123` → `00:01:23`. `Backspace` remove o último dígito; `Delete` zera. Também é possível colar um horário completo.
- **Idiomas:** Automático (padrão), Português, Japonês, Inglês, Espanhol, Francês, Alemão, Italiano, Coreano e Chinês. A preferência fica salva no navegador.
- **Dois Workers em paralelo:** blocos alternados são enviados ao Worker principal e ao reserva; os resultados são reordenados pelos horários.
- **Recuperação de falhas:** blocos de até 5 minutos; em caso de falha recuperável, partes de até 2 minutos e, se necessário, subdivisões menores, até aproximadamente 3 segundos.
- **Failover por cota:** ao detectar esgotamento de cota, a aplicação tenta encaminhar o trecho ao outro Worker.
- **Resultados:** transcrição com timestamps, cópia para a área de transferência e download em `.txt` ou `.vtt`.
- **Interface:** progresso, cancelamento da execução e tema claro/escuro com preferência salva localmente.

## Arquitetura

```text
                        Netlify (HTML, CSS, JavaScript)
                                     |
                         FFmpeg.wasm no navegador
                   (extração de WAV mono, PCM, 16 kHz)
                                     |
                         blocos de até 5 minutos
                          /                     \
            Worker principal              Worker reserva
             (conta A)                    (conta B)
                |                              |
              Workers AI                    Workers AI
                          \                     /
                        resultados com timestamps
                                     |
                         ordenação e exportação
```

O frontend distribui blocos **alternadamente entre duas filas**, que podem chamar os dois Workers simultaneamente. Para evitar operações simultâneas na mesma instância, a extração pelo FFmpeg é serializada no navegador. O balanceamento aproximado é 50/50 em condições normais, mas falhas e novas tentativas podem alterar a distribuição.

Cada Worker utiliza principalmente `@cf/openai/whisper-large-v3-turbo`. Em determinados erros de decodificação e para trechos pequenos, há tentativa com `@cf/openai/whisper`. Se a cota de um Worker acabar, a aplicação pode redirecionar o trecho para o outro; isso depende da disponibilidade e da cota restante do destino.

> O modo **Automático** não envia uma indicação fixa de idioma ao modelo. A precisão das transcrições depende da qualidade do áudio, do idioma e das limitações do modelo.

## Como usar

1. Abra o site publicado no Netlify.
2. Selecione **Arquivo** para enviar a mídia ou **Link direto** para informar uma URL compatível com o proxy.
3. Escolha **Idioma do áudio**. Para uma aula em japonês, por exemplo, selecione **Japonês**.
4. Escolha **Aula inteira** ou **Somente trecho**.
5. Se usar um trecho, informe os horários ou marque **Desde o início** / **Até o final**.
6. Clique em **Transcrever** e acompanhe o progresso. Ao final, copie o resultado ou baixe TXT/VTT.

### Exemplos de intervalo

| Objetivo | Configuração |
| --- | --- |
| Do começo até 42 minutos | **Desde o início** + fim `00:42:00` |
| De 37 minutos ao fim | Início `00:37:00` + **Até o final** |
| De 37 a 55 minutos | Início `00:37:00` + fim `00:55:00` |
| Vídeo de 1h13min com fim digitado em 1h30min | O sistema ajusta o fim para a duração real (`01:13:00`) |

## Estrutura do repositório

```text
transcritor-aulas/
├── index.html           # Interface
├── style.css            # Estilos e temas
├── app.js               # Extração, intervalos, paralelismo e resultados
├── _headers             # Cabeçalhos para FFmpeg.wasm no Netlify
├── favicon.svg          # Ícone da aba
├── worker-principal.js  # API e failover do Worker principal
├── worker-reserva.js    # API do Worker reserva
├── README.md            # Documentação
└── .gitignore
```

## Implantação

### 1. Cloudflare — Worker reserva

Crie ou atualize o Worker reserva usando `worker-reserva.js`. Em **Settings → Bindings**, configure **Workers AI** com o nome **`AI`** e publique. Ao abrir sua URL no navegador, a resposta de diagnóstico deve incluir `"versao":"13.6-reserva"`.

### 2. Cloudflare — Worker principal

Crie ou atualize o Worker principal usando `worker-principal.js`. Configure também o binding **Workers AI** chamado **`AI`**. Em **Variables and secrets**, adicione uma variável de texto:

```text
BACKUP_WORKER_URL=https://URL-PUBLICA-DO-WORKER-RESERVA/
```

Publique o Worker. Sua resposta de diagnóstico deve incluir `"versao":"13.6-primary"` e `"backup_configurado":true`.

**Observação:** os Workers utilizam `node:buffer`; mantenha as configurações de compatibilidade necessárias para esse import no ambiente Cloudflare. Alterar os nomes dos arquivos no GitHub não atualiza automaticamente os Workers implantados.

### 3. Netlify — deploy manual

Publique **somente** os cinco arquivos abaixo na raiz do site:

```text
index.html
style.css
app.js
_headers
favicon.svg
```

O arquivo `_headers` define os cabeçalhos de isolamento necessários para o FFmpeg no navegador. **Não** envie os arquivos `worker-*.js` para o Netlify. Depois do deploy, faça uma atualização forçada da página (`Ctrl+Shift+R`) e teste a transcrição de um trecho curto.

O repositório GitHub é usado para versionamento. Ele não precisa estar conectado ao Netlify para o deploy manual funcionar.

## Configurações relevantes

No início de `app.js`, estão os endpoints de ambos os Workers e os tamanhos dos blocos:

```js
const PRIMARY_ENDPOINT = "https://transcritor-aulas.lucas-luk-lima.workers.dev/";
const BACKUP_ENDPOINT = "https://transcritor-aulas-backup.lucas-lima8.workers.dev/";
const CHUNK = 300, RECOVERY_CHUNK = 120, MIN_CHUNK = 3;
```

O frontend envia o idioma selecionado como parâmetro de URL `lang` nos pedidos de transcrição. No modo Automático, esse parâmetro é omitido. O Worker principal preserva o idioma quando precisa acionar o reserva.

### Limitações e cuidados

- **Proxy de mídia:** o endpoint `/proxy` aceita apenas URLs HTTPS do domínio `cdn.estrategiaconcursos.com.br`. Links assinados podem expirar; páginas comuns de vídeo não equivalem necessariamente a links diretos para mídia.
- **Cotas e limites:** há limites de uso e de tamanho nos serviços envolvidos. O código dos Workers rejeita blocos WAV maiores que 20 MB. A recuperação automática e o failover não garantem conclusão quando os provedores estiverem indisponíveis ou sem cota.
- **Execução no navegador:** arquivos grandes exigem memória e processamento do dispositivo para o FFmpeg; a experiência depende do navegador e dos recursos disponíveis.
- **Segurança:** não inclua tokens, credenciais ou links temporários assinados em commits públicos. Os endpoints e os controles de cota devem ser avaliados antes de disponibilizar o serviço para uso amplo.

## Tecnologias

JavaScript, HTML5, CSS3, FFmpeg.wasm, Cloudflare Workers, Cloudflare Workers AI, Whisper e Netlify.
