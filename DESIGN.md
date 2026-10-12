# AIONIX GEAR — Sistema visual

## Mundo
"Instrumento de bancada": a precisão de um multímetro e a calma de um livro-caixa bem feito. Grafite quente, superfícies limpas, um único acento cobre — a cor das trilhas de placa e dos dissipadores. Nada de neon "gamer", nada de verde NVIDIA ou vermelho AMD.

## Cor (OKLCH, tokens em `src/app/globals.css`)
- Neutros grafite com leve calor (hue ~70). Duas camadas: conteúdo (`--surface`) e navegação/painéis (`--panel`).
- Acento cobre (`--accent`): ações primárias, seleção atual, foco. Nunca decoração.
- Semânticas: `--positive` (lucro, recebido), `--negative` (prejuízo, atraso), `--warning` (atenção), `--info`.
- Estados de item têm tons fixos (disponível=positivo, reservado/negociação=info, montagem=acento, defeito=negativo, saídos=neutro).

## Tipografia
- IBM Plex Sans para toda a interface (400/500/600). Escala fixa em rem, razão ~1.15.
- IBM Plex Mono apenas para códigos de item (GX-0001), números de série e valores em tabelas de conferência.
- Numerais tabulares em todo valor monetário (`.num`).

## Forma
- Raio 10px em superfícies, 8px em controles, 999px só em badges.
- Sombras discretas com deslocamento e desfoque; bordas de 1px como separação principal.
- Ícones: lucide, traço 1.75, tamanho 16/18.

## Movimento
150–220ms, ease-out exponencial; só para estado (abrir gaveta, toast, foco). Respeita `prefers-reduced-motion`.

## Navegação
- Desktop: barra lateral recolhível + barra superior com busca universal (Ctrl+K) e ações rápidas.
- Celular: barra inferior com Início, Estoque, Ação rápida (+), Vendas, Menu. Alvos de toque ≥44px.

## Proibido
Texto em gradiente, glassmorphism decorativo, cartões iguais de ícone+título como estrutura, borda colorida lateral grossa, "eyebrow" acima de títulos, emoji como ícone, números de vaidade.
