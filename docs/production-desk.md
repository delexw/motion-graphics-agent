# Read-only Production Desk

In the Storyboards tab, **Open Desk** sits immediately before **Open storyboard**.
It opens an inline dialog with the delivered video, transport controls, a seekable
timeline, zoom and clip inspection. Closing it stops playback. It cannot edit,
trim, reorder, remix or save project files.
Opening Desk pauses other audible media, including videos retained in hidden
project tabs. Shared video players also pause competing audible playback when
started or unmuted; silent looping previews are unaffected.

The desk reads existing job metadata and lazily loads `STORYBOARD.json` through
the same reader as the storyboard page. Opening it makes no model, rendering or
audio-generation calls.
While a build has not returned its accepted production response, Desk also reads
and validates the saved `production.json` for inspection. It does not accept that
file as build output or write it back. Accepted job metadata takes precedence.

| Track              | Saved source                                                               | What the desk can establish                                                                    |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Video              | Storyboard scene windows, otherwise ordered production shot durations      | Scene ranges in a flattened rendered video; procedural graphics are not separate editor layers |
| Narration          | Speech-track cues and audio reference                                      | Measured cue windows for the primary narration track                                           |
| Sound effects      | `production.audioTracks` SFX clips, otherwise storyboard descriptions      | Exact source placements for new builds; planned beat windows for legacy builds                 |
| Music / soundtrack | `production.audioTracks` music clips, otherwise the legacy audio reference | Separate music sources for new builds; legacy soundtracks may already include effects          |

Playback uses one delivered media element and its existing mix. Track rows are
an inspection view and do not play stems simultaneously. Missing video or
storyboard data leaves available track metadata inspectable. Invalid cue ranges
are omitted, and intersecting ranges are clipped to the film window.

Music and SFX source clips display read-only WaveSurfer waveforms decoded from
their saved files. They do not synthesize placeholder waveforms or start audio playback.
Unavailable or undecodable audio keeps the clip visible with an unavailable
message. Closing the desk destroys the waveform instance and cancels its load.

The pure model lives in `src/client/lib/production-desk.ts`, the dialog contents
in `src/client/components/production-desk/`, and the shared lazy reader in
`src/client/use-storyboard.ts`. Local fixture tests cover track provenance,
timing bounds, playback, seeking, responsive layout and missing-data recovery.

## Audio source manifest

New full builds return `audioTracks` in their structured production response and
saved `production.json`. Each clip has a unique `id`, `kind` (`music` or `sfx`),
`label`, workspace-relative `file`, absolute `startSeconds`, `durationSeconds`
and linear `volume` gain. Source files start at their own zero and contain the
intended trims, loops and fades. Repeated effects can reuse a file at different
positions. Music sources contain no SFX or narration.

The shared schema and agent guidance live in `src/shared/audio-tracks.ts`.
All three renderers receive that guidance. The model still uses tools/code to
prepare and mix music and SFX, handing the finished mix to the selected renderer
through its existing audio contract. Separate source files and their exact
placements remain saved for Desk. The application validates manifest timing and
paths, but does not mix those source clips. Existing narration mixing is unchanged.
An empty array records no separate music/SFX clips; omitting the field preserves
legacy inspection behavior. Desk uses the source manifest instead of the merged
soundtrack whenever present. Existing projects are not automatically separated
or regenerated.

## Measured music beats

Music clips lazily read their saved `<source>.beats.json` through the read-only
`GET /api/music-analysis/:projectId/:jobId?file=...` endpoint. The server validates
the version, analyzer, timestamps and source SHA-256. Opening Desk never runs
analysis or generation. Each unique source is fetched once per Desk session; repeated
placements share the map and add their own film start time. Source files already
contain their trims and loops, so their source offset is zero.

Valid maps appear as equal ticks below music waveforms. If ticks would be closer
than 6 px, a zoom-in label replaces them; ticks are never downsampled into invented
bar lines. The selected clip's inspector shows estimated BPM and the beat count.
Previous/Next beat buttons, or `[` / `]` on the selected music clip, seek the
existing video and announce the selected beat. No stems play separately.

Missing, invalid, unavailable or fingerprint-mismatched maps show explicit status
text and no ticks. Empty maps remain valid. Beat estimates do not establish
verified downbeats, bars or perceptual synchronization. Closing Desk cancels reads
and disconnects marker resize observers. Beat handling lives in `use-music-beats.ts`,
`lib/desk-music-beats.ts` and `components/production-desk/music-beats.tsx`.
