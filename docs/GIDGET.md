# Gidget

Gidget is GadgetBoy POS's private repair and shop-data assistant. Clicking the GadgetBoy logo opens the same assistant on desktop and mobile.

## Local model

Gidget runs an open-source GGUF model inside the installed application. No Ollama installation, paid AI account, or per-message AI fee is required.

- Windows downloads Qwen3 4B Q4_K_M (approximately 2.5 GB) on first use and runs it with `node-llama-cpp`.
- Android downloads Qwen3 1.7B Q4_K_M (approximately 1.3 GB) on first use and runs it through native llama.cpp.
- Downloads use HTTPS and are checked against the expected SHA-256 digest before the model is loaded.
- Models remain in private application storage and are not included in cloud backups.
- `GBPOS_TIMEZONE` is optional and defaults to `America/New_York`.

Railway authenticates the user and supplies privacy-minimized, read-only POS context. It does not run the language model and does not receive generated answers.

## Web research

For repair questions, the secure context service can search a restricted list of repair and manufacturer domains. It returns titles, snippets, and links to the on-device model. Gidget treats forum material as a lead rather than verified measurement data and shows source links with its answer. Local chat and saved knowledge remain usable if web research is unavailable.

## Knowledge and history

- The newest 30 full conversations remain in each signed-in user's history.
- Older conversations are removed automatically.
- Durable knowledge is separate from chat history and remains available after its source chat expires.
- Gidget only saves durable knowledge when the technician explicitly asks it to remember, retain, learn, or save something.
- Passwords, PINs, client contact details, payment data, unlock codes, private notes, and authentication information are rejected from memory.
- Repair knowledge is technician-provided context, not proof for safety-critical measurements or procedures. Saving knowledge updates Gidget's private reference database; it does not alter model weights.

Apply `supabase/migrations/20260722014635_add_gidget_history_and_memory.sql` before enabling persistent history and memory.

## POS boundaries

- Supabase authentication and RLS determine the active shop and conversation owner.
- POS access is read-only and limited to work orders and sales.
- Queries return counts and privacy-minimized ticket summaries.
- Gidget never selects client contact details, credentials, device passwords, or internal notes.
- Gidget cannot create, edit, delete, message, order, refund, or otherwise change POS records.

## Voice

Voice mode uses the device's speech recognition and speech synthesis capabilities, so it has no AI voice fee. Android uses native Capacitor speech recognition and text-to-speech plugins; browser and Electron clients use the platform Web Speech APIs. It continuously restarts listening while voice mode is open. Starting to speak cancels Gidget's current spoken response and pending answer so the technician can interrupt naturally. Devices that do not expose speech recognition receive a clear fallback message and can continue using text chat.

The animated technical sphere is rendered locally with Three.js and does not transmit visual data.
