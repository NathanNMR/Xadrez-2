# Xadrez 2 ♛

Jogo de xadrez completo (dois jogadores no mesmo dispositivo), feito em HTML, CSS e JavaScript puro — sem dependências, sem build.

## Como jogar

Basta abrir `index.html` no navegador. Não precisa de servidor nem instalação.

## O que mudou em relação à versão original

O jogo original já tinha uma boa base (tabuleiro funcional, movimentos das peças, detecção de xeque/xeque-mate/afogamento e cronômetro), mas faltavam regras oficiais do xadrez e havia um bug real no histórico. Esta versão:

### Regras adicionadas
- **Roque** (curto e longo), respeitando todas as condições oficiais: rei e torre não podem ter se movido, casas entre eles vazias, e o rei não pode estar em xeque nem passar por casa atacada.
- **En passant**, incluindo a expiração correta do direito de captura após um lance.
- **Promoção de peão com escolha**: agora abre um modal para escolher Dama, Torre, Bispo ou Cavalo (antes promovia sempre para Dama automaticamente).
- **Empate por material insuficiente** (ex.: rei contra rei, rei e cavalo contra rei).
- **Empate pela regra dos 50 lances** sem captura ou movimento de peão.
- **Empate por repetição tripla de posição**.
- Botões de **Desistir** e **Empate combinado**, além do reinício e do desfazer que já existiam.

### Correções
- **Bug do histórico ao desfazer**: no código original, a função que deveria reconstruir a lista de lances após "Desfazer" (`rebuildMoveList`) estava vazia — o próprio comentário do código admitia isso ("removemos visualmente o último movimento... por enquanto"). Na prática, a lista de lances ficava dessincronizada do tabuleiro. Agora o histórico é reconstruído de forma determinística a partir do próprio registro de lances salvos, então desfazer sempre deixa a lista consistente com a posição real.
- **Notação dos lances**: trocada de um formato informal (`♙ e2 → e4`) para notação algébrica padrão (`e4`, `Nf3`, `O-O`, `exd5+`, `Qh4#`), incluindo desambiguação quando duas peças iguais podem ir para a mesma casa.

### Novidades de experiência
- Painel de **peças capturadas** com o saldo de material (`+N`) para cada lado.
- **Destaque do último lance** no tabuleiro.
- **Seleção de tempo por jogador** (3, 5, 10, 15, 30 minutos ou sem cronômetro).
- **Acessibilidade**: casas navegáveis por teclado (Tab + Enter/Espaço), `aria-label` descrevendo cada casa e sua peça, foco visível, e respeito a `prefers-reduced-motion`.

### Organização do código
O projeto original era um único arquivo `.html` de ~2.360 linhas (HTML, CSS e JS misturados, com uma linha em branco entre quase cada instrução). Agora está separado em três arquivos, o que facilita manutenção:

```
index.html   → estrutura da página
style.css    → toda a aparência visual
script.js    → toda a lógica do jogo (regras, IA de validação de lances, estado, UI)
```

## Modo Especial ✨

Além do xadrez clássico, dá para escolher **Modo Especial** no seletor "Modo de jogo". Ele usa um tabuleiro **mais largo (14 colunas × 8 fileiras)** em vez de substituir peças clássicas — cavalos, bispos, torres, dama, rei e peões continuam todos lá, e as peças novas entram "por fora" das torres, mantendo o tabuleiro simétrico e o roque funcionando normalmente (a distância entre rei e torres foi preservada de propósito).

**Primeira fileira do Modo Especial** (de cada lado):

```
Dragão · Mago · Arqueiro · Torre · Cavalo · Bispo · Dama · Rei · Bispo · Cavalo · Torre · Arqueiro · Mago · Dragão
```

**Peças novas**

- 🧙 **Mago** — anda como um bispo, em qualquer distância na diagonal, **ou** uma única casa na horizontal/vertical.
- 🏹 **Arqueiro** — anda uma casa em qualquer direção, mas só para casas vazias (não captura por movimento). Em vez disso, ele **atira a distância**: pode capturar uma peça inimiga exatamente 2 casas em linha reta, sem se mover, desde que a casa do meio esteja livre. Um arqueiro bem posicionado também pode dar xeque a distância.
- 🐉 **Dragão** — combina o salto do Cavalo com o alcance do Bispo (diagonal, qualquer distância). É a peça mais poderosa do Modo Especial depois da Dama.

Cada peça nova tem um **anel colorido temático** (roxo para o Mago, verde para o Arqueiro, laranja para o Dragão) para ser identificada rapidamente no tabuleiro, além do círculo branco/preto que indica o dono da peça.

**Casas de evento** (posicionadas proporcionalmente nas duas fileiras centrais, sempre vazias no início — por isso continuam simétricas em qualquer largura de tabuleiro)

- 🌀 **Portal** (duas casas ligadas entre si) — a peça que pousar em um portal é teleportada instantaneamente para o portal-par, se ele estiver livre.
- 💎 **Poço de Energia** — se um peão pousar aqui, é promovido a Dama na hora, sem precisar chegar até a última fileira. Some do tabuleiro depois de usado uma vez.
- 🔥 **Armadilha** — qualquer peça (exceto o rei) que pousar aqui é destruída imediatamente. Também some após disparar uma vez, então depois de acionada a casa fica segura.

A notação de lances do Modo Especial usa `M` para Mago, `D` para Dragão e `A` para Arqueiro (ex.: `Mc4`, `Dg5`), e o tiro do arqueiro aparece como `Ag4»g6` (a peça atira de g4 e acerta g6, sem se mover).

## Limitações conhecidas / próximos passos possíveis
- É um jogo local para dois jogadores no mesmo dispositivo — não há oponente automático (IA) nem multiplayer online.
- Não há salvamento de partida (recarregar a página reinicia o jogo).
- Não exporta/importa PGN ou FEN, embora a engine já calcule uma posição no formato FEN internamente para detectar repetições — seria uma extensão natural.

## Estrutura de dados

Cada peça no tabuleiro é um objeto `{ type, color, hasMoved }`, onde `hasMoved` é usado para decidir o direito de roque. O tabuleiro é uma matriz 8×8 (`board[linha][coluna]`), com a linha `0` representando a oitava fileira (peças pretas) e a linha `7` a primeira fileira (peças brancas).
