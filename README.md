# Transcritor de Aulas — V13.6 com seletor de idioma

O site agora permite escolher o idioma do áudio antes de transcrever.

- Português (`pt`)
- Japonês (`ja`)
- Automático
- Inglês, Espanhol, Francês, Alemão, Italiano, Coreano e Chinês

A escolha fica salva no navegador.

Para vídeo em japonês, selecione **Japonês**.

## Arquitetura mantida

- blocos principais de até 5 minutos;
- dois Workers em paralelo;
- carga aproximadamente 50/50;
- recuperação: 5 min → até 2 min → partes menores → mínimo 3 s;
- failover de cota;
- cancelamento sem F5.

## Atualização necessária

### Worker principal
Cole `worker-principal.js` e faça Deploy.
O GET deve mostrar `"versao":"13.6-primary"`.

### Worker reserva
Cole `worker-reserva.js` e faça Deploy.
O GET deve mostrar `"versao":"13.6-reserva"`.

Não altere o binding `AI` nem `BACKUP_WORKER_URL`.

### Netlify manual
Publique apenas:
- `app.js`
- `index.html`
- `style.css`
- `_headers`
- `favicon.svg`

## GitHub
Arquivos desta atualização:
- `app.js`
- `index.html`
- `style.css`
- `README.md`
- `worker-principal.js`
- `worker-reserva.js`
