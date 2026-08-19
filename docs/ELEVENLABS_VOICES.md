# ElevenLabs reading voices

Vocado discovers voices directly from the ElevenLabs API. There are no
per-language voice IDs to configure in Vercel.

For each learning language, the server requests the paid ElevenLabs shared
Voice Library using native language, accent, and gender filters. Settings shows
up to two female and two male voices with their ElevenLabs previews; a learner's
chosen voice ID is saved on that language track. Article generation revalidates
the selection against the live language list before using it.

When a regional catalogue has fewer than four suitable voices, Vocado fills the
remaining places with native base-language voices. Catalan currently has no
shared Voice Library catalogue, so it uses compatible voices already available
to the account instead.

## Required setup

1. Create an ElevenLabs API key with **Text to Speech: Access** and
   **Voices: Read**. `Voices: Write` is not required.
2. Put that key in `ELEVENLABS_API_KEY` in Vercel and your ignored local `.env`.
3. Run `supabase/migrations/add_language_tracks.sql` in the Supabase SQL Editor.
4. Then run `supabase/migrations/add_tts_cache.sql` in the same editor.
5. Redeploy Vercel or restart local development after changing the key.

## Accent behaviour

ElevenLabs determines the native language and accent metadata. Vocado sends the
selected regional variety as a Voice Library filter for British, American,
Mexican, Colombian, Rioplatense/Argentine, Andalusian, Bavarian, Austrian,
Swiss German, Québec/Canadian, Brazilian, and European Portuguese voices.

If an accent does not have a matching verified voice, Settings still offers the
voices verified for the base language. A native-speaker listening review remains
the right final check for any regional-learning experience.

## Optional custom accent voices

If ElevenLabs has no suitable voice, create or clone one in ElevenLabs, label
it with its language/accent, and make it available to this API key. It will then
appear automatically after the short server cache expires. The local
`npm run voice:design` helper can create auditions, but is optional and needs
Voice Generation access only when you use it.
