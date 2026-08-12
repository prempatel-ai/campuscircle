# TokenTown

**[▶ Open the live city](https://laurentiugabriel.github.io/token-town/)**

An isometric city that runs a miniature transformer in real time. Every district
is one stage of a language model, and a convoy of trucks carries the hidden state
along the roads: cut into tokens at the docks, cast into a vector at the foundry,
stamped with a position, driven around the layer ring once per block, then turned
into a probability distribution at the stadium and gambled into a single token at
the sampler, which drives back up the feedback highway so the whole city can run
again for the next word.

Pure static site. No build step, no dependencies, no network calls.

## Run it

Open `index.html` in a browser. That's it.

If you'd rather serve it:

```
python -m http.server 8000
# → http://localhost:8000
```

## Controls

| | |
|---|---|
| **Space** | play / pause (holds a reading stop indefinitely) |
| **S** | advance exactly one stage |
| **R** | reset and replay the slow tour |
| **F** | toggle camera follow |
| **L** | toggle labels |
| drag | pan · scroll: zoom · double-click: fit the whole city |
| **+ − ⤢** | zoom controls on the left edge; **⤢** shows the whole city |
| click a district | pin its explanation (click empty ground to resume) |

The view starts zoomed in on the convoy and follows it, since that is where
everything happens. Zooming out to the whole model is deliberate: the **⤢**
button, a double-click, or the scroll wheel. Turning off **Follow** lets you
pan around independently.

The sliders change **speed** (0.4×–8×), **layer count** (2–12), **temperature** and
**top-p**. Temperature and top-p feed the real sampler, so you can watch a cold
model lock onto one tower and a hot model spread its bets.

## Pacing

It is built to be read, not raced. The first time the convoy reaches a district
it stops for 9–26 seconds, scaled to the length of that district's explanation,
and a progress bar under the panel text shows how much of the stop is left. The
first token therefore takes about **4½ minutes**: that is the guided tour.

After every district has been explained there is nothing new to read, so the city
switches to a watchable pace (~40s per token) and the repeated layers fast-forward,
since they are the same road with different weights. The HUD says which mode you
are in. The Speed slider scales everything, reading stops included; **Reset** (⟲)
replays the slow tour, while **Run** keeps what you have already read.

## The districts

| District | Stage |
|---|---|
| Tokenizer Docks | text → tokens |
| Embedding Foundry | token ID → vector |
| Positional Beacon | sinusoidal position encoding |
| Pre-Norm Gate | LayerNorm before each sub-layer |
| Attention Plaza | Q/K/V projections, scaled dot-product attention |
| KV Cache Warehouse | one silo per cached token |
| Residual Bridge | the residual stream's bypass lane |
| Feed-Forward Mill | 12 → 24 → 12 with a GELU |
| Layer Counter Arch | the ring repeats, different weights each lap |
| Vocabulary Stadium | logits → softmax, one tower per candidate |
| The Sampler | temperature, nucleus cut, dice roll |
| Output Plaza | the emitted token, on a jumbotron |
| Feedback Highway | autoregression |

## How much of it is real

**Genuinely computed, live, in the browser:** the tokenizer split; the embedding
lookup; sinusoidal positional encoding; LayerNorm; 2-head scaled dot-product
attention with causal masking over a real, growing KV cache; the residual adds; a
GELU feed-forward; temperature and top-p sampling. The bars on the truck are the
actual vector. The beams over the warehouse are the actual softmax weights, and
they sum to exactly 1. Prefill really does carry every prompt token through at
once while decode really does carry only one and read the rest from the cache.

**Scaled down:** 12 dimensions instead of thousands, 2 heads instead of dozens,
2–12 layers instead of 80, a few hundred vocabulary items instead of 100k+.

**Deliberately faked:** the weights are random; nothing here was trained, so a
pure random-weight model would emit noise. To keep the output legible the final
logits blend the real hidden-state projection with a bigram prior built from a
small fixed corpus (`CORPUS` in `js/toy-model.js`). Attention scores are also
sharpened and given a small first-token ("sink") and recency bias so the map
resembles the patterns trained models actually produce. Treat the text the city
writes as scenery; treat the mechanism as the lesson.

## Layout

```
.github/workflows/  GitHub Pages deployment
index.html          markup, controls, about copy
css/styles.css      light, print-like UI
js/iso.js           isometric projection + box/cylinder/ribbon primitives
js/toy-model.js     the transformer: tokenizer, attention, FFN, sampler
js/city.js          routes, stations, districts, buildings, props
js/sim.js           the state machine that walks a token through the city
js/render.js        canvas 2D painter's-algorithm renderer
js/ui.js            panels, narration, controls
js/main.js          camera, input, frame loop
```

The city is laid out on a grid; `City.routes` holds the polylines the convoy
drives, and `City.stations` maps distances along those polylines to stage IDs.
`Sim` fires a stage handler when the convoy reaches a station, which is where all
the model math happens.

## Credits

Inspired by the idea behind [PGSimCity](https://nikolays.github.io/PGSimCity/),
which models PostgreSQL as a city. All code, art and copy here are original.
