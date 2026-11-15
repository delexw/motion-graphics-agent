import { useEffect, useState } from "react";
import { Alert, Checkbox, Space, Typography } from "antd";
import { ProjectReuseChoice } from "./choice";
import type { ProjectCharacter } from "../../../shared/project-characters";
import { api } from "../../lib/api";
import { translateUi } from "../../i18n";

export function CharacterInheritance({
  projectId,
  jobId,
  keep,
  selectedIds,
  onKeep,
  onSelect,
  onAvailable,
}: {
  projectId: string;
  jobId: string;
  keep: boolean;
  selectedIds: string[];
  onKeep: (keep: boolean) => void;
  onSelect: (ids: string[]) => void;
  onAvailable: (count: number) => void;
}) {
  const [characters, setCharacters] = useState<ProjectCharacter[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<{ characters: ProjectCharacter[] }>(
      `/api/project-reuse/${encodeURIComponent(projectId)}/${encodeURIComponent(jobId)}/characters`,
      { signal: controller.signal },
    ).then(
      (result) => {
        if (!controller.signal.aborted) {
          setCharacters(result.characters);
          onSelect(result.characters.map((character) => character.id));
          onAvailable(result.characters.length);
        }
      },
      (issue: Error) => {
        if (!controller.signal.aborted) setError(issue.message);
      },
    );
    return () => controller.abort();
  }, [projectId, jobId, onSelect, onAvailable]);
  return (
    <section>
      <ProjectReuseChoice
        label="Inherit characters and mascots"
        description={translateUi(
          "Keep selected characters' appearance, personality and role while replacing the topic and script.",
        )}
        keep={keep}
        disabled={!characters || Boolean(error)}
        onChange={(value) => {
          onKeep(value);
          onSelect(value ? (characters ?? []).map((character) => character.id) : []);
        }}
      />
      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : !characters ? (
        <Typography.Text role="status">{translateUi("Loading project…")}</Typography.Text>
      ) : !characters.length ? (
        <Typography.Text type="secondary">
          {translateUi(
            "No character identities recorded for this version. Nothing will be inherited.",
          )}
        </Typography.Text>
      ) : (
        <Space orientation="vertical" className="project-reuse-content">
          {characters.map((character) => (
            <div key={character.id}>
              <Checkbox
                disabled={!keep}
                checked={keep && selectedIds.includes(character.id)}
                onChange={(event) =>
                  onSelect(
                    event.target.checked
                      ? [...selectedIds, character.id]
                      : selectedIds.filter((id) => id !== character.id),
                  )
                }
              >
                {character.name}
              </Checkbox>
              <div>
                <Typography.Text type="secondary">
                  {translateUi("Appearance")}: {character.appearance}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">
                  {translateUi("Personality")}:{" "}
                  {character.personality || translateUi("Not recorded")}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">
                  {translateUi("Narrative role")}: {character.role}
                </Typography.Text>
              </div>
            </div>
          ))}
        </Space>
      )}
    </section>
  );
}
