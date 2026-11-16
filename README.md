# RO Builds

App Android (fã-app, não oficial) para montar e guardar builds do **RO Survivors** (ro-survivors.com).

## Instalar / atualizar
1. Abra **Releases → a versão mais recente** deste repositório no celular.
2. Baixe o arquivo `RO-Builds-v1.0.X.apk` e abra.
3. Na primeira vez, permita "instalar apps desconhecidos" para o navegador.
4. Versões novas instalam por cima, sem perder as builds salvas.

## Funções
- **Montador**: classe, atributos (48 pontos), talentos, equipamentos com refino e cartas, pet e notas. Salva automaticamente.
- **Talentos**: lê a página de talentos do site dentro do app e permite buscar e adicionar à build.
- **Builds**: builds salvas, importar/exportar por código (`ROB1:…`) e recomendadas.
- **Mais**: abrir o jogo, backup e diagnóstico.

## Como é compilado
A cada push na branch `main`, o GitHub Actions compila o APK e publica em Releases.
O código da interface fica em `app/src/main/assets/www/`.
