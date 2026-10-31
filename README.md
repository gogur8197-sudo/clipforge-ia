# CLIPFORGE AI — site full-stack

Site responsivo em português com interface de criação, busca de vídeos stock via Pexels e renderização MP4 por FFmpeg. A integração de planejamento por OpenAI é opcional.

## Requisitos
- Node.js 20 ou superior
- Chave de API do Pexels: https://www.pexels.com/api/
- FFmpeg é instalado pelo pacote `ffmpeg-static` para ambientes compatíveis

## Rodar localmente
1. Extraia o ZIP.
2. No terminal, entre na pasta `clipforge-ai-fullsite`.
3. Instale as dependências: `npm install`
4. Copie `.env.example` para `.env` e coloque sua chave em `PEXELS_API_KEY`.
5. Opcional: configure `OPENAI_API_KEY` para planejamento de cenas por IA.
6. Inicie: `npm start`
7. Abra `http://localhost:3000`.

## Como funciona
- O frontend envia tema, estilo, duração, formato, qualidade e, opcionalmente, um arquivo de áudio.
- O backend cria buscas de cenas (OpenAI opcional; fallback local), pesquisa o catálogo de vídeos do Pexels, baixa clipes, ajusta o formato e une tudo com FFmpeg.
- Quando a geração termina, o site mostra a prévia e o link de download MP4.
- O áudio enviado pelo usuário é misturado ao vídeo. Envie apenas áudio que você tenha direito de usar.

## Publicar na internet
Este projeto precisa de um host que execute Node.js e permita processos FFmpeg e arquivos temporários. Um VPS ou container é mais adequado do que hospedagem estática. Configure as variáveis `PEXELS_API_KEY`, opcionalmente `OPENAI_API_KEY`, e `PORT` no painel do host. Não publique o arquivo `.env`.

## Limitações importantes
- Este projeto não baixa conteúdo do TikTok/Instagram nem contorna DRM. Ele busca clipes stock pela API do Pexels; confira os termos e a licença aplicável a cada uso.
- O plano de cenas é básico; não há detecção semântica avançada de batidas, legendas automáticas ou publicação automática.
- Para temas que dependam de pessoas/personagens famosos ou material protegido, a busca pode não encontrar cenas apropriadas. Use conteúdo autorizado.
- O download gerado é temporário e é removido depois de baixado. Para uso público, adicione autenticação, limite de requisições, limpeza periódica de arquivos e armazenamento persistente.
- A geração pode consumir CPU, memória, largura de banda e tempo. Limite o tamanho de upload e monitore os custos.

## Deploy com Render (após colocar o projeto no GitHub)
1. Crie uma conta em https://render.com/ e uma conta no GitHub.
2. Envie os arquivos deste projeto para um repositório GitHub seu.
3. No Render, escolha **New → Blueprint**, conecte o repositório e confirme o `render.yaml`.
4. Nas variáveis de ambiente do serviço, informe `PEXELS_API_KEY`. `OPENAI_API_KEY` é opcional.
5. Aguarde o deploy e abra o endereço `.onrender.com` que o Render mostrar.

Eu não consigo criar o endereço público diretamente sem autenticar numa conta de hospedagem sua. Não coloque chaves secretas em repositório público; informe-as apenas nas variáveis de ambiente do serviço.
