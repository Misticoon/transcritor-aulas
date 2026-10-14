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

## Horário progressivo (V13.9)

Nos campos **Início** e **Fim**, digite os números como em um relógio que desloca os dígitos para a esquerda:

- `1` → `00:00:01`
- `12` → `00:00:12`
- `123` → `00:01:23`
- `1234` → `00:12:34`
- `12345` → `01:23:45`

Ao focar e começar a digitar, o primeiro número inicia um novo horário, sem exigir que os zeros sejam apagados. Use Backspace para remover o último número ou Delete para zerar. É possível colar um horário pronto como `01:13:00`.

A validação exige minutos e segundos de `00` a `59`. As opções **Desde o início** e **Até o final** permanecem funcionando, assim como o ajuste do final à duração real do vídeo.

Somente `app.js`, `index.html`, `style.css` e este README foram modificados. Os Workers continuam inalterados.
