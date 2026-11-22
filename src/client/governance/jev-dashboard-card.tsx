import { Card, Collapse, Flex, type CollapseProps } from "antd";
import type { ReactNode } from "react";
import { translateUi } from "../i18n";

export function formatJevPercent(value: number | null | undefined) {
  return value == null ? translateUi("Not recorded") : `${Math.round(value * 100)}%`;
}

export function JevDashboardCard({
  title,
  className,
  details,
  children,
}: {
  title: ReactNode;
  className?: string;
  details?: CollapseProps["items"];
  children: ReactNode;
}) {
  return (
    <Card
      size="small"
      className={["governance-jev-dashboard-card", className].filter(Boolean).join(" ")}
      title={title}
    >
      <Flex vertical gap={12}>
        {children}
        {details?.length ? <Collapse size="small" items={details} /> : null}
      </Flex>
    </Card>
  );
}
