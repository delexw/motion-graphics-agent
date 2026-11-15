import { api } from "../../lib/api";
import { CharacterInheritance } from "./characters";
import { ProjectReuseChoice } from "./choice";
import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Collapse, Input, Segmented, Space, Tag, Typography } from "antd";
import { Film, Palette, Settings2 } from "lucide-react";
import type { Run, Style } from "../../../shared/contracts";
import { projectName } from "../../../shared/project-name";
import { candidateStyleName } from "../../lib/candidate-style-name";
import { Dialog } from "../../dialog";
import { translateUi, useUiLanguage } from "../../i18n";
import { SettingsSectionHeading } from "../settings-section-heading";
import { VideoVersionSettings } from "../video-version-settings";
import { useConversationAttachments } from "../conversation-attachments";
import { RoomFilePick } from "../../room/room-file-card";
import { ProjectReuseChoicesSchema, type ProjectReuseSource } from "../../../shared/project-reuse";
import "./project-reuse.css";

const { Text } = Typography;
const appearanceFields = [
  { id: "visual", title: "Visual direction" },
  { id: "palette", title: "Color palette" },
  { id: "typography", title: "Typography and layout" },
  { id: "motion", title: "Motion and transitions" },
] as const;

export function ProjectReuseDialog({
  run,
  source,
  styles,
  onClose,
  onCreated,
}: {
  run: Run;
  source: ProjectReuseSource;
  styles: Pick<Style, "id" | "name_en">[];
  onClose: () => void;
  onCreated?: (draftId: string) => void;
}) {
  useUiLanguage();
  const [choices, setChoices] = useState(() => ProjectReuseChoicesSchema.parse({}));
  const [brief, setBrief] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const operationId = useRef<string>(undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedCharacters, setPickedCharacters] = useState<string[]>([]);
  const [availableCharacterCount, setAvailableCharacterCount] = useState<number>();
  const attachments = useConversationAttachments(run.id, source.request.assetIds);
  const count = Object.values(choices).filter(Boolean).length;
  const styleName = source.candidate
    ? candidateStyleName(
        source.candidate,
        styles.map((style) => ({ ...style, name_en: translateUi(style.name_en) })),
      )
    : translateUi("Not recorded");
  const sourceFiles = attachments.filter((asset) => source.request.assetIds.includes(asset.id));
  return (
    <Dialog
      title={translateUi("New project from this style")}
      onClose={onClose}
      footer={
        <div className="project-reuse-footer">
          <Text type="secondary" role="status">
            {translateUi("{{count}} choices kept · {{assets}} source files selected", {
              count,
              assets: choices.assets ? picked.length : 0,
            })}
          </Text>
          <Space>
            <Button disabled={saving} onClick={onClose}>
              {translateUi("Close")}
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={
                (!choices.content && brief.trim().length < 8) ||
                (choices.characters &&
                  (availableCharacterCount === undefined ||
                    (availableCharacterCount > 0 && !pickedCharacters.length)))
              }
              onClick={async () => {
                if (saving) return;
                setSaving(true);
                setError("");
                operationId.current ||= crypto.randomUUID();
                try {
                  const result = await api<{ draftId: string }>("/api/project-reuse", {
                    method: "POST",
                    body: JSON.stringify({
                      projectId: run.id,
                      jobId: source.job.id,
                      operationId: operationId.current,
                      idea: brief,
                      choices,
                      selectedAssetIds: choices.assets ? picked : [],
                      selectedCharacterIds: choices.characters ? pickedCharacters : [],
                    }),
                  });
                  onCreated?.(result.draftId);
                  onClose();
                } catch (issue) {
                  setError((issue as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {translateUi("Continue editing new project")}
            </Button>
          </Space>
        </div>
      }
    >
      <Space orientation="vertical" size={20} className="project-reuse-content">
        <Alert
          type="info"
          showIcon
          title={translateUi("Create a new draft")}
          description={translateUi(
            "Your source project stays unchanged. Review the new draft in the existing creation flow; generation starts only after you confirm.",
          )}
        />
        {error && <Alert type="error" showIcon title={error} />}
        <div>
          <Text strong>{projectName(run)}</Text>
          <div>
            <Text type="secondary">
              {translateUi("Version {{value0}}", { value0: source.version })} ·{" "}
              {translateUi(
                source.hasVersionSettings
                  ? "Saved version settings"
                  : "Original project settings; this version has no separate settings snapshot",
              )}
            </Text>
          </div>
        </div>
        <section>
          <SettingsSectionHeading
            icon={<Palette size={18} />}
            title={translateUi("Inherit appearance")}
            description={translateUi("Keep the design you like; replace what the new video needs.")}
          />
          {appearanceFields.map((field) => (
            <ProjectReuseChoice
              key={field.id}
              label={field.title}
              annotation={
                <Tag>
                  {translateUi(
                    field.id === "visual" && source.candidate
                      ? "Catalog direction"
                      : "No separate design snapshot",
                  )}
                </Tag>
              }
              description={
                field.id === "visual"
                  ? styleName
                  : translateUi(
                      "This detail has no independent saved snapshot. Exact inheritance is not available.",
                    )
              }
              keep={choices[field.id]}
              onChange={(keep) => setChoices((previous) => ({ ...previous, [field.id]: keep }))}
            />
          ))}
        </section>
        <CharacterInheritance
          projectId={run.id}
          jobId={source.job.id}
          keep={choices.characters}
          selectedIds={pickedCharacters}
          onKeep={(characters) => setChoices((previous) => ({ ...previous, characters }))}
          onSelect={setPickedCharacters}
          onAvailable={setAvailableCharacterCount}
        />
        <Collapse
          items={[
            {
              key: "settings",
              label: (
                <Space>
                  <Settings2 size={16} />
                  {translateUi("Sound and production settings")}
                </Space>
              ),
              children: (
                <>
                  {(
                    [
                      { id: "output", title: "Output settings" },
                      { id: "voice", title: "Narration and subtitle settings" },
                      { id: "music", title: "Music direction" },
                    ] as const
                  ).map((field) => (
                    <ProjectReuseChoice
                      key={field.id}
                      label={field.title}
                      keep={choices[field.id]}
                      onChange={(keep) =>
                        setChoices((previous) => ({ ...previous, [field.id]: keep }))
                      }
                    />
                  ))}
                  <VideoVersionSettings job={source.job} request={source.request} />
                  <Text type="secondary">
                    {source.request.requirements?.music.instructions ||
                      translateUi("No music direction recorded")}
                  </Text>
                  <div>
                    <Checkbox
                      checked={choices.musicRecording}
                      onChange={(event) =>
                        setChoices((previous) => ({
                          ...previous,
                          musicRecording: event.target.checked,
                        }))
                      }
                    >
                      {translateUi("Also copy the source music recording")}
                    </Checkbox>
                  </div>
                </>
              ),
            },
          ]}
        />
        <section>
          <SettingsSectionHeading
            icon={<Film size={18} />}
            title={translateUi("Replace content")}
            description={translateUi(
              "Leave the old topic, script, dialogue and source files behind by default.",
            )}
          />
          <div className="project-reuse-choice">
            <Text strong>{translateUi("Topic and script")}</Text>
            <Segmented
              aria-label={translateUi("Topic and script")}
              value={choices.content ? "keep" : "replace"}
              onChange={(value) =>
                setChoices((previous) => ({ ...previous, content: value === "keep" }))
              }
              options={[
                { label: translateUi("Write new content"), value: "replace" },
                { label: translateUi("Keep and edit"), value: "keep" },
              ]}
            />
          </div>
          {!choices.content ? (
            <Input.TextArea
              aria-label={translateUi("New project brief")}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={translateUi("What should the new video be about?")}
            />
          ) : (
            <Alert
              type="info"
              title={translateUi("Original brief")}
              description={source.request.instructions}
            />
          )}
          <div className="project-reuse-choice">
            <Text strong>{translateUi("Source files")}</Text>
            <Segmented
              aria-label={translateUi("Source files")}
              value={choices.assets ? "keep" : "replace"}
              onChange={(value) =>
                setChoices((previous) => ({ ...previous, assets: value === "keep" }))
              }
              options={[
                { label: translateUi("Do not carry over"), value: "replace" },
                { label: translateUi("Select files to keep"), value: "keep" },
              ]}
            />
          </div>
          {choices.assets &&
            (sourceFiles.length ? (
              <Space orientation="vertical" className="project-reuse-content">
                {sourceFiles.map((asset) => (
                  <RoomFilePick
                    key={asset.id}
                    asset={{ ...asset, kind: "", bytes: asset.bytes || 0 }}
                    picked={picked.includes(asset.id)}
                    onToggle={() =>
                      setPicked((previous) =>
                        previous.includes(asset.id)
                          ? previous.filter((id) => id !== asset.id)
                          : [...previous, asset.id],
                      )
                    }
                  />
                ))}
              </Space>
            ) : (
              <Text type="secondary">
                {translateUi(
                  source.request.assetIds.length
                    ? "Source file details are unavailable. No files will be copied."
                    : "No source files attached.",
                )}
              </Text>
            ))}
        </section>
      </Space>
    </Dialog>
  );
}
