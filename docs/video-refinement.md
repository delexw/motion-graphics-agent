# Fine-tune continuity

Each fine-tune creates a version with its own editable workspace. The source selector includes completed and cancelled full-video versions that have a saved builder session, with cancelled versions labelled explicitly. It copies the selected version's authored files and verified renderer cache, preserving earlier outputs. It resumes that version's verified generation session rather than opening a disconnected conversation or resuming a helper.

Submitted fine-tune instructions remain active by default when their build is cancelled, interrupted or fails. Before submitting a new refinement, expand **Earlier refinement requests** and uncheck any request to discard. The saved choice applies to subsequent refinements in that direction and can be reversed by checking the request again. Unchecking withdraws the instruction; it does not undo changes already in the selected source video. New versions collect previous instructions from full-video jobs in the same direction, in submission order. Other directions and previews are excluded. Stored history is deduplicated by originating job ID, so carrying it through several versions does not repeat requests. The latest fine-tune message remains separate for Conversation and Edit brief.

The new workspace contains `renders/REFINEMENT_HISTORY.json` with retained previous requests, their known timestamps and image IDs, discarded request IDs, and the newest request. The build prompt instructs the model to read this file and preserve retained requirements unless a later request explicitly replaces or withdraws them, and ignore discarded requests even if they remain in the resumed session. Requests from other stopped versions are instructions, not evidence that their changes exist in the selected source. Selecting a cancelled version itself preserves that version’s partial authored files and resumes its verified builder session; the original cancelled version stays saved. The history file is orchestration metadata under `renders/`, alongside the revision checkpoint, so writing it does not invalidate inherited render inputs. Images associated with earlier requests are copied from available stored assets as well as the new attachments; unresolved asset IDs are recorded honestly.

```mermaid
flowchart TD
    Source[Selected completed or cancelled version] --> Workspace[Copy authored workspace]
    Requests[Earlier requests for this direction including stopped builds] --> History[REFINEMENT_HISTORY.json]
    New[Latest request and attachments] --> History
    Requests --> Images[Carry available image references]
    Source --> Session[Resolve verified generation session from recorded events]
    Session --> Resume[Resume builder in new workspace]
    Workspace --> Resume
    History --> Resume
    Images --> Resume
    Helper[Cache summary, review, localization or capture helper] --> Own[Keep its own session]
```

Generation-session ownership belongs to generation orchestration. `generationSessionEvents` is bound only around the actual page/video builder and planning calls. Main correction orchestration already owns its session updates; cheap corrections keep a separate correction session. The shared event recorder only records events and never changes a job's generation session, so adding a future helper cannot overwrite it.

When an older saved version has a contaminated session ID, `Store.generationSessionId` retrieves its most recent recorded generation or main-correction session. A legacy session without event history remains supported. An ID positively identified as a helper is rejected if no verified builder session is available. Historical source records and completed files are preserved; selecting a version resolves the right session for the new job and checkpoint.

Tests use mocked generation calls and local image/workspace fixtures for both Claude and Codex. They cover stopped requests, attachments, repeated refinements, direction isolation, session provenance and helper exclusion. No real provider API is called.

## Explicit settings changes

Before authoring a refinement, the selected main model interprets the latest request in a
separate tool-free, text-only settings step. `Refinement settings` has its own Activity
and Governance invocation, token usage and cost; its helper session never replaces the
verified builder session. No extra call runs for previews or ordinary first builds.

Supported amendments include narration engine and compatible preset voice, speed and
volume, independent narration/subtitle switches for each language, named timed speech
items, output language, aspect ratio, resolution, frame rate and target duration.
The model receives the full supported voice catalog rather than only the source voice.
For example, “use Ming TTS Chinese female” can select a valid Chinese female Ming preset
without asking the user to enable Ming merely because the previous version used Kokoro.
Actual synthesis still checks the provider's readiness and reports genuine failures.

Each amendment must quote the user's actual request and passes the same speech, language
and delivery validators as creation. Unmentioned settings and unrelated language profiles
remain unchanged. Unsupported renderer/model-routing changes fail explicitly rather than
silently switching execution routes. Quoted dialogue is not a production-setting change.

The accepted plan and effective request are saved in this version's diagnostics and on
its job (`refinementSettings`, `effectiveRequest`). Descendants inherit the selected
source version's effective settings. The original project request, earlier versions and
media files stay unchanged. Setup, narration, authoring, output validation and language
exports all consume the new version settings. Changed voice profiles invalidate copied
narration state. Its accepted cues are retained in `audio/previous-narration.json` as source
copy, not as valid new audio. This keeps the original words available when switching
voices while requiring a new accepted track. Stale Kokoro speech cannot be accepted
for a Ming refinement; cue text
and unrelated visuals remain the author's preservation obligations. Existing renderer cache
compatibility checks govern reuse when output settings change.

Both refinement interfaces show **Version settings** for the selected source version.
The settings implementation is owned by `src/shared/refinement-settings.ts`, interpretation
by `src/server/jobs/subworkflows/refinement-settings/`, routing by `jobs/workflow.ts`, and
presentation by the shared `video-version-settings.tsx` component. Regression tests mock
both SDK providers and local speech preparation; no external inference or downloads run.

## Deleting versions

A trash icon beside the version buttons deletes the selected finished, failed or stopped video version after confirmation. Deletion is unavailable while any project work is running. The server checks this again, removes only the version’s owned workspace, and saves a deletion record so its refinement request cannot return through a later version’s copied history. Other version workspaces and the event audit remain intact.

Version numbers are persisted per direction with a high-water counter. Deleting v2 from v1/v2/v3 leaves v1/v3; the next build is v4. Deleting the highest or every version also preserves the counter. Legacy jobs receive their existing displayed numbers before any deletion.
