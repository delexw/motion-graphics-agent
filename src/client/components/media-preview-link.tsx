import { Popover } from "antd";
import type { MouseEventHandler, ReactNode } from "react";
import "./media-preview-link.css";

export function MediaPreviewLink({
  title,
  content,
  children,
  onClick,
  label,
}: {
  title?: ReactNode;
  content: ReactNode;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  label?: string;
}) {
  return (
    <Popover
      trigger={["hover", "focus"]}
      placement="bottom"
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0}
      destroyOnHidden
      title={title}
      content={<div className="media-hover-preview">{content}</div>}
    >
      <button type="button" className="media-preview-link" aria-label={label} onClick={onClick}>
        {children}
      </button>
    </Popover>
  );
}
