# Authoring skill registrations

Each skill has a named registration and prompt. The upstream files are downloaded at Kiteva startup into the Git-ignored `skills/<id>/<revision>/` folder. They are not bundled in source.

| File                   | Responsibility                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `anysearch.ts`         | AnySearch research skill, source and concise guidance                                     |
| `anatomy.ts`           | Anatomy upstream repository, identity, workspace path and native Claude name              |
| `anatomy-prompt.ts`    | Anatomy instructions introduced to both providers                                         |
| `registry.ts`          | Explicit list of skills and combined guidance                                             |
| `types.ts`             | Shared registration contract                                                              |
| `installation.ts`      | Startup download/update, immutable revisions, integrity verification and offline fallback |
| `../bundled-skills.ts` | Workspace staging and Claude plugin configuration (legacy module name)                    |

To add a skill, create `<id>.ts` and `<id>-prompt.ts` and register it in `registry.ts`. Use an explicit upstream repository; never discover user-global skills. Startup downloads the upstream default-branch ZIP directly over HTTPS using Node.js and reads the exact commit from its ZIP comment, downloads without executing upstream code, hashes regular files, requires `SKILL.md` and `LICENSE`, and atomically replaces `current.json` after validation. Updates retain previous revisions. A failed update uses the last verified installation. Without one, the app opens but file-enabled agent turns fail with a setup message. Internet access is needed for the first installation; no Git CLI, skills CLI, GitHub API or access token is required; subsequent launches can work offline.

Both providers receive copies from the same verified installation. Claude keeps its explicit local plugin and native Skill tool; Codex reads the same workspace files. The historical plugin namespace `bundled-authoring` remains stable for existing sessions. Text-only tasks stage no skills. Updates do not touch running project workspaces or user-global SDK settings. Unit/provider tests use local fixtures; the optional real Anatomy render test runs when a local installation and browser are available.

AnySearch uses the same installation and staging lifecycle. Its registration specifies CommonJS for the upstream Node CLI, preserving operation inside module-based projects. Research guidance covers documentation, command-line parameters, repository examples and source code.

Each registration declares its purpose. Only `visual_authoring` skills participate in visual-resource selection; `research` skills remain available independently of that choice.

## Stageshow

`stageshow.ts`, `stageshow-prompt.ts` and `stageshow-metadata.ts` register the
`stageshow/` subdirectory of `benjitaylor/skills` for both providers and JEV.
Registrations may specify `sourceDirectory`; extraction, integrity manifests and
offline reuse remain bound to that directory as well as the repository.
See [Stageshow integration](../../../../docs/stageshow.md) for MG precedence,
video timing, simulated-versus-recorded boundaries and third-party asset notices.

## img2threejs

`img2threejs.ts`, `img2threejs-prompt.ts` and `img2threejs-metadata.ts` own its upstream source, both-provider guidance and JEV comparison description. The upstream installer is not executed. Like Anatomy, it downloads the latest default-branch commit on every backend startup, records the resolved commit and file hashes, and uses the last verified local installation when updates fail. A missing first installation uses the existing setup error; it is never advertised as an installed successful fallback.

JEV receives scoped image metadata and the existing brief's observed descriptions/asset evidence, comparing reference reconstruction against Anatomy, UI libraries and local code. This is one primary resource per job, not a renderer or MG choice.

`procedural-runtime.ts` copies the app-owned `src/authoring/procedural-model.ts` into the job's render-input `vendor/` directory, outside the unchanged skill. It rejects linked destinations and supports both workspace layouts. The browser helper restores initial transforms for absolute-time poses, disposes owned resources and exposes an explicit-camera capture hook. The main model still authors the pose function, sets all animated material/shader values and owns the production plan. The hook does not launch a browser or write screenshots; existing renderer review must record actual captures.

See [the integration guide](../../../../docs/img2threejs.md) for usage and limitations. Automated tests use local archives, mocked JEV/provider responses and a Chromium fixture; none invokes inference providers.
