# Transcritor de Aulas

## Estado atual

O frontend usa dois Workers Cloudflare em paralelo, com blocos principais de até 5 minutos e recuperação automática em blocos menores.

## Idioma

O seletor de idioma agora começa por **Automático**, que também é o padrão quando não existe uma preferência salva no navegador.

## Intervalos

Em **Somente trecho**, há duas opções adicionais:

- **Desde o início**: usa `00:00:00` como início e deixa você informar apenas o horário final.
- **Até o final**: deixa você informar apenas o horário inicial e usa automaticamente o final real do vídeo.

Se o horário final digitado passar da duração real da mídia, o sistema limita automaticamente o intervalo ao final do vídeo. Exemplo: vídeo termina em `01:13:00` e o usuário informa `01:30:00`; o sistema usa `01:13:00`.

## Netlify — deploy manual

Publique:
- `app.js`
- `index.html`
- `style.css`
- `_headers`
- `favicon.svg`

## Cloudflare

Nenhuma alteração de Worker é necessária nesta atualização.

O repositório mantém:
- `worker-principal.js`
- `worker-reserva.js`
