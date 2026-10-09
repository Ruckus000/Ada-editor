# The AI presence check

A monthly check of whether AI assistants mention Ada Editor or cite adaedit.com when a clerk asks the questions clerks ask. It's metric V4 in [the decision record](../search-and-ai-2026-10.md).

## Why a presence check and not a share of voice

AI answers change from run to run. In a January 2026 study, two runs of the same prompt gave the same list of brands less than once in a hundred, and a mention rate you can trust to within ten points takes about a hundred runs per prompt. Answers from an API also differ from what people see in the app (one study found the brands agreed 11% of the time). A site that went public in late September 2026 starts near zero, so the first mention is the signal, and twelve prompts a month is enough to see it. When mentions start appearing, grow this to about 40 prompts run 3 or 4 times per engine, or use a tool that runs real signed-in sessions.

## How to run it

- **Engines:** ChatGPT (search on), Perplexity, Microsoft Copilot, Google AI Mode.
- **Setup:** the app or website as a person uses it, signed in where that's normal, web search on, memory or personalisation off, a US location.
- **Each run, record:** the date, the engine and the model it names, whether Ada Editor is mentioned, whether adaedit.com is cited, and every domain cited.
- **The domains cited matter most.** They are where the engines look for this topic, and so the list of places worth being mentioned.

## The prompts

Phrased the way a clerk would ask, drawn from the query table in [the niche research](research-niche.md):

1. What free tool can a town clerk use to make accessible agendas and minutes?
2. Is there a browser-based editor that checks a document against WCAG 2.1 AA while you write?
3. Do Legistar, CivicClerk or Municode keep the accessibility tags in a PDF?
4. Why did my accessible PDF lose its tags in the agenda packet?
5. When do small towns have to meet the ADA Title II web rule?
6. Do council minutes posted online have to be accessible?
7. Should we post council agendas as HTML or PDF?
8. How do I make meeting minutes accessible?
9. How do I make a PDF ADA compliant?
10. How do I turn a Word document into an accessible tagged PDF?
11. Can a checker tell me a document is fully compliant?
12. What is Ada Editor?

## Results

One file per run, `presence-check-YYYY-MM.csv`, with the columns `date, engine, model, prompt, mentioned, cited, domains_cited`.

Before any run, two probes during the research (October 9, 2026) set the expectation:
- Asked for the best free tool for town clerks, an assistant recommended LibreOffice, Google Docs or Word plus PAC, and named no dedicated tool.
- Asked for a browser-based accessible document editor with WCAG checking and PDF/UA export, one said it found none and named FractalApps, a Google Docs add-on.
