# Transcritor de Aulas — dois Workers em paralelo

## Arquitetura atual

O frontend do Netlify divide a aula em blocos principais de até **5 minutos**.

Os blocos são distribuídos alternadamente:

- bloco 1 → Worker principal (conta A)
- bloco 2 → Worker reserva (conta B)
- bloco 3 → Worker principal
- bloco 4 → Worker reserva

As duas filas trabalham ao mesmo tempo. Assim, para uma aula longa, a carga principal fica aproximadamente 50/50 entre as duas contas.

Se um bloco de 5 minutos falhar, somente aquele bloco entra na recuperação:

- primeiro: partes de até 2 minutos;
- se ainda falhar: divide apenas a parte problemática;
- mínimo: 3 segundos.

O resultado é reorganizado por timestamp antes de aparecer na tela, então a transcrição continua na ordem correta mesmo quando o Worker reserva termina um bloco antes do principal.

## Workers

### Principal
`https://transcritor-aulas.lucas-luk-lima.workers.dev/`

- código Cloudflare: `worker-principal-v13.1.js`
- binding Workers AI: `AI`
- variável `BACKUP_WORKER_URL` apontando para o Worker reserva
- mantém o failover de cota no backend

### Reserva
`https://transcritor-aulas-backup.lucas-lima8.workers.dev/`

- código Cloudflare: `worker-reserva-v13.1.js`
- binding Workers AI: `AI`

O frontend também consegue reenviar para o outro Worker quando recebe um erro explícito de cota.

## Netlify

Deploy manual somente destes arquivos:

- `index.html`
- `style.css`
- `app.js`
- `_headers`
- `favicon.svg`

## GitHub

Nesta atualização, os arquivos alterados são:

- `app.js`
- `README.md`

Não publique tokens, chaves ou links assinados.
