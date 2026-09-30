# Transcritor de Aulas — Failover entre duas contas Cloudflare

Arquitetura:

Netlify → Worker principal (conta A) → Workers AI

Se a cota diária do Workers AI da conta A acabar:

Worker principal → Worker reserva (conta B) → Workers AI da conta B

O frontend continua chamando somente o Worker principal. Portanto, depois de configurar o failover, mudanças de Worker não exigem alterar o Netlify.

## Arquivos

### Netlify
- `index.html`
- `style.css`
- `app.js`
- `_headers`

### Cloudflare — conta principal
- `worker-principal-v13.1.js`
- Binding Workers AI: `AI`
- Runtime variable: `BACKUP_WORKER_URL`

### Cloudflare — conta reserva
- `worker-reserva-v13.1.js`
- Binding Workers AI: `AI`

## Configuração do Worker reserva

Na SEGUNDA conta Cloudflare:

1. Crie `transcritor-aulas-backup`.
2. Cole `worker-reserva-v13.1.js`.
3. Adicione o binding Workers AI chamado `AI`.
4. Faça Deploy.
5. Copie a URL `https://...workers.dev/`.

## Configuração do Worker principal

Na conta principal:

1. Substitua o código pelo `worker-principal-v13.1.js`.
2. Mantenha o binding Workers AI `AI`.
3. Em Runtime variables and secrets, crie uma variável de texto:
   - Key: `BACKUP_WORKER_URL`
   - Value: URL pública completa do Worker reserva
4. Deploy.

`BACKUP_WORKER_URL` não é segredo; é apenas um endereço público.

## Teste

Abra o Worker principal. O JSON deve mostrar:

- `"versao":"13.1-primary"`
- `"backup_configurado":true`

Abra o Worker reserva. Deve mostrar:

- `"versao":"13.1-reserva"`

## GitHub

Não publique tokens, chaves ou links assinados.
