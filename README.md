<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-wordmark-dark.png">
    <img src="docs/images/logo-wordmark.png" alt="Yidu 译读" width="360">
  </picture>
</p>

<p align="center"><b>An open-source paper reader with sentence-by-sentence translation — bring your own LLM, or use free engines.</b></p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green"></a>
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-2E7D6B">
  <a href="https://github.com/pph-hpp/yidu/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/pph-hpp/yidu?style=flat"></a>
</p>

<p align="center">English | <a href="README.zh.md">中文</a></p>

<p align="center">
  <img src="docs/images/hero.png" alt="Read a paper on the left, sentence-by-sentence translation on the right" width="900">
</p>

Yidu (译读, "translate & read") is a desktop reader for PDF and Markdown papers. Select text on the left and get a side-by-side translation on the right — translation above, original below, one sentence per card. Plug in your own LLM API with domain prompts, or translate with free engines without any API key. The interface is currently in Simplified Chinese and translates into Chinese.

## Features

### Sentence-by-sentence translation

![Select a paragraph, translate sentence by sentence, switch to paragraph view](docs/images/demo-translate.gif)

*Demo: select a paragraph in the PDF; each sentence gets its own translation card, with a sentence / paragraph view toggle.* [Watch in HD (MP4)](docs/images/demo-translate.mp4)

- **Translate on select** — line breaks and hyphenation are cleaned up, text is split into sentences, and each sentence shows translation above original.
- **Many engines** — OpenAI-compatible APIs (DeepSeek, Qwen, Zhipu, Moonshot, local Ollama…), Anthropic, Azure OpenAI; plus **free** Microsoft (Bing) and Google translation, and the official Youdao API.
- **Domain prompts** — give the LLM a system prompt and glossary for accurate technical terms.
- **Per-sentence actions** — copy, retranslate, edit the source and retranslate, lock the pane; or translate any text you type.

### Engines that work out of the box

<p align="center"><img src="docs/images/settings-engines.png" alt="Translation engine settings" width="820"></p>

No API key? Yidu translates with the free Microsoft engine by default. Add an LLM under “Model API” for better terminology, and optionally fall back to the free engine when the LLM request fails.

### Full-paper summary

Send the whole paper to your LLM and get a report — research question, method, results, key terms — saved as Markdown. Add the summary to your prompt as domain context for later translations. (Requires an LLM.)

### PDF annotation

![Highlight, background color and text color annotations](docs/images/demo-annotate.gif)

*Demo: highlight, background color and text color.* [Watch in HD (MP4)](docs/images/demo-annotate.mp4)

Highlights, background colors, text colors and notes are saved as standard PDF annotations, visible in Acrobat and browsers. Undo / redo, atomic `Ctrl+S` saving, and a reminder before closing with unsaved changes.

### More

<table>
  <tr>
    <td width="50%"><img src="docs/images/hero-dark.png" alt="Dark mode"></td>
    <td width="50%"><img src="docs/images/markdown.png" alt="Markdown reading"></td>
  </tr>
  <tr>
    <td align="center">Dark mode</td>
    <td align="center">Markdown: tables, code highlighting, math</td>
  </tr>
</table>

## Quick start

1. Install [Node.js 22](https://nodejs.org/) and Git.
2. Clone and run:

   ```bash
   git clone https://github.com/pph-hpp/yidu.git
   cd yidu
   npm ci
   npm run dev
   ```

3. Press `Ctrl+O` to open a PDF or Markdown file, then select English text to see the translation.
4. (Optional) Open settings (`Ctrl+,`) → “模型 API” (Model API) and enter a Base URL, model name and API key to enable LLM translation and summaries.

Build a Windows installer with `npm run dist`. See [docs/development.md](docs/development.md) (Chinese) for development and testing.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open file |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / save annotations as |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo annotations |
| `Ctrl+L` | Lock the translation pane |
| `Ctrl+Shift+M` | Full-paper summary |
| `Ctrl+,` | Settings |
| `V` `H` `B` `T` `N` | Select / highlight / background / text color / note |

## Privacy & security

- API keys are encrypted by the OS on your machine and used only in the main process; they are never written to config files.
- Document text is sent only to the engine you choose; Yidu asks before first sending text to a free engine.
- The free engines use unofficial web endpoints and may be rate-limited or stop working; you can switch engines at any time.

## License

[MIT](LICENSE). Bundled fonts are under SIL OFL 1.1 (see `resources/licenses/`); test fixture licenses are in `tests/fixtures/LICENSE.txt`. Yidu is an independent open-source project, not affiliated with Microsoft, Google, Youdao or any model provider. LLM features use your own API quota.
