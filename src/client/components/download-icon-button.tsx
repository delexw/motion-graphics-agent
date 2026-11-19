import { Button, Tooltip, type ButtonProps } from "antd";

type DownloadIconButtonProps = Pick<
  ButtonProps,
  "href" | "download" | "onClick" | "disabled" | "type"
> & {
  label: string;
  icon: NonNullable<ButtonProps["icon"]>;
};

export function DownloadIconButton({ label, ...props }: DownloadIconButtonProps) {
  return (
    <Tooltip title={label} trigger={["hover", "focus"]}>
      <Button aria-label={label} {...props} />
    </Tooltip>
  );
}
