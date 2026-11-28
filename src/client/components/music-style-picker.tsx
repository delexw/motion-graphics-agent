import { Select } from "antd";
import { musicStyleGroups } from "../../shared/music-styles";
import { translateUi, uiLanguage, useUiLanguage } from "../i18n";

type MusicStyleOption = {
  label: string;
  value?: string;
  group?: string;
  options?: MusicStyleOption[];
};

export function MusicStylePicker({
  style,
  onChange,
}: {
  style: string | undefined;
  onChange: (style: string | undefined) => void;
}) {
  useUiLanguage();
  const label = translateUi("Add a music style");
  return (
    <Select<string, MusicStyleOption>
      aria-label={label}
      placeholder={label}
      value={style}
      allowClear
      showSearch={{
        filterOption: (query, option) =>
          Boolean(option?.value && uiLanguage.matches(query, option.value, option.group ?? "")),
      }}
      virtual={false}
      style={{ width: "100%" }}
      options={musicStyleGroups.map(({ name: group, styles }) => ({
        label: translateUi(group),
        options: styles.map((value) => ({ label: translateUi(value), value, group })),
      }))}
      onChange={(value) => onChange(value ?? undefined)}
    />
  );
}
