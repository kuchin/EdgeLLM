TODO after analyzing

https://github.com/mybigday/llama.rn/blob/e88c5c82a91b424a4e2b461f4d8f8eaa5df8912b/cpp/rn-mtmd.hpp

- Prefer pass-through for supported formats
  - Detect format by reading only the first 12–16 bytes of the local file (PNG/JPEG/BMP/WebP sniff). Don’t base64-read the whole file.
  - If header is PNG/JPEG/BMP, pass the absolute native path (no file://) directly to image_url.url.
  - Rely on mtmd/stb_image to decode PNG/JPEG/BMP natively; don’t resize or composite alpha yourself.
  - Reference: tokenizer loads local files and base64 in rn-mtmd, and formats are handled in the native path [rn-mtmd.hpp file branch](https://github.com/mybigday/llama.rn/blob/e88c5c82a91b424a4e2b461f4d8f8eaa5df8912b/cpp/rn-mtmd.hpp#L210), [Multimodal example](https://github.com/mybigday/llama.rn/blob/e88c5c82a91b424a4e2b461f4d8f8eaa5df8912b/example/src/screens/MultimodalScreen.tsx), [README](https://github.com/mybigday/llama.rn).

- Only download or convert when necessary
  - If the URI is http(s), download to cache; otherwise use it as-is.
  - If header is WebP: try to fetch an alternate rendition (e.g., replace format:webp → format:jpeg) and redownload. If it’s still WebP, prompt or fallback.
  - If header is unsupported/unknown: as a last resort, convert to BMP (or JPEG) once; otherwise surface an error.

- Drop heavyweight conversions by default
  - Remove PNG/JPEG→BMP conversion in the common path. Let mtmd do its own preprocessing and resizing.
  - Don’t alpha-composite PNGs in JS; mtmd will consume RGB and handle preprocessing internally.
  - Avoid base64 unless needed (e.g., when you truly must embed via data URI); base64 costs CPU and memory.

- Normalize the path precisely
  - Always pass a plain absolute path (no file://) to image_url.url. The native file loader calls fopen() directly and won’t handle schemes.

- Validate cheaply before running completion
  - Call getFormattedChat(messages) and verify has_media=true and media_paths populated. If not, fallback to conversion or alternate fetch.
  - Keep logging minimal in success path; expand logs only on failure.

- Keep an allowlist and short-circuit quickly
  - Supported headers: PNG (89 50 4E 47), JPEG (FF D8 FF), BMP (42 4D).
  - Unsupported but common on CDNs: WebP (RIFF…WEBP). Handle with URL variant or fallback.

- Prefer data URI only if required
  - If you must send base64, embed as data:image/...;base64,... in image_url.url (that’s what rn-mtmd expects for base64). Avoid a separate base64 field.

- Optional resilience
  - If a store/library path like ph:// (iOS Photos) appears, resolve to a real file path before proceeding (camera roll resolvers).
  - Keep a small, bounded “header sniff” read (first 16 bytes) to classify; no full-file reads for detection.

- Summary of minimal-overhead flow
  - Resolve URI → local absolute path (strip file://)
  - Sniff header (16 bytes)
  - If PNG/JPEG/BMP → pass-through path
  - If WebP → try alt URL (jpeg/png); else prompt/fallback once
  - If unknown → optional single conversion to BMP; else error
  - Validate with getFormattedChat; proceed to completion


--------------------------------------------------------------------------------------------------------

Vision https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/discussions/4
